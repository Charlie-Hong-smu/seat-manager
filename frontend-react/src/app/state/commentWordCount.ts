// Keep editable targets compatible with the Worker comment contract (50–300).
export const COMMENT_WORD_COUNT_MIN = 50;
export const COMMENT_WORD_COUNT_MAX = 300;
export function clampCommentWordCount(value: unknown): number {
  const parsed = Number(value);
  return Math.min(COMMENT_WORD_COUNT_MAX, Math.max(COMMENT_WORD_COUNT_MIN, Math.round(Number.isFinite(parsed) ? parsed : 120)));
}
