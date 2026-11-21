# Changelog

Semua perubahan penting pada proyek **Itemetri** (sebelumnya dikembangkan sebagai proyek tulis ulang ANATES Python) didokumentasikan di berkas ini.

Format changelog mengikuti standar [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan [Semantic Versioning](https://semver.org/). Catatan: entri `[0.1.0]` s.d. `[0.3.0]` mencerminkan tonggak pengembangan awal sebelum penyelarasan versi paket `0.4.0` pada `pyproject.toml` dan `web/package.json`.

---

## [0.4.0] - 2026-11-21

### Ditambahkan
- **Rebranding penuh ke Itemetri** dengan deskripsi *"Analisis kualitas instrumen evaluasi pembelajaran, validitas, reliabilitas, tingkat kesukaran, dan daya pembeda."*:
  - Menambahkan berkas lisensi terbuka resmi [LICENSE](LICENSE) menggunakan **MIT License**.
  - Menambahkan ikon vektor dan berkas ikon Windows multi-resolusi orisinal di `assets/itemetri.svg` dan `assets/itemetri.ico`, serta SVG `BrandMarkIcon` di `web/src/components/Icons.tsx` dan favicon SVG di `web/index.html`.
  - Menambahkan bagian **Lisensi, Atribusi, & Penafian Non-Afiliasi** serta imbauan apresiasi sukarela di `README.md`.

### Diubah
- Menyelaraskan nama paket dan titik masuk ke `itemetri` (`version = "0.4.0"`) pada `pyproject.toml`, `src/anates/__init__.py`, `web/package.json` (`itemetri-web`), `src/anates/cli/app.py` (`itemetri`), `src/anates/desktop.py` (`itemetri-desktop`), `src/anates/web/app.py`, dan `tests/test_web_api.py`.
- Mengubah tajuk antarmuka utama dan judul dokumen menjadi **Itemetri** (`web/index.html`, `web/src/components/JamoviRibbon.tsx`) serta awalan berkas ekspor hasil menjadi `itemetri-*.txt/.pdf/.png/.jpg` (`web/src/utils/resultExport.ts`, `web/src/components/CardExportBar.tsx`).
- Mengganti spesifikasi PyInstaller menjadi `packaging/itemetri.spec` (ikon `assets/itemetri.ico`) dan memperbarui `packaging/build_desktop.py` untuk verifikasi paket `itemetri-*` bebas aset warisan.
- Memperbarui `.gitignore` untuk mengecualikan biner, aset ikon, serta sampel berpemilik warisan ANATES agar repositori rilis publik tetap bersih.

### Dihapus
- Menghapus spesifikasi PyInstaller lama `packaging/anates.spec`.

---

## [0.3.0] - 2026-11-20

### Ditambahkan
- **Statistik deskriptif skor & pintasan `50% (Median Split)`**:
  - Menambahkan field opsional `min_score`, `max_score`, `median_score`, dan `ideal_max_score` pada `MultipleChoiceScoringResult` dan `EssayScoringResult` di `src/anates/domain/models.py` beserta perhitungannya di `src/anates/engine/scoring.py` melalui `_score_summary()`.
  - Menambahkan ubin `Skor Min / Median / Maks` serta `Skor Ideal / Rata-rata %` pada kartu `Ringkasan Reliabilitas & Statistik Tes` (termasuk ekspor APA/TXT/PDF/PNG/JPG) di `web/src/components/ResultsCanvas.tsx`.
  - Menambahkan tombol pintasan `27% (Kelompok Ekstrem)` dan `50% (Median Split)` pada `web/src/components/OptionsDrawer.tsx`.
- **Evaluasi pengecoh kelompok unggul-asor (`Atas / Bawah`) & tampilan matriks**:
  - Memperluas `DistractorOption` (`upper_count`, `lower_count`, `is_functioning`) dan `DistractorItem` (`upper_blank_count`, `lower_blank_count`, `functioning_count`, `distractor_count`) di `src/anates/domain/models.py`.
  - Memperluas `compute_distractors()` di `src/anates/engine/distractor.py` untuk menghitung submatriks frekuensi kelompok atas-bawah secara vektorisasi NumPy dan menilai kelayakan fungsi pengecoh (`proporsi >= 2%` serta pilihan kelompok bawah >= unggul), terhubung melalui `src/anates/engine/pipeline.py`.
  - Menambahkan tampilan `Detail Butir` (rincian `Atas u / Bawah l` serta lencana `Berfungsi` / `Lemah`) dan `Matriks Semua` pada kartu `Distribusi Pilihan` serta kolom rasio `Pengecoh` di tabel `Analisis Butir Soal` di `web/src/components/ResultsCanvas.tsx`.
- **Rekomendasi keputusan butir (`Terima` / `Revisi` / `Tolak`) & diagnosis salah kunci**:
  - Menambahkan enum `ItemVerdictStatus` di `src/anates/domain/enums.py` dan dataclass `ItemVerdict` pada `MultipleChoiceAnalysis` serta `EssayAnalysis` di `src/anates/domain/models.py`.
  - Menambahkan modul pemilik tunggal `src/anates/engine/verdict.py` (`VerdictThresholds`, `evaluate_item_verdicts`) yang mengevaluasi status berdasarkan `r` mentah maupun `r_corr` terkoreksi secara seragam pada mode `LEGACY_ANATES` dan `STANDARD_CORRECTED`, serta mendeteksi `suspected_miskey` ketika `DP < 0` dan opsi non-kunci unggul pada kelompok atas.
  - Menambahkan filter `Keputusan`, lencana `Terima`/`Revisi`/`Tolak`, penanda `Salah Kunci?`, kolom `Catatan`, serta baris rekap `tfoot` di `web/src/components/ResultsCanvas.tsx`.
- **Panel lipat panduan interpretasi & rumus (`web/src/components/MethodNotes.tsx`)**:
  - Menambahkan panel `<details class="method-notes no-print">` di dasar kartu `Ringkasan Reliabilitas`, `Analisis Butir Soal`, dan `Distribusi Pilihan` yang mengikuti flag `showInterpretation`, `mode`, dan `useCorrectedItemTotal`.
- **Generator sampel simulasi pedagogis deterministik & endpoint aman**:
  - Menambahkan `generate_diagnostic_mc_sample()` (`25x10` Pilihan Ganda dengan simulasi salah kunci pada butir #9 dan soal sangat mudah pada butir #10) dan `generate_essay_demo_sample()` (`20x5` Uraian dengan skor ideal `[10, 10, 15, 15, 20]`) berbasis `numpy.random.PCG64` di `src/anates/engine/samples.py`.
  - Menambahkan field opsional `label`, `kind_hint`, dan `is_builtin` pada `SampleFileInfo` (`src/anates/web/schemas.py`), allowlist `_BUILTIN_SIMULATION_SAMPLES` pada `/api/samples` (`src/anates/web/api.py`) sebelum `_resolve_sample_path()`, serta komponen bersama `SampleListGrid` di `web/src/components/ImportMapperDialog.tsx`.
- **Pengujian tahap adaptasi fitur (`75 passed` di `pytest`)**:
  - Menambahkan `tests/test_verdict.py`, `tests/test_distractor_groups.py`, `tests/test_samples.py`, serta memperluas `tests/test_web_api.py` untuk endpoint simulasi bawaan.

### Diubah
- Memperluas tipe TypeScript di `web/src/types.ts` dan penataan gaya di `web/src/styles/workspace.css` (`.verdict-badge`, `.miskey-tag`, `.dist-func-badge`, `.distractor-matrix-table`, `.preset-btn-row`, `.method-notes`, `.sample-badge`).
- Menata ulang dokumentasi proyek agar sesuai implementasi aktif: menambahkan `README.md`, memperbarui `ANATES_CALCULATION_NOTATION.md` dengan notasi fitur `[0.3.0]`, dan memindahkan tiga dokumen rencana selesai (`ANATES_REWRITE_PLAN_PYTHON.md`, `ANATES_UI_UX_REVIEW.md`, `ANATES_FEATURE_ADAPTATION_PLAN.md`) ke `docs/archive/`.

### Dihapus
- Menghapus rencana port Rust `ANATES_REWRITE_PLAN.md` karena telah sepenuhnya digantikan oleh implementasi Python + FastAPI + React.

---

## [0.2.1] - 2026-11-20

### Ditambahkan
- **Ekspor hasil per kartu bergaya jamovi/SPSS (`Salin` & `Unduh`)**:
  - Mesin ekspor mandiri `web/src/utils/resultExport.ts` dan komponen `web/src/components/CardExportBar.tsx` yang terpasang langsung di header setiap kartu hasil pada `web/src/components/ResultsCanvas.tsx` maupun setiap kartu grafik pada `web/src/components/ChartsView.tsx`.
  - Tombol **Salin** mendukung penyalinan dual-MIME (`text/html` bergaya tabel publikasi APA untuk tempel ke Microsoft Word/Google Docs dan `text/plain` terformat kolom untuk Excel/Notepad) serta `image/png` beresolusi tinggi (`2x` scale) untuk kartu grafik.
  - Menu **Unduh** (dirender melalui portal `document.body` agar bebas dari klip containment) menyediakan empat format untuk setiap kartu: `Teks / Word (.txt)`, `Laporan PDF (.pdf)` multi-halaman A4 (`PDF 1.4 /DCTDecode` dengan pengulangan header tabel), `Gambar PNG (.png)`, dan `Gambar JPG (.jpg)`.
  - Bar ringkasan hasil paling atas menambahkan tombol **Salin Semua** dan **Unduh Laporan** untuk mengekspor seluruh modul serta grafik aktif sekaligus.
- **Akses cepat di header & impor**:
  - Tombol **Lembar Baru** langsung pada header atas di `web/src/components/JamoviRibbon.tsx`.
  - Daftar **Arsip Sampel Lokal** (`biologi.ana`, `ka ma2.ANA`, dll.) disematkan langsung di dalam dialog `web/src/components/ImportMapperDialog.tsx`.
  - Ikon SVG baru `CopyIcon`, `FilePlusIcon`, dan `ChevronDownIcon` di `web/src/components/Icons.tsx`.

### Diubah
- Pemisahan tegas antara **penyimpanan data lembar kerja** dan **ekspor hasil analisis**:
  - Tombol header `[Ekspor]` diubah menjadi **Simpan Data**, membuka `SaveWorksheetDialog` (`web/src/components/Dialogs.tsx`) yang difokuskan hanya pada penyimpanan data peserta dan kunci/skor ideal dari spreadsheet kiri (`.ana`, `.xlsx` data mentah, dan `.csv` data mentah).
- Kartu **Skor Peserta Terurut Menurun** pada `web/src/components/ResultsCanvas.tsx` beralih dari `<details>/<summary>` menjadi header tombol lipat terstruktur agar tombol **Salin** dan **Unduh** sejajar tanpa benturan klik.
- Penataan gaya `.card-head-row`, `.card-collapse-btn`, `.card-export-bar`, dan `.export-menu-popover` di `web/src/styles/workspace.css`.

### Dihapus
- Menghapus tombol dan modal redundan di header: `MenuDialog`, `SettingsDialog`, `ImportDialog`, dan `NewExamDialog` dari `web/src/components/Dialogs.tsx`.
- Menghapus ikon usang `MenuIcon`, `SettingsIcon`, dan `PrintIcon` dari `web/src/components/Icons.tsx`.
- Menghapus kode runtime antarmuka legacy v1 (`web/src/legacy/`) serta pengalih `viewMode` di `web/src/App.tsx` (arsip lengkap kode v1 tetap disimpan terpisah di `legacy_v1/`).
- Menghapus aturan CSS tab lama (`.tab-strip`, `.tab-btn`) yang tidak lagi terpakai di `web/src/styles/workspace.css`.

---

## [0.2.0] - 2026-11-20

### Ditambahkan
- **Kanvas spreadsheet bebas bergaya jamovi (`web/src/components/JamoviSpreadsheet.tsx`, `web/src/hooks/useVirtualGrid.ts`, `web/src/model/worksheet.ts`)**:
  - Aplikasi langsung terbuka pada kanvas spreadsheet kosong berukuran `15 baris x 10 butir` ditambah `5 phantom rows` dan `3 phantom columns` tanpa dialog pemblokir awal.
  - Virtualisasi 2D baris dan kolom berbasis `@tanstack/react-virtual` (`GRID_ROW_HEIGHT = 32`, `GRID_COL_WIDTH = 72`) dengan pola *Single Active Cell Editor*.
  - Pengetikan atau penempelan blok TSV/CSV (`Ctrl+V`) ke sel biasa maupun sel bayangan memperluas baris/kolom lembar kerja secara otomatis, dilengkapi seleksi rentang (`Shift+Arrow`), salin rentang (`Ctrl+C`), hapus rentang (`Delete`/`Backspace`), serta riwayat `Undo`/`Redo` (`Ctrl+Z`/`Ctrl+Y`).
- **Model variabel terpadu per kolom & dukungan soal campuran (`PG + Uraian`)**:
  - `VariableKindMode` (`"auto" | "multiple_choice" | "essay"`) pada `web/src/model/worksheet.ts` mendeteksi otomatis tipe butir dari baris acuan (`Ref: Kunci / Skor Ideal`): huruf `A..Z` menjadi Pilihan Ganda (`PG`), sedangkan angka positif menjadi Uraian (`Ur`).
  - `worksheetToExamPayload` mendukung lembar kerja Pilihan Ganda murni, Uraian murni, maupun campuran `PG + Uraian` dalam satu worksheet.
  - Laci konfigurasi kontekstual `web/src/components/VariableSetupDrawer.tsx` untuk menyunting tipe variabel, acuan kunci/skor maksimum, jumlah opsi PG, serta penerapan massal ke semua kolom.
- **Pita aksi kontekstual dua tingkat (`web/src/components/JamoviRibbon.tsx`)**:
  - Menggabungkan menu edit data dan setup variabel dalam satu `role="toolbar"` dengan dukungan `focusgroup="toolbar wrap"`, fallback roving `tabIndex`, pemisah `role="separator"`, `aria-disabled`, dan tombol toggle modul hasil berbasis `[aria-pressed="true"]`.
- **Tata letak dua panel persisten (`web/src/App.tsx`, `web/src/components/ResultsCanvas.tsx`, `web/src/styles/workspace.css`)**:
  - Panel spreadsheet di kiri tetap tampil berdampingan saat pengguna menyalakan/mematikan modul `Reliabilitas`, `Analisis Butir`, `Pengecoh`, `Grafik`, `Audit Legacy`, maupun `Opsi`.
  - Pembatas tengah (`splitter`) mendukung penggeseran pointer dan keyboard (`ArrowLeft`, `ArrowRight`, `Home`) dengan CSS containment `content-visibility: auto` pada kartu hasil.
- **Impor CSV/XLSX fleksibel & endpoint sesi desktop**:
  - `preview_tabular_bytes` dan `read_tabular_mapped_bytes` di `src/anates/io/tabular.py`.
  - Endpoint `POST /api/import/preview`, `POST /api/import/mapped`, `GET /api/startup`, dan `POST /api/session/patch` di `src/anates/web/api.py` beserta skema `CellPatchPayload` dan `SessionPatchRequest` di `src/anates/web/schemas.py`.
  - Dukungan parameter `startup_exam_path` di `src/anates/web/app.py` serta pembungkus jendela desktop `pywebview` (dengan fallback ke browser sistem), argumen berkas awal, dan flag `--browser` di `src/anates/desktop.py`.
  - Cakupan pengujian integrasi impor fleksibel dan endpoint sesi di `tests/test_flexible_import_and_session.py`.
- **Arsip kode sumber v1**:
  - Menyalin kode sumber backend dan frontend v1 ke `legacy_v1/src_anates/` dan `legacy_v1/web_src/`.

---

## [0.1.0] - 2026-11-19

### Ditambahkan
- **Dokumentasi reverse engineering & perancangan**:
  - `ANATES_ANALYSIS.md`: hasil reverse engineering biner `AnatesV4.exe` dan `Anates Uraian.exe`.
  - `ANATES_REWRITE_PLAN.md` & `ANATES_REWRITE_PLAN_PYTHON.md`: rencana tulis ulang bertahap ke arsitektur Python + FastAPI + React.
  - `ANATES_CALCULATION_NOTATION.md`: dokumentasi lengkap seluruh rumus dan notasi perhitungan psikometri.
  - `ANATES_UI_UX_REVIEW.md`: tinjauan UX komparatif terhadap jamovi sebelum redesign v2.
- **Fase 1 - Fondasi Domain, I/O `.ana`, CLI, & Mesin Pilihan Ganda Dual-Mode**:
  - Entitas domain, enumerasi, tipe, dan struktur kesalahan di `src/anates/domain/` (`enums.py`, `errors.py`, `models.py`, `types.py`).
  - Parser/serializer XML `.ana` aman (perlindungan XXE dan dukungan pengkodean legacy) di `src/anates/io/xml_ana.py` dan `src/anates/io/encoding.py`.
  - Mesin perhitungan psikometri di `src/anates/engine/` (`stats.py`, `scoring.py`, `upper_lower.py`, `difficulty.py`, `discrimination.py`, `correlation.py`, `distractor.py`, `reliability.py`, `comparison.py`, `pipeline.py`) dengan mode kompatibilitas ganda `legacy_anates` dan `standard_corrected`.
  - Antarmuka baris perintah (`anates`) di `src/anates/cli/app.py` dan `src/anates/cli/formatting.py`.
  - Pengujian domain, statistik, dan regresi golden terhadap korpus `.ana` asli di `tests/test_domain.py`, `tests/test_io_xml.py`, `tests/test_golden_mc.py`, `tests/test_comparison.py`, dan `tests/test_cli.py`.
- **Fase 2 - Mesin Uraian, I/O CSV/XLSX, Penggabungan Berkas, & Ekspor Laporan**:
  - Evaluasi soal Uraian/Esai termasuk kelompok unggul-asor dengan uji-t (`compute_essay_upper_lower` di `src/anates/engine/upper_lower.py`, `compute_essay_difficulty`, `compute_essay_discrimination`, `compute_essay_reliability`).
  - Ekstensi reliabilitas di `src/anates/engine/reliability.py` dan `correlation.py`: Alpha Cronbach, KR-20, KR-21, korelasi item-total terkoreksi (`compute_corrected_item_totals`), dan Alpha jika butir dihapus (`compute_alpha_if_deleted`).
  - Pembaca dan penulis `.csv`/`.xlsx` di `src/anates/io/tabular.py`.
  - Penggabungan dua berkas ujian (`merge_exams` di `src/anates/engine/merge.py`) untuk penggabungan sumbu peserta maupun sumbu butir soal.
  - Generator laporan cetak HTML (`src/anates/io/templates/report.html.j2`) dan ekspor teks legacy `reliabel.txt` (`render_reliabel_txt` di `src/anates/io/reports.py`).
  - Pengujian di `tests/test_essay_engine.py`, `tests/test_io_tabular.py`, `tests/test_io_reports.py`, `tests/test_merge.py`, dan `tests/test_reliability_extensions.py`.
- **Fase 3 - API Web FastAPI & Antarmuka SPA React/TypeScript (v1)**:
  - Server FastAPI dan endpoint REST di `src/anates/web/app.py`, `src/anates/web/api.py`, dan `src/anates/web/schemas.py`.
  - Proyek frontend React 19 + TypeScript + Vite di `web/` dengan klien API `web/src/api/client.ts`, token tema `web/src/styles/tokens.css` & `base.css`, serta `tests/test_web_api.py`.
- **Fase 4 - Penguatan Psikometri, Grafik Interaktif, Aksesibilitas, & Pemaketan Desktop**:
  - Penanganan kasus batas matematis (`zero variance`, `N < 2`, `M < 2`, pembagian nol) dan pengujian berbasis properti menggunakan `Hypothesis` (`tests/test_engine_properties.py` dan `tests/test_phase4_psychometrics.py`).
  - Grafik SVG interaktif di `web/src/components/ChartsView.tsx` (histogram skor total, diagram pencar P% vs D%, serta distribusi opsi/perbandingan unggul-asor).
  - Dukungan tema Terang/Gelap/Sistem (`web/src/hooks/useTheme.ts`), riwayat `Undo`/`Redo` (`web/src/hooks/useUndoRedo.ts`), utilitas validasi dan clipboard (`web/src/utils/validation.ts`, `web/src/utils/clipboard.ts`), serta opsi analisis (`web/src/components/OptionsDrawer.tsx`).
  - Peluncur desktop `anates-desktop` (`src/anates/desktop.py`) dan skrip pemaketan Wheel, Sdist, serta bundel PyInstaller (`packaging/build_desktop.py`, `packaging/anates.spec`, `tests/test_desktop_packaging.py`).
