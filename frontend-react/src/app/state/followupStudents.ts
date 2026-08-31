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

export function removeStudentFromFollowups(tasks: FollowupTask[], studentId: StudentId): FollowupTask[] {
  return tasks.flatMap(task => {
    const ids = getFollowupStudentIds(task);
    if (!ids.includes(studentId)) return [task];
    const studentIds = ids.filter(id => id !== studentId);
    if (!studentIds.length) return [];
    return [{ ...task, studentIds, studentId: studentIds[0], sourceRef: task.sourceRef?.studentId === studentId ? { ...task.sourceRef, studentId: undefined } : task.sourceRef }];
  });
}
