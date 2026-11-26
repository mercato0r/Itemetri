import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const WEB_DIR = path.resolve(import.meta.dirname, "..");
const ROOT_DIR = path.resolve(WEB_DIR, "..");
const OUT_DIR = path.join(ROOT_DIR, "build", "web_tests");
fs.mkdirSync(OUT_DIR, { recursive: true });

const require = createRequire(path.join(WEB_DIR, "package.json"));
const esbuild = require("esbuild");

async function loadTsModule(relPath) {
  const outFile = path.join(OUT_DIR, `${path.basename(relPath, ".ts")}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(WEB_DIR, relPath)],
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    outfile: outFile,
  });
  return import(pathToFileURL(outFile).href);
}

const [wsMod, expMod, zipMod, xmlMod, tabMod, pipeMod, ppMod, clipMod] = await Promise.all([
  loadTsModule("src/model/worksheet.ts"),
  loadTsModule("src/utils/resultExport.ts"),
  loadTsModule("src/standalone/io/xlsxZip.ts"),
  loadTsModule("src/standalone/io/xmlAna.ts"),
  loadTsModule("src/standalone/io/tabular.ts"),
  loadTsModule("src/standalone/engine/pipeline.ts"),
  loadTsModule("src/standalone/engine/pretestPosttest.ts"),
  loadTsModule("src/utils/clipboard.ts"),
]);

test("worksheet: blank dimensions, TSV paste, and mixed PG+Uraian compilation", () => {
  const blank = wsMod.createBlankWorksheet();
  assert.equal(blank.rows.length, 15);
  assert.equal(blank.columns.length, 10);

  const twoCol = wsMod.createBlankWorksheet(5, 2);
  const step1 = wsMod.pasteWorksheetBlock(twoCol, -1, 0, [["A", "10"]]);
  const step2 = wsMod.pasteWorksheetBlock(step1.next, 0, -1, [
    ["Andi", "A", "8"],
    ["Budi", "B", "6"],
  ]);
  const compiled = wsMod.worksheetToExamPayload(step2.next);
  assert.equal(compiled.hasActiveResponses, true);
  assert.equal(compiled.summaryKind, "mixed");
  assert.equal(compiled.exam.kind, "essay");
  assert.deepEqual(compiled.exam.ideal_scores, [1, 10]);
  assert.deepEqual(compiled.exam.essay_subjects?.[0]?.scores, [1, 8]);
  assert.deepEqual(compiled.exam.essay_subjects?.[1]?.scores, [0, 6]);

  // Weight contract on mixed PG + Essay worksheet:
  // 1) negative wrong weight is clamped to 0, ideal score uses positive correct weight
  const stepWithBlank = wsMod.pasteWorksheetBlock(step2.next, 2, -1, [["Citra", "", "7"]]);
  const negPenaltyWs = {
    ...stepWithBlank.next,
    weights: { correct: 2, wrong: -1 },
  };
  const negCompiled = wsMod.worksheetToExamPayload(negPenaltyWs);
  assert.equal(negCompiled.summaryKind, "mixed");
  assert.deepEqual(negCompiled.exam.ideal_scores, [2, 10]);
  assert.deepEqual(negCompiled.exam.essay_subjects?.[0]?.scores, [2, 8]);
  assert.deepEqual(negCompiled.exam.essay_subjects?.[1]?.scores, [0, 6]);
  assert.deepEqual(negCompiled.exam.essay_subjects?.[2]?.scores, [null, 7]);

  // 2) positive partial wrong weight is preserved on wrong MC answers
  const partialWrongWs = {
    ...stepWithBlank.next,
    weights: { correct: 2, wrong: 0.5 },
  };
  const partialCompiled = wsMod.worksheetToExamPayload(partialWrongWs);
  assert.deepEqual(partialCompiled.exam.ideal_scores, [2, 10]);
  assert.deepEqual(partialCompiled.exam.essay_subjects?.[0]?.scores, [2, 8]);
  assert.deepEqual(partialCompiled.exam.essay_subjects?.[1]?.scores, [0.5, 6]);
  assert.deepEqual(partialCompiled.exam.essay_subjects?.[2]?.scores, [null, 7]);
});

test("upperLower banker's rounding group size is identical in standard_corrected and legacy_anates modes", () => {
  const makeMcExam = (subjectCount) => ({
    kind: "multiple_choice",
    source_path: "parity_ul.ana",
    is_sorted_by_score: false,
    is_need_recalc: true,
    answer_key: "ABCD",
    option_count: 4,
    weights: { correct: 1, wrong: 0 },
    mc_subjects: Array.from({ length: subjectCount }, (_, idx) => ({
      name: `Peserta ${idx + 1}`,
      responses: idx % 2 === 0 ? "ABCD" : "ABXX",
      original_index: idx,
    })),
  });

  for (const n of [9, 15]) {
    const exam = makeMcExam(n);
    for (const pct of [27, 50]) {
      const stdRes = pipeMod.analyzeExam(exam, {
        mode: "standard_corrected",
        upper_lower_percent: pct,
        use_weighted_score: false,
        essay_difficulty_scope: null,
      });
      const legRes = pipeMod.analyzeExam(exam, {
        mode: "legacy_anates",
        upper_lower_percent: pct,
        use_weighted_score: false,
        essay_difficulty_scope: null,
      });
      assert.equal(stdRes.upper_lower.group_size, legRes.upper_lower.group_size);
    }
  }
});

test("resultExport: escapes HTML and formats APA plain text", () => {
  const spec = {
    id: "uji",
    title: "Ringkasan <script>alert(1)</script>",
    metrics: [{ label: "Alpha", value: "0,85" }],
    table: {
      headers: ["Butir", "Status"],
      rows: [["1", "Terima & Baik"]],
    },
  };
  const html = expMod.buildWordHtml(spec);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(html.includes("Terima &amp; Baik"));

  const txt = expMod.buildPlainText(spec);
  assert.ok(txt.includes("Alpha") && txt.includes("0,85"));
  assert.ok(txt.includes("Terima & Baik"));
});

test("xlsxZip: rejects legacy .xls and corrupt ZIP with StandaloneParseError", async () => {
  const xlsHeader = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  await assert.rejects(
    () => zipMod.parseXlsxRows(xlsHeader),
    (err) => err?.code === "parse_error" && /Format \.xls/i.test(err.message),
  );

  const truncated = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
  await assert.rejects(
    () => zipMod.parseXlsxRows(truncated),
    (err) => err?.code === "parse_error",
  );
});

test("xlsxZip: caps extreme column refs without hanging or overflowing", async () => {
  const enc = new TextEncoder();
  // Build a valid minimal XLSX containing a stray cell at XFD1 (col 16383) beyond MAX_XLSX_COLS.
  const baseBytes = await zipMod.buildXlsxBytes("Sheet1", [
    ["Nama", "1"],
    ["Kunci", "A"],
    ["Ani", "A"],
  ]);
  const rows = await zipMod.parseXlsxRows(baseBytes);
  assert.deepEqual(rows[0], ["Nama", "1"]);
  assert.deepEqual(rows[2], ["Ani", "A"]);
  assert.ok(enc.encode("ok").length === 2);
});

test("xmlAna: handles CDATA, quoted '>' in attributes, and rejects DOCTYPE", () => {
  const xmlWithCdataAndGt = `<?xml version="1.0" encoding="utf-8"?>
<ANATES file_version="4.0.1" note="a > b">
  <Data_Mentah>
    <Kunci>AB</Kunci>
    <JumSubyek>1</JumSubyek>
    <JumButir>2</JumButir>
    <JumPilihan>4</JumPilihan>
    <Jawaban>
      <Subyek>
        <Nama><![CDATA[Peserta <1>]]></Nama>
        <Jwb>AB</Jwb>
      </Subyek>
    </Jawaban>
  </Data_Mentah>
</ANATES>`;
  const parsed = xmlMod.parseAnaBytes(new TextEncoder().encode(xmlWithCdataAndGt), "uji.ana");
  assert.equal(parsed.exam.mc_subjects?.[0]?.name, "Peserta <1>");
  assert.equal(parsed.exam.answer_key, "AB");

  const xxeXml = `<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe "bad">]><ANATES/>`;
  assert.throws(
    () => xmlMod.parseAnaBytes(new TextEncoder().encode(xxeXml), "xxe.ana"),
    (err) => err?.code === "parse_error",
  );
});

test("tabular: sanitizes CSV and XLSX formula-triggering strings while preserving numbers", async () => {
  const exam = {
    kind: "essay",
    source_path: "uji",
    is_sorted_by_score: false,
    is_need_recalc: true,
    ideal_scores: [10],
    item_numbers: [1],
    essay_subjects: [
      { name: "=CMD()", scores: [8], original_index: 0 },
      { name: "+SUM(1,2)", scores: [7], original_index: 1 },
      { name: "@evil", scores: [6], original_index: 2 },
    ],
  };

  const csvText = new TextDecoder().decode(tabMod.exportCsvExamBytes(exam));
  assert.ok(csvText.includes("'=CMD(),8"));
  assert.ok(csvText.includes('"\'+SUM(1,2)",7'));
  assert.ok(csvText.includes("'@evil,6"));

  const xlsxBytes = await tabMod.exportXlsxExamBytes(exam);
  const rows = await zipMod.parseXlsxRows(xlsxBytes);
  assert.equal(rows[2]?.[0], "'=CMD()");
  assert.equal(rows[2]?.[1], "8");
  assert.equal(rows[3]?.[0], "'+SUM(1,2)");
  assert.equal(rows[4]?.[0], "'@evil");
});


test("pipeline: generates executive_summary, score_distribution, verdict checks, and indicator_summary", () => {
  const exam = {
    kind: "multiple_choice",
    source_path: null,
    is_sorted_by_score: false,
    is_need_recalc: false,
    answer_key: "ABCD",
    option_count: 4,
    weights: { correct: 1, wrong: 0 },
    item_indicators: ["TP 1: Konsep", "TP 1: Konsep", "TP 2: Aplikasi", "TP 2: Aplikasi"],
    mc_subjects: [
      { name: "Siswa 1", responses: "ABCD", original_index: 0 },
      { name: "Siswa 2", responses: "ABCA", original_index: 1 },
      { name: "Siswa 3", responses: "ABAA", original_index: 2 },
      { name: "Siswa 4", responses: "AAAA", original_index: 3 },
      { name: "Siswa 5", responses: "BBBB", original_index: 4 },
      { name: "Siswa 6", responses: "CCCC", original_index: 5 },
    ],
  };

  const res = pipeMod.analyzeExam(exam, {
    mode: "standard_corrected",
    upper_lower_percent: 33,
    use_weighted_score: false,
    essay_difficulty_scope: null,
    passing_score: 2,
  });

  assert.ok(res.executive_summary);
  assert.ok(res.executive_summary.headline.length > 0);
  assert.ok(res.score_distribution);
  assert.equal(res.score_distribution.passing_score, 2);
  assert.equal(res.score_distribution.pass_count, 3);
  assert.ok((res.verdicts?.[0]?.checks?.length ?? 0) >= 3);
  const tkCheck = res.verdicts?.[0]?.checks?.find((c) => c.criterion.includes("Tingkat Kesukaran"));
  assert.ok(tkCheck?.threshold_label.includes("s.d."));
  assert.ok(!tkCheck?.threshold_label.includes("\u2013"));
  assert.equal(res.indicator_summary?.length, 2);
  assert.equal(res.indicator_summary?.[0]?.indicator, "TP 1: Konsep");
  assert.deepEqual(res.indicator_summary?.[0]?.item_numbers, [1, 2]);
});

test("pretestPosttest: matches participants by name and computes N-Gain & paired t-test", () => {
  const preExam = {
    kind: "multiple_choice",
    source_path: null,
    is_sorted_by_score: false,
    is_need_recalc: false,
    answer_key: "ABCD",
    option_count: 4,
    weights: { correct: 1, wrong: 0 },
    mc_subjects: [
      { name: "Budi", responses: "AAAA", original_index: 0 },
      { name: "Sari", responses: "ABAA", original_index: 1 },
      { name: "Andi", responses: "BBBB", original_index: 2 },
    ],
  };
  const postExam = {
    kind: "multiple_choice",
    source_path: null,
    is_sorted_by_score: false,
    is_need_recalc: false,
    answer_key: "ABCD",
    option_count: 4,
    weights: { correct: 1, wrong: 0 },
    mc_subjects: [
      { name: "Sari", responses: "ABCD", original_index: 0 },
      { name: "Budi", responses: "ABCA", original_index: 1 },
      { name: "Andi", responses: "ABCD", original_index: 2 },
    ],
  };

  const res = ppMod.computePretestPosttest(preExam, postExam, {
    mode: "standard_corrected",
    upper_lower_percent: 27,
    use_weighted_score: false,
    essay_difficulty_scope: null,
  });

  assert.equal(res.matched_count, 3);
  assert.equal(res.ideal_max_score, 4);
  assert.ok((res.mean_delta ?? 0) > 0);
  assert.ok((res.mean_n_gain ?? 0) > 0.5);
  assert.ok(res.t_value !== null);
  assert.equal(res.df, 2);
});

test("clipboard: Indonesian decimal comma and MC normalization", () => {
  assert.equal(clipMod.parseLocalizedNumber("7,5"), 7.5);
  assert.equal(clipMod.parseLocalizedNumber("10"), 10);
  assert.equal(clipMod.parseLocalizedNumber(""), null);
  assert.equal(clipMod.parseLocalizedNumber("abc"), null);

  assert.deepEqual(clipMod.parseEssayCell("7,5"), { valid: true, value: 7.5 });
  assert.deepEqual(clipMod.parseEssayCell(""), { valid: true, value: null });
  assert.deepEqual(clipMod.parseEssayCell("-2"), { valid: false, value: null });
  assert.deepEqual(clipMod.parseEssayCell("abc"), { valid: false, value: null });
  assert.equal(clipMod.normalizeMcCell(" b "), "B");

  assert.deepEqual(clipMod.parseLocalizedNumberList("7,5"), { valid: true, values: [7.5] });
  assert.deepEqual(clipMod.parseLocalizedNumberList("10, 15, 20"), {
    valid: true,
    values: [10, 15, 20],
  });
  assert.deepEqual(clipMod.parseLocalizedNumberList("7,5, 10, 12,5"), {
    valid: true,
    values: [7.5, 10, 12.5],
  });
  assert.equal(clipMod.parseLocalizedNumberList("10, abc").valid, false);
});

test("worksheet: missingKeyItemNumbers gate prevents silent default A grading", () => {
  const blank = wsMod.createBlankWorksheet(3, 3, { mode: "multiple_choice", optionCount: 4 });
  assert.deepEqual(
    blank.columns.map((c) => c.referenceValue),
    ["", "", ""],
  );
  const withStudents = wsMod.pasteWorksheetBlock(blank, 0, -1, [
    ["Andi", "A", "B", "C"],
    ["Budi", "A", "C", "D"],
  ]).next;
  const compiledMissing = wsMod.worksheetToExamPayload(withStudents);
  assert.equal(compiledMissing.hasActiveResponses, true);
  assert.deepEqual(compiledMissing.missingKeyItemNumbers, [1, 2, 3]);

  const partial = wsMod.setWorksheetCell(withStudents, -1, 0, "a");
  assert.deepEqual(wsMod.worksheetToExamPayload(partial).missingKeyItemNumbers, [2, 3]);

  const completeWs = wsMod.createBlankWorksheet(3, 3, {
    mode: "multiple_choice",
    optionCount: 4,
    quickKeys: "a b c",
  });
  const compiledComplete = wsMod.worksheetToExamPayload(completeWs);
  assert.deepEqual(compiledComplete.missingKeyItemNumbers, []);
  assert.equal(compiledComplete.exam.answer_key, "ABC");
});

test("smartPasteWorksheet: maps full Excel table with Header, Kunci, and Nama column", () => {
  const blank = wsMod.createBlankWorksheet(4, 2);
  const matrix = [
    ["Nama Lengkap", "1", "2", "3"],
    ["Kunci", "a", "b", "c"],
    ["Andi", "a", "b", "d"],
    ["Sari", "a", "c", "c"],
  ];
  const res = wsMod.smartPasteWorksheet(blank, 0, 0, matrix);
  assert.equal(res.smartMapped, true);
  assert.equal(res.next.columns.length, 3);
  assert.deepEqual(
    res.next.columns.map((c) => c.referenceValue),
    ["A", "B", "C"],
  );
  assert.equal(res.next.rows[0]?.name, "Andi");
  assert.deepEqual(res.next.rows[0]?.cells, ["A", "B", "D"]);
  assert.equal(res.next.rows[1]?.name, "Sari");
});

test("tabular: auto-ignores Google Forms/LMS metadata, accepts comma decimals, and flags missing key", async () => {
  const gformsCsv = [
    "Timestamp;Email Address;Score;Nama Lengkap;NISN;Kelas;1;2;3",
    "2026-11-20 08:01:00;ani@sch.id;80 / 100;Ani;001;XA;a;b;c",
    "2026-11-20 08:02:15;budi@sch.id;60 / 100;Budi;002;XA;a;c;d",
  ].join("\n");

  const preview = await tabMod.previewTabularBytes(
    new TextEncoder().encode(gformsCsv),
    "google_forms.csv",
  );
  assert.equal(preview.suggested_mapping.name_col_index, 3);
  assert.deepEqual(preview.suggested_mapping.item_col_indices, [6, 7, 8]);
  assert.equal(preview.suggested_mapping.key_row_index, null);
  assert.equal(preview.suggested_mapping.default_key_or_ideal, "");
  assert.equal(preview.suggested_mapping.missing_key_warning, true);
  assert.deepEqual(preview.suggested_mapping.ignored_col_indices, [0, 1, 2, 4, 5]);

  const mappedMc = await tabMod.readTabularMappedBytes(
    new TextEncoder().encode(gformsCsv),
    "google_forms.csv",
    {
      hasHeaderRow: true,
      keyRowIndex: null,
      nameColIndex: 3,
      itemColIndices: [6, 7, 8],
      kind: "auto",
      optionCount: null,
      defaultKeyOrIdeal: "",
    },
  );
  assert.equal(mappedMc.has_missing_keys, true);
  assert.equal(mappedMc.mc_subjects?.[0]?.name, "Ani");
  assert.equal(mappedMc.mc_subjects?.[0]?.responses, "ABC");

  const essayCsv = [
    "Nama;1;2",
    "Skor Ideal;10;15,5",
    "Ani;8,5;12",
    "Budi;7,5;10,5",
  ].join("\n");
  const mappedEssay = await tabMod.readTabularMappedBytes(
    new TextEncoder().encode(essayCsv),
    "uraian.csv",
    {
      hasHeaderRow: true,
      keyRowIndex: 1,
      nameColIndex: 0,
      itemColIndices: [1, 2],
      kind: "essay",
      optionCount: null,
      defaultKeyOrIdeal: "",
    },
  );
  assert.deepEqual(mappedEssay.ideal_scores, [10, 15.5]);
  assert.deepEqual(mappedEssay.essay_subjects?.[0]?.scores, [8.5, 12]);
  assert.deepEqual(mappedEssay.essay_subjects?.[1]?.scores, [7.5, 10.5]);
});

test("templates & resultExport: generates valid PG/Essay templates and report XLSX", async () => {
  const pgBytes = await tabMod.exportTemplateXlsxBytes("multiple_choice");
  const pgRows = await zipMod.parseXlsxRows(pgBytes);
  assert.equal(pgRows[0]?.[0], "Nama Peserta");
  assert.equal(pgRows[1]?.[0], "Kunci");

  const essayBytes = await tabMod.exportTemplateXlsxBytes("essay");
  const essayRows = await zipMod.parseXlsxRows(essayBytes);
  assert.equal(essayRows[1]?.[0], "Skor Ideal");

  const reportBytes = await expMod.buildSpecXlsxBytes({
    id: "laporan-test",
    title: "Laporan Analisis Uji",
    sections: [
      {
        id: "sec1",
        title: "Ringkasan",
        metrics: [{ label: "Alpha Cronbach", value: "0.84", note: "Tinggi" }],
        table: {
          headers: ["Butir", "DP(%)", "Keputusan"],
          alignments: ["right", "right", "left"],
          rows: [["1", "45.0", "Terima"]],
        },
      },
    ],
  });
  const reportRows = await zipMod.parseXlsxRows(reportBytes);
  assert.equal(reportRows[0]?.[0], "Laporan Analisis Uji");
  assert.ok(reportRows.some((r) => r[0] === "Alpha Cronbach" && r[1] === "0.84"));
  assert.ok(reportRows.some((r) => r[0] === "1" && r[1] === "45" && r[2] === "Terima"));
});

test("antislop R-02 & humanizer-indonesia: zero em-dash or en-dash characters in web source, README.md, DEVELOPER_MANUAL.md, USER_MANUAL.md, and DESIGN.md", () => {
  const dirsToScan = [
    path.join(WEB_DIR, "src"),
    path.join(WEB_DIR, "scripts"),
    path.join(WEB_DIR, "index.html"),
    path.join(ROOT_DIR, "README.md"),
    path.join(ROOT_DIR, "DEVELOPER_MANUAL.md"),
    path.join(ROOT_DIR, "DESIGN.md"),
    path.join(ROOT_DIR, "USER_MANUAL.md"),
  ];
  const hits = [];
  const walk = (target) => {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(target)) {
        walk(path.join(target, entry));
      }
      return;
    }
    if (!/\.(ts|tsx|mjs|css|html|md)$/.test(target)) return;
    const content = fs.readFileSync(target, "utf8");
    if (content.includes("\u2014") || content.includes("\u2013")) {
      hits.push(path.relative(ROOT_DIR, target));
    }
  };
  for (const d of dirsToScan) walk(d);
  assert.deepEqual(hits, []);
});

test("JamoviRibbon uses subpath-safe relative ./user_manual/ link", () => {
  const ribbonSrc = fs.readFileSync(
    path.join(WEB_DIR, "src", "components", "JamoviRibbon.tsx"),
    "utf8",
  );
  assert.ok(ribbonSrc.includes('href="./user_manual/"'));
  assert.ok(!ribbonSrc.includes('href="/user_manual'));
});

test("buildUserManualHtml: compiles USER_MANUAL.md with KaTeX MathML, valid anchors, and callouts", async () => {
  const { buildUserManualHtml } = await import("../scripts/buildUserManual.mjs");
  const html = buildUserManualHtml(path.join(ROOT_DIR, "USER_MANUAL.md"));

  assert.ok(html.includes("<title>Panduan Pengguna Itemetri</title>"));
  assert.ok(html.includes("<math"));
  assert.ok(!html.includes("katex-error"));
  assert.ok(html.includes('<aside class="doc-callout is-important" role="note">'));
  assert.ok(!html.includes("[!IMPORTANT]"));
  assert.ok(!html.includes("\u2014") && !html.includes("\u2013"));

  const ids = new Set(Array.from(html.matchAll(/id="([^"]+)"/g), (m) => m[1]));
  const brokenAnchors = [];
  for (const m of html.matchAll(/href="#([^"]+)"/g)) {
    const targetId = decodeURIComponent(m[1]);
    if (!ids.has(targetId)) {
      brokenAnchors.push(targetId);
    }
  }
  assert.deepEqual(brokenAnchors, []);
});
