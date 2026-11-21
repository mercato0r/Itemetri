import math
from dataclasses import asdict, is_dataclass
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict

from itemetri.domain import (
    AnalysisOptions,
    CompatibilityDiff,
    CompatibilityMode,
    DomainValidationError,
    EssayDifficultyScope,
    EssayExam,
    EssaySubject,
    Exam,
    ExamAnalysis,
    ExamKind,
    MultipleChoiceExam,
    MultipleChoiceSubject,
    OptionCount,
    ScoringWeights,
)
from itemetri.engine import interpret_reliability


class ScoringWeightsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    correct: float = 1.0
    wrong: float = 0.0


class MultipleChoiceSubjectPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    responses: str
    original_index: int


class EssaySubjectPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    scores: list[float | None]
    original_index: int


class ExamPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: ExamKind
    source_path: str | None = None
    is_sorted_by_score: bool = False
    is_need_recalc: bool = True
    answer_key: str | None = None
    option_count: int | None = None
    weights: ScoringWeightsPayload = ScoringWeightsPayload()
    mc_subjects: list[MultipleChoiceSubjectPayload] | None = None
    ideal_scores: list[float] | None = None
    item_numbers: list[int] | None = None
    essay_subjects: list[EssaySubjectPayload] | None = None


class AnalysisOptionsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: CompatibilityMode = CompatibilityMode.STANDARD_CORRECTED
    upper_lower_percent: float = 27.0
    use_weighted_score: bool = False
    essay_difficulty_scope: EssayDifficultyScope | None = None


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exam: ExamPayload
    options: AnalysisOptionsPayload = AnalysisOptionsPayload()


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exam: ExamPayload
    upper_lower_percent: float = 27.0


class CellPatchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    row: int
    col: int
    value: Any = None


class SessionPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exam: ExamPayload | None = None
    options: AnalysisOptionsPayload = AnalysisOptionsPayload()
    cell_patches: list[CellPatchPayload] = []


ExportFormat = Literal[
    "ana",
    "csv-exam",
    "csv-analysis",
    "xlsx-exam",
    "xlsx-analysis",
    "html",
    "reliabel-txt",
]


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exam: ExamPayload
    options: AnalysisOptionsPayload = AnalysisOptionsPayload()
    format: ExportFormat


class SampleFileInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    filename: str
    size_bytes: int
    label: str | None = None
    kind_hint: str | None = None
    is_builtin: bool = False


def options_payload_to_domain(payload: AnalysisOptionsPayload) -> AnalysisOptions:
    return AnalysisOptions(
        mode=payload.mode,
        upper_lower_percent=payload.upper_lower_percent,
        use_weighted_score=payload.use_weighted_score,
        essay_difficulty_scope=payload.essay_difficulty_scope,
    )


def payload_to_exam(payload: ExamPayload) -> Exam:
    if payload.kind is ExamKind.MULTIPLE_CHOICE:
        if (
            payload.answer_key is None
            or payload.option_count is None
            or payload.mc_subjects is None
        ):
            raise DomainValidationError(
                "Multiple-choice payload requires answer_key, option_count, and mc_subjects."
            )
        return MultipleChoiceExam(
            answer_key=payload.answer_key,
            option_count=OptionCount(payload.option_count),
            subjects=tuple(
                MultipleChoiceSubject(
                    name=s.name,
                    responses=s.responses,
                    original_index=s.original_index,
                )
                for s in payload.mc_subjects
            ),
            weights=ScoringWeights(
                correct=payload.weights.correct,
                wrong=payload.weights.wrong,
            ),
            is_sorted_by_score=payload.is_sorted_by_score,
            is_need_recalc=payload.is_need_recalc,
            source_path=payload.source_path,
        )

    if payload.ideal_scores is None or payload.essay_subjects is None:
        raise DomainValidationError(
            "Essay payload requires ideal_scores and essay_subjects."
        )
    return EssayExam(
        ideal_scores=tuple(payload.ideal_scores),
        subjects=tuple(
            EssaySubject(
                name=s.name,
                scores=tuple(s.scores),
                original_index=s.original_index,
            )
            for s in payload.essay_subjects
        ),
        item_numbers=tuple(payload.item_numbers) if payload.item_numbers else (),
        is_sorted_by_score=payload.is_sorted_by_score,
        is_need_recalc=payload.is_need_recalc,
        source_path=payload.source_path,
    )


def sanitize_json(obj: Any) -> Any:
    if isinstance(obj, Enum):
        return obj.value
    if is_dataclass(obj) and not isinstance(obj, type):
        return {k: sanitize_json(v) for k, v in asdict(obj).items()}
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {str(k): sanitize_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [sanitize_json(item) for item in obj]
    return obj


def exam_to_payload(exam: Exam) -> dict[str, Any]:
    if isinstance(exam, MultipleChoiceExam):
        return {
            "kind": ExamKind.MULTIPLE_CHOICE.value,
            "source_path": exam.source_path,
            "is_sorted_by_score": exam.is_sorted_by_score,
            "is_need_recalc": exam.is_need_recalc,
            "answer_key": exam.answer_key,
            "option_count": int(exam.option_count),
            "weights": {
                "correct": exam.weights.correct,
                "wrong": exam.weights.wrong,
            },
            "mc_subjects": [
                {
                    "name": s.name,
                    "responses": s.responses,
                    "original_index": s.original_index,
                }
                for s in exam.subjects
            ],
        }
    return {
        "kind": ExamKind.ESSAY.value,
        "source_path": exam.source_path,
        "is_sorted_by_score": exam.is_sorted_by_score,
        "is_need_recalc": exam.is_need_recalc,
        "ideal_scores": list(exam.ideal_scores),
        "item_numbers": list(exam.item_numbers),
        "essay_subjects": [
            {
                "name": s.name,
                "scores": list(s.scores),
                "original_index": s.original_index,
            }
            for s in exam.subjects
        ],
    }


def analysis_to_response(analysis: ExamAnalysis) -> dict[str, Any]:
    data: dict[str, Any] = sanitize_json(analysis)
    # Omit redundant exam payload inside analysis responses; callers already hold the exam.
    data.pop("exam", None)
    rel = analysis.reliability
    data["kind"] = analysis.exam.kind.value
    data["subject_count"] = int(analysis.exam.subject_count)
    data["item_count"] = int(analysis.exam.item_count)
    data["interpretations"] = {
        "reliability_tt": interpret_reliability(rel.reliability_coefficient),
        "cronbach_alpha": interpret_reliability(rel.cronbach_alpha),
        "kr20": interpret_reliability(rel.kr20) if rel.kr20 is not None else None,
        "kr21": interpret_reliability(rel.kr21) if rel.kr21 is not None else None,
    }
    return data


def diff_to_response(diff: CompatibilityDiff) -> dict[str, Any]:
    result: dict[str, Any] = sanitize_json(diff)
    return result
