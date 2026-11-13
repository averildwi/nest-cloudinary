// Fast unit checks for the pure logic. Run: node test/unit.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const { parseCliArgs } = require('../src/cli');
const { register, IMPORT_LINE } = require('../src/steps/registerAppModule');
const { missingKeys, mergeEnv, buildEnvFile, ENV_BLUEPRINT } = require('../src/steps/updateEnv');
const { isSatisfied, satisfiesRange, parseSpec } = require('../src/steps/installDeps');
const { resolveDependencies, ENV_KEYS } = require('../src/config/registry');
const { buildContext, templatesDir } = require('../src/runner');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('argv: defaults leave choices undefined so they can be prompted', () => {
    const o = parseCliArgs([]);
    assert.equal(o.install, undefined);
    assert.equal(o.yes, false);
    assert.equal(o.cwd, undefined);
});

test('argv: --no-install / -y / --dry-run', () => {
    const o = parseCliArgs(['--no-install', '-y', '--dry-run']);
    assert.equal(o.install, false);
    assert.equal(o.yes, true);
    assert.equal(o.dryRun, true);
});

test('argv: --pm accepts supported managers and rejects the rest', () => {
    assert.equal(parseCliArgs(['--pm', 'pnpm']).packageManager, 'pnpm');
    assert.equal(parseCliArgs(['--pm', 'Bun']).packageManager, 'bun');
    assert.throws(() => parseCliArgs(['--pm', 'pip']), (e) => e.name === 'CliError' && e.exitCode === 2);
    assert.throws(() => parseCliArgs(['--bogus']), (e) => e.name === 'CliError' && e.exitCode === 2);
});

test('registry: installs cloudinary + multer types and nothing else', () => {
    const { dependencies, devDependencies } = resolveDependencies();
    assert.deepEqual(ENV_KEYS, ['CLOUDINARY_URL']);
    assert.deepEqual(dependencies, ['cloudinary']);
    assert.deepEqual(devDependencies, ['@types/multer']);
});

test('app.module registration handles every array shape', () => {
    const cases = [
        ['imports: []', 'imports: [UploadModule]'],
        ['imports: [UsersModule]', 'imports: [UploadModule, UsersModule]'],
        ['imports: [\n    UsersModule,\n  ]', 'imports: [\n    UploadModule,\n    UsersModule,\n  ]'],
    ];
    for (const [before, after] of cases) {
        const src = `import { Module } from '@nestjs/common';\n\n@Module({ ${before} })\nexport class AppModule {}\n`;
        const out = register(src);
        assert.ok(out.includes(after), `expected ${JSON.stringify(after)} in\n${out}`);
        assert.ok(out.split('\n').includes(IMPORT_LINE));
        assert.ok(out.indexOf(IMPORT_LINE) < out.indexOf('@Module'));
    }
});

test('app.module: import goes after a license header, not above it', () => {
    const out = register("/* (c) 2026 */\nimport { Module } from '@nestjs/common';\n@Module({ imports: [] })\nexport class A {}\n");
    assert.ok(out.startsWith('/* (c) 2026 */'));
});

test('env: detects the missing key and appends it once', () => {
    assert.deepEqual(missingKeys('PORT=3000\n'), ['CLOUDINARY_URL']);
    assert.deepEqual(missingKeys('CLOUDINARY_URL=x\n'), []);

    const merged = mergeEnv('PORT=3000\n');
    assert.deepEqual(merged.added, ['CLOUDINARY_URL']);
    assert.match(merged.source, /# Added by @averildwi\/nest-cloudinary/);
    assert.match(merged.source, /^CLOUDINARY_URL="cloudinary:\/\/<api-key>:<api-secret>@<cloud-name>"$/m);
    assert.equal(mergeEnv(merged.source).added.length, 0);

    const blueprintKeys = Object.keys(ENV_BLUEPRINT);
    assert.deepEqual(blueprintKeys, ['CLOUDINARY_URL']);
    assert.ok(buildEnvFile().includes('CLOUDINARY_URL='));
});

test('installDeps: parses scoped specs', () => {
    assert.deepEqual(parseSpec('@types/multer@^2.0.0'), { name: '@types/multer', version: '^2.0.0' });
    assert.deepEqual(parseSpec('cloudinary@^2.10.0'), { name: 'cloudinary', version: '^2.10.0' });
    assert.deepEqual(parseSpec('cloudinary'), { name: 'cloudinary', version: undefined });
});

test('installDeps: detects already-satisfied specs per dependency field', () => {
    const pkg = { dependencies: { cloudinary: '^2.11.0' }, devDependencies: { '@types/multer': '^2.3.0' } };
    assert.ok(isSatisfied('cloudinary', pkg, 'dependencies'));
    assert.ok(!isSatisfied('cloudinary', pkg, 'devDependencies'));
    assert.ok(isSatisfied('@types/multer', pkg, 'devDependencies'));
    // A runtime dep that only exists as a devDependency must still be installed.
    assert.ok(!isSatisfied('cloudinary', { devDependencies: { cloudinary: '^2.11.0' } }, 'dependencies'));
    assert.ok(satisfiesRange('^2.10.0', '2.11.5'));
});

test('runner: context points at src/common/upload and carries deps', () => {
    const ctx = buildContext({
        projectRoot: path.resolve('/p'),
        pkgJson: {},
        packageManager: { name: 'npm', source: 'default' },
        install: false,
    });
    assert.equal(ctx.targetDir, path.join(path.resolve('/p'), 'src', 'common', 'upload'));
    assert.equal(ctx.appModule, path.join(path.resolve('/p'), 'src', 'app.module.ts'));
    assert.equal(ctx.envExample, path.join(path.resolve('/p'), '.env.example'));
    assert.equal(ctx.workspaceRoot, null);
    assert.equal(ctx.isWorkspaceMember, false);
    assert.ok(ctx.dependencies.includes('cloudinary'));
    assert.deepEqual(ctx.devDependencies, ['@types/multer']);
});

test('templates: the expected files exist and use CLOUDINARY_URL', () => {
    for (const file of [
        'upload.module.ts',
        'upload.service.ts',
        'upload.types.ts',
        'file-signature.ts',
        path.join('pipes', 'file.pipe.ts'),
    ]) {
        assert.ok(fs.existsSync(path.join(templatesDir, file)), `missing template ${file}`);
    }

    const service = read(path.join('templates', 'upload', 'upload.service.ts'));
    assert.match(service, /CLOUDINARY_URL/);
    assert.match(service, /parseCloudinaryUrl/);
    assert.match(service, /static parseUrl/);
    assert.match(service, /deleteByUrl/);
    assert.doesNotMatch(service, /__[A-Z_]+__/, 'service must not contain placeholders');

    const pipe = read(path.join('templates', 'upload', 'pipes', 'file.pipe.ts'));
    assert.match(pipe, /from '\.\.\/file-signature'/);
    assert.match(pipe, /detectMimeFromContent/);
    assert.match(pipe, /inspectSvg/);

    const module = read(path.join('templates', 'upload', 'upload.module.ts'));
    assert.match(module, /@Global\(\)/);
    assert.match(module, /class UploadModule/);
});
