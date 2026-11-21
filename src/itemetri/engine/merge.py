from pathlib import Path

from anates.domain.enums import MergeAxis
from anates.domain.errors import DomainValidationError
from anates.domain.models import (
    EssayExam,
    EssaySubject,
    Exam,
    MergeResult,
    MultipleChoiceExam,
    MultipleChoiceSubject,
    ValidationIssue,
)
from anates.domain.types import OptionCount


def _merged_source_path(primary: Exam, explicit: str | None) -> str | None:
    if explicit is not None:
        return explicit
    if primary.source_path:
        return f"{Path(primary.source_path).stem}_merged.ana"
    return None


def _check_duplicate_names(
    primary_names: list[str],
    secondary_names: list[str],
    offset: int,
    warnings: list[ValidationIssue],
) -> None:
    seen = {name.strip().casefold() for name in primary_names if name.strip()}
    for idx, raw_name in enumerate(secondary_names):
        cleaned = raw_name.strip()
        if cleaned and cleaned.casefold() in seen:
            warnings.append(
                ValidationIssue(
                    code="merge_duplicate_subject_name",
                    message=(
                        f"Secondary subject {raw_name!r} at row {offset + idx + 1} "
                        "duplicates a name in the primary file."
                    ),
                    subject_index=offset + idx,
                )
            )


def _merge_mc_subjects(
    primary: MultipleChoiceExam,
    secondary: MultipleChoiceExam,
    *,
    require_matching_key: bool,
    resolved_source: str | None,
) -> MergeResult:
    p_len = len(primary.answer_key)
    s_len = len(secondary.answer_key)
    if p_len != s_len:
        raise DomainValidationError(
            f"Cannot merge MC subjects with different item counts ({p_len} vs {s_len})."
        )

    warnings: list[ValidationIssue] = []
    if primary.answer_key.upper() != secondary.answer_key.upper():
        msg = (
            "Secondary exam answer_key differs from primary exam "
            f"({primary.answer_key!r} vs {secondary.answer_key!r})."
        )
        if require_matching_key:
            raise DomainValidationError(msg)
        warnings.append(ValidationIssue(code="merge_key_mismatch", message=msg))

    p_opts = int(primary.option_count)
    s_opts = int(secondary.option_count)
    if p_opts != s_opts:
        msg = f"Secondary exam option_count ({s_opts}) differs from primary ({p_opts})."
        if require_matching_key:
            raise DomainValidationError(msg)
        warnings.append(ValidationIssue(code="merge_option_count_mismatch", message=msg))
    option_count = OptionCount(max(p_opts, s_opts))

    combined = tuple(
        MultipleChoiceSubject(
            name=subj.name,
            responses=subj.responses,
            original_index=idx,
        )
        for idx, subj in enumerate((*primary.subjects, *secondary.subjects))
    )
    _check_duplicate_names(
        [s.name for s in primary.subjects],
        [s.name for s in secondary.subjects],
        len(primary.subjects),
        warnings,
    )

    merged = MultipleChoiceExam(
        answer_key=primary.answer_key,
        option_count=option_count,
        subjects=combined,
        weights=primary.weights,
        is_sorted_by_score=False,
        is_need_recalc=True,
        source_path=resolved_source,
    )
    return MergeResult(
        exam=merged,
        added_subjects=len(secondary.subjects),
        added_items=0,
        warnings=tuple(warnings),
    )


def _merge_essay_subjects(
    primary: EssayExam,
    secondary: EssayExam,
    *,
    require_matching_key: bool,
    resolved_source: str | None,
) -> MergeResult:
    p_len = len(primary.ideal_scores)
    s_len = len(secondary.ideal_scores)
    if p_len != s_len:
        raise DomainValidationError(
            f"Cannot merge essay subjects with different item counts ({p_len} vs {s_len})."
        )

    warnings: list[ValidationIssue] = []
    if primary.ideal_scores != secondary.ideal_scores:
        msg = (
            "Secondary exam ideal_scores differ from primary exam "
            f"({primary.ideal_scores} vs {secondary.ideal_scores})."
        )
        if require_matching_key:
            raise DomainValidationError(msg)
        warnings.append(ValidationIssue(code="merge_ideal_scores_mismatch", message=msg))

    if primary.item_numbers != secondary.item_numbers:
        warnings.append(
            ValidationIssue(
                code="merge_item_numbers_mismatch",
                message=(
                    "Secondary essay item_numbers differ from primary; retained primary numbering."
                ),
            )
        )

    combined = tuple(
        EssaySubject(
            name=subj.name,
            scores=subj.scores,
            original_index=idx,
        )
        for idx, subj in enumerate((*primary.subjects, *secondary.subjects))
    )
    _check_duplicate_names(
        [s.name for s in primary.subjects],
        [s.name for s in secondary.subjects],
        len(primary.subjects),
        warnings,
    )

    merged = EssayExam(
        ideal_scores=primary.ideal_scores,
        subjects=combined,
        item_numbers=primary.item_numbers,
        is_sorted_by_score=False,
        is_need_recalc=True,
        source_path=resolved_source,
    )
    return MergeResult(
        exam=merged,
        added_subjects=len(secondary.subjects),
        added_items=0,
        warnings=tuple(warnings),
    )


def _merge_mc_items(
    primary: MultipleChoiceExam,
    secondary: MultipleChoiceExam,
    *,
    resolved_source: str | None,
) -> MergeResult:
    if len(primary.subjects) != len(secondary.subjects):
        raise DomainValidationError(
            "Cannot append items with mismatched subject counts "
            f"({len(primary.subjects)} vs {len(secondary.subjects)})."
        )

    warnings: list[ValidationIssue] = []
    if int(primary.option_count) != int(secondary.option_count):
        warnings.append(
            ValidationIssue(
                code="merge_option_count_mismatch",
                message=(
                    f"Option counts differ ({int(primary.option_count)} vs "
                    f"{int(secondary.option_count)}); using maximum."
                ),
            )
        )

    subjects: list[MultipleChoiceSubject] = []
    for idx, (p_subj, s_subj) in enumerate(
        zip(primary.subjects, secondary.subjects, strict=True)
    ):
        if p_subj.name.strip().casefold() != s_subj.name.strip().casefold():
            warnings.append(
                ValidationIssue(
                    code="merge_subject_name_mismatch",
                    message=(
                        f"Row {idx + 1} name {p_subj.name!r} differs from "
                        f"secondary {s_subj.name!r}; kept primary name."
                    ),
                    subject_index=idx,
                )
            )
        subjects.append(
            MultipleChoiceSubject(
                name=p_subj.name,
                responses=p_subj.responses + s_subj.responses,
                original_index=idx,
            )
        )

    merged = MultipleChoiceExam(
        answer_key=primary.answer_key + secondary.answer_key,
        option_count=OptionCount(max(int(primary.option_count), int(secondary.option_count))),
        subjects=tuple(subjects),
        weights=primary.weights,
        is_sorted_by_score=False,
        is_need_recalc=True,
        source_path=resolved_source,
    )
    return MergeResult(
        exam=merged,
        added_subjects=0,
        added_items=len(secondary.answer_key),
        warnings=tuple(warnings),
    )


def _merge_essay_items(
    primary: EssayExam,
    secondary: EssayExam,
    *,
    resolved_source: str | None,
) -> MergeResult:
    if len(primary.subjects) != len(secondary.subjects):
        raise DomainValidationError(
            "Cannot append items with mismatched subject counts "
            f"({len(primary.subjects)} vs {len(secondary.subjects)})."
        )

    warnings: list[ValidationIssue] = []
    subjects: list[EssaySubject] = []
    for idx, (p_subj, s_subj) in enumerate(
        zip(primary.subjects, secondary.subjects, strict=True)
    ):
        if p_subj.name.strip().casefold() != s_subj.name.strip().casefold():
            warnings.append(
                ValidationIssue(
                    code="merge_subject_name_mismatch",
                    message=(
                        f"Row {idx + 1} name {p_subj.name!r} differs from "
                        f"secondary {s_subj.name!r}; kept primary name."
                    ),
                    subject_index=idx,
                )
            )
        subjects.append(
            EssaySubject(
                name=p_subj.name,
                scores=p_subj.scores + s_subj.scores,
                original_index=idx,
            )
        )

    if set(primary.item_numbers) & set(secondary.item_numbers):
        start_num = max(primary.item_numbers) + 1
        sec_numbers = tuple(range(start_num, start_num + len(secondary.ideal_scores)))
        warnings.append(
            ValidationIssue(
                code="merge_item_numbers_renumbered",
                message=(
                    f"Overlapping essay item numbers; renumbered appended items "
                    f"starting at #{start_num}."
                ),
            )
        )
    else:
        sec_numbers = secondary.item_numbers

    merged = EssayExam(
        ideal_scores=primary.ideal_scores + secondary.ideal_scores,
        subjects=tuple(subjects),
        item_numbers=primary.item_numbers + sec_numbers,
        is_sorted_by_score=False,
        is_need_recalc=True,
        source_path=resolved_source,
    )
    return MergeResult(
        exam=merged,
        added_subjects=0,
        added_items=len(secondary.ideal_scores),
        warnings=tuple(warnings),
    )


def merge_exams(
    primary: Exam,
    secondary: Exam,
    *,
    axis: MergeAxis = MergeAxis.APPEND_SUBJECTS,
    require_matching_key: bool = True,
    source_path: str | None = None,
) -> MergeResult:
    """Combine two compatible exams by appending subjects (TFGabungDuaFile) or items."""
    if primary.kind is not secondary.kind:
        raise DomainValidationError(
            f"Cannot merge different exam kinds ({primary.kind.value} vs {secondary.kind.value})."
        )

    resolved_source = _merged_source_path(primary, source_path)
    if isinstance(primary, MultipleChoiceExam):
        assert isinstance(secondary, MultipleChoiceExam)
        if axis is MergeAxis.APPEND_SUBJECTS:
            return _merge_mc_subjects(
                primary,
                secondary,
                require_matching_key=require_matching_key,
                resolved_source=resolved_source,
            )
        return _merge_mc_items(primary, secondary, resolved_source=resolved_source)

    assert isinstance(secondary, EssayExam)
    if axis is MergeAxis.APPEND_SUBJECTS:
        return _merge_essay_subjects(
            primary,
            secondary,
            require_matching_key=require_matching_key,
            resolved_source=resolved_source,
        )
    return _merge_essay_items(primary, secondary, resolved_source=resolved_source)
