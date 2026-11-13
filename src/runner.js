const path = require('path');

const ui = require('./ui/output');
const { colors: c } = require('./ui/colors');
const { getPackageManager } = require('./utils/packageManager');
const { resolveDependencies } = require('./config/registry');
const steps = require('./steps');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'upload');

function buildContext({ projectRoot, pkgJson, packageManager, install, workspace }) {
    const paths = {
        targetDir: path.join(projectRoot, 'src', 'common', 'upload'),
        appModule: path.join(projectRoot, 'src', 'app.module.ts'),
        envExample: path.join(projectRoot, '.env.example'),
        gitignore: path.join(projectRoot, '.gitignore'),
        pkgJsonPath: path.join(projectRoot, 'package.json'),
    };

    const workspaceRoot = workspace && workspace.workspaceRoot ? workspace.workspaceRoot : null;
    const isWorkspaceMember = Boolean(workspace && workspace.isWorkspace && workspace.isMember && workspace.appDir);

    return {
        projectRoot,
        pkgJson,
        install,
        dependencies: resolveDependencies().dependencies,
        devDependencies: resolveDependencies().devDependencies,
        pm: getPackageManager(packageManager.name),
        pmSource: packageManager.source,
        workspaceRoot,
        packageName: workspace ? workspace.packageName : null,
        appRel: workspace ? workspace.appRel : null,
        isWorkspaceMember,
        turbo: Boolean(workspace && workspace.turbo),
        templatesDir: TEMPLATES_DIR,
        paths,
        ...paths,
    };
}

/** Plan entry kinds that actually mutate the project. `warn` is informational. */
const ACTIONABLE_KINDS = new Set(['create', 'modify', 'run']);

/** Asks every step what it would do. Never mutates the project. */
async function buildPlan(ctx) {
    const plan = [];
    for (const step of steps) {
        const { entries, data } = await step.plan(ctx);
        const actionable = entries.some((e) => ACTIONABLE_KINDS.has(e.kind));
        plan.push({ step, entries, data, actionable });
    }
    return plan;
}

const KIND_STYLE = {
    create: (t) => `${c.green('+')} ${t}`,
    modify: (t) => `${c.yellow('~')} ${t}`,
    run: (t) => `${c.cyan('$')} ${t}`,
    warn: (t) => `${c.yellow('!')} ${t}`,
    skip: (t) => `${c.gray('-')} ${c.gray(t)}`,
};

function printPlan(ctx, plan, { dryRun }) {
    ui.section('Configuration');
    const projectLabel =
        ctx.isWorkspaceMember && ctx.packageName
            ? `${ctx.packageName}${ctx.appRel ? c.gray(` (${ctx.appRel})`) : ''}`
            : path.basename(ctx.projectRoot);
    const rows = [
        ['Project', projectLabel],
        ['Transport', 'cloudinary SDK'],
        ['Credentials', 'CLOUDINARY_URL'],
        ['Package manager', `${ctx.pm.name} ${c.gray(`(${ctx.pmSource})`)}`],
    ];
    if (ctx.isWorkspaceMember) rows.push(['Workspace root', ctx.workspaceRoot]);
    ui.keyValues(rows);

    ui.section(dryRun ? 'Planned changes (dry run, nothing will be modified)' : 'Planned changes');
    for (const { entries } of plan) {
        for (const entry of entries) {
            const reason = entry.reason ? c.gray(` (${entry.reason})`) : '';
            ui.out(`    ${KIND_STYLE[entry.kind](entry.label)}${reason}`);
        }
    }
}

/**
 * Executes the actionable steps in order and returns a summary.
 * If a step throws, the error is annotated with what had already been changed
 * so the user knows exactly what state their project is in.
 */
async function executePlan(ctx, plan) {
    const actionable = plan.filter((p) => p.actionable);
    const files = [];
    const warnings = [];
    const completed = [];

    for (const [index, item] of actionable.entries()) {
        ui.step(index + 1, actionable.length, item.step.title);
        try {
            const result = (await item.step.run(ctx, item.data || {})) || {};
            if (result.files) files.push(...result.files);
            if (result.status === 'warning') warnings.push(item.step.title);
            completed.push(item.step.title);
        } catch (err) {
            const failure = err instanceof Error ? err : new Error(String(err));
            failure.hints = [
                ...(failure.hints || []),
                ...(completed.length ? ['', `Completed before the failure: ${completed.join(', ')}.`] : []),
                ...(files.length ? [`Files already changed: ${unique(files.map((f) => f.path)).join(', ')}.`] : []),
                'It is safe to fix the problem and run the command again; finished steps will be skipped.',
            ];
            failure.failedStep = item.step.title;
            throw failure;
        }
    }

    return { files, warnings, ran: actionable.length };
}

function unique(list) {
    return [...new Set(list)];
}

function printSummary(ctx, summary) {
    const files = new Map();
    for (const f of summary.files) {
        // "create" wins over "modify" for the same path.
        if (!files.has(f.path) || f.kind === 'create') files.set(f.path, f.kind);
    }

    ui.out();
    if (summary.warnings.length) {
        ui.out(`  ${c.yellow(c.bold('Done, with warnings.'))} ${c.gray('Review the messages marked ⚠ above.')}`);
    } else {
        ui.out(`  ${c.green(c.bold('Cloudinary upload is ready.'))}`);
    }

    if (files.size) {
        ui.section('Changed files');
        for (const [file, kind] of files) {
            ui.out(`    ${KIND_STYLE[kind] ? KIND_STYLE[kind](file) : file}`);
        }
    }

    printNextSteps(ctx);
    printTurboChecklist(ctx);
}

function printTurboChecklist(ctx) {
    if (!ctx.turbo || !ctx.isWorkspaceMember) return;

    const filter = ctx.packageName || ctx.appRel;
    ui.section('Turbo checklist');
    ui.out(`    ${c.cyan('1.')} Run tasks for this app from the workspace root:`);
    ui.out(`       ${c.cyan(`turbo run build --filter ${filter}`)}`);
    ui.out(`    ${c.gray('turbo.json was not modified.')}`);
    ui.out();
}

function printNextSteps(ctx) {
    const steps = [
        [`Set your credentials in ${c.bold('.env')} (copy from ${c.bold('.env.example')}):`, 'CLOUDINARY_URL="cloudinary://<api-key>:<api-secret>@<cloud-name>"'],
        [`Validate it on boot — add to your Joi project schema:`, 'CLOUDINARY_URL: Joi.string().uri().required(),'],
        [`Inject the service where you upload:`, 'constructor(private readonly upload: UploadService) {}'],
        [`Validate the incoming file with the pipe:`, "@UploadedFile(new FilePipe({ maxSizeMb: 5 })) file: Express.Multer.File"],
    ];

    ui.section('Next steps');
    steps.forEach(([text, command], i) => {
        ui.out(`    ${c.cyan(`${i + 1}.`)} ${text}`);
        ui.out(`       ${c.cyan(command)}`);
    });
    ui.out();
}

module.exports = {
    buildContext,
    buildPlan,
    printPlan,
    executePlan,
    printSummary,
    templatesDir: TEMPLATES_DIR,
};
