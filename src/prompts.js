const { CancelledError } = require('./errors');

async function loadInquirer() {
    // inquirer 9 is ESM-only, so it has to be loaded with a dynamic import.
    const { default: inquirer } = await import('inquirer');
    return inquirer;
}

/** inquirer rejects with this when the user presses Ctrl+C. */
function isPromptAbort(err) {
    return err && (err.name === 'ExitPromptError' || err.isTtyError === false || /force closed/i.test(err.message || ''));
}

async function prompt(questions) {
    const inquirer = await loadInquirer();
    try {
        return await inquirer.prompt(questions);
    } catch (err) {
        if (isPromptAbort(err)) throw new CancelledError();
        throw err;
    }
}

/**
 * The Cloudinary setup has no real choices (SDK + CLOUDINARY_URL + a global
 * module in src/common/upload are fixed defaults), so there is nothing to
 * prompt for. Kept as a function for symmetry with the other scaffolds and to
 * leave room for future flags.
 */
async function resolveAnswers() {
    return {};
}

async function confirmPlan() {
    const { proceed } = await prompt([
        { type: 'confirm', name: 'proceed', message: 'Apply these changes?', default: true },
    ]);
    if (!proceed) throw new CancelledError();
}

/** Asks which workspace package to configure when several NestJS apps exist. */
async function pickApp(candidates) {
    const { app } = await prompt([
        {
            type: 'list',
            name: 'app',
            message: 'Which NestJS application should be configured?',
            choices: candidates.map((candidate) => ({
                name: `${candidate.name} (${candidate.rel})`,
                value: candidate.dir,
            })),
        },
    ]);
    return app;
}

module.exports = { resolveAnswers, confirmPlan, pickApp };
