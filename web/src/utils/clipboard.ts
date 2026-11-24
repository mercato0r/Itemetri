export function parseTsvBlock(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.map((line) => line.split("\t").map((cell) => cell.trim()));
}

export function parseLocalizedNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = /^[+-]?\d+,\d+$/.test(trimmed)
    ? trimmed.replace(",", ".")
    : trimmed;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

export function parseLocalizedNumberList(raw: string): {
  valid: boolean;
  values: number[];
  invalidToken?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { valid: true, values: [] };
  const tokens = /^[+-]?\d+(?:,\d+){2,}$/.test(trimmed)
    ? trimmed.split(",")
    : trimmed.split(/[\s;]+|,\s+/);
  const values: number[] = [];
  for (const rawTok of tokens) {
    const tok = rawTok.trim();
    if (!tok) continue;
    const num = parseLocalizedNumber(tok);
    if (num === null) {
      return { valid: false, values: [], invalidToken: tok };
    }
    values.push(num);
  }
  return { valid: true, values };
}

export function normalizeMcCell(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "*";
  if (trimmed.length === 1) {
    return /^[a-z]$/.test(trimmed) ? trimmed.toUpperCase() : trimmed;
  }
  return null;
}

export function parseEssayCell(raw: string): { valid: boolean; value: number | null } {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "*" || trimmed === "#") {
    return { valid: true, value: null };
  }
  const num = parseLocalizedNumber(trimmed);
  if (num === null || num < 0) {
    return { valid: false, value: null };
  }
  return { valid: true, value: num };
}
