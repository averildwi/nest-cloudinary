# Changelog

All notable changes to `@averildwi/nest-cloudinary` are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-11-12

### Added

- Interactive CLI that adds a Cloudinary upload module to an existing NestJS
  project. Pattern distilled from an audit of five real projects
  (`analysis/cloudinary/`).
- `src/common/upload/` with:
  - a `@Global()` `UploadModule` and `UploadService` (upload, delete,
    delete-by-URL with a resource-type-aware URL parser),
  - `upload.types.ts` (`UploadedFile`, `UploadResult`, `UploadKind`),
  - `pipes/file.pipe.ts` validating size, declared MIME, magic bytes and SVG
    safety,
  - `file-signature.ts` content sniffing for JPEG/PNG/WebP/PDF/SVG.
- Automatic `app.module.ts` registration of `UploadModule`.
- `.env.example` patching with `CLOUDINARY_URL` and a `.gitignore` warning.
- `cloudinary` (runtime) and `@types/multer` (dev) installed with a
  Nest-agnostic, semver-aware check so re-runs are idempotent.
- Monorepo and Turborepo support: workspace detection, automatic app selection,
  and workspace-aware dependency installation (`--cwd`, `--app`, `--pm`).
- `docs/monorepo.md`, `docs/release.md`, and `docs/USAGE.md`.
- Tests for CLI parsing, app-module injection, env merging, dependency
  satisfaction, workspace resolution, and published package metadata.

[Unreleased]: https://github.com/averildwi/nest-cloudinary/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/averildwi/nest-cloudinary/releases/tag/v1.0.0
