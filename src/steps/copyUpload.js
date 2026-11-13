const path = require('path');

const fsHelpers = require('../utils/fsHelpers');
const ui = require('../ui/output');
const { rel } = require('./helpers');

module.exports = {
    id: 'upload',
    title: 'Copy the upload module into src/common/upload',

    async plan(ctx) {
        const files = await fsHelpers.walk(ctx.templatesDir);
        const entries = [];
        const data = { created: [], skipped: [] };

        for (const filePath of files) {
            const relPath = path.relative(ctx.templatesDir, filePath);
            const dest = path.join(ctx.targetDir, relPath);
            if (await fsHelpers.exists(dest)) {
                entries.push({ kind: 'skip', label: rel(ctx, dest), reason: 'already exists' });
                data.skipped.push(relPath);
            } else {
                entries.push({ kind: 'create', label: rel(ctx, dest) });
                data.created.push(relPath);
            }
        }

        if (files.length === 0) {
            entries.push({ kind: 'warn', label: 'templates/upload', reason: 'no template files found' });
        }

        return { entries, data };
    },

    async run(ctx, data) {
        if (!data.created.length) {
            ui.skip('Upload module already in place (existing files were not overwritten)');
            return { status: 'skipped' };
        }

        await fsHelpers.ensureDir(ctx.targetDir);
        // Copy file by file: never overwrite an existing file the user may have
        // customised, so re-running the CLI is always safe.
        for (const relPath of data.created) {
            const dest = path.join(ctx.targetDir, relPath);
            await fsHelpers.ensureDir(path.dirname(dest));
            await fsHelpers.copy(path.join(ctx.templatesDir, relPath), dest);
        }

        const files = data.created.map((p) => ({ kind: 'create', path: rel(ctx, path.join(ctx.targetDir, p)) }));

        ui.success(`${files.length} file(s) copied into src/common/upload`);
        if (data.skipped.length) {
            ui.skip(`${data.skipped.length} existing file(s) were not overwritten`);
        }

        return { files };
    },
};
