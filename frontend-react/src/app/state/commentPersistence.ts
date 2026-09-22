import { createSeatManagerState } from "./legacyStateAdapter";
import { writeLegacyRootState } from "./storage";
import { getCurrentWorkspaceScope } from "./workspaces";
import type { SeatManagerState } from "./types";

type CommentWrite = { scope: string; student: Record<string, unknown>; previousTags: string[]; rubric: unknown };
const listeners = new Set<(write: CommentWrite) => void>();
export function subscribeStudentCommentWrites(listener: (write: CommentWrite) => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Keep direct comment saves and the controller's pending autosave in agreement.
// Only the explicitly saved comment and its tag delta cross this boundary.
export function writeStudentComment(root: Record<string, unknown>, student: Record<string, unknown>, previousTags: string[] = []) {
  const scope = getCurrentWorkspaceScope();
  if (!writeLegacyRootState(root)) return;
  const write = { scope, student, previousTags, rubric: root.commentRubric };
  listeners.forEach(listener => listener(write));
}

export function applyStudentCommentWrite(current: SeatManagerState, write: CommentWrite): SeatManagerState {
  const afterTags = Array.isArray(write.student.manualTags) ? write.student.manualTags.map(String) : write.previousTags;
  const added = afterTags.filter(id => !write.previousTags.includes(id));
  const removed = new Set(write.previousTags.filter(id => !afterTags.includes(id)));
  return { ...current, students: current.students.map(student => {
    if (student.id !== String(write.student.id)) return student;
    const manualTagIds = [...new Set([...student.manualTagIds.filter(id => !removed.has(id)), ...added])];
    const normalized = added.length || removed.size ? createSeatManagerState({ students: [{ id: student.id, name: student.name, manualTags: manualTagIds, autoTags: student.autoTagIds }], commentRubric: write.rubric }).students[0] : student;
    return { ...student, aiComments: write.student.aiComments, manualTagIds, tags: normalized.tags, academicTags: normalized.academicTags };
  }) };
}
