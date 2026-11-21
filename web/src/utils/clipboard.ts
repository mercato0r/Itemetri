export function parseTsvBlock(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.map((line) => line.split("\t").map((cell) => cell.trim()));
}

export function normalizeMcCell(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "*";
  if (trimmed.length === 1) return trimmed;
  return null;
}

export function parseEssayCell(raw: string): { valid: boolean; value: number | null } {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "*" || trimmed === "#") {
    return { valid: true, value: null };
  }
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0) {
    return { valid: false, value: null };
  }
  return { valid: true, value: num };
}
