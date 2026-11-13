/**
 * The ordered pipeline. Every step exposes:
 *   - plan(ctx)        -> { entries: PlanEntry[], data? }  (must not change anything)
 *   - run(ctx, data)   -> { status?, files? }
 *
 * A step whose entries are all `skip` is not executed, which is what makes
 * re-running the CLI on an already configured project safe.
 */
module.exports = [
    // Install first: a failed install must leave no project files behind.
    require('./installDeps'),
    require('./copyUpload'),
    require('./registerAppModule'),
    require('./updateEnv'),
];
