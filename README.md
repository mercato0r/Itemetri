# Itemetri

**Analisis kualitas instrumen evaluasi pembelajaran, validitas, reliabilitas, tingkat kesukaran, dan daya pembeda.**

Itemetri adalah aplikasi psikometri lokal lintas platform berbasis Python (`FastAPI` + `NumPy`/`SciPy`) dan antarmuka web bergaya jamovi (`React` + `TypeScript` + `@tanstack/react-virtual`). Perangkat lunak ini dirancang untuk menguji butir soal Pilihan Ganda, Uraian, serta lembar kerja campuran `PG + Uraian` secara interaktif sekaligus mendukung interoperabilitas berkas proyek `.ana`/`.ANA`.

---

## Fitur Utama

### 1. Mesin Psikometri Mode Ganda (`legacy_anates` vs `standard_corrected`)
- **Mode `standard_corrected` (bawaan)**: Rumus psikometri baku dengan presisi `float64`, derajat bebas eksak `df = N - 2` pada uji-$t$, rentang kategori tingkat kesukaran kontigu tanpa celah, serta dukungan bobot Pilihan Ganda opsional.
- **Mode `legacy_anates`**: Reproduksi perilaku komputasi historis kompatibel berkas `.ana`/`.ANA` (pembulatan *banker's rounding* 27%, tabel korelasi kritis 14 baris, belah dua Spearman-Brown, hingga ekspor teks `reliabel.txt`) untuk audit arsip lama.
- **Metrik & Diagnostik**:
  - **Reliabilitas**: Belah Dua Spearman-Brown (`r_tt`), Alpha Cronbach ($\alpha$), KR-20, KR-21, dan Alpha jika butir dihapus ($\alpha_{-j}$).
  - **Statistik Skor**: Rata-rata, Simpangan Baku, Min, Median, Maks, Skor Ideal Maksimum, dan Capaian Rata-rata (%).
  - **Analisis Butir & Keputusan**: Daya Pembeda (`DP%`), Tingkat Kesukaran (`TK%`), Uji-$t$ kelompok unggul-asor Uraian, korelasi butir-total mentah (`r`) maupun terkoreksi (`r_corr`), evaluasi pengecoh (`IP%` + keberfungsian kelompok Atas vs Bawah), dan rekomendasi keputusan butir (`Terima`, `Revisi`, `Tolak`) beserta deteksi dugaan salah kunci (`Salah Kunci?`).

### 2. Ruang Kerja Bergaya jamovi
- **Kanvas Spreadsheet Bebas**: Langsung siap sunting (`15 x 10` sel awal beserta baris/kolom bayangan `phantom`), virtualisasi 2D, tempel blok dari Excel (`Ctrl+V`), seleksi rentang, `Undo`/`Redo`, serta deteksi otomatis kolom `PG` dan `Uraian`.
- **Impor Fleksibel & Sampel Simulasi**: Membaca `.ana`/`.ANA`, `.csv`, dan `.xlsx` melalui pratinjau pemetaan kolom/baris (`/api/import/preview` & `/api/import/mapped`), penggabungan dua berkas, serta dua sampel simulasi deterministik bawaan (`simulasi-pg-diagnostik` dan `simulasi-uraian`).
- **Pemisahan Simpan Data & Ekspor Hasil**:
  - **Simpan Data** di header menyimpan data lembar kerja (`.ana`, `.xlsx`, `.csv`).
  - Setiap kartu hasil dan grafik menyediakan tombol langsung **Salin** (tabel HTML bergaya APA siap tempel ke Word/Docs + TSV ke Excel, atau PNG beresolusi tinggi untuk grafik) dan **Unduh** (`Teks / Word (.txt)`, `Laporan PDF (.pdf)` multi-halaman A4, `Gambar PNG (.png)`, dan `Gambar JPG (.jpg)`).

---

## Cara Menjalankan

### Prasyarat
- Python `>= 3.11` dan [`uv`](https://docs.astral.sh/uv/)
- Node.js & npm (hanya diperlukan bila mengubah atau membangun ulang frontend di `web/`)

### Instalasi Dependensi
```powershell
uv sync
```

### Antarmuka Baris Perintah (`itemetri`)
```powershell
uv run itemetri --help
uv run itemetri analyze berkas.ana --mode corrected
uv run itemetri diff berkas.ana
uv run itemetri merge primer.ana sekunder.ana --axis subjects -o gabungan.ana
uv run itemetri inspect berkas.ana
uv run itemetri serve --port 8767
```

### Aplikasi Web & Peluncur Desktop (`itemetri-desktop`)
```powershell
# Menjalankan server lokal dan membuka browser sistem
uv run itemetri serve --port 8767

# Peluncur desktop (menggunakan pywebview bila terpasang, atau browser sistem)
uv run itemetri-desktop
uv run itemetri-desktop berkas.ana
```

### Build Frontend & Pemaketan Desktop
```powershell
cd web
npm ci
npm run build
cd ..

# Membangun wheel, sdist, dan bundel executable PyInstaller/Nuitka (opsional --bundle-exe)
uv run python packaging/build_desktop.py --skip-frontend
```

---

## Pengujian & Pemeriksaan Kualitas

```powershell
uv run mypy --strict src/anates tests
uv run ruff check src tests packaging/build_desktop.py
uv run pytest
```

---

## Struktur Direktori & Dokumentasi

- `assets/`: ikon vektor dan `.ico` orisinal aplikasi (`itemetri.svg`, `itemetri.ico`).
- `src/anates/`: paket Python utama (`domain/`, `engine/`, `io/`, `web/`, `cli/`, `desktop.py`).
- `web/`: kode sumber frontend React + TypeScript + Vite (`src/api/`, `src/components/`, `src/hooks/`, `src/model/`, `src/styles/`, `src/utils/`).
- `tests/`: suite pengujian unit, properti (`Hypothesis`), regresi golden, API web, dan pemaketan.
- `packaging/`: spesifikasi build PyInstaller (`itemetri.spec`), Nuitka (`nuitka_entry.py`), dan skrip distribusi (`build_desktop.py`).
- Dokumentasi & konfigurasi proyek:
  - [CHANGELOG.md](CHANGELOG.md): riwayat perubahan dan rilis.
  - [LICENSE](LICENSE): lisensi MIT proyek.
  - [pyproject.toml](pyproject.toml) & `uv.lock`: konfigurasi paket Python dan penguncian dependensi.

---

## Lisensi, Atribusi, & Penafian

### Lisensi Open Source
**Itemetri** dilisensikan di bawah **MIT License** (lihat [LICENSE](LICENSE)). Anda bebas menggunakan, menyalin, memodifikasi, dan mendistribusikan kode sumber ini dengan tetap menyertakan pemberitahuan hak cipta dan izin MIT tersebut.

### Atribusi & Penafian Non-Afiliasi
- **Itemetri** adalah perangkat lunak independen yang ditulis ulang sepenuhnya dari nol dalam Python dan TypeScript, terinspirasi oleh kontribusi besar perangkat lunak **ANATES** bagi ekosistem evaluasi pembelajaran di Indonesia.
- Proyek ini tidak berafiliasi dengan, tidak disponsori oleh, dan tidak mendistribusikan biner, ikon, atau aset milik pembuat ANATES asli. Dukungan pembacaan/penulisan berkas `.ana`/`.ANA` disediakan semata untuk interoperabilitas data pengguna.
- Rumus statistik dan psikometri yang diimplementasikan merupakan formulasi matematis standar di domain publik.

### Apresiasi Sukarela (Opsional)
Meneladani semangat sosial pembuat ANATES yang mendorong nilai kebaikan melalui karyanya, apabila **Itemetri** dirasakan bermanfaat dalam tugas pengajaran atau penelitian Anda, Anda dipersilakan (secara sukarela, bukan sebagai syarat lisensi) menyalurkan infak atau donasi ke masjid, panti asuhan, atau lembaga sosial pilihan Anda sendiri.
