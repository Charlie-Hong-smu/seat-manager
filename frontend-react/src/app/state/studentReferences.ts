import type { AppStudent, StudentId } from "./types";

export function resolveReferencedStudentNames({
  students,
  studentIds,
  studentId,
  snapshotNames,
  snapshotName,
}: {
  students: AppStudent[];
  studentIds?: StudentId[];
  studentId?: StudentId;
  snapshotNames?: string[];
  snapshotName?: string;
}): string[] {
  const ids = studentIds?.length ? studentIds : studentId ? [studentId] : [];
  const namesById = new Map(students.map(student => [student.id, student.name]));
  const fallbackNames = snapshotNames?.length ? snapshotNames : snapshotName ? [snapshotName] : [];
  if (!ids.length) return fallbackNames.filter(Boolean);
  return ids
    .map((id, index) => namesById.get(id) || fallbackNames[index] || "")
    .filter(Boolean);
}
