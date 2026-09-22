export const DEFAULT_FOLLOWUP_TYPES = ["常规跟进", "家校沟通", "行为处理", "学业关注", "出勤关注"];

export function normalizeFollowupTypes(raw: unknown): string[] {
  const values = Array.isArray(raw) ? [...new Set(raw.filter((item): item is string => typeof item === "string").map(item => item.trim()).filter(Boolean))] : [];
  return values.length ? values : [...DEFAULT_FOLLOWUP_TYPES];
}

export function validateFollowupTypes(text: string): { values: string[]; error: string } {
  const values = text.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  const error = !values.length ? "请至少保留一种任务类型。" : values.some(item => item.length > 30) ? "每种类型最多 30 个字。" : new Set(values).size !== values.length ? "类型名称不能重复。" : "";
  return { values, error };
}
