import { readLegacyRootState, writeLegacyRootState } from "./storage";
import { createSeatManagerState } from "./legacyStateAdapter";
import type { AppStudent, SavedGradeExamEntry, SavedGradeExamRecord, SeatManagerState, SeatSettings, StudentId } from "./types";

interface PersistSnapshotInput {
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  lockedSeats: number[];
  seatSettings?: SeatSettings;
}

interface SaveGradeExamInput extends PersistSnapshotInput {
  record: SavedGradeExamRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeNameForMatch(name: unknown): string {
  return String(name || "")
    .trim()
    .replace(/\u3000/g, " ")
    .replace(/[()（）][^()（）]*[()（）]/g, "")
    .replace(/(同学|学生)$/g, "")
    .replace(/\s+/g, "");
}

function getBaseState(): Record<string, unknown> {
  const raw = readLegacyRootState();
  return isRecord(raw) ? raw : {};
}

function mergeSeatSettings(baseSettings: unknown, seatSettings?: SeatSettings): Record<string, unknown> {
  const settings = isRecord(baseSettings) ? { ...baseSettings } : {};
  if (!seatSettings) {
    return settings;
  }

  const constraints = isRecord(settings.constraints) ? { ...settings.constraints } : {};
  return {
    ...settings,
    pairByGender: seatSettings.pairByGender,
    keepLockedEmpty: seatSettings.keepLockedEmpty,
    complementRuleIds: [...seatSettings.complementRuleIds],
    constraints: {
      ...constraints,
      lockedDeskmatePairs: seatSettings.constraints.lockedDeskmatePairs.map(pair => ({ ...pair })),
      noDeskmatePairs: seatSettings.constraints.noDeskmatePairs.map(pair => ({ ...pair })),
      frontRowStudentIds: [...seatSettings.constraints.frontRowStudentIds],
      frontRows: seatSettings.constraints.frontRows,
      maxRetries: seatSettings.constraints.maxRetries,
    },
  };
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

function normalizeExamEntry(value: unknown): SavedGradeExamEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const name = String(value.name || "").trim();
  if (!name) {
    return null;
  }
  return {
    name,
    scores: isRecord(value.scores) ? value.scores as SavedGradeExamEntry["scores"] : {},
    total: isRecord(value.total)
      ? {
          score: toNumberOrNull(value.total.score),
          rankClass: toNumberOrNull(value.total.rankClass),
          rankSchool: toNumberOrNull(value.total.rankSchool),
        }
      : { score: null, rankClass: null, rankSchool: null },
  };
}

function normalizeSavedGradeExamRecord(value: unknown): SavedGradeExamRecord | null {
  if (!isRecord(value)) {
    return null;
  }
  const subjects = Array.isArray(value.subjects) ? value.subjects.map(String).filter(Boolean) : [];
  const entries = Array.isArray(value.entries)
    ? value.entries.map(normalizeExamEntry).filter((item): item is SavedGradeExamEntry => Boolean(item))
    : [];
  if (!subjects.length || !entries.length) {
    return null;
  }
  return {
    id: String(value.id || `exam-${Date.now()}`),
    name: String(value.name || "考试"),
    date: String(value.date || ""),
    savedAt: String(value.savedAt || new Date().toISOString()),
    studentCount: Number.isInteger(value.studentCount) ? value.studentCount as number : entries.length,
    subjectCount: Number.isInteger(value.subjectCount) ? value.subjectCount as number : subjects.length,
    subjects,
    entries,
  };
}

function getSavedExamRecords(value: unknown): SavedGradeExamRecord[] {
  return Array.isArray(value)
    ? value.map(normalizeSavedGradeExamRecord).filter((item): item is SavedGradeExamRecord => Boolean(item))
    : [];
}

function getExamSignature(exam: Record<string, unknown>): string {
  return JSON.stringify({
    subjects: Array.isArray(exam.subjects) ? [...exam.subjects].sort() : [],
    scores: exam.scores || {},
    total: exam.total || {},
  });
}

function buildStudentLookup(students: Record<string, unknown>[]): Map<string, Record<string, unknown>[]> {
  const lookup = new Map<string, Record<string, unknown>[]>();
  students.forEach(student => {
    const names = [student.name, ...(Array.isArray(student.aliases) ? student.aliases : [])];
    names.forEach(name => {
      const key = normalizeNameForMatch(name);
      if (!key) {
        return;
      }
      const list = lookup.get(key) || [];
      list.push(student);
      lookup.set(key, list);
    });
  });
  return lookup;
}

function syncSavedExamsToStudents(students: Record<string, unknown>[], records: SavedGradeExamRecord[]): Record<string, unknown>[] {
  const syncedStudents = students.map(student => ({
    ...student,
    exams: Array.isArray(student.exams)
      ? student.exams.filter(exam => !isRecord(exam) || exam.source !== "savedExamRecord")
      : [],
  }));

  records.forEach(record => {
    const lookup = buildStudentLookup(syncedStudents);
    record.entries.forEach(entry => {
      const student = lookup.get(normalizeNameForMatch(entry.name))?.shift();
      if (!student) {
        return;
      }
      const syncedExam = {
        id: record.id,
        name: record.name || "考试",
        date: record.date || "",
        subjects: record.subjects,
        scores: entry.scores,
        total: entry.total,
        source: "savedExamRecord",
      };
      const syncedSignature = getExamSignature(syncedExam);
      const existing = Array.isArray(student.exams) ? student.exams : [];
      student.exams = existing.filter(exam => {
        if (!isRecord(exam)) {
          return false;
        }
        if (exam.id === record.id) {
          return false;
        }
        if ((exam.name || "") === syncedExam.name && (exam.date || "") === syncedExam.date) {
          return false;
        }
        return getExamSignature(exam) !== syncedSignature;
      });
      (student.exams as unknown[]).push(syncedExam);
    });
  });

  return syncedStudents;
}

export function saveLegacySnapshot({ students, seatOrder, lockedSeats, seatSettings }: PersistSnapshotInput): boolean {
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
    settings: mergeSeatSettings(baseState.settings, seatSettings),
    commentRubric: baseState.commentRubric || null,
  });
}

export function saveGradeExamRecord({ students, seatOrder, lockedSeats, seatSettings, record }: SaveGradeExamInput): SeatManagerState | null {
  const baseState = getBaseState();
  const previousStudents = Array.isArray(baseState.students) ? baseState.students : [];
  const previousById = new Map<string, Record<string, unknown>>();

  previousStudents.forEach(student => {
    if (isRecord(student) && (typeof student.id === "string" || typeof student.id === "number")) {
      previousById.set(String(student.id), student);
    }
  });

  const savedExams = [
    record,
    ...getSavedExamRecords(baseState.savedExams).filter(item => item.id !== record.id),
  ];
  const legacyStudents = students.map(student => toLegacyStudent(student, previousById.get(student.id)));
  const nextState = {
    ...baseState,
    students: syncSavedExamsToStudents(legacyStudents, savedExams),
    seatOrder,
    lockedSeats,
    savedExams,
    exams: Array.isArray(baseState.exams) ? baseState.exams : [],
    settings: mergeSeatSettings(baseState.settings, seatSettings),
    commentRubric: baseState.commentRubric || null,
  };

  return writeLegacyRootState(nextState) ? createSeatManagerState(nextState) : null;
}
