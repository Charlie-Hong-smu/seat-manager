import type { AppStudent } from "./types";

export function normalizeStudentSearch(value: string): string {
  return value.trim().toLocaleLowerCase("zh-Hans-CN").replace(/\s+/g, "");
}

export function matchesStudentSearch(student: Pick<AppStudent, "name" | "aliases">, query: string): boolean {
  const normalizedQuery = normalizeStudentSearch(query);
  if (!normalizedQuery) return true;
  return [student.name, ...student.aliases]
    .some(name => normalizeStudentSearch(name).includes(normalizedQuery));
}
