import type { CompatibilityMode } from "../types";

export type MethodNoteTopic = "reliability" | "items" | "distractors";

interface MethodNotesProps {
  topic: MethodNoteTopic;
  mode: CompatibilityMode;
  useCorrectedItemTotal: boolean;
}

export function MethodNotes({
  topic,
  mode,
  useCorrectedItemTotal,
}: MethodNotesProps) {
  const isLegacy = mode === "legacy_anates";

  if (topic === "reliability") {
    return (
      <details className="method-notes no-print">
        <summary>Panduan Interpretasi Reliabilitas & Statistik Tes</summary>
        <ul>
          <li>
            <strong>Alpha Cronbach (α)</strong>, <strong>KR-20</strong>, dan{" "}
            <strong>KR-21</strong> mengukur konsistensi internal seluruh butir secara bersamaan,
            sedangkan <strong>Belah Dua (r_tt)</strong> memakai rumus Spearman-Brown atas belahan
            butir ganjil vs genap.
          </li>
          <li>
            <strong>Skor Min / Median / Maks</strong> dan <strong>Rata-rata %</strong> membantu
            mendeteksi efek lantai (terlalu sukar) atau efek langit-langit (terlalu mudah) terhadap
            skor ideal maksimum tes.
          </li>
          <li>
            Mode saat ini:{" "}
            <strong>{isLegacy ? "Legacy ANATES" : "Standar Terkoreksi"}</strong>. Kelompok{" "}
            <code>27%</code> ideal untuk sampel sedang/besar guna menajamkan pemisahan ekstrem,
            sedangkan <code>50% (Median Split)</code> cocok saat jumlah peserta kecil.
          </li>
        </ul>
      </details>
    );
  }

  if (topic === "items") {
    return (
      <details className="method-notes no-print">
        <summary>Panduan Ambang Keputusan Butir & Uji Signifikansi</summary>
        <ul>
          <li>
            <strong>Keputusan Butir</strong> mengevaluasi kombinasi Daya Pembeda (DP%), Tingkat
            Kesukaran (TK%), dan korelasi butir-total:{" "}
            <strong>Terima</strong> jika DP &gt;= 30%, TK antara 20% s.d. 85%, serta korelasi
            positif signifikan; <strong>Revisi</strong> jika DP 20-30% atau TK sedikit di luar
            rentang ideal dengan korelasi positif signifikan; <strong>Tolak</strong> jika DP &lt;
            20%, DP &lt;= 0, korelasi negatif/tidak signifikan, TK ekstrem (&lt; 15% atau &gt; 90%),
            atau diduga salah kunci.
          </li>
          <li>
            {isLegacy ? (
              <>
                Pada mode <strong>Legacy ANATES</strong>, signifikansi <code>r</code> dicocokkan ke
                tabel kritis 14-baris ANATES V4 (derajat bebas berdasarkan jumlah butir), sedangkan
                pada mode <strong>Standar Terkoreksi</strong> diuji dengan distribusi <em>t</em>{" "}
                (<code>df = N - 2</code>).
              </>
            ) : (
              <>
                Mode <strong>Standar Terkoreksi</strong> menguji signifikansi korelasi dengan
                distribusi <em>t</em> pada <code>df = N - 2</code>.
              </>
            )}
          </li>
          <li>
            Kolom aktif saat ini memakai{" "}
            <strong>
              {useCorrectedItemTotal
                ? "r_corr (korelasi terkoreksi tanpa bias part-whole)"
                : "r mentah (masih memuat skor butir sendiri di skor total)"}
            </strong>
            . Untuk tes pendek (&lt; 20 butir), <code>r_corr</code> dianjurkan agar validitas butir
            tidak tergelembung.
          </li>
        </ul>
      </details>
    );
  }

  return (
    <details className="method-notes no-print">
      <summary>Panduan Evaluasi Pengecoh (IP% & Kelompok Unggul-Asor)</summary>
      <ul>
        <li>
          Kode kualitas <code>++</code>, <code>+</code>, <code>-</code>, <code>--</code>, dan{" "}
          <code>---</code> mengikuti indeks efektifitas pengecoh ANATES V4 (<code>IP%</code> = rasio
          frekuensi terhadap ideal <code>(N - benar) / (K - 1)</code>).
        </li>
        <li>
          Penanda <strong>Berfungsi</strong> vs <strong>Lemah</strong> memeriksa sebaran antar
          kelompok: pengecoh dinilai berfungsi apabila dipilih sedikitnya <strong>2%</strong>{" "}
          peserta dan lebih banyak (atau minimal sama banyak) dipilih kelompok <strong>Bawah</strong>{" "}
          dibanding kelompok <strong>Atas</strong>.
        </li>
        <li>
          Bila opsi pengecoh justru jauh lebih diminati kelompok Atas dengan Daya Pembeda negatif,
          periksa ulang kunci jawaban pada baris referensi <code>Ref</code>.
        </li>
      </ul>
    </details>
  );
}
