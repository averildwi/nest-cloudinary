// Workspace installs and command construction. Run: node --test test/install.test.js
const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const installStep = require('../src/steps/installDeps');
const { isSatisfied, addArgs, devArgs, installCwd } = installStep;
const { PACKAGE_MANAGERS } = require('../src/utils/packageManager');
const { buildContext, printSummary } = require('../src/runner');

function workspaceContext(pmName) {
    return {
        pm: PACKAGE_MANAGERS[pmName],
        workspaceRoot: path.resolve('/repo'),
        projectRoot: path.resolve('/repo/apps/api'),
        packageName: '@repo/api',
        appRel: 'apps/api',
        isWorkspaceMember: true,
    };
}

test('installDeps: catalog/workspace/file/git protocols count as declared', () => {
    const pkg = {
        dependencies: {
            cloudinary: 'catalog:',
            '@types/multer': 'workspace:*',
            local: 'file:../../packages/local',
            git: 'git+https://example.com/repo.git',
        },
    };

    for (const name of Object.keys(pkg.dependencies)) {
        assert.ok(isSatisfied(`${name}@^2.0.0`, pkg, 'dependencies'), name);
    }
});

test('installDeps: workspace commands target the member from the root', () => {
    for (const pm of ['npm', 'pnpm', 'yarn']) {
        assert.equal(installCwd(workspaceContext(pm)), path.resolve('/repo'), pm);
    }

    assert.deepEqual(addArgs(workspaceContext('npm'), ['cloudinary@^2.10.0'], []), [
        'install',
        'cloudinary@^2.10.0',
        '--workspace',
        '@repo/api',
    ]);
    assert.deepEqual(devArgs(workspaceContext('npm'), ['@types/multer@^2.0.0']), [
        'install',
        '--save-dev',
        '@types/multer@^2.0.0',
        '--workspace',
        '@repo/api',
    ]);
    assert.deepEqual(addArgs(workspaceContext('npm'), ['cloudinary@^2.10.0'], ['cloudinary@^2.10.0']), [
        'install',
        'cloudinary@^2.10.0',
        '--workspace',
        '@repo/api',
        '--save-prod',
    ]);

    assert.deepEqual(addArgs(workspaceContext('pnpm'), ['cloudinary@^2.10.0'], []), [
        '--filter',
        '@repo/api',
        'add',
        'cloudinary@^2.10.0',
    ]);
    assert.deepEqual(devArgs(workspaceContext('yarn'), ['@types/multer@^2.0.0']), [
        'workspace',
        '@repo/api',
        'add',
        '-D',
        '@types/multer@^2.0.0',
    ]);
});

test('installDeps: bun installs from the app directory without a workspace flag', () => {
    const ctx = workspaceContext('bun');
    assert.equal(installCwd(ctx), path.resolve('/repo/apps/api'));
    assert.deepEqual(addArgs(ctx, ['cloudinary@^2.10.0'], []), ['add', 'cloudinary@^2.10.0']);
    assert.deepEqual(devArgs(ctx, ['@types/multer@^2.0.0']), ['add', '-d', '@types/multer@^2.0.0']);
});

test('installDeps: plan uses workspace-aware labels', async () => {
    const plan = await installStep.plan({
        install: true,
        dependencies: ['cloudinary@^2.10.0'],
        devDependencies: ['@types/multer@^2.0.0'],
        pkgJson: { dependencies: {}, devDependencies: {} },
        ...workspaceContext('pnpm'),
    });

    assert.equal(plan.entries.length, 2);
    assert.equal(plan.entries[0].label, 'pnpm --filter @repo/api add cloudinary@^2.10.0');
    assert.equal(plan.entries[1].label, 'pnpm --filter @repo/api add -D @types/multer@^2.0.0');
});

test('installDeps: nothing to do when both are already declared', async () => {
    const plan = await installStep.plan({
        install: true,
        dependencies: ['cloudinary'],
        devDependencies: ['@types/multer'],
        pkgJson: { dependencies: { cloudinary: '^2.11.0' }, devDependencies: { '@types/multer': '^2.3.0' } },
        ...workspaceContext('npm'),
    });
    assert.equal(plan.entries.length, 1);
    assert.equal(plan.entries[0].kind, 'skip');
});

test('runner: workspace metadata reaches the context', () => {
    const base = {
        projectRoot: path.resolve('/repo/apps/api'),
        pkgJson: {},
        packageManager: { name: 'pnpm', source: 'package.json packageManager' },
        install: false,
    };

    const ctx = buildContext({
        ...base,
        workspace: {
            workspaceRoot: path.resolve('/repo'),
            appDir: path.resolve('/repo/apps/api'),
            packageName: '@repo/api',
            appRel: 'apps/api',
            isWorkspace: true,
            isMember: true,
            turbo: true,
        },
    });

    assert.equal(ctx.workspaceRoot, path.resolve('/repo'));
    assert.equal(ctx.packageName, '@repo/api');
    assert.equal(ctx.appRel, 'apps/api');
    assert.equal(ctx.isWorkspaceMember, true);
    assert.equal(ctx.turbo, true);

    const single = buildContext({ ...base, projectRoot: path.resolve('/single') });
    assert.equal(single.workspaceRoot, null);
    assert.equal(single.isWorkspaceMember, false);
    assert.equal(single.turbo, false);
});

test('runner: Turbo hints appear in the summary of a workspace member', () => {
    const ctx = buildContext({
        projectRoot: path.resolve('/repo/apps/api'),
        pkgJson: {},
        packageManager: { name: 'pnpm', source: 'package.json packageManager' },
        install: false,
        workspace: {
            workspaceRoot: path.resolve('/repo'),
            appDir: path.resolve('/repo/apps/api'),
            packageName: '@repo/api',
            appRel: 'apps/api',
            isWorkspace: true,
            isMember: true,
            turbo: true,
        },
    });

    const chunks = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        chunks.push(String(chunk));
        return true;
    };
    try {
        printSummary(ctx, { files: [], warnings: [], ran: 0 });
    } finally {
        process.stdout.write = originalWrite;
    }

    const out = chunks.join('');
    assert.match(out, /Turbo checklist/);
    assert.match(out, /turbo run build --filter @repo\/api/);
    assert.match(out, /turbo\.json was not modified/);
});
