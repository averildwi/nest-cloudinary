# Repo notes: webportfolio / `apps/backend` (WPB)

> Audit READ-ONLY. Path relatif dari `C:\Workspace\Self\webportfolio\apps\backend`.
> Kode upload **identik** dengan CK & MEH (keluarga SDK), tapi WPB punya
> lapisan validasi file terbaik: `FilePipe` magic-byte + sanitasi SVG.

## 0. Info repo

- Stack: Nest 11, Prisma 7, `cloudinary` ^2.10.0 (`package.json:47`),
  `@nestjs/platform-express` ^11.0.1 (`:38`), `@types/multer` ^2.2.0 (`:70`).
  Tidak ada `multer` eksplisit.
- Lokasi: `src/common/upload/` + `src/common/upload/pipes/`.

## 1. Konfigurasi & service

- `src/common/upload/upload.module.ts`: `@Global()`.
- `src/common/upload/upload.service.ts`:
  - `cloudinary.config` di constructor dari `ConfigService` (`:20-24`).
  - `uploadFile(file, folder, kind)` (`:27-76`): sanitasi nama + suffix unik
    (`:34-40`), `upload_stream` (`:43`), `resource_type: image|raw`, `public_id`
    + ekstensi untuk raw (`:47`), transform `width 1080 / quality auto /
    fetch_format auto` (`:48-54`), hasil `{ url, publicId, resourceType }` (`:71-75`).
  - `deleteFile(publicId, resourceType='image')` (`:78-85`).
  - `deleteByUrl(url)` (`:92-99`): parse lalu hapus, error **ditelan** (`.catch(()=>{})`).
  - `static parseUrl(url)` (`:106-133`): ambil `resourceType` dari segmen sebelum
    `upload` (`raw` vs `image`), buang ekstensi **hanya untuk image** (raw
    dipertahankan karena ekstensi bagian dari public_id). Mengembalikan null untuk
    URL non-Cloudinary.
- `src/common/upload/upload.service.spec.ts`: 5 test `parseUrl` (image ber-ext,
  raw/PDF, tanpa ekstensi, non-Cloudinary, tanpa path setelah versi).

## 2. Validasi file

- `src/common/upload/pipes/file.pipe.ts` (`FilePipe`):
  - Opsi `maxSizeMb`, `allowedMimes`, `maxFiles`, `required`.
  - Dukung file tunggal **dan** array.
  - Cek ukuran (`:65-71`) → cek MIME klaim (`:73-77`) → **cek isi file**
    via `detectMimeFromContent` (`:82-105`) → cocokkan klaim vs deteksi
    (`:107-112`) → kalau SVG, `inspectSvg` (`:114-122`).
- `src/common/upload/file-signature.ts`:
  - `detectMimeFromContent`: JPEG `FF D8 FF`, PNG, PDF `%PDF-`, WebP `RIFF...WEBP`,
    SVG heuristik (`:13-40`).
  - `looksLikeSvg` dengan jendela 4096 byte (komentar menjelaskan risiko DOCTYPE
    panjang/XXE) (`:53-61`).
  - `inspectSvg`: blokir `<script>`, `<foreignObject>`, `<iframe>`, `<embed>`,
    `<object>`, `<use href=http>`, atribut `on*=`, `javascript:`, `data:text/html`,
    `<!ENTITY`, `<set attributeName=href>` (`:63-97`).
- `file.pipe.spec.ts` (banyak kasus, termasuk SVG aman/berbahaya).

## 3. Env

- `src/common/config/base-env.schema.ts:26-28`: `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` semua **`.optional()`** → app tetap
  boot tanpa Cloudinary; error baru muncul saat upload.
- `.env.example:22-24`: tiga key (dikosongkan).

## 4. Pemakaian

- `src/app.module.ts:8,40`: `UploadModule` didaftarkan.
- Controller: `FileInterceptor('file')` / `FilesInterceptor('files', MAX_DOCS)`
  (default memory storage), divalidasi `FilePipe` per-route
  (`projects.controller.ts:143,147,175,179-191`). Validasi kapasitas dokumentasi
  **sebelum** upload (`:193-198`), komentar eksplisit "supaya tidak ada file yang
  terbuang ke Cloudinary lalu harus dihapus lagi".
- Service: `updateThumbnail` (`projects.service.ts:191-203`),
  `removeDoc` (`:255-273`), `remove` (`:276-289`) memakai `deleteByUrl`.
  Cleanup error ditelan (`.catch(()=>null)`/`deleteByUrl`).

## 5. Penilaian

| Aspek | Status |
|---|---|
| Credential via config | ✅ |
| Validasi boot | ⚠️ optional |
| Modul `@Global()` | ✅ |
| resource_type image vs raw | ✅ |
| Hapus ikut resource_type | ✅ |
| Sanitasi/keunikan nama | ✅ |
| Validasi ukuran | ✅ |
| Validasi MIME | ✅ + magic-byte + SVG |
| publicId tidak bocor | ⚠️ publicId dipakai internal (ok), tapi ada juga parse-by-URL |
| Cleanup | ⚠️ ditelan tanpa log |
| Upload→DB kompensasi | ❌ |
| Test | ✅ |

**Kesimpulan**: sumber untuk `FilePipe` + `file-signature` + `parseUrl`, dan
`resource_type` raw. Perlu diperbaiki: cleanup di-log, jangan telan error.
