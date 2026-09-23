import type { FollowupTask, StudentId } from "./types";

type StudentSelection = { studentId?: StudentId; studentIds?: StudentId[] };
type FollowupScope = Pick<FollowupTask, "studentMode"> & Partial<Pick<FollowupTask, "source" | "sourceRef">>;

export function getFollowupStudentIds(value: StudentSelection): StudentId[] {
  return Array.from(new Set((Array.isArray(value.studentIds) ? value.studentIds : value.studentId ? [value.studentId] : [])
    .filter((id): id is string => typeof id === "string" && Boolean(id.trim()))));
}

export function followupHasStudent(task: StudentSelection, studentId: StudentId): boolean {
  return getFollowupStudentIds(task).includes(studentId);
}

export function isIndividualFollowup(value: FollowupScope): boolean {
  // These sources have a separate outcome for each student, regardless of caller defaults.
  return ["homework", "score", "attendance", "ai"].includes(value.sourceRef?.domain || value.source || "")
    || value.studentMode === "individual";
}

export function followupStudentLabel(task: StudentSelection, names: ReadonlyMap<StudentId, string>): string {
  const ids = getFollowupStudentIds(task);
  return ids.length ? ids.map(id => names.get(id) || "未知学生").join("、") : "班级事项";
}

export interface FollowupTaskGroup { key: string; members: FollowupTask[] }

/** Group individual outcomes of the same matter for display, without merging stored tasks. */
export function followupGroupKey(task: FollowupTask): string | null {
  if (!isIndividualFollowup(task) || getFollowupStudentIds(task).length !== 1 || task.continuedFromTaskId) return null;
  const domain = task.sourceRef?.domain;
  if (domain === "ai" || (!task.sourceRef && task.studentMode !== "individual")) return null;
  const source = task.sourceRef
    ? [domain, task.sourceRef.entityId, task.sourceRef.subEntityId || ""]
    : [task.source, "manual-individual"];
  return JSON.stringify([...source, task.title, task.type, task.description, task.sourceRef ? "" : task.plannedDate, task.dueDate]);
}

export function groupFollowupTasks(tasks: FollowupTask[]): FollowupTaskGroup[] {
  const groups: FollowupTaskGroup[] = [];
  const byKey = new Map<string, FollowupTaskGroup>();
  tasks.forEach(task => {
    const key = followupGroupKey(task) || task.id;
    const existing = byKey.get(key);
    if (existing) existing.members.push(task);
    else { const group = { key, members: [task] }; byKey.set(key, group); groups.push(group); }
  });
  return groups;
}

export function removeStudentFromFollowups(tasks: FollowupTask[], studentId: StudentId): FollowupTask[] {
  return tasks.flatMap(task => {
    const ids = getFollowupStudentIds(task);
    if (!ids.includes(studentId)) return [task];
    const studentIds = ids.filter(id => id !== studentId);
    if (!studentIds.length) return [];
    return [{ ...task, studentIds, studentId: studentIds[0], sourceRef: task.sourceRef?.studentId === studentId ? { ...task.sourceRef, studentId: undefined } : task.sourceRef }];
  });
}
