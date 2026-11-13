# Release checklist

Run these steps from the package directory before publishing.

1. **Install exactly what CI installs**

   ```bash
   npm ci
   ```

2. **Run the test suite**

   ```bash
   npm test
   ```

   Expected: all files in `test/` pass on Node 20, 22, and 24.

3. **Inspect the published package**

   ```bash
   npm pack --dry-run
   ```

   The tarball must contain `bin/`, `src/`, `templates/`, `docs/`,
   `CHANGELOG.md`, `LICENSE`, and `README.md`. It must not contain `test/`,
   `analysis/`, or `node_modules/`.

4. **Update the changelog**

   Move the relevant `## [Unreleased]` entries in `CHANGELOG.md` under the new
   version and date. If the release changes the workspace contract, update
   `docs/monorepo.md` and the README at the same time.

5. **Bump the version**

   ```bash
   npm version <major|minor|patch> --no-git-tag-version
   git add package.json package-lock.json CHANGELOG.md
   git commit -m "chore(release): vX.Y.Z"
   git tag vX.Y.Z
   ```

   Keep `package.json` and `package-lock.json` in sync.

6. **Publish**

   ```bash
   npm publish --access public
   git push && git push --tags
   ```

7. **Verify the published binary**

   ```bash
   npx @averildwi/nest-cloudinary@X.Y.Z --help
   npx @averildwi/nest-cloudinary@X.Y.Z --version
   ```

## Workspace smoke matrix

Local machines without pnpm/yarn/bun can only verify command construction. The
release should also be exercised on a machine with those package managers:

| Scenario | Command |
| --- | --- |
| Single npm repo, dry run | `npx @averildwi/nest-cloudinary --yes --dry-run` |
| npm workspace, dry run | `npx @averildwi/nest-cloudinary --app @repo/api --dry-run` |
| pnpm workspace + catalog | `npx @averildwi/nest-cloudinary --pm pnpm --app @repo/api --dry-run` |
| yarn workspace | `npx @averildwi/nest-cloudinary --pm yarn --app @repo/api --dry-run` |
| bun workspace | `npx @averildwi/nest-cloudinary --pm bun --app @repo/api --dry-run` |
| Real install, npm | `npx @averildwi/nest-cloudinary --app @repo/api --yes` |
| Real install, pnpm | `npx @averildwi/nest-cloudinary --pm pnpm --app @repo/api --yes` |

For the real-install rows, confirm that:

- the install command runs from the workspace root and targets the app,
- `src/common/upload/*` and the app-module wiring land in the app package,
- `.env.example` gets `CLOUDINARY_URL`,
- `turbo.json` is unchanged and the Turbo checklist is shown.
