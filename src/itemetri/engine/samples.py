import math

import numpy as np

from itemetri.domain.models import (
    EssayExam,
    EssaySubject,
    MultipleChoiceExam,
    MultipleChoiceSubject,
)
from itemetri.domain.types import OptionCount


def generate_diagnostic_mc_sample(seed: int = 20261120) -> MultipleChoiceExam:
    """Generate a deterministic 25x10 MC exam with a miskey on item 9 and ceiling on item 10."""
    rng = np.random.Generator(np.random.PCG64(seed))
    n_subjects = 25
    n_items = 10
    options = ("A", "B", "C", "D")
    true_keys = ("A", "B", "C", "D", "A", "B", "C", "D", "A", "B")
    stored_key = "ABCDABCDCB"
    difficulties = (-0.6, 0.0, 0.4, -0.3, 0.8, -0.9, 0.2, 1.1, -0.2, -3.8)

    thetas = np.linspace(1.9, -1.9, n_subjects) + rng.normal(0.0, 0.15, size=n_subjects)
    subjects: list[MultipleChoiceSubject] = []

    for i in range(n_subjects):
        theta = float(thetas[i])
        chars: list[str] = []
        for j in range(n_items):
            slope = 2.2 if j == 8 else 1.3
            p_true = 1.0 / (1.0 + math.exp(-slope * (theta - difficulties[j])))
            if rng.random() < p_true:
                chars.append(true_keys[j])
            else:
                wrong_pool = [opt for opt in options if opt != true_keys[j]]
                # Bias low-ability guesses on miskeyed item 9 toward the stored false key.
                if j == 8 and "C" in wrong_pool and rng.random() < 0.75:
                    chars.append("C")
                else:
                    chars.append(wrong_pool[int(rng.integers(0, len(wrong_pool)))])
        subjects.append(
            MultipleChoiceSubject(
                name=f"Peserta {i + 1:02d}",
                responses="".join(chars),
                original_index=i,
            )
        )

    return MultipleChoiceExam(
        answer_key=stored_key,
        option_count=OptionCount(4),
        subjects=tuple(subjects),
        source_path="simulasi-pg-diagnostik",
    )


def generate_essay_demo_sample(seed: int = 20261121) -> EssayExam:
    """Generate a deterministic 20x5 essay exam with varying ideal maximum scores."""
    rng = np.random.Generator(np.random.PCG64(seed))
    n_subjects = 20
    ideal_scores = (10.0, 10.0, 15.0, 15.0, 20.0)
    difficulty_offsets = (-0.1, 0.25, -0.2, 0.4, 0.0)
    discrimination_slopes = (0.28, 0.24, 0.30, 0.22, 0.26)

    thetas = np.linspace(2.0, -2.0, n_subjects)
    subjects: list[EssaySubject] = []

    for i in range(n_subjects):
        theta = float(thetas[i])
        item_scores: list[float | None] = []
        for j, ideal in enumerate(ideal_scores):
            raw_prop = 0.58 + discrimination_slopes[j] * (theta - difficulty_offsets[j]) / 2.0
            noisy_prop = raw_prop + float(rng.normal(0.0, 0.09))
            clamped = max(0.05, min(1.0, noisy_prop))
            rounded = round(clamped * ideal * 2.0) / 2.0
            item_scores.append(float(min(ideal, max(0.0, rounded))))
        subjects.append(
            EssaySubject(
                name=f"Peserta {i + 1:02d}",
                scores=tuple(item_scores),
                original_index=i,
            )
        )

    return EssayExam(
        ideal_scores=ideal_scores,
        item_numbers=(1, 2, 3, 4, 5),
        subjects=tuple(subjects),
        source_path="simulasi-uraian",
    )
