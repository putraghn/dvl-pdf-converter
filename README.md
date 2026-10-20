# PDF Tools — Internal

Website internal untuk mengelola file PDF:

- **Gabung (merge)** — gabung beberapa PDF jadi satu
- **Pisah (split)** — ambil halaman tertentu
- **Kompres (compress)** — perkecil ukuran via Ghostscript
- **PDF → JPG** — ubah tiap halaman jadi gambar (banyak halaman dikemas ZIP)
- **Gambar → PDF** — gabung JPG/PNG jadi satu PDF

Tanpa login — ditujukan untuk pemakaian di jaringan internal perusahaan. File diproses di server dan tidak disimpan permanen.

## Arsitektur

```
Browser (React + Vite + Tailwind)
   │  POST multipart/form-data
   ▼
nginx (web)  ──proxy /api──►  Express API (server)
                                 ├─ pdf-lib        → merge, split, gambar→PDF
                                 ├─ Ghostscript    → compress, PDF→JPG
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

## Privasi data

**File yang diunggah tidak disimpan permanen.** Tidak ada database, tidak ada folder upload persisten, dan tidak ada data dokumen yang ditulis ke storage jangka panjang. File hanya ada selama proses berlangsung lalu langsung dibuang.

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

Tidak ada autentikasi. Deploy **hanya di jaringan internal** atau di balik reverse proxy / VPN perusahaan. Backend sudah memakai Helmet, CORS, dan rate limiting (60 req/menit per IP) sebagai pengaman dasar.
