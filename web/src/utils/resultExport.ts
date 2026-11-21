import { saveBlobWithDialog, type SaveBlobResult } from "./fileSave";

export interface ExportMetricItem {
  label: string;
  value: string;
  note?: string;
}

export interface ExportTableSpec {
  headers: string[];
  alignments?: Array<"left" | "right">;
  rows: string[][];
}

export interface ExportableCardSpec {
  id: string;
  title: string;
  subtitle?: string;
  metrics?: ExportMetricItem[];
  table?: ExportTableSpec;
  footnote?: string;
  getSvgElement?: () => SVGSVGElement | null;
  sections?: ExportableCardSpec[];
}

const LOGICAL_WIDTH = 820;
const PAGE_HEIGHT = 1160;
const PAD_X = 28;
const PAD_Y = 26;
const CONTENT_WIDTH = LOGICAL_WIDTH - PAD_X * 2;
const RENDER_SCALE = 2;

const PALETTE = {
  bg: "#ffffff",
  subtle: "#f1f5f9",
  ink: "#141b24",
  muted: "#475467",
  accent: "#1d4ed8",
  ruleStrong: "#141b24",
  ruleSubtle: "#cbd5e1",
};

const SANS_FONT = '"Segoe UI", Arial, sans-serif';
const MONO_FONT = 'Consolas, "Courier New", monospace';

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function padText(text: string, width: number, align: "left" | "right"): string {
  return align === "right" ? text.padStart(width, " ") : text.padEnd(width, " ");
}

function getSections(spec: ExportableCardSpec): ExportableCardSpec[] {
  return spec.sections && spec.sections.length > 0 ? spec.sections : [spec];
}

function renderSectionPlainText(section: ExportableCardSpec): string {
  const lines: string[] = [];
  lines.push(section.title);
  if (section.subtitle) lines.push(section.subtitle);
  lines.push("=".repeat(Math.min(78, Math.max(24, section.title.length))));

  if (section.metrics && section.metrics.length > 0) {
    const labelW = Math.max(18, ...section.metrics.map((m) => m.label.length));
    for (const m of section.metrics) {
      const note = m.note ? `  (${m.note})` : "";
      lines.push(`${m.label.padEnd(labelW, " ")} : ${m.value}${note}`);
    }
  }

  if (section.table) {
    const { headers, rows, alignments } = section.table;
    const widths = headers.map((h, c) =>
      Math.max(h.length, ...rows.map((r) => (r[c] ?? "").length)),
    );
    const formatRow = (cells: string[]) =>
      cells
        .map((cell, c) => padText(cell ?? "", widths[c] ?? 1, alignments?.[c] ?? "left"))
        .join("   ");

    const headerLine = formatRow(headers);
    const rule = "-".repeat(Math.max(12, headerLine.length));
    lines.push(rule);
    lines.push(headerLine);
    lines.push(rule);
    for (const row of rows) {
      lines.push(formatRow(row));
    }
    lines.push(rule);
  }

  if (!section.table && !section.metrics && section.getSvgElement?.()) {
    lines.push(`[Grafik: ${section.title} - ekspor sebagai PNG, JPG, atau PDF untuk visual]`);
  }

  if (section.footnote) {
    lines.push(`Catatan: ${section.footnote}`);
  }

  return lines.join("\n");
}

export function buildPlainText(spec: ExportableCardSpec): string {
  return getSections(spec).map(renderSectionPlainText).join("\n\n");
}

function renderSectionWordHtml(section: ExportableCardSpec): string {
  const parts: string[] = [];
  parts.push(
    `<h3 style="margin:12pt 0 2pt 0;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:12pt;font-weight:700;color:#111827;">${escapeHtml(section.title)}</h3>`,
  );
  if (section.subtitle) {
    parts.push(
      `<p style="margin:0 0 6pt 0;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:9.5pt;font-style:italic;color:#475467;">${escapeHtml(section.subtitle)}</p>`,
    );
  }

  const baseTableStyle =
    "border-collapse:collapse;margin:4pt 0 6pt 0;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:10.5pt;color:#111827;";

  if (section.metrics && section.metrics.length > 0) {
    parts.push(`<table style="${baseTableStyle}"><thead><tr>`);
    parts.push(
      `<th style="border-top:1.5pt solid #111827;border-bottom:1pt solid #111827;padding:4pt 10pt;text-align:left;font-weight:700;">Statistik</th>`,
    );
    parts.push(
      `<th style="border-top:1.5pt solid #111827;border-bottom:1pt solid #111827;padding:4pt 10pt;text-align:right;font-weight:700;">Nilai</th>`,
    );
    parts.push(
      `<th style="border-top:1.5pt solid #111827;border-bottom:1pt solid #111827;padding:4pt 10pt;text-align:left;font-weight:700;">Keterangan</th>`,
    );
    parts.push("</tr></thead><tbody>");
    section.metrics.forEach((m, idx) => {
      const bottom =
        idx === section.metrics!.length - 1 ? "border-bottom:1.5pt solid #111827;" : "";
      parts.push("<tr>");
      parts.push(`<td style="padding:3.5pt 10pt;text-align:left;${bottom}">${escapeHtml(m.label)}</td>`);
      parts.push(`<td style="padding:3.5pt 10pt;text-align:right;font-variant-numeric:tabular-nums;${bottom}">${escapeHtml(m.value)}</td>`);
      parts.push(`<td style="padding:3.5pt 10pt;text-align:left;color:#475467;${bottom}">${escapeHtml(m.note ?? "-")}</td>`);
      parts.push("</tr>");
    });
    parts.push("</tbody></table>");
  }

  if (section.table) {
    const { headers, rows, alignments } = section.table;
    parts.push(`<table style="${baseTableStyle}"><thead><tr>`);
    headers.forEach((h, c) => {
      const align = alignments?.[c] ?? "left";
      parts.push(
        `<th style="border-top:1.5pt solid #111827;border-bottom:1pt solid #111827;padding:4pt 8pt;text-align:${align};font-weight:700;">${escapeHtml(h)}</th>`,
      );
    });
    parts.push("</tr></thead><tbody>");
    rows.forEach((row, rIdx) => {
      const bottom = rIdx === rows.length - 1 ? "border-bottom:1.5pt solid #111827;" : "";
      parts.push("<tr>");
      headers.forEach((_, c) => {
        const align = alignments?.[c] ?? "left";
        const tabular = align === "right" ? "font-variant-numeric:tabular-nums;" : "";
        parts.push(
          `<td style="padding:3pt 8pt;text-align:${align};${tabular}${bottom}">${escapeHtml(row[c] ?? "")}</td>`,
        );
      });
      parts.push("</tr>");
    });
    parts.push("</tbody></table>");
  }

  if (section.footnote) {
    parts.push(
      `<p style="margin:3pt 0 8pt 0;font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:9pt;color:#475467;">Catatan. ${escapeHtml(section.footnote)}</p>`,
    );
  }

  return parts.join("");
}

export function buildWordHtml(spec: ExportableCardSpec): string {
  return `<div>${getSections(spec).map(renderSectionWordHtml).join("")}</div>`;
}

function fallbackCopyPlainText(text: string): boolean {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  area.style.pointerEvents = "none";
  document.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  } finally {
    area.remove();
  }
  return ok;
}

async function rasterizeSvg(
  svg: SVGSVGElement,
): Promise<{ img: HTMLImageElement; width: number; height: number } | null> {
  const vb = svg.viewBox?.baseVal;
  const rect = svg.getBoundingClientRect();
  const logicalW = vb && vb.width > 0 ? vb.width : Math.max(320, rect.width || 460);
  const logicalH = vb && vb.height > 0 ? vb.height : Math.max(160, rect.height || 240);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute("style");
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("viewBox", `0 0 ${logicalW} ${logicalH}`);
  clone.setAttribute("width", String(Math.round(logicalW * RENDER_SCALE)));
  clone.setAttribute("height", String(Math.round(logicalH * RENDER_SCALE)));

  const styleEl = document.createElementNS("http://www.w3.org/2000/svg", "style");
  styleEl.textContent = [
    `:root {`,
    `  --accent: #1d4ed8;`,
    `  --ink-primary: #141b24;`,
    `  --ink-secondary: #475467;`,
    `  --border-strong: #64748b;`,
    `  --border-subtle: #cbd5e1;`,
    `  --bg-subtle: #eef2f6;`,
    `  --bg-panel: #ffffff;`,
    `  --warn: #d97706;`,
    `}`,
    `text { font-family: "Segoe UI", Arial, sans-serif; }`,
  ].join("\n");
  clone.insertBefore(styleEl, clone.firstChild);

  const xml = new XMLSerializer().serializeToString(clone);
  const svgBlob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Gagal merasterisasi grafik SVG."));
      img.src = url;
    });
    return { img, width: logicalW, height: logicalH };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const suffix = "..";
  const suffixW = ctx.measureText(suffix).width;
  let end = text.length;
  while (end > 0 && ctx.measureText(text.slice(0, end)).width + suffixW > maxW) {
    end -= 1;
  }
  return text.slice(0, end) + suffix;
}

interface TableLayout {
  headers: string[];
  alignments: Array<"left" | "right">;
  colX: number[];
  colWidths: number[];
}

type RenderBlock =
  | { kind: "heading"; height: number; title: string; subtitle?: string }
  | { kind: "metrics"; height: number; items: ExportMetricItem[] }
  | { kind: "tableHeader"; height: number; layout: TableLayout }
  | { kind: "tableRow"; height: number; layout: TableLayout; cells: string[]; isLast: boolean }
  | { kind: "tableBottom"; height: number }
  | { kind: "chart"; height: number; img: HTMLImageElement; drawW: number; drawH: number }
  | { kind: "footnote"; height: number; text: string }
  | { kind: "spacer"; height: number };

function computeTableLayout(
  ctx: CanvasRenderingContext2D,
  table: ExportTableSpec,
): TableLayout {
  const colCount = table.headers.length;
  const alignments = table.headers.map((_, c) => table.alignments?.[c] ?? "left");
  const rawWidths = new Array<number>(colCount).fill(40);

  ctx.font = `700 12px ${SANS_FONT}`;
  table.headers.forEach((h, c) => {
    rawWidths[c] = Math.max(rawWidths[c]!, ctx.measureText(h).width + 16);
  });

  ctx.font = `400 12px ${SANS_FONT}`;
  const sampleRows = table.rows.slice(0, 120);
  for (const row of sampleRows) {
    for (let c = 0; c < colCount; c++) {
      const val = row[c] ?? "";
      rawWidths[c] = Math.max(rawWidths[c]!, ctx.measureText(val).width + 16);
    }
  }

  const totalRaw = rawWidths.reduce((a, b) => a + b, 0);
  const scale = totalRaw > 0 ? CONTENT_WIDTH / totalRaw : 1;
  const colWidths = rawWidths.map((w) => Math.max(28, w * scale));
  const sumW = colWidths.reduce((a, b) => a + b, 0);
  if (sumW > 0 && Math.abs(sumW - CONTENT_WIDTH) > 1) {
    const adjust = CONTENT_WIDTH / sumW;
    for (let c = 0; c < colWidths.length; c++) {
      colWidths[c] = (colWidths[c] ?? 28) * adjust;
    }
  }

  const colX: number[] = [];
  let cursor = PAD_X;
  for (const w of colWidths) {
    colX.push(cursor);
    cursor += w;
  }

  return { headers: table.headers, alignments, colX, colWidths };
}

async function buildRenderBlocks(spec: ExportableCardSpec): Promise<RenderBlock[]> {
  const scratch = document.createElement("canvas");
  scratch.width = 4;
  scratch.height = 4;
  const ctx = scratch.getContext("2d");
  if (!ctx) return [];

  const blocks: RenderBlock[] = [];
  const sections = getSections(spec);

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx]!;
    blocks.push({
      kind: "heading",
      height: sec.subtitle ? 44 : 28,
      title: sec.title,
      subtitle: sec.subtitle,
    });

    if (sec.metrics && sec.metrics.length > 0) {
      const rows = Math.ceil(sec.metrics.length / 3);
      blocks.push({
        kind: "metrics",
        height: rows * 68 + (rows - 1) * 8 + 8,
        items: sec.metrics,
      });
    }

    if (sec.table) {
      const layout = computeTableLayout(ctx, sec.table);
      blocks.push({ kind: "tableHeader", height: 28, layout });
      sec.table.rows.forEach((cells, rIdx) => {
        blocks.push({
          kind: "tableRow",
          height: 22,
          layout,
          cells,
          isLast: rIdx === sec.table!.rows.length - 1,
        });
      });
      blocks.push({ kind: "tableBottom", height: 8 });
    }

    const svgEl = sec.getSvgElement?.();
    if (svgEl) {
      const raster = await rasterizeSvg(svgEl);
      if (raster) {
        const targetW = Math.min(CONTENT_WIDTH, raster.width * 1.4);
        const drawH = (raster.height / raster.width) * targetW;
        blocks.push({
          kind: "chart",
          height: Math.round(drawH) + 10,
          img: raster.img,
          drawW: Math.round(targetW),
          drawH: Math.round(drawH),
        });
      }
    }

    if (sec.footnote) {
      blocks.push({ kind: "footnote", height: 22, text: sec.footnote });
    }

    if (sIdx < sections.length - 1) {
      blocks.push({ kind: "spacer", height: 18 });
    }
  }

  return blocks;
}

function drawBlock(ctx: CanvasRenderingContext2D, block: RenderBlock, y: number): void {
  switch (block.kind) {
    case "heading": {
      ctx.fillStyle = PALETTE.ink;
      ctx.font = `700 16px ${SANS_FONT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(fitText(ctx, block.title, CONTENT_WIDTH), PAD_X, y);
      if (block.subtitle) {
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `400 12px ${SANS_FONT}`;
        ctx.fillText(fitText(ctx, block.subtitle, CONTENT_WIDTH), PAD_X, y + 21);
      }
      return;
    }

    case "metrics": {
      const cols = Math.min(3, Math.max(1, block.items.length));
      const gap = 10;
      const tileW = (CONTENT_WIDTH - gap * (cols - 1)) / cols;
      const tileH = 66;
      block.items.forEach((item, idx) => {
        const row = Math.floor(idx / cols);
        const col = idx % cols;
        const tx = PAD_X + col * (tileW + gap);
        const ty = y + row * (tileH + 8);
        ctx.fillStyle = PALETTE.subtle;
        ctx.fillRect(tx, ty, tileW, tileH);
        ctx.strokeStyle = PALETTE.ruleSubtle;
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, tileW, tileH);

        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `600 11px ${SANS_FONT}`;
        ctx.fillText(fitText(ctx, item.label, tileW - 16), tx + 8, ty + 7);

        ctx.fillStyle = PALETTE.ink;
        ctx.font = `700 17px ${MONO_FONT}`;
        ctx.fillText(fitText(ctx, item.value, tileW - 16), tx + 8, ty + 23);

        if (item.note) {
          ctx.fillStyle = PALETTE.muted;
          ctx.font = `400 11px ${SANS_FONT}`;
          ctx.fillText(fitText(ctx, item.note, tileW - 16), tx + 8, ty + 46);
        }
      });
      return;
    }

    case "tableHeader": {
      const { headers, alignments, colX, colWidths } = block.layout;
      ctx.strokeStyle = PALETTE.ruleStrong;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(PAD_X, y + 1);
      ctx.lineTo(PAD_X + CONTENT_WIDTH, y + 1);
      ctx.stroke();

      ctx.fillStyle = PALETTE.ink;
      ctx.font = `700 12px ${SANS_FONT}`;
      ctx.textBaseline = "middle";
      headers.forEach((h, c) => {
        const align = alignments[c] ?? "left";
        const w = colWidths[c] ?? 40;
        const x = colX[c] ?? PAD_X;
        ctx.textAlign = align;
        const drawX = align === "right" ? x + w - 5 : x + 5;
        ctx.fillText(fitText(ctx, h, w - 10), drawX, y + 15);
      });

      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD_X, y + 27);
      ctx.lineTo(PAD_X + CONTENT_WIDTH, y + 27);
      ctx.stroke();
      return;
    }

    case "tableRow": {
      const { alignments, colX, colWidths } = block.layout;
      ctx.fillStyle = PALETTE.ink;
      ctx.textBaseline = "middle";
      block.cells.forEach((val, c) => {
        const align = alignments[c] ?? "left";
        const w = colWidths[c] ?? 40;
        const x = colX[c] ?? PAD_X;
        ctx.font = align === "right" ? `400 12px ${MONO_FONT}` : `400 12px ${SANS_FONT}`;
        ctx.textAlign = align;
        const drawX = align === "right" ? x + w - 5 : x + 5;
        ctx.fillText(fitText(ctx, val ?? "", w - 10), drawX, y + 11);
      });
      ctx.strokeStyle = PALETTE.ruleSubtle;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(PAD_X, y + 21.5);
      ctx.lineTo(PAD_X + CONTENT_WIDTH, y + 21.5);
      ctx.stroke();
      return;
    }

    case "tableBottom": {
      ctx.strokeStyle = PALETTE.ruleStrong;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(PAD_X, y + 1);
      ctx.lineTo(PAD_X + CONTENT_WIDTH, y + 1);
      ctx.stroke();
      return;
    }

    case "chart": {
      const drawX = PAD_X + (CONTENT_WIDTH - block.drawW) / 2;
      ctx.drawImage(block.img, drawX, y + 4, block.drawW, block.drawH);
      return;
    }

    case "footnote": {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `400 11px ${SANS_FONT}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(fitText(ctx, `Catatan: ${block.text}`, CONTENT_WIDTH), PAD_X, y + 4);
      return;
    }

    case "spacer":
      return;
  }
}

function createScaledCanvas(logicalW: number, logicalH: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(logicalW * RENDER_SCALE);
  canvas.height = Math.round(logicalH * RENDER_SCALE);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.scale(RENDER_SCALE, RENDER_SCALE);
    ctx.fillStyle = PALETTE.bg;
    ctx.fillRect(0, 0, logicalW, logicalH);
  }
  return canvas;
}

async function renderSpecToSingleCanvas(spec: ExportableCardSpec): Promise<HTMLCanvasElement> {
  const blocks = await buildRenderBlocks(spec);
  const totalH = Math.min(
    15000,
    Math.max(140, blocks.reduce((acc, b) => acc + b.height, 0) + PAD_Y * 2),
  );
  const canvas = createScaledCanvas(LOGICAL_WIDTH, totalH);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  let y = PAD_Y;
  for (const block of blocks) {
    if (y + block.height > totalH - 6) break;
    drawBlock(ctx, block, y);
    y += block.height;
  }
  return canvas;
}

async function renderSpecToPageCanvases(spec: ExportableCardSpec): Promise<HTMLCanvasElement[]> {
  const blocks = await buildRenderBlocks(spec);
  const pages: HTMLCanvasElement[] = [];

  let currentPage = createScaledCanvas(LOGICAL_WIDTH, PAGE_HEIGHT);
  let ctx = currentPage.getContext("2d")!;
  let y = PAD_Y;
  let activeTableHeader: Extract<RenderBlock, { kind: "tableHeader" }> | null = null;

  const pushPage = () => {
    pages.push(currentPage);
    currentPage = createScaledCanvas(LOGICAL_WIDTH, PAGE_HEIGHT);
    ctx = currentPage.getContext("2d")!;
    y = PAD_Y;
  };

  for (const block of blocks) {
    if (block.kind === "tableHeader") {
      activeTableHeader = block;
    } else if (block.kind === "tableBottom" || block.kind === "heading") {
      if (block.kind === "tableBottom") {
        if (y + block.height > PAGE_HEIGHT - PAD_Y) {
          pushPage();
        }
        drawBlock(ctx, block, y);
        y += block.height;
        activeTableHeader = null;
        continue;
      }
      activeTableHeader = null;
    }

    if (block.kind === "spacer") {
      y += block.height;
      continue;
    }

    if (y + block.height > PAGE_HEIGHT - PAD_Y && y > PAD_Y + 20) {
      pushPage();
      if (block.kind === "tableRow" && activeTableHeader) {
        drawBlock(ctx, activeTableHeader, y);
        y += activeTableHeader.height;
      }
    }

    drawBlock(ctx, block, y);
    y += block.height;
  }

  pages.push(currentPage);
  return pages;
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const idx = dataUrl.indexOf(",");
  const b64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function buildPdfFromCanvases(pages: HTMLCanvasElement[]): Uint8Array {
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let cursor = 0;

  const pushBytes = (arr: Uint8Array) => {
    chunks.push(arr);
    cursor += arr.length;
  };
  const pushAscii = (text: string) => pushBytes(enc.encode(text));

  pushAscii("%PDF-1.4\n");
  pushBytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const totalObjects = 2 + pages.length * 3;
  const offsets = new Array<number>(totalObjects + 1).fill(0);

  const startObj = (id: number) => {
    offsets[id] = cursor;
    pushAscii(`${id} 0 obj\n`);
  };

  startObj(1);
  pushAscii("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  const kidIds = pages.map((_, idx) => `${3 + idx * 3} 0 R`).join(" ");
  startObj(2);
  pushAscii(`<< /Type /Pages /Kids [ ${kidIds} ] /Count ${pages.length} >>\nendobj\n`);

  const pagePtW = 595.28;
  const pagePtH = 841.89;
  const marginPt = 20;

  pages.forEach((canvas, idx) => {
    const pageId = 3 + idx * 3;
    const contentId = pageId + 1;
    const imgId = pageId + 2;
    const jpegBytes = dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.94));

    const maxDrawW = pagePtW - marginPt * 2;
    const maxDrawH = pagePtH - marginPt * 2;
    const scale = Math.min(maxDrawW / canvas.width, maxDrawH / canvas.height);
    const drawW = canvas.width * scale;
    const drawH = canvas.height * scale;
    const drawX = (pagePtW - drawW) / 2;
    const drawY = pagePtH - marginPt - drawH;

    startObj(pageId);
    pushAscii(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pagePtW} ${pagePtH}] ` +
        `/Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );

    const contentStream =
      `q\n${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Im0 Do\nQ\n`;
    startObj(contentId);
    pushAscii(`<< /Length ${contentStream.length} >>\nstream\n${contentStream}endstream\nendobj\n`);

    startObj(imgId);
    pushAscii(
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    );
    pushBytes(jpegBytes);
    pushAscii("\nendstream\nendobj\n");
  });

  const xrefOffset = cursor;
  pushAscii(`xref\n0 ${totalObjects + 1}\n`);
  pushAscii("0000000000 65535 f \n");
  for (let i = 1; i <= totalObjects; i++) {
    pushAscii(`${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  pushAscii(
    `trailer\n<< /Size ${totalObjects + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  );

  const out = new Uint8Array(cursor);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export async function copyCardToClipboard(spec: ExportableCardSpec): Promise<string> {
  const isPureChart = Boolean(!spec.sections && !spec.table && !spec.metrics && spec.getSvgElement?.());
  if (isPureChart) {
    const canvas = await renderSpecToSingleCanvas(spec);
    const pngBlob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (pngBlob && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
        return "Gambar grafik disalin ke clipboard (siap tempel ke Word/PowerPoint).";
      } catch {
        // Fallback when headless or strict permissions block image clipboard writes.
      }
    }
    const text = buildPlainText(spec);
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return "Ringkasan grafik disalin (gunakan Unduh PNG/JPG untuk menyisipkan gambar).";
      } catch {
        // Continue to textarea fallback.
      }
    }
    fallbackCopyPlainText(text);
    return "Ringkasan grafik disalin (gunakan Unduh PNG/JPG untuk menyisipkan gambar).";
  }

  const plainText = buildPlainText(spec);
  const html = buildWordHtml(spec);

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return "Hasil disalin (format tabel siap tempel ke Word atau Excel).";
    } catch {
      // Fallback to text-only clipboard when ClipboardItem is restricted.
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(plainText);
      return "Teks hasil disalin ke clipboard.";
    } catch {
      // Fallback to DOM copy command.
    }
  }

  fallbackCopyPlainText(plainText);
  return "Teks hasil disalin ke clipboard.";
}

export async function downloadCardAsText(spec: ExportableCardSpec): Promise<SaveBlobResult> {
  const content = buildPlainText(spec);
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  return saveBlobWithDialog(blob, `itemetri-${spec.id}.txt`);
}

export async function downloadCardAsImage(
  spec: ExportableCardSpec,
  format: "png" | "jpg",
): Promise<SaveBlobResult> {
  const canvas = await renderSpecToSingleCanvas(spec);
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, 0.94),
  );
  if (!blob) {
    throw new Error("Gagal membuat berkas gambar.");
  }
  return saveBlobWithDialog(blob, `itemetri-${spec.id}.${format}`);
}

export async function downloadCardAsPdf(spec: ExportableCardSpec): Promise<SaveBlobResult> {
  const pages = await renderSpecToPageCanvases(spec);
  const pdfBytes = buildPdfFromCanvases(pages);
  const pdfCopy = new Uint8Array(pdfBytes.byteLength);
  pdfCopy.set(pdfBytes);
  const blob = new Blob([pdfCopy.buffer], { type: "application/pdf" });
  return saveBlobWithDialog(blob, `itemetri-${spec.id}.pdf`);
}
