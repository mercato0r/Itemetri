# Changelog

Semua perubahan penting pada proyek **Itemetri** (sebelumnya dikembangkan sebagai proyek tulis ulang ANATES Python) didokumentasikan di berkas ini.

Format changelog mengikuti standar [Keep a Changelog](https://keepachangelog.com/id/1.1.0/) dan [Semantic Versioning](https://semver.org/). Catatan: entri `[0.1.0]` s.d. `[0.3.0]` mencerminkan tonggak pengembangan awal sebelum penyelarasan versi paket `0.4.0` pada `pyproject.toml` dan `web/package.json`.

---

## [Unreleased]

### Ditambahkan
- **Halaman HTML Panduan Pengguna terintegrasi *build* (`web/scripts/buildUserManual.mjs`, `web/vite.config.ts`, `JamoviRibbon.tsx`, `USER_MANUAL.md`)**:
  - Menambahkan plugin Vite `userManualVitePlugin()` (memasang `marked` dan `katex` khusus di `devDependencies` tanpa membebani bundle JS React utama) untuk mengompilasi `USER_MANUAL.md` saat pengembangan (`vite dev`) maupun *build* produksi menjadi halaman statis mandiri `dist/user_manual/index.html` dan `dist/user_manual.html` (siap *Pretty URLs* Cloudflare Pages di `/user_manual`).
  - Menyusun halaman HTML dengan MathML mandiri (`katex` *output: mathml*), kotak panggilan GitHub Alert (`Penting`/`Catatan`), tabel bergaya APA, sidebar Daftar Isi lengket dengan filter pencarian dan penyorot bab aktif, mode cetak/PDF `@media print`, serta sinkronisasi tema Terang/Gelap melalui `localStorage["itemetri-color-scheme"]`.
  - Menambahkan `HelpCircleIcon` (`web/src/components/Icons.tsx`) serta tautan **`? Panduan`** di bilah kanan atas `JamoviRibbon.tsx` (`href="./user_manual/" target="_blank" rel="noopener noreferrer"`) beserta penyelarasan Daftar Isi dan label antarmuka di `USER_MANUAL.md`.
  - Menambahkan unit test `buildUserManualHtml` di `web/tests/run_tests.mjs` (`15/15` test lulus) untuk memvalidasi rendering MathML, keutuhan seluruh tautan *anchor* internal, serta nol karakter *em dash* dan *en dash*.
- **Konsolidasi antarmuka 5 Grup Flow untuk mengurangi langkah dan memperjelas keputusan (`docs/UI_CONSOLIDATION_REVIEW.md`, `ResultsCanvas.tsx`, `JamoviRibbon.tsx`, `ImportMapperDialog.tsx`, `VariableSetupDrawer.tsx`)**:
  - Menambahkan mode **deteksi ringkas 1 baris** pada `ImportMapperDialog.tsx` saat kolom soal berhasil terdeteksi, dengan lipatan tombol `Sesuaikan Kolom & Baris` untuk pemetaan manual dan tabel pratinjau.
  - Menggabungkan fitur pemetaan **Indikator / TP Butir** sebagai tab kedua di dalam drawer `VariableSetupDrawer.tsx` (`Atur Soal & Kunci`), serta menambahkan sakelar **`Kolom teknis lengkap`** pada tabel `Analisis Butir Soal` di `ResultsCanvas.tsx`.
  - Menambahkan 3 ubin metrik inti (**Reliabilitas Utama**, **Rata-rata Kelas**, **Kelayakan Butir**) langsung di dalam kartu `Ringkasan Eksekutif Evaluasi`, serta kontrol lipat/buka (`.card-collapse-btn`) pada kartu hasil di `ResultsCanvas.tsx`.
  - Menambahkan prop `embedded` pada `ItemQualityMatrix.tsx` untuk menyatukan peta warna butir tepat di atas tabel `Analisis Butir Soal`, dan prop `primaryDownload` pada `CardExportBar.tsx` untuk mempertegas tombol primer **`Ekspor Laporan`** di `JamoviRibbon.tsx`.

### Diubah
- **Pengalaman *above the fold* & penyederhanaan Ribbon (`App.tsx`, `OptionsDrawer.tsx`, `JamoviRibbon.tsx`, `Dialogs.tsx`)**:
  - Mengatur `OptionsDrawer` tertutup secara bawaan (`modules.options = false`) agar `Ringkasan Eksekutif Evaluasi` tampil di posisi teratas begitu hasil tersedia, disertai tombol **`Pengaturan`** dan lipatan `<details>` untuk opsi penyekoran serta metodologi lanjutan.
  - Menyelaraskan mode bawaan `Standar Terkoreksi` dengan `displayFlags.useCorrectedItemTotal = true` (otomatis menjadi `false` saat memilih `ANATES Klasik`) agar narasi ringkasan dan kolom korelasi butir tampil konsisten.
  - Menghapus 5 tombol toggle modul biru (`Reliabilitas`, `Analisis Butir`, `Pengecoh`, `Grafik`, `Opsi`) dan memindahkan kontrol tambah/hapus baris-kolom ke dropdown **`Baris & Kolom`** di `JamoviRibbon.tsx`.
  - Menghapus input `Jumlah peserta awal` pada `NewWorksheetDialog` (`Dialogs.tsx`, otomatis menyediakan 15 baris yang bertambah dinamis) serta menghilangkan tombol kembar `Tempel dari Excel` di kartu kanan dan duplikasi daftar sampel saat *Empty State* aktif.
  - Mengintegrasikan kartu **`Detail Butir & Pengecoh`** dan tabel *Analisis Butir* dengan **6 kolom inti** default (`No`, `Kunci/Ideal`, `TK(%)`, `DP(%)`, `r_corr`, `Keputusan`), menghapus baris `<tfoot>` duplikat, menghapus kartu bawah grafik opsi kembar di `ChartsView.tsx`, serta mempertahankan ekspor SVG/XLSX/PDF/Word lengkap melalui `allResultsSpec`.

### Diperbaiki
- **Aksesibilitas modal *Pretest-Posttest*, penomoran/diksi Indonesia, & spesifisitas hover tombol primer (`PretestPosttestModal.tsx`, `Dialogs.tsx`, `verdict.ts`, `ChartsView.tsx`, `MethodNotes.tsx`, `workspace.css`)**:
  - Membungkus `PretestPosttestModal` dengan komponen standar `ModalFrame` (`showModal()`, fokus modal, dan `Escape`) serta membersihkan kode internal `(TFGabungDuaFile)` dari judul `MergeDialog`.
  - Menghilangkan seluruh karakter *en dash* (`\u2013`) pada `PretestPosttestModal.tsx`, `ChartsView.tsx`, dan `verdict.ts` (`30% s.d. 70%`), serta menyunting ejaan baku KBBI dan gaya bahasa Indonesia pada `MethodNotes.tsx` (`efektivitas`, `Jika...`, `Kunci`).
  - Memperbaiki spesifisitas aturan `.btn:not(...):hover` pada `web/src/styles/workspace.css` agar tombol primer **`Ekspor Laporan`** (`.btn-primary`) dan tab aktif tetap menjaga kontras aksen saat diarahkan kursor maupun difokuskan.

### Dihapus
- Menghapus modal terpisah `web/src/components/IndicatorMapperModal.tsx` (fungsinya dipindah ke tab kedua `VariableSetupDrawer.tsx`).

---

- **Perbaikan UX ramah guru & dosen awam serta dokumentasi arah desain (`DESIGN.md`, `docs/WIREFRAME_USER_FLOW.md`, `docs/UX_AUDIT_ITEMETRI.md`)**:
  - Menambahkan `DESIGN.md` berisi sistem token warna WCAG AA, tipografi, skala spasi, dial (`ENERGY 1 / RHYTHM 2 / MOTION 1`), dan alasan desain satu baris (`R-31`).
  - Menambahkan modal **`NewWorksheetDialog`** di `web/src/components/Dialogs.tsx` untuk memilih jenis soal (Pilihan Ganda atau Uraian), dimensi awal, jumlah pilihan jawaban, serta input cepat kunci/skor ideal sejak awal.
  - Menambahkan **`Input Cepat Kunci PG`** (ketik beruntun `ABCD...`) dan **`Input Cepat Skor Ideal Uraian`** (angka seragam atau daftar) pada panel **Atur Soal & Kunci** (`web/src/components/VariableSetupDrawer.tsx`).
  - Menambahkan pembangkit template Excel siap pakai (`exportTemplateXlsxBytes` di `web/src/standalone/io/tabular.ts`, `generateTemplateXlsx` di `web/src/standalone/client.ts`) beserta tombol unduh **Template PG (.xlsx)** dan **Template Uraian (.xlsx)** pada `ImportMapperDialog.tsx` dan *Empty State*.
  - Menambahkan ekspor **Tabel Excel (.xlsx)** untuk kartu dan laporan analisis lengkap (`buildSpecXlsxBytes` & `downloadCardAsXlsx` di `web/src/utils/resultExport.ts`, opsi menu di `CardExportBar.tsx`, serta tombol **Ekspor Laporan** langsung di `JamoviRibbon.tsx`).
  - Menambahkan komponen **`HelpToggletip`** (`web/src/components/HelpToggletip.tsx`) yang aksesibel dengan keyboard (`Escape`) untuk menjelaskan istilah statistik (`Alpha Cronbach`, `KR-20`, `DP(%)`, `TK(%)`, `r`, `α(-j)`, `Kelompok Unggul & Asor`, korelasi terkoreksi) dalam bahasa awam, serta tombol filter cepat **Rekap Keputusan** (`Semua`, `Diterima`, `Perlu Revisi`, `Ditolak`) di atas tabel analisis butir pada `ResultsCanvas.tsx`.
  - Menambahkan `parseLocalizedNumber`, `parseLocalizedNumberList` (`web/src/utils/clipboard.ts`), dan `smartPasteWorksheet` (`web/src/model/worksheet.ts`) untuk mendukung koma desimal lokal Indonesia (`7,5`), kapitalisasi otomatis huruf PG, dan pemetaan otomatis blok Excel yang menyertakan baris Header/Kunci dan kolom Nama.
  - Memperluas pengujian otomatis di `web/tests/run_tests.mjs` menjadi `14` test (validasi desimal koma, gerbang `missingKeyItemNumbers`, `smartPasteWorksheet`, deteksi kolom sampah Google Forms/LMS, *round-trip* template & laporan `.xlsx`, serta pemindaian nol karakter em dash).

### Diubah
- **Pencegahan salah kunci jawaban diam-diam (`worksheet.ts`, `tabular.ts`, `ResultsCanvas.tsx`, `App.tsx`)**:
  - Lembar kerja baru dan berkas CSV/XLSX tanpa baris kunci kini membiarkan acuan kunci kosong (`""`, ditandai `[Isi]` pada baris `Kunci`) serta menahan perhitungan melalui kartu **Kunci Jawaban / Skor Ideal Belum Lengkap** hingga seluruh kunci terisi.
- **Impor cerdas & penyederhanaan bilah alat (`tabular.ts`, `ImportMapperDialog.tsx`, `JamoviRibbon.tsx`, `JamoviSpreadsheet.tsx`)**:
  - `previewTabularBytes` otomatis mengenali kolom `Nama Lengkap`/`Peserta` dan mengabaikan kolom metadata Google Forms/LMS (`Timestamp`, `Email Address`, `Score`, `NISN`, `Kelas`, dll.); modal impor juga otomatis mereset berkas saat ditutup.
  - Menyederhanakan *Empty State* menjadi 3 jalur tugas utama, mengganti `Setup Variabel` menjadi **Atur Soal & Kunci**, mengelompokkan fitur lanjutan ke menu **Alat Lanjutan** di Ribbon, serta menampilkan bilah peringatan validasi sel secara langsung di atas tabel `JamoviSpreadsheet.tsx`.

### Diperbaiki
- **Tumpang tindih modal Pemetaan Indikator/TP & duplikasi tombol laporan (`IndicatorMapperModal.tsx`, `JamoviRibbon.tsx`, `ResultsCanvas.tsx`, `Dialogs.tsx`)**:
  - Membungkus `IndicatorMapperModal` dengan `ModalFrame` (`wide`) agar dibuka melalui `dialog.showModal()` pada *Top Layer* dengan backdrop modal, sehingga tidak lagi tertimpa header tabel spreadsheet `position: sticky`.
  - Menghapus tombol duplikat **Unduh Laporan** dan **Salin Semua** pada panel hasil `ResultsCanvas.tsx`, serta menamakan ulang tombol **Ekspor Laporan** di headbar `JamoviRibbon.tsx` menjadi **Simpan Laporan** (bersama **Salin Laporan**) dan memperbarui teks petunjuk di `SaveWorksheetDialog` (`Dialogs.tsx`).
- **Token CSS tidak terdefinisi, kontras WCAG AA, & tata letak Ribbon mobile (`web/src/styles/workspace.css`, `web/src/utils/resultExport.ts`)**:
  - Mengganti variabel CSS `--bg-canvas` dan `--danger` yang tidak terdefinisi menjadi `--bg-subtle`, `--err`, dan `--err-bg` agar lencana peringatan dan matriks butir memenuhi kontras WCAG AA di tema Terang dan Gelap.
  - Menambahkan `flex-wrap: wrap` dan penataan ulang `.ribbon-left` / `.ribbon-actions` pada `@media (max-width: 639px)` agar judul `Itemetri` dan tombol Ribbon tidak saling bertumpuk di layar `375px`.
  - Mengganti karakter em dash pada footer ekspor PDF di `web/src/utils/resultExport.ts`.

### Ditambahkan
- **Peningkatan wawasan guru (Ringkasan Eksekutif, Diagnosis Butir, Matriks Kualitas, Distribusi Skor, Indikator, Pretest–Posttest, & Layout PDF)**:
  - Menambahkan `web/src/standalone/engine/summary.ts` (`computeExecutiveSummary`, `computeScoreDistributionSummary`) untuk menghasilkan kesimpulan kualitas instrumen otomatis dan interpretasi bentuk distribusi skor (*skewness*, *IQR*, *floor/ceiling effect*, serta ketuntasan KKM opsional di `OptionsDrawer.tsx`).
  - Memperluas `evaluateItemVerdicts()` di `web/src/standalone/engine/verdict.ts` dengan `checks` terstruktur (nilai aktual vs ambang batas & saran tindak lanjut) serta panel **Diagnosis Keputusan Butir** pada `ResultsCanvas.tsx`.
  - Menambahkan `web/src/components/ItemQualityMatrix.tsx` untuk memindai status `Terima`/`Revisi`/`Tolak`/dugaan salah kunci seluruh butir secara visual dan interaktif.
  - Menambahkan `web/src/standalone/engine/indicators.ts` + `web/src/components/IndicatorMapperModal.tsx` untuk pemetaan butir ke indikator/tujuan pembelajaran dan rekap penguasaan per indikator.
  - Menambahkan `web/src/standalone/engine/pretestPosttest.ts` + `web/src/components/PretestPosttestModal.tsx` untuk membandingkan data Pretest vs Posttest (N-Gain Hake dan uji-*t* berpasangan).
  - Memperbaiki ekspor PDF di `web/src/utils/resultExport.ts` (*keep-with-next* mencegah *orphaned heading*, *word-wrap* sel tabel panjang, *zebra striping*, dan footer nomor halaman).
- **Hardening I/O, sanitasi formula, & unit test terisolasi di `web/`**:
  - Menambahkan validasi batas offset ZIP, batas ukuran dekompresi (`50 MB`), batas dimensi XLSX (`50.000` baris / `5.000` kolom), dan deteksi pesan ramah format `.xls` lama pada `web/src/standalone/io/xlsxZip.ts`.
  - Menambahkan pemindai token XML yang mendukung blok `<![CDATA[...]]>` dan nilai atribut berisi `>` pada `web/src/standalone/io/xmlAna.ts`.
  - Menambahkan sanitasi *formula injection* (prefiks `'` pada sel string berawalan `=`, `+`, `-`, `@`, `\t`, `\r`) saat ekspor `.csv` dan `.xlsx` pada `web/src/standalone/io/tabular.ts`.
  - Menambahkan skrip `npm test` (`web/tests/run_tests.mjs`) untuk menguji model lembar kerja, ekspor HTML/APA, serta kasus korup/batas I/O (`6 passed`).
- **Mesin perhitungan web TypeScript murni (`web/src/standalone/`) sebagai mesin utama**:
  - Memindahkan seluruh perhitungan CTT (penyekoran PG/Uraian, peringkat, kelompok Unggul-Asor + uji-*t* Welch, tingkat kesukaran, daya pembeda, korelasi butir-total & terkoreksi, pengecoh, Belah Dua Spearman-Brown, Cronbach $\alpha$, $\alpha_{-j}$, KR-20/KR-21, keputusan butir, audit selisih mode, dan penggabungan berkas) serta pembaca/penulis `.ana` XML, `.csv`, dan `.xlsx` ke TypeScript murni tanpa CDN eksternal maupun WebAssembly (`100%` lolos CSP `'self'`).
  - Menambahkan skrip uji banding diferensial `scripts/verify_js_python_parity.mjs` terhadap `legacy_python/src` (`23` skenario uji, `14.080` pemeriksaan, selisih maksimum $3{,}31 \times 10^{-14}$).
- **Dukungan arsitektur dua aplikasi (Itemetri Web *stateless* & Desktop Windows)**:
  - Menambahkan mode deployment `web_public` (`ITEMETRI_DEPLOY_MODE=web_public`) pada `src/itemetri/web/app.py` dan `src/itemetri/web/api.py` (disertai `ITEMETRI_ALLOWED_ORIGINS` untuk CORS), yang menonaktifkan pemindaian berkas `.ana` lokal di server, menonaktifkan `startup_exam_path`, serta menghapus ketergantungan sesi global `session_exam` pada `/api/analyze`, `/api/samples`, `/api/merge`, dan `/api/session/patch`.
  - Menambahkan *entrypoint* siap *shared hosting*: `src/itemetri/web/asgi.py` (ASGI) dan `passenger_wsgi.py` (WSGI via `a2wsgi`), serta `requirements-web.txt` khusus dependensi server web tanpa komponen GUI desktop.
  - Menambahkan pengujian isolasi `test_web_public_stateless_isolation` dan `test_asgi_entrypoint_uses_web_public` di `tests/test_web_api.py` (`80 passed`).
- **Dialog "Simpan Sebagai" (*Save As*) asli pada *web wrapper* desktop & peramban**:
  - Menambahkan `_DesktopBridge` (`js_api` `save_file`) pada `src/itemetri/desktop.py` yang membuka dialog *Save As* Windows via `pywebview` (`create_file_dialog`), mengingat folder simpan terakhir, dan menulis berkas langsung ke lokasi pilihan pengguna.
  - Menambahkan *helper* terpadu `saveBlobWithDialog` di `web/src/utils/fileSave.ts` untuk memilih jalur `window.pywebview.api.save_file` (desktop), `window.showSaveFilePicker` (peramban modern), atau *fallback* `<a download>`, lengkap dengan penanganan status pembatalan.
- **Pembaruan manual pengguna & keluaran PDF**:
  - Memperbarui `USER_MANUAL.md` dengan identitas **Itemetri**, pernyataan perangkat lunak *open source* independen berlisensi MIT yang tidak berafiliasi dengan pencipta ANATES (serta dukungan interoperabilitas `.ana`), `Daftar Isi` bertautan 36 *anchor*, dan mengonversinya menjadi `USER_MANUAL.pdf` (14 halaman A4).

### Diubah
- **Penyelarasan sumber skor & label rentang bin histogram (`web/src/components/ChartsView.tsx`)**:
  - Menyelaraskan sumber skor histogram pilihan ganda dengan `analysis.scoring.uses_weighted_score` (`weighted_score` saat pembobotan aktif, `raw_score` saat tidak aktif) agar konsisten dengan statistik deskriptif dan urutan tabel skor peserta.
  - Mengubah label sumbu-X dan tooltip histogram dari batas bawah bin yang dibulatkan (`{bin.low.toFixed(0)}`) menjadi rentang skor aktual peserta yang masuk ke masing-masing bin (mis. `1–2`, `3–4`, `5`, `6–7`, `8–9`).
- **Pembaruan `README.md` & penyegaran peta `graphify-out/`**: Menyelaraskan `README.md` dengan arsitektur web TypeScript murni (`web/src/standalone/`), panduan build & uji banding `scripts/verify_js_python_parity.mjs`, struktur `legacy_python/`, serta memperbarui graf pengetahuan kode `graphify-out/`.
- **Promosi mesin TypeScript & pengarsipan backend Python ke `legacy_python/`**:
  - Mengarahkan `web/src/api/client.ts` dan `web/vite.config.ts` langsung ke mesin TypeScript murni (`web/dist/` dan `dist/itemetri-web-standalone.zip`, `137.734` bita).
  - Memindahkan kode Python (`src/`, `tests/`, `packaging/`, `pyproject.toml`, `passenger_wsgi.py`, `requirements-web.txt`) ke `legacy_python/`, sambil mempertahankan `dist/itemetri-desktop.exe` sebagai rilis desktop Windows versi Python terakhir.
  - Menghapus adaptor Pyodide/CDN (`web/src/workers/pyodideWorker.ts`, `web/src/api/pyodideClient.ts`, `web/.env.pyodide`, `web/vite.standalone.config.ts`, dan `dist/itemetri-web-cpanel.zip`).
- **Pemisahan dependensi opsional di `pyproject.toml`**: Memindahkan `pywebview>=5.3` ke `[project.optional-dependencies]` grup `desktop` dan menambahkan grup `wsgi` (`a2wsgi>=1.10`) agar server web Linux tetap ringan tanpa dependensi desktop Windows.
- **Penyelarasan impor paket `itemetri`**: Memperbarui sisa referensi paket `anates` ke `itemetri` pada modul `src/itemetri/`, `tests/`, `packaging/`, dan `pyproject.toml`.
- **Tombol ekspor per kartu menjadi ikon saja**: Menjadikan tombol salin dan unduh pada tiap kartu hasil (`web/src/components/CardExportBar.tsx`, kelas `.btn-icon-only` pada `web/src/styles/workspace.css`) tampil ringkas sebagai ikon dengan *tooltip* dan `aria-label`, sementara bar ringkasan atas di `web/src/components/ResultsCanvas.tsx` tetap mempertahankan label **Salin Semua** dan **Unduh Laporan**.
- **Penyatuan jalur simpan berkas**: Mengalihkan seluruh unduhan hasil (`.txt`, `.pdf`, `.png`, `.jpg`) di `web/src/utils/resultExport.ts` dan aksi **Simpan Data** (`.ana`, `.xlsx`, `.csv`) di `web/src/App.tsx` melalui `saveBlobWithDialog`.
- **Penanganan error salin clipboard & pembaruan `USER_MANUAL`**: Menambahkan `try/catch` pada `handleCopy()` di `web/src/components/CardExportBar.tsx`, serta menambahkan panduan penggunaan versi web pada `USER_MANUAL.md` dan `USER_MANUAL.pdf`.
- **Target *build* frontend (historis sebelum promosi web standalone)**: Sebelumnya mengarahkan `build.outDir` di `web/vite.config.ts` ke `../src/itemetri/web/static`, lalu disederhanakan menjadi `"dist"` untuk aplikasi web mandiri.

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
