import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  copyCardToClipboard,
  downloadCardAsImage,
  downloadCardAsPdf,
  downloadCardAsText,
  downloadCardAsXlsx,
  type ExportableCardSpec,
} from "../utils/resultExport";
import { CheckIcon, ChevronDownIcon, CopyIcon, DownloadIcon } from "./Icons";

interface CardExportBarProps {
  spec: ExportableCardSpec;
  copyLabel?: string;
  downloadLabel?: string;
  iconOnly?: boolean;
  primaryDownload?: boolean;
  onStatusMessage?: (msg: string) => void;
}

export function CardExportBar({
  spec,
  copyLabel = "Salin",
  downloadLabel = "Unduh",
  iconOnly = true,
  primaryDownload = false,
  onStatusMessage,
}: CardExportBarProps) {
  const [copied, setCopied] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busyFmt, setBusyFmt] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({
    top: 48,
    right: 16,
  });

  const downloadBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const updatePosition = () => {
      const btn = downloadBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const approxMenuH = 204;
      const top =
        rect.bottom + 6 + approxMenuH <= window.innerHeight
          ? rect.bottom + 4
          : Math.max(8, rect.top - approxMenuH - 4);
      const right = Math.max(8, window.innerWidth - rect.right);
      setMenuPos({ top, right });
    };

    updatePosition();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (downloadBtnRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMenuOpen(false);
        downloadBtnRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [menuOpen]);

  const handleCopy = async () => {
    try {
      const msg = await copyCardToClipboard(spec);
      setCopied(true);
      onStatusMessage?.(msg);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      onStatusMessage?.(
        err instanceof Error ? err.message : "Gagal menyalin hasil ke papan klip.",
      );
    }
  };

  const supportsXlsx = Boolean(spec.table || spec.metrics || (spec.sections && spec.sections.length > 0));

  const handleDownload = async (fmt: "txt" | "pdf" | "xlsx" | "png" | "jpg") => {
    setBusyFmt(fmt);
    setMenuOpen(false);
    try {
      const res =
        fmt === "txt"
          ? await downloadCardAsText(spec)
          : fmt === "pdf"
            ? await downloadCardAsPdf(spec)
            : fmt === "xlsx"
              ? await downloadCardAsXlsx(spec)
              : await downloadCardAsImage(spec, fmt);
      if (res.cancelled) {
        onStatusMessage?.("Penyimpanan berkas dibatalkan.");
      } else if (res.path) {
        onStatusMessage?.(`Berkas disimpan ke ${res.path}.`);
      } else if (fmt === "txt") {
        onStatusMessage?.(`Berkas teks itemetri-${spec.id}.txt diunduh.`);
      } else if (fmt === "pdf") {
        onStatusMessage?.(`Laporan PDF itemetri-${spec.id}.pdf diunduh.`);
      } else if (fmt === "xlsx") {
        onStatusMessage?.(`Workbook Excel itemetri-${spec.id}.xlsx diunduh.`);
      } else {
        onStatusMessage?.(`Gambar itemetri-${spec.id}.${fmt} diunduh.`);
      }
    } catch (err) {
      onStatusMessage?.(
        err instanceof Error ? err.message : `Gagal mengunduh format ${fmt.toUpperCase()}.`,
      );
    } finally {
      setBusyFmt(null);
    }
  };

  const copyTitle = copied ? "Tersalin" : copyLabel;
  const downloadTitle = busyFmt ? `Membuat ${busyFmt.toUpperCase()}...` : downloadLabel;

  return (
    <div className="card-export-bar no-print">
      <button
        type="button"
        className={iconOnly ? "btn btn-compact btn-icon-only" : "btn btn-compact"}
        aria-label={`${copyLabel} ${spec.title}`}
        title={copyTitle}
        onClick={() => void handleCopy()}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {!iconOnly && <span>{copied ? "Tersalin" : copyLabel}</span>}
      </button>

      <button
        ref={downloadBtnRef}
        type="button"
        className={
          iconOnly
            ? "btn btn-compact btn-icon-only"
            : primaryDownload
              ? "btn btn-primary btn-compact"
              : "btn btn-compact"
        }
        aria-label={`${downloadLabel} ${spec.title}`}
        title={downloadTitle}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        disabled={busyFmt !== null}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <DownloadIcon />
        {!iconOnly && (
          <span>{busyFmt ? `Membuat ${busyFmt.toUpperCase()}...` : downloadLabel}</span>
        )}
        <ChevronDownIcon />
      </button>

      {menuOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="export-menu-popover no-print"
            role="menu"
            aria-label={`Pilih format unduh untuk ${spec.title}`}
            style={{ top: `${menuPos.top}px`, right: `${menuPos.right}px` }}
          >
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => void handleDownload("txt")}
            >
              <span>Teks / Word (.txt)</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => void handleDownload("pdf")}
            >
              <span>Laporan PDF (.pdf)</span>
            </button>
            {supportsXlsx && (
              <button
                type="button"
                role="menuitem"
                className="export-menu-item"
                onClick={() => void handleDownload("xlsx")}
              >
                <span>Tabel Excel (.xlsx)</span>
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => void handleDownload("png")}
            >
              <span>Gambar PNG (.png)</span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="export-menu-item"
              onClick={() => void handleDownload("jpg")}
            >
              <span>Gambar JPG (.jpg)</span>
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}
