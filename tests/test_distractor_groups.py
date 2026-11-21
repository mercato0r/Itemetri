import math

from anates.domain import AnalysisOptions, MultipleChoiceExam, MultipleChoiceSubject, OptionCount
from anates.engine import analyze_multiple_choice, compute_distractors, score_multiple_choice


def test_distractor_upper_lower_partition_identity() -> None:
    subjects = tuple(
        MultipleChoiceSubject(
            name=f"S{i + 1}",
            responses=("ABC" if i < 5 else ("ABB" if i < 10 else "DCD")),
            original_index=i,
        )
        for i in range(15)
    )
    exam = MultipleChoiceExam(
        answer_key="ABC",
        option_count=OptionCount(4),
        subjects=subjects,
    )
    analysis = analyze_multiple_choice(exam)
    group_n = analysis.upper_lower.group_size
    assert group_n > 0

    for item in analysis.distractors:
        assert item.distractor_count == 3
        upper_sum = sum(opt.upper_count for opt in item.options) + item.upper_blank_count
        lower_sum = sum(opt.lower_count for opt in item.options) + item.lower_blank_count
        assert upper_sum == group_n
        assert lower_sum == group_n
        key_opt = next(opt for opt in item.options if opt.option == item.key)
        assert key_opt.is_functioning is None


def test_distractor_functioning_rule_and_split_none_backward_compat() -> None:
    subjects = tuple(
        MultipleChoiceSubject(
            name=f"P{i + 1}",
            responses="A" if i < 5 else ("B" if i < 9 else "C"),
            original_index=i,
        )
        for i in range(12)
    )
    exam = MultipleChoiceExam(
        answer_key="A",
        option_count=OptionCount(4),
        subjects=subjects,
    )

    _, matrices = score_multiple_choice(exam, AnalysisOptions())
    no_split = compute_distractors(
        exam,
        matrices.responses_upper,
        matrices.correct_mask,
        matrices.blank_mask,
        split=None,
    )
    assert len(no_split) == 1
    assert no_split[0].functioning_count == 0
    for opt in no_split[0].options:
        assert opt.upper_count == 0
        assert opt.lower_count == 0
        assert opt.is_functioning is None

    analysis = analyze_multiple_choice(exam)
    item0 = analysis.distractors[0]
    by_opt = {opt.option: opt for opt in item0.options}
    assert by_opt["B"].is_functioning is True or by_opt["C"].is_functioning is True
    assert by_opt["D"].frequency == 0
    assert by_opt["D"].is_functioning is False
    assert math.isfinite(item0.ideal_count)
