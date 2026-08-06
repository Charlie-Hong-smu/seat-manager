import { normalizeStudentSearch } from "./studentSearch";
import type { SavedGradeExamEntry, SavedGradeExamRecord, StudentId } from "./types";

export interface GradeStudentCandidate {
  id: StudentId;
  name: string;
  studentNo?: string;
  aliases?: string[];
  enrollmentStatus?: "active" | "archived";
}

type GradeStudentReference = Pick<SavedGradeExamEntry, "studentId" | "studentNo" | "name">;

function normalizeStudentNo(value: unknown): string {
  return String(value || "").trim().toLocaleLowerCase("zh-Hans-CN").replace(/\s+/g, "");
}

function normalizeGradeStudentName(value: unknown): string {
  return normalizeStudentSearch(String(value || "")
    .replace(/\u3000/g, " ")
    .replace(/[()（）][^()（）]*[()（）]/g, "")
    .replace(/(同学|学生)$/g, ""));
}

/** 稳定 ID 优先，其次唯一学号；姓名只在活跃或归档候选唯一时兜底。 */
export function resolveGradeStudent<T extends GradeStudentCandidate>(students: T[], reference: GradeStudentReference): T | undefined {
  const stableId = String(reference.studentId || "").trim();
  if (stableId) {
    const matched = students.find(student => student.id === stableId);
    if (matched) return matched;
  }

  const studentNo = normalizeStudentNo(reference.studentNo);
  if (studentNo) {
    const matched = students.filter(student => normalizeStudentNo(student.studentNo) === studentNo);
    if (matched.length === 1) return matched[0];
    if (matched.length > 1) return undefined;
  }

  const name = normalizeGradeStudentName(reference.name);
  if (!name) return undefined;
  const matched = students.filter(student => [student.name, ...(student.aliases || [])]
    .some(candidate => normalizeGradeStudentName(candidate) === name));
  const active = matched.filter(student => student.enrollmentStatus !== "archived");
  if (active.length === 1) return active[0];
  if (active.length > 1) return undefined;
  return matched.length === 1 ? matched[0] : undefined;
}

export function attachSavedGradeStudentIds(records: SavedGradeExamRecord[], students: GradeStudentCandidate[]): SavedGradeExamRecord[] {
  return records.map(record => ({
    ...record,
    entries: record.entries.map(entry => {
      const student = resolveGradeStudent(students, entry);
      return student ? { ...entry, studentId: student.id, studentNo: entry.studentNo || student.studentNo } : entry;
    }),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function attachStudentIdsToRawSavedGradeExams(value: unknown, students: GradeStudentCandidate[]): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map(rawRecord => {
    if (!isRecord(rawRecord) || !Array.isArray(rawRecord.entries)) return rawRecord;
    return {
      ...rawRecord,
      entries: rawRecord.entries.map(rawEntry => {
        if (!isRecord(rawEntry)) return rawEntry;
        const matched = resolveGradeStudent(students, {
          studentId: typeof rawEntry.studentId === "string" ? rawEntry.studentId : undefined,
          studentNo: typeof rawEntry.studentNo === "string" || typeof rawEntry.studentNo === "number" ? String(rawEntry.studentNo) : undefined,
          name: typeof rawEntry.name === "string" ? rawEntry.name : "",
        });
        return matched ? { ...rawEntry, studentId: matched.id, studentNo: rawEntry.studentNo || matched.studentNo } : rawEntry;
      }),
    };
  });
}

/** 从兼容 savedExams 与题目分析中移除能够可靠归属到目标学生的行。 */
export function removeStudentFromSavedGradeExams(value: unknown, studentId: StudentId, students: GradeStudentCandidate[]): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.map(rawRecord => {
    if (!isRecord(rawRecord) || !Array.isArray(rawRecord.entries)) return rawRecord;
    const entries = rawRecord.entries.filter(rawEntry => {
      if (!isRecord(rawEntry)) return true;
      const reference = {
        studentId: typeof rawEntry.studentId === "string" ? rawEntry.studentId : undefined,
        studentNo: typeof rawEntry.studentNo === "string" || typeof rawEntry.studentNo === "number" ? String(rawEntry.studentNo) : undefined,
        name: typeof rawEntry.name === "string" ? rawEntry.name : "",
      };
      return resolveGradeStudent(students, reference)?.id !== studentId;
    });
    const itemAnalysis = isRecord(rawRecord.itemAnalysis) && Array.isArray(rawRecord.itemAnalysis.rows)
      ? { ...rawRecord.itemAnalysis, rows: rawRecord.itemAnalysis.rows.filter(row => !isRecord(row) || row.studentId !== studentId) }
      : rawRecord.itemAnalysis;
    return { ...rawRecord, entries, studentCount: entries.length, itemAnalysis };
  });
}
