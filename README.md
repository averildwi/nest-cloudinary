# @averildwi/nest-cloudinary

An interactive CLI that adds a **Cloudinary upload module** to an existing
[NestJS](https://nestjs.com/) project: a `@Global()` module, an `UploadService`
(upload / delete / delete-by-URL), a `FilePipe` that validates size, MIME type,
real file contents (magic bytes) and unsafe SVGs, plus `.env.example` and
`app.module.ts` wiring.

Built from an audit of five real NestJS projects (see `analysis/cloudinary/`) so
the generated code follows the strongest patterns found there instead of one
project's habits.

## Quick start

Run it from the root of your NestJS project:

```bash
npx @averildwi/nest-cloudinary
```

The CLI copies nothing over existing files, previews the full plan, and applies
it only after you confirm:

```
  Planned changes
    $ npm install cloudinary
    $ npm install --save-dev @types/multer
    + src/common/upload/upload.module.ts
    + src/common/upload/upload.service.ts
    + src/common/upload/upload.types.ts
    + src/common/upload/pipes/file.pipe.ts
    + src/common/upload/file-signature.ts
    ~ src/app.module.ts (add UploadModule to imports)
    ~ .env.example (add CLOUDINARY_URL)

? Apply these changes? (Y/n)
```

## Options

| Option | Description |
|---|---|
| `--pm <name>` | `npm`, `pnpm`, `yarn` or `bun` (default: auto-detect) |
| `--cwd <path>` | Run against this app directory (default: current directory) |
| `--app <name>` | Pick a workspace package by name or relative path |
| `--no-install` | Only write files, don't install packages |
| `-y, --yes` | Accept defaults and skip all prompts |
| `--dry-run` | Show what would change without touching anything |
| `--no-color` | Disable coloured output (`NO_COLOR` is respected too) |
| `-v, --version` / `-h, --help` | Version / help |

Non-interactive use (CI, scripts):

```bash
npx @averildwi/nest-cloudinary --yes
npx @averildwi/nest-cloudinary --yes --dry-run
```

Without a TTY the CLI never waits for input.

## Decisions baked into the scaffold

These come from the analysis in [`analysis/cloudinary/findings.md`](analysis/cloudinary/findings.md):

- **`cloudinary` SDK** (not raw REST) — what 4 of the 5 audited projects use.
- **One secret, `CLOUDINARY_URL`** (`cloudinary://<key>:<secret>@<cloud>`) instead
  of three separate env keys.
- **`src/common/upload/`** with a `@Global()` `UploadModule` / `UploadService`,
  the shared-infrastructure location used by the two strongest projects.
- **Content-aware file validation**: size + declared MIME + magic bytes +
  SVG sanitisation, so a script renamed to `.jpg` is rejected.
- **`resource_type` is always sent** (`image` / `raw`), so deleting a PDF works.
- **`publicId` is returned** so callers can store URL + publicId and clean up
  old assets.

## What gets generated

```typescript
// src/common/upload/upload.service.ts (excerpt)
const result = await this.upload.uploadFile(file, { folder: 'avatars' });
// result -> { url, publicId, resourceType, width, height, format, bytes }
```

See [`docs/USAGE.md`](docs/USAGE.md) for how to wire an endpoint, validate the
incoming file, store it, and delete the previous asset safely.

## Monorepo / Turborepo

The CLI works in npm/pnpm/yarn/bun workspaces and Turborepo repositories. It can
start from the app directory or the workspace root:

```bash
# from the workspace root: the only NestJS app is picked automatically
npx @averildwi/nest-cloudinary

# several apps: pick one
npx @averildwi/nest-cloudinary --app @repo/api
npx @averildwi/nest-cloudinary --cwd apps/api --pm pnpm
```

Dependencies install with the workspace-aware command
(`npm install --workspace`, `pnpm --filter add`, `yarn workspace add`, or a plain
`bun add` in the app directory). `turbo.json` is never modified; a short Turbo
checklist is printed at the end when one is detected. With several NestJS apps
and no TTY, the CLI exits with code 2 instead of guessing — add `--app` or
`--cwd`.

See [`docs/monorepo.md`](docs/monorepo.md) for the full workspace contract and
[`docs/release.md`](docs/release.md) for the release checklist.

## After setup

1. Put your credentials in `.env` (copied from `.env.example`):
   `CLOUDINARY_URL="cloudinary://<api-key>:<api-secret>@<cloud-name>"`.
2. Validate it on boot by passing the key to your Joi project schema
   (`AppConfigModule.forProject(...)`):
   `CLOUDINARY_URL: Joi.string().uri().required()`.
3. Inject `UploadService` in the feature that handles the upload, and validate
   the incoming file with `FilePipe`.

## Compatibility

- Targets Nest 11 (CommonJS). The generated files use relative `.ts` imports with
  no framework version-specific APIs.
- `express` must be the HTTP adapter (the default), because `FilePipe` types
  against `Express.Multer.File`.
- ESM projects (`"type": "module"`) are not supported yet.

## Development

```bash
npm install
npm test        # node:test (unit + workspace + install + package)
npm link        # makes the `nest-cloudinary` command point at this checkout
```

## License

MIT
