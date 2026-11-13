# Repo notes: moklet-event-center-backend (MEH)

> Audit READ-ONLY. Path relatif dari `C:\Workspace\Internship\moklet-event-center-backend`.
> Keluarga SDK; `uploadFile`/`deleteFile` identik dengan CK & WPB. Cloudinary
> dipakai paling luas (banner, guidebook, foto siswa, dresscode, jadwal).

## 0. Info repo

- Stack: Nest 11, Prisma 7. `cloudinary` ^2.10.0 (`package.json:35`),
  `@nestjs/platform-express` ^11.0.1 (`:28`), `@types/multer` ^2.2.0 (`:53`).
  **Tidak ada** `multer` eksplisit (impor `memoryStorage` dari `multer`; ada sebagai
  transitive dep).
- Lokasi: `src/upload/`.
- Test: **tidak ada** spec khusus upload.

## 1. Implementasi

- `src/upload/upload.module.ts`: `@Global()`.
- `src/upload/upload.service.ts`: identik dengan CK/WPB — `uploadFile(file, folder,
  kind)` (`:26-75`), `deleteFile(publicId, resourceType='image')` (`:77-84`).
- `src/upload/pipes/file.pipe.ts` (`FilePipe`): cek ukuran (`:19-25`) + MIME **klaim
  client** (`:27-31`), default MIME `image/jpeg|png|webp` (`:8`). Tidak ada
  magic-byte.

## 2. Env

- `src/common/config/auth-env.schema.ts:20-24`: `CLOUDINARY_CLOUD_NAME`,
  `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` **required**; plus
  `UPLOAD_MAX_FILE_SIZE` default `5242880` (`:24`).
- **Catatan**: key Cloudinary ditaruh di schema "auth" (grup salah).
- `UPLOAD_MAX_FILE_SIZE` **tidak dipakai** di kode (grep = 0); ukuran di-hardcode
  per route (`maxSizeMb`).
- `.env.example:49-54`: blok Cloudinary + `UPLOAD_MAX_FILE_SIZE`.

## 3. Pemakaian

- `src/app.module.ts:9,61`: `UploadModule` didaftarkan.
- Controller memakai `FileInterceptor('file', { storage: memoryStorage() })` +
  `@UploadedFile(new FilePipe({ maxSizeMb: N, allowedMimes: [...] }))`:
  - `events.controller.ts:168,172` (banner, 3MB), `:211-216` (guidebook PDF 10MB).
  - `schedules.controller.ts:138,142` (3MB).
  - `students.controller.ts:121,163,211,256,296` (foto siswa dll).
- Service menghapus file lama sebelum upload baru:
  - `events.service.ts:111-118` (banner), `:133-140` (guidebook) — memakai
    `deleteFile(publicId, 'image'|'raw')` yang benar.
  - `schedules.service.ts:56-61`, `students.service.ts:84-90`.
  - Tidak ada try/catch kompensasi bila DB gagal setelah upload.

## 4. Skema Prisma

- Pola berpasangan `xxxUrl` + `xxxPublicId` (bagus, memudahkan hapus):
  `Account.photoUrl/photoPublicId` (`schema.prisma:63-64`),
  `Event.bannerUrl/bannerPublicId/guidebookUrl/guidebookPublicId` (`:94-97`),
  `dresscodeImageUrl/dresscodeImagePublicId` (`:131-132`).

## 5. Penilaian

| Aspek | Status |
|---|---|
| Credential via config | ✅ |
| Validasi boot | ✅ (di schema auth) |
| Modul `@Global()` | ✅ |
| resource_type image vs raw | ✅ |
| Hapus ikut resource_type | ✅ |
| Sanitasi/keunikan nama | ✅ |
| Validasi ukuran | ✅ |
| Validasi MIME | ⚠️ klaim saja |
| publicId tidak bocor | ⚠️ dipakai internal (ok) |
| Cleanup | ❌ (tidak ada saat DB gagal) |
| Upload→DB kompensasi | ❌ |
| Test | ❌ |

**Kesimpulan**: bukti paling kuat untuk pola `url` + `publicId` berpasangan di
schema, dan `resource_type` raw untuk guidebook PDF. Perlu perbaikan: validasi
isi file, dan group schema env yang benar.
