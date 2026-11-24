import type {
  AnalysisOptions,
  AnalysisResponse,
  CompatibilityDiff,
  ExamKind,
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
import { compareModes } from "./engine/comparison";
import { mergeExams, StandaloneDomainError } from "./engine/merge";
import { analyzeExam } from "./engine/pipeline";
import { BUILTIN_SAMPLE_LIST, getBuiltinSample } from "./engine/samples";
import { StandaloneParseError } from "./io/encoding";
import {
  exportCsvExamBytes,
  exportTemplateXlsxBytes,
  exportXlsxExamBytes,
  previewTabularBytes,
  readTabularDirectBytes,
  readTabularMappedBytes,
} from "./io/tabular";
import { parseAnaBytes, serializeAna } from "./io/xmlAna";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

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

function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof StandaloneParseError) {
    return new ApiError(err.message, err.status, err.code, err.line, err.tag);
  }
  if (err instanceof StandaloneDomainError) {
    return new ApiError(err.message, err.status, err.code);
  }
  return new ApiError(err instanceof Error ? err.message : String(err), 400);
}

function defaultOptions(): AnalysisOptions {
  return {
    mode: "standard_corrected",
    upper_lower_percent: 27.0,
    use_weighted_score: false,
    essay_difficulty_scope: null,
  };
}

function safeDownloadStem(sourcePath: string | null): string {
  if (!sourcePath) return "itemetri_hasil";
  const stem = sourcePath
    .replace(/\.[^/.]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^[._]+|[._]+$/g, "");
  return stem || "itemetri_hasil";
}

function parseKindFilter(kind: "auto" | "mc" | "essay"): ExamKind | null {
  if (kind === "mc") return "multiple_choice";
  if (kind === "essay") return "essay";
  return null;
}

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ApiError("Uploaded file exceeds the 20 MB limit.", 413);
  }
  return new Uint8Array(await file.arrayBuffer());
}

async function loadExamFromFile(
  file: File,
  kind: "auto" | "mc" | "essay",
  optionCount: number | null,
): Promise<{ exam: ExamPayload; metadata: ImportMetadata }> {
  const raw = await readFileBytes(file);
  const parsedKind = parseKindFilter(kind);
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".ana")) {
    const doc = parseAnaBytes(raw, file.name);
    if (parsedKind !== null && doc.exam.kind !== parsedKind) {
      throw new ApiError(`${file.name} is ${doc.exam.kind}, expected ${parsedKind}.`, 400);
    }
    return {
      exam: doc.exam,
      metadata: {
        filename: file.name,
        file_version: doc.file_version,
        detected_encoding: doc.detected_encoding,
      },
    };
  }

  if (lower.endsWith(".csv") || lower.endsWith(".xlsx")) {
    const exam = await readTabularDirectBytes(raw, file.name, parsedKind, optionCount);
    return {
      exam,
      metadata: {
        filename: file.name,
        file_version: null,
        detected_encoding: null,
      },
    };
  }

  throw new ApiError("Unsupported file extension; expected .ana, .csv, or .xlsx.", 400);
}

export async function fetchSamples(_signal?: AbortSignal): Promise<SampleFileInfo[]> {
  return BUILTIN_SAMPLE_LIST;
}

export async function fetchStartupExam(_signal?: AbortSignal): Promise<StartupResponse> {
  return { has_startup: false };
}

export async function previewTabularImport(
  file: File,
  _signal?: AbortSignal,
): Promise<TabularPreviewResponse> {
  try {
    const raw = await readFileBytes(file);
    return await previewTabularBytes(raw, file.name);
  } catch (err) {
    throw toApiError(err);
  }
}

export async function importMappedTabular(
  file: File,
  params: TabularMappingParams,
  _signal?: AbortSignal,
): Promise<{ exam: ExamPayload; analysis: AnalysisResponse; metadata: ImportMetadata }> {
  try {
    const raw = await readFileBytes(file);
    const exam = await readTabularMappedBytes(raw, file.name, params);
    const analysis = analyzeExam(exam, defaultOptions());
    return {
      exam,
      analysis,
      metadata: {
        filename: file.name,
        file_version: null,
        detected_encoding: null,
      },
    };
  } catch (err) {
    throw toApiError(err);
  }
}

export async function loadSample(
  filename: string,
  _signal?: AbortSignal,
): Promise<{ exam: ExamPayload; analysis: AnalysisResponse; metadata: ImportMetadata }> {
  const sample = getBuiltinSample(filename);
  if (!sample) {
    throw new ApiError(`Sample '${filename}' not found.`, 404);
  }
  const analysis = analyzeExam(sample, defaultOptions());
  return {
    exam: sample,
    analysis,
    metadata: {
      filename,
      file_version: null,
      detected_encoding: null,
    },
  };
}

export async function importExamFile(
  file: File,
  kind: "auto" | "mc" | "essay",
  optionCount: number | null,
  _signal?: AbortSignal,
): Promise<{ exam: ExamPayload; analysis: AnalysisResponse; metadata: ImportMetadata }> {
  try {
    const { exam, metadata } = await loadExamFromFile(file, kind, optionCount);
    const analysis = analyzeExam(exam, defaultOptions());
    return { exam, analysis, metadata };
  } catch (err) {
    throw toApiError(err);
  }
}

export async function analyzeExam_api(
  exam: ExamPayload,
  options: AnalysisOptions,
  _signal?: AbortSignal,
): Promise<AnalysisResponse> {
  try {
    return analyzeExam(exam, options);
  } catch (err) {
    throw toApiError(err);
  }
}

export { analyzeExam_api as analyzeExam };

export async function compareExamModes(
  exam: ExamPayload,
  upperLowerPercent: number,
  _signal?: AbortSignal,
): Promise<CompatibilityDiff> {
  try {
    return compareModes(exam, upperLowerPercent);
  } catch (err) {
    throw toApiError(err);
  }
}

export async function exportExamFile(
  exam: ExamPayload,
  options: AnalysisOptions,
  format: ExportFormat,
): Promise<{ blob: Blob; filename: string }> {
  try {
    const stem = safeDownloadStem(exam.source_path);
    if (format === "ana") {
      const analysis = analyzeExam(exam, options);
      const bytes = serializeAna(exam, analysis);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return {
        blob: new Blob([copy.buffer], { type: "application/xml" }),
        filename: `${stem}.ana`,
      };
    }
    if (format === "csv-exam") {
      const bytes = exportCsvExamBytes(exam);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return {
        blob: new Blob([copy.buffer], { type: "text/csv;charset=utf-8" }),
        filename: `${stem}_data.csv`,
      };
    }
    if (format === "xlsx-exam") {
      const bytes = await exportXlsxExamBytes(exam);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return {
        blob: new Blob([copy.buffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        filename: `${stem}_data.xlsx`,
      };
    }
    throw new ApiError(`Unsupported export format: ${format}`, 400);
  } catch (err) {
    throw toApiError(err);
  }
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
  try {
    let secondary: ExamPayload;
    if (params.sampleFilename) {
      const sample = getBuiltinSample(params.sampleFilename);
      if (!sample) {
        throw new ApiError(`Sample '${params.sampleFilename}' not found.`, 404);
      }
      secondary = sample;
    } else if (params.file) {
      const loaded = await loadExamFromFile(
        params.file,
        params.kind ?? "auto",
        params.optionCount ?? null,
      );
      secondary = loaded.exam;
    } else {
      throw new ApiError("Provide either file or sampleFilename.", 400);
    }

    const { exam, merge_summary } = mergeExams(
      params.exam,
      secondary,
      params.axis,
      params.requireMatchingKey,
    );
    const analysis = analyzeExam(exam, params.options);
    return { exam, analysis, merge_summary };
  } catch (err) {
    throw toApiError(err);
  }
}

export async function generateTemplateXlsx(
  kind: "multiple_choice" | "essay",
): Promise<{ blob: Blob; filename: string }> {
  const bytes = await exportTemplateXlsxBytes(kind);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const filename =
    kind === "multiple_choice"
      ? "template-itemetri-pilihan-ganda.xlsx"
      : "template-itemetri-uraian.xlsx";
  return { blob, filename };
}
