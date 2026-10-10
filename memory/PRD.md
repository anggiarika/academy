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
- 2026-10 iteration_2 (all passed): Kelola Akun (/api/users), Upgrade Paket (WA offer + switch 4x/12x on unpaid invoice), Laporan Bulanan (/api/reports/monthly + share), Bukti Transfer (Emergent Object Storage, /api/invoices/{id}/receipt, /api/files/{path}).
- 2026-10 iteration_3 (all passed): Ekspor PDF laporan (expo-print/sharing), rekap kehadiran per siswa + WA ke orang tua (/api/students/{id}/attendance), ganti password (/api/auth/change-password), pengingat tagihan >=3 hari (/api/invoices/{id}/remind).
- 2026-10 iteration_4 (all passed): Tren pemasukan 6 bulan (/api/reports/trend), Presensi QR (kartu QR siswa + scan expo-camera di kelas), reminder massal antrean WA, Kelas Hari Ini di Beranda (berdasarkan teks jadwal).
- 2026-10: Riwayat Pembayaran di halaman siswa (GET /api/invoices?student_id=): total lunas/belum + daftar tagihan yang bisa ditekan.
- 2026-10 iteration_5 (all passed): Cetak Kartu QR per kelas (src/pdf.ts, qrcode SVG → PDF/print), Tanda Terima WA otomatis setelah Tandai Lunas + tombol kirim ulang di tagihan lunas.
- 2026-10 iteration_6 (all passed): Sign-up mandiri (/api/auth/register, selalu role guru; akun keuangan via Kelola Akun), hapus akun sendiri (DELETE /api/auth/me, App Store), agregasi jumlah siswa per kelas. Deployment check: store-ready.
- 2026-10: Logo & Nama Lembaga (/api/settings + upload logo ke object storage). Dipakai di kartu QR PDF, header laporan PDF, dan pesan tanda terima WA. Guru bisa membaca file logo; file lain tetap khusus keuangan. Fix: token auth dimuat dari secure storage saat reload halaman (request() auto loadToken).
- 2026-10 iterations 8-10 (all passed): pilihan peran (Guru/Keuangan) di sign-up, tombol Tambah Siswa di Beranda, pembayaran awal inline di form siswa (tagihan otomatis, kredit langsung jika sudah dibayar), fix bug input orang tua (prefill sekali + form dirty + functional setState, race jaringan lambat), fix toast GO_BACK saat deep link.

## Backlog
- P2: Pengingat otomatis terjadwal, dashboard tren pemasukan, absensi via QR
