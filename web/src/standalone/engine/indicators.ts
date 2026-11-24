import type {
  CompatibilityMode,
  DifficultyItem,
  DiscriminationItem,
  IndicatorSummaryItem,
  ItemVerdict,
} from "../../types";
import { sanitizeNum } from "./math";

export function computeIndicatorSummary(
  itemIndicators: readonly string[] | undefined,
  difficulty: readonly DifficultyItem[],
  discrimination: readonly DiscriminationItem[],
  verdicts: readonly ItemVerdict[],
  mode: CompatibilityMode,
): IndicatorSummaryItem[] | undefined {
  if (!itemIndicators || itemIndicators.length === 0) return undefined;

  const hasAny = itemIndicators.some((s) => s.trim().length > 0);
  if (!hasAny) return undefined;

  const groups = new Map<
    string,
    {
      itemNumbers: number[];
      tks: number[];
      dps: number[];
      accept: number;
      revise: number;
      reject: number;
    }
  >();

  const useCorrected = mode === "standard_corrected";

  for (let j = 0; j < difficulty.length; j++) {
    const rawLabel = (itemIndicators[j] ?? "").trim();
    const label = rawLabel.length > 0 ? rawLabel : "(Tanpa Indikator)";
    let g = groups.get(label);
    if (!g) {
      g = { itemNumbers: [], tks: [], dps: [], accept: 0, revise: 0, reject: 0 };
      groups.set(label, g);
    }

    const tk = difficulty[j]!;
    const dp = discrimination[j];
    const v = verdicts[j];

    g.itemNumbers.push(tk.item_number);
    if (tk.index_percent !== null && Number.isFinite(tk.index_percent)) {
      g.tks.push(tk.index_percent);
    }
    if (dp && dp.index_percent !== null && Number.isFinite(dp.index_percent)) {
      g.dps.push(dp.index_percent);
    }
    if (v) {
      const st = useCorrected && v.corrected_status ? v.corrected_status : v.status;
      if (st === "Terima") g.accept++;
      else if (st === "Revisi") g.revise++;
      else g.reject++;
    }
  }

  const out: IndicatorSummaryItem[] = [];
  for (const [indicator, g] of groups.entries()) {
    const meanTk =
      g.tks.length > 0 ? sanitizeNum(g.tks.reduce((a, b) => a + b, 0) / g.tks.length) : null;
    const meanDp =
      g.dps.length > 0 ? sanitizeNum(g.dps.reduce((a, b) => a + b, 0) / g.dps.length) : null;

    let masteryLabel = "Tidak Terdefinisi";
    if (meanTk !== null) {
      if (meanTk >= 75) masteryLabel = "Tinggi (Tercapai)";
      else if (meanTk >= 50) masteryLabel = "Sedang";
      else masteryLabel = "Rendah (Perlu Penguatan)";
    }

    out.push({
      indicator,
      item_count: g.itemNumbers.length,
      item_numbers: g.itemNumbers,
      mean_tk_percent: meanTk,
      mean_dp_percent: meanDp,
      accept_count: g.accept,
      revise_count: g.revise,
      reject_count: g.reject,
      mastery_label: masteryLabel,
    });
  }

  return out;
}
