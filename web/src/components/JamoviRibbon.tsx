import { useEffect, useRef } from "react";
import type { WorksheetSummaryKind } from "../model/worksheet";
import {
  BrandMarkIcon,
  DownloadIcon,
  FilePlusIcon,
  MoonIcon,
  PlusIcon,
  RedoIcon,
  SunIcon,
  TrashIcon,
  UndoIcon,
  UploadIcon,
} from "./Icons";

export interface ResultModuleToggles {
  reliability: boolean;
  items: boolean;
  distractors: boolean;
  charts: boolean;
  comparison: boolean;
  options: boolean;
}

interface JamoviRibbonProps {
  sourcePath: string | null;
  activeSubjectCount: number;
  totalRowsCount: number;
  itemCount: number;
  summaryKind: WorksheetSummaryKind;
  canUndo: boolean;
  canRedo: boolean;
  canDeleteRow: boolean;
  canDeleteCol: boolean;
  selectedRowLabel: string;
  selectedColLabel: string;
  varDrawerOpen: boolean;
  modules: ResultModuleToggles;
  resolvedScheme: "light" | "dark";
  onNewWorksheet: () => void;
  onOpenImport: () => void;
  onOpenSaveData: () => void;
  onToggleTheme: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddRow: () => void;
  onAddCol: () => void;
  onDeleteRow: () => void;
  onDeleteCol: () => void;
  onOpenMerge: () => void;
  onToggleVarDrawer: () => void;
  onToggleModule: (key: keyof ResultModuleToggles) => void;
}

export function JamoviRibbon({
  sourcePath,
  activeSubjectCount,
  totalRowsCount,
  itemCount,
  summaryKind,
  canUndo,
  canRedo,
  canDeleteRow,
  canDeleteCol,
  selectedRowLabel,
  selectedColLabel,
  varDrawerOpen,
  modules,
  resolvedScheme,
  onNewWorksheet,
  onOpenImport,
  onOpenSaveData,
  onToggleTheme,
  onUndo,
  onRedo,
  onAddRow,
  onAddCol,
  onDeleteRow,
  onDeleteCol,
  onOpenMerge,
  onToggleVarDrawer,
  onToggleModule,
}: JamoviRibbonProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const bar = toolbarRef.current;
    if (!bar || "focusGroup" in HTMLElement.prototype) return;

    const getItems = () =>
      Array.from(bar.querySelectorAll<HTMLButtonElement>("button"));

    const syncTabIndices = (active?: HTMLButtonElement) => {
      const items = getItems();
      items.forEach((btn, idx) => {
        btn.tabIndex = active ? (btn === active ? 0 : -1) : idx === 0 ? 0 : -1;
      });
    };
    syncTabIndices();

    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof HTMLButtonElement && bar.contains(e.target)) {
        syncTabIndices(e.target);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const items = getItems();
      const idx =
        document.activeElement instanceof HTMLButtonElement
          ? items.indexOf(document.activeElement)
          : -1;
      if (idx === -1) return;

      const rtl = getComputedStyle(bar).direction === "rtl";
      const step =
        e.key === "ArrowRight" ? (rtl ? -1 : 1) : e.key === "ArrowLeft" ? (rtl ? 1 : -1) : 0;

      if (step !== 0) {
        e.preventDefault();
        const next = items[(idx + step + items.length) % items.length];
        next?.focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        items[0]?.focus();
      } else if (e.key === "End") {
        e.preventDefault();
        items[items.length - 1]?.focus();
      }
    };

    bar.addEventListener("focusin", onFocusIn);
    bar.addEventListener("keydown", onKeyDown);
    return () => {
      bar.removeEventListener("focusin", onFocusIn);
      bar.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const kindLabel =
    summaryKind === "mixed"
      ? "Campuran (PG+Uraian)"
      : summaryKind === "essay"
        ? "Uraian"
        : "Pilihan Ganda";
  const summaryText = `${sourcePath ?? "Lembar Kerja Bebas"} (${activeSubjectCount}/${totalRowsCount} baris, ${itemCount} butir, ${kindLabel})`;

  return (
    <header className="no-print">
      <div className="ribbon">
        <div className="ribbon-left">
          <BrandMarkIcon size={22} />
          <div className="ribbon-title-wrap">
            <h1 className="ribbon-title">Itemetri</h1>
            <span className="ribbon-meta" title={summaryText}>
              {summaryText}
            </span>
          </div>
        </div>

        <div className="ribbon-actions">
          <button type="button" className="btn btn-compact" onClick={onNewWorksheet}>
            <FilePlusIcon />
            <span>Lembar Baru</span>
          </button>
          <button type="button" className="btn btn-compact" onClick={onOpenImport}>
            <UploadIcon />
            <span>Impor</span>
          </button>
          <button
            type="button"
            className="btn btn-compact"
            aria-disabled={activeSubjectCount === 0 ? "true" : undefined}
            onClick={() => {
              if (activeSubjectCount > 0) onOpenSaveData();
            }}
          >
            <DownloadIcon />
            <span>Simpan Data</span>
          </button>
          <button
            type="button"
            className="btn btn-compact"
            onClick={onToggleTheme}
            aria-label={
              resolvedScheme === "dark" ? "Beralih ke tema terang" : "Beralih ke tema gelap"
            }
          >
            {resolvedScheme === "dark" ? <SunIcon /> : <MoonIcon />}
            <span>{resolvedScheme === "dark" ? "Terang" : "Gelap"}</span>
          </button>
        </div>
      </div>

      <div
        ref={toolbarRef}
        className="action-ribbon"
        role="toolbar"
        aria-label="Alat penyuntingan data, variabel, dan modul hasil analisis"
        {...({ focusgroup: "toolbar wrap" } as Record<string, string>)}
      >
        <div className="toolbar-group" role="group" aria-label="Sunting data dan variabel">
          <button
            type="button"
            className="btn btn-compact"
            aria-disabled={!canUndo ? "true" : undefined}
            onClick={() => {
              if (canUndo) onUndo();
            }}
          >
            <UndoIcon />
            <span>Undo</span>
          </button>
          <button
            type="button"
            className="btn btn-compact"
            aria-disabled={!canRedo ? "true" : undefined}
            onClick={() => {
              if (canRedo) onRedo();
            }}
          >
            <RedoIcon />
            <span>Redo</span>
          </button>
          <button type="button" className="btn btn-compact" onClick={onAddRow}>
            <PlusIcon />
            <span>Baris</span>
          </button>
          <button type="button" className="btn btn-compact" onClick={onAddCol}>
            <PlusIcon />
            <span>Butir</span>
          </button>
          <button
            type="button"
            className="btn btn-compact"
            aria-disabled={!canDeleteRow ? "true" : undefined}
            onClick={() => {
              if (canDeleteRow) onDeleteRow();
            }}
          >
            <TrashIcon />
            <span>{selectedRowLabel}</span>
          </button>
          <button
            type="button"
            className="btn btn-compact"
            aria-disabled={!canDeleteCol ? "true" : undefined}
            onClick={() => {
              if (canDeleteCol) onDeleteCol();
            }}
          >
            <TrashIcon />
            <span>{selectedColLabel}</span>
          </button>
          <button type="button" className="btn btn-compact" onClick={onOpenMerge}>
            <span>Gabung Berkas</span>
          </button>
          <button
            type="button"
            className="btn btn-compact toolbar-toggle"
            aria-pressed={varDrawerOpen ? "true" : "false"}
            onClick={onToggleVarDrawer}
          >
            <span>Setup Variabel</span>
          </button>
        </div>

        <span className="toolbar-sep" role="separator" aria-orientation="vertical" />

        <div className="toolbar-group" role="group" aria-label="Modul hasil analisis dan grafik">
          <button
            type="button"
            className="btn btn-compact toolbar-toggle"
            aria-pressed={modules.reliability ? "true" : "false"}
            onClick={() => onToggleModule("reliability")}
          >
            <span>Reliabilitas</span>
          </button>
          <button
            type="button"
            className="btn btn-compact toolbar-toggle"
            aria-pressed={modules.items ? "true" : "false"}
            onClick={() => onToggleModule("items")}
          >
            <span>Analisis Butir</span>
          </button>
          <button
            type="button"
            className="btn btn-compact toolbar-toggle"
            aria-pressed={modules.distractors ? "true" : "false"}
            onClick={() => onToggleModule("distractors")}
          >
            <span>Pengecoh</span>
          </button>
          <button
            type="button"
            className="btn btn-compact toolbar-toggle"
            aria-pressed={modules.charts ? "true" : "false"}
            onClick={() => onToggleModule("charts")}
          >
            <span>Grafik</span>
          </button>
          <button
            type="button"
            className="btn btn-compact toolbar-toggle"
            aria-pressed={modules.comparison ? "true" : "false"}
            onClick={() => onToggleModule("comparison")}
          >
            <span>Audit Legacy</span>
          </button>
          <button
            type="button"
            className="btn btn-compact toolbar-toggle"
            aria-pressed={modules.options ? "true" : "false"}
            onClick={() => onToggleModule("options")}
          >
            <span>Opsi</span>
          </button>
        </div>
      </div>
    </header>
  );
}
