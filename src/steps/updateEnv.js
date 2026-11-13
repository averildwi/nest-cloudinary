const fsHelpers = require('../utils/fsHelpers');
const ui = require('../ui/output');
const { rel } = require('./helpers');
const { ENV_KEYS } = require('../config/registry');

/**
 * Placeholder values written into .env.example. These describe the shape of the
 * value (`cloudinary://<api-key>:<api-secret>@<cloud-name>`) and are never used
 * by the app — only the real `.env` is read at runtime.
 */
const ENV_BLUEPRINT = {
    CLOUDINARY_URL: 'cloudinary://<api-key>:<api-secret>@<cloud-name>',
};

/** Returns the keys from the blueprint that the env file is missing. */
function missingKeys(source, blueprint = ENV_BLUEPRINT) {
    const missing = [];
    for (const key of Object.keys(blueprint)) {
        if (!new RegExp(`^${key}\\s*=`, 'm').test(source)) missing.push(key);
    }
    return missing;
}

function buildEnvFile(blueprint = ENV_BLUEPRINT) {
    let content = '# Added by @averildwi/nest-cloudinary\n';
    for (const [key, value] of Object.entries(blueprint)) {
        content += `${key}="${value}"\n`;
    }
    return content;
}

/** Appends the missing keys under a marker so a user-managed file keeps its layout. */
function mergeEnv(source, blueprint = ENV_BLUEPRINT) {
    const missing = missingKeys(source, blueprint);
    if (missing.length === 0) return { source, added: [] };

    const lines = missing.map((key) => `${key}="${blueprint[key]}"\n`).join('');
    return {
        source: `${source.trimEnd()}\n\n# Added by @averildwi/nest-cloudinary\n${lines}`,
        added: missing,
    };
}

module.exports = {
    id: 'env',
    title: 'Set up .env.example with CLOUDINARY_URL',

    async plan(ctx) {
        const entries = [];
        const file = rel(ctx, ctx.paths.envExample);

        if (!(await fsHelpers.exists(ctx.paths.envExample))) {
            entries.push({ kind: 'create', label: `${file} (add ${ENV_KEYS.join(', ')})` });
        } else {
            const source = await fsHelpers.readFile(ctx.paths.envExample);
            const missing = missingKeys(source);
            entries.push(
                missing.length
                    ? { kind: 'modify', label: `${file} (add ${missing.join(', ')})` }
                    : { kind: 'skip', label: file, reason: 'CLOUDINARY_URL already present' },
            );
        }

        entries.push(...(await gitignoreEntries(ctx)));
        return { entries, data: {} };
    },

    async run(ctx) {
        const files = [];

        if (await fsHelpers.exists(ctx.paths.envExample)) {
            const source = await fsHelpers.readFile(ctx.paths.envExample);
            const merged = mergeEnv(source);
            if (merged.added.length) {
                await fsHelpers.writeFile(ctx.paths.envExample, merged.source);
                ui.success(`Patched .env.example: ${merged.added.join(', ')}`);
                files.push({ kind: 'modify', path: '.env.example' });
            } else {
                ui.skip('.env.example already contains CLOUDINARY_URL');
            }
        } else {
            await fsHelpers.writeFile(ctx.paths.envExample, buildEnvFile());
            ui.success('.env.example created with CLOUDINARY_URL');
            files.push({ kind: 'create', path: '.env.example' });
        }

        ui.detail('Fill CLOUDINARY_URL in your own .env, e.g. cloudinary://key:secret@cloud-name');

        return { files };
    },
};

async function gitignoreEntries(ctx) {
    if (!(await fsHelpers.exists(ctx.paths.gitignore))) {
        return [{ kind: 'warn', label: '.gitignore', reason: 'not found — make sure the real .env is never committed' }];
    }
    const gitignore = await fsHelpers.readFile(ctx.paths.gitignore);
    return /^\.env$/m.test(gitignore)
        ? []
        : [{ kind: 'warn', label: '.gitignore', reason: '".env" is not listed — secrets could be committed' }];
}

module.exports.ENV_BLUEPRINT = ENV_BLUEPRINT;
module.exports.missingKeys = missingKeys;
module.exports.mergeEnv = mergeEnv;
module.exports.buildEnvFile = buildEnvFile;
