const { parseArgs } = require('util');

const { CliError } = require('./errors');
const { PACKAGE_MANAGERS } = require('./utils/packageManager');

const OPTIONS = {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
    yes: { type: 'boolean', short: 'y' },
    'dry-run': { type: 'boolean' },
    pm: { type: 'string' },
    cwd: { type: 'string' },
    app: { type: 'string' },
    install: { type: 'boolean' },
    'no-install': { type: 'boolean' },
    color: { type: 'boolean' },
    'no-color': { type: 'boolean' },
};

function pickBoolean(values, name) {
    if (values[`no-${name}`]) return false;
    if (values[name]) return true;
    return undefined;
}

/**
 * Parses process arguments into a normalised options object.
 * Unspecified options are left `undefined` so the caller decides the default.
 */
function parseCliArgs(argv = process.argv.slice(2)) {
    let parsed;
    try {
        parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: false, strict: true });
    } catch (err) {
        throw new CliError(err.message.replace(/\. To specify.*$/s, '.'), {
            hints: ['Run "nest-cloudinary --help" to see all available options.'],
            exitCode: 2,
        });
    }

    const v = parsed.values;
    const options = {
        help: Boolean(v.help),
        version: Boolean(v.version),
        yes: Boolean(v.yes),
        dryRun: Boolean(v['dry-run']),
        packageManager: undefined,
        cwd: v.cwd,
        app: v.app,
        install: pickBoolean(v, 'install'),
        color: pickBoolean(v, 'color'),
    };

    if (v.pm !== undefined) {
        const pm = v.pm.toLowerCase();
        if (!PACKAGE_MANAGERS[pm]) {
            throw new CliError(`Unknown package manager "${v.pm}".`, {
                hints: [`Supported values: ${Object.keys(PACKAGE_MANAGERS).join(', ')}.`],
                exitCode: 2,
            });
        }
        options.packageManager = pm;
    }

    return options;
}

function helpText(pkg) {
    return `
  ${pkg.name} v${pkg.version}
  Add a Cloudinary upload module to an existing NestJS project.

  Usage
    $ npx ${pkg.name} [options]

  Options
    --pm <name>        Package manager: npm | pnpm | yarn | bun (default: auto-detect)
    --cwd <path>       Run against this app directory (default: current directory)
    --app <name>       Pick a workspace package by name or relative path
    --no-install       Skip installing dependencies (only write files)
    -y, --yes          Accept defaults and skip all prompts
    --dry-run          Show what would change without touching anything
    --no-color         Disable coloured output
    -v, --version      Print the version
    -h, --help         Show this help

  What it writes
    src/common/upload/upload.module.ts      @Global() module
    src/common/upload/upload.service.ts     Cloudinary client (upload/delete)
    src/common/upload/upload.types.ts       shared types
    src/common/upload/pipes/file.pipe.ts    size + MIME + magic-byte validation
    src/common/upload/file-signature.ts     content sniffing (JPEG/PNG/WebP/PDF/SVG)
    ~ src/app.module.ts                     register UploadModule
    ~ .env.example                          add CLOUDINARY_URL

  Examples
    $ npx ${pkg.name}
    $ npx ${pkg.name} --yes
    $ npx ${pkg.name} --pm pnpm --dry-run
    $ npx ${pkg.name} --app @repo/api
`;
}

module.exports = { parseCliArgs, helpText };
