import type {
  EssaySubject,
  ExamPayload,
  MergeAxis,
  MergeSummary,
  MultipleChoiceSubject,
  ValidationIssue,
} from "../../types";

export class StandaloneDomainError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 422, code = "validation_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function mergedSourcePath(primary: ExamPayload): string | null {
  if (!primary.source_path) return null;
  const stem = primary.source_path.replace(/\.[^/.]+$/, "");
  return `${stem}_merged.ana`;
}

function checkDuplicateNames(
  primaryNames: string[],
  secondaryNames: string[],
  offset: number,
  warnings: ValidationIssue[],
): void {
  const seen = new Set(
    primaryNames.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  secondaryNames.forEach((rawName, idx) => {
    const cleaned = rawName.trim().toLowerCase();
    if (cleaned && seen.has(cleaned)) {
      warnings.push({
        code: "merge_duplicate_subject_name",
        message: `Secondary subject '${rawName}' at row ${offset + idx + 1} duplicates a name in the primary file.`,
        subject_index: offset + idx,
        item_index: null,
      });
    }
  });
}

export function mergeExams(
  primary: ExamPayload,
  secondary: ExamPayload,
  axis: MergeAxis = "subjects",
  requireMatchingKey = true,
): { exam: ExamPayload; merge_summary: MergeSummary } {
  if (primary.kind !== secondary.kind) {
    throw new StandaloneDomainError(
      `Cannot merge different exam kinds (${primary.kind} vs ${secondary.kind}).`,
    );
  }
  const resolvedSource = mergedSourcePath(primary);
  const warnings: ValidationIssue[] = [];

  if (primary.kind === "multiple_choice") {
    const pKey = primary.answer_key ?? "";
    const sKey = secondary.answer_key ?? "";
    const pSubjs = primary.mc_subjects ?? [];
    const sSubjs = secondary.mc_subjects ?? [];
    const pOpts = primary.option_count ?? 4;
    const sOpts = secondary.option_count ?? 4;

    if (axis === "subjects") {
      if (pKey.length !== sKey.length) {
        throw new StandaloneDomainError(
          `Cannot merge MC subjects with different item counts (${pKey.length} vs ${sKey.length}).`,
        );
      }
      if (pKey.toUpperCase() !== sKey.toUpperCase()) {
        const msg = `Secondary exam answer_key differs from primary exam ('${pKey}' vs '${sKey}').`;
        if (requireMatchingKey) throw new StandaloneDomainError(msg);
        warnings.push({ code: "merge_key_mismatch", message: msg, subject_index: null, item_index: null });
      }
      if (pOpts !== sOpts) {
        const msg = `Secondary exam option_count (${sOpts}) differs from primary (${pOpts}).`;
        if (requireMatchingKey) throw new StandaloneDomainError(msg);
        warnings.push({ code: "merge_option_count_mismatch", message: msg, subject_index: null, item_index: null });
      }
      const combined: MultipleChoiceSubject[] = [...pSubjs, ...sSubjs].map((s, idx) => ({
        name: s.name,
        responses: s.responses,
        original_index: idx,
      }));
      checkDuplicateNames(
        pSubjs.map((s) => s.name),
        sSubjs.map((s) => s.name),
        pSubjs.length,
        warnings,
      );
      return {
        exam: {
          kind: "multiple_choice",
          source_path: resolvedSource,
          is_sorted_by_score: false,
          is_need_recalc: true,
          answer_key: pKey,
          option_count: Math.max(pOpts, sOpts),
          weights: primary.weights ?? { correct: 1.0, wrong: 0.0 },
          mc_subjects: combined,
        },
        merge_summary: {
          axis,
          added_subjects: sSubjs.length,
          added_items: 0,
          warnings,
        },
      };
    }

    if (pSubjs.length !== sSubjs.length) {
      throw new StandaloneDomainError(
        `Cannot append items with mismatched subject counts (${pSubjs.length} vs ${sSubjs.length}).`,
      );
    }
    if (pOpts !== sOpts) {
      warnings.push({
        code: "merge_option_count_mismatch",
        message: `Option counts differ (${pOpts} vs ${sOpts}); using maximum.`,
        subject_index: null,
        item_index: null,
      });
    }
    const combined = pSubjs.map((pSubj, idx) => {
      const sSubj = sSubjs[idx]!;
      if (pSubj.name.trim().toLowerCase() !== sSubj.name.trim().toLowerCase()) {
        warnings.push({
          code: "merge_subject_name_mismatch",
          message: `Row ${idx + 1} name '${pSubj.name}' differs from secondary '${sSubj.name}'; kept primary name.`,
          subject_index: idx,
          item_index: null,
        });
      }
      return {
        name: pSubj.name,
        responses: pSubj.responses + sSubj.responses,
        original_index: idx,
      };
    });
    return {
      exam: {
        kind: "multiple_choice",
        source_path: resolvedSource,
        is_sorted_by_score: false,
        is_need_recalc: true,
        answer_key: pKey + sKey,
        option_count: Math.max(pOpts, sOpts),
        weights: primary.weights ?? { correct: 1.0, wrong: 0.0 },
        mc_subjects: combined,
      },
      merge_summary: {
        axis,
        added_subjects: 0,
        added_items: sKey.length,
        warnings,
      },
    };
  }

  const pIdeal = primary.ideal_scores ?? [];
  const sIdeal = secondary.ideal_scores ?? [];
  const pNums =
    primary.item_numbers && primary.item_numbers.length === pIdeal.length
      ? primary.item_numbers
      : Array.from({ length: pIdeal.length }, (_, i) => i + 1);
  const sNums =
    secondary.item_numbers && secondary.item_numbers.length === sIdeal.length
      ? secondary.item_numbers
      : Array.from({ length: sIdeal.length }, (_, i) => i + 1);
  const pSubjs = primary.essay_subjects ?? [];
  const sSubjs = secondary.essay_subjects ?? [];

  if (axis === "subjects") {
    if (pIdeal.length !== sIdeal.length) {
      throw new StandaloneDomainError(
        `Cannot merge essay subjects with different item counts (${pIdeal.length} vs ${sIdeal.length}).`,
      );
    }
    const idealDiff = pIdeal.some((v, i) => v !== sIdeal[i]);
    if (idealDiff) {
      const msg = `Secondary exam ideal_scores differ from primary exam (${JSON.stringify(pIdeal)} vs ${JSON.stringify(sIdeal)}).`;
      if (requireMatchingKey) throw new StandaloneDomainError(msg);
      warnings.push({ code: "merge_ideal_scores_mismatch", message: msg, subject_index: null, item_index: null });
    }
    if (pNums.some((v, i) => v !== sNums[i])) {
      warnings.push({
        code: "merge_item_numbers_mismatch",
        message: "Secondary essay item_numbers differ from primary; retained primary numbering.",
        subject_index: null,
        item_index: null,
      });
    }
    const combined: EssaySubject[] = [...pSubjs, ...sSubjs].map((s, idx) => ({
      name: s.name,
      scores: s.scores,
      original_index: idx,
    }));
    checkDuplicateNames(
      pSubjs.map((s) => s.name),
      sSubjs.map((s) => s.name),
      pSubjs.length,
      warnings,
    );
    return {
      exam: {
        kind: "essay",
        source_path: resolvedSource,
        is_sorted_by_score: false,
        is_need_recalc: true,
        ideal_scores: pIdeal,
        item_numbers: pNums,
        essay_subjects: combined,
      },
      merge_summary: {
        axis,
        added_subjects: sSubjs.length,
        added_items: 0,
        warnings,
      },
    };
  }

  if (pSubjs.length !== sSubjs.length) {
    throw new StandaloneDomainError(
      `Cannot append items with mismatched subject counts (${pSubjs.length} vs ${sSubjs.length}).`,
    );
  }
  const combined = pSubjs.map((pSubj, idx) => {
    const sSubj = sSubjs[idx]!;
    if (pSubj.name.trim().toLowerCase() !== sSubj.name.trim().toLowerCase()) {
      warnings.push({
        code: "merge_subject_name_mismatch",
        message: `Row ${idx + 1} name '${pSubj.name}' differs from secondary '${sSubj.name}'; kept primary name.`,
        subject_index: idx,
        item_index: null,
      });
    }
    return {
      name: pSubj.name,
      scores: [...pSubj.scores, ...sSubj.scores],
      original_index: idx,
    };
  });

  const pSet = new Set(pNums);
  const overlaps = sNums.some((n) => pSet.has(n));
  let secNums = sNums;
  if (overlaps) {
    const startNum = Math.max(...pNums) + 1;
    secNums = Array.from({ length: sIdeal.length }, (_, i) => startNum + i);
    warnings.push({
      code: "merge_item_numbers_renumbered",
      message: `Overlapping essay item numbers; renumbered appended items starting at #${startNum}.`,
      subject_index: null,
      item_index: null,
    });
  }

  return {
    exam: {
      kind: "essay",
      source_path: resolvedSource,
      is_sorted_by_score: false,
      is_need_recalc: true,
      ideal_scores: [...pIdeal, ...sIdeal],
      item_numbers: [...pNums, ...secNums],
      essay_subjects: combined,
    },
    merge_summary: {
      axis,
      added_subjects: 0,
      added_items: sIdeal.length,
      warnings,
    },
  };
}
