# Security Overview — PDF Tools Internal

Dokumen ini untuk tim Information Security sebagai dasar security review / assessment aplikasi **PDF Tools Internal**. Berisi arsitektur, alur data, kontrol keamanan yang sudah diterapkan, batasan yang diketahui, dan checklist pengujian.

> Ringkasan: aplikasi internal tanpa autentikasi untuk mengelola PDF (merge, split, compress, PDF→JPG, gambar→PDF). Tidak ada database, tidak ada penyimpanan permanen. Dimaksudkan **hanya untuk jaringan internal**.

---

## 1. Arsitektur & komponen

```
Browser (SPA React, file statis)
   │  HTTPS (via reverse proxy perusahaan — lihat §7)
   ▼
nginx (container "web")  ──proxy /api/*──►  Express API (container "server")
                                               ├─ pdf-lib     : merge, split, gambar→PDF (murni JS, in-memory)
                                               ├─ Ghostscript : compress, PDF→JPG (child process)
                                               └─ archiver    : ZIP untuk PDF→JPG multi-halaman
```

| Komponen   | Teknologi                         | Catatan                                             |
|------------|-----------------------------------|-----------------------------------------------------|
| Frontend   | React + Vite (di-build statis)    | Disajikan nginx. Tidak ada Node runtime di produksi |
| Backend    | Node.js 20 + Express              | Satu-satunya layanan dengan logika server           |
| Konversi   | Ghostscript (dari image Debian)   | Dipanggil via `spawn`, bukan shell                  |
| Runtime    | Docker (Linux)                    | Backend berjalan sebagai user non-root `node`       |

---

## 2. Alur & penanganan data

- **Tidak ada database. Tidak ada folder upload persisten. Tidak ada penyimpanan jangka panjang.**
- Merge / split / gambar→PDF: file diproses sebagai buffer **di memori** (`multer.memoryStorage()`), tidak pernah ditulis ke disk.
- Compress / PDF→JPG: file ditulis ke **direktori temporer acak** (`mkdtemp`), diproses Ghostscript, lalu folder **dihapus di blok `finally`** (termasuk saat error) dan setelah ZIP selesai di-stream.
- Nama file/folder sementara memakai `randomUUID()`.
- Pada Docker, file temp hanya ada di filesystem container yang ephemeral.

Lihat juga bagian "Privasi data" di `README.md`.

---

## 3. Kontrol keamanan yang sudah diterapkan

| Area                     | Kontrol                                                                 |
|--------------------------|-------------------------------------------------------------------------|
| HTTP security headers    | `helmet()` (termasuk mematikan `X-Powered-By`)                          |
| CORS                     | Whitelist origin via `CORS_ORIGIN`; hanya method `GET`/`POST`           |
| Rate limiting            | `express-rate-limit`: 60 request/menit per IP klien. IP di-resolve via `trust proxy` yang dikonfigurasi (`TRUST_PROXY`), bukan `true` yang mudah dipalsukan |
| Batas ukuran upload      | `MAX_FILE_MB` (default 50 MB/file); nginx `client_max_body_size 60m`    |
| Batas jumlah file        | `MAX_FILES` (default 20) per request                                    |
| Validasi tipe file       | Dua lapis: (1) `multer` fileFilter mimetype/ekstensi, (2) **cek magic-bytes** signature konten (`%PDF`, JPEG `FF D8 FF`, PNG) — file yang mengaku PDF/gambar tapi kontennya bukan akan ditolak 400 |
| Validasi input           | `ranges` divalidasi regex + bounds; `dpi` di-clamp 72–300; `level` whitelist |
| Command injection        | Ghostscript dipanggil `spawn(bin, argsArray)` — **tanpa shell**, tidak ada string interpolation |
| Ghostscript sandbox      | `-dSAFER` aktif di semua pemanggilan (membatasi akses file & operasi berbahaya) |
| Path traversal           | Nama file output ditentukan server (`randomUUID`), bukan dari user      |
| HTTP header injection    | `Content-Disposition` disanitasi (strip CR/LF, quote, backslash) + `filename*` RFC 6266 ter-encode |
| PDF rusak/terenkripsi     | Ditangani, mengembalikan HTTP 400 yang rapi (bukan crash)              |
| Error handling           | Handler terpusat; detail stack tidak dibocorkan ke client (hanya pesan) |
| Container privilege      | Backend berjalan sebagai user `node` (non-root)                         |

---

## 4. Hasil audit dependency

Dijalankan dengan `npm audit`:

- **Backend (runtime produksi): 0 vulnerability.**
- **Frontend: temuan hanya di `devDependencies`** (toolchain Vite/Tailwind: `esbuild`, `braces`, `postcss-selector-parser`).
  - Dependency ini **tidak ikut ke produksi**: frontend di-build jadi file statis dan disajikan nginx; image produksi tidak mengandung Node, Vite, maupun paket dev tersebut.
  - Advisory `esbuild` (GHSA-67mh-4wv8-2f99) hanya memengaruhi **dev server**, bukan artefak build. Tidak ada dev server di produksi.

Rekomendasi: jalankan `npm audit` secara berkala dan perbarui toolchain pada siklus maintenance (bukan blocker untuk produksi).

---

## 5. Permukaan serang (attack surface)

Endpoint publik (semua di balik rate limiter):

| Method | Path                    | Input user                              |
|--------|-------------------------|-----------------------------------------|
| GET    | `/health`               | —                                       |
| POST   | `/api/pdf/merge`        | ≥2 file PDF                             |
| POST   | `/api/pdf/split`        | 1 PDF + `ranges` (string)               |
| POST   | `/api/pdf/compress`     | 1 PDF + `level` (enum)                  |
| POST   | `/api/pdf/to-images`    | 1 PDF + `dpi` (angka)                   |
| POST   | `/api/pdf/from-images`  | ≥1 gambar JPG/PNG                       |

Titik paling sensitif = pemrosesan Ghostscript (parser dokumen native). Dimitigasi dengan `-dSAFER`, pemanggilan tanpa shell, dan isolasi container.

---

## 6. Batasan & risiko yang diketahui (disclosure jujur)

1. **Tidak ada autentikasi/otorisasi.** Siapa pun yang bisa menjangkau URL bisa memakai semua fitur. Mitigasi wajib: batasi akses di level jaringan (lihat §7).
2. **Ghostscript memproses dokumen tidak tepercaya.** Parser dokumen secara historis pernah punya CVE. Mitigasi: `-dSAFER`, container non-root, dan **menjaga versi Ghostscript tetap mutakhir** (rebuild image berkala).
3. **Potensi DoS lewat file besar/kompleks.** Dibatasi ukuran file, jumlah file, dan rate limit. Selain itu, `docker-compose.yml` kini menerapkan **resource limits** per container (server: 1 CPU / 768 MB / 256 PID; web: 0.5 CPU / 128 MB), `--no-new-privileges`, `cap_drop: ALL`, dan root filesystem `read_only` dengan tmpfs khusus untuk file temp. File PDF yang sangat kompleks tetap bisa memakan CPU dalam batas tersebut.
4. **Rate limit per-IP.** `trust proxy` dapat dikonfigurasi via `TRUST_PROXY` (default: tidak percaya proxy; `docker compose` memakai `1` untuk nginx di depan). Penting: setel sesuai jumlah hop proxy nyata — nilai terlalu permisif (`true`) memungkinkan pemalsuan IP lewat `X-Forwarded-For` untuk melewati rate limit. nginx meneruskan IP klien via `X-Forwarded-For`.
5. **Logging metadata.** `morgan` mencatat method/path/status/ukuran/durasi — **tanpa** isi atau nama file. Bisa dimatikan bila kebijakan menghendaki.

---

## 7. Rekomendasi deployment (untuk lolos review)

- [ ] Jalankan pada **host Linux** (mis. VM Ubuntu + Docker Engine). Image adalah Linux container — **bukan** Windows containers. Lihat panduan deploy di `README.md`.
- [ ] Deploy **hanya** di jaringan internal / di balik VPN atau zero-trust proxy. Jangan ekspos ke internet.
- [ ] Terminasi **TLS/HTTPS** di reverse proxy perusahaan di depan container `web`.
- [ ] Jika butuh identitas pengguna, tambahkan autentikasi di reverse proxy (mis. SSO/Entra via proxy) — aplikasi sengaja tidak menanganinya.
- [ ] Set `CORS_ORIGIN` ke origin produksi yang pasti (bukan wildcard).
- [x] Terapkan **resource limits** (CPU/memory/PID) pada container — sudah di `docker-compose.yml`. Sesuaikan angkanya dengan kapasitas host bila perlu.
- [x] Konfigurasi `trust proxy` via `TRUST_PROXY` agar rate limiting akurat — `docker compose` sudah set `1`. Sesuaikan jumlah hop bila topologi proxy berbeda (mis. ada LB tambahan di depan nginx).
- [ ] Jadwalkan **rebuild image berkala** agar Ghostscript & base image dapat patch keamanan.
- [ ] Simpan `.env` di luar version control (sudah di `.gitignore`).

---

## 8. Panduan pengujian untuk tim InfoSec

Panduan ini berisi langkah konkret untuk memverifikasi kontrol keamanan. Perintah memakai `curl` (tersedia di Linux/macOS/WSL dan Windows 10+). Ganti `$BASE` dengan URL target.

### 8.0 Setup

```bash
# Target: pakai port web (via nginx) di deployment, atau API langsung saat lokal.
export BASE="http://localhost:8080"     # Docker (web → proxy /api)
# export BASE="http://localhost:4000"   # API langsung (dev lokal)

# Siapkan sample file untuk pengujian.
# PDF VALID: "printf '%PDF...'" TIDAK cukup — pdf-lib butuh struktur lengkap.
# Cara termudah: pakai PDF nyata apa pun, atau generate dengan perintah berikut
# (butuh Node + akses ke folder server/ yang punya pdf-lib terpasang):
node -e "import('pdf-lib').then(async({PDFDocument})=>{const d=await PDFDocument.create();d.addPage();d.addPage();d.addPage();const fs=await import('node:fs');fs.writeFileSync('real.pdf',Buffer.from(await d.save()));})"
# Atau: salin sembarang PDF asli menjadi real.pdf.

printf 'this is not a pdf at all' > fake.pdf          # konten palsu, ekstensi .pdf
printf '%%PDF-1.4\nbroken body no objects\n%%EOF' > broken.pdf  # header valid, isi rusak
head -c 60000000 /dev/zero > big.pdf 2>/dev/null || fsutil file createnew big.pdf 60000000
: > empty.pdf                                         # file 0-byte
```

> Catatan Windows PowerShell: `curl` adalah alias `Invoke-WebRequest`. Jalankan `curl.exe` (dengan `.exe`) agar memakai curl asli. Untuk uji yang melibatkan nama file dengan karakter kontrol (§8.3), gunakan **bash/WSL** karena quoting PowerShell menyulitkan penyisipan CR/LF.

### 8.1 Validasi tipe file (magic-bytes)

| Uji | Perintah | Hasil diharapkan |
|-----|----------|------------------|
| PDF asli diterima | `curl.exe -s -o out.pdf -w "%{http_code}\n" -F "file=@real.pdf" -F "ranges=1" $BASE/api/pdf/split` | `200` |
| PDF palsu ditolak | `curl.exe -s -w "%{http_code}\n" -F "file=@fake.pdf" -F "ranges=1" $BASE/api/pdf/split` | `400` (signature check failed) |
| PDF rusak ditangani | `curl.exe -s -w "%{http_code}\n" -F "file=@broken.pdf" -F "ranges=1" $BASE/api/pdf/split` | `400` (bukan 500 — ditangani sebagai input buruk) |
| Gambar palsu ditolak | `curl.exe -s -w "%{http_code}\n" -F "files=@fake.pdf;type=image/png;filename=x.png" $BASE/api/pdf/from-images` | `400` |

Verifikasi: file yang mengaku PDF/gambar via mimetype+ekstensi tapi kontennya bukan, **harus** ditolak 400. PDF dengan header valid tapi struktur rusak juga harus menghasilkan 400 yang rapi, bukan 500.

### 8.2 Batas upload (ukuran & jumlah)

| Uji | Perintah | Hasil diharapkan |
|-----|----------|------------------|
| File melebihi `MAX_FILE_MB` | `curl.exe -s -w "%{http_code}\n" -F "file=@big.pdf" -F "ranges=1" $BASE/api/pdf/split` | `413` |
| File 0-byte | `curl.exe -s -w "%{http_code}\n" -F "file=@empty.pdf" -F "ranges=1" $BASE/api/pdf/split` | `400` |
| Jumlah file > `MAX_FILES` | kirim >20 field `files=@real.pdf` ke `/api/pdf/merge` | `413` |

### 8.3 HTTP header injection (via nama file)

```bash
# Nama file berisi quote, CRLF, dan upaya menyuntik header.
curl.exe -s -D - -o /dev/null \
  -F 'file=@real.pdf;filename=a"b%0d%0aSet-Cookie: pwned=1.pdf' \
  -F "ranges=1" $BASE/api/pdf/split | tr -d '\r' | grep -iE 'content-disposition|set-cookie'
```

Hasil diharapkan: header `Content-Disposition` muncul dengan nama file **ter-encode/tersanitasi** (tidak ada CR/LF mentah, tidak ada quote yang memecah), dan **tidak ada** header `Set-Cookie` yang tersuntik.

### 8.4 Input fuzzing (field form)

| Field | Nilai uji | Hasil diharapkan |
|-------|-----------|------------------|
| `ranges` | `0`, `-1`, `999999`, `abc`, `1-`, `3-1` | `400` (validasi regex + bounds) |
| `ranges` | `1-2,5` pada PDF <5 halaman | `400` (out of bounds) |
| `dpi` | `9999`, `-5`, `abc` (to-images) | `200` — nilai di-clamp ke 72–300, tidak crash |
| `level` | `foo` (compress) | `400` (enum: screen/ebook/printer) |

Contoh: `curl.exe -s -w "%{http_code}\n" -F "file=@real.pdf" -F "ranges=abc" $BASE/api/pdf/split` → `400`.

### 8.5 Rate limiting

```bash
# Kirim 70 request cepat; sebagian harus kena 429 (limit 60/menit per IP).
for i in $(seq 1 70); do curl.exe -s -o /dev/null -w "%{http_code} " $BASE/api/pdf/split -F "file=@real.pdf" -F "ranges=1"; done; echo
```

Hasil diharapkan: muncul sejumlah `429` setelah ~60 request. Verifikasi juga header `RateLimit-*` ada di respons. Di belakang proxy, pastikan `TRUST_PROXY` diset agar limit berbasis IP klien asli (lihat §6.4).

### 8.6 Security headers & CORS

```bash
curl.exe -s -D - -o /dev/null $BASE/api/pdf/split -F "file=@real.pdf" -F "ranges=1" | tr -d '\r'
```

Verifikasi: header dari Helmet ada (mis. `X-Content-Type-Options: nosniff`, `X-Frame-Options`/CSP), dan **tidak ada** `X-Powered-By`. Untuk CORS, kirim `Origin` yang tidak diizinkan dan pastikan respons tidak memuat `Access-Control-Allow-Origin` untuk origin tersebut.

### 8.7 Ghostscript / parser dokumen

- Uji PDF dengan konten PostScript berisiko, referensi file eksternal, dan "PDF bomb" (objek yang mengembang besar saat didekompresi).
- Hasil diharapkan: operasi gagal rapi (4xx/5xx) **tanpa** membaca file di luar area temp (dibatasi `-dSAFER`), tanpa koneksi keluar, dan tanpa menghabiskan resource melampaui limit container (§3, §6.2).

### 8.8 Container & runtime (pada host Docker)

```bash
# Proses backend harus non-root.
docker compose exec server id                 # uid bukan 0

# Root filesystem read-only (tulis di luar /tmp harus gagal).
docker compose exec server sh -c 'echo x > /test 2>&1 || echo READONLY_OK'

# Setelah menjalankan beberapa operasi, folder temp harus bersih.
docker compose exec server sh -c 'ls -A /tmp'  # tidak ada sisa pdfc-* yang menumpuk

# Konfirmasi capability dibuang & no-new-privileges (lihat docker-compose.yml).
docker inspect $(docker compose ps -q server) --format '{{.HostConfig.CapDrop}} {{.HostConfig.SecurityOpt}}'
```

### 8.9 Network egress

- Monitor koneksi keluar container `server` selama operasi (mis. `docker compose exec server sh -c 'cat /proc/net/tcp'` atau capture di host).
- Hasil diharapkan: **tidak ada** koneksi keluar ke internet. Semua pemrosesan lokal; tidak ada file/metadata yang dikirim ke pihak ketiga.

### Ringkasan checklist

- [ ] 8.1 Magic-bytes menolak file palsu (PDF & gambar)
- [ ] 8.2 Batas ukuran & jumlah file ditegakkan
- [ ] 8.3 Tidak ada header injection via nama file
- [ ] 8.4 Input `ranges`/`dpi`/`level` tervalidasi
- [ ] 8.5 Rate limiting aktif (429 setelah ambang)
- [ ] 8.6 Security headers ada; `X-Powered-By` tidak ada; CORS sesuai whitelist
- [ ] 8.7 Ghostscript gagal aman pada dokumen jahat
- [ ] 8.8 Container non-root, read-only FS, temp bersih, capability dibuang
- [ ] 8.9 Tidak ada egress jaringan tak terduga

---

## 9. Kontak & cara uji cepat

Menjalankan lokal: lihat `README.md`. Health check: `GET /health` → `{"status":"ok"}`.

Semua pemrosesan terjadi di dalam jaringan/host sendiri; aplikasi tidak mengirim file atau metadata ke layanan pihak ketiga mana pun.
