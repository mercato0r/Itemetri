export function validateMcCell(char: string, optionCount: number): string | null {
  const upper = char.toUpperCase();
  if (upper === "*" || upper === "#") return null;
  const maxChar = String.fromCharCode(64 + optionCount);
  if (upper.length === 1 && upper >= "A" && upper <= maxChar) {
    return null;
  }
  return `Huruf ${char} di luar opsi A..${maxChar} atau blank (*, #).`;
}

export function validateEssayCell(score: number | null, ideal: number): string | null {
  if (score === null) return null;
  if (!Number.isFinite(score) || score < 0) {
    return "Skor harus bernilai >= 0.";
  }
  if (score > ideal) {
    return `Skor ${score} melebihi skor ideal (${ideal}).`;
  }
  return null;
}
