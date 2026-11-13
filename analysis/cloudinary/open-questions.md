# Open questions: `@averildwi/nest-cloudinary`

Keputusan yang menentukan bentuk scaffold. Setiap item punya rekomendasi berbasis
analisis (`findings.md`). [OPINI] = usulan, bukan fakta dari repo.

## Q1. Transport upload: SDK `cloudinary` atau REST `fetch`?

- **Opsi A — SDK `cloudinary`** (dipakai CK, MEH, WPB, WPA). DX lebih baik, resmi,
  menangani signing/retry/tipenya sendiri. Menambah 1 dependency + transitive.
- **Opsi B — REST `fetch` + `FormData`** (dipakai KLK). Tanpa dependency, Node 20+
  sudah punya `fetch`/`FormData`/`Blob`. Tapi signing SHA-1 ditulis sendiri.

**Rekomendasi: A (SDK)**. Mayoritas repo memakainya, lebih sedikit kode buatan
sendiri, dan `resource_type`/transform lebih mudah. Opsi B tetap disediakan lewat
flag `--transport rest`.

## Q2. Bentuk config: 1 env atau 3 env?

- **Opsi A — `CLOUDINARY_URL`** (`cloudinary://key:secret@cloud`) — dipakai KLK,
  dan sudah dipakai sebagai contoh di README nest-common.
- **Opsi B — `CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`**
  — dipakai CK, MEH, WPB, WPA.

**Rekomendasi: A** sebagai default (1 secret, ringkas, konsisten dgn nest-common);
B opsional lewat flag.

## Q3. Lokasi & penamaan

- **Opsi A — `src/common/upload/` + `UploadModule`/`UploadService`** (WPB, KLK).
  Sesuai nest-architecture (infra bersama di `src/common/<kind>/`) dan netral
  provider.
- **Opsi B — `src/common/cloudinary/` + `CloudinaryModule`/`CloudinaryService`** (CK).
- **Opsi C — `src/upload/` + `UploadModule`/`UploadService`** (MEH, WPA).

**Rekomendasi: A**. Netral, konsisten dengan nest-common (`src/common/...`), dan
nama `UploadService` sudah dipakai 2 repo terbaik. Nama file `storage.service.ts`
(KLK) juga oke; default `upload.service.ts`.

## Q4. Lapisan validasi file

- **Rekomendasi**: sertakan `FilePipe` yang mencakup:
  1. ukuran (`maxSizeMb`),
  2. MIME klaim (`allowedMimes`),
  3. **magic-byte** (`detectMimeFromContent`) — WPB,
  4. cek klaim vs isi,
  5. **sanitasi SVG** (`inspectSvg`) — opsional, karena ikon SVG (WPA tech-stack)
     membutuhkannya.

Default MIME: `image/jpeg|png|webp`. Default ukuran: 5MB.

## Q5. Pembantu untuk flow "ganti gambar" & schema

- **Rekomendasi**: sertakan `deleteByUrl(url)` + `static parseUrl(url)` (WPB) supaya
  flow replace aman, dan dokumentasikan pola schema `url` + `publicId` berpasangan
  (MEH) + select sempit agar `publicId` tak bocor (KLK).

## Q6. Cleanup & konsistensi upload/DB

- **Rekomendasi kebijakan** (gabungan KLK + perbaikan R6/V3):
  - Delete best-effort **di-log** (`logger.error`), tidak ditelan.
  - Upload dulu → tulis DB → kompensasi hapus kalau DB gagal (pola KLK cash).
  - Scaffold menyediakan helper, tapi keputusan transaksi tetap di fitur.

## Q7. `resource_type`

- **Rekomendasi**: selalu kirim `resource_type` (`image` default, `raw` untuk PDF),
  dan jangan pakai `auto` (bug WPA V2). Sediakan `kind: 'image' | 'document'`.

## Q8. Dukungan raw/PDF

- **Rekomendasi**: ya (MEH guidebook, WPB docs). Artinya `parseUrl` harus
  mempertahankan ekstensi untuk raw.

## Q9. Cakupan scaffold

- **Rekomendasi**: hanya infrastruktur (module, service, pipe, types, env snippet,
  `.env.example` patch, register `app.module`), tanpa membuat fitur contoh di luar
  itu. Sama seperti nest-common (menyediakan blok, bukan aplikasi).
