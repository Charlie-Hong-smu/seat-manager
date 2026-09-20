export function parseScoreNumber(value: unknown): number | null {
  const text = String(value ?? "").trim().replace(/,/g, "");
  if (!text || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return null;
  const score = Number(text);
  return Number.isFinite(score) ? score : null;
}

export function isMissingScore(value: unknown): boolean {
  return /^(?:缺考|缺席|未考|免考|缓考|缺测|无|[-—–/]|n\/?a|null)?$/i.test(String(value ?? "").trim());
}
