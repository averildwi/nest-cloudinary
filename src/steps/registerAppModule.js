const fsHelpers = require('../utils/fsHelpers');
const ui = require('../ui/output');
const { rel } = require('./helpers');

const IMPORT_LINE = "import { UploadModule } from './common/upload/upload.module';";
const IMPORTS_ARRAY = /imports\s*:\s*\[/;

/**
 * Inserts the import after the last top-level import so it never lands above a
 * license header, a shebang or a "use strict" pragma.
 */
function insertImport(source) {
    // Match the statement only (no trailing whitespace) so we control newlines.
    const importRegex = /^import\s[^;]*;/gm;
    let lastMatchEnd = -1;
    let match;
    while ((match = importRegex.exec(source)) !== null) {
        lastMatchEnd = match.index + match[0].length;
    }
    if (lastMatchEnd === -1) return `${IMPORT_LINE}\n${source}`;
    return `${source.slice(0, lastMatchEnd)}\n${IMPORT_LINE}${source.slice(lastMatchEnd)}`;
}

/**
 * Adds UploadModule as the first entry of `imports: [...]`, keeping the style:
 *   imports: []              ->  imports: [UploadModule]
 *   imports: [UsersModule]   ->  imports: [UploadModule, UsersModule]
 *   imports: [\n    X,\n  ]  ->  imports: [\n    UploadModule,\n    X,\n  ]
 */
function injectIntoImportsArray(source) {
    return source.replace(/imports\s*:\s*\[[ \t]*(\r?\n)?/, (match, newline, offset) => {
        const after = source.slice(offset + match.length);
        if (newline) {
            const indent = (after.match(/^[ \t]+/) || ['    '])[0];
            return `${match}${indent}UploadModule,${newline}`;
        }
        return after.startsWith(']') ? `${match}UploadModule` : `${match}UploadModule, `;
    });
}

function register(source) {
    return injectIntoImportsArray(insertImport(source));
}

module.exports = {
    id: 'register',
    title: 'Register UploadModule in AppModule',

    async plan(ctx) {
        const file = rel(ctx, ctx.paths.appModule);

        if (!(await fsHelpers.exists(ctx.paths.appModule))) {
            return { entries: [{ kind: 'skip', label: file, reason: 'file not found, import UploadModule manually' }] };
        }
        const source = await fsHelpers.readFile(ctx.paths.appModule);
        if (source.includes('UploadModule')) {
            return { entries: [{ kind: 'skip', label: file, reason: 'UploadModule already registered' }] };
        }
        if (!IMPORTS_ARRAY.test(source)) {
            return {
                entries: [{ kind: 'warn', label: file, reason: 'no "imports: [" array found, needs a manual edit' }],
                data: { manual: true },
            };
        }
        return { entries: [{ kind: 'modify', label: `${file} (add UploadModule to imports)` }], data: { manual: false } };
    },

    async run(ctx, { manual }) {
        const file = rel(ctx, ctx.paths.appModule);

        if (manual) {
            ui.warn(`Could not find an "imports: [" array in ${file}. Add UploadModule yourself:`);
            ui.code([IMPORT_LINE, '@Module({ imports: [UploadModule] })']);
            return { status: 'warning' };
        }

        const source = await fsHelpers.readFile(ctx.paths.appModule);
        await fsHelpers.writeFile(ctx.paths.appModule, register(source));
        ui.success(`Registered UploadModule in ${file}`);
        return { files: [{ kind: 'modify', path: file }] };
    },
};

module.exports.register = register;
module.exports.IMPORT_LINE = IMPORT_LINE;
