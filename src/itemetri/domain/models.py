import math
from dataclasses import dataclass

from itemetri.domain.enums import (
    CompatibilityMode,
    DifficultyCategory,
    DistractorQuality,
    EssayDifficultyScope,
    ExamKind,
    ItemVerdictStatus,
    SignificanceLevel,
)
from itemetri.domain.errors import DomainValidationError
from itemetri.domain.types import ItemCount, OptionCount, SubjectCount


@dataclass(frozen=True, slots=True)
class ScoringWeights:
    correct: float = 1.0
    wrong: float = 0.0

    def __post_init__(self) -> None:
        if not (math.isfinite(self.correct) and math.isfinite(self.wrong)):
            raise DomainValidationError("Scoring weights must be finite numbers.")


@dataclass(frozen=True, slots=True)
class AnalysisOptions:
    mode: CompatibilityMode = CompatibilityMode.STANDARD_CORRECTED
    upper_lower_percent: float = 27.0
    use_weighted_score: bool = False
    essay_difficulty_scope: EssayDifficultyScope | None = None

    def __post_init__(self) -> None:
        p = self.upper_lower_percent
        if not (math.isfinite(p) and 0.0 < p <= 50.0):
            raise DomainValidationError(
                f"upper_lower_percent must be in (0, 50], got {p}."
            )
        if self.mode is CompatibilityMode.LEGACY_ANATES:
            if self.use_weighted_score:
                raise DomainValidationError(
                    "Weighted score analysis is disabled in LEGACY_ANATES mode "
                    "to match AnatesV4.exe."
                )
            if self.essay_difficulty_scope is EssayDifficultyScope.ALL_SUBJECTS:
                raise DomainValidationError(
                    "ALL_SUBJECTS essay difficulty scope is disabled in LEGACY_ANATES mode."
                )

    def resolved_essay_difficulty_scope(self) -> EssayDifficultyScope:
        if self.essay_difficulty_scope is not None:
            return self.essay_difficulty_scope
        if self.mode is CompatibilityMode.LEGACY_ANATES:
            return EssayDifficultyScope.UPPER_LOWER_2N
        return EssayDifficultyScope.ALL_SUBJECTS


@dataclass(frozen=True, slots=True)
class ValidationIssue:
    code: str
    message: str
    subject_index: int | None = None
    item_index: int | None = None


@dataclass(frozen=True, slots=True)
class MultipleChoiceSubject:
    name: str
    responses: str
    original_index: int

    def __post_init__(self) -> None:
        if self.original_index < 0:
            raise DomainValidationError(
                f"Subject original_index must be >= 0, got {self.original_index}."
            )


@dataclass(frozen=True, slots=True)
class MultipleChoiceExam:
    answer_key: str
    option_count: OptionCount
    subjects: tuple[MultipleChoiceSubject, ...]
    weights: ScoringWeights = ScoringWeights()
    is_sorted_by_score: bool = False
    is_need_recalc: bool = True
    source_path: str | None = None

    def __post_init__(self) -> None:
        item_len = len(self.answer_key)
        if item_len < 1:
            raise DomainValidationError("answer_key must contain at least one item.")
        opts = int(self.option_count)
        if not (2 <= opts <= 26):
            raise DomainValidationError(f"option_count must be between 2 and 26, got {opts}.")
        if len(self.subjects) < 1:
            raise DomainValidationError("Exam must contain at least one subject.")
        seen_indices: set[int] = set()
        for subject in self.subjects:
            if len(subject.responses) != item_len:
                raise DomainValidationError(
                    f"Subject {subject.original_index} ({subject.name!r}) response length "
                    f"{len(subject.responses)} does not match answer_key length {item_len}."
                )
            if subject.original_index in seen_indices:
                raise DomainValidationError(
                    f"Duplicate subject original_index: {subject.original_index}."
                )
            seen_indices.add(subject.original_index)

    @property
    def item_count(self) -> ItemCount:
        return ItemCount(len(self.answer_key))

    @property
    def subject_count(self) -> SubjectCount:
        return SubjectCount(len(self.subjects))

    @property
    def kind(self) -> ExamKind:
        return ExamKind.MULTIPLE_CHOICE


@dataclass(frozen=True, slots=True)
class EssaySubject:
    name: str
    scores: tuple[float | None, ...]
    original_index: int

    def __post_init__(self) -> None:
        if self.original_index < 0:
            raise DomainValidationError(
                f"Subject original_index must be >= 0, got {self.original_index}."
            )
        for item_idx, val in enumerate(self.scores):
            if val is not None and (not math.isfinite(val) or val < 0.0):
                raise DomainValidationError(
                    f"Essay score at subject {self.original_index}, item {item_idx} "
                    f"must be finite and >= 0, got {val}."
                )


@dataclass(frozen=True, slots=True)
class EssayExam:
    ideal_scores: tuple[float, ...]
    subjects: tuple[EssaySubject, ...]
    item_numbers: tuple[int, ...] = ()
    is_sorted_by_score: bool = False
    is_need_recalc: bool = True
    source_path: str | None = None

    def __post_init__(self) -> None:
        item_len = len(self.ideal_scores)
        if item_len < 1:
            raise DomainValidationError("ideal_scores must contain at least one item.")
        for idx, ideal in enumerate(self.ideal_scores):
            if not math.isfinite(ideal) or ideal <= 0.0:
                raise DomainValidationError(
                    f"ideal_scores[{idx}] must be finite and > 0, got {ideal}."
                )
        if len(self.subjects) < 1:
            raise DomainValidationError("Exam must contain at least one subject.")
        if not self.item_numbers:
            object.__setattr__(self, "item_numbers", tuple(range(1, item_len + 1)))
        else:
            if len(self.item_numbers) != item_len:
                raise DomainValidationError(
                    f"item_numbers length {len(self.item_numbers)} must match "
                    f"ideal_scores length {item_len}."
                )
            if any(num <= 0 for num in self.item_numbers):
                raise DomainValidationError("All item_numbers must be positive integers.")
        seen_indices: set[int] = set()
        for subject in self.subjects:
            if len(subject.scores) != item_len:
                raise DomainValidationError(
                    f"Subject {subject.original_index} ({subject.name!r}) score count "
                    f"{len(subject.scores)} does not match ideal_scores length {item_len}."
                )
            if subject.original_index in seen_indices:
                raise DomainValidationError(
                    f"Duplicate subject original_index: {subject.original_index}."
                )
            seen_indices.add(subject.original_index)

    @property
    def item_count(self) -> ItemCount:
        return ItemCount(len(self.ideal_scores))

    @property
    def subject_count(self) -> SubjectCount:
        return SubjectCount(len(self.subjects))

    @property
    def kind(self) -> ExamKind:
        return ExamKind.ESSAY


Exam = MultipleChoiceExam | EssayExam


@dataclass(frozen=True, slots=True)
class CachedSubjectScore:
    name: str
    score_pattern: str
    total_score: float
    weighted_score: float | None
    original_index: int
    correct_count: int | None
    wrong_count: int | None
    blank_count: int


@dataclass(frozen=True, slots=True)
class CachedScoreSummary:
    mean: float
    std_dev: float
    is_sorted_by_score: bool
    item_count: int
    weights: ScoringWeights | None
    subjects: tuple[CachedSubjectScore, ...]
    max_scores: tuple[float, ...] = ()
    min_scores: tuple[float, ...] = ()


@dataclass(frozen=True, slots=True)
class AnaDocument:
    exam: Exam
    file_version: str
    detected_encoding: str
    cached_scores: CachedScoreSummary | None = None


@dataclass(frozen=True, slots=True)
class MultipleChoiceSubjectScore:
    original_index: int
    name: str
    score_pattern: str
    correct_count: int
    wrong_count: int
    blank_count: int
    raw_score: float
    weighted_score: float


@dataclass(frozen=True, slots=True)
class MultipleChoiceScoringResult:
    subjects: tuple[MultipleChoiceSubjectScore, ...]
    sorted_order: tuple[int, ...]
    mean: float
    std_dev: float
    uses_weighted_score: bool
    min_score: float = math.nan
    max_score: float = math.nan
    median_score: float = math.nan
    ideal_max_score: float = math.nan


@dataclass(frozen=True, slots=True)
class EssaySubjectScore:
    original_index: int
    name: str
    scores: tuple[float | None, ...]
    blank_count: int
    total_score: float


@dataclass(frozen=True, slots=True)
class EssayScoringResult:
    subjects: tuple[EssaySubjectScore, ...]
    sorted_order: tuple[int, ...]
    mean: float
    std_dev: float
    observed_max: tuple[float, ...]
    observed_min: tuple[float, ...]
    min_score: float = math.nan
    max_score: float = math.nan
    median_score: float = math.nan
    ideal_max_score: float = math.nan


@dataclass(frozen=True, slots=True)
class UpperLowerSplit:
    group_size: int
    upper_indices: tuple[int, ...]
    lower_indices: tuple[int, ...]


@dataclass(frozen=True, slots=True)
class EssayItemUpperLower:
    item_index: int
    item_number: int
    upper_mean: float
    lower_mean: float
    mean_diff: float
    upper_std: float
    lower_std: float
    upper_sum: float
    lower_sum: float
    upper_valid_count: int
    lower_valid_count: int
    se_pooled: float
    t_value: float
    p_value: float | None


@dataclass(frozen=True, slots=True)
class DiscriminationItem:
    item_index: int
    item_number: int
    upper_total: float
    lower_total: float
    difference: float
    index_percent: float


@dataclass(frozen=True, slots=True)
class DifficultyItem:
    item_index: int
    item_number: int
    numerator: float
    denominator: float
    index_percent: float
    category: DifficultyCategory | None


@dataclass(frozen=True, slots=True)
class CorrelationItem:
    item_index: int
    item_number: int
    correlation: float
    p_value: float | None
    significance: SignificanceLevel
    corrected_correlation: float | None = None
    corrected_p_value: float | None = None
    corrected_significance: SignificanceLevel | None = None
    alpha_if_deleted: float | None = None


@dataclass(frozen=True, slots=True)
class DistractorOption:
    option: str
    frequency: int
    index_percent: float
    quality: DistractorQuality
    upper_count: int = 0
    lower_count: int = 0
    is_functioning: bool | None = None


@dataclass(frozen=True, slots=True)
class DistractorItem:
    item_index: int
    item_number: int
    key: str
    correct_count: int
    blank_count: int
    other_count: int
    ideal_count: float
    options: tuple[DistractorOption, ...]
    upper_blank_count: int = 0
    lower_blank_count: int = 0
    functioning_count: int = 0
    distractor_count: int = 0


@dataclass(frozen=True, slots=True)
class ItemVerdict:
    item_index: int
    item_number: int
    status: ItemVerdictStatus
    reasons: tuple[str, ...]
    suspected_miskey: bool = False
    corrected_status: ItemVerdictStatus | None = None
    corrected_reasons: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class ReliabilitySubjectRow:
    original_index: int
    name: str
    odd_score: float
    even_score: float
    split_total: float


@dataclass(frozen=True, slots=True)
class ReliabilityResult:
    correlation_xy: float
    reliability_coefficient: float
    method: str
    rows: tuple[ReliabilitySubjectRow, ...]
    cronbach_alpha: float | None = None
    kr20: float | None = None
    kr21: float | None = None


@dataclass(frozen=True, slots=True)
class EssayRecapItem:
    item_index: int
    item_number: int
    t_value: float
    discrimination_percent: float
    difficulty_category: DifficultyCategory | None
    correlation: float
    significance: SignificanceLevel


@dataclass(frozen=True, slots=True)
class MultipleChoiceAnalysis:
    exam: MultipleChoiceExam
    options: AnalysisOptions
    scoring: MultipleChoiceScoringResult
    upper_lower: UpperLowerSplit
    discrimination: tuple[DiscriminationItem, ...]
    difficulty: tuple[DifficultyItem, ...]
    correlations: tuple[CorrelationItem, ...]
    distractors: tuple[DistractorItem, ...]
    reliability: ReliabilityResult
    warnings: tuple[ValidationIssue, ...]
    verdicts: tuple[ItemVerdict, ...] = ()


@dataclass(frozen=True, slots=True)
class EssayAnalysis:
    exam: EssayExam
    options: AnalysisOptions
    scoring: EssayScoringResult
    upper_lower: UpperLowerSplit
    essay_upper_lower: tuple[EssayItemUpperLower, ...]
    discrimination: tuple[DiscriminationItem, ...]
    difficulty: tuple[DifficultyItem, ...]
    correlations: tuple[CorrelationItem, ...]
    reliability: ReliabilityResult
    recap: tuple[EssayRecapItem, ...]
    warnings: tuple[ValidationIssue, ...]
    verdicts: tuple[ItemVerdict, ...] = ()


ExamAnalysis = MultipleChoiceAnalysis | EssayAnalysis


@dataclass(frozen=True, slots=True)
class DifficultyCategoryChange:
    item_index: int
    item_number: int
    legacy_category: DifficultyCategory | None
    corrected_category: DifficultyCategory | None
    legacy_index_percent: float
    corrected_index_percent: float


@dataclass(frozen=True, slots=True)
class SignificanceChange:
    item_index: int
    item_number: int
    correlation: float
    legacy_significance: SignificanceLevel
    corrected_significance: SignificanceLevel
    corrected_p_value: float | None


@dataclass(frozen=True, slots=True)
class ItemNumericDelta:
    item_index: int
    item_number: int
    metric: str
    legacy_value: float
    corrected_value: float
    delta: float


@dataclass(frozen=True, slots=True)
class CompatibilityDiff:
    source_path: str | None
    exam_kind: ExamKind
    subject_count: SubjectCount
    item_count: ItemCount
    legacy_correlation_xy: float
    corrected_correlation_xy: float
    correlation_xy_delta: float
    legacy_reliability: float
    corrected_reliability: float
    reliability_delta: float
    difficulty_category_changes: tuple[DifficultyCategoryChange, ...]
    significance_changes: tuple[SignificanceChange, ...]
    item_deltas: tuple[ItemNumericDelta, ...]


@dataclass(frozen=True, slots=True)
class MergeResult:
    exam: Exam
    added_subjects: int
    added_items: int
    warnings: tuple[ValidationIssue, ...]
