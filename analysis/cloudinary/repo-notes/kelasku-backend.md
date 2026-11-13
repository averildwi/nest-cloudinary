# Repo notes: kelasku-backend (KLK)

> Audit READ-ONLY. Path relatif dari root repo `C:\Workspace\school\kelasku-backend`.
> Ini repo **paling baru & paling matang** untuk upload: pakai REST langsung
> (tanpa SDK `cloudinary`), `CLOUDINARY_URL` tunggal, ada test, cleanup terlog.

## 0. Info repo

- **Stack**: Nest 11 + CommonJS, Prisma 7 (`prisma-client` generator), `@nestjs/config`.
- **`cloudinary` di package.json**: **TIDAK ADA**. Tidak ada `multer` eksplisit
  (memakai `@nestjs/platform-express`). Hanya `@nestjs/platform-express` ^11.0.1
  (`package.json:28`).
- **Lokasi**: `src/common/upload/` (infra bersama) — sesuai aturan nest-architecture.
- **Test**: ada, `jest` + `test/setup-env.ts`.

## 1. Implementasi

- `src/common/upload/storage.service.ts`
  - `parseCloudinaryUrl` regex `^cloudinary:\/\/([^:]+):([^@]+)@(.+)$` (`:40-48`),
    melempar pesan jelas kalau salah format.
  - `signCloudinaryParams` = SHA-1 dari `key=value` ter-sort + api_secret (`:51-60`).
  - `uploadImage(file, folder)`: `FormData` + `Blob` (`:81-90`), `fetch`
    `/image/upload` (`:92-95`), hanya status yang dilaporkan saat gagal (`:96-99`),
    mengembalikan `{ url, publicId, width, height }` (`:102-107`).
  - `deleteImage(publicId)`: `fetch` `/image/destroy` (`:125-128`), reject saat
    gagal (`:129-131`) — caller yang menentukan logging.
  - Credential **lazy**: `config.getOrThrow('CLOUDINARY_URL')` di `:134-136`.
  - `buildWhiteboardFolder(classId)` = `kelasku/{classId}/whiteboard` (`:35-37`).
- `src/common/upload/upload.module.ts`: `@Global()`, providers/exports `StorageService`.

## 2. Env

- `src/config/env.schema.ts:19`: `CLOUDINARY_URL: Joi.string().uri().required()`.
- `.env.example:17-18`: `# Upload (Cloudinary) - whiteboard photos` + `CLOUDINARY_URL=""`.
- `test/setup-env.ts:12`: `process.env.CLOUDINARY_URL ||= 'cloudinary://key:secret@cloud'`.
- `src/config/env.schema.spec.ts`: menguji schema, termasuk `CLOUDINARY_URL`.

## 3. Pemakaian

### Whiteboards (`src/whiteboards/`)

- Controller: `FilesInterceptor('images', MAX_WHITEBOARD_IMAGES)` +
  `ParseFilePipe([MaxFileSizeValidator, FileTypeValidator(IMAGE_TYPE_PATTERN)])`
  (`whiteboards.controller.ts:59,85-93`). MIME pattern `/^image\/(jpeg|png|webp)$/`.
- Service `create` (`whiteboards.service.ts:122-171`): validasi → upload
  **sekuensial** (`:137-139`) → kalau gagal, cleanup yang sudah terupload
  (`:140-143`) → tulis note + `createMany` image di satu transaksi (`:145-170`).
- Select sempit: `whiteboardImageSelect` tidak menyertakan `cloudinaryPublicId`
  (`:45-51`); komentar tegas "`cloudinaryPublicId` never leaves the API" (`:44`).
- `remove` (`:255-295`): soft-delete lalu `void this.cleanupImages(...)`.
- `cleanupImages` (`:297-311`): `Promise.allSettled`, setiap reject **di-log**
  (`logger.error`), tidak pernah dilempar ke caller.

### Cash transactions (`src/cash-transactions/`)

- `create` (`:203-243`): upload dulu → simpan `proofUrl`; kalau `prisma.create`
  gagal, `removeProof(publicId)` (kompensasi) (`:225-242`).
- `removeProof` (`:268-276`): best-effort + log.

## 4. Skema Prisma

- `WhiteboardImage` (`prisma/schema.prisma:265-279`): `url`, `cloudinaryPublicId`,
  `width`, `height`, `position`; index `[noteId]`; `onDelete: Cascade` dari note.
- `CashTransaction` (`:369`): `proofUrl String?` saja (tidak simpan publicId di
  baris; publicId hanya dipakai saat create untuk kompensasi).
- `User.avatarUrl` (`:70`).

## 5. Penilaian

| Aspek | Status |
|---|---|
| Credential via config, tidak hardcode | ✅ |
| Validasi boot (`required`) | ✅ |
| Modul `@Global()` | ✅ |
| resource_type | ⚠️ hanya image (bukan bug untuk use case-nya) |
| Sanitasi/keunikan nama | ✅ (Cloudinary default) |
| Validasi ukuran + MIME | ✅ (ParseFilePipe) |
| publicId tidak bocor | ✅ |
| Cleanup best-effort + log | ✅ |
| Upload → DB + kompensasi | ✅ |
| Test | ✅ |

**Kesimpulan**: acuan utama untuk "core" scaffold (config, alur upload, cleanup,
select, test). Yang tidak diambil dari sini: dukungan `raw`/PDF dan validasi
magic-byte (ada di WPB), serta pilihan SDK vs fetch.
