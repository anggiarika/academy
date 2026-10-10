# PRD – Presensi & Kredit Siswa

## Original problem statement
Aplikasi mobile presensi siswa: guru mengisi daftar hadir, kredit siswa berkurang 1 tiap pertemuan. Paket Gymnastic 4x Rp350.000 / 12x Rp900.000; English 4x Rp495.000 / 12x Rp1.335.000. Saat kredit habis, keuangan membuat tagihan ke orang tua, update status bayar & tambah kredit. Database siswa, 8 kelas.
Tambahan: izin via keuangan/admin, 1 kuota per 4 pertemuan, 3 kuota untuk paket 12; izin → kelas pengganti; pengganti tidak diambil → hangus.
Pilihan user: login email+password per akun (Guru & Keuangan), tagihan di aplikasi + kirim via WhatsApp, contoh kelas Gymnastic A-D & English A-D, kredit terpisah per program, tampilan bersih & cerah.

## Architecture
- Backend FastAPI (`server.py`, `core.py`, `models.py`, `routers/auth|school|finance.py`), MongoDB, JWT (PyJWT + pwdlib argon2), role guard.
- Frontend Expo Router: login, tabs (Beranda, Presensi, Siswa, Tagihan—keuangan only), class/[id] attendance, student/[id], student/form, invoice/new, invoice/[id].

## Business rules (implemented 2026-06)
- Hadir/Alpha: −1 kredit. Izin (dicatat keuangan): −1 kuota izin, −1 kredit, +1 pengganti. Pengganti: −1 kuota pengganti. Simpan ulang tidak mengurangi dua kali.
- Bayar tagihan: +kredit paket, kuota izin reset (1/3), sisa pengganti hangus.
- Dashboard: siswa, kredit tipis/habis, tagihan belum bayar, daftar perlu ditagih.

## Status
- All backend (28 tests) & frontend flows passed (iteration_1).

## Backlog
- P1: Manajemen akun guru oleh admin (tambah/hapus user)
- P1: Laporan keuangan bulanan / ekspor
- P2: Bukti transfer upload, pengingat otomatis, rekap kehadiran per siswa
