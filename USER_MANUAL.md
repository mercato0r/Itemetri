# Panduan Pengguna Itemetri

**Analisis kualitas instrumen evaluasi pembelajaran, validitas, reliabilitas, tingkat kesukaran, dan daya pembeda.**

Itemetri adalah aplikasi analisis kualitas butir soal serta reliabilitas instrumen tes berdasarkan *Classical Test Theory* (Teori Tes Klasik, CTT). Aplikasi ini menyatukan alur analisis Pilihan Ganda (`PG`), Uraian (`Ur`), dan lembar kerja campuran `PG + Uraian` ke dalam satu ruang kerja dua panel yang menampilkan tabel data di sisi kiri dan hasil perhitungan di sisi kanan secara seketika. Seluruh pembacaan berkas dan perhitungan berjalan lokal di perangkat Anda tanpa mengirimkan data peserta maupun kunci jawaban ke peladen luar.

Itemetri merupakan perangkat lunak *open source* independen berlisensi MIT yang terinspirasi oleh kontribusi ANATES bagi dunia evaluasi pendidikan di Indonesia. Proyek ini dikembangkan secara terpisah, tidak berafiliasi dengan pencipta ANATES, dan menyediakan dukungan baca serta tulis format `.ana`/`.ANA` agar arsip data pengguna tetap dapat dibuka kembali.

---

## Daftar Isi

- [1. Prasyarat dan Cara Menjalankan](#1-prasyarat-dan-cara-menjalankan)
  - [1.1 Menggunakan Versi Web di Peramban (Utama)](#11-menggunakan-versi-web-di-peramban-utama)
  - [1.2 Menjalankan Aplikasi Desktop Windows (`itemetri-desktop.exe`)](#12-menjalankan-aplikasi-desktop-windows-itemetri-desktopexe)
  - [1.3 Membuka Berkas Langsung dari Terminal (Opsional)](#13-membuka-berkas-langsung-dari-terminal-opsional)
- [2. Panduan Penggunaan Aplikasi](#2-panduan-penggunaan-aplikasi)
  - [Langkah 1. Memilih Jalur Masuk Data dan Mengisi Lembar Kerja](#langkah-1-memilih-jalur-masuk-data-dan-mengisi-lembar-kerja)
  - [Langkah 2. Mengatur Soal, Kunci, dan Indikator (`Atur Soal & Kunci`)](#langkah-2-mengatur-soal-kunci-dan-indikator-atur-soal--kunci)
  - [Langkah 3. Menyesuaikan Opsi Perhitungan dan KKM](#langkah-3-menyesuaikan-opsi-perhitungan-dan-kkm)
  - [Langkah 4. Memeriksa Ringkasan Eksekutif, Diagnosis Butir, dan Grafik](#langkah-4-memeriksa-ringkasan-eksekutif-diagnosis-butir-dan-grafik)
  - [Langkah 5. Menggunakan Alat Lanjutan](#langkah-5-menggunakan-alat-lanjutan)
  - [Langkah 6. Menyimpan Data Mentah dan Mengekspor Laporan](#langkah-6-menyimpan-data-mentah-dan-mengekspor-laporan)
- [3. Fitur yang Tersedia dan Pintasan Papan Ketik](#3-fitur-yang-tersedia-dan-pintasan-papan-ketik)
- [4. Kapabilitas Sistem](#4-kapabilitas-sistem)
  - [4.1 Pengolahan Tiga Jenis Ujian](#41-pengolahan-tiga-jenis-ujian)
  - [4.2 Mesin Hitung Mode Ganda dan Audit Selisih](#42-mesin-hitung-mode-ganda-dan-audit-selisih)
  - [4.3 Ringkasan Eksekutif, Reliabilitas, dan Distribusi Skor](#43-ringkasan-eksekutif-reliabilitas-dan-distribusi-skor)
  - [4.4 Analisis Butir, Pengecoh, Indikator, dan Pretest-Posttest](#44-analisis-butir-pengecoh-indikator-dan-pretest-posttest)
  - [4.5 Grafik Interaktif dan Ekspor Multi-Format](#45-grafik-interaktif-dan-ekspor-multi-format)
  - [4.6 Keamanan Pembacaan Berkas dan Sanitasi Ekspor](#46-keamanan-pembacaan-berkas-dan-sanitasi-ekspor)
- [5. Keterbatasan dan Batasan Teknis](#5-keterbatasan-dan-batasan-teknis)
  - [5.1 Konversi pada Lembar Kerja Campuran (`PG + Uraian`)](#51-konversi-pada-lembar-kerja-campuran-pg--uraian)
  - [5.2 Perilaku Bawaan Mode `ANATES Klasik`](#52-perilaku-bawaan-mode-anates-klasik)
  - [5.3 Ruang Lingkup Metode Psikometri](#53-ruang-lingkup-metode-psikometri)
  - [5.4 Cakupan Pengaruh Skor Dibobot pada PG](#54-cakupan-pengaruh-skor-dibobot-pada-pg)
  - [5.5 Batas Format Berkas, Impor, dan Sesi](#55-batas-format-berkas-impor-dan-sesi)
  - [5.6 Sampel Kecil, Ambang Tetap, dan Format PDF Kartu](#56-sampel-kecil-ambang-tetap-dan-format-pdf-kartu)
- [6. Penjelasan Notasi dan Rumus Perhitungan](#6-penjelasan-notasi-dan-rumus-perhitungan)
  - [6.1 Penyekoran Peserta dan Statistik Deskriptif](#61-penyekoran-peserta-dan-statistik-deskriptif)
  - [6.2 Pemeringkatan, Kelompok Unggul-Asor, dan Uji-t Uraian](#62-pemeringkatan-kelompok-unggul-asor-dan-uji-t-uraian)
  - [6.3 Daya Pembeda (DP_j)](#63-daya-pembeda-textdp_j)
  - [6.4 Tingkat Kesukaran (TK_j) dan Kategorinya](#64-tingkat-kesukaran-texttk_j-dan-kategorinya)
  - [6.5 Korelasi Butir-Total dan Uji Signifikansi](#65-korelasi-butir-total-dan-uji-signifikansi)
  - [6.6 Analisis Pengecoh (Khusus Pilihan Ganda)](#66-analisis-pengecoh-khusus-pilihan-ganda)
  - [6.7 Reliabilitas Tes dan Interpretasinya](#67-reliabilitas-tes-dan-interpretasinya)
  - [6.8 Rekomendasi Keputusan Butir dan Dugaan Salah Kunci](#68-rekomendasi-keputusan-butir-dan-dugaan-salah-kunci)
  - [6.9 Distribusi Skor, Skewness, IQR, dan Ketuntasan KKM](#69-distribusi-skor-skewness-iqr-dan-ketuntasan-kkm)
  - [6.10 Rekap Penguasaan Indikator atau Tujuan Pembelajaran](#610-rekap-penguasaan-indikator-atau-tujuan-pembelajaran)
  - [6.11 Uji Pretest-Posttest: N-Gain Hake dan Uji-t Berpasangan](#611-uji-pretest-posttest-n-gain-hake-dan-uji-t-berpasangan)
- [7. Penyangkalan Verifikasi dan Validasi Ulang](#7-penyangkalan-verifikasi-dan-validasi-ulang)

---

## 1. Prasyarat dan Cara Menjalankan

Itemetri tersedia sebagai aplikasi web yang berjalan penuh di peramban, serta paket desktop Windows siap pakai (`itemetri-desktop.exe`) bagi pengguna yang memerlukan peluncur luring berjendela khusus.

### 1.1 Menggunakan Versi Web di Peramban (Utama)

Versi web Itemetri dirancang ringan agar seluruh pengolahan berjalan langsung di peramban modern (Google Chrome, Microsoft Edge, Mozilla Firefox, atau Safari) dengan respons cepat tanpa perlu instalasi tambahan.

- **Pemrosesan lokal dan seketika**: Pembacaan berkas (`.xlsx`, `.csv`, `.ana`), penyekoran, perhitungan statistik, hingga pembuatan laporan (`.pdf`, `.xlsx`, `.txt`, `.png`, `.jpg`) berlangsung langsung di perangkat Anda tanpa mengirim data ke peladen luar.
- **Penyimpanan dan pengunduhan berkas**: Pada peramban Chromium desktop (Chrome dan Edge), tombol **Simpan Data Mentah** dan **Ekspor Laporan** memunculkan dialog pemilihan folder simpan; pada peramban lain atau perangkat seluler, berkas otomatis masuk ke folder unduhan bawaan peramban.
- **Tampilan responsif**: Pita aksi atas menyesuaikan susunan tombol secara otomatis pada layar sempit agar tetap terbaca tanpa tumpang tindih.

### 1.2 Menjalankan Aplikasi Desktop Windows (`itemetri-desktop.exe`)

Untuk pemakaian di Windows (64-bit) tanpa membuka peramban secara manual, Anda dapat menjalankan berkas `itemetri-desktop.exe`.

1. Buka folder tempat `itemetri-desktop.exe` tersimpan, lalu klik ganda berkas tersebut.
2. Jendela **Itemetri - Analisis Kualitas Instrumen Evaluasi Pembelajaran** akan terbuka dengan ukuran standar `1360 x 860` piksel.
3. Jika Windows SmartScreen menampilkan peringatan saat program dijalankan pertama kali, klik **More info** (*Informasi selengkapnya*) lalu pilih **Run anyway** (*Tetap jalankan*).
4. Pada versi desktop ini, aksi simpan dan unduh membuka dialog *Simpan Sebagai* asli Windows dan mengingat folder simpan terakhir.

### 1.3 Membuka Berkas Langsung dari Terminal (Opsional)

Pada versi desktop Windows, Anda dapat membuka berkas ujian langsung lewat Command Prompt atau PowerShell di folder aplikasi.

```powershell
# Menjalankan aplikasi desktop
.\itemetri-desktop.exe

# Menjalankan aplikasi sambil langsung membuka berkas ujian
.\itemetri-desktop.exe ujian.ana
```

Sebelum menutup aplikasi, pastikan lembar kerja sudah disimpan atau laporan analisisnya telah diekspor karena data sesi tidak tersimpan otomatis ke disk.

---

## 2. Panduan Penggunaan Aplikasi

Ruang kerja Itemetri terbagi menjadi **Pita Aksi** di bagian atas, **Panel Kiri** berupa spreadsheet data peserta, dan **Panel Kanan** berupa kanvas hasil analisis yang diperbarui otomatis setiap kali data dan kunci terisi lengkap.

### Langkah 1. Memilih Jalur Masuk Data dan Mengisi Lembar Kerja

Saat aplikasi baru dibuka dalam keadaan kosong, panel kanan menampilkan tiga jalur cepat yang dapat Anda pilih sesuai sumber data:

1. **Impor Berkas Excel / CSV / ANA (Utama)**:
   - Klik **Impor Excel / CSV** pada pita atas atau tombol pilih berkas pada panel kanan. Jika Anda belum memiliki format tabel, unduh terlebih dahulu **Template PG (.xlsx)** atau **Template Uraian (.xlsx)** langsung dari dialog impor atau tampilan awal.
   - Saat berkas `.xlsx` atau `.csv` dipilih, Itemetri langsung melakukan **deteksi ringkas satu baris** untuk mengenali kolom soal, kolom `Nama Lengkap` atau `Peserta`, serta mengabaikan kolom metadata ekspor Google Forms maupun LMS (`Timestamp`, `Email Address`, `Score`, `NISN`, `Kelas`, dan sejenisnya) secara otomatis. Jika perlu meninjau atau mengubah pemetaan secara manual, klik **Sesuaikan Kolom & Baris** untuk membuka pratinjau `6` baris pertama dan `12` kolom pertama, mengatur baris judul, baris kunci/skor ideal, jenis butir (`Otomatis`, `PG`, atau `Uraian`), serta jumlah opsi PG, lalu klik **Impor & Analisis**. Saat dialog ditutup, pilihan berkas sebelumnya otomatis dibersihkan agar siap untuk impor berikutnya.
2. **Input Manual atau Tempel Langsung dari Excel**:
   - Klik **Lembar Baru** untuk membuka dialog **Buat Lembar Kerja Baru**. Di sana Anda dapat memilih jenis soal (`Pilihan Ganda` atau `Uraian`), jumlah butir, jumlah pilihan jawaban (`2` hingga `26`), serta mengisi **Input Cepat Kunci** (atau **Skor Ideal**) sejak awal sebelum menekan **Buat Lembar Kerja**. Lembar baru otomatis menyediakan `15` baris peserta yang bertambah dinamis saat Anda mengetik atau menempel data.
   - Jika data sudah ada di Excel atau Google Sheets, salin blok tabel tersebut (`Ctrl+C`), lalu klik **Tempel dari Excel** atau tekan `Ctrl+V` di sel awal spreadsheet kiri. Itemetri otomatis mengenali baris judul kolom, baris `Kunci`, dan kolom `Nama Peserta`, serta memperluas jumlah baris dan kolom mengikuti blok yang ditempel.
   - Pada spreadsheet kiri, jawaban huruf PG otomatis diubah ke huruf kapital, dan skor Uraian mendukung tanda koma desimal lokal Indonesia (misalnya `7,5` otomatis dibaca sebagai `7.5`). Sel kosong pada PG maupun Uraian dapat dibiarkan kosong atau diisi tanda `*` dan `#`.
   - Jika ada isian sel yang tidak sesuai (misalnya huruf di luar jumlah opsi atau skor melebihi skor ideal), bilah peringatan validasi muncul langsung di atas tabel kiri untuk memberi tahu lokasi sel yang perlu diperiksa.
3. **Coba Data Contoh (Simulasi)**:
   - Pada tampilan awal atau dialog impor, tersedia dua data simulasi bawaan untuk Pilihan Ganda dan Uraian agar Anda dapat langsung mencoba seluruh fitur analisis tanpa menyiapkan berkas sendiri.

> [!IMPORTANT]
> **Gerbang Kunci Kosong**: Lembar kerja baru atau berkas impor tanpa baris kunci membiarkan baris `Kunci` kosong dengan penanda `[Isi]`. Selama kunci jawaban atau skor ideal belum terisi lengkap, panel kanan menampilkan kartu **Kunci Jawaban / Skor Ideal Belum Lengkap** dan menahan perhitungan statistik agar tidak terjadi penilaian keliru menggunakan kunci bawaan diam-diam. Klik tombol isi kunci pada kartu tersebut untuk langsung melengkapinya.

### Langkah 2. Mengatur Soal, Kunci, dan Indikator (`Atur Soal & Kunci`)

1. Buka laci pengaturan dengan mengeklik **Atur Soal & Kunci** di pita aksi (tombol ini menampilkan jumlah butir yang kuncinya belum terisi), mengeklik ganda tajuk kolom (`B1`, `B2`, ...), atau mengeklik lencana tipe (`PG` / `Ur`).
2. Pada tab pertama (**Kunci & Skor Ideal**), gunakan kotak **Input Cepat Kunci PG** untuk mengetik deretan huruf kunci secara beruntun (misalnya `ABCDABCDAB`) lalu terapkan sekaligus, atau gunakan **Input Cepat Skor Ideal Uraian** untuk memasukkan satu angka seragam maupun daftar skor ideal yang dipisah spasi atau koma.
3. Pada bagian pengaturan per butir, Anda dapat mengganti nomor butir, memilih tipe (**Otomatis**, **Pilihan Ganda**, atau **Uraian**), menyunting kunci/skor ideal, serta mengatur **Jumlah opsi PG (K)** antara `2` sampai `26`. Tombol **Semua Otomatis**, **Semua ke PG**, dan **Semua ke Uraian** mengubah tipe seluruh kolom sekaligus, sedangkan **Sebelumnya** dan **Berikutnya** memindahkan fokus antarbutir tanpa menutup laci.
4. Pada tab kedua (**Indikator / TP Butir**), Anda dapat menamai indikator atau Tujuan Pembelajaran (TP) tiap butir soal (baik per baris maupun tempel daftar sekaligus) lalu menekan **Simpan Indikator** agar kartu **Capaian & Kualitas per Indikator** tampil otomatis di panel hasil.

### Langkah 3. Menyesuaikan Opsi Perhitungan dan KKM

Secara bawaan, panel **Pengaturan Perhitungan** dalam keadaan tertutup agar **Ringkasan Eksekutif Evaluasi** langsung tampil di posisi paling atas. Klik tombol **Pengaturan** di pita aksi jika Anda ingin menyesuaikan pengaturan berikut:

- **Mode Kompatibilitas**: Pilih **Standar Terkoreksi** (bawaan, otomatis memakai korelasi terkoreksi $r_{\text{corr}}$) untuk perhitungan psikometri baku, atau **ANATES Klasik (Paritas Biner)** (otomatis memakai korelasi mentah $r$) jika Anda perlu mencocokkan angka dengan keluaran ANATES versi lama.
- **Kelompok Unggul/Asor (%)**: Isi angka `1` sampai `50`, atau klik pintasan **27% (Kelompok Ekstrem)** untuk sampel sedang hingga besar dan **50% (Median Split)** untuk sampel kecil.
- **KKM / Batas Lulus (opsional)**: Masukkan nilai batas ketuntasan belajar jika Anda ingin ringkasan distribusi skor ikut menghitung jumlah dan persentase peserta yang tuntas. Kosongkan jika tidak diperlukan.
- **Pengaturan Lanjutan (lipatan opsional)**: Di dalam lipatan opsi penyekoran dan metodologi lanjutan, Anda dapat mengatur **Bobot Jawaban Benar & Salah (PG)** (bawaan `1` dan `0`), mencentang **Gunakan Skor Dibobot**, memilih **Cakupan Tingkat Kesukaran Uraian** (**Seluruh Peserta (N)** atau **Kelompok Unggul + Asor (2n)**), mengubah penggunaan korelasi terkoreksi ($r_{\text{corr}}$), serta mengatur tampilan interpretasi reliabilitas.

### Langkah 4. Memeriksa Ringkasan Eksekutif, Diagnosis Butir, dan Grafik

1. Setelah data dan kunci lengkap, panel kanan menghitung ulang seketika secara otomatis. Anda dapat mengeklik ikon tanda tanya **`?`** di samping istilah statistik (`Alpha Cronbach`, `KR-20`, `DP(%)`, `TK(%)`, `r`, `α(-j)`, `27%`, dan korelasi terkoreksi) untuk membaca penjelasan dalam bahasa awam, lalu menekan `Escape` atau klik di luar untuk menutupnya.
2. **Ringkasan Eksekutif Evaluasi** di bagian atas menyajikan status kualitas instrumen (`Baik`, `Cukup`, atau `Perlu Perbaikan`), **3 ubin metrik inti** (**Reliabilitas Utama**, **Rata-rata Kelas**, dan **Kelayakan Butir**), serta jawaban singkat atas tiga pertanyaan praktis: kelayakan instrumen, daftar butir yang perlu dipertahankan atau diperbaiki, dan kesimpulan capaian peserta (termasuk bentuk distribusi skor dan ketuntasan KKM jika diisi). Setiap kartu hasil juga dapat dilipat atau dibuka kembali lewat tombol lipat di judul kartu.
3. Pada kartu **Analisis Butir Soal**:
   - **Matriks Kualitas Butir** tampil menyatu di bagian atas tabel untuk memindai status seluruh soal secara visual dalam satu pandangan.
   - Secara bawaan, tabel menampilkan **6 kolom inti** (`No`, `Kunci/Ideal`, `TK(%)`, `DP(%)`, `r_corr`, `Keputusan`) agar mudah dibaca. Aktifkan sakelar **Kolom teknis lengkap** jika Anda ingin melihat seluruh kolom metrik rinci.
   - Gunakan tombol filter cepat **Rekap Keputusan** (`Semua`, `Diterima`, `Perlu Revisi`, `Ditolak`), filter **Kategori TK**, atau kotak **Cari butir**.
   - Klik tajuk kolom untuk mengurutkan butir menurut metrik tertentu, atau klik satu baris butir untuk membuka panel **Diagnosis Keputusan Butir** (yang merinci nilai aktual terhadap ambang batas beserta saran tindak lanjut) sekaligus menyorot detail butir tersebut pada kartu **Detail Butir & Pengecoh**.
4. Pada kartu **Detail Butir & Pengecoh** (khusus PG murni), Anda dapat beralih antara tampilan **Detail Butir** (grafik batang per opsi dengan frekuensi `Atas / Bawah` dan status `Berfungsi` atau `Lemah`) dan **Matriks Semua** (ringkasan seluruh butir dalam satu tabel).
5. Kartu **Skor Peserta Terurut Menurun** di bagian bawah dapat dilipat atau dibuka untuk melihat peringkat seluruh peserta beserta jumlah betul, salah, kosong, skor akhir, dan skor dibobot.

### Langkah 5. Menggunakan Alat Lanjutan

Menu **Alat Lanjutan** di pita aksi menghimpun tiga fitur tambahan:

1. **Gabung Berkas**: Menggabungkan dokumen aktif dengan berkas kedua (`.ana`, `.csv`, `.xlsx`, atau data contoh) baik secara **Tambah Peserta (Gabung Baris)** maupun **Tambah Butir Soal (Gabung Kolom)**. Centang opsi izin perbedaan kunci jika dua berkas yang digabung barisnya memiliki sedikit perbedaan kunci; sistem akan mempertahankan acuan berkas pertama disertai catatan peringatan.
2. **Uji Pretest-Posttest**: Membuka jendela untuk mengunggah atau memilih data Pretest dan Posttest. Sistem mencocokkan peserta berdasarkan nama (atau urutan indeks jika nama tidak cocok), lalu menghitung selisih skor, N-Gain Hake individual maupun rata-rata kelas, serta uji-$t$ berpasangan.
3. **Audit ANATES Klasik**: Menampilkan atau menyembunyikan kartu pembanding selisih angka dan status antara mode `Standar Terkoreksi` dan mode `ANATES Klasik` pada data yang sama.

*(Catatan: Pemetaan **Indikator / TP Butir** tersedia langsung sebagai tab kedua di dalam laci **Atur Soal & Kunci** pada Langkah 2.)*

### Langkah 6. Menyimpan Data Mentah dan Mengekspor Laporan

1. Klik **Simpan Data Mentah** di bilah atas untuk menyimpan data peserta beserta kunci jawaban/skor ideal dari spreadsheet kiri ke format `.ana`, `.xlsx`, atau `.csv`.
2. Klik **Salin Laporan** di bilah atas untuk menyalin seluruh ringkasan hasil analisis ke papan klip (dalam format tabel rapi untuk Word/Google Docs dan teks bertab untuk Excel), atau klik tombol utama **Ekspor Laporan** untuk mengunduh laporan lengkap ke format `Laporan PDF (.pdf)` multi-halaman A4, `Tabel Excel (.xlsx)`, `Teks / Word (.txt)`, `Gambar PNG (.png)`, atau `Gambar JPG (.jpg)`.
3. Setiap kartu hasil di panel kanan juga dilengkapi tombol ikon salin dan unduh tersendiri jika Anda hanya membutuhkan satu bagian tertentu.

---

## 3. Fitur yang Tersedia dan Pintasan Papan Ketik

Susunan kontrol antarmuka dirinci dalam Tabel 1, sedangkan pintasan papan ketik untuk navigasi sel dan pembatas panel tercantum dalam Tabel 2.

**Tabel 1.** Daftar tombol dan kontrol modul pada antarmuka Itemetri.

| Kelompok | Nama Kontrol | Fungsi |
|---|---|---|
| Bilah Atas | `Lembar Baru` | Membuka dialog pembuatan lembar kerja baru beserta pilihan jenis soal, jumlah butir, dan kunci cepat |
| Bilah Atas | `Impor Excel / CSV` | Membuka dialog unggah `.xlsx`, `.csv`, `.ana`, unduhan template Excel, dan data contoh |
| Bilah Atas | `Simpan Data Mentah` | Menyimpan matriks data peserta dan acuan kunci/ideal dari panel kiri ke `.ana`, `.xlsx`, atau `.csv` |
| Bilah Atas | `Salin Laporan` | Menyalin seluruh hasil analisis aktif ke papan klip dalam format tabel APA dan teks bertab |
| Bilah Atas | `Ekspor Laporan` | Mengunduh seluruh laporan analisis ke `.pdf`, `.xlsx`, `.txt`, `.png`, atau `.jpg` |
| Bilah Atas | `Terang` / `Gelap` | Mengubah skema warna antarmuka dan menyimpan preferensi tema di peramban |
| Bilah Atas | `? Panduan` | Membuka halaman panduan pengguna lengkap beserta rumus perhitungan (`/user_manual`) di tab baru |
| Pita Data | `Undo` / `Redo` | Membatalkan atau mengulangi perubahan sel, pengaturan butir, dan penggabungan hingga `50` langkah |
| Pita Data | `Baris & Kolom` | Menu dropdown berisi `+ Peserta`, `+ Butir`, `Hapus Baris`, dan `Hapus Butir` |
| Pita Data | `Atur Soal & Kunci` | Membuka laci pengisian cepat kunci/skor ideal, pengaturan tiap butir, dan tab **Indikator / TP Butir** |
| Pita Data | `Pengaturan` | Menampilkan atau menyembunyikan kartu **Pengaturan Perhitungan** di panel kanan |
| Pita Data | `Alat Lanjutan` | Menu pop-up berisi `Gabung Berkas`, `Uji Pretest-Posttest`, dan `Audit ANATES Klasik` |
| Pembatas Panel | Garis pemisah tengah | Menggeser perbandingan lebar panel kiri terhadap panel kanan dari `28%` hingga `72%` |

**Tabel 2.** Pintasan papan ketik pada spreadsheet, panel bantuan istilah, dan pembatas panel.

| Konteks | Tombol Pintasan | Fungsi |
|---|---|---|
| Navigasi Sel | `Panah` (`Atas`, `Bawah`, `Kiri`, `Kanan`) | Memindahkan fokus antarsel, termasuk ke baris `Kunci` dan kolom `Nama Peserta` |
| Seleksi Rentang | `Shift + Panah` | Memperluas blok seleksi sel dari sel jangkar ke posisi fokus |
| Pindah Kolom | `Tab` / `Shift + Tab` | Berpindah ke sel kanan atau sel kiri sambil menyimpan ketikan aktif |
| Sunting Sel | `Enter`, `F2`, klik ganda, atau ketik 1 karakter | Membuka editor sel; menekan `Enter` saat menyunting akan menyimpan dan turun satu baris |
| Batal & Tutup | `Escape` | Membatalkan suntingan sel yang belum disimpan, menutup menu pop-up, atau menutup panel bantuan (`?`) |
| Hapus Isi | `Delete` atau `Backspace` | Mengosongkan isi seluruh sel pada rentang seleksi aktif |
| Papan Klip Sel | `Ctrl + C` / `Ctrl + V` | Menyalin blok sel sebagai tabel atau menempel blok tabel dari Excel dengan pemetaan otomatis |
| Riwayat Sunting | `Ctrl + Z` / `Ctrl + Y` (atau `Ctrl + Shift + Z`) | Menjalankan `Undo` atau `Redo` |
| Pembatas Panel | `ArrowLeft`, `ArrowRight`, `Home` | Menggeser batas panel sebesar `3%` ke kiri/kanan atau mengembalikan ke `50%` |

---

## 4. Kapabilitas Sistem

Seluruh pengolahan data di Itemetri berjalan langsung di perangkat pengguna sehingga pembaruan tabel, penyaringan butir, dan ekspor laporan berlangsung cepat tanpa menunggu antrean peladen.

### 4.1 Pengolahan Tiga Jenis Ujian

Aplikasi mengolah ujian Pilihan Ganda murni dengan `2` hingga `26` opsi jawaban (`A` sampai `Z`), ujian Uraian murni dengan skor angka tak negatif dan skor ideal tersendiri per butir, serta lembar kerja Campuran `PG + Uraian` dalam satu tampilan kerja.

### 4.2 Mesin Hitung Mode Ganda dan Audit Selisih

Mode **Standar Terkoreksi** memakai perhitungan desimal presisi penuh, distribusi-$t$ kontinu pada $\text{df} = N - 2$, serta batas kategori tingkat kesukaran tanpa celah. Mode **ANATES Klasik** mempertahankan perilaku perhitungan arsip `.ana` versi lama. Selisih angka maupun pergeseran status antarkedua mode pada data yang sama dapat diperiksa langsung melalui **Audit ANATES Klasik** di menu **Alat Lanjutan**.

### 4.3 Ringkasan Eksekutif, Reliabilitas, dan Distribusi Skor

Itemetri menghitung reliabilitas Belah Dua Spearman-Brown ($r_{XY}$ dan $r_{tt}$), Alpha Cronbach ($\alpha$), serta Alpha jika butir dihapus ($\alpha_{-j}$). Khusus pada Pilihan Ganda murni, sistem juga menghitung KR-20 dan KR-21. Selain rata-rata, simpangan baku, minimum, median, maksimum, skor ideal teoretis, dan capaian persentase rata-rata, aplikasi menyusun **Ringkasan Eksekutif Evaluasi** serta ringkasan distribusi skor (*skewness*, rentang antarkuartil IQR, deteksi *floor/ceiling effect*, dan persentase ketuntasan KKM).

### 4.4 Analisis Butir, Pengecoh, Indikator, dan Pretest-Posttest

Untuk setiap butir, sistem menghitung Daya Pembeda (`DP%`), Tingkat Kesukaran (`TK%`) beserta kategorinya, uji-$t$ Welch kelompok Unggul-Asor pada butir Uraian, serta korelasi butir-total mentah ($r$) dan terkoreksi ($r_{\text{corr}}$). Pada PG murni, sistem mengevaluasi tiap opsi pengecoh berdasarkan Indeks Pengecoh (`IP%`) dan sebaran pemilih kelompok Atas dibanding Bawah. Seluruh indikator dirangkum menjadi keputusan butir (`Terima`, `Revisi`, atau `Tolak`), panel diagnosis kriteria, matriks kualitas visual, penanda `Salah Kunci?`, rekap penguasaan per Indikator/TP, serta analisis perbandingan Pretest-Posttest (N-Gain Hake dan uji-$t$ berpasangan).

### 4.5 Grafik Interaktif dan Ekspor Multi-Format

Panel grafik menyajikan histogram sebaran skor total peserta (dengan rentang skor aktual pada setiap bin), diagram pencar `P%` vs `D%` yang dapat diklik untuk memilih butir, serta grafik batang distribusi opsi PG atau tabel perbandingan rata-rata Unggul vs Asor untuk Uraian. Hasil dapat disalin sebagai tabel bergaya APA ke papan klip atau diunduh dalam format `.pdf`, `.xlsx`, `.txt`, `.png`, dan `.jpg`, sedangkan data mentah dapat disimpan sebagai `.ana`, `.xlsx`, atau `.csv`.

### 4.6 Keamanan Pembacaan Berkas dan Sanitasi Ekspor

Pembaca berkas `.ana` dan `.xlsx` memproses data sepenuhnya di perangkat pengguna tanpa menjalankan skrip luar dan tanpa akses jaringan. Pembaca `.xlsx` menerapkan batas aman ukuran berkas dan dimensi lembar kerja, sedangkan pengekspor `.csv` dan `.xlsx` melindungi sel teks dengan menambahkan tanda kutip tunggal (`'`) pada awal teks yang dimulai dengan karakter `=`, `+`, `-`, `@`, atau tab agar tidak terbaca sebagai rumus berbahaya oleh aplikasi spreadsheet.

---

## 5. Keterbatasan dan Batasan Teknis

Setiap batas teknis berikut berlaku pada aplikasi ini agar pengguna tidak salah menafsirkan keluaran analisis.

### 5.1 Konversi pada Lembar Kerja Campuran (`PG + Uraian`)

Jika satu lembar kerja memadukan kolom Pilihan Ganda dan kolom Uraian secara bersamaan, aplikasi mengolah seluruh kolom tersebut mengikuti perhitungan ujian Uraian. Pada konversi tersebut, jawaban benar PG diberi skor sebesar bobot benar (atau `1` jika bobot benar $\le 0$), sedangkan bobot salah dibatasi minimal `0` sehingga penalti skor negatif tidak diterapkan pada lembar campuran. Karena seluruhnya diproses sebagai Uraian, modul pengecoh (`IP%`, Atas/Bawah), KR-20, dan KR-21 tidak tampil, dan penyimpanan via **Simpan Data Mentah** akan menyimpan kolom PG sebagai angka skor alih-alih huruf jawaban asli.

### 5.2 Perilaku Bawaan Mode `ANATES Klasik`

Mode **ANATES Klasik** hanya ditujukan untuk kesesuaian dengan arsip historis `.ana`, sehingga mempertahankan lima perilaku program lama:

- Pada belah dua Pilihan Ganda, indeks ganjil dan genap tertukar, butir terakhir $M$ tidak diikutkan, dan $r_{XY}$ dibulatkan ke presisi desimal tunggal sebelum masuk ke rumus Spearman-Brown.
- Uji signifikansi korelasi membandingkan $r$ terhadap tabel ambang 14 baris menggunakan jumlah butir $M$, bukan $\text{df} = N - 2$, tanpa menghitung nilai $p$.
- Pemetaan kategori tingkat kesukaran menyisakan celah pada $(30, 31]$ dan $(70, 71]$ yang keduanya digolongkan menjadi `Sangat Mudah`.
- Galat baku gabungan pada uji-$t$ Uraian memakai ukuran kelompok nominal $n$ walaupun terdapat entri kosong, serta tidak menghasilkan nilai $p$.
- Opsi **Gunakan Skor Dibobot** pada PG dan cakupan tingkat kesukaran Uraian **Seluruh Peserta (N)** dinonaktifkan pada mode ini.

### 5.3 Ruang Lingkup Metode Psikometri

Itemetri hanya menerapkan metode Teori Tes Klasik (CTT) beserta statistik deskriptif, N-Gain, dan uji-$t$ berpasangan. Analisis Teori Respons Butir (*Item Response Theory*, seperti model Rasch, 2PL, atau 3PL), analisis faktor, maupun reliabilitas antarpenilai (*inter-rater reliability*) tidak tersedia di aplikasi ini.

### 5.4 Cakupan Pengaruh Skor Dibobot pada PG

Saat opsi **Gunakan Skor Dibobot** diaktifkan pada ujian PG murni di mode Standar Terkoreksi, nilai bobot benar ($w_b$) dan salah ($w_s$) ikut menentukan skor akhir peserta. Perubahan tersebut juga memengaruhi rata-rata, simpangan baku, pengurutan kelompok Unggul-Asor, serta korelasi $r_j$ dan $r_{\text{corr},j}$. Sebaliknya, perhitungan reliabilitas ($r_{tt}$, $\alpha$, KR-20, KR-21, dan $\alpha_{-j}$) tetap memakai matriks biner benar/salah $\{0, 1\}$.

### 5.5 Batas Format Berkas, Impor, dan Sesi

- Ukuran berkas unggahan di aplikasi dibatasi maksimal `20 MB`. Untuk berkas `.xlsx`, ukuran isi berkas setelah dibuka dibatasi maksimal `50 MB` dengan batas dimensi `50.000` baris dan `5.000` kolom. Format Excel biner lama `.xls` tidak didukung langsung; simpan ulang ke `.xlsx` atau `.csv` terlebih dahulu.
- Berkas `.ana` yang didukung hanya skema versi `4.0.1` (Pilihan Ganda) dan `2.0.1` (Uraian).
- Pembaca berkas `.xlsx` memproses lembar kerja (*sheet*) pertama atau yang aktif pada berkas Excel; pemilih nama sheet belum tersedia di dialog Impor.
- Jumlah opsi PG dibatasi `2` sampai `26` huruf (`A` sampai `Z`) dengan satu huruf per sel jawaban. Pada Uraian, skor peserta harus berupa angka berhingga $\ge 0$ dengan skor ideal $> 0$. Skor yang melebihi skor ideal memunculkan peringatan validasi, tetapi tetap diikutkan dalam perhitungan.
- Penggabungan dua berkas (`Gabung Berkas`) hanya berlaku untuk dua ujian berjenis sama yang jumlah butirnya sama (untuk gabung peserta) atau jumlah pesertanya sama (untuk gabung butir).
- Riwayat `Undo` dan `Redo` menyimpan maksimal `50` perubahan terakhir di dalam memori sesi. Isi lembar kerja tidak otomatis tersimpan ke disk saat tab peramban atau jendela aplikasi ditutup.

### 5.6 Sampel Kecil, Ambang Tetap, dan Format PDF Kartu

Pada data berjumlah peserta sangat kecil, misalnya $N = 1$ dengan irisan `27%` yang menghasilkan $n = 0$ atau $N \le 2$ yang menghasilkan $\text{df} \le 0$, sebagian metrik bernilai `NAN`. Hal yang sama berlaku jika suatu butir memiliki variansi nol karena seluruh peserta memberi jawaban seragam. Khusus untuk himpunan yang hanya berisi satu angka ($m = 1$), simpangan baku mengembalikan nilai tunggal itu sendiri ($s = x_1$).

Ambang batas keputusan butir (`Terima`, `Revisi`, `Tolak`) dan syarat proporsi minimum pengecoh (`2%`) ditetapkan tetap di dalam aplikasi sehingga belum dapat diubah lewat antarmuka. Berkas **Laporan PDF (.pdf)** dari aplikasi juga disimpan sebagai halaman gambar di dalam berkas PDF, sehingga teksnya tidak dapat disorot atau disalin langsung. Gunakan aksi **Salin Laporan**, **Tabel Excel (.xlsx)**, atau **Teks / Word (.txt)** jika Anda membutuhkan laporan teks terstruktur yang dapat disunting.

---

## 6. Penjelasan Notasi dan Rumus Perhitungan

Bagian ini merangkum seluruh rumus statistik dan analitik yang digunakan di dalam Itemetri. Indeks peserta ditulis $i \in \{1, \dots, N\}$ dan indeks butir ditulis $j \in \{1, \dots, M\}$, dengan arti tiap simbol tercantum dalam Tabel 3.

**Tabel 3.** Daftar simbol matematika yang dipakai pada perhitungan Itemetri.

| Simbol | Arti Matematis | Keterangan / Domain |
|---|---|---|
| $N$ | Jumlah peserta (subjek) ujian | Bilangan bulat, $N \ge 1$ |
| $M$ | Jumlah butir soal | Bilangan bulat, $M \ge 1$ |
| $K$ | Jumlah opsi jawaban (khusus PG) | Bilangan bulat, $2 \le K \le 26$ |
| $u_i$ | Indeks urutan asal peserta ke-$i$ | Pemecah seri peringkat, dimulai dari `0` |
| $\tilde{k}_j$ | Kunci jawaban huruf kapital butir PG $j$ | Huruf tunggal `A` sampai `Z` |
| $\tilde{a}_{i,j}$ | Jawaban huruf kapital peserta $i$ pada butir PG $j$ | Huruf atau tanda kosong (`*`, `#`) |
| $X_{i,j}$ | Skor dikotomis butir PG $j$ peserta $i$ | `1` jika $\tilde{a}_{i,j} = \tilde{k}_j$, selain itu `0` |
| $W_{i,j}$ | Indikator jawaban salah butir PG $j$ peserta $i$ | `1` jika salah (bukan `*`/`#`), selain itu `0` |
| $w_b, w_s$ | Bobot jawaban benar dan bobot jawaban salah (PG) | Bawaan $w_b = 1{,}0$ dan $w_s = 0{,}0$ |
| $C_{i,j}$ | Kontribusi aktual butir $j$ terhadap skor aktif $Y_i$ | $X_{i,j}$ (mentah) atau $w_b X_{i,j} + w_s W_{i,j}$ (dibobot) |
| $s_{i,j}$ | Skor mentah Uraian peserta $i$ pada butir $j$ | Bilangan $\ge 0$ atau kosong (tidak diisi) |
| $\tilde{s}_{i,j}$ | Skor Uraian terisi dengan sel kosong bernilai `0` | Dipakai pada skor total dan korelasi butir |
| $S_{\text{maks},j}$ | Skor ideal maksimum butir Uraian $j$ | Angka positif ($> 0$) |
| $Y_i$ | Skor aktif total peserta $i$ dalam analisis | Skor Akhir, Skor Dibobot, atau Skor Total |
| $R_{i,j}$ | Skor sisa peserta $i$ tanpa kontribusi butir $j$ | $R_{i,j} = Y_i - C_{i,j}$ |
| $p_{\text{UL}}$ | Persentase pemotongan kelompok Unggul dan Asor | Rentang $(0, 50]$, bawaan $27{,}0\%$ |
| $n$ | Ukuran nominal masing-masing kelompok Unggul dan Asor | Hasil pembulatan *banker's rounding* |
| $U, L$ | Himpunan peserta kelompok Unggul dan Asor | $n$ skor tertinggi dan $n$ skor terendah |
| $n_{U,j}, n_{L,j}$ | Banyaknya skor Uraian terisi butir $j$ pada $U$ dan $L$ | Penyebut uji-$t$ mode Standar Terkoreksi |
| $B_{a,j}, B_{b,j}$ | Jumlah jawaban benar PG butir $j$ pada $U$ dan $L$ | Dihitung dari $X_{i,j}$ |
| $J_j$ | Jumlah seluruh peserta yang menjawab benar butir PG $j$ | $J_j = \sum_{i=1}^N X_{i,j}$ |
| $\text{Sum}_{U,j}, \text{Sum}_{L,j}$ | Jumlah skor Uraian terisi butir $j$ pada $U$ dan $L$ | Penjumlahan atas $\mathcal{U}_j$ dan $\mathcal{L}_j$ |
| $\text{SE}_{\text{gab},j}$ | Galat baku gabungan antara rata-rata $U$ dan $L$ (Uraian) | Penyebut statistik uji-$t$ |
| $t_j$ | Nilai statistik uji-$t$ pembeda kelompok $U$ dan $L$ | Khusus Uraian / Campuran |
| $\nu_{\text{W},j}$ | Derajat bebas Welch-Satterthwaite butir Uraian $j$ | Khusus mode Standar Terkoreksi |
| $\text{DP}_j, \text{TK}_j$ | Indeks Daya Pembeda dan Tingkat Kesukaran butir $j$ | Dinyatakan dalam persen ($\%$) |
| $r_j, r_{\text{corr},j}$ | Korelasi Pearson *part-whole* dan korelasi *item-rest* | Rentang $[-1, 1]$ atau `NAN` |
| $\text{df}$ | Derajat bebas uji signifikansi korelasi | $\text{df} = N - 2$ pada mode Standar Terkoreksi |
| $\text{ideal}_j, \text{IP}_{j,o}$ | Frekuensi pemilih ideal pengecoh dan Indeks Pengecoh opsi $o$ | Khusus Pilihan Ganda |
| $f_{j,o}, u_{j,o}, l_{j,o}$ | Frekuensi pemilih opsi $o$ (total, kelompok $U$, kelompok $L$) | Dipakai pada `IP%` dan fungsi pengecoh |
| $r_{XY}, r_{tt}$ | Korelasi belahan ganjil-genap dan reliabilitas Spearman-Brown | Rentang hingga $\le 1{,}0$ |
| $\alpha, \alpha_{-j}$ | Koefisien Alpha Cronbach dan Alpha jika butir $j$ dihapus | Reliabilitas konsistensi internal |
| $\text{KR-20}, \text{KR-21}$ | Koefisien Kuder-Richardson 20 dan 21 | Khusus Pilihan Ganda |
| $G_1, \text{IQR}$ | Koefisien kemencengan (*skewness*) dan rentang antarkuartil | Statistik bentuk sebaran skor |
| $g$ | Indeks *Normalized Gain* (N-Gain Hake) | Evaluasi selisih Pretest dan Posttest |

### 6.1 Penyekoran Peserta dan Statistik Deskriptif

Pada Pilihan Ganda, skor mentah dan skor dibobot peserta ke-$i$ dihitung dari banyaknya jawaban benar ($X_{i,j}$) serta salah ($W_{i,j}$), sedangkan sel kosong mendapat kontribusi nol pada keduanya.

$$
\text{SkorAkhir}_i = \sum_{j=1}^{M} X_{i,j}, \qquad
\text{SkorDibobot}_i = w_b \sum_{j=1}^{M} X_{i,j} + w_s \sum_{j=1}^{M} W_{i,j}
$$

Pada Uraian, sel kosong dipetakan menjadi $0{,}0$ di $\tilde{s}_{i,j}$ untuk membentuk skor total $\text{SkorTotal}_i = \sum_{j=1}^{M} \tilde{s}_{i,j}$. Rata-rata $\bar{T}$ dan simpangan baku sampel $s$ atas vektor skor aktif $(Y_1, \dots, Y_N)$ memakai pembagi $N - 1$ untuk $N > 1$ (dan bernilai $s = Y_1$ jika $N = 1$).

$$
\bar{T} = \frac{1}{N} \sum_{i=1}^{N} Y_i, \qquad
s = \sqrt{\frac{1}{N - 1} \sum_{i=1}^{N} (Y_i - \bar{T})^2} \quad (N > 1)
$$

Skor ideal maksimum tes ($S_{\text{ideal,total}}$) bernilai $M$ untuk PG mentah, $w_b \cdot M$ untuk PG dibobot, dan $\sum_{j=1}^{M} S_{\text{maks},j}$ untuk Uraian. Capaian persentase rata-rata dihitung dengan membagi rata-rata skor terhadap skor ideal total: $\text{Rata-rata \%} = (\bar{T} / S_{\text{ideal,total}}) \times 100\%$.

### 6.2 Pemeringkatan, Kelompok Unggul-Asor, dan Uji-$t$ Uraian

Peserta diurutkan menurut skor aktif $Y_i$ menurun, dan skor yang sama dipecah berdasarkan urutan asal $u_i$ menaik agar urutannya tetap konsisten. Ukuran masing-masing kelompok Unggul ($U$) dan Asor ($L$) dihitung dengan pembulatan ke bilangan genap terdekat (*banker's rounding*, $\operatorname{ROUND}_{\text{even}}$).

$$
n = \min\!\left(\operatorname{ROUND}_{\text{even}}\!\left(\frac{p_{\text{UL}} \cdot N}{100{,}0}\right),\ N\right)
$$

Kelompok $U$ mengambil $n$ peserta peringkat teratas dan kelompok $L$ mengambil $n$ peserta peringkat terbawah. Khusus pada butir Uraian, sel kosong dikeluarkan dari himpunan data valid ($\mathcal{U}_j$ dan $\mathcal{L}_j$) sebelum menghitung rata-rata kelompok ($\bar{X}_{U,j}, \bar{X}_{L,j}$) maupun simpangan bakunya ($\text{SD}_{U,j}, \text{SD}_{L,j}$). Galat baku gabungan dan statistik $t_j$ dirumuskan sebagai berikut.

$$
\text{SE}_{\text{gab},j} = \sqrt{\frac{\text{SD}_{U,j}^2}{d_{U,j}} + \frac{\text{SD}_{L,j}^2}{d_{L,j}}}, \qquad
t_j = \frac{\bar{X}_{U,j} - \bar{X}_{L,j}}{\text{SE}_{\text{gab},j}}
$$

Penyebut $(d_{U,j}, d_{L,j})$ memakai cacah valid aktual $(n_{U,j}, n_{L,j})$ pada mode **Standar Terkoreksi**, disertai derajat bebas Welch-Satterthwaite $\nu_{\text{W},j}$ dan nilai-$p$ dua arah $p_{\text{ul},j} = 2 \cdot P(T_{\nu_{\text{W},j}} > |t_j|)$. Sebaliknya, pada mode **ANATES Klasik**, penyebut memakai ukuran kelompok nominal $(n, n)$ tanpa nilai-$p$.

### 6.3 Daya Pembeda ($\text{DP}_j$)

Daya pembeda membandingkan pencapaian kelompok Unggul $U$ terhadap Asor $L$ pada skala persen ($-100\%$ hingga $+100\%$), dengan hasil `NAN` jika $n = 0$.

$$
\text{DP}_j\ (\%) =
\begin{cases}
\dfrac{B_{a,j} - B_{b,j}}{n} \times 100{,}0, & \text{Pilihan Ganda } (n > 0) \\
\dfrac{\text{Sum}_{U,j} - \text{Sum}_{L,j}}{n \cdot S_{\text{maks},j}} \times 100{,}0, & \text{Uraian } (n > 0)
\end{cases}
$$

### 6.4 Tingkat Kesukaran ($\text{TK}_j$) dan Kategorinya

Pada Pilihan Ganda, tingkat kesukaran dihitung atas seluruh $N$ peserta, sedangkan pada Uraian mengikuti pilihan cakupan **Seluruh Peserta (N)** atau **Kelompok Unggul + Asor (2n)**.

$$
\text{TK}_j\ (\%) =
\begin{cases}
\dfrac{J_j}{N} \times 100{,}0, & \text{Pilihan Ganda} \\
\dfrac{\sum_{i=1}^{N} \tilde{s}_{i,j}}{N \cdot S_{\text{maks},j}} \times 100{,}0, & \text{Uraian (Cakupan Seluruh Peserta } N\text{)} \\
\dfrac{\text{Sum}_{U,j} + \text{Sum}_{L,j}}{2 \cdot n \cdot S_{\text{maks},j}} \times 100{,}0, & \text{Uraian (Cakupan } 2n \text{ Unggul + Asor)}
\end{cases}
$$

Pemetaan nilai $\text{TK}_j$ ke kategori kualitatif pada kedua mode tercantum dalam Tabel 4.

**Tabel 4.** Klasifikasi kategori tingkat kesukaran butir pada mode `Standar Terkoreksi` dan `ANATES Klasik`.

| Kategori | Rentang `Standar Terkoreksi` | Rentang `ANATES Klasik` |
|---|---|---|
| Tidak ada (`-`) | Jika $\text{TK}_j$ bernilai `NAN` | Tidak pernah (`NAN` jatuh ke `Sangat Mudah`) |
| `Sangat Sukar` | $\text{TK}_j \le 15{,}0$ | $0{,}0 \le \text{TK}_j \le 15{,}0$ |
| `Sukar` | $15{,}0 < \text{TK}_j \le 30{,}0$ | $15{,}0 < \text{TK}_j \le 30{,}0$ |
| `Sedang` | $30{,}0 < \text{TK}_j \le 70{,}0$ | $31{,}0 < \text{TK}_j \le 70{,}0$ |
| `Mudah` | $70{,}0 < \text{TK}_j \le 85{,}0$ | $71{,}0 < \text{TK}_j \le 85{,}0$ |
| `Sangat Mudah` | $\text{TK}_j > 85{,}0$ | Selain kondisi di atas (termasuk celah $(30, 31]$ dan $(70, 71]$) |

### 6.5 Korelasi Butir-Total dan Uji Signifikansi

Untuk vektor skor butir $x_j$ dan skor pembanding $v$ (yakni $Y$ untuk korelasi mentah $r_j$ atau skor sisa $R_j = Y - C_j$ untuk korelasi terkoreksi $r_{\text{corr},j}$), korelasi Pearson produk-momen terpusat dihitung dengan rumus berikut.

$$
r(x_j, v) = \frac{\sum_{i=1}^{N} (x_{i,j} - \bar{x}_j)(v_i - \bar{v})}{\sqrt{\left(\sum_{i=1}^{N} (x_{i,j} - \bar{x}_j)^2\right)\left(\sum_{i=1}^{N} (v_i - \bar{v})^2\right)}}
$$

Jika kolom butir atau skor sisa bernilai konstan, nilai korelasinya ditetapkan `NAN`. Pada mode **Standar Terkoreksi** dengan $\text{df} = N - 2 > 0$, uji signifikansi memakai nilai-$p$ dua arah distribusi Student-$t$ dari statistik $t = |r|\sqrt{\text{df}/(1 - r^2)}$ (untuk $|r| < 1$). Hanya korelasi positif ($r > 0$) yang dapat berstatus `Sangat Signifikan` ($p \le 0{,}01$) atau `Signifikan` ($0{,}01 < p \le 0{,}05$); selain itu diberi label `-`. Pada mode **ANATES Klasik**, $r$ dicocokkan ke tabel ambang kritis 14 baris berdasarkan jumlah butir $M$ (mulai $10$ butir dengan batas $0{,}576$ hingga $150$ butir dengan batas $0{,}159$).

### 6.6 Analisis Pengecoh (Khusus Pilihan Ganda)

Untuk setiap opsi bukan kunci ($o \ne \tilde{k}_j$) pada butir dengan $K$ pilihan, frekuensi pemilih ideal dan Indeks Pengecoh ($\text{IP}_{j,o}$) dihitung ketika $\text{ideal}_j > 0$.

$$
\text{ideal}_j = \frac{N - J_j}{K - 1}, \qquad
\text{IP}_{j,o}\ (\%) = \frac{f_{j,o}}{\text{ideal}_j} \times 100{,}0 \quad (\text{ideal}_j > 0)
$$

Arti simbol kualitas $\text{IP}_{j,o}$ dan kriteria keberfungsiannya tercantum dalam Tabel 5.

**Tabel 5.** Kode kualitas Indeks Pengecoh ($\text{IP}_{j,o}$) pada opsi Pilihan Ganda.

| Simbol Kualitas | Kondisi atau Rentang $\text{IP}_{j,o}$ | Makna Evaluasi |
|---|---|---|
| `**` | $o = \tilde{k}_j$ | Kunci jawaban |
| *(kosong)* | $\text{ideal}_j \le 0{,}0$ | Seluruh peserta menjawab benar |
| `++` | $75{,}0 < \text{IP} \le 125{,}0$ | Sangat Baik |
| `+` | $(50{,}0,\ 75{,}0]$ atau $(125{,}0,\ 150{,}0]$ | Baik |
| `-` | $(25{,}0,\ 50{,}0]$ atau $(150{,}0,\ 175{,}0]$ | Kurang Baik |
| `--` | $[0{,}0,\ 25{,}0]$ atau $(175{,}0,\ 200{,}0]$ | Buruk |
| `---` | $\text{IP} > 200{,}0$ | Sangat Buruk |
| `?` | $\text{IP} < 0{,}0$ | Tidak diketahui |

Di samping nilai $\text{IP}_{j,o}$, mesin mengevaluasi apakah opsi bukan kunci bekerja sebagai pengecoh. Suatu opsi ditandai **Berfungsi** jika dipilih sedikitnya $2\%$ dari total peserta ($f_{j,o}/N \ge 0{,}02$) dan lebih sering (atau sama banyak) dipilih kelompok Asor dibanding kelompok Unggul ($l_{j,o} \ge u_{j,o}$).

### 6.7 Reliabilitas Tes dan Interpretasinya

Empat koefisien reliabilitas dihitung atas matriks skor butir $Z$ berukuran $N \times M$.

- **Belah Dua Spearman-Brown ($r_{tt}$)** mengorelasikan skor butir ganjil ($O_i$) dengan genap ($E_i$) menjadi $r_{XY} = r(O, E)$, lalu memperbaikinya dengan rumus $r_{tt} = \dfrac{2 \tilde{r}}{1 + \tilde{r}}$. Pada mode **Standar Terkoreksi**, seluruh butir $1 \dots M$ diindeks dengan $\tilde{r} = r_{XY}$ berpresisi penuh. Pada PG mode **ANATES Klasik**, $O$ dan $E$ tertukar, butir ke-$M$ dilewati, dan $r_{XY}$ dibulatkan ke presisi tunggal.
- **Alpha Cronbach ($\alpha$)** dihitung untuk $N \ge 2$ dan $M \ge 2$ menggunakan ragam sampel (pembagi $N - 1$).

$$
\alpha = \frac{M}{M - 1}\left(1 - \frac{\sum_{j=1}^{M} \sigma_{\text{samp}}^2(Z_{\cdot,j})}{\sigma_{\text{samp}}^2(T)}\right)
$$

- **Kuder-Richardson 20 ($\text{KR-20}$) dan 21 ($\text{KR-21}$)** (khusus PG) memakai ragam populasi (pembagi $N$), proporsi benar butir $p_j = J_j / N$, serta rata-rata skor benar total $\bar{T}$. Pada data dikotomis $\{0, 1\}$, $\text{KR-20}$ bernilai sama persis dengan $\alpha$, sedangkan $\text{KR-21} \le \text{KR-20}$.

$$
\text{KR-20} = \frac{M}{M - 1}\left(1 - \frac{\sum_{j=1}^{M} p_j(1 - p_j)}{\sigma_{\text{pop}}^2(T)}\right), \qquad
\text{KR-21} = \frac{M}{M - 1}\left(1 - \frac{\bar{T}(M - \bar{T})}{M \cdot \sigma_{\text{pop}}^2(T)}\right)
$$

- **Alpha Jika Butir Dihapus ($\alpha_{-j}$)** mengevaluasi rumus Alpha Cronbach pada $M - 1$ butir tersisa setelah butir $j$ dikeluarkan (mensyaratkan $N \ge 2$ dan $M \ge 3$). Nilai $\alpha_{-j} > \alpha$ menandakan penghapusan butir $j$ cenderung menaikkan konsistensi internal tes.

Label kualitatif untuk keempat koefisien reliabilitas tersebut mengikuti rentang nilai pada Tabel 6.

**Tabel 6.** Klasifikasi pita interpretasi koefisien reliabilitas.

| Rentang Nilai Koefisien ($v$) | Label Interpretasi |
|---|---|
| Tidak terdefinisi atau `NAN` | `Tidak terdefinisi` |
| $v \ge 0{,}80$ | `Sangat Tinggi` |
| $0{,}60 \le v < 0{,}80$ | `Tinggi` |
| $0{,}40 \le v < 0{,}60$ | `Cukup` |
| $0{,}20 \le v < 0{,}40$ | `Rendah` |
| $v < 0{,}20$ | `Sangat Rendah` |

### 6.8 Rekomendasi Keputusan Butir dan Dugaan Salah Kunci

Keputusan butir mengevaluasi gabungan $\text{DP}_j$, $\text{TK}_j$, tingkat signifikansi korelasi aktif ($r_j$ atau $r_{\text{corr},j}$), serta diagnosis dugaan salah kunci. Penanda dugaan salah kunci aktif pada PG apabila $\text{DP}_j < 0$ dan terdapat minimal satu pengecoh yang dipilih lebih banyak oleh kelompok Unggul dibanding kunci jawaban ($\max_{o \ne \tilde{k}_j} u_{j,o} > u_{j,\tilde{k}_j}$). Aturan klasifikasi status dirangkum dalam Tabel 7.

**Tabel 7.** Aturan klasifikasi status keputusan butir pada Itemetri.

| Status Keputusan | Syarat Kriteria |
|---|---|
| `Terima` | Bukan `Tolak`, $\text{DP}_j \ge 30{,}0\%$, $20{,}0\% \le \text{TK}_j \le 85{,}0\%$, serta korelasi $r > 0$ berstatus `Signifikan` atau `Sangat Signifikan` |
| `Revisi` | Kasus peralihan selain syarat `Terima` dan `Tolak`, misalnya $\text{DP}_j \in [20{,}0\%, 30{,}0\%)$ atau $\text{TK}_j \in [15{,}0\%, 20{,}0\%) \cup (85{,}0\%, 90{,}0\%]$ dengan korelasi positif signifikan |
| `Tolak` | Terjadi salah satu kondisi kritis: $\text{DP}_j$ negatif/tak terdefinisi/$< 20{,}0\%$, korelasi $\le 0$/tak terdefinisi/tidak signifikan, $\text{TK}_j < 15{,}0\%$ atau $> 90{,}0\%$, atau dugaan salah kunci aktif |

### 6.9 Distribusi Skor, *Skewness*, IQR, dan Ketuntasan KKM

Ringkasan distribusi skor menghitung kuartil pertama ($Q_1$, persentil ke-25) dan kuartil ketiga ($Q_3$, persentil ke-75) dengan interpolasi linier atas skor terurut, lalu menetapkan rentang antarkuartil $\text{IQR} = Q_3 - Q_1$. Untuk $N \ge 3$ dan simpangan baku sampel $s > 0$, kemencengan sebaran (*skewness* sampel terkoreksi bias) dihitung dengan rumus berikut.

$$
G_1 = \frac{N}{(N - 1)(N - 2)} \sum_{i=1}^{N} \left(\frac{Y_i - \bar{T}}{s}\right)^3
$$

Nilai $G_1 > 0{,}5$ diklasifikasikan sebagai **Condong Kanan (Positif)**, $G_1 < -0{,}5$ sebagai **Condong Kiri (Negatif)**, dan di antara keduanya sebagai **Simetris**. Capaian rata-rata kelas terhadap skor ideal ($\text{Rata-rata \%}$) menandai *floor effect* jika $< 35\%$ dan *ceiling effect* jika $> 85\%$. Jika pengguna mengisi **KKM / Batas Lulus** ($K_{\text{KKM}}$), persentase ketuntasan dihitung sebagai banyaknya peserta dengan $Y_i \ge K_{\text{KKM}}$ dibagi $N$ dikali $100\%$.

### 6.10 Rekap Penguasaan Indikator atau Tujuan Pembelajaran

Saat butir soal dipetakan ke label Indikator atau Tujuan Pembelajaran (TP), setiap kelompok indikator merangkum jumlah butir, komposisi keputusan (`Terima`, `Revisi`, `Tolak`), rata-rata daya pembeda ($\overline{\text{DP}}$), dan rata-rata tingkat kesukaran ($\overline{\text{TK}}$). Label penguasaan tiap indikator ditetapkan dari nilai $\overline{\text{TK}}$ sebagai berikut:

- **Tinggi (Tercapai)**: $\overline{\text{TK}} \ge 75{,}0\%$
- **Sedang**: $50{,}0\% \le \overline{\text{TK}} < 75{,}0\%$
- **Rendah (Perlu Penguatan)**: $\overline{\text{TK}} < 50{,}0\%$

### 6.11 Uji Pretest-Posttest: N-Gain Hake dan Uji-$t$ Berpasangan

Pada modul **Uji Pretest-Posttest**, peserta dipasangkan berdasarkan kesamaan nama (tidak peka huruf besar-kecil), atau secara berurutan jika tidak ada nama yang cocok. Untuk setiap pasangan peserta $k \in \{1, \dots, n\}$ dengan skor awal $S_{\text{pre},k}$, skor akhir $S_{\text{post},k}$, dan skor ideal maksimum $S_{\text{maks}}$, selisih dan *Normalized Gain* Hake ($g_k$) dihitung ketika $S_{\text{maks}} - S_{\text{pre},k} > 0$:

$$
d_k = S_{\text{post},k} - S_{\text{pre},k}, \qquad
g_k = \frac{S_{\text{post},k} - S_{\text{pre},k}}{S_{\text{maks}} - S_{\text{pre},k}}
$$

Nilai $g_k$ (dan rata-rata N-Gain kelas $\bar{g}$) dikategorikan menjadi **Tinggi** ($g \ge 0{,}70$), **Sedang** ($0{,}30 \le g < 0{,}70$), dan **Rendah** ($g < 0{,}30$). Untuk menguji signifikansi perubahan skor pada $n \ge 2$ dengan simpangan baku selisih $s_d > 0$, sistem menghitung uji-$t$ berpasangan dua arah pada $\text{df} = n - 1$:

$$
t = \frac{\bar{d}}{s_d / \sqrt{n}}, \qquad
p = 2 \cdot P(T_{n-1} > |t|)
$$

Perubahan dinyatakan signifikan secara statistik apabila $p < 0{,}05$.

---

## 7. Penyangkalan Verifikasi dan Validasi Ulang

Seluruh angka statistik, grafik, ringkasan eksekutif, kategori penguasaan indikator, hasil uji Pretest-Posttest, serta rekomendasi keputusan butir yang dihasilkan oleh Itemetri merupakan alat bantu komputasi otomatis. Keluaran tersebut sebaiknya tidak dijadikan satu-satunya dasar dalam penetapan kelulusan, pemberian nilai peserta, pengesahan instrumen penelitian, atau pelaporan akreditasi tanpa pemeriksaan tambahan.

Sebelum memakai hasil analisis untuk keputusan resmi maupun publikasi ilmiah, pengguna wajib melakukan empat pemeriksaan berikut.

1. Periksa kembali ketepatan data mentah, kunci jawaban, skor ideal tiap butir, bobot penilaian, nilai KKM, jumlah opsi PG, perlakuan sel kosong, serta kecocokan pemetaan kolom saat mengimpor berkas `.xlsx`, `.csv`, atau `.ana`.
2. Pastikan pilihan **Mode Kompatibilitas** (`Standar Terkoreksi` atau `ANATES Klasik`), persentase kelompok Unggul-Asor (`27%` atau `50%`), cakupan tingkat kesukaran Uraian, dan jenis korelasi ($r$ atau $r_{\text{corr}}$) telah sesuai dengan rancangan evaluasi yang digunakan.
3. Lakukan pemeriksaan silang pada sebagian sampel data atau bandingkan hasil dengan perangkat lunak statistik lain yang terpercaya. Langkah ini sangat disarankan jika jumlah peserta kecil, terdapat banyak jawaban kosong, atau hasil dipakai dalam keputusan berisiko tinggi.
4. Tinjau ulang setiap butir soal bersama penelaah substansi bidang studi untuk memastikan ketepatan materi dan kejelasan bahasa, sebab angka statistik semata tidak menggantikan validitas isi instrumen.

Pengembang dan penyusun dokumentasi tidak menjamin kesesuaian hasil untuk tujuan administratif atau hukum tertentu tanpa proses verifikasi dan validasi independen oleh pengguna.
