import { readLegacyRootState, writeLegacyRootState } from "./storage";
import type {
  AppStudent,
  CommentCriteriaSummary,
  CommentCriterion,
  CommentCriterionOption,
  CommentCustomOptionSummary,
  CommentLengthMode,
  CommentRubric,
  CommentStyle,
  StudentCommentProfile,
  StudentId,
} from "./types";

const DEFAULT_TARGET_WORD_COUNT = 120;
const VALID_STYLES = new Set<CommentStyle>(["warm", "formal", "brief"]);
const VALID_LENGTH_MODES = new Set<CommentLengthMode>(["short", "standard", "long", "custom"]);
const VALID_STATUSES = new Set(["pending", "ready", "needsInfo", "generating", "generated", "edited", "failed", "skipped", "draft"]);

export const DEFAULT_COMMENT_RUBRIC: CommentRubric = {
  version: 1,
  criteria: [
    {
      id: "personality",
      label: "性格特点",
      type: "multi",
      syncToTags: true,
      hidden: false,
      builtIn: true,
      options: [
        { id: "steady", label: "稳重踏实", linkedTagId: "comment_personality_steady", builtIn: true },
        { id: "cheerful", label: "开朗大方", linkedTagId: "comment_personality_cheerful", builtIn: true },
        { id: "cooperative", label: "乐于合作", linkedTagId: "supporter", builtIn: true },
        { id: "quiet", label: "较为内敛", linkedTagId: "quiet", builtIn: true },
      ],
    },
    {
      id: "study_attitude",
      label: "学习态度",
      type: "multi",
      syncToTags: true,
      hidden: false,
      builtIn: true,
      options: [
        { id: "serious", label: "学习认真", linkedTagId: "comment_attitude_serious", builtIn: true },
        { id: "active", label: "主动性较强", linkedTagId: "leader", builtIn: true },
        { id: "stable", label: "状态稳定", linkedTagId: "comment_attitude_stable", builtIn: true },
        { id: "needs_initiative", label: "需要加强主动性", linkedTagId: "comment_attitude_needs_initiative", builtIn: true },
      ],
    },
    {
      id: "classroom",
      label: "课堂表现",
      type: "multi",
      syncToTags: true,
      hidden: false,
      builtIn: true,
      options: [
        { id: "focused", label: "课堂专注", linkedTagId: "focused", builtIn: true },
        { id: "participates", label: "积极参与", linkedTagId: "comment_classroom_participates", builtIn: true },
        { id: "answers", label: "回答问题积极", linkedTagId: "comment_classroom_answers", builtIn: true },
        { id: "distracted", label: "课堂专注需加强", linkedTagId: "distractible", builtIn: true },
      ],
    },
    {
      id: "homework",
      label: "作业情况",
      type: "multi",
      syncToTags: true,
      hidden: false,
      builtIn: true,
      options: [
        { id: "steady", label: "作业稳定", linkedTagId: "comment_homework_steady", builtIn: true },
        { id: "careful", label: "书写认真", linkedTagId: "comment_homework_careful", builtIn: true },
        { id: "delay", label: "偶有拖交", linkedTagId: "comment_homework_delay", builtIn: true },
        { id: "quality", label: "质量需提升", linkedTagId: "comment_homework_quality", builtIn: true },
      ],
    },
    {
      id: "score_performance",
      label: "成绩表现",
      type: "multi",
      syncToTags: true,
      hidden: false,
      builtIn: true,
      options: [
        { id: "excellent", label: "成绩优秀", linkedTagId: "comment_score_excellent", builtIn: true },
        { id: "progress", label: "进步明显", linkedTagId: "comment_score_progress", builtIn: true },
        { id: "stable", label: "成绩稳定", linkedTagId: "comment_score_stable", builtIn: true },
        { id: "foundation", label: "基础薄弱", linkedTagId: "comment_score_foundation", builtIn: true },
      ],
    },
    {
      id: "strengths",
      label: "主要优点",
      type: "multi",
      syncToTags: false,
      hidden: false,
      builtIn: true,
      options: [
        { id: "responsible", label: "责任心较强", linkedTagId: "", builtIn: true },
        { id: "thinking", label: "思维较活跃", linkedTagId: "", builtIn: true },
        { id: "self_discipline", label: "自律意识较好", linkedTagId: "", builtIn: true },
        { id: "helpful", label: "乐于帮助同学", linkedTagId: "", builtIn: true },
      ],
    },
    {
      id: "improvements",
      label: "待改进点",
      type: "multi",
      syncToTags: false,
      hidden: false,
      builtIn: true,
      options: [
        { id: "vocabulary", label: "英语词汇需加强", linkedTagId: "", builtIn: true },
        { id: "math_accuracy", label: "数学审题需细致", linkedTagId: "", builtIn: true },
        { id: "review", label: "复习计划需更稳定", linkedTagId: "", builtIn: true },
        { id: "confidence", label: "表达自信可提升", linkedTagId: "", builtIn: true },
      ],
    },
    {
      id: "suggestions",
      label: "期末建议",
      type: "multi",
      syncToTags: false,
      hidden: false,
      builtIn: true,
      options: [
        { id: "keep_rhythm", label: "保持学习节奏", linkedTagId: "", builtIn: true },
        { id: "strengthen_basics", label: "夯实基础知识", linkedTagId: "", builtIn: true },
        { id: "ask_more", label: "多主动提问", linkedTagId: "", builtIn: true },
        { id: "summarize_errors", label: "重视错题复盘", linkedTagId: "", builtIn: true },
      ],
    },
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeId(value: unknown, fallback = "item"): string {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\u4e00-\u9fa5]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return text || `${fallback}_${Date.now().toString(36)}`;
}

function normalizeOption(value: unknown, index: number, base?: CommentCriterionOption): CommentCriterionOption {
  const raw = isRecord(value) ? value : {};
  const id = safeId(raw.id || raw.label || raw.labelZh || base?.id || `option_${index}`, `option_${index}`);
  return {
    id,
    label: String(raw.label || raw.labelZh || base?.label || id).trim(),
    linkedTagId: String(raw.linkedTagId || base?.linkedTagId || ""),
    builtIn: Boolean(base?.builtIn || raw.builtIn),
  };
}

export function normalizeCommentRubric(value: unknown): CommentRubric {
  const defaults = DEFAULT_COMMENT_RUBRIC;
  const rawCriteria = isRecord(value) && Array.isArray(value.criteria) ? value.criteria : [];
  const byId = new Map<string, CommentCriterion>();

  defaults.criteria.forEach(criterion => {
    byId.set(criterion.id, {
      ...criterion,
      options: criterion.options.map(option => ({ ...option })),
    });
  });

  rawCriteria.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    const id = safeId(item.id || item.label || `criterion_${index}`, `criterion_${index}`);
    const base = byId.get(id);
    const optionById = new Map<string, CommentCriterionOption>();
    (base?.options || []).forEach(option => optionById.set(option.id, { ...option, builtIn: true }));
    if (Array.isArray(item.options)) {
      item.options.forEach((option, optionIndex) => {
        const normalized = normalizeOption(option, optionIndex, optionById.get(String(isRecord(option) ? option.id || "" : "")));
        if (normalized.label) {
          optionById.set(normalized.id, normalized);
        }
      });
    }
    byId.set(id, {
      id,
      label: String(item.label || base?.label || id).trim(),
      type: item.type === "single" ? "single" : "multi",
      syncToTags: item.syncToTags === undefined ? Boolean(base?.syncToTags) : Boolean(item.syncToTags),
      hidden: Boolean(item.hidden),
      builtIn: Boolean(base?.builtIn || item.builtIn),
      options: [...optionById.values()].filter(option => option.label),
    });
  });

  return {
    version: 1,
    criteria: [...byId.values()].filter(criterion => criterion.label),
  };
}

export function readCommentRubric(): CommentRubric {
  const root = readLegacyRootState();
  return normalizeCommentRubric(isRecord(root) ? root.commentRubric : null);
}

export function saveCommentRubric(rubric: CommentRubric): CommentRubric {
  const root = readLegacyRootState();
  const nextRoot = isRecord(root) ? root : {};
  const normalized = normalizeCommentRubric(rubric);
  writeLegacyRootState({ ...nextRoot, commentRubric: normalized });
  return normalized;
}

function normalizeTargetWordCount(value: unknown): number {
  const parsed = Number(value);
  return Math.min(300, Math.max(50, Math.round(Number.isFinite(parsed) ? parsed : DEFAULT_TARGET_WORD_COUNT)));
}

function normalizeProfile(value: unknown): StudentCommentProfile {
  const raw = isRecord(value) ? value : {};
  const criteriaValues: Record<string, string[]> = {};
  const customOptions: Record<string, CommentCriterionOption[]> = {};

  if (isRecord(raw.criteriaValues)) {
    Object.entries(raw.criteriaValues).forEach(([criterionId, ids]) => {
      criteriaValues[criterionId] = (Array.isArray(ids) ? ids : ids ? [ids] : [])
        .map(id => safeId(id, "option"))
        .filter(Boolean);
    });
  }
  if (isRecord(raw.customOptions)) {
    Object.entries(raw.customOptions).forEach(([criterionId, items]) => {
      customOptions[criterionId] = (Array.isArray(items) ? items : [])
        .map((item, index) => ({ ...normalizeOption(item, index), builtIn: false }))
        .filter(item => item.label);
    });
  }

  const lengthMode = typeof raw.lengthMode === "string" && VALID_LENGTH_MODES.has(raw.lengthMode as CommentLengthMode)
    ? raw.lengthMode as CommentLengthMode
    : "standard";
  const style = typeof raw.style === "string" && VALID_STYLES.has(raw.style as CommentStyle)
    ? raw.style as CommentStyle
    : "warm";

  return {
    criteriaValues,
    customOptions,
    teacherNote: String(raw.teacherNote || ""),
    style,
    lengthMode,
    targetWordCount: normalizeTargetWordCount(raw.targetWordCount),
    generatedComment: String(raw.generatedComment || raw.text || ""),
    status: typeof raw.status === "string" && VALID_STATUSES.has(raw.status) ? raw.status : "draft",
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
  };
}

export function readStudentCommentProfile(student: AppStudent): StudentCommentProfile {
  const aiComments = isRecord(student.aiComments) ? student.aiComments : {};
  const draft = isRecord(aiComments.draft) ? aiComments.draft : {};
  const rawProfile = isRecord(aiComments.profile) ? aiComments.profile : {};
  return normalizeProfile({ ...draft, ...rawProfile });
}

export function summarizeCommentProfile(rubric: CommentRubric, profile: StudentCommentProfile): {
  criteriaSummary: CommentCriteriaSummary[];
  customOptions: CommentCustomOptionSummary[];
} {
  const criteriaSummary: CommentCriteriaSummary[] = [];
  const customOptions: CommentCustomOptionSummary[] = [];

  rubric.criteria.forEach(criterion => {
    if (criterion.hidden) {
      return;
    }
    const labels: string[] = [];
    const selected = new Set(profile.criteriaValues[criterion.id] || []);
    criterion.options.forEach(option => {
      if (selected.has(option.id)) {
        labels.push(option.label);
      }
    });
    (profile.customOptions[criterion.id] || []).forEach(option => {
      labels.push(option.label);
      customOptions.push({ criterionId: criterion.id, criterionLabel: criterion.label, label: option.label });
    });
    if (labels.length) {
      criteriaSummary.push({ criterionId: criterion.id, label: criterion.label, values: labels });
    }
  });

  return { criteriaSummary, customOptions };
}

function getManagedCommentTagIds(rubric: CommentRubric, profile: StudentCommentProfile): Set<string> {
  const ids = new Set<string>();
  rubric.criteria.forEach(criterion => {
    if (!criterion.syncToTags) {
      return;
    }
    criterion.options.forEach(option => {
      if (option.linkedTagId?.startsWith("comment_")) {
        ids.add(option.linkedTagId);
      }
    });
    (profile.customOptions[criterion.id] || []).forEach(option => {
      if (option.linkedTagId?.startsWith("comment_")) {
        ids.add(option.linkedTagId);
      }
    });
  });
  return ids;
}

function syncProfileTags(student: Record<string, unknown>, rubric: CommentRubric, profile: StudentCommentProfile): void {
  const managedTagIds = getManagedCommentTagIds(rubric, profile);
  const manualTags = Array.isArray(student.manualTags) ? student.manualTags.map(String).filter(Boolean) : [];
  const nextTags = manualTags.filter(id => !managedTagIds.has(id));

  rubric.criteria.forEach(criterion => {
    if (!criterion.syncToTags) {
      return;
    }
    const selected = new Set(profile.criteriaValues[criterion.id] || []);
    criterion.options.forEach(option => {
      if (selected.has(option.id) && option.linkedTagId) {
        nextTags.push(option.linkedTagId);
      }
    });
    (profile.customOptions[criterion.id] || []).forEach(option => {
      if (option.linkedTagId) {
        nextTags.push(option.linkedTagId);
      }
    });
  });
  student.manualTags = Array.from(new Set(nextTags));
}

export function saveStudentCommentProfile(studentId: StudentId, rubric: CommentRubric, profile: StudentCommentProfile): StudentCommentProfile {
  const root = readLegacyRootState();
  if (!isRecord(root) || !Array.isArray(root.students)) {
    return profile;
  }
  const student = root.students.find(item => isRecord(item) && String(item.id || "") === studentId);
  if (!isRecord(student)) {
    return profile;
  }
  const aiComments = isRecord(student.aiComments) ? student.aiComments : {};
  const previous = isRecord(aiComments.profile) ? aiComments.profile : {};
  const nextProfile = {
    ...previous,
    ...profile,
    updatedAt: new Date().toISOString(),
  };
  aiComments.profile = nextProfile;
  student.aiComments = aiComments;
  syncProfileTags(student, rubric, nextProfile);
  writeLegacyRootState(root);
  return nextProfile;
}
