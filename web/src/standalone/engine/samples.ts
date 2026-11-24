import type { ExamPayload, SampleFileInfo } from "../../types";

export const BUILTIN_SAMPLE_LIST: SampleFileInfo[] = [
  {
    filename: "simulasi-pg-diagnostik",
    size_bytes: 0,
    label: "Simulasi PG Diagnostik (25x10, salah kunci #9)",
    kind_hint: "multiple_choice",
    is_builtin: true,
  },
  {
    filename: "simulasi-uraian",
    size_bytes: 0,
    label: "Simulasi Uraian (20x5, skor 10-20)",
    kind_hint: "essay",
    is_builtin: true,
  },
];

const MC_SAMPLE: ExamPayload = {
  kind: "multiple_choice",
  source_path: "simulasi-pg-diagnostik",
  is_sorted_by_score: false,
  is_need_recalc: true,
  answer_key: "ABCDABCDCB",
  option_count: 4,
  weights: { correct: 1.0, wrong: 0.0 },
  mc_subjects: [
    { name: "Peserta 01", responses: "ABCDBBCDAB", original_index: 0 },
    { name: "Peserta 02", responses: "ABDDABADAB", original_index: 1 },
    { name: "Peserta 03", responses: "ABCDCBCDAB", original_index: 2 },
    { name: "Peserta 04", responses: "ABCDBBCDAB", original_index: 3 },
    { name: "Peserta 05", responses: "ACCDDBCDAB", original_index: 4 },
    { name: "Peserta 06", responses: "ABCDABCDAB", original_index: 5 },
    { name: "Peserta 07", responses: "ABADABCDAB", original_index: 6 },
    { name: "Peserta 08", responses: "ABDDDBBABB", original_index: 7 },
    { name: "Peserta 09", responses: "ABCDABBBAB", original_index: 8 },
    { name: "Peserta 10", responses: "ACBDABADAB", original_index: 9 },
    { name: "Peserta 11", responses: "ABCDCBAAAB", original_index: 10 },
    { name: "Peserta 12", responses: "ABCDCACACB", original_index: 11 },
    { name: "Peserta 13", responses: "ABCCABBCAB", original_index: 12 },
    { name: "Peserta 14", responses: "AAADBBABBB", original_index: 13 },
    { name: "Peserta 15", responses: "ABCABBBCAB", original_index: 14 },
    { name: "Peserta 16", responses: "DBBCDBACCB", original_index: 15 },
    { name: "Peserta 17", responses: "BCDDCBDBAB", original_index: 16 },
    { name: "Peserta 18", responses: "DBDACBDACB", original_index: 17 },
    { name: "Peserta 19", responses: "DDCADBBCBB", original_index: 18 },
    { name: "Peserta 20", responses: "BCBCDBDCBB", original_index: 19 },
    { name: "Peserta 21", responses: "CCACDDBCCB", original_index: 20 },
    { name: "Peserta 22", responses: "BDBABDBACB", original_index: 21 },
    { name: "Peserta 23", responses: "ADBCDDACCA", original_index: 22 },
    { name: "Peserta 24", responses: "CADADADCCC", original_index: 23 },
    { name: "Peserta 25", responses: "CCBCCBACCB", original_index: 24 },
  ],
};

const ESSAY_SAMPLE: ExamPayload = {
  kind: "essay",
  source_path: "simulasi-uraian",
  is_sorted_by_score: false,
  is_need_recalc: true,
  ideal_scores: [10.0, 10.0, 15.0, 15.0, 20.0],
  item_numbers: [1, 2, 3, 4, 5],
  essay_subjects: [
    { name: "Peserta 01", scores: [9.0, 8.5, 14.0, 12.5, 18.0], original_index: 0 },
    { name: "Peserta 02", scores: [8.0, 7.5, 12.5, 11.5, 16.0], original_index: 1 },
    { name: "Peserta 03", scores: [8.0, 5.5, 11.5, 11.5, 16.5], original_index: 2 },
    { name: "Peserta 04", scores: [7.5, 8.0, 12.0, 11.0, 15.5], original_index: 3 },
    { name: "Peserta 05", scores: [7.5, 6.5, 10.0, 9.0, 11.5], original_index: 4 },
    { name: "Peserta 06", scores: [7.5, 6.5, 10.0, 11.5, 16.0], original_index: 5 },
    { name: "Peserta 07", scores: [6.5, 5.0, 8.0, 9.5, 13.0], original_index: 6 },
    { name: "Peserta 08", scores: [5.5, 6.0, 9.5, 5.0, 13.5], original_index: 7 },
    { name: "Peserta 09", scores: [6.0, 3.5, 8.5, 7.5, 11.0], original_index: 8 },
    { name: "Peserta 10", scores: [6.0, 5.5, 9.5, 8.0, 12.0], original_index: 9 },
    { name: "Peserta 11", scores: [6.0, 4.0, 11.5, 6.5, 7.5], original_index: 10 },
    { name: "Peserta 12", scores: [7.0, 6.0, 7.5, 8.0, 11.0], original_index: 11 },
    { name: "Peserta 13", scores: [3.5, 2.0, 8.5, 7.5, 8.5], original_index: 12 },
    { name: "Peserta 14", scores: [5.5, 3.5, 7.5, 7.5, 11.0], original_index: 13 },
    { name: "Peserta 15", scores: [4.5, 5.0, 7.5, 7.0, 8.5], original_index: 14 },
    { name: "Peserta 16", scores: [4.0, 1.5, 8.5, 4.0, 9.0], original_index: 15 },
    { name: "Peserta 17", scores: [3.0, 4.5, 5.5, 5.0, 7.0], original_index: 16 },
    { name: "Peserta 18", scores: [5.0, 4.0, 7.5, 8.5, 9.5], original_index: 17 },
    { name: "Peserta 19", scores: [3.5, 3.5, 6.5, 8.5, 6.5], original_index: 18 },
    { name: "Peserta 20", scores: [2.5, 3.5, 3.0, 3.0, 4.5], original_index: 19 },
  ],
};

export function getBuiltinSample(filename: string): ExamPayload | null {
  if (filename === "simulasi-pg-diagnostik") {
    return structuredClone(MC_SAMPLE);
  }
  if (filename === "simulasi-uraian") {
    return structuredClone(ESSAY_SAMPLE);
  }
  return null;
}
