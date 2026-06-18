import { readLegacyRootState, writeLegacyRootState } from "./storage";
import type { AppStudent, StudentId } from "./types";

interface PersistSnapshotInput {
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  lockedSeats: number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getBaseState(): Record<string, unknown> {
  const raw = readLegacyRootState();
  return isRecord(raw) ? raw : {};
}

function toLegacyStudent(student: AppStudent, previous?: Record<string, unknown>): Record<string, unknown> {
  return {
    ...(previous || {}),
    id: student.id,
    name: student.name,
    gender: student.gender,
    aliases: student.aliases,
    records: student.records,
    manualTags: student.manualTagIds,
    autoTags: student.autoTagIds,
    exams: student.exams,
    aiComments: student.aiComments || previous?.aiComments || {},
  };
}

export function saveLegacySnapshot({ students, seatOrder, lockedSeats }: PersistSnapshotInput): boolean {
  const baseState = getBaseState();
  const previousStudents = Array.isArray(baseState.students) ? baseState.students : [];
  const previousById = new Map<string, Record<string, unknown>>();

  previousStudents.forEach(student => {
    if (isRecord(student) && (typeof student.id === "string" || typeof student.id === "number")) {
      previousById.set(String(student.id), student);
    }
  });

  return writeLegacyRootState({
    ...baseState,
    students: students.map(student => toLegacyStudent(student, previousById.get(student.id))),
    seatOrder,
    lockedSeats,
    savedExams: Array.isArray(baseState.savedExams) ? baseState.savedExams : [],
    exams: Array.isArray(baseState.exams) ? baseState.exams : [],
    settings: isRecord(baseState.settings) ? baseState.settings : {},
    commentRubric: baseState.commentRubric || null,
  });
}
