# Catatan Implementasi Talenta Nduga v4

## Data pendidikan

Profil pengguna dipisahkan menurut jenjang SMA/SMK, S1, S2, dan S3. Kelengkapan profil dihitung dari field wajib sesuai jenjang. Submit verifikasi memerlukan 100% field wajib serta dokumen minimum yang relevan.

- SMA/SMK: sekolah, NPSN, jurusan/peminatan, NISN, kelas, tahun masuk, perkiraan lulus, status, kota/provinsi sekolah.
- S1: kampus, fakultas, program studi, NIM, semester, tahun masuk, target lulus, status, kota/provinsi kampus.
- S2: data S2 + riwayat S1 + konsentrasi/tesis/pembimbing + pembiayaan/beasiswa.
- S3: data S3 + riwayat S1/S2 + konsentrasi, bidang riset, topik, disertasi, promotor, progres riset, publikasi, konferensi, ORCID/Google Scholar.

## Hak akses menu Pelajar & Mahasiswa

Operator hanya melihat data dalam scope penugasan. Administrator melihat seluruh akun pendidikan yang dikelola dan dapat mengelola status akun. Administrator Utama dapat melakukan governance lintas sistem. Semua ekspor tetap mengikuti izin `exportPermissions` dan mewajibkan tujuan penggunaan.

## Ekspor

Ekspor Pelajar & Mahasiswa disusun per jenjang. File PDF dan Excel memiliki watermark, metadata aktor, tujuan, waktu, jumlah data, dan meninggalkan audit event.

## Tema dan navbar

Dashboard memiliki mode terang/gelap yang persisten. Navbar memiliki pencarian global, notifikasi unread, toggle tema, dan menu akun. Tidak ada framework atau CDN runtime tambahan agar tetap ringan.
