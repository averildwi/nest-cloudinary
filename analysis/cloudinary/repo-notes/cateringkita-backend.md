# Repo notes: cateringkita-backend (CK)

> Audit READ-ONLY. Path relatif dari `C:\Workspace\Competition\cateringkita\backend`.
> `uploadFile`/`deleteFile` **identik** dengan MEH & WPB. Ciri khas: modul upload
> ada tapi **tidak dipakai** (dead code).

## 0. Info repo

- Stack: Nest 11, Prisma 7. `cloudinary` ^2.10.0 (`package.json:34`),
  `multer` ^2.2.0 (`:36`), `@nestjs/platform-express` ^11.0.1 (`:28`),
  `@types/multer` ^2.2.0 (`:52`).
- Lokasi: `src/common/cloudinary/`.

## 1. Implementasi

- `src/common/cloudinary/cloudinary.module.ts`: `@Global()`, providers/exports
  `CloudinaryService`.
- `src/common/cloudinary/cloudinary.service.ts`:
  - `cloudinary.config` di constructor dari `ConfigService` (`:19-23`).
  - `uploadFile(file, folder, kind='image')` (`:26-75`): sanitasi nama + suffix
    (`:33-39`), `upload_stream` (`:42`), `resource_type image|raw` (`:45`),
    `public_id`+ext untuk raw (`:46`), transform `width 1080/quality auto/
    fetch_format auto` (`:47-53`), hasil `{ url, publicId, resourceType }`.
  - `deleteFile(publicId, resourceType='image')` (`:77-79`).

## 2. Env

- `src/common/config/base-env.schema.ts:3-13`: **tidak ada** key Cloudinary.
- `src/app.module.ts:13` (per catatan audit auth): `AppConfigModule.forProject()`
  tanpa project schema.
- `.env.example:15-17`: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET` (dikosongkan).
- **Mismatch**: `.env.example` punya 3 key, tapi schema tidak memvalidasi → kalau
  kosong, error baru muncul saat upload.

## 3. Pemakaian

- `src/app.module.ts:7,16`: `CloudinaryModule` didaftarkan.
- **Tidak ada pemakaian `CloudinaryService` di mana pun** (grep = 0). Tidak ada
  `FileInterceptor`/endpoint upload.
- Prisma menyimpan banyak URL tanpa publicId:
  `VendorProfile.bannerPhoto/profilePhoto` (`schema.prisma:95-96`),
  `Product.photo` (`:125`), `Rating.imageUrl` (`:170`) — semuanya `String?` URL saja.

## 4. Penilaian

| Aspek | Status |
|---|---|
| Credential via config | ✅ |
| Validasi boot | ❌ |
| Modul `@Global()` | ✅ |
| resource_type image vs raw | ✅ |
| Hapus ikut resource_type | ✅ |
| Sanitasi/keunikan nama | ✅ |
| Validasi ukuran/MIME | ❌ (tak ada endpoint) |
| publicId tidak bocor | — (tak dipakai) |
| Cleanup | ❌ |
| Upload→DB kompensasi | ❌ |
| Test | ❌ |
| Dipakai | ❌ dead code |

**Kesimpulan**: kontribusi utama CK adalah membuktikan kode template keluarga A.
Tidak dipakai sebagai acuan perilaku, tapi berguna sebagai contoh "jangan" untuk
config yang tidak divalidasi & fitur setengah jadi.
