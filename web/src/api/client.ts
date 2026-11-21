import type {
  AnalysisOptions,
  AnalysisResponse,
  CompatibilityDiff,
  ExamPayload,
  ExportFormat,
  ImportMetadata,
  MergeAxis,
  MergeSummary,
  SampleFileInfo,
  StartupResponse,
  TabularMappingParams,
  TabularPreviewResponse,
} from "../types";

export class ApiError extends Error {
  status: number;
  code: string;
  line: number | null;
  tag: string | null;

  constructor(
    message: string,
    status: number,
    code = "api_error",
    line: number | null = null,
    tag: string | null = null,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.line = line;
    this.tag = tag;
  }
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as {
      detail?: unknown;
      code?: string;
      line?: number | null;
      tag?: string | null;
    };
    const msg =
      typeof body.detail === "string"
        ? body.detail
        : `Permintaan gagal (HTTP ${res.status}).`;
    return new ApiError(msg, res.status, body.code ?? "api_error", body.line ?? null, body.tag ?? null);
  } catch {
    return new ApiError(`Permintaan gagal (HTTP ${res.status}).`, res.status);
  }
}

export async function fetchSamples(signal?: AbortSignal): Promise<SampleFileInfo[]> {
  const res = await fetch("/api/samples", { signal });
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as SampleFileInfo[];
}

export async function fetchStartupExam(signal?: AbortSignal): Promise<StartupResponse> {
  const res = await fetch("/api/startup", { signal });
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as StartupResponse;
}

export async function previewTabularImport(
  file: File,
  signal?: AbortSignal,
): Promise<TabularPreviewResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/import/preview", {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as TabularPreviewResponse;
}

export async function importMappedTabular(
  file: File,
  params: TabularMappingParams,
  signal?: AbortSignal,
): Promise<{ exam: ExamPayload; analysis: AnalysisResponse; metadata: ImportMetadata }> {
  const form = new FormData();
  form.append("file", file);
  form.append("has_header_row", params.hasHeaderRow ? "true" : "false");
  if (params.keyRowIndex !== null) {
    form.append("key_row_index", String(params.keyRowIndex));
  }
  if (params.nameColIndex !== null) {
    form.append("name_col_index", String(params.nameColIndex));
  } else {
    form.append("name_col_index", "null");
  }
  form.append("item_cols_json", JSON.stringify(params.itemColIndices));
  form.append("kind", params.kind);
  if (params.optionCount !== null) {
    form.append("option_count", String(params.optionCount));
  }
  form.append("default_key_or_ideal", params.defaultKeyOrIdeal);

  const res = await fetch("/api/import/mapped", {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as {
    exam: ExamPayload;
    analysis: AnalysisResponse;
    metadata: ImportMetadata;
  };
}

export async function loadSample(
  filename: string,
  signal?: AbortSignal,
): Promise<{ exam: ExamPayload; analysis: AnalysisResponse; metadata: ImportMetadata }> {
  const res = await fetch(`/api/samples/${encodeURIComponent(filename)}`, {
    method: "POST",
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as {
    exam: ExamPayload;
    analysis: AnalysisResponse;
    metadata: ImportMetadata;
  };
}

export async function importExamFile(
  file: File,
  kind: "auto" | "mc" | "essay",
  optionCount: number | null,
  signal?: AbortSignal,
): Promise<{ exam: ExamPayload; analysis: AnalysisResponse; metadata: ImportMetadata }> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  if (optionCount !== null) {
    form.append("option_count", String(optionCount));
  }
  const res = await fetch("/api/import", {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as {
    exam: ExamPayload;
    analysis: AnalysisResponse;
    metadata: ImportMetadata;
  };
}

export async function analyzeExam(
  exam: ExamPayload,
  options: AnalysisOptions,
  signal?: AbortSignal,
): Promise<AnalysisResponse> {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exam, options }),
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const data = (await res.json()) as { analysis: AnalysisResponse };
  return data.analysis;
}

export async function compareExamModes(
  exam: ExamPayload,
  upperLowerPercent: number,
  signal?: AbortSignal,
): Promise<CompatibilityDiff> {
  const res = await fetch("/api/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exam, upper_lower_percent: upperLowerPercent }),
    signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const data = (await res.json()) as { diff: CompatibilityDiff };
  return data.diff;
}

export async function exportExamFile(
  exam: ExamPayload,
  options: AnalysisOptions,
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exam, options, format }),
  });
  if (!res.ok) throw await parseErrorResponse(res);
  const disp = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="([^"]+)"/.exec(disp);
  const filename = match?.[1] ?? `anates_export.${format}`;
  const blob = await res.blob();
  return { blob, filename };
}

export async function mergeExam(params: {
  exam: ExamPayload;
  options: AnalysisOptions;
  axis: MergeAxis;
  requireMatchingKey: boolean;
  file?: File;
  sampleFilename?: string;
  kind?: "auto" | "mc" | "essay";
  optionCount?: number | null;
  signal?: AbortSignal;
}): Promise<{ exam: ExamPayload; analysis: AnalysisResponse; merge_summary: MergeSummary }> {
  const form = new FormData();
  form.append("exam_json", JSON.stringify(params.exam));
  form.append("options_json", JSON.stringify(params.options));
  form.append("axis", params.axis);
  form.append("require_matching_key", params.requireMatchingKey ? "true" : "false");
  form.append("kind", params.kind ?? "auto");
  if (params.optionCount !== undefined && params.optionCount !== null) {
    form.append("option_count", String(params.optionCount));
  }
  if (params.file) {
    form.append("file", params.file);
  } else if (params.sampleFilename) {
    form.append("sample_filename", params.sampleFilename);
  }
  const res = await fetch("/api/merge", {
    method: "POST",
    body: form,
    signal: params.signal,
  });
  if (!res.ok) throw await parseErrorResponse(res);
  return (await res.json()) as {
    exam: ExamPayload;
    analysis: AnalysisResponse;
    merge_summary: MergeSummary;
  };
}
