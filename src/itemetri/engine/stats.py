import math

import numpy as np
from numpy.typing import NDArray

from anates.domain.types import SubjectCount


def mean_and_std_dev(values: NDArray[np.float64]) -> tuple[float, float]:
    """Compute sample mean and SD, matching Delphi Math_MeanAndStdDev (N=1 -> SD=x_1)."""
    n = values.shape[0]
    if n == 0:
        return (math.nan, math.nan)
    if n == 1:
        x1 = float(values[0])
        return (x1, x1)
    return (float(np.mean(values)), float(np.std(values, ddof=1)))


def pearson_1d(x: NDArray[np.float64], y: NDArray[np.float64]) -> float:
    """Compute Pearson correlation between two 1D vectors, returning NaN when degenerate."""
    if x.shape[0] <= 1 or float(np.ptp(x)) == 0.0 or float(np.ptp(y)) == 0.0:
        return math.nan
    xc = x - float(np.mean(x))
    yc = y - float(np.mean(y))
    denom = float(np.dot(xc, xc)) * float(np.dot(yc, yc))
    if denom <= 0.0:
        return math.nan
    return float(np.clip(float(np.dot(xc, yc)) / math.sqrt(denom), -1.0, 1.0))


def pearson_matrix_vector(
    x: NDArray[np.float64],
    y: NDArray[np.float64],
) -> NDArray[np.float64]:
    """Compute Pearson correlations for each column of x (N, M) against vector y (N,)."""
    n, m = x.shape
    result = np.full(m, np.nan, dtype=np.float64)
    if n <= 1 or float(np.ptp(y)) == 0.0:
        return result

    xc = x - x.mean(axis=0)
    yc = y - float(y.mean())
    # Guard constant columns explicitly so float centering dust never produces spurious r.
    const_x = np.ptp(x, axis=0) == 0.0
    denom = np.sum(xc * xc, axis=0) * float(np.dot(yc, yc))
    valid = (~const_x) & (denom > 0.0)
    if not np.any(valid):
        return result

    num = xc.T @ yc
    result[valid] = np.clip(num[valid] / np.sqrt(denom[valid]), -1.0, 1.0)
    return result


def banker_round_group_size(subject_count: SubjectCount, percent: float) -> int:
    """Compute upper/lower group size using round-to-nearest-even (matching Delphi _ROUND)."""
    return round((percent * int(subject_count)) / 100.0)
