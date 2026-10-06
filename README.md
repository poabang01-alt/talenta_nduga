# Talenta Nduga v9 — Frontend Prototype / UAT Baseline

Talenta Nduga adalah frontend HTML + CSS + JavaScript untuk pendataan Pelajar SMA/SMK dan Mahasiswa S1/S2/S3, verifikasi data pendidikan dan dokumen, beasiswa, reminder, CV digital, CMS publik, analytics prototype, serta dashboard multi-peran.

## Menjalankan proyek

1. Ekstrak ZIP.
2. Buka folder `talenta_nduga` di VS Code.
3. Jalankan `index.html` menggunakan Live Server.
4. Database prototype tersimpan di `localStorage`.
5. Sesi tersimpan di `sessionStorage`.
6. Dokumen/gambar/foto baru menggunakan IndexedDB Blob.
7. Poppins dan Font Awesome masih memakai CDN.

## Akun pengujian

| Peran/Jenjang | Email | Kata Sandi | MFA demo |
| --- | --- | --- | --- |
| SMA/SMK | `sma@talentanduga.id` | `Talenta123` | — |
| S1 | `s1@talentanduga.id` | `Talenta123` | — |
| S2 | `s2@talentanduga.id` | `Talenta123` | — |
| S3 | `s3@talentanduga.id` | `Talenta123` | — |
| Operator | `operator@talentanduga.id` | `Talenta123` | `246810` |
| Administrator | `admin@talentanduga.id` | `Talenta123` | `246810` |
| Administrator Utama | `utama@talentanduga.id` | `Talenta123` | `246810` |

Kode verifikasi kontak pendaftaran lama/demo: `135790`. Flow perubahan kontak dan pemulihan password v9 menghasilkan token sementara sendiri.

## Penyimpanan v9

- Database: `talenta_nduga_db_v9`
- Sesi: `talenta_nduga_session_v9`
- Login guard: `talenta_nduga_login_guard_v9`
- File/Blob IndexedDB: `talenta_nduga_files_v1`

## Peningkatan audit v9

- pendidikan sebagai sumber akademik utama pada workflow;
- edit/hapus/set-primary riwayat pendidikan;
- re-verification email/HP;
- master data CRUD;
- data quality / duplicate checker;
- verification snapshot;
- SLA realtime dan claim queue;
- Inbox Kontak Admin/Super Admin;
- source resmi beasiswa + scheduler prototype;
- reminder preset/custom + run history;
- CV publik `#/cv/{slug}`;
- staff notification center;
- global search lebih data-driven dan role-aware;
- traffic aggregate berasal dari event aktual prototype;
- settings terhubung ke runtime;
- consent metadata + privacy request workflow;
- password reset demo + account session management;
- Log Aktivitas aktif bersifat append-only.

Lihat `AUDIT-LAPORAN-v9.md` dan `QA-RESULTS.txt` untuk rincian.

## Batasan production

v9 tetap frontend prototype. Jangan menggunakan autentikasi, password, MFA, RBAC, file storage, audit storage, scheduler, atau notification delivery frontend ini sebagai kontrol keamanan production.

Production tetap membutuhkan Laravel + MySQL, server-side authorization, hashing password, MFA/OTP nyata, private object storage, signed access, MIME/checksum/malware validation, queue/scheduler/provider, backup/restore, monitoring, security testing, dan privacy/legal sign-off.
