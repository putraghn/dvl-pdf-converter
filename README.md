# PDF Tools — Internal

Website internal untuk mengelola file PDF:

- **Gabung (merge)** — gabung beberapa PDF jadi satu
- **Pisah (split)** — ambil halaman tertentu
- **Kompres (compress)** — perkecil ukuran via Ghostscript
- **PDF → JPG** — ubah tiap halaman jadi gambar (banyak halaman dikemas ZIP)
- **Gambar → PDF** — gabung JPG/PNG jadi satu PDF
- **Proteksi (protect)** — tambah password agar PDF hanya bisa dibuka dengan password

Secara default tanpa login, untuk pemakaian di jaringan internal perusahaan. Opsional: **login SSO Microsoft Entra dan laporan aktivitas** (lihat bagian "Login SSO dan laporan aktivitas"). File diproses di server dan isinya tidak disimpan.

## Arsitektur

```
Browser (React + Vite + Tailwind)
   │  POST multipart/form-data
   ▼
nginx (web)  ──proxy /api──►  Express API (server)
                                 ├─ pdf-lib        → merge, split, gambar→PDF
                                 ├─ Ghostscript    → compress, PDF→JPG, proteksi password
                                 └─ archiver       → ZIP untuk PDF→JPG multi-halaman
```

- **server/** — Express API. Merge & split pakai `pdf-lib`; compress pakai Ghostscript.
- **web/** — Frontend React. Di-build jadi file statis, disajikan nginx, dan nginx mem-proxy `/api` ke backend.

## Menjalankan dengan Docker (rekomendasi)

Dari folder root proyek:

```bash
docker compose up --build
```

Lalu buka **http://localhost:8080**

Image backend sudah menyertakan Ghostscript, jadi fitur compress langsung jalan.

---

## Deploy di VM Ubuntu / Linux (produksi)

> Aplikasi ini adalah **Linux container**. Jalankan di host Linux (mis. VM Ubuntu
> dengan Docker Engine). **Jangan** jalankan dengan Docker dalam *Windows
> containers mode* — image berbasis Debian/Alpine tidak kompatibel di sana.

### 1. Prasyarat di VM

- Docker Engine + plugin Compose v2 (`docker compose version` harus bekerja).
- Port `8080` terbuka di firewall internal (atau sesuaikan di `docker-compose.yml`).

### 2. Pindahkan kode ke VM

Gunakan `git clone` (disarankan — `.gitattributes` menjaga line ending tetap LF),
atau `scp`/rsync folder proyek. Jika mengopi dari Windows, pastikan file teks
tetap LF; `.gitattributes` menangani ini otomatis saat lewat git.

```bash
git clone <repo-url> pdf-tools && cd pdf-tools
```

### 3. Build & jalankan (detached)

```bash
docker compose up -d --build
```

Compose akan: build image server (termasuk Ghostscript) & web, menunggu server
**healthy**, lalu menjalankan nginx.

### 4. Verifikasi

```bash
docker compose ps                 # kedua service "running", server "healthy"

# Web (via nginx) harus 200:
curl -s -o /dev/null -w "web: %{http_code}\n" http://localhost:8080/

# API health (dari dalam container server — /health tidak diproxy ke publik):
docker compose exec server node -e "fetch('http://127.0.0.1:4000/health').then(r=>r.text()).then(t=>console.log('api:',t))"

docker compose logs -f server     # pantau log (Ctrl+C untuk keluar)
```

Buka `http://<IP-VM>:8080` dari jaringan internal.

### 5. Operasional

```bash
docker compose down               # stop & hapus container
docker compose up -d --build      # update setelah perubahan kode
docker compose restart server     # restart satu service
docker image prune -f             # bersihkan image lama (opsional)
```

### Catatan produksi

- **TLS/HTTPS**: terminasi di reverse proxy perusahaan (nginx/Traefik/LB) di
  depan port 8080. Kontainer `web` hanya melayani HTTP internal.
- **Hardening & resource limits** sudah diset di `docker-compose.yml`
  (read-only FS, cap drop, `no-new-privileges`, batas CPU/RAM/PID). Sesuaikan
  angka dengan kapasitas VM bila perlu.
- **`TRUST_PROXY`** sudah `1` (nginx satu hop di depan API). Jika menambah LB di
  depan nginx, naikkan sesuai jumlah hop.
- Lihat `SECURITY.md` untuk detail kontrol keamanan & panduan pengujian.

## Menjalankan secara lokal (tanpa Docker)

### Backend
```bash
cd server
cp .env.example .env
npm install
npm run dev
```
API berjalan di http://localhost:4000

> Fitur **compress** butuh Ghostscript terpasang di mesin (perintah `gs`).
> - Linux: `apt-get install ghostscript`
> - macOS: `brew install ghostscript`
> - Windows: unduh dari https://ghostscript.com/releases/ (pastikan `gs`/`gswin64c` ada di PATH)

### Frontend
```bash
cd web
cp .env.example .env
npm install
npm run dev
```
Web berjalan di http://localhost:5173 (memanggil API di `VITE_API_BASE`).

## API

| Method | Endpoint              | Body (multipart)                            | Keterangan                                       |
|--------|-----------------------|---------------------------------------------|--------------------------------------------------|
| POST   | `/api/pdf/merge`      | `files` (≥2 PDF)                            | Gabung beberapa PDF sesuai urutan                |
| POST   | `/api/pdf/split`      | `file` (PDF), `ranges` mis. `1-3,5`         | Ambil halaman tertentu ke PDF baru               |
| POST   | `/api/pdf/compress`   | `file` (PDF), `level` screen/ebook/printer  | Kompres via Ghostscript                          |
| POST   | `/api/pdf/to-images`  | `file` (PDF), `dpi` 72–300 (default 150)    | Tiap halaman → JPG. 1 halaman = JPG, >1 = ZIP    |
| POST   | `/api/pdf/from-images`| `files` (≥1 JPG/PNG)                        | Gabung gambar jadi satu PDF (1 gambar/halaman)   |
| POST   | `/api/pdf/protect`    | `file` (PDF), `password`                    | Tambah user password (enkripsi via Ghostscript)  |
| GET    | `/health`             | —                                           | Health check                                     |

Respons saat sukses:
- `merge`, `split`, `compress`, `from-images` → `application/pdf`
- `to-images` → `image/jpeg` (1 halaman) atau `application/zip` (banyak halaman)

Saat gagal, semua endpoint mengembalikan JSON `{ "error": "..." }`.

## Konfigurasi

Lihat `server/.env.example` dan `web/.env.example`. Yang umum diubah:

- `MAX_FILE_MB` — batas ukuran per file (default 50 MB). Jika diubah besar, sesuaikan juga `client_max_body_size` di `web/nginx.conf`.
- `MAX_FILES` — maksimum jumlah file untuk merge (default 20).
- `TRUST_PROXY` — cara backend menentukan IP klien (dipakai rate limiting) di balik reverse proxy. Kosong/`false` = tidak percaya proxy (saat diekspos langsung). Angka `N` = jumlah hop proxy tepercaya di depan (set `1` untuk satu nginx/LB). Pada `docker compose`, sudah diset `1` karena backend ada di belakang container `web`. Jangan pakai `true` (bisa dipalsukan lewat `X-Forwarded-For`).
- `GS_TIMEOUT_SEC` — batas waktu satu proses Ghostscript sebelum dihentikan paksa (default 60 detik; jawaban 422 bila terlampaui).
- `GS_MAX_CONCURRENT` — jumlah proses Ghostscript yang boleh berjalan bersamaan (default 2).
- `GS_MAX_QUEUE` — jumlah permintaan yang boleh menunggu giliran (default 5). Permintaan di antrean menyimpan file unggahannya di memori, jadi jaga angkanya kecil dibanding RAM container. Kelebihannya dijawab 503.

## Login SSO dan laporan aktivitas (opsional)

Mode ini mewajibkan login dengan akun Microsoft Entra perusahaan dan mencatat **siapa melakukan apa** untuk laporan. Dipasang sebagai lapisan di atas deployment yang ada, jadi mode default tidak berubah.

**Cara kerja**: nginx memeriksa setiap request lewat [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/). Belum login, pengguna dialihkan ke Microsoft. Setelah login, nginx meneruskan identitas terverifikasi ke API, yang mencatat aktivitas ke SQLite dan menyediakan tab **Laporan** untuk admin.

### Syarat
- **Nama host HTTPS** (mis. `pdf.namaperusahaan.co.id`). Entra hanya mengizinkan redirect URI `http://` untuk `localhost`, jadi `http://<IP-VM>:8080` tidak bisa dipakai untuk login. Sertifikat TLS biasanya dipasang di reverse proxy perusahaan di depan VM.
- **Admin Entra** yang bisa membuat App Registration.

### 1. Buat App Registration di Entra (dikerjakan admin tenant)
1. *Microsoft Entra admin center, App registrations, New registration*. Nama bebas (mis. `PDF Tools`). *Supported account types*: **Accounts in this organizational directory only** (single tenant).
2. *Redirect URI*: platform **Web**, nilai `https://<PUBLIC_HOST>/oauth2/callback`.
3. Di *Overview* catat **Application (client) ID** dan **Directory (tenant) ID**.
4. *Certificates & secrets, New client secret*. Salin **Value** (hanya tampil sekali) dan **catat tanggal kedaluwarsanya**.
5. Izin API: cukup bawaan (`User.Read` delegated). Tidak perlu izin tambahan.
6. Batasi siapa yang boleh masuk: *Enterprise applications*, pilih aplikasinya, *Properties*, **Assignment required = Yes**, lalu *Users and groups* untuk menambah pengguna atau grup yang diizinkan.

### 2. Siapkan konfigurasi di VM
```bash
cp .env.sso.example .env.sso     # berkas ini sudah di-.gitignore, jangan di-commit
openssl rand -base64 32 | tr -- '+/' '-_'   # hasilnya untuk OAUTH2_COOKIE_SECRET
nano .env.sso                    # isi PUBLIC_HOST, ENTRA_*, OAUTH2_COOKIE_SECRET, REPORT_ADMINS
```
`REPORT_ADMINS` berisi sign-in name (UPN) yang boleh membuka tab Laporan, dipisah koma.

### 3. Jalankan
```bash
docker compose --env-file .env.sso -f docker-compose.yml -f docker-compose.sso.yml up -d --build
docker compose --env-file .env.sso -f docker-compose.yml -f docker-compose.sso.yml ps
```

### 4. Uji penerimaan (wajib sebelum dipakai)
1. Buka `https://<PUBLIC_HOST>`: harus diarahkan ke halaman login Microsoft, lalu kembali ke aplikasi.
2. Di kanan atas tampil "Masuk sebagai &lt;email&gt;".
3. Lakukan satu operasi (mis. Kompres), lalu masuk sebagai akun di `REPORT_ADMINS`: tab **Laporan** harus menampilkan aktivitas tadi. Akun biasa tidak melihat tab itu.
4. Sesi habis (8 jam): aksi berikutnya menampilkan pesan "Sesi berakhir", muat ulang untuk login lagi.

### Log aktivitas
- Yang dicatat: waktu, pengguna, aksi, hasil, jumlah/ukuran file, durasi, IP. **Tidak** isi file, nama file, atau password.
- Disimpan **45 hari** lalu dihapus otomatis (`AUDIT_RETENTION_DAYS`), di volume Docker `audit-data`.
- Laporan dapat difilter (tanggal, pengguna, aksi) dan diunduh sebagai CSV.

### Perawatan
- **Client secret kedaluwarsa**: perbarui di Entra dan `.env.sso`, lalu `docker compose ... up -d`. Bila lewat tanggalnya, login berhenti.
- Ganti `OAUTH2_COOKIE_SECRET` akan membuat semua pengguna login ulang.
- Image `oauth2-proxy` ikut dalam rutinitas pembaruan (versi dipin di `docker-compose.sso.yml`).
- Jika `TRUST_PROXY` salah (jumlah proxy di depan API), laporan mencatat IP proxy, bukan IP pengguna.

### Masalah umum
| Gejala | Penyebab biasa |
|--------|----------------|
| Microsoft menampilkan `AADSTS50011` (redirect URI tidak cocok) | Redirect URI di Entra harus persis `https://<PUBLIC_HOST>/oauth2/callback` |
| Berputar kembali ke halaman login | Cookie `Secure` tidak tersimpan karena situs diakses lewat `http://`; gunakan HTTPS |
| `AADSTS50105` (pengguna tidak ditugaskan) | Pengguna belum ditambahkan di *Users and groups* pada Enterprise Application |
| 502 dari nginx | Container `server` atau `oauth2-proxy` belum jalan; cek `docker compose ... logs` |

## Privasi data

**Isi file yang diunggah tidak disimpan permanen.** Tidak ada folder upload persisten dan tidak ada data dokumen yang ditulis ke storage jangka panjang. File hanya ada selama proses berlangsung lalu langsung dibuang. Pada mode default tidak ada database. Pada mode SSO, yang disimpan hanyalah **log aktivitas** (metadata, 45 hari), seperti dijelaskan di atas.

Cara penanganan tiap fitur:

| Fitur          | Disk?            | Kapan dibersihkan                          |
|----------------|------------------|--------------------------------------------|
| Gabung (merge) | Tidak — di RAM   | Otomatis saat request selesai              |
| Pisah (split)  | Tidak — di RAM   | Otomatis saat request selesai              |
| Gambar → PDF   | Tidak — di RAM   | Otomatis saat request selesai              |
| Kompres        | File temp sesaat | Dihapus di blok `finally` (apa pun hasilnya) |
| PDF → JPG      | File temp sesaat | Dihapus setelah file selesai dikirim       |

Detail teknis:

- **Pemrosesan di memori.** Merge, split, dan gambar→PDF memakai `multer.memoryStorage()` — file ada sebagai buffer di RAM, tidak pernah menyentuh disk, dan dibersihkan garbage collector saat request selesai.
- **File sementara yang pasti terhapus.** Kompres dan PDF→JPG membutuhkan Ghostscript yang bekerja pada file, sehingga memakai folder temporer acak (`mkdtemp`) di direktori temp OS. Folder ini dihapus di blok `finally`, jadi tidak ada sisa file meski terjadi error atau input rusak.
- **Nama acak.** File dan folder sementara memakai nama acak (`randomUUID`), tidak bisa ditebak selama proses singkat berlangsung.
- **Container bersifat ephemeral.** Pada Docker, file temp hanya ada di filesystem container dan hilang total saat container di-restart.

### Logging

Aplikasi mencatat **metadata request** saja melalui `morgan` (method, path, status, ukuran byte, durasi) — contoh: `POST /api/pdf/compress 200 5120 - 369ms`. Log ini **tidak memuat isi dokumen maupun nama file asli**. Jika kebijakan internal menghendaki, logging bisa dimatikan dengan menghapus baris `app.use(morgan(...))` di `server/src/index.js`.

## Catatan keamanan

Mode default tidak memakai autentikasi: deploy **hanya di jaringan internal** atau di balik reverse proxy / VPN perusahaan, atau gunakan mode SSO di atas. Backend sudah memakai Helmet, CORS, dan rate limiting (60 req/menit per IP) sebagai pengaman dasar. Detail lengkap ada di `SECURITY.md`.
