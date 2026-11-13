# Repo notes: web-portofolio / `apps/api` (WPA)

> Audit READ-ONLY. Path relatif dari `C:\Workspace\Self\web-portofolio\apps\api`.
> Versi keluarga SDK yang **paling sederhana/awal**. Beberapa bug nyata:
> `resource_type: 'auto'`, hapus tanpa resource_type, `FilePipe` hanya cek klaim.

## 0. Info repo

- Stack: Nest 11. `cloudinary` ^2.10.0 (`package.json:35`), `multer` ^2.1.1 (`:37`),
  `@nestjs/platform-express` ^11.1.26 (`:28`), `@types/multer` ^2.1.0 (`:54`).
- Lokasi: `src/upload/` + `src/upload/pipes/`.

## 1. Implementasi

- `src/upload/upload.module.ts`: `@Global()`.
- `src/upload/upload.service.ts`:
  - `cloudinary.config` di constructor (`:9-13`).
  - `uploadFile(file, folder)` (`:16-38`): `resource_type: 'auto'` (`:24`),
    transform `width 1080/quality auto/fetch_format auto` (`:25-29`),
    **tidak** sanitasi nama / **tidak** dukung `kind`/raw. Mengembalikan
    `UploadApiResponse` mentah (bukan `{ url, publicId }`).
  - `deleteFile(publicId)` (`:40-42`): `destroy(publicId)` **tanpa `resource_type`**
    → default image; hapus PDF/raw gagal.
  - `extractPublicId(url)` (`:44-49`): `slice(indexOf('upload')+2)`, lalu **selalu**
    buang ekstensi (`replace(/\.[^/.]+$/,'')`) → untuk raw/PDF, ekstensi bagian dari
    public_id, jadi ini salah.
- `src/upload/pipes/file.pipe.ts` (`FilePipe`): hanya cek `size` dan `mimetype`
  klaim (`:22-35`). Tidak ada magic-byte.
- `src/upload/upload.service.spec.ts`: hanya smoke test "should be defined".

## 2. Env

- `src/config/env.validation.ts:10-12`: `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`
  **required**.
- `MAX_FILE_SIZE_MB: Joi.number().default(5)` (`:17`) — **tidak dipakai** (ukuran
  di-hardcode di FilePipe per route).
- `.env.example:16-19`: tiga key.

## 3. Pemakaian

- `src/app.module.ts:9,26`: `UploadModule` didaftarkan.
- Controller: `FileInterceptor('file')` / `FilesInterceptor('files', 10)` +
  `@UploadedFile(new FilePipe({ maxSizeMb, allowedMimes }))`
  (`projects.controller.ts:84,107,116`; `achievements.controller.ts:70,94`;
  `tech-stack.controller.ts:66,89`).
- Service:
  - `projects.service.ts:103-116` uploadThumbnail (hapus lama via
    `extractPublicId` + `deleteFile(...).catch(()=>null)`).
  - `:118-138` uploadDocs (paralel, tanpa transaksi/kompensasi).
  - `:152-178` remove (hapus banyak via `extractPublicId`, `.catch(()=>null)`).
  - `achievements.service.ts:54-74`, `tech-stack.service.ts:36-57` pola serupa.

## 4. Skema Prisma

- Hanya URL (tanpa publicId): `TechStack.iconUrl` (`:54`), `Project.thumbnailUrl`
  (`:71`), `Achievement.certificateUrl` (`:116`). Karena hanya URL, hapus
  mengandalkan `extractPublicId` — sumber bug.

## 5. Penilaian

| Aspek | Status |
|---|---|
| Credential via config | ✅ |
| Validasi boot | ✅ |
| Modul `@Global()` | ✅ |
| resource_type image vs raw | ❌ (`auto`) |
| Hapus ikut resource_type | ❌ |
| Sanitasi/keunikan nama | ❌ |
| Validasi ukuran | ✅ |
| Validasi MIME | ❌ (klaim saja) |
| publicId tidak bocor | ⚠️ (hanya URL disimpan) |
| Cleanup | ⚠️ ditelan |
| Upload→DB kompensasi | ❌ |
| Test | ⚠️ smoke |

**Kesimpulan**: contoh "cara lama" — berguna sebagai daftar hal yang harus
dihindari (auto, destroy tanpa resource_type, extractPublicId yang membuang
ekstensi raw, simpan hanya URL tanpa publicId).
