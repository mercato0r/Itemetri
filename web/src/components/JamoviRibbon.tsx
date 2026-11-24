import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorksheetSummaryKind } from "../model/worksheet";
import type { ExportableCardSpec } from "../utils/resultExport";
import { CardExportBar } from "./CardExportBar";
import {
  BrandMarkIcon,
  ChevronDownIcon,
  DownloadIcon,
  FilePlusIcon,
  HelpCircleIcon,
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
  missingKeyCount: number;
  summaryKind: WorksheetSummaryKind;
  allResultsSpec: ExportableCardSpec | null;
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
  onOpenPretestPosttest: () => void;
  onToggleVarDrawer: () => void;
  onToggleModule: (key: keyof ResultModuleToggles) => void;
  onStatusMessage?: (msg: string) => void;
}

export function JamoviRibbon({
  sourcePath,
  activeSubjectCount,
  totalRowsCount,
  itemCount,
  missingKeyCount,
  summaryKind,
  allResultsSpec,
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
  onOpenPretestPosttest,
  onToggleVarDrawer,
  onToggleModule,
  onStatusMessage,
}: JamoviRibbonProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const gridBtnRef = useRef<HTMLButtonElement | null>(null);
  const gridMenuRef = useRef<HTMLDivElement | null>(null);
  const toolsBtnRef = useRef<HTMLButtonElement | null>(null);
  const toolsMenuRef = useRef<HTMLDivElement | null>(null);
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const [gridMenuPos, setGridMenuPos] = useState<{ top: number; left: number }>({ top: 96, left: 16 });
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsPos, setToolsPos] = useState<{ top: number; left: number }>({ top: 96, left: 16 });

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

  useEffect(() => {
    if (!gridMenuOpen) return;

    const updatePos = () => {
      const btn = gridBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuW = 216;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
      const top = Math.min(rect.bottom + 4, window.innerHeight - 190);
      setGridMenuPos({ top, left });
    };

    updatePos();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (gridBtnRef.current?.contains(target) || gridMenuRef.current?.contains(target)) return;
      setGridMenuOpen(false);
    };

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setGridMenuOpen(false);
        gridBtnRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePos);
    };
  }, [gridMenuOpen]);

  useEffect(() => {
    if (!toolsOpen) return;

    const updatePos = () => {
      const btn = toolsBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuW = 220;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
      const top = Math.min(rect.bottom + 4, window.innerHeight - 190);
      setToolsPos({ top, left });
    };

    updatePos();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (toolsBtnRef.current?.contains(target) || toolsMenuRef.current?.contains(target)) return;
      setToolsOpen(false);
    };

    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setToolsOpen(false);
        toolsBtnRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updatePos);
    };
  }, [toolsOpen]);

  const kindLabel =
    summaryKind === "mixed"
      ? "Campuran (PG+Uraian)"
      : summaryKind === "essay"
        ? "Uraian"
        : "Pilihan Ganda";
  const summaryText = `${sourcePath ?? "Lembar Kerja Baru"} (${activeSubjectCount}/${totalRowsCount} baris, ${itemCount} butir, ${kindLabel})`;

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
            <span>Impor Excel / CSV</span>
          </button>
          <button
            type="button"
            className="btn btn-compact"
            aria-disabled={activeSubjectCount === 0 ? "true" : undefined}
            title="Simpan data mentah peserta & kunci dari tabel kiri"
            onClick={() => {
              if (activeSubjectCount > 0) {
                onOpenSaveData();
              } else {
                onStatusMessage?.("Masukkan data peserta terlebih dahulu sebelum menyimpan data.");
              }
            }}
          >
            <DownloadIcon />
            <span>Simpan Data Mentah</span>
          </button>
          {allResultsSpec ? (
            <CardExportBar
              spec={allResultsSpec}
              copyLabel="Salin Laporan"
              downloadLabel="Ekspor Laporan"
              iconOnly={false}
              primaryDownload
              onStatusMessage={onStatusMessage}
            />
          ) : (
            <button
              type="button"
              className="btn btn-compact"
              aria-disabled="true"
              title="Tersedia setelah data peserta dan kunci jawaban lengkap"
              onClick={() =>
                onStatusMessage?.(
                  "Lengkapi data peserta dan kunci jawaban terlebih dahulu untuk mengekspor laporan lengkap.",
                )
              }
            >
              <DownloadIcon />
              <span>Ekspor Laporan</span>
            </button>
          )}
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
          <a
            href="./user_manual/"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-compact"
            aria-label="Buka panduan pengguna lengkap di tab baru"
            title="Panduan Pengguna & Rumus Perhitungan"
          >
            <HelpCircleIcon />
            <span>Panduan</span>
          </a>
        </div>
      </div>

      <div
        ref={toolbarRef}
        className="action-ribbon"
        role="toolbar"
        aria-label="Alat penyuntingan data, kunci soal, dan pengaturan"
        {...({ focusgroup: "toolbar wrap" } as Record<string, string>)}
      >
        <div className="toolbar-group" role="group" aria-label="Sunting data dan kunci">
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
          <button
            ref={gridBtnRef}
            type="button"
            className="btn btn-compact"
            aria-haspopup="menu"
            aria-expanded={gridMenuOpen}
            onClick={() => {
              setToolsOpen(false);
              setGridMenuOpen((prev) => !prev);
            }}
          >
            <span>Baris &amp; Kolom</span>
            <ChevronDownIcon />
          </button>
          <button
            type="button"
            className="btn btn-compact toolbar-toggle"
            aria-pressed={varDrawerOpen ? "true" : "false"}
            onClick={onToggleVarDrawer}
          >
            <span>
              Atur Soal &amp; Kunci{missingKeyCount > 0 ? ` (${missingKeyCount})` : ""}
            </span>
          </button>
        </div>

        <span className="toolbar-sep" role="separator" aria-orientation="vertical" />

        <div className="toolbar-group" role="group" aria-label="Pengaturan dan alat lanjutan">
          <button
            type="button"
            className="btn btn-compact toolbar-toggle"
            aria-pressed={modules.options ? "true" : "false"}
            onClick={() => onToggleModule("options")}
          >
            <span>Pengaturan</span>
          </button>
          <button
            ref={toolsBtnRef}
            type="button"
            className="btn btn-compact"
            aria-haspopup="menu"
            aria-expanded={toolsOpen}
            onClick={() => {
              setGridMenuOpen(false);
              setToolsOpen((prev) => !prev);
            }}
          >
            <span>Alat Lanjutan</span>
            <ChevronDownIcon />
          </button>
        </div>
      </div>

      {gridMenuOpen &&
        createPortal(
          <div
            ref={gridMenuRef}
            className="export-menu-popover no-print"
            role="menu"
            aria-label="Tambah atau hapus baris dan kolom"
            style={{ top: `${gridMenuPos.top}px`, left: `${gridMenuPos.left}px`, minInlineSize: "13rem" }}
          >
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => {
                setGridMenuOpen(false);
                onAddRow();
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <PlusIcon />
                <span>Tambah Baris Peserta</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => {
                setGridMenuOpen(false);
                onAddCol();
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <PlusIcon />
                <span>Tambah Butir Soal</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              aria-disabled={!canDeleteRow ? "true" : undefined}
              onClick={() => {
                if (!canDeleteRow) return;
                setGridMenuOpen(false);
                onDeleteRow();
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <TrashIcon />
                <span>{selectedRowLabel}</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              aria-disabled={!canDeleteCol ? "true" : undefined}
              onClick={() => {
                if (!canDeleteCol) return;
                setGridMenuOpen(false);
                onDeleteCol();
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                <TrashIcon />
                <span>{selectedColLabel}</span>
              </span>
            </button>
          </div>,
          document.body,
        )}

      {toolsOpen &&
        createPortal(
          <div
            ref={toolsMenuRef}
            className="export-menu-popover no-print"
            role="menu"
            aria-label="Alat analisis lanjutan"
            style={{ top: `${toolsPos.top}px`, left: `${toolsPos.left}px`, minInlineSize: "13.5rem" }}
          >
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => {
                setToolsOpen(false);
                onOpenMerge();
              }}
            >
              <span>Gabung Berkas Ujian</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => {
                setToolsOpen(false);
                onOpenPretestPosttest();
              }}
            >
              <span>Uji Pretest-Posttest</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => {
                setToolsOpen(false);
                onToggleModule("comparison");
              }}
            >
              <span>Audit ANATES Klasik {modules.comparison ? "(Aktif)" : ""}</span>
            </button>
          </div>,
          document.body,
        )}
    </header>
  );
}
