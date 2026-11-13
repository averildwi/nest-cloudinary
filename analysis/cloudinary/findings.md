# Findings: Audit pola Cloudinary untuk `@averildwi/nest-cloudinary`

Audit READ-ONLY. Detail + bukti per repo ada di `repo-notes/*.md`. Dokumen ini
sintesisnya. Bukti `path:baris` relatif terhadap root repo masing-masing.

## 0. Ringkasan singkat (TL;DR)

- Ada **2 keluarga implementasi**: (a) pakai SDK `cloudinary` (`upload_stream` /
  `destroy`) dan (b) REST langsung (`fetch` + `FormData` + tanda tangan SHA-1).
- **3 repo memakai kode yang identik karakter-per-karakter** (`CK`, `MEH`, `WPB`)
  → jelas berasal dari satu template lama yang di-copy. Ini kandidat kuat untuk
  diangkat jadi scaffold.
- **`kelasku-backend` adalah implementasi paling matang & paling baru**
  (post-skill, ada test, `CLOUDINARY_URL` tunggal, tanpa dependency SDK, cleanup
  best-effort terlog, upload-lalu-DB dengan kompensasi). Ini acuan "best practice".
- **`webportfolio` (WPB)** punya aset terbaik yang tidak dimiliki repo lain:
  `FilePipe` dengan **validasi magic-byte** + **sanitasi SVG**, dan
  `deleteByUrl`/`parseUrl` yang benar untuk `resource_type` raw.
- Variasi config tersebar: 4 repo pakai 3 env (`CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`),
  1 repo pakai 1 env (`CLOUDINARY_URL`). README nest-common juga sudah memakai
  `CLOUDINARY_URL` sebagai contoh → arah standar yang wajar.

## 1. Inventaris repo

| Kode | Repo | Path | Lokasi upload | Pakai SDK? | Test? |
|---|---|---|---|---|---|
| CK | CateringKita backend | `C:\Workspace\Competition\cateringkita\backend` | `src/common/cloudinary/` | ya (`cloudinary` ^2.10.0) | tidak |
| MEH | Moklet Event Hub backend | `C:\Workspace\Internship\moklet-event-center-backend` | `src/upload/` | ya | tidak (hanya tipe `FilePipe` tanpa spec) |
| WPB | webportfolio (`apps/backend`) | `C:\Workspace\Self\webportfolio\apps\backend` | `src/common/upload/` | ya | ya (parseUrl, FilePipe) |
| WPA | web-portofolio (`apps/api`) | `C:\Workspace\Self\web-portofolio\apps\api` | `src/upload/` | ya | hanya smoke test service |
| KLK | kelasku-backend | `C:\Workspace\school\kelasku-backend` | `src/common/upload/` | **tidak** (REST + fetch) | ya (storage + service) |
| KK | KantinKlik backend | `C:\Users\LOQ 31\Downloads\kantinklik-backend` | — | — | — |

Catatan:
- **KK tidak diaudit**: path di catatan lama sudah tidak ada (folder
  `kantinklik-backend` tidak ditemukan di Downloads/OneDrive/Documents). Kalau
  masih dibutuhkan, pindahkan/clone dulu.
- Repo lain di workspace (`mlbb/team-manage-backend`, `sigap`, `sigaplapor`,
  `itcc*`, `Job/Client`) dicek dan **tidak** memakai Cloudinary (grep
  `upload_stream|CLOUDINARY_URL|api.cloudinary.com` di seluruh `C:\Workspace`
  hanya menemukan 5 repo di atas).

## 2. Dua keluarga implementasi

### Keluarga A — SDK `cloudinary` (CK, MEH, WPB, WPA)

- CK `src/common/cloudinary/cloudinary.service.ts:19-23`, MEH
  `src/upload/upload.service.ts:19-23`, WPB
  `src/common/upload/upload.service.ts:20-24`: konfigurasi global
  `cloudinary.config({ cloud_name, api_key, api_secret })` **di dalam constructor**
  dari `ConfigService`.
- Upload: `cloudinary.uploader.upload_stream(options, cb)` lalu
  `Readable.from(file.buffer).pipe(upload)` (CK `:41-68`, MEH `:41-68`, WPB `:42-69`).
- Hapus: `cloudinary.uploader.destroy(publicId, { resource_type })`
  (CK `:77-79`, MEH `:77-84`, WPB `:78-85`).

### Keluarga B — REST langsung tanpa dependency (KLK)

- `src/common/upload/storage.service.ts`: parse `CLOUDINARY_URL` manual
  (`:40-48`), tanda tangan SHA-1 (`:51-60`), `fetch` ke
  `https://api.cloudinary.com/v1_1/{cloud}/image/upload` (`:92-95`) dan
  `/image/destroy` (`:125-128`).
- Tidak ada pekerjaan `Readable`/stream: langsung `FormData` + `Blob` (`:81-90`).
- Credential dibaca **lazy** via `config.getOrThrow` (`:134-136`), jadi boot tidak
  gagal walau upload belum dikonfigurasi.

## 3. Kode yang di-copy identik (CK, MEH, WPB)

`uploadFile(file, folder, kind)` + `deleteFile(publicId, resourceType)` CK/MEH/WPB
identik (lihat diff mental di repo-notes). Elemennya:

- `UploadKind = 'image' | 'document'`; `UploadResult { url, publicId, resourceType }`.
- Sanitasi nama file + suffix unik: `basename` → `replace(/[^a-zA-Z0-9]/g,'_')` →
  `${cleanName}-${Date.now()}-${randomBytes(3).hex}` (CK `:33-39`).
- `resource_type: isImage ? 'image' : 'raw'`; untuk raw `public_id` diberi
  ekstensi (CK `:45-46`).
- Transformasi gambar saat upload: `{ width: 1080, crop: 'limit' }`,
  `{ quality: 'auto' }`, `{ fetch_format: 'auto' }` (CK `:47-53`).

WPA adalah versi lebih awal/lebih sederhana dari keluarga A: `resource_type: 'auto'`,
tanpa sanitasi nama, tanpa `kind`.

## 4. Matriks kepatuhan (vs rule yang diusulkan)

Legenda: ✅ SESUAI · ⚠️ SEBAGIAN · ❌ MENYIMPANG · — TIDAK_ADA · n/a N/A.

| Rule usulan | CK | MEH | WPB | WPA | KLK |
|---|---|---|---|---|---|
| C1 credential lewat config, tidak hardcode | ✅ | ✅ | ✅ | ✅ | ✅ |
| C2 credential divalidasi saat boot | ❌ | ✅ (auth schema) | ⚠️ (optional) | ✅ | ✅ |
| C3 modul `@Global()` untuk infra upload | ✅ | ✅ | ✅ | ✅ | ✅ |
| C4 resource_type benar utk image vs raw | ✅ | ✅ | ✅ | ❌ (`auto`) | ⚠️ (image only) |
| C5 hapus file ikut `resource_type` | ✅ | ✅ | ✅ | ❌ | n/a (image only) |
| C6 nama file disanitasi + unik | ✅ | ✅ | ✅ | ❌ | ✅ (Cloudinary default) |
| C7 validasi ukuran file | ❌ | ✅ (`FilePipe`) | ✅ (`FilePipe`) | ✅ (`FilePipe`) | ✅ (`ParseFilePipe`) |
| C8 validasi MIME | ❌ | ⚠️ (klaim saja) | ✅ (klaim + magic-byte + SVG) | ❌ | ✅ (`FileTypeValidator`) |
| C9 `publicId` tidak bocor ke API | — (tak dipakai) | ⚠️ (dipakai utk delete) | ⚠️ | ⚠️ | ✅ (select sempit) |
| C10 cleanup best-effort tidak menggagalkan request | ❌ | ❌ | ⚠️ (`.catch(()=>{})`) | ⚠️ | ✅ (log error) |
| C11 upload lalu DB, ada kompensasi saat DB gagal | ❌ | ❌ | ❌ | ❌ | ✅ |
| C12 test untuk service upload | ❌ | ❌ | ✅ | ⚠️ (smoke) | ✅ |
| C13 upload benar-benar dipakai | ❌ (dead code) | ✅ | ✅ | ✅ | ✅ |

Bukti tiap sel: `repo-notes/<repo>.md`.

## 5. Penyimpangan berulang

| # | Penyimpangan | Repo | Bukti | Sebab |
|---|---|---|---|---|
| R1 | Config 3 key (`CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`) vs 1 key (`CLOUDINARY_URL`) tidak konsisten | 4 vs 1 | `webportofolio .../base-env.schema.ts:26-28` vs `kelasku src/config/env.schema.ts:19` | Tidak ada standar; `CLOUDINARY_URL` dipakai di README nest-common |
| R2 | Credential tidak divalidasi saat boot | CK, WPB | CK `base-env.schema.ts:3-13` tidak punya key Cloudinary (padahal `.env.example:15-17` ada); WPB semua `.optional()` (`:26-28`) | Schema tidak menyentuh upload |
| R3 | `resource_type: 'auto'` + hapus tanpa resource_type → hapus PDF/raw gagal senyap | WPA | `upload.service.ts:24,40-42`; `extractPublicId` juga membuang ekstensi untuk raw (`:44-49`) | Versi lama, tidak menangani raw |
| R4 | `FilePipe` hanya cek `mimetype` (klaim client), bukan isi file | MEH, WPA | MEH `pipes/file.pipe.ts:27-31`; WPA `pipes/file.pipe.ts:31-35` | Belum ada validasi magic-byte |
| R5 | `publicId` disimpan tapi tidak selalu dipakai untuk delete (sebagian parse dari URL) | WPB, WPA | WPB `upload.service.ts:106-133`; WPA `:44-49` | Dua strategi berbeda |
| R6 | Cleanup error ditelan (`.catch(()=>{})` / `.catch(()=>null)`) tanpa log | WPB, WPA | WPB `projects.service.ts:194`; WPA `projects.service.ts:108` | Tidak ada policy cleanup |
| R7 | Tidak ada kompensasi saat DB gagal setelah upload berhasil | CK, MEH, WPB, WPA | WPB `projects.controller.ts:200-211` (upload dulu, `addDocs` transaksi terpisah) | Upload & DB tidak dikoordinasikan |
| R8 | Env disiapkan tapi tidak dipakai | MEH, WPA | MEH `UPLOAD_MAX_FILE_SIZE` (`auth-env.schema.ts:24`, `.env.example:54`) tak dipakai; WPA `MAX_FILE_SIZE_MB` (`env.validation.ts:17`) tak dipakai | Sisa rencana |
| R9 | Cloudinary keys ditumpangkan ke schema "auth" | MEH | `src/common/config/auth-env.schema.ts:20-24` | Organisasi schema |
| R10 | Modul upload ada tapi service tak pernah dipakai (dead code) | CK | hanya `app.module.ts:7,16` + folder; grep `CloudinaryService` = 0 pemakaian | Fitur belum jadi |

## 6. Praktik terbaik yang ditemukan (kandidat "core" scaffold)

Diambil dari repo terbaik, bukan dari satu repo saja:

1. **`CLOUDINARY_URL` tunggal** (KLK) — satu secret, cocok dengan `parseCloudinaryUrl`
   dan contoh di README nest-common. Lebih ringkas dari 3 key.
2. **Credential lazy + `getOrThrow`** (KLK `:134-136`) — modul tidak bikin app gagal
   boot karena env kosong hanya untuk test/CI; tapi schema tetap `required()` di
   runtime.
3. **`FilePipe` dengan magic-byte + sanitasi SVG** (WPB `pipes/file.pipe.ts` +
   `file-signature.ts`) — mencegah file dipalsukan ekstensi/MIME, dan SVG berbahaya
   (script/foreignObject/XXE).
4. **`deleteByUrl` + `parseUrl` yang sadar `resource_type`** (WPB `:87-133`) —
   aman untuk flow "ganti gambar": hapus by URL, ekstensi dipertahankan untuk raw.
5. **Best-effort cleanup yang di-log** (KLK `whiteboards.service.ts:297-311`,
   `cash-transactions.service.ts:268-276`) — kegagalan hapus tidak menggagalkan
   operasi bisnis, tapi tercatat.
6. **Upload dulu → DB transaksi → kompensasi saat DB gagal** (KLK `:133-143` dan
   `cash-transactions.service.ts:214-242`) — tidak ada aset orphan.
7. **`publicId` tidak pernah keluar API** (KLK `whiteboardImageSelect:45-51`) —
   `select` sempit; client hanya lihat `url/width/height/position`.
8. **`folder` dibangun dari fungsi** (KLK `buildWhiteboardFolder:35-37`) — folder
   deterministik & ber-scope.
9. **`StoredImage { url, publicId, width, height }` bertipe** (KLK `:14-19`) —
   metadata berguna untuk layout/preview.
10. **Selalu kirim `resource_type` saat hapus** (CK/MEH/WPB) — tidak ada yang
    konsisten 100%, tapi ini yang benar.

## 7. Celah / risiko

| ID | Sev | Repo | Celah | Bukti |
|---|---|---|---|---|
| V1 | MEDIUM | MEH, WPA | Validasi tipe hanya dari `mimetype` klien → file berbahaya bisa lolos (mis. `.jpg` berisi skrip). | MEH `pipes/file.pipe.ts:27`; WPA `pipes/file.pipe.ts:31` |
| V2 | MEDIUM | WPA | Upload `resource_type: 'auto'` + hapus `destroy(publicId)` tanpa resource_type → dokumentasi PDF tidak pernah benar-benar terhapus. | `upload.service.ts:24,40-42` |
| V3 | LOW | WPB, WPA | Cleanup error ditelan tanpa log → orphan asset tak terdeteksi. | WPB `projects.service.ts:194`; WPA `:108` |
| V4 | LOW | CK, WPB | Cloudinary secret tidak divalidasi saat boot → misconfig baru ketahuan saat request pertama. | CK `base-env.schema.ts`; WPB `:26-28` |
| V5 | LOW | CK, MEH, WPB, WPA | Upload berhasil tapi DB gagal → aset orphan (tidak ada kompensasi). | WPB `projects.controller.ts:200-211` |
| V6 | INFO | CK | `CloudinaryService` dead code (tidak pernah di-inject). | grep pemakaian = 0 |

## 8. Bentuk scaffold yang diusulkan

**Core (selalu ada):**
- `src/common/upload/upload.module.ts` — `@Global()`, provider + export service.
- `src/common/upload/upload.service.ts` (atau `storage.service.ts`) — `uploadFile`,
  `deleteFile`, `deleteByUrl` + `parseUrl`, kredensial lazy dari `ConfigService`.
- `src/common/upload/pipes/file.pipe.ts` + `file-signature.ts` — validasi ukuran,
  MIME klaim, **magic-byte**, dan (opsional) sanitasi SVG.
- `src/common/upload/types.ts` — `UploadKind`, `UploadResult`/`StoredImage`,
  `UploadedImageFile`.
- Registrasi `UploadModule` di `src/app.module.ts` (idempotent).
- Patch `.env.example` + snippet schema `CLOUDINARY_URL` (`Joi.string().uri().required()`).

**Configurable lewat prompt/flag:**
- Sumber kredensial: `CLOUDINARY_URL` (default) atau 3 key.
- Transport: SDK `cloudinary` (default, DX) atau REST `fetch` (tanpa dependency).
- Default ukuran maksimum & MIME yang diizinkan.
- Apakah sertakan sanitasi SVG (kalau project mengizinkan upload ikon SVG).

**Spec:**
- `upload.service.spec.ts` (parseUrl image/raw/non-Cloudinary) dan
  `file.pipe.spec.ts` (ukuran, MIME salah, isi tidak cocok).

## 9. Keputusan yang masih terbuka

Lihat `open-questions.md`.
