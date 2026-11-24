# DESIGN.md: Arah Desain Visual Itemetri

Dokumen ini mendefinisikan identitas visual resmi aplikasi **Itemetri** berdasarkan sistem token yang telah diverifikasi pada `web/src/styles/tokens.css`.

## Design Read & Dials

> Reading this as: aplikasi analisis evaluasi pembelajaran berbasis web untuk guru dan dosen Indonesia, dalam bahasa visual akademik APA yang tenang dan presisi, dial ENERGY 1 / RHYTHM 2 / MOTION 1.

- `Dial: ENERGY 1 / RHYTHM 2 / MOTION 1`
- **ENERGY 1 (Calm)**: Permukaan bersih, netral, dan terukur tanpa efek dekoratif yang mengalihkan perhatian dari angka dan keputusan kualitas butir soal.
- **RHYTHM 2 (Consistent with purposeful breaks)**: Tata letak kerja *split-pane* yang konsisten (data di kiri, laporan hasil di kanan), dipadukan dengan komposisi *Empty State* asimetris (jalur impor Excel/CSV sebagai fokus utama, diikuti jalur input manual dan data contoh) serta tabel publikasi bergaya APA.
- **MOTION 1 (Functional micro-states)**: Hanya transisi status interaktif (*hover*, *focus-visible*, buka/tutup dialog dan *toggletip*), menghormati `prefers-reduced-motion: reduce`.

---

## Identitas & Karakter Produk

- **Nama Produk**: Itemetri
- **Pengguna Utama**: Guru sekolah dan dosen perguruan tinggi (pengguna non-statistik/non-teknis) yang menganalisis butir soal Pilihan Ganda (PG) dan Uraian.
- **Karakter**: Tenang, jujur, presisi seperti tabel jurnal akademik APA, namun membumi dalam bahasa Indonesia sehari-hari tanpa jargon teknis yang mengintimidasi.

---

## Palet Warna (Core Neutrals + 1 Deliberate Accent + Semantic Status)

Seluruh pasangan warna teks dan latar telah memenuhi ambang kontras minimum WCAG AA (`>= 4.5:1` teks normal, `>= 3.0:1` batas komponen non-teks).

### Mode Terang (Light)
- **Permukaan Netral**: Halaman `#f6f7f9`, Panel `#ffffff`, Permukaan Halus `#eef1f5`, Baris Kunci Terkunci `#e6edf7`
- **Tinta Teks**: Utama `#141b24`, Sekunder `#475467`
- **Batas (Border)**: Halus `#d0d7e2`, Kuat `#64748b`
- **Aksen Utama (1 Deliberate Accent)**: Biru Akademik `#1d4ed8` (tinta di atas aksen `#ffffff`)
- **Status Keputusan Butir (dengan label teks, bukan warna semata)**:
  - **Terima**: teks `#166534` pada latar `#ecfdf3`
  - **Revisi**: teks `#9a3412` pada latar `#fff7ed`
  - **Tolak / Peringatan**: teks `#b42318` pada latar `#fef3f2`

### Mode Gelap (Dark)
- **Permukaan Netral**: Halaman `#11161d`, Panel `#18202a`, Permukaan Halus `#212b38`, Baris Kunci Terkunci `#1d2c42`
- **Tinta Teks**: Utama `#f1f5f9`, Sekunder `#b0becb`
- **Batas (Border)**: Halus `#334155`, Kuat `#8596aa`
- **Aksen Utama**: Biru Terang `#7cb3ff` (tinta di atas aksen `#0b1220`)
- **Status Keputusan Butir**:
  - **Terima**: teks `#86efac` pada latar `#11281b`
  - **Revisi**: teks `#fdba74` pada latar `#2e1c0e`
  - **Tolak / Peringatan**: teks `#fca5a5` pada latar `#2f1414`

---

## Tipografi, Radius, dan Skala Spasi

- **Font Antarmuka (`--font-sans`)**: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` (14px dasar, *line-height* `1.5`) untuk keterbacaan instruksi dan narasi hasil.
- **Font Angka & Kode (`--font-mono`)**: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` disertai `font-variant-numeric: tabular-nums` khusus pada sel kunci/jawaban dan kolom metrik angka.
- **Radius Komponen (Bervariasi sesuai Hierarki)**:
  - Sel tabel / lencana status: `4px` (`--radius-cell`)
  - Tombol / bilah alat: `6px` (`--radius-control`)
  - Kartu laporan / modal dialog: `8px` (`--radius-card`)
- **Skala Spasi Struktural**: `--space-1` (`0.25rem`), `--space-2` (`0.5rem`), `--space-3` (`0.75rem`), `--space-4` (`1rem`), `--space-6` (`1.5rem`).

---

## Alasan Satu Baris tiap Keputusan Desain (Aturan R-31)

- **Warna**: Memakai basis netral slate dengan satu aksen biru akademik `#1d4ed8` (`#7cb3ff` di mode gelap) karena rasio kontrasnya melampaui WCAG AA dan menjaga perhatian guru terpusat pada status keputusan butir soal (`Terima`, `Revisi`, `Tolak`).
- **Layout**: Mempertahankan *split-pane* input kiri dan laporan kanan agar guru dapat menyunting kunci jawaban sambil langsung melihat dampak statistiknya, serta merapikan *Empty State* menjadi 3 jalur tugas yang jelas.
- **Tipografi**: Memadukan sans-serif sistem yang familiar untuk label bahasa Indonesia dan monospace `tabular-nums` pada sel kode/angka agar perbandingan kolom angka di tabel APA selalu sejajar vertikal.
- **Spasi**: Menggunakan skala spasi `--space-1` hingga `--space-6` untuk membedakan kepadatan baris tabel dari jarak antar modul laporan sehingga halaman terasa terstruktur dan mudah dipindai.
- **Kartu & Panel**: Membatasi penggunaan kartu hanya pada modul laporan yang dapat diekspor mandiri, sementara pengaturan lanjutan disembunyikan di balik kontrol `<details>` dan menu ringkas agar layar awal bebas kepadatan berlebih.
- **Ikon**: Hanya menggunakan ikon SVG fungsional (`Upload`, `Download`, `Copy`, `Check`, `Warning`, `Plus`, `Trash`) dengan teks eksplisit dan `aria-hidden="true"`, tanpa emoji dekoratif atau ilustrasi pengisi ruang.
