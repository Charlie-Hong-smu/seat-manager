import { normalizeStudentSearch } from "./studentSearch";

export interface StudentIdentity {
  id: string;
  name: string;
  studentNo?: string;
  aliases?: string[];
  enrollmentStatus?: "active" | "archived";
}

export interface StudentReference {
  studentId?: string;
  studentNo?: string;
  name: string;
}

export function normalizeStudentNo(value: unknown): string {
  return String(value ?? "").trim().toLocaleLowerCase("zh-Hans-CN").replace(/\s+/g, "");
}

export function normalizeStudentName(value: unknown): string {
  return normalizeStudentSearch(String(value ?? "").replace(/\u3000/g, " ").replace(/[()（）][^()（）]*[()（）]/g, "").replace(/(同学|学生)$/g, ""));
}

/** 姓名不能跨过明确不同的学号；多个候选始终交由导入入口提示核对。 */
export function findStudentCandidates<T extends StudentIdentity>(students: T[], reference: StudentReference): T[] {
  const stableId = reference.studentId?.trim();
  if (stableId) {
    const matches = students.filter(student => student.id === stableId);
    if (matches.length) return matches;
  }
  const studentNo = normalizeStudentNo(reference.studentNo);
  if (studentNo) {
    const matches = students.filter(student => normalizeStudentNo(student.studentNo) === studentNo);
    if (matches.length) return matches;
  }
  const name = normalizeStudentName(reference.name);
  if (!name) return [];
  const matches = students.filter(student => (!studentNo || !normalizeStudentNo(student.studentNo))
    && [student.name, ...(student.aliases || [])].some(value => normalizeStudentName(value) === name));
  const active = matches.filter(student => student.enrollmentStatus !== "archived");
  return active.length ? active : matches;
}

export function resolveStudent<T extends StudentIdentity>(students: T[], reference: StudentReference): T | undefined {
  const matches = findStudentCandidates(students, reference);
  return matches.length === 1 ? matches[0] : undefined;
}
