import type { AppStudent, CommentLengthMode, CommentStyle, StudentCommentDraft, StudentId } from "./types";
import { readLegacyRootState, writeLegacyRootState } from "./storage";

const AI_COMMENT_DRAFT_KEY_PREFIX = "seat-manager-ai-comment-draft";
const DEFAULT_LENGTH_MODE: CommentLengthMode = "standard";
const DEFAULT_TARGET_WORD_COUNT = 120;
const VALID_STYLES = new Set<CommentStyle>(["warm", "formal", "brief"]);
const VALID_LENGTH_MODES = new Set<CommentLengthMode>(["short", "standard", "long", "custom"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getStudentCommentCacheKey(studentId: StudentId): string {
  return `${AI_COMMENT_DRAFT_KEY_PREFIX}:${studentId || "unknown"}`;
}

function normalizeLengthMode(value: unknown): CommentLengthMode {
  return typeof value === "string" && VALID_LENGTH_MODES.has(value as CommentLengthMode)
    ? value as CommentLengthMode
    : DEFAULT_LENGTH_MODE;
}

function normalizeStyle(value: unknown): CommentStyle {
  return typeof value === "string" && VALID_STYLES.has(value as CommentStyle) ? value as CommentStyle : "warm";
}

function normalizeTargetWordCount(value: unknown): number {
  const parsed = Number(value);
  return Math.min(300, Math.max(50, Math.round(Number.isFinite(parsed) ? parsed : DEFAULT_TARGET_WORD_COUNT)));
}

export function normalizeStudentCommentDraft(value: unknown): StudentCommentDraft | null {
  if (!isRecord(value)) {
    return null;
  }

  const generatedComment = String(value.generatedComment || value.text || "").trim();
  const teacherNote = String(value.teacherNote || "");
  const lengthMode = normalizeLengthMode(value.lengthMode || value.commentLengthMode);

  return {
    generatedComment,
    teacherNote,
    style: normalizeStyle(value.style),
    lengthMode,
    targetWordCount: normalizeTargetWordCount(value.targetWordCount),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  };
}

function getDraftFromStudent(student: AppStudent): StudentCommentDraft | null {
  if (!isRecord(student.aiComments)) {
    return null;
  }

  const profile = isRecord(student.aiComments.profile) ? normalizeStudentCommentDraft(student.aiComments.profile) : null;
  const draft = normalizeStudentCommentDraft(student.aiComments.draft);
  const latest = normalizeStudentCommentDraft(student.aiComments.latest);
  return profile || draft || latest;
}

function getDraftFromBrowserStorage(studentId: StudentId): StudentCommentDraft | null {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      return normalizeStudentCommentDraft(JSON.parse(window.localStorage.getItem(getStudentCommentCacheKey(studentId)) || "null"));
    } catch {
      return null;
    }
  }
  return null;
}

function isNewerDraft(candidate: StudentCommentDraft | null, current: StudentCommentDraft | null): boolean {
  if (!candidate) {
    return false;
  }
  if (!current) {
    return true;
  }
  return Date.parse(candidate.updatedAt || "") > Date.parse(current.updatedAt || "");
}

function saveDraftToLegacyStudent(studentId: StudentId, draft: StudentCommentDraft): void {
  const root = readLegacyRootState();
  if (!root || typeof root !== "object" || !Array.isArray((root as { students?: unknown }).students)) {
    return;
  }

  const nextRoot = root as { students: Array<Record<string, unknown>> };
  const student = nextRoot.students.find(item => String(item.id || "") === studentId);
  if (!student) {
    return;
  }

  const aiComments = student.aiComments && typeof student.aiComments === "object" && !Array.isArray(student.aiComments)
    ? student.aiComments as Record<string, unknown>
    : {};
  const profile = aiComments.profile && typeof aiComments.profile === "object" && !Array.isArray(aiComments.profile)
    ? aiComments.profile as Record<string, unknown>
    : {};

  aiComments.draft = draft;
  aiComments.profile = {
    ...profile,
    generatedComment: draft.generatedComment,
    teacherNote: draft.teacherNote,
    style: draft.style,
    lengthMode: draft.lengthMode,
    targetWordCount: draft.targetWordCount,
    status: draft.generatedComment ? "generated" : profile.status || "draft",
    updatedAt: draft.updatedAt,
  };
  student.aiComments = aiComments;
  writeLegacyRootState(nextRoot);
}

export function readStudentCommentDraft(student: AppStudent): StudentCommentDraft {
  const fromStudent = getDraftFromStudent(student);
  const fromStorage = getDraftFromBrowserStorage(student.id);
  if (isNewerDraft(fromStorage, fromStudent)) {
    return fromStorage as StudentCommentDraft;
  }
  if (fromStudent) {
    return fromStudent;
  }
  if (fromStorage) {
    return fromStorage;
  }

  return {
    generatedComment: "",
    teacherNote: "",
    style: "warm",
    lengthMode: DEFAULT_LENGTH_MODE,
    targetWordCount: DEFAULT_TARGET_WORD_COUNT,
    updatedAt: "",
  };
}

export function saveStudentCommentDraft(studentId: StudentId, draft: StudentCommentDraft): StudentCommentDraft {
  const next = {
    ...draft,
    updatedAt: draft.updatedAt || new Date().toISOString(),
  };

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(getStudentCommentCacheKey(studentId), JSON.stringify(next));
    } catch {
      // Keep the React draft even when browser storage is unavailable.
    }
  }
  saveDraftToLegacyStudent(studentId, next);

  return next;
}
