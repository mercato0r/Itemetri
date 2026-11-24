/** Precision math, statistical distributions, and Python-compatible helpers. */

const LANCZOS_COEFFS = [
  0.9999999999998099,
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9.984369578019572e-6,
  1.5056327351493116e-7,
];

export function lnGamma(z: number): number {
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1.0 - z);
  }
  const shifted = z - 1.0;
  let acc = LANCZOS_COEFFS[0]!;
  for (let i = 1; i < LANCZOS_COEFFS.length; i++) {
    acc += LANCZOS_COEFFS[i]! / (shifted + i);
  }
  const t = shifted + 7.5;
  return 0.5 * Math.log(2.0 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(acc);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 400;
  const EPS = 3e-16;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1.0;
  const qam = a - 1.0;
  let c = 1.0;
  let d = 1.0 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1.0 / d;
  let h = d;

  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1.0 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1.0 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1.0 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1.0) <= EPS) {
      break;
    }
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0.0) return 0.0;
  if (x >= 1.0) return 1.0;
  const bt = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1.0 - x),
  );
  if (x < (a + 1.0) / (a + b + 2.0)) {
    return (bt * betacf(a, b, x)) / a;
  }
  return 1.0 - (bt * betacf(b, a, 1.0 - x)) / b;
}

/** Exact two-tailed p-value 2 * P(T_df > |t|) matching scipy.stats.t.sf. */
export function studentTTwoTailedP(absT: number, df: number): number {
  if (!Number.isFinite(absT) || !Number.isFinite(df) || df <= 0) return Number.NaN;
  if (absT === 0) return 1.0;
  const x = df / (df + absT * absT);
  return regularizedIncompleteBeta(x, 0.5 * df, 0.5);
}

/** Python-compatible round-half-to-even (banker's rounding). */
export function roundHalfToEven(value: number): number {
  if (!Number.isFinite(value)) return value;
  const floorVal = Math.floor(value);
  const diff = value - floorVal;
  if (diff < 0.5) return floorVal;
  if (diff > 0.5) return floorVal + 1;
  return floorVal % 2 === 0 ? floorVal : floorVal + 1;
}

export function bankerRoundGroupSize(subjectCount: number, percent: number): number {
  return roundHalfToEven((percent * subjectCount) / 100.0);
}

export function meanAndStdDev(values: readonly number[]): [number, number] {
  const n = values.length;
  if (n === 0) return [Number.NaN, Number.NaN];
  if (n === 1) {
    const x1 = values[0]!;
    return [x1, x1];
  }
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i]!;
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i]! - mean;
    sq += d * d;
  }
  return [mean, Math.sqrt(sq / (n - 1))];
}

export function minMaxMedian(values: readonly number[]): [number, number, number] {
  const n = values.length;
  if (n === 0) return [Number.NaN, Number.NaN, Number.NaN];
  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[n - 1]!;
  const mid = Math.floor(n / 2);
  const median = n % 2 === 1 ? sorted[mid]! : 0.5 * (sorted[mid - 1]! + sorted[mid]!);
  return [min, max, median];
}

export function ptp(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let min = values[0]!;
  let max = values[0]!;
  for (let i = 1; i < values.length; i++) {
    const v = values[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

export function variance(values: readonly number[], ddof: number): number {
  const n = values.length;
  if (n - ddof <= 0) return Number.NaN;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i]!;
  const mean = sum / n;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const d = values[i]! - mean;
    sq += d * d;
  }
  return sq / (n - ddof);
}

export function pearson1d(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  if (n <= 1 || ptp(x) === 0 || ptp(y) === 0) return Number.NaN;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i]!;
    sy += y[i]!;
  }
  const mx = sx / n;
  const my = sy / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i]! - mx;
    const dy = y[i]! - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  const denom = dx2 * dy2;
  if (denom <= 0) return Number.NaN;
  return Math.max(-1.0, Math.min(1.0, num / Math.sqrt(denom)));
}

export function pearsonMatrixVector(
  matrix: readonly (readonly number[])[],
  y: readonly number[],
): number[] {
  const n = matrix.length;
  const m = n > 0 ? matrix[0]!.length : 0;
  const result = new Array<number>(m).fill(Number.NaN);
  if (n <= 1 || ptp(y) === 0) return result;

  let sy = 0;
  for (let i = 0; i < n; i++) sy += y[i]!;
  const my = sy / n;
  let dy2 = 0;
  const yc = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const d = y[i]! - my;
    yc[i] = d;
    dy2 += d * d;
  }

  for (let j = 0; j < m; j++) {
    let min = matrix[0]![j]!;
    let max = min;
    let sx = 0;
    for (let i = 0; i < n; i++) {
      const v = matrix[i]![j]!;
      if (v < min) min = v;
      if (v > max) max = v;
      sx += v;
    }
    if (max - min === 0) continue;
    const mx = sx / n;
    let num = 0;
    let dx2 = 0;
    for (let i = 0; i < n; i++) {
      const dx = matrix[i]![j]! - mx;
      num += dx * yc[i]!;
      dx2 += dx * dx;
    }
    const denom = dx2 * dy2;
    if (denom > 0) {
      result[j] = Math.max(-1.0, Math.min(1.0, num / Math.sqrt(denom)));
    }
  }
  return result;
}

export function sanitizeNum(val: number): number | null {
  return Number.isFinite(val) ? val : null;
}
