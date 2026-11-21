import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  copyCardToClipboard,
  downloadCardAsImage,
  downloadCardAsPdf,
  downloadCardAsText,
  type ExportableCardSpec,
} from "../utils/resultExport";
import { CheckIcon, ChevronDownIcon, CopyIcon, DownloadIcon } from "./Icons";

interface CardExportBarProps {
  spec: ExportableCardSpec;
  copyLabel?: string;
  downloadLabel?: string;
  onStatusMessage?: (msg: string) => void;
}

export function CardExportBar({
  spec,
  copyLabel = "Salin",
  downloadLabel = "Unduh",
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
      const approxMenuH = 166;
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
    const msg = await copyCardToClipboard(spec);
    setCopied(true);
    onStatusMessage?.(msg);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = async (fmt: "txt" | "pdf" | "png" | "jpg") => {
    setBusyFmt(fmt);
    setMenuOpen(false);
    try {
      if (fmt === "txt") {
        downloadCardAsText(spec);
        onStatusMessage?.(`Berkas teks itemetri-${spec.id}.txt diunduh.`);
      } else if (fmt === "pdf") {
        await downloadCardAsPdf(spec);
        onStatusMessage?.(`Laporan PDF itemetri-${spec.id}.pdf diunduh.`);
      } else {
        await downloadCardAsImage(spec, fmt);
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

  return (
    <div className="card-export-bar no-print">
      <button
        type="button"
        className="btn btn-compact"
        aria-label={`${copyLabel} ${spec.title}`}
        onClick={() => void handleCopy()}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        <span>{copied ? "Tersalin" : copyLabel}</span>
      </button>

      <button
        ref={downloadBtnRef}
        type="button"
        className="btn btn-compact"
        aria-label={`${downloadLabel} ${spec.title}`}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        disabled={busyFmt !== null}
        onClick={() => setMenuOpen((prev) => !prev)}
      >
        <DownloadIcon />
        <span>{busyFmt ? `Membuat ${busyFmt.toUpperCase()}...` : downloadLabel}</span>
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
