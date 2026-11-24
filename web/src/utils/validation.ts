export function validateMcCell(char: string, optionCount: number): string | null {
  const upper = char.trim().toUpperCase();
  if (upper === "" || upper === "*" || upper === "#") return null;
  const maxChar = String.fromCharCode(64 + optionCount);
  if (upper.length === 1 && upper >= "A" && upper <= maxChar) {
    return null;
  }
  return `Isian '${char}' di luar pilihan A sampai ${maxChar}. Gunakan huruf A-${maxChar} atau kosongkan jika peserta tidak menjawab.`;
}

export function validateEssayCell(score: number | null, ideal: number): string | null {
  if (score === null) return null;
  if (!Number.isFinite(score) || score < 0) {
    return "Skor tidak boleh negatif (minimal 0).";
  }
  if (score > ideal) {
    return `Skor ${score} melebihi Skor Ideal butir ini (${ideal}). Periksa kembali skor peserta atau sesuaikan Skor Ideal.`;
  }
  return null;
}
