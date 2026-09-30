import { resolveStudent, type StudentIdentity } from "./studentIdentity";
import type { SavedGradeExamRecord, StudentId } from "./types";

export type GradeStudentCandidate = StudentIdentity;
export const resolveGradeStudent = resolveStudent;

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

function cleanImportSource(source: unknown, studentId: StudentId, students: GradeStudentCandidate[], removedCount: number): unknown {
  if (!isRecord(source) || !Array.isArray(source.rows) || !isRecord(source.mapping)) return undefined;
  const nameCol = source.mapping.nameCol;
  const noCol = source.mapping.studentNoCol;
  if (typeof nameCol !== "number" || !Number.isInteger(nameCol) || nameCol < 0) return removedCount ? undefined : source;
  const rows = source.rows.filter((row, index) => {
    if (index === 0 || !Array.isArray(row)) return true;
    return resolveGradeStudent(students, { name: String(row[nameCol] ?? ""), studentNo: typeof noCol === "number" && noCol >= 0 ? String(row[noCol] ?? "") : undefined })?.id !== studentId;
  });
  // A stable entry link may outlive a renamed student or an ambiguous name.
  // If source ownership cannot be proven, discard remapping only, not grades.
  if (source.rows.length - rows.length < removedCount) return undefined;
  return { ...source, rows };
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
    const removedEntries = rawRecord.entries.length - entries.length;
    const removedItems = isRecord(itemAnalysis) && isRecord(rawRecord.itemAnalysis) && Array.isArray(itemAnalysis.rows) && Array.isArray(rawRecord.itemAnalysis.rows) ? rawRecord.itemAnalysis.rows.length - itemAnalysis.rows.length : 0;
    const importSource = rawRecord.importSource ? cleanImportSource(rawRecord.importSource, studentId, students, Math.max(removedEntries, removedItems)) : undefined;
    return { ...rawRecord, entries, studentCount: entries.length, itemAnalysis, importSource };
  });
}
