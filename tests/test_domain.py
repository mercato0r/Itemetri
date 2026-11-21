import math

import pytest

from anates.domain import (
    AnalysisOptions,
    CompatibilityMode,
    DegreesOfFreedom,
    DomainValidationError,
    EssayDifficultyScope,
    EssayExam,
    EssaySubject,
    MultipleChoiceExam,
    MultipleChoiceSubject,
    OptionCount,
    ScoringWeights,
    SubjectCount,
    correlation_degrees_of_freedom,
)


def test_correlation_degrees_of_freedom() -> None:
    assert correlation_degrees_of_freedom(SubjectCount(38)) == DegreesOfFreedom(36)


def test_scoring_weights_rejects_non_finite() -> None:
    with pytest.raises(DomainValidationError):
        ScoringWeights(correct=math.nan, wrong=0.0)
    with pytest.raises(DomainValidationError):
        ScoringWeights(correct=1.0, wrong=math.inf)


def test_analysis_options_constraints() -> None:
    with pytest.raises(DomainValidationError):
        AnalysisOptions(upper_lower_percent=0.0)
    with pytest.raises(DomainValidationError):
        AnalysisOptions(upper_lower_percent=50.5)
    with pytest.raises(DomainValidationError):
        AnalysisOptions(
            mode=CompatibilityMode.LEGACY_ANATES,
            use_weighted_score=True,
        )
    with pytest.raises(DomainValidationError):
        AnalysisOptions(
            mode=CompatibilityMode.LEGACY_ANATES,
            essay_difficulty_scope=EssayDifficultyScope.ALL_SUBJECTS,
        )

    legacy = AnalysisOptions(mode=CompatibilityMode.LEGACY_ANATES)
    corrected = AnalysisOptions(mode=CompatibilityMode.STANDARD_CORRECTED)
    assert legacy.resolved_essay_difficulty_scope() is EssayDifficultyScope.UPPER_LOWER_2N
    assert corrected.resolved_essay_difficulty_scope() is EssayDifficultyScope.ALL_SUBJECTS


def test_multiple_choice_exam_validation() -> None:
    with pytest.raises(DomainValidationError):
        MultipleChoiceSubject(name="A", responses="abc", original_index=-1)

    with pytest.raises(DomainValidationError):
        MultipleChoiceExam(
            answer_key="",
            option_count=OptionCount(4),
            subjects=(MultipleChoiceSubject("S1", "", 0),),
        )

    with pytest.raises(DomainValidationError):
        MultipleChoiceExam(
            answer_key="ab",
            option_count=OptionCount(1),
            subjects=(MultipleChoiceSubject("S1", "ab", 0),),
        )

    with pytest.raises(DomainValidationError):
        MultipleChoiceExam(
            answer_key="ab",
            option_count=OptionCount(27),
            subjects=(MultipleChoiceSubject("S1", "ab", 0),),
        )

    with pytest.raises(DomainValidationError):
        MultipleChoiceExam(
            answer_key="ab",
            option_count=OptionCount(4),
            subjects=(),
        )

    with pytest.raises(DomainValidationError):
        MultipleChoiceExam(
            answer_key="ab",
            option_count=OptionCount(4),
            subjects=(MultipleChoiceSubject("S1", "a", 0),),
        )

    with pytest.raises(DomainValidationError):
        MultipleChoiceExam(
            answer_key="ab",
            option_count=OptionCount(4),
            subjects=(
                MultipleChoiceSubject("S1", "ab", 0),
                MultipleChoiceSubject("S2", "ab", 0),
            ),
        )


def test_essay_exam_validation_and_defaults() -> None:
    with pytest.raises(DomainValidationError):
        EssaySubject(name="S1", scores=(-0.5,), original_index=0)
    with pytest.raises(DomainValidationError):
        EssaySubject(name="S1", scores=(math.nan,), original_index=0)

    exam = EssayExam(
        ideal_scores=(10.0, 20.0),
        subjects=(EssaySubject("S1", (8.0, None), 0),),
    )
    assert exam.item_numbers == (1, 2)

    with pytest.raises(DomainValidationError):
        EssayExam(
            ideal_scores=(10.0, 0.0),
            subjects=(EssaySubject("S1", (8.0, 0.0), 0),),
        )

    with pytest.raises(DomainValidationError):
        EssayExam(
            ideal_scores=(10.0, 20.0),
            subjects=(EssaySubject("S1", (8.0, 10.0), 0),),
            item_numbers=(1,),
        )

    with pytest.raises(DomainValidationError):
        EssayExam(
            ideal_scores=(10.0, 20.0),
            subjects=(EssaySubject("S1", (8.0, 10.0), 0),),
            item_numbers=(0, 2),
        )
