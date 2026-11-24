import type {
  DistractorItem,
  DistractorOption,
  ExamPayload,
} from "../../types";
import { sanitizeNum } from "./math";
import type { UpperLowerSplit } from "./upperLower";

export function classifyDistractorIndex(
  freq: number,
  ideal: number,
  isKey: boolean,
): [number, string] {
  if (isKey) return [Number.NaN, "**"];
  if (ideal <= 0.0) return [Number.NaN, ""];

  const ip = (freq / ideal) * 100.0;
  if (75.0 < ip && ip <= 125.0) return [ip, "++"];
  if ((50.0 < ip && ip <= 75.0) || (125.0 < ip && ip <= 150.0)) return [ip, "+"];
  if ((25.0 < ip && ip <= 50.0) || (150.0 < ip && ip <= 175.0)) return [ip, "-"];
  if ((0.0 <= ip && ip <= 25.0) || (175.0 < ip && ip <= 200.0)) return [ip, "--"];
  if (ip > 200.0) return [ip, "---"];
  return [ip, "?"];
}

export function computeDistractors(
  exam: ExamPayload,
  responsesUpper: readonly string[],
  correctMask: readonly (readonly boolean[])[],
  blankMask: readonly (readonly boolean[])[],
  split?: UpperLowerSplit,
  minChoiceProportion = 0.02,
): DistractorItem[] {
  const n = correctMask.length;
  const m = n > 0 ? correctMask[0]!.length : 0;
  const k = exam.option_count ?? 4;
  const optionLetters = Array.from({ length: k }, (_, idx) =>
    String.fromCharCode(65 + idx),
  );
  const keyUpper = (exam.answer_key ?? "").toUpperCase();
  const hasGroups = Boolean(split && split.group_size > 0);
  const upperSet = new Set(split?.upper_indices ?? []);
  const lowerSet = new Set(split?.lower_indices ?? []);

  const items: DistractorItem[] = [];
  for (let j = 0; j < m; j++) {
    let correctCount = 0;
    let blankCount = 0;
    let upperBlanks = 0;
    let lowerBlanks = 0;
    const freqMap = new Array<number>(k).fill(0);
    const upperFreqMap = new Array<number>(k).fill(0);
    const lowerFreqMap = new Array<number>(k).fill(0);

    for (let i = 0; i < n; i++) {
      if (correctMask[i]![j]) correctCount++;
      if (blankMask[i]![j]) {
        blankCount++;
        if (hasGroups) {
          if (upperSet.has(i)) upperBlanks++;
          if (lowerSet.has(i)) lowerBlanks++;
        }
      }
      const ch = responsesUpper[i]![j] ?? "*";
      const optIdx = ch.charCodeAt(0) - 65;
      if (optIdx >= 0 && optIdx < k) {
        freqMap[optIdx]!++;
        if (hasGroups) {
          if (upperSet.has(i)) upperFreqMap[optIdx]!++;
          if (lowerSet.has(i)) lowerFreqMap[optIdx]!++;
        }
      }
    }

    const optTotalFreq = freqMap.reduce((a, b) => a + b, 0);
    const otherCount = Math.max(0, n - optTotalFreq - blankCount);
    const ideal = (n - correctCount) / (k - 1);
    const keyChar = keyUpper[j]!;

    const opts: DistractorOption[] = optionLetters.map((optChar, optIdx) => {
      const isKey = optChar === keyChar;
      const freq = freqMap[optIdx]!;
      const [ip, quality] = classifyDistractorIndex(freq, ideal, isKey);
      const uCount = hasGroups ? upperFreqMap[optIdx]! : 0;
      const lCount = hasGroups ? lowerFreqMap[optIdx]! : 0;
      let isFunctioning: boolean | null;
      if (isKey || !hasGroups || n === 0) {
        isFunctioning = null;
      } else {
        isFunctioning = freq / n >= minChoiceProportion && lCount >= uCount;
      }
      return {
        option: optChar,
        frequency: freq,
        index_percent: sanitizeNum(ip),
        quality,
        upper_count: uCount,
        lower_count: lCount,
        is_functioning: isFunctioning,
      };
    });

    const functioningCount = opts.filter((o) => o.is_functioning === true).length;
    const distractorCount = optionLetters.filter((ch) => ch !== keyChar).length;
    items.push({
      item_index: j,
      item_number: j + 1,
      key: keyChar,
      correct_count: correctCount,
      blank_count: blankCount,
      other_count: otherCount,
      ideal_count: ideal,
      options: opts,
      upper_blank_count: upperBlanks,
      lower_blank_count: lowerBlanks,
      functioning_count: functioningCount,
      distractor_count: distractorCount,
    });
  }
  return items;
}
