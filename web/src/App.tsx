import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import {
  analyzeExam,
  compareExamModes,
  exportExamFile,
  fetchSamples,
  fetchStartupExam,
  importExamFile,
  loadSample,
  mergeExam,
} from "./api/client";
import {
  MergeDialog,
  NewWorksheetDialog,
  type NewWorksheetParams,
  SaveWorksheetDialog,
  type WorksheetSaveFormat,
} from "./components/Dialogs";
import { PretestPosttestModal } from "./components/PretestPosttestModal";
import { ImportMapperDialog } from "./components/ImportMapperDialog";
import { JamoviRibbon, type ResultModuleToggles } from "./components/JamoviRibbon";
import { type CellCoord, JamoviSpreadsheet } from "./components/JamoviSpreadsheet";
import type { UiDisplayFlags } from "./components/OptionsDrawer";
import { ResultsCanvas } from "./components/ResultsCanvas";
import { VariableSetupDrawer } from "./components/VariableSetupDrawer";
import { useTheme } from "./hooks/useTheme";
import { useUndoRedo } from "./hooks/useUndoRedo";
import { parseLocalizedNumberList } from "./utils/clipboard";
import { saveBlobWithDialog } from "./utils/fileSave";
import type { ExportableCardSpec } from "./utils/resultExport";
import {
  addWorksheetColumn,
  addWorksheetRow,
  createBlankWorksheet,
  examPayloadToWorksheet,
  getActiveRowCount,
  removeWorksheetColumn,
  removeWorksheetRow,
  type WorksheetState,
  worksheetToExamPayload,
} from "./model/worksheet";
import type {
  AnalysisOptions,
  AnalysisResponse,
  CompatibilityDiff,
  ExamPayload,
  MergeAxis,
  SampleFileInfo,
  ScoringWeights,
} from "./types";

const DEFAULT_OPTIONS: AnalysisOptions = {
  mode: "standard_corrected",
  upper_lower_percent: 27,
  use_weighted_score: false,
  essay_difficulty_scope: null,
};

export function App() {
  const { resolvedScheme, toggleLightDark } = useTheme();
  const {
    present: worksheetState,
    canUndo,
    canRedo,
    reset: resetWorksheet,
    commit: commitWorksheet,
    undo,
    redo,
  } = useUndoRedo<WorksheetState>(createBlankWorksheet());

  const worksheet = worksheetState ?? createBlankWorksheet();

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [diff, setDiff] = useState<CompatibilityDiff | null>(null);
  const [options, setOptions] = useState<AnalysisOptions>(DEFAULT_OPTIONS);
  const [displayFlags, setDisplayFlags] = useState<UiDisplayFlags>({
    showDistractors: true,
    showInterpretation: true,
    showModeComparison: false,
    useCorrectedItemTotal: true,
  });
  const [modules, setModules] = useState<ResultModuleToggles>({
    reliability: true,
    items: true,
    distractors: true,
    charts: true,
    comparison: false,
    options: false,
  });

  const [samples, setSamples] = useState<SampleFileInfo[]>([]);
  const [activeCell, setActiveCell] = useState<CellCoord>({ row: 0, col: 0 });
  const [selectionAnchor, setSelectionAnchor] = useState<CellCoord>({ row: 0, col: 0 });
  const [varDrawerOpen, setVarDrawerOpen] = useState(false);
  const [focusQuickKeySignal, setFocusQuickKeySignal] = useState(0);
  const [allResultsSpec, setAllResultsSpec] = useState<ExportableCardSpec | null>(null);

  const [loadingMsg, setLoadingMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [mergeNotice, setMergeNotice] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("");
  const [splitPercent, setSplitPercent] = useState(50);

  const [newWsOpen, setNewWsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [saveDataOpen, setSaveDataOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [pretestPosttestOpen, setPretestPosttestOpen] = useState(false);
  const [itemIndicators, setItemIndicators] = useState<string[]>([]);

  const requestAbortRef = useRef<AbortController | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);
  const skipNextAutoAnalyze = useRef(false);

  const compiled = useMemo(() => worksheetToExamPayload(worksheet), [worksheet]);
  const activeSubjectCount = useMemo(() => getActiveRowCount(worksheet.rows), [worksheet.rows]);
  const selectedItemIndex =
    activeCell.col >= 0 && activeCell.col < worksheet.columns.length ? activeCell.col : 0;
  const selectedRowIndex =
    activeCell.row >= 0 && activeCell.row < worksheet.rows.length ? activeCell.row : 0;

  useEffect(() => {
    const controller = new AbortController();
    fetchSamples(controller.signal)
      .then(setSamples)
      .catch(() => {
        // Ignore offline/abort during startup probe.
      });
    fetchStartupExam(controller.signal)
      .then((res) => {
        if (res.has_startup && res.exam && res.analysis) {
          skipNextAutoAnalyze.current = true;
          resetWorksheet(examPayloadToWorksheet(res.exam));
          setAnalysis(res.analysis);
          setOptions(res.analysis.options);
          setDisplayFlags((prev) => ({
            ...prev,
            useCorrectedItemTotal: res.analysis!.options.mode === "standard_corrected",
          }));
        }
      })
      .catch(() => {
        // Ignore unavailable startup endpoint in pure static checks.
      });
    return () => controller.abort();
  }, [resetWorksheet]);

  const cancelActiveRequest = useCallback(() => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    setLoadingMsg(null);
  }, []);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          undo();
        }
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "z")
      ) {
        if (canRedo) {
          e.preventDefault();
          redo();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canUndo, canRedo, undo, redo]);

  useEffect(() => {
    if (!compiled.hasActiveResponses || compiled.missingKeyItemNumbers.length > 0) {
      requestAbortRef.current?.abort();
      setLoadingMsg(null);
      setAnalysis(null);
      setDiff(null);
      return;
    }
    if (skipNextAutoAnalyze.current) {
      skipNextAutoAnalyze.current = false;
      return;
    }

    const normalizedOptions: AnalysisOptions =
      compiled.exam.kind === "multiple_choice"
        ? { ...options, essay_difficulty_scope: null }
        : {
            ...options,
            use_weighted_score: false,
            essay_difficulty_scope:
              options.mode === "legacy_anates"
                ? "upper_lower_2n"
                : (options.essay_difficulty_scope ?? "all_subjects"),
          };

    const timer = window.setTimeout(() => {
      requestAbortRef.current?.abort();
      const controller = new AbortController();
      requestAbortRef.current = controller;
      setLoadingMsg("Menghitung analisis butir soal...");
      setErrorMsg(null);

      const examWithIndicators: ExamPayload =
        itemIndicators.some((s) => s.trim().length > 0)
          ? { ...compiled.exam, item_indicators: itemIndicators }
          : compiled.exam;

      const tasks: Promise<void>[] = [
        analyzeExam(examWithIndicators, normalizedOptions, controller.signal).then(setAnalysis),
      ];
      if (modules.comparison) {
        tasks.push(
          compareExamModes(
            compiled.exam,
            normalizedOptions.upper_lower_percent,
            controller.signal,
          ).then(setDiff),
        );
      } else {
        setDiff(null);
      }

      Promise.all(tasks)
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          setErrorMsg(err instanceof Error ? err.message : "Gagal menghitung analisis.");
        })
        .finally(() => {
          if (requestAbortRef.current === controller) {
            setLoadingMsg(null);
            requestAbortRef.current = null;
          }
        });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [compiled, options, modules.comparison, itemIndicators]);

  const applyLoadedExam = (
    nextExam: typeof compiled.exam,
    nextAnalysis: AnalysisResponse,
    statusText: string,
  ) => {
    skipNextAutoAnalyze.current = !modules.comparison;
    resetWorksheet(examPayloadToWorksheet(nextExam));
    setAnalysis(nextAnalysis);
    setDiff(null);
    setOptions(nextAnalysis.options);
    setDisplayFlags((prev) => ({
      ...prev,
      useCorrectedItemTotal: nextAnalysis.options.mode === "standard_corrected",
    }));
    setActiveCell({ row: 0, col: 0 });
    setSelectionAnchor({ row: 0, col: 0 });
    setErrorMsg(null);
    setMergeNotice(null);
    setLiveStatus(statusText);
  };

  const handleLoadSample = async (filename: string) => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setLoadingMsg(`Memuat arsip ${filename}...`);
    setErrorMsg(null);
    try {
      const res = await loadSample(filename, controller.signal);
      applyLoadedExam(
        res.exam,
        res.analysis,
        `Arsip ${filename} dimuat (${res.analysis.subject_count} peserta).`,
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setErrorMsg(err instanceof Error ? err.message : `Gagal memuat ${filename}.`);
    } finally {
      if (requestAbortRef.current === controller) {
        setLoadingMsg(null);
        requestAbortRef.current = null;
      }
    }
  };

  const handleDirectAnaImport = async (file: File) => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setLoadingMsg(`Mengimpor ${file.name}...`);
    try {
      const res = await importExamFile(file, "auto", null, controller.signal);
      applyLoadedExam(res.exam, res.analysis, `Berkas ${file.name} berhasil diimpor.`);
    } finally {
      if (requestAbortRef.current === controller) {
        setLoadingMsg(null);
        requestAbortRef.current = null;
      }
    }
  };

  const handleMerge = async (params: {
    axis: MergeAxis;
    requireMatchingKey: boolean;
    file?: File;
    sampleFilename?: string;
  }) => {
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    setLoadingMsg("Menggabungkan berkas ujian...");
    try {
      const res = await mergeExam({
        exam: compiled.exam,
        options,
        axis: params.axis,
        requireMatchingKey: params.requireMatchingKey,
        file: params.file,
        sampleFilename: params.sampleFilename,
        signal: controller.signal,
      });
      skipNextAutoAnalyze.current = !modules.comparison;
      commitWorksheet(() => examPayloadToWorksheet(res.exam));
      setAnalysis(res.analysis);
      setActiveCell({ row: 0, col: 0 });
      setSelectionAnchor({ row: 0, col: 0 });
      setErrorMsg(null);
      const warnCount = res.merge_summary.warnings.length;
      const summaryText =
        res.merge_summary.axis === "subjects"
          ? `Berhasil menggabungkan +${res.merge_summary.added_subjects} peserta (total N=${res.analysis.subject_count}).`
          : `Berhasil menggabungkan +${res.merge_summary.added_items} butir soal (total M=${res.analysis.item_count}).`;
      const notice =
        warnCount > 0
          ? `${summaryText} Catatan: ${res.merge_summary.warnings.map((w) => w.message).join("; ")}`
          : summaryText;
      setMergeNotice(notice);
      setLiveStatus(notice);
    } finally {
      if (requestAbortRef.current === controller) {
        setLoadingMsg(null);
        requestAbortRef.current = null;
      }
    }
  };

  const handleSaveWorksheet = async (format: WorksheetSaveFormat) => {
    const { blob, filename } = await exportExamFile(compiled.exam, options, format);
    const res = await saveBlobWithDialog(blob, filename);
    if (res.cancelled) {
      setLiveStatus("Penyimpanan lembar kerja dibatalkan.");
      return;
    }
    setLiveStatus(
      res.path
        ? `Data lembar kerja disimpan ke ${res.path}.`
        : `Data lembar kerja ${filename} disimpan.`,
    );
  };

  const handleCreateNewWorksheet = (params: NewWorksheetParams) => {
    let nextWs: WorksheetState;
    if (params.kind === "multiple_choice") {
      nextWs = createBlankWorksheet(params.subjectCount, params.itemCount, {
        mode: "multiple_choice",
        optionCount: params.optionCount,
        quickKeys: params.quickKeys,
      });
    } else {
      const parsed = parseLocalizedNumberList(params.essayIdeal);
      const tokens = parsed.valid ? parsed.values.filter((n) => n > 0) : [];

      nextWs = createBlankWorksheet(params.subjectCount, params.itemCount, {
        mode: "essay",
        defaultReference: tokens.length === 1 ? String(tokens[0]) : "",
      });

      if (tokens.length > 1) {
        nextWs = {
          ...nextWs,
          columns: nextWs.columns.map((c, idx) => ({
            ...c,
            referenceValue: tokens[idx] !== undefined ? String(tokens[idx]) : "",
          })),
        };
      }
    }

    resetWorksheet(nextWs);
    setAnalysis(null);
    setDiff(null);
    setOptions(DEFAULT_OPTIONS);
    setActiveCell({ row: 0, col: -1 });
    setSelectionAnchor({ row: 0, col: -1 });
    setVarDrawerOpen(false);
    setErrorMsg(null);
    setMergeNotice(null);
    setLiveStatus(
      `Lembar kerja ${params.kind === "multiple_choice" ? "Pilihan Ganda" : "Uraian"} (${params.subjectCount} peserta, ${params.itemCount} butir) disiapkan.`,
    );
  };

  const handleOpenQuickKeySetup = () => {
    setVarDrawerOpen(true);
    setFocusQuickKeySignal((n) => n + 1);
  };

  const handleChangeWeights = (weights: ScoringWeights) => {
    commitWorksheet((curr) => ({ ...curr, weights }));
  };

  const handleToggleModule = (key: keyof ResultModuleToggles) => {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSplitterPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const container = gridContainerRef.current;
    if (!container) return;
    const onMove = (ev: globalThis.PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPercent(Math.max(28, Math.min(72, pct)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleSplitterKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSplitPercent((p) => Math.max(28, p - 3));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSplitPercent((p) => Math.min(72, p + 3));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSplitPercent(50);
    }
  };

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Lewati ke konten utama
      </a>

      <JamoviRibbon
        sourcePath={worksheet.sourcePath}
        activeSubjectCount={activeSubjectCount}
        totalRowsCount={worksheet.rows.length}
        itemCount={worksheet.columns.length}
        missingKeyCount={compiled.missingKeyItemNumbers.length}
        summaryKind={compiled.summaryKind}
        allResultsSpec={allResultsSpec}
        canUndo={canUndo}
        canRedo={canRedo}
        canDeleteRow={worksheet.rows.length > 1}
        canDeleteCol={worksheet.columns.length > 1}
        selectedRowLabel={`Hapus Baris #${selectedRowIndex + 1}`}
        selectedColLabel={`Hapus Butir #${worksheet.columns[selectedItemIndex]?.itemNumber ?? selectedItemIndex + 1}`}
        varDrawerOpen={varDrawerOpen}
        modules={modules}
        resolvedScheme={resolvedScheme}
        onNewWorksheet={() => setNewWsOpen(true)}
        onOpenImport={() => setImportOpen(true)}
        onOpenSaveData={() => setSaveDataOpen(true)}
        onToggleTheme={toggleLightDark}
        onUndo={undo}
        onRedo={redo}
        onAddRow={() => commitWorksheet(addWorksheetRow)}
        onAddCol={() => commitWorksheet(addWorksheetColumn)}
        onDeleteRow={() => {
          commitWorksheet((curr) => removeWorksheetRow(curr, selectedRowIndex));
          setActiveCell((prev) => ({
            ...prev,
            row: Math.max(0, Math.min(prev.row, worksheet.rows.length - 2)),
          }));
        }}
        onDeleteCol={() => {
          commitWorksheet((curr) => removeWorksheetColumn(curr, selectedItemIndex));
          setActiveCell((prev) => ({
            ...prev,
            col: Math.max(0, Math.min(prev.col, worksheet.columns.length - 2)),
          }));
        }}
        onOpenMerge={() => setMergeOpen(true)}
        onOpenPretestPosttest={() => setPretestPosttestOpen(true)}
        onToggleVarDrawer={() => setVarDrawerOpen((prev) => !prev)}
        onToggleModule={handleToggleModule}
        onStatusMessage={setLiveStatus}
      />

      {loadingMsg && (
        <div className="status-banner loading no-print" role="status">
          <span>{loadingMsg}</span>
          <button type="button" className="btn btn-compact" onClick={cancelActiveRequest}>
            Batal
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="status-banner error no-print" role="alert">
          <span>{errorMsg}</span>
          <button type="button" className="btn btn-compact" onClick={() => setErrorMsg(null)}>
            Tutup
          </button>
        </div>
      )}

      {mergeNotice && (
        <div className="status-banner loading no-print" role="status">
          <span>{mergeNotice}</span>
          <button type="button" className="btn btn-compact" onClick={() => setMergeNotice(null)}>
            Tutup
          </button>
        </div>
      )}

      <p role="status" className="sr-only">
        {liveStatus}
      </p>

      <main id="main-content" tabIndex={-1} className="main-content">
        <div
          ref={gridContainerRef}
          className="workspace-grid"
          style={{ "--split-left": `${splitPercent}%` } as CSSProperties}
        >
          <section className="pane-left no-print" aria-label="Panel spreadsheet data dan kunci soal">
            <VariableSetupDrawer
              open={varDrawerOpen}
              worksheet={worksheet}
              colIndex={selectedItemIndex}
              effectiveKinds={compiled.effectiveKinds}
              missingKeyItemNumbers={compiled.missingKeyItemNumbers}
              itemIndicators={itemIndicators}
              focusQuickKeySignal={focusQuickKeySignal}
              onSelectColumn={(colIdx) => {
                setActiveCell({ row: -1, col: colIdx });
                setSelectionAnchor({ row: -1, col: colIdx });
              }}
              onUpdateWorksheet={commitWorksheet}
              onSaveIndicators={(next) => {
                setItemIndicators(next);
                setMergeNotice("Pemetaan indikator butir berhasil diperbarui.");
              }}
              onStatusMessage={setLiveStatus}
              onClose={() => setVarDrawerOpen(false)}
            />

            <JamoviSpreadsheet
              worksheet={worksheet}
              hasActiveResponses={compiled.hasActiveResponses}
              effectiveKinds={compiled.effectiveKinds}
              activeCell={activeCell}
              selectionAnchor={selectionAnchor}
              onSelectRange={(anchor, focus) => {
                setSelectionAnchor(anchor);
                setActiveCell(focus);
              }}
              onOpenVariableDrawer={(colIdx) => {
                setActiveCell({ row: -1, col: colIdx });
                setSelectionAnchor({ row: -1, col: colIdx });
                setVarDrawerOpen(true);
              }}
              onAddColumn={() => commitWorksheet(addWorksheetColumn)}
              onUpdateWorksheet={commitWorksheet}
              onStatusMessage={setLiveStatus}
            />
          </section>

          <button
            type="button"
            className="pane-splitter no-print"
            role="separator"
            aria-orientation="vertical"
            aria-label="Ubah lebar panel data dan hasil analisis"
            aria-valuemin={28}
            aria-valuemax={72}
            aria-valuenow={Math.round(splitPercent)}
            onPointerDown={handleSplitterPointerDown}
            onKeyDown={handleSplitterKeyDown}
          />

          <section className="pane-right" aria-label="Panel dokumen hasil analisis">
            <ResultsCanvas
              worksheet={worksheet}
              exam={compiled.exam}
              hasActiveResponses={compiled.hasActiveResponses}
              missingKeyItemNumbers={compiled.missingKeyItemNumbers}
              summaryKind={compiled.summaryKind}
              effectiveKinds={compiled.effectiveKinds}
              analysis={analysis}
              diff={diff}
              options={options}
              displayFlags={displayFlags}
              modules={modules}
              samples={samples}
              selectedItemIndex={selectedItemIndex}
              onSelectItem={(idx) => {
                setActiveCell((prev) => ({ ...prev, col: idx }));
                setSelectionAnchor((prev) => ({ ...prev, col: idx }));
              }}
              onLoadSample={(name) => void handleLoadSample(name)}
              onOpenImport={() => setImportOpen(true)}
              onOpenNewWorksheet={() => setNewWsOpen(true)}
              onOpenQuickKeySetup={handleOpenQuickKeySetup}
              onAllResultsSpecChange={setAllResultsSpec}
              onChangeOptions={setOptions}
              onChangeWeights={handleChangeWeights}
              onChangeFlags={setDisplayFlags}
              onCloseOptions={() => handleToggleModule("options")}
              onStatusMessage={setLiveStatus}
            />
          </section>
        </div>
      </main>

      <NewWorksheetDialog
        open={newWsOpen}
        onClose={() => setNewWsOpen(false)}
        onCreate={handleCreateNewWorksheet}
      />

      <ImportMapperDialog
        open={importOpen}
        hasActiveResponses={compiled.hasActiveResponses}
        samples={samples}
        onClose={() => setImportOpen(false)}
        onDirectAnaImport={handleDirectAnaImport}
        onLoadSample={(name) => void handleLoadSample(name)}
        onMappedLoaded={(res) => {
          if (res.exam.has_missing_keys) {
            skipNextAutoAnalyze.current = false;
            resetWorksheet(examPayloadToWorksheet(res.exam));
            setAnalysis(null);
            setDiff(null);
            setActiveCell({ row: -1, col: 0 });
            setSelectionAnchor({ row: -1, col: 0 });
            setVarDrawerOpen(true);
            setFocusQuickKeySignal((n) => n + 1);
            setErrorMsg(null);
            setMergeNotice(null);
            setLiveStatus(
              `Berkas ${res.metadata.filename} dimuat. Lengkapi kunci jawaban atau skor ideal untuk mulai menghitung.`,
            );
            return;
          }
          applyLoadedExam(
            res.exam,
            res.analysis,
            `Berkas ${res.metadata.filename} berhasil diimpor.`,
          );
        }}
      />

      <SaveWorksheetDialog
        open={saveDataOpen}
        isMixedWorksheet={compiled.summaryKind === "mixed"}
        onClose={() => setSaveDataOpen(false)}
        onSaveWorksheet={handleSaveWorksheet}
      />

      <MergeDialog
        open={mergeOpen}
        samples={samples}
        onClose={() => setMergeOpen(false)}
        onMerge={handleMerge}
      />

      <PretestPosttestModal
        open={pretestPosttestOpen}
        activeExam={compiled.exam}
        options={options}
        samples={samples}
        onClose={() => setPretestPosttestOpen(false)}
        onStatusMessage={setMergeNotice}
      />
    </div>
  );
}
