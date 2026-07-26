import { DORM_EVENT_PRESETS } from "./dormitoryActions";

export interface DormitoryPreferences {
  version: 1;
  presets: Array<{ label: string }>;
  scoreMemory: Record<string, number>;
}

const DEFAULT_PREFERENCES: DormitoryPreferences = {
  version: 1,
  presets: DORM_EVENT_PRESETS.map(preset => ({ label: preset.label })),
  scoreMemory: {},
};

function normalizePresets(value: unknown): Array<{ label: string }> {
  if (!Array.isArray(value)) return [];
  const labels = value
    .map(item => typeof item === "string" ? item : item && typeof item === "object" && "label" in item ? String(item.label) : "")
    .map(label => label.trim())
    .filter(Boolean);
  return Array.from(new Set(labels)).map(label => ({ label }));
}

function normalizeScoreMemory(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce<Record<string, number>>((result, [label, score]) => {
    const normalizedLabel = label.trim();
    if (normalizedLabel && typeof score === "number" && Number.isFinite(score)) result[normalizedLabel] = score;
    return result;
  }, {});
}

export function normalizeDormitoryPreferences(value: unknown): DormitoryPreferences {
  if (!value || typeof value !== "object") return DEFAULT_PREFERENCES;
  const raw = value as Record<string, unknown>;
  const presets = normalizePresets(raw.presets);
  return {
    version: 1,
    presets: presets.length ? presets : DEFAULT_PREFERENCES.presets,
    scoreMemory: normalizeScoreMemory(raw.scoreMemory),
  };
}

export function readLegacyDormitoryPreferences(storage: Pick<Storage, "getItem"> | null): DormitoryPreferences | null {
  if (!storage) return null;
  try {
    const presets = normalizePresets(JSON.parse(storage.getItem("dorm-presets") || "null"));
    const scoreMemory = normalizeScoreMemory(JSON.parse(storage.getItem("dorm-score-memory") || "null"));
    if (!presets.length && !Object.keys(scoreMemory).length) return null;
    return {
      version: 1,
      presets: presets.length ? presets : DEFAULT_PREFERENCES.presets,
      scoreMemory,
    };
  } catch {
    return null;
  }
}

export function resolveDormitoryPreferences(value: unknown, storage: Pick<Storage, "getItem"> | null): DormitoryPreferences {
  if (value && typeof value === "object") return normalizeDormitoryPreferences(value);
  return readLegacyDormitoryPreferences(storage) || DEFAULT_PREFERENCES;
}
