import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface HelpToggletipProps {
  term: string;
  explanation: string;
}

export function HelpToggletip({ term, explanation }: HelpToggletipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 40,
    left: 16,
    width: 260,
  });

  const btnRef = useRef<HTMLButtonElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const updatePos = () => {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const maxW = Math.min(280, Math.max(200, window.innerWidth - 16));
      const approxH = tipRef.current?.offsetHeight || 110;
      const top =
        rect.bottom + 8 + approxH <= window.innerHeight
          ? rect.bottom + 6
          : Math.max(8, rect.top - approxH - 6);
      const rawLeft = rect.left + rect.width / 2 - maxW / 2;
      const left = Math.max(8, Math.min(rawLeft, window.innerWidth - maxW - 8));
      setPos({ top, left, width: maxW });
    };

    updatePos();

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (btnRef.current?.contains(target) || tipRef.current?.contains(target)) return;
      setOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        btnRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="help-tip-btn no-print"
        aria-label={`Penjelasan ${term}`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        ?
      </button>

      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="help-tip-popover no-print"
            style={{
              top: `${pos.top}px`,
              left: `${pos.left}px`,
              inlineSize: `${pos.width}px`,
            }}
          >
            <div className="help-tip-head">{term}</div>
            <p className="help-tip-body">{explanation}</p>
          </div>,
          document.body,
        )}
    </>
  );
}
