/**
 * Single source of truth for the packages this CLI installs and the env key the
 * generated module reads.
 *
 * The install specs are intentionally unversioned: the idempotency check treats
 * "already declared in package.json" as satisfied, so a project pinned to a
 * compatible `cloudinary` 2.x is never downgraded or reinstalled. The generated
 * service targets the Cloudinary Node SDK v2 API.
 */

/** Every key the generated module reads from the environment. */
const ENV_KEYS = ['CLOUDINARY_URL'];

/**
 * Resolves the dependency lists for the install step.
 *
 * @returns {{ dependencies: string[], devDependencies: string[] }}
 */
function resolveDependencies() {
    return {
        dependencies: ['cloudinary'],
        // `Express.Multer.File` only exists once multer's ambient types are installed.
        devDependencies: ['@types/multer'],
    };
}

module.exports = {
    ENV_KEYS,
    resolveDependencies,
};
