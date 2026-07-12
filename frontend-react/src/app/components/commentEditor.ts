import type {
  CommentCriterion,
  CommentLengthMode,
  CommentStyle,
  StudentCommentDraft,
  StudentCommentProfile,
} from "../state/types";
import { summarizeCommentProfile } from "../state/commentRubricStorage";
import type { CommentRubric } from "../state/types";

export const COMMENT_LENGTH_MODES: Array<{ value: CommentLengthMode; label: string }> = [
  { value: "short", label: "80～100" },
  { value: "standard", label: "100～150" },
  { value: "long", label: "150～200" },
  { value: "custom", label: "自定义" },
];

export const COMMENT_STYLES: Array<{ value: CommentStyle; label: string }> = [
  { value: "warm", label: "温和鼓励" },
  { value: "formal", label: "客观正式" },
  { value: "brief", label: "简洁家长会" },
];

export function clampCommentWordCount(value: unknown): number {
  const parsed = Number(value);
  return Math.min(999, Math.max(10, Math.round(Number.isFinite(parsed) ? parsed : 120)));
}

export function resolveCommentWordCount(mode: CommentLengthMode, customWordCount: number): number {
  if (mode === "short") return 90;
  if (mode === "long") return 175;
  if (mode === "custom") return clampCommentWordCount(customWordCount);
  return 125;
}

export function makeCommentItemId(value: string, fallback = "item"): string {
  const safe = value.trim().toLowerCase().replace(/[^a-z0-9_\u4e00-\u9fa5]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 32);
  return safe || `${fallback}_${Date.now().toString(36)}`;
}

export function toggleCommentCriterion(profile: StudentCommentProfile, criterion: CommentCriterion, optionId: string): StudentCommentProfile {
  const selected = new Set(profile.criteriaValues[criterion.id] || []);
  if (selected.has(optionId)) selected.delete(optionId);
  else {
    if (criterion.type === "single") selected.clear();
    selected.add(optionId);
  }
  return {
    ...profile,
    criteriaValues: { ...profile.criteriaValues, [criterion.id]: [...selected] },
    status: profile.generatedComment ? "edited" : "draft",
    updatedAt: new Date().toISOString(),
  };
}

export function addCommentCustomOption(profile: StudentCommentProfile, criterion: CommentCriterion, rawLabel: string): StudentCommentProfile {
  const label = rawLabel.trim();
  if (!label) return profile;
  const id = makeCommentItemId(label, "custom");
  const existing = profile.customOptions[criterion.id] || [];
  if (existing.some(option => option.id === id || option.label === label)) return profile;
  return {
    ...profile,
    customOptions: {
      ...profile.customOptions,
      [criterion.id]: [...existing, {
        id,
        label,
        linkedTagId: criterion.syncToTags && label.length <= 6 ? `comment_${criterion.id}_custom_${id}` : "",
        builtIn: false,
      }],
    },
    status: profile.generatedComment ? "edited" : "draft",
    updatedAt: new Date().toISOString(),
  };
}

export function removeCommentCustomOption(profile: StudentCommentProfile, criterionId: string, optionId: string): StudentCommentProfile {
  return {
    ...profile,
    customOptions: {
      ...profile.customOptions,
      [criterionId]: (profile.customOptions[criterionId] || []).filter(option => option.id !== optionId),
    },
    status: profile.generatedComment ? "edited" : "draft",
    updatedAt: new Date().toISOString(),
  };
}

export function buildStudentCommentDraft(
  rubric: CommentRubric,
  profile: StudentCommentProfile,
  generatedComment: string,
): StudentCommentDraft {
  const summary = summarizeCommentProfile(rubric, profile);
  return {
    generatedComment,
    teacherNote: profile.teacherNote,
    style: profile.style,
    lengthMode: profile.lengthMode,
    targetWordCount: resolveCommentWordCount(profile.lengthMode, profile.targetWordCount),
    updatedAt: new Date().toISOString(),
    criteriaSummary: summary.criteriaSummary,
    customOptions: summary.customOptions,
  };
}
