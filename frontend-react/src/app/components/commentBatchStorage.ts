import type { AppStudent, StudentId } from "../state/types";
import { getCurrentWorkspaceScope } from "../state/workspaces";

export interface CommentBatchState {
  queue: StudentId[];
  failed: StudentId[];
  done: number;
  total: number;
  status: "idle" | "running" | "paused" | "failed" | "complete";
  updatedAt: string;
}

export const COMMENT_BATCH_STATE_KEY = "seat-manager-ai-comment-batch-state-v1";
function scopedKey(): string { return `${COMMENT_BATCH_STATE_KEY}:${getCurrentWorkspaceScope()}`; }

export function emptyCommentBatchState(): CommentBatchState {
  return { queue: [], failed: [], done: 0, total: 0, status: "idle", updatedAt: "" };
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

export function loadCommentBatchState(students: AppStudent[]): CommentBatchState {
  if (!hasBrowserStorage()) return emptyCommentBatchState();
  try {
    const validIds = new Set(students.map((student) => student.id));
    const scoped = window.localStorage.getItem(scopedKey());
    const legacy = scoped === null ? window.localStorage.getItem(COMMENT_BATCH_STATE_KEY) : null;
    const raw = JSON.parse(scoped ?? legacy ?? "null") as Partial<CommentBatchState> | null;
    if (legacy !== null) { window.localStorage.setItem(scopedKey(), legacy); window.localStorage.removeItem(COMMENT_BATCH_STATE_KEY); }
    if (!raw || typeof raw !== "object") return emptyCommentBatchState();
    return {
      queue: Array.isArray(raw.queue) ? raw.queue.filter((id) => validIds.has(id)) : [],
      failed: Array.isArray(raw.failed) ? raw.failed.filter((id) => validIds.has(id)) : [],
      done: Number.isFinite(raw.done) ? Math.max(0, Number(raw.done)) : 0,
      total: Number.isFinite(raw.total) ? Math.max(0, Number(raw.total)) : 0,
      status: raw.status === "running" || raw.status === "paused" || raw.status === "failed" || raw.status === "complete" ? raw.status : "idle",
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return emptyCommentBatchState();
  }
}

export function saveCommentBatchState(state: CommentBatchState): void {
  if (!hasBrowserStorage()) return;
  if (!state.queue.length && !state.failed.length && (state.status === "idle" || state.status === "complete")) {
    window.localStorage.removeItem(scopedKey());
    window.localStorage.removeItem(COMMENT_BATCH_STATE_KEY);
    return;
  }
  window.localStorage.setItem(scopedKey(), JSON.stringify(state));
}

export function removeStudentFromCommentBatch(studentId: StudentId): void {
  if (!hasBrowserStorage()) return;
  const raw = window.localStorage.getItem(scopedKey());
  if (!raw) return;
  try {
    const state = JSON.parse(raw) as CommentBatchState;
    saveCommentBatchState({ ...state, queue: (state.queue || []).filter(id => id !== studentId), failed: (state.failed || []).filter(id => id !== studentId), updatedAt: new Date().toISOString() });
  } catch {
    window.localStorage.removeItem(scopedKey());
  }
}
