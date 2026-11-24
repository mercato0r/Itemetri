import fs from "node:fs";
import path from "node:path";
import katex from "katex";
import { Marked } from "marked";

const ROOT_DIR = path.resolve(import.meta.dirname, "../..");
const DEFAULT_MANUAL_PATH = path.join(ROOT_DIR, "USER_MANUAL.md");

const CALLOUT_LABELS = {
  NOTE: { cls: "is-note", title: "Catatan" },
  TIP: { cls: "is-tip", title: "Tips" },
  IMPORTANT: { cls: "is-important", title: "Penting" },
  WARNING: { cls: "is-warning", title: "Peringatan" },
  CAUTION: { cls: "is-caution", title: "Perhatian" },
};

const FAVICON_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect x='4' y='4' width='56' height='56' rx='14' fill='%231d4ed8'/%3E%3Crect x='14' y='34' width='8' height='16' rx='2' fill='%2393c5fd'/%3E%3Crect x='27' y='24' width='8' height='26' rx='2' fill='%23dbeafe'/%3E%3Crect x='40' y='15' width='8' height='35' rx='2' fill='%23ffffff'/%3E%3Cpath d='M16 25l8 7 19-16' fill='none' stroke='%2386efac' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";

const BRAND_MARK_SVG = `<svg width="22" height="22" viewBox="0 0 64 64" fill="none" aria-hidden="true">
  <rect x="4" y="4" width="56" height="56" rx="14" fill="#1d4ed8" />
  <rect x="14" y="34" width="8" height="16" rx="2" fill="#93c5fd" />
  <rect x="27" y="24" width="8" height="26" rx="2" fill="#dbeafe" />
  <rect x="40" y="15" width="8" height="35" rx="2" fill="#ffffff" />
  <path d="M16 25l8 7 19-16" stroke="#86efac" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function githubSlug(rawText) {
  return rawText
    .replaceAll("`", "")
    .replace(/\*([^*]+)\*/g, "$1")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .replace(/ /g, "-");
}

function extractPlaceholders(markdownText) {
  const codeStore = [];
  const mathStore = [];

  let work = markdownText.replace(/```[\s\S]*?```/g, (block) => {
    const idx = codeStore.length;
    codeStore.push(block);
    return `@@CODE_${idx}@@`;
  });

  work = work.replace(/`[^`\n]+`/g, (inlineCode) => {
    const idx = codeStore.length;
    codeStore.push(inlineCode);
    return `@@CODE_${idx}@@`;
  });

  work = work.replace(/\$\$([\s\S]+?)\$\$/g, (raw, expr) => {
    const idx = mathStore.length;
    const html = katex.renderToString(expr.trim(), {
      displayMode: true,
      output: "mathml",
      throwOnError: true,
    });
    mathStore.push({ raw, html: `<div class="math-block">${html}</div>`, display: true });
    return `@@MATH_${idx}@@`;
  });

  work = work.replace(/(?<!\\)\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (raw, expr) => {
    const idx = mathStore.length;
    const html = katex.renderToString(expr.trim(), {
      displayMode: false,
      output: "mathml",
      throwOnError: true,
    });
    mathStore.push({ raw, html, display: false });
    return `@@MATH_${idx}@@`;
  });

  work = work.replace(/@@CODE_(\d+)@@/g, (_, idxStr) => codeStore[Number(idxStr)] ?? "");
  return { work, mathStore };
}

function restoreRawText(text, mathStore) {
  return text.replace(/@@MATH_(\d+)@@/g, (_, idxStr) => mathStore[Number(idxStr)]?.raw ?? "");
}

function restoreMathHtml(html, mathStore) {
  let out = html.replace(/<p>\s*@@MATH_(\d+)@@\s*<\/p>/g, (_, idxStr) => {
    const item = mathStore[Number(idxStr)];
    return item ? item.html : "";
  });
  out = out.replace(/@@MATH_(\d+)@@/g, (_, idxStr) => mathStore[Number(idxStr)]?.html ?? "");
  return out;
}

function transformAlerts(html) {
  return html.replace(
    /<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:<br\s*\/?>|\s*)([\s\S]*?)<\/blockquote>/gi,
    (_, kindRaw, rest) => {
      const meta = CALLOUT_LABELS[kindRaw.toUpperCase()] ?? CALLOUT_LABELS.NOTE;
      return `<aside class="doc-callout ${meta.cls}" role="note"><div class="doc-callout-title">${meta.title}</div><p>${rest}</aside>`;
    },
  );
}

function buildManualCss() {
  return `:root {
  --raw-page-light: #f6f7f9;
  --raw-page-dark: #11161d;
  --raw-panel-light: #ffffff;
  --raw-panel-dark: #18202a;
  --raw-subtle-light: #eef1f5;
  --raw-subtle-dark: #212b38;
  --raw-frozen-light: #e6edf7;
  --raw-frozen-dark: #1d2c42;

  --raw-ink-primary-light: #141b24;
  --raw-ink-primary-dark: #f1f5f9;
  --raw-ink-secondary-light: #475467;
  --raw-ink-secondary-dark: #b0becb;

  --raw-border-subtle-light: #d0d7e2;
  --raw-border-subtle-dark: #334155;
  --raw-border-strong-light: #64748b;
  --raw-border-strong-dark: #8596aa;

  --raw-accent-light: #1d4ed8;
  --raw-accent-dark: #7cb3ff;
  --raw-accent-ink-light: #ffffff;
  --raw-accent-ink-dark: #0b1220;

  --raw-ok-light: #166534;
  --raw-ok-dark: #86efac;
  --raw-ok-bg-light: #ecfdf3;
  --raw-ok-bg-dark: #11281b;

  --raw-warn-light: #9a3412;
  --raw-warn-dark: #fdba74;
  --raw-warn-bg-light: #fff7ed;
  --raw-warn-bg-dark: #2e1c0e;

  --raw-err-light: #b42318;
  --raw-err-dark: #fca5a5;
  --raw-err-bg-light: #fef3f2;
  --raw-err-bg-dark: #2f1414;

  color-scheme: light dark;

  --bg-page: var(--raw-page-light);
  --bg-panel: var(--raw-panel-light);
  --bg-subtle: var(--raw-subtle-light);
  --bg-frozen: var(--raw-frozen-light);
  --ink-primary: var(--raw-ink-primary-light);
  --ink-secondary: var(--raw-ink-secondary-light);
  --border-subtle: var(--raw-border-subtle-light);
  --border-strong: var(--raw-border-strong-light);
  --accent: var(--raw-accent-light);
  --accent-ink: var(--raw-accent-ink-light);
  --ok: var(--raw-ok-light);
  --ok-bg: var(--raw-ok-bg-light);
  --warn: var(--raw-warn-light);
  --warn-bg: var(--raw-warn-bg-light);
  --err: var(--raw-err-light);
  --err-bg: var(--raw-err-bg-light);

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  --radius-cell: 4px;
  --radius-control: 6px;
  --radius-card: 8px;
}

:root:has(> head > meta[name="color-scheme"][content="light"]) {
  color-scheme: light;
}

:root:has(> head > meta[name="color-scheme"][content="dark"]) {
  color-scheme: dark;
  --bg-page: var(--raw-page-dark);
  --bg-panel: var(--raw-panel-dark);
  --bg-subtle: var(--raw-subtle-dark);
  --bg-frozen: var(--raw-frozen-dark);
  --ink-primary: var(--raw-ink-primary-dark);
  --ink-secondary: var(--raw-ink-secondary-dark);
  --border-subtle: var(--raw-border-subtle-dark);
  --border-strong: var(--raw-border-strong-dark);
  --accent: var(--raw-accent-dark);
  --accent-ink: var(--raw-accent-ink-dark);
  --ok: var(--raw-ok-dark);
  --ok-bg: var(--raw-ok-bg-dark);
  --warn: var(--raw-warn-dark);
  --warn-bg: var(--raw-warn-bg-dark);
  --err: var(--raw-err-dark);
  --err-bg: var(--raw-err-bg-dark);
}

@media (prefers-color-scheme: dark) {
  :root:not(:has(> head > meta[name="color-scheme"][content="light"])) {
    --bg-page: var(--raw-page-dark);
    --bg-panel: var(--raw-panel-dark);
    --bg-subtle: var(--raw-subtle-dark);
    --bg-frozen: var(--raw-frozen-dark);
    --ink-primary: var(--raw-ink-primary-dark);
    --ink-secondary: var(--raw-ink-secondary-dark);
    --border-subtle: var(--raw-border-subtle-dark);
    --border-strong: var(--raw-border-strong-dark);
    --accent: var(--raw-accent-dark);
    --accent-ink: var(--raw-accent-ink-dark);
    --ok: var(--raw-ok-dark);
    --ok-bg: var(--raw-ok-bg-dark);
    --warn: var(--raw-warn-dark);
    --warn-bg: var(--raw-warn-bg-dark);
    --err: var(--raw-err-dark);
    --err-bg: var(--raw-err-bg-dark);
  }
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  padding: 0;
  background: var(--bg-page);
  color: var(--ink-primary);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.skip-link {
  position: absolute;
  inset-block-start: -48px;
  inset-inline-start: 0.5rem;
  z-index: 1000;
  background: var(--accent);
  color: var(--accent-ink);
  padding: 0.45rem 0.9rem;
  border-radius: var(--radius-control);
  text-decoration: none;
  font-weight: 600;
}

.skip-link:focus {
  inset-block-start: 0.5rem;
}

.manual-header {
  position: sticky;
  inset-block-start: 0;
  z-index: 40;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem 1rem;
  padding: 0.65rem 1.25rem;
  background: var(--bg-panel);
  border-block-end: 1px solid var(--border-subtle);
}

.manual-brand {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  min-inline-size: 0;
}

.manual-brand-title {
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--ink-primary);
}

.manual-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.12rem 0.5rem;
  border-radius: var(--radius-cell);
  background: var(--bg-frozen);
  color: var(--ink-primary);
  border: 1px solid var(--border-strong);
  font-size: 0.76rem;
  font-weight: 600;
}

.manual-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  min-block-size: 2rem;
  min-inline-size: 2rem;
  padding: 0.3rem 0.75rem;
  background: var(--bg-panel);
  color: var(--ink-primary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-control);
  font-family: inherit;
  font-size: 0.84rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  white-space: nowrap;
}

@media (hover: hover) {
  .btn:not(.btn-primary):hover {
    background: var(--bg-subtle);
  }
}

.btn-primary {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: var(--accent);
  font-weight: 600;
}

@media (hover: hover) {
  .btn-primary:hover {
    background: var(--accent);
    color: var(--accent-ink);
    filter: brightness(0.95);
  }
}

.manual-layout {
  max-inline-size: 80rem;
  margin: 0 auto;
  padding: 1.25rem;
  display: grid;
  grid-template-columns: 18rem minmax(0, 1fr);
  gap: 1.5rem;
  align-items: start;
}

.manual-sidebar {
  position: sticky;
  inset-block-start: 4.35rem;
  max-block-size: calc(100dvh - 5.5rem);
  overflow-y: auto;
  padding: 0.9rem;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-card);
}

.toc-filter-wrap {
  margin-block-end: 0.75rem;
}

.toc-filter-wrap label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ink-secondary);
  margin-block-end: 0.25rem;
}

.toc-filter-input {
  inline-size: 100%;
  min-block-size: 2.1rem;
  padding: 0.3rem 0.55rem;
  background: var(--bg-subtle);
  color: var(--ink-primary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-cell);
  font: inherit;
  font-size: 0.84rem;
}

.toc-nav-title {
  margin: 0 0 0.45rem 0;
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--ink-secondary);
}

.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.toc-link {
  display: block;
  padding: 0.28rem 0.5rem;
  border-radius: var(--radius-cell);
  border-inline-start: 3px solid transparent;
  color: var(--ink-secondary);
  text-decoration: none;
  font-size: 0.82rem;
  line-height: 1.35;
}

.toc-link.is-h2 {
  font-weight: 600;
  color: var(--ink-primary);
  margin-block-start: 0.25rem;
}

.toc-link.is-h3 {
  padding-inline-start: 1.1rem;
}

.toc-link:hover {
  background: var(--bg-subtle);
  color: var(--ink-primary);
}

.toc-link.is-active {
  background: var(--bg-frozen);
  color: var(--ink-primary);
  border-inline-start-color: var(--accent);
  font-weight: 600;
}

.toc-empty {
  margin: 0.5rem 0 0 0;
  font-size: 0.8rem;
  color: var(--ink-secondary);
}

.mobile-toc {
  display: none;
  margin-block-end: 1rem;
  padding: 0.65rem 0.85rem;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-card);
}

.mobile-toc summary {
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
}

.manual-main {
  min-inline-size: 0;
}

.manual-article {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-card);
  padding: 1.75rem 2rem;
  max-inline-size: 100%;
}

.manual-article > :first-child {
  margin-block-start: 0;
}

.manual-article h1,
.manual-article h2,
.manual-article h3 {
  color: var(--ink-primary);
  line-height: 1.3;
  scroll-margin-top: 4.75rem;
}

.manual-article h1 {
  font-size: 1.65rem;
  padding-block-end: 0.6rem;
  border-block-end: 2px solid var(--border-subtle);
  margin-block-end: 1rem;
}

.manual-article h2 {
  font-size: 1.28rem;
  margin-block: 2rem 0.75rem;
  padding-block-end: 0.35rem;
  border-block-end: 1px solid var(--border-subtle);
}

.manual-article h3 {
  font-size: 1.05rem;
  margin-block: 1.35rem 0.5rem;
}

.manual-article p,
.manual-article li {
  max-inline-size: 74ch;
}

.manual-article a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.manual-article hr {
  border: 0;
  border-block-start: 1px solid var(--border-subtle);
  margin-block: 1.75rem;
}

.manual-article code {
  font-family: var(--font-mono);
  font-size: 0.86em;
  padding: 0.1rem 0.35rem;
  background: var(--bg-subtle);
  border-radius: var(--radius-cell);
  color: var(--ink-primary);
}

.manual-article pre {
  padding: 0.85rem 1rem;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-control);
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  line-height: 1.5;
}

.manual-article pre code {
  padding: 0;
  background: transparent;
}

.doc-callout {
  margin-block: 1rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius-control);
  border: 1px solid var(--border-subtle);
  border-inline-start: 4px solid var(--accent);
  background: var(--bg-frozen);
  max-inline-size: 74ch;
}

.doc-callout.is-important,
.doc-callout.is-warning {
  background: var(--warn-bg);
  border-color: var(--warn);
  color: var(--ink-primary);
}

.doc-callout.is-caution {
  background: var(--err-bg);
  border-color: var(--err);
  color: var(--ink-primary);
}

.doc-callout-title {
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-block-end: 0.25rem;
}

.doc-callout p {
  margin: 0;
}

.doc-table-wrap {
  margin-block: 1rem;
  overflow-x: auto;
  max-inline-size: 100%;
}

.apa-table {
  inline-size: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  font-variant-numeric: tabular-nums;
}

.apa-table th {
  border-block-start: 2px solid var(--ink-primary);
  border-block-end: 1px solid var(--ink-primary);
  padding: 0.45rem 0.65rem;
  text-align: left;
  font-weight: 700;
  background: var(--bg-subtle);
}

.apa-table td {
  border-block-end: 1px solid var(--border-subtle);
  padding: 0.42rem 0.65rem;
  vertical-align: top;
}

.apa-table tbody tr:last-child td {
  border-block-end: 2px solid var(--ink-primary);
}

.math-block {
  margin-block: 1rem;
  padding: 0.65rem 0.85rem;
  overflow-x: auto;
  background: var(--bg-subtle);
  border-radius: var(--radius-control);
  text-align: center;
}

math {
  font-size: 1.04em;
}

.print-only-toc {
  display: none;
}

.manual-footer {
  margin-block-start: 2rem;
  padding-block-start: 1rem;
  border-block-start: 1px solid var(--border-subtle);
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0.75rem;
  font-size: 0.84rem;
  color: var(--ink-secondary);
}

@media (max-width: 1023px) {
  .manual-layout {
    grid-template-columns: 1fr;
    padding: 0.85rem;
  }

  .manual-sidebar {
    display: none;
  }

  .mobile-toc {
    display: block;
  }

  .manual-article {
    padding: 1.15rem 1rem;
  }
}

@media (max-width: 639px) {
  .manual-header {
    padding: 0.6rem 0.85rem;
  }

  .btn {
    min-block-size: 44px;
    min-inline-size: 44px;
  }

  .toc-link {
    display: block;
    min-block-size: 44px;
    padding-block: 0.65rem;
  }

  .manual-brand {
    flex: 1 1 100%;
  }

  .manual-header-actions {
    flex: 1 1 100%;
  }
}

@media print {
  body {
    background: #ffffff;
    color: #141b24;
    font-size: 11pt;
  }

  .no-print,
  .manual-sidebar,
  .mobile-toc {
    display: none !important;
  }

  .print-only-toc {
    display: block;
  }

  .manual-layout {
    display: block;
    padding: 0;
  }

  .manual-article {
    border: 0;
    padding: 0;
  }

  .manual-article a {
    color: inherit;
    text-decoration: none;
  }
}`;
}

export function buildUserManualHtml(manualPath = DEFAULT_MANUAL_PATH) {
  const rawMd = fs.readFileSync(manualPath, "utf8");
  const { work, mathStore } = extractPlaceholders(rawMd);

  const usedSlugs = new Map();
  const headings = [];

  const marked = new Marked({ gfm: true, breaks: false });
  const baseRenderer = new marked.Renderer();

  marked.use({
    renderer: {
      heading(token) {
        const inlineHtml = this.parser.parseInline(token.tokens);
        const restoredHtml = restoreMathHtml(inlineHtml, mathStore);
        const rawSource = restoreRawText(token.text, mathStore);
        const baseSlug = githubSlug(rawSource);
        const count = usedSlugs.get(baseSlug) ?? 0;
        usedSlugs.set(baseSlug, count + 1);
        const slug = count === 0 ? baseSlug : `${baseSlug}-${count}`;

        if (token.depth === 2 || token.depth === 3) {
          if (slug !== "daftar-isi") {
            headings.push({
              depth: token.depth,
              id: slug,
              labelHtml: restoredHtml,
            });
          }
        }

        return `<h${token.depth} id="${escapeHtml(slug)}">${restoredHtml}</h${token.depth}>\n`;
      },
      table(token) {
        const tableHtml = baseRenderer.table.call(this, token);
        return `<div class="doc-table-wrap">\n${tableHtml}</div>\n`;
      },
    },
  });

  // Isolate Markdown Table of Contents section for print-only display so screens use the structured sidebar.
  let processedMd = work;
  const tocStart = work.indexOf("## Daftar Isi");
  const chap1Start = work.indexOf("\n## 1.");
  let printTocHtml = "";
  if (tocStart !== -1 && chap1Start > tocStart) {
    const tocBlock = work.slice(tocStart, chap1Start).replace(/\n---\s*$/, "");
    printTocHtml = transformAlerts(restoreMathHtml(marked.parse(tocBlock), mathStore));
    processedMd = work.slice(0, tocStart) + work.slice(chap1Start + 1);
  }

  let bodyHtml = marked.parse(processedMd);
  bodyHtml = restoreMathHtml(bodyHtml, mathStore);
  bodyHtml = transformAlerts(bodyHtml);

  const tocLinksHtml = headings
    .map(
      (h) =>
        `<li><a class="toc-link ${h.depth === 2 ? "is-h2" : "is-h3"}" href="#${escapeHtml(h.id)}">${h.labelHtml}</a></li>`,
    )
    .join("\n");

  const finalArticleHtml = printTocHtml
    ? bodyHtml.replace(
        '<h2 id="1-prasyarat-dan-cara-menjalankan">',
        `<div class="print-only-toc">\n${printTocHtml}</div>\n<h2 id="1-prasyarat-dan-cara-menjalankan">`,
      )
    : bodyHtml;

  return `<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="description" content="Panduan lengkap penggunaan aplikasi Itemetri, fitur analisis butir soal, keterbatasan teknis, dan rumus psikometri CTT." />
    <link rel="icon" type="image/svg+xml" href="${FAVICON_SVG}" />
    <title>Panduan Pengguna Itemetri</title>
    <script>
      try {
        var saved = localStorage.getItem("itemetri-color-scheme");
        if (saved === "light" || saved === "dark") {
          document.querySelector('meta[name="color-scheme"]').content = saved;
        } else if (saved === "system") {
          document.querySelector('meta[name="color-scheme"]').content = "light dark";
        }
      } catch (e) {}
    </script>
    <style>${buildManualCss()}</style>
  </head>
  <body>
    <a href="#manual-content" class="skip-link">Lewati ke isi panduan</a>

    <header class="manual-header no-print">
      <div class="manual-brand">
        ${BRAND_MARK_SVG}
        <span class="manual-brand-title">Itemetri</span>
        <span class="manual-badge">Panduan Pengguna</span>
      </div>
      <div class="manual-header-actions">
        <button type="button" class="btn" id="btn-print-manual">Cetak / PDF</button>
        <button type="button" class="btn" id="btn-toggle-theme" aria-label="Beralih ke tema gelap">Gelap</button>
        <a href="../" class="btn btn-primary" id="back-to-app-link">Buka Aplikasi</a>
      </div>
    </header>

    <div class="manual-layout">
      <aside class="manual-sidebar no-print" aria-label="Daftar Isi Panduan">
        <div class="toc-filter-wrap">
          <label for="toc-search-input">Cari bab atau topik</label>
          <input
            id="toc-search-input"
            type="search"
            class="toc-filter-input"
            placeholder="Misal: KKM, KR-20, impor, uji-t..."
          />
        </div>
        <h2 class="toc-nav-title">Daftar Isi</h2>
        <nav aria-label="Navigasi bab panduan">
          <ul class="toc-list" id="desktop-toc-list">
            ${tocLinksHtml}
          </ul>
          <p class="toc-empty" id="toc-empty-msg" hidden>Tidak ada judul yang cocok.</p>
        </nav>
      </aside>

      <main id="manual-content" tabindex="-1" class="manual-main">
        <details class="mobile-toc no-print">
          <summary>Daftar Isi Panduan</summary>
          <nav aria-label="Navigasi bab panduan mobile" style="margin-block-start: 0.65rem;">
            <ul class="toc-list">
              ${tocLinksHtml}
            </ul>
          </nav>
        </details>

        <article class="manual-article">
          ${finalArticleHtml}
          <footer class="manual-footer no-print">
            <span>Itemetri - Analisis Kualitas Instrumen Evaluasi Pembelajaran</span>
            <a href="#manual-content">Kembali ke atas</a>
          </footer>
        </article>
      </main>
    </div>

    <script>
      (function () {
        var backLink = document.getElementById("back-to-app-link");
        if (backLink) {
          var p = window.location.pathname;
          if (/\\/user_manual(?:\\.html|\\/(?:index\\.html)?)?$/.test(p)) {
            backLink.setAttribute(
              "href",
              p.replace(/\\/user_manual(?:\\.html|\\/(?:index\\.html)?)?$/, "/") || "/"
            );
          }
        }

        var printBtn = document.getElementById("btn-print-manual");
        if (printBtn) {
          printBtn.addEventListener("click", function () {
            window.print();
          });
        }

        var STORAGE_KEY = "itemetri-color-scheme";
        var meta = document.querySelector('meta[name="color-scheme"]');
        var themeBtn = document.getElementById("btn-toggle-theme");

        function getResolvedScheme() {
          var c = meta ? meta.content : "light";
          if (c === "dark") return "dark";
          if (c === "light") return "light";
          return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }

        function syncThemeButton() {
          if (!themeBtn) return;
          var isDark = getResolvedScheme() === "dark";
          themeBtn.textContent = isDark ? "Terang" : "Gelap";
          themeBtn.setAttribute(
            "aria-label",
            isDark ? "Beralih ke tema terang" : "Beralih ke tema gelap"
          );
        }

        syncThemeButton();

        if (themeBtn) {
          themeBtn.addEventListener("click", function () {
            var next = getResolvedScheme() === "dark" ? "light" : "dark";
            if (meta) meta.content = next;
            try {
              localStorage.setItem(STORAGE_KEY, next);
            } catch (e) {}
            syncThemeButton();
          });
        }

        window.addEventListener("storage", function (ev) {
          if (ev.key === STORAGE_KEY && meta) {
            meta.content = ev.newValue === "system" ? "light dark" : ev.newValue || "light";
            syncThemeButton();
          }
        });

        var searchInput = document.getElementById("toc-search-input");
        var tocList = document.getElementById("desktop-toc-list");
        var emptyMsg = document.getElementById("toc-empty-msg");
        if (searchInput && tocList) {
          searchInput.addEventListener("input", function () {
            var q = searchInput.value.trim().toLowerCase();
            var items = tocList.querySelectorAll("li");
            var visible = 0;
            items.forEach(function (li) {
              var text = (li.textContent || "").toLowerCase();
              var match = !q || text.indexOf(q) !== -1;
              li.style.display = match ? "" : "none";
              if (match) visible += 1;
            });
            if (emptyMsg) {
              emptyMsg.hidden = visible > 0;
            }
          });
        }

        var sidebarLinks = Array.prototype.slice.call(
          document.querySelectorAll("#desktop-toc-list .toc-link")
        );
        var headingEls = sidebarLinks
          .map(function (a) {
            var id = (a.getAttribute("href") || "").slice(1);
            return id ? document.getElementById(id) : null;
          })
          .filter(Boolean);

        if ("IntersectionObserver" in window && headingEls.length > 0) {
          var activeId = headingEls[0].id;
          var setActive = function (id) {
            activeId = id;
            sidebarLinks.forEach(function (a) {
              var match = a.getAttribute("href") === "#" + activeId;
              a.classList.toggle("is-active", match);
              if (match) {
                a.setAttribute("aria-current", "location");
              } else {
                a.removeAttribute("aria-current");
              }
            });
          };
          setActive(activeId);

          var observer = new IntersectionObserver(
            function (entries) {
              entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                  setActive(entry.target.id);
                }
              });
            },
            { rootMargin: "-12% 0px -75% 0px", threshold: 0 }
          );
          headingEls.forEach(function (el) {
            observer.observe(el);
          });
        }
      })();
    </script>
  </body>
</html>
`;
}

export function userManualVitePlugin() {
  return {
    name: "itemetri-user-manual",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cleanUrl = (req.url || "").split("?")[0];
        if (
          req.method === "GET" &&
          (cleanUrl === "/user_manual" ||
            cleanUrl === "/user_manual/" ||
            cleanUrl === "/user_manual.html" ||
            cleanUrl === "/user_manual/index.html")
        ) {
          try {
            const html = buildUserManualHtml();
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(html);
            return;
          } catch (err) {
            next(err);
            return;
          }
        }
        next();
      });
    },
    generateBundle() {
      const html = buildUserManualHtml();
      this.emitFile({
        type: "asset",
        fileName: "user_manual/index.html",
        source: html,
      });
      this.emitFile({
        type: "asset",
        fileName: "user_manual.html",
        source: html,
      });
    },
  };
}
