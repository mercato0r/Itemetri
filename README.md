# Itemetri

**Analisis kualitas instrumen evaluasi pembelajaran, validitas, reliabilitas, tingkat kesukaran, dan daya pembeda.**

Itemetri adalah aplikasi analisis psikometri lokal berbasis **TypeScript + React + Vite** (`web/`) dengan antarmuka bergaya jamovi (`@tanstack/react-virtual`). Seluruh komputasi statistik serta pembacaan/penulisan berkas (`.ana`/`.ANA`, `.csv`, `.xlsx`) berjalan langsung di peramban pengguna secara luring (*client-side*, tanpa backend server, tanpa CDN eksternal, dan tanpa WebAssembly), sehingga sangat ringan dan siap dipasang di *hosting* statis mana pun (Cloudflare Pages, cPanel, GitHub Pages) sekaligus aman di bawah kebijakan *Content Security Policy* ketat (`script-src 'self' 'unsafe-inline'`).

---

## Fitur Utama

### 1. Mesin Psikometri Mode Ganda (`legacy_anates` vs `standard_corrected`)
- **Mode `standard_corrected` (bawaan)**: Rumus psikometri baku presisi `float64`, derajat bebas eksak `df = N - 2` pada uji-$t$ serta Welch-Satterthwaite pada Uraian, rentang kategori tingkat kesukaran kontigu tanpa celah, dan dukungan bobot Pilihan Ganda opsional.
- **Mode `legacy_anates`**: Reproduksi perilaku komputasi historis kompatibel berkas `.ana`/`.ANA` (pembulatan *banker's rounding* 27%, tabel korelasi kritis 14 baris, belah dua Spearman-Brown, hingga celah kategori tingkat kesukaran) untuk audit arsip lama.
- **Metrik & Diagnostik**:
  - **Reliabilitas**: Belah Dua Spearman-Brown (`r_tt`), Alpha Cronbach ($\alpha$), KR-20, KR-21, dan Alpha jika butir dihapus ($\alpha_{-j}$).
  - **Statistik Skor**: Rata-rata, Simpangan Baku, Min, Median, Maks, Skor Ideal Maksimum, dan Capaian Rata-rata (%).
  - **Analisis Butir & Keputusan**: Daya Pembeda (`DP%`), Tingkat Kesukaran (`TK%`), Uji-$t$ kelompok unggul-asor Uraian, korelasi butir-total mentah (`r`) maupun terkoreksi (`r_corr`), evaluasi pengecoh (`IP%` + keberfungsian kelompok Atas vs Bawah), serta rekomendasi keputusan butir (`Terima`, `Revisi`, `Tolak`) dan deteksi dugaan salah kunci (`Salah Kunci?`).

### 2. Ruang Kerja Bergaya jamovi
- **Kanvas Spreadsheet Bebas**: Langsung siap sunting (`15 x 10` sel awal beserta baris/kolom bayangan `phantom`), virtualisasi 2D, tempel blok dari Excel (`Ctrl+V`), seleksi rentang, `Undo`/`Redo`, dan deteksi otomatis kolom `PG` dan `Uraian`.
- **Impor Fleksibel & Sampel Simulasi**: Membaca `.ana`/`.ANA`, `.csv`, dan `.xlsx` melalui pratinjau pemetaan kolom/baris, penggabungan dua berkas, serta dua sampel simulasi deterministik bawaan (`simulasi-pg-diagnostik` dan `simulasi-uraian`).
- **Pemisahan Simpan Data & Ekspor Hasil**:
  - **Simpan Data** di header menyimpan data lembar kerja (`.ana`, `.xlsx`, `.csv`).
  - Setiap kartu hasil dan grafik menyediakan tombol ikon **Salin** (tabel HTML bergaya APA siap tempel ke Word/Docs + TSV ke Excel, atau PNG resolusi tinggi untuk grafik) dan **Unduh** (`Teks / Word (.txt)`, `Laporan PDF (.pdf)` multi-halaman A4, `Gambar PNG (.png)`, dan `Gambar JPG (.jpg)`), serta bar ringkasan atas **Salin Semua** dan **Unduh Laporan**.

---

## Cara Menjalankan & Membangun

### Prasyarat
- Node.js `>= 18` & `npm` (untuk pengembangan, pengujian, dan *build* aplikasi web TypeScript)

### Pengembangan Lokal, Pengujian & Build Aplikasi Web
```powershell
cd web
npm ci

# Menjalankan server pengembangan Vite
npm run dev

# Menjalankan unit test
npm test

# Typecheck + build produksi statis ke web/dist/
npm run build
```

Hasil build di `web/dist/` merupakan berkas statis murni (termasuk halaman panduan di `web/dist/user_manual/`) yang dapat langsung diunggah ke `public_html` cPanel, Cloudflare Pages, atau GitHub Pages.

---

## Struktur Direktori & Dokumentasi

- `web/`: kode sumber utama aplikasi web (`React` + `TypeScript` + `Vite`):
  - `web/src/standalone/`: mesin psikometri CTT murni TypeScript (`engine/`) dan pembaca/penulis `.ana`, `.csv`, `.xlsx` (`io/`) beserta `client.ts`.
  - `web/src/components/`, `web/src/hooks/`, `web/src/model/`, `web/src/styles/`, `web/src/utils/`: antarmuka, virtual spreadsheet, grafik SVG, dan ekspor kartu.
  - `web/scripts/buildUserManual.mjs`: kompilator `USER_MANUAL.md` ke halaman HTML statis saat *dev* dan *build*.
  - `web/tests/run_tests.mjs`: rangkaian unit test aplikasi web.
- `assets/`: ikon vektor dan `.ico` orisinal aplikasi (`itemetri.svg`, `itemetri.ico`).
- Dokumentasi proyek:
  - [USER_MANUAL.md](USER_MANUAL.md): panduan pengguna lengkap beserta notasi matematis.
  - [DESIGN.md](DESIGN.md): sistem token desain dan standar antarmuka.
  - [CHANGELOG.md](CHANGELOG.md): riwayat perubahan dan rilis.
  - [LICENSE](LICENSE): lisensi MIT proyek.

---

## Lisensi, Atribusi, & Penafian

### Lisensi Open Source
**Itemetri** dilisensikan di bawah **MIT License** (lihat [LICENSE](LICENSE)). Anda bebas menggunakan, menyalin, memodifikasi, dan mendistribusikan kode sumber ini dengan tetap menyertakan pemberitahuan hak cipta dan izin MIT tersebut.

### Atribusi & Penafian Non-Afiliasi
- **Itemetri** adalah perangkat lunak independen yang ditulis ulang sepenuhnya dari nol dalam TypeScript dan Python, terinspirasi oleh kontribusi besar perangkat lunak **ANATES** bagi ekosistem evaluasi pembelajaran di Indonesia.
- Proyek ini tidak berafiliasi dengan, tidak disponsori oleh, dan tidak mendistribusikan biner, ikon, atau aset milik pembuat ANATES asli. Dukungan pembacaan/penulisan berkas `.ana`/`.ANA` disediakan semata untuk interoperabilitas data pengguna.
- Rumus statistik dan psikometri yang diimplementasikan merupakan formulasi matematis standar di domain publik.

### Apresiasi Sukarela (Opsional)
Meneladani semangat sosial pembuat ANATES yang mendorong nilai kebaikan melalui karyanya, apabila **Itemetri** dirasakan bermanfaat dalam tugas pengajaran atau penelitian Anda, Anda dipersilakan (secara sukarela, bukan sebagai syarat lisensi) menyalurkan infak atau donasi ke masjid, panti asuhan, atau lembaga sosial pilihan Anda sendiri.
