# 📋 Sistem Absensi Mahasiswa — Multi Kelas

Aplikasi web absensi mahasiswa berbasis **Google Spreadsheet** (tanpa server sendiri),
siap di-hosting gratis di **GitHub Pages**.

![Stack](https://img.shields.io/badge/Stack-HTML%20%2B%20CSS%20%2B%20JS-yellow) ![DB](https://img.shields.io/badge/DB-Google%20Sheets%20%2B%20Apps%20Script-green) ![Host](https://img.shields.io/badge/Host-GitHub%20Pages-blue)

---

## ✨ Fitur

### 3 Halaman Utama

| Halaman | File | Fungsi |
|---|---|---|
| **Absen** | `index.html` | Form presensi mahasiswa |
| **Admin** | `admin.html` | Kelola kelas, sesi, mahasiswa & akun |
| **Data** | `data.html` | Lihat, cari, filter, cetak data per pertemuan |

### Halaman Absen
- Pilih **kelas** — tiap kelas punya jam buka/tutup sendiri
- Countdown **waktu buka & tutup** absen secara live
- 4 status: **Hadir**, **Sakit**, **Izin**, **Dispen** — lampiran foto/PDF bukti
  **opsional untuk semua status**; menjadi wajib hanya bila admin mengaktifkan
  aturan "wajib bukti" di pengaturan kelas. Alasan tetap wajib untuk Sakit/Izin/Dispen
- Verifikasi NIM otomatis terhadap data mahasiswa
- Upload foto langsung dari kamera/galeri atau PDF — otomatis dikompres
- Anti duplikat: satu NIM hanya bisa absen sekali per pertemuan

### Halaman Admin
- **Kelas & Sesi**: tambah/rename/hapus kelas, ubah nama mata kuliah,
  set jam buka–tutup, nomor pertemuan **bisa diganti fleksibel**
  (cth: "Pertemuan 1 — UTS"), mode sesi (otomatis/manual/tutup), aturan bukti wajib
- **Mahasiswa**: tambah satu-satu, tambah massal (tempel daftar), cari, edit nama, hapus
- **Akun Admin**: tambah akun, ganti password, hapus akun (multi-admin)
- **Pengaturan**: nama aplikasi, URL Apps Script, sinkronisasi, hapus log

### Halaman Data
- Cari **NIM / Nama** secara real-time
- Filter status: **Semua · Hadir · Tidak Hadir (Sakit+Izin+Dispen) · Sakit · Izin · Dispen**
- Statistik ringkas (total, hadir, tidak hadir, persentase)
- **Cetak** (→ PDF/print) dengan format rapi A4 landscape
- **Unduh CSV** untuk Excel
- Lihat bukti/foto dokumentasi tiap mahasiswa

### Multi-Kelas 📚
Pakai satu aplikasi untuk banyak kelas: tiap kelas punya nama, mata kuliah,
daftar mahasiswa, jam sesi, dan pertemuan masing-masing. Bebas rename kapan saja.

---

## 🚀 Cara Pasang (Setup)

### Langkah 1 — Buat Database Spreadsheet + Backend

1. Buka **https://sheets.new** → buat spreadsheet baru (cth: "Absensi Mahasiswa")
2. Menu **Ekstensi → Apps Script**
3. Hapus isi `Code.gs` bawaan, lalu tempel **seluruh isi** file
   [`apps-script/Code.gs`](apps-script/Code.gs) dari project ini → klik **Save** (💾)
4. Klik **Deploy → New deployment → Web app**
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
   - Klik **Deploy**, lalu **izinkan akses** pada layar persetujuan Google
   - (Bila muncul "advanced" → klik *Go to ... (unsafe)* → **Allow**)
5. **Salin URL** yang berakhiran `/exec`

> Sheet `CONFIG`, `MASTER`, dan `ABSENSI` dibuat otomatis
> saat pertama kali data masuk — tidak perlu dibuat manual.

### Langkah 2 — Jalankan Lokal (menguji)

Buka folder project lalu jalankan server sederhana:

```bash
python -m http.server 8080
```

Buka **http://localhost:8080/index.html**. Atau cukup buka `index.html` langsung
di browser — semua fungsi jalan tanpa server (data disimpan via Apps Script).

### Langkah 3 — Konfigurasi Awal di Panel Admin

1. Buka halaman **Admin** (`admin.html`)
2. Login default: **username: `admin` · password: `admin123`**
   → **segera ganti password** di menu *Akun Admin*!
3. Di menu **Pengaturan**: tempel URL Apps Script `/exec` tadi → **Simpan**
4. Buat **kelas pertama** (bagian *Kelas & Sesi*): nama kelas, jam, pertemuan
5. Tambahkan daftar **mahasiswa** (tambahan massal didukung)
6. Tambahkan **admin baru** bila perlu, lalu hapus/ubah akun default
7. Cek halaman **Data** — data absen bisa dicetak & difilter

### Langkah 4 — Hosting di GitHub Pages 🌐

1. Buat repository baru di GitHub (cth: `absensi-mahasiswa`)
2. Upload **semua file** project ini ke repository tersebut
   (kecuali folder `apps-script` — file `Code.gs` hanya untuk ditempel di Apps Script)
3. Buka **Settings → Pages**
4. **Source:** `Deploy from a branch` → pilih `main` → folder `/ (root)` → **Save**
5. Tunggu 1–2 menit → website live di
   `https://<username>.github.io/absensi-mahasiswa/`
6. Buka dari HP/pc mana pun — kirim link ke mahasiswa 💚

---

## 🧠 Cara Kerja

```
Mahasiswa / Admin (browser)          Google Cloud                Kamu (Google Account)
┌─────────────────────────┐     ┌──────────────┐     ┌───────────────────────┐
│ index.html / admin.html │     │  Apps Script │     │  Google Spreadsheet   │
│ data.html               │ ──► │  (Web App)   │ ──► │  CONFIG · MASTER ·    │
│ shared.js (cache lokal) │ ◄── │  JSONP/JSON  │ ◄── │  ABSENSI + Drive (foto)│
└─────────────────────────┘     └──────────────┘     └───────────────────────┘
```

- **Baca data** → `GET ?action=get_config|get_master|get_logs` (JSONP)
- **Tulis data** → `POST` (absen, simpan config, simpan master, hapus log)
- **Foto bukti** → dikompres di browser, dikirim base64, Apps Script
  menyimpannya ke **Google Drive** (folder otomatis) lalu menautkan URL-nya
  ke spreadsheet
- **Sinkronisasi** → otomatis tiap **45 detik**; cache `localStorage` membuat
  halaman tetap cepat walau koneksi lambat

---

## ⚠️ Catatan Keamanan

Sesuai arsitektur tanpa server, beberapa hal perlu diketahui:

- Password admin disimpan sebagai **hash SHA-256** (bukan plaintext)
- Login admin hanya sebagai *pintu UI* — orang yang tahu URL spreadsheet
  secara teknis bisa mengakses datanya. **Jangan bagikan spreadsheet** ke mahasiswa.
- Gunakan password admin yang kuat & berbeda dari hal lain.
- URL Apps Script bersifat publik (dibutuhkan agar mahasiswa bisa absen).
  Untuk kebutuhan akademik seperti ini sangat umum & layak.

---

## 🛠 Troubleshooting

| Masalah | Solusi |
|---|---|
| "URL Apps Script belum diatur" | Tempel URL `/exec` di Admin → Pengaturan → Simpan |
| Data tidak muncul | Klik **Sinkron Sekarang**; pastikan deployment Apps Script **versi terbaru** (Deploy → Manage deployments → ✏️ → Version: New) |
| Foto tidak tampil | Foto >1,2 MB dilewati otomatis; gunakan file lebih ringan |
| Ganti kelas lama | Cukup **rename kelas** di Admin — semua data ikut kelas |
| Akun admin hilang | Reset spreadsheet: hapus isi sheet `CONFIG` → login ulang dengan `admin/admin123` (akan dibuat ulang) |

---

## 📂 Struktur Project

```
absensi-v2/
├── index.html      → halaman absen mahasiswa
├── index.js        → logika halaman absen
├── admin.html      → panel admin
├── admin.js        → logika panel admin
├── data.html       → halaman data (cetak, cari, filter)
├── data.js         → logika halaman data
├── shared.js       → logika bersama (sync, sesi, upload, auth)
├── style.css       → design system (modern, responsif)
└── apps-script/
    └── Code.gs     → backend Google Apps Script (tempel ke spreadsheet)
```