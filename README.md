# Itemetri

Aplikasi web analisis kualitas butir soal dan reliabilitas tes berbasis Teori Tes Klasik (*Classical Test Theory*, CTT).

Menilai kualitas soal ujian sering merepotkan karena data nilai tersebar di spreadsheet, sementara perangkat lunak analisis klasik seperti ANATES hanya berjalan di sistem lama. Itemetri menyatukan lembar kerja data dan panel hasil analisis dalam satu layar, sehingga guru, dosen, dan penyusun tes dapat memeriksa validitas, reliabilitas, tingkat kesukaran, serta daya pembeda soal langsung dari peramban. Seluruh pembacaan berkas dan perhitungan berjalan di perangkat pengguna tanpa mengirim data nilai atau kunci jawaban ke peladen luar.

## Apa yang Bisa Dilakukan

Itemetri mendukung pengolahan soal Pilihan Ganda (`PG`), Uraian (`Ur`), dan lembar kerja campuran `PG + Uraian`, lengkap dengan pembobotan PG opsional serta pemetaan indikator atau tujuan pembelajaran.

Untuk menjaga kecocokan dengan kebutuhan evaluasi masa kini maupun arsip lama, ukuran kelompok Unggul-Asor (`27%` atau `50%`) selalu dihitung dengan *banker's rounding* di kedua mode, sedangkan perhitungan statistiknya tersedia dalam dua pilihan:

- Mode `standard_corrected` (bawaan) memakai rumus psikometri baku dengan presisi `float64`, derajat bebas eksak `df = N - 2` pada uji-$t$, koreksi Welch-Satterthwaite untuk soal uraian, dan rentang kategori tingkat kesukaran tanpa celah.
- Mode `legacy_anates` mereproduksi perilaku historis yang kompatibel dengan berkas `.ana`/`.ANA` (belah dua ganjil-genap PG tertukar tanpa butir terakhir dengan pembulatan presisi tunggal, tabel korelasi kritis 14 baris berbasis jumlah butir $M$, celah kategori tingkat kesukaran, serta uji-$t$ Uraian memakai ukuran kelompok nominal $n$) untuk keperluan audit arsip lama (lihat kontrak lengkap di [DEVELOPER_MANUAL.md](DEVELOPER_MANUAL.md#61-legacy-parity-contract-legacy_anates-vs-standard_corrected)).

Dari satu lembar kerja, aplikasi ini menghasilkan:

- Reliabilitas tes melalui Belah Dua Spearman-Brown (`r_tt`), Alpha Cronbach ($\alpha$), KR-20, KR-21, serta estimasi Alpha jika butir dihapus ($\alpha_{-j}$).
- Statistik skor peserta berupa rata-rata, simpangan baku, nilai minimum, median, nilai maksimum, skor ideal maksimum, capaian rata-rata (%), dan ketuntasan KKM.
- Analisis butir dan pengecoh yang mencakup daya pembeda (`DP%`), tingkat kesukaran (`TK%`), uji-$t$ kelompok unggul-asor uraian, korelasi butir-total mentah (`r`) dan terkoreksi (`r_corr`), indeks pengecoh (`IP%`), rekomendasi keputusan butir (`Terima`, `Revisi`, `Tolak`), serta deteksi dugaan salah kunci.
- Uji *Pretest-Posttest* memakai *N-Gain* Hake dan uji-$t$ berpasangan.

Di sisi antarmuka, ruang kerja bergaya jamovi menyediakan kanvas spreadsheet `15 x 10` yang dapat langsung disunting atau ditempel dari Excel (`Ctrl+V`), virtualisasi 2D, `Undo`/`Redo`, impor berkas `.ana`/`.ANA`, `.csv`, dan `.xlsx` dengan pratinjau pemetaan, penggabungan dua berkas, serta dua data simulasi bawaan untuk Pilihan Ganda dan Uraian. Data lembar kerja dapat disimpan kembali ke `.ana`, `.xlsx`, atau `.csv` (khusus lembar campuran `PG + Uraian`, kolom PG disimpan sebagai skor terkonversi Uraian), sedangkan setiap kartu hasil dan grafik dapat disalin ke Word/Docs/Excel atau diunduh sebagai `.pdf`, `.xlsx`, `.txt`, `.png`, dan `.jpg`. Catatan: **Laporan PDF (`.pdf`)** disimpan sebagai halaman gambar siap cetak, sehingga gunakan **Salin Laporan**, `.xlsx`, atau `.txt` apabila memerlukan teks/tabel yang dapat disunting.

## Cara Menjalankan

### Prasyarat

Siapkan Node.js versi 18 atau lebih baru beserta `npm`.

### Menjalankan di Lokal

Masuk ke direktori `web`, pasang dependensi, lalu jalankan server pengembangan Vite:

```powershell
cd web
npm ci
npm run dev
```

Setelah server aktif, buka alamat lokal yang ditampilkan di terminal melalui peramban.

### Pengujian dan Build Statis

```powershell
cd web

# Menjalankan unit test
npm test

# Memeriksa tipe TypeScript dan membangun berkas statis ke web/dist/
npm run build

# Pratinjau hasil build secara lokal
npm run preview
```

Keluaran di `web/dist/` berisi berkas statis murni (termasuk halaman panduan pengguna di `web/dist/user_manual/`) yang dapat langsung dipasang di GitHub Pages, Cloudflare Pages, atau cPanel.

## Dokumentasi dan Peta Proyek

Panduan langkah demi langkah, batasan teknis, dan detail rumus tersedia di dokumen terpisah agar halaman ini tetap ringkas:

- [USER_MANUAL.md](USER_MANUAL.md) memuat panduan penggunaan lengkap, batasan teknis, serta notasi matematis.
- [DEVELOPER_MANUAL.md](DEVELOPER_MANUAL.md) memuat arsitektur, alur kerja pengembang, serta kontrak invarian sistem.
- [DESIGN.md](DESIGN.md) mendokumentasikan token desain dan standar antarmuka.
- [CHANGELOG.md](CHANGELOG.md) mencatat riwayat perubahan tiap rilis.
- [LICENSE](LICENSE) berisi naskah lisensi MIT.

Kode sumber utama aplikasi web berada di direktori `web/` (mesin psikometri dan pembaca/penulis berkas di `web/src/standalone/`, komponen antarmuka di `web/src/components/`, dan unit test di `web/tests/run_tests.mjs`), sedangkan ikon aplikasi berada di `assets/`.

## Lisensi, Atribusi, dan Penafian

Itemetri dirilis di bawah lisensi MIT ([LICENSE](LICENSE)). Anda bebas memakai, menyalin, mengubah, dan mendistribusikan ulang kode sumber ini dengan tetap menyertakan pemberitahuan hak cipta dan izin MIT.

Proyek ini dikembangkan secara independen dari nol dalam TypeScript dan terinspirasi oleh kontribusi perangkat lunak ANATES bagi ekosistem evaluasi pembelajaran di Indonesia. Itemetri tidak berafiliasi dengan, tidak disponsori oleh, dan tidak mendistribusikan biner, ikon, maupun aset milik pembuat ANATES asli. Dukungan format `.ana`/`.ANA` disediakan semata agar pengguna tetap dapat membuka dan mengaudit arsip data lama mereka.

Apabila Itemetri membantu pekerjaan pengajaran atau penelitian Anda, Anda dipersilakan secara sukarela menyalurkan infak atau donasi ke masjid, panti asuhan, atau lembaga sosial pilihan Anda sendiri.
