export type ExamKind = "multiple_choice" | "essay";
export type CompatibilityMode = "legacy_anates" | "standard_corrected";
export type EssayDifficultyScope = "all_subjects" | "upper_lower_2n";
export type MergeAxis = "subjects" | "items";
export type WorkspaceTab = "variabel" | "data" | "analisis" | "grafik" | "edit";
export type ThemePreference = "light" | "dark" | "system";
export type ItemVerdictStatus = "Terima" | "Revisi" | "Tolak";

export interface ScoringWeights {
  correct: number;
  wrong: number;
}

export interface MultipleChoiceSubject {
  name: string;
  responses: string;
  original_index: number;
}

export interface EssaySubject {
  name: string;
  scores: Array<number | null>;
  original_index: number;
}

export interface ExamPayload {
  kind: ExamKind;
  source_path: string | null;
  is_sorted_by_score: boolean;
  is_need_recalc: boolean;
  answer_key?: string;
  option_count?: number;
  weights?: ScoringWeights;
  mc_subjects?: MultipleChoiceSubject[];
  ideal_scores?: number[];
  item_numbers?: number[];
  essay_subjects?: EssaySubject[];
  item_indicators?: string[];
  has_missing_keys?: boolean;
}

export interface AnalysisOptions {
  mode: CompatibilityMode;
  upper_lower_percent: number;
  use_weighted_score: boolean;
  essay_difficulty_scope: EssayDifficultyScope | null;
  passing_score?: number | null;
}

export interface ValidationIssue {
  code: string;
  message: string;
  subject_index: number | null;
  item_index: number | null;
}

export interface DiscriminationItem {
  item_index: number;
  item_number: number;
  upper_total: number;
  lower_total: number;
  difference: number;
  index_percent: number | null;
}

export interface DifficultyItem {
  item_index: number;
  item_number: number;
  numerator: number;
  denominator: number;
  index_percent: number | null;
  category: string | null;
}

export interface CorrelationItem {
  item_index: number;
  item_number: number;
  correlation: number | null;
  p_value: number | null;
  significance: string;
  corrected_correlation: number | null;
  corrected_p_value: number | null;
  corrected_significance: string | null;
  alpha_if_deleted: number | null;
}

export interface DistractorOption {
  option: string;
  frequency: number;
  index_percent: number | null;
  quality: string;
  upper_count?: number;
  lower_count?: number;
  is_functioning?: boolean | null;
}

export interface DistractorItem {
  item_index: number;
  item_number: number;
  key: string;
  correct_count: number;
  blank_count: number;
  other_count: number;
  ideal_count: number;
  options: DistractorOption[];
  upper_blank_count?: number;
  lower_blank_count?: number;
  functioning_count?: number;
  distractor_count?: number;
}

export interface ItemCriterionCheck {
  criterion: string;
  actual_label: string;
  threshold_label: string;
  passed: boolean;
  action_hint: string;
}

export interface ItemVerdict {
  item_index: number;
  item_number: number;
  status: ItemVerdictStatus;
  reasons: string[];
  suspected_miskey?: boolean;
  corrected_status?: ItemVerdictStatus | null;
  corrected_reasons?: string[];
  checks?: ItemCriterionCheck[];
  corrected_checks?: ItemCriterionCheck[];
}

export interface EssayItemUpperLower {
  item_index: number;
  item_number: number;
  upper_mean: number | null;
  lower_mean: number | null;
  mean_diff: number | null;
  upper_std: number | null;
  lower_std: number | null;
  upper_sum: number;
  lower_sum: number;
  upper_valid_count: number;
  lower_valid_count: number;
  se_pooled: number | null;
  t_value: number | null;
  p_value: number | null;
}

export interface MultipleChoiceSubjectScore {
  original_index: number;
  name: string;
  score_pattern: string;
  correct_count: number;
  wrong_count: number;
  blank_count: number;
  raw_score: number;
  weighted_score: number;
}

export interface EssaySubjectScore {
  original_index: number;
  name: string;
  scores: Array<number | null>;
  blank_count: number;
  total_score: number;
}

export interface ReliabilitySubjectRow {
  original_index: number;
  name: string;
  odd_score: number;
  even_score: number;
  split_total: number;
}

export interface ReliabilityResult {
  correlation_xy: number | null;
  reliability_coefficient: number | null;
  method: string;
  rows: ReliabilitySubjectRow[];
  cronbach_alpha: number | null;
  kr20: number | null;
  kr21: number | null;
}

export interface ScoreDistributionSummary {
  skewness: number | null;
  skew_label: "Simetris" | "Condong Kanan (Positif)" | "Condong Kiri (Negatif)" | "Tidak Terdefinisi";
  iqr: number | null;
  q1: number | null;
  q3: number | null;
  mean_percent: number | null;
  effect_flag: "normal" | "floor" | "ceiling";
  passing_score: number | null;
  pass_count: number | null;
  pass_percent: number | null;
  narrative: string;
}

export interface ExecutiveSummary {
  quality_tier: "Baik" | "Cukup" | "Perlu Perbaikan";
  headline: string;
  reliability_narrative: string;
  item_action_narrative: string;
  student_summary_narrative: string;
  accept_count: number;
  revise_count: number;
  reject_count: number;
  miskey_items: number[];
  revise_items: number[];
  reject_items: number[];
}

export interface IndicatorSummaryItem {
  indicator: string;
  item_count: number;
  item_numbers: number[];
  mean_tk_percent: number | null;
  mean_dp_percent: number | null;
  accept_count: number;
  revise_count: number;
  reject_count: number;
  mastery_label: string;
}

export interface AnalysisResponse {
  kind: ExamKind;
  subject_count: number;
  item_count: number;
  options: AnalysisOptions;
  scoring: {
    subjects: Array<MultipleChoiceSubjectScore | EssaySubjectScore>;
    sorted_order: number[];
    mean: number | null;
    std_dev: number | null;
    uses_weighted_score?: boolean;
    observed_max?: number[];
    observed_min?: number[];
    min_score?: number | null;
    max_score?: number | null;
    median_score?: number | null;
    ideal_max_score?: number | null;
  };
  upper_lower: {
    group_size: number;
    upper_indices: number[];
    lower_indices: number[];
  };
  discrimination: DiscriminationItem[];
  difficulty: DifficultyItem[];
  correlations: CorrelationItem[];
  distractors?: DistractorItem[];
  essay_upper_lower?: EssayItemUpperLower[];
  reliability: ReliabilityResult;
  warnings: ValidationIssue[];
  verdicts?: ItemVerdict[];
  interpretations: {
    reliability_tt: string;
    cronbach_alpha: string;
    kr20: string | null;
    kr21: string | null;
  };
  executive_summary?: ExecutiveSummary;
  score_distribution?: ScoreDistributionSummary;
  indicator_summary?: IndicatorSummaryItem[];
}

export interface MergeSummary {
  axis: MergeAxis;
  added_subjects: number;
  added_items: number;
  warnings: ValidationIssue[];
}

export interface CompatibilityDiff {
  source_path: string | null;
  exam_kind: ExamKind;
  subject_count: number;
  item_count: number;
  legacy_correlation_xy: number | null;
  corrected_correlation_xy: number | null;
  correlation_xy_delta: number | null;
  legacy_reliability: number | null;
  corrected_reliability: number | null;
  reliability_delta: number | null;
  difficulty_category_changes: Array<{
    item_index: number;
    item_number: number;
    legacy_category: string | null;
    corrected_category: string | null;
    legacy_index_percent: number | null;
    corrected_index_percent: number | null;
  }>;
  significance_changes: Array<{
    item_index: number;
    item_number: number;
    correlation: number | null;
    legacy_significance: string;
    corrected_significance: string;
    corrected_p_value: number | null;
  }>;
  item_deltas: Array<{
    item_index: number;
    item_number: number;
    metric: string;
    legacy_value: number | null;
    corrected_value: number | null;
    delta: number | null;
  }>;
}

export interface SampleFileInfo {
  filename: string;
  size_bytes: number;
  label?: string | null;
  kind_hint?: string | null;
  is_builtin?: boolean;
}

export interface ImportMetadata {
  filename: string;
  file_version: string | null;
  detected_encoding: string | null;
}

export type ExportFormat =
  | "ana"
  | "csv-exam"
  | "csv-analysis"
  | "xlsx-exam"
  | "xlsx-analysis"
  | "html"
  | "reliabel-txt";

export interface SuggestedMapping {
  has_header_row: boolean;
  key_row_index: number | null;
  name_col_index: number | null;
  item_col_indices: number[];
  inferred_kind: ExamKind;
  default_key_or_ideal: string;
  ignored_col_indices?: number[];
  ignored_col_reasons?: Record<number, string>;
  missing_key_warning?: boolean;
}

export interface TabularPreviewResponse {
  filename: string;
  total_rows: number;
  total_cols: number;
  preview_rows: string[][];
  suggested_mapping: SuggestedMapping;
}

export interface TabularMappingParams {
  hasHeaderRow: boolean;
  keyRowIndex: number | null;
  nameColIndex: number | null;
  itemColIndices: number[];
  kind: "auto" | "mc" | "essay";
  optionCount: number | null;
  defaultKeyOrIdeal: string;
}

export interface StartupResponse {
  has_startup: boolean;
  exam?: ExamPayload;
  analysis?: AnalysisResponse;
  metadata?: ImportMetadata;
}
