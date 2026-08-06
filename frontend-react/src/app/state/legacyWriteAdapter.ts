import { readLegacyRootState, writeLegacyRootState } from "./storage";
import { createSeatManagerState } from "./legacyStateAdapter";
import { normalizeGradeItemAnalysis } from "./teacherWorkbench";
import { attachSavedGradeStudentIds, resolveGradeStudent, type GradeStudentCandidate } from "./gradeStudentIdentity";
import type { ActivityEvent, AppStudent, AttendanceRecord, ClassScheduleV1, CommunicationDraft, Dormitory, DrawSession, FollowupTask, FundTransaction, GradeItemAnalysis, HomeworkAssignment, QuickRecordPreset, SavedGradeExamEntry, SavedGradeExamRecord, ScoreImportSource, SeatHistorySnapshot, SeatManagerState, SeatSettings, StudentId } from "./types";

interface PersistSnapshotInput {
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  lockedSeats: number[];
  seatSettings?: SeatSettings;
  seatHistory?: SeatHistorySnapshot[];
  dormitories?: Dormitory[];
  fundTransactions?: FundTransaction[];
  attendanceRecords?: AttendanceRecord[];
  followupTasks?: FollowupTask[];
  drawSessions?: DrawSession[];
  schedule?: ClassScheduleV1;
  homeworkAssignments?: HomeworkAssignment[];
  quickRecordPresets?: QuickRecordPreset[];
  communicationDrafts?: CommunicationDraft[];
  activityEvents?: ActivityEvent[];
  savedExams?: unknown[];
  exams?: unknown[];
  settings?: Record<string, unknown>;
}

interface SaveGradeExamInput extends PersistSnapshotInput {
  record: SavedGradeExamRecord;
}

interface UpdateGradeExamInput extends PersistSnapshotInput {
  examId: string;
  name: string;
  date: string;
}

interface DeleteGradeExamInput extends PersistSnapshotInput {
  examId: string;
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

function getBaseState(): Record<string, unknown> {
  const raw = readLegacyRootState();
  return isRecord(raw) ? raw : {};
}

function mergeSeatSettings(baseSettings: unknown, seatSettings?: SeatSettings, nextSettings?: Record<string, unknown>): Record<string, unknown> {
  const settings = nextSettings ? { ...nextSettings } : isRecord(baseSettings) ? { ...baseSettings } : {};
  if (!seatSettings) {
    return settings;
  }

  const constraints = isRecord(settings.constraints) ? { ...settings.constraints } : {};
  return {
    ...settings,
    pairByGender: seatSettings.pairByGender,
    keepLockedEmpty: seatSettings.keepLockedEmpty,
    complementRuleIds: [...seatSettings.complementRuleIds],
    groupBalanceMode: seatSettings.groupBalanceMode,
    seatLayout: seatSettings.layout ? {
      ...seatSettings.layout,
      canvas: { ...seatSettings.layout.canvas },
      seats: seatSettings.layout.seats.map(seat => ({ ...seat })),
      groups: seatSettings.layout.groups.map(group => ({ ...group, seatIds: [...group.seatIds] })),
      neighborEdges: seatSettings.layout.neighborEdges.map(edge => ({ ...edge })),
    } : undefined,
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
    studentNo: student.studentNo || previous?.studentNo || "",
    gender: student.gender,
    aliases: student.aliases,
    parentPhone: student.parentPhone || "",
    address: student.address || "",
    emergencyContact: student.emergencyContact || "",
    isBoarding: student.isBoarding === true,
    records: student.records,
    manualTags: student.manualTagIds,
    autoTags: student.autoTagIds,
    exams: student.exams,
    dormitoryId: student.dormitoryId,
    aiComments: student.aiComments || previous?.aiComments || {},
    enrollmentStatus: student.enrollmentStatus || "active",
    archivedAt: student.archivedAt,
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
    studentId: typeof value.studentId === "string" || typeof value.studentId === "number" ? String(value.studentId).trim() : undefined,
    name,
    studentNo: typeof value.studentNo === "string" || typeof value.studentNo === "number" ? String(value.studentNo).trim() : undefined,
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

function normalizeImportSource(value: unknown): ScoreImportSource | undefined {
  if (!isRecord(value) || !Array.isArray(value.rows) || !isRecord(value.mapping)) {
    return undefined;
  }
  const rows = value.rows
    .filter(Array.isArray)
    .map(row => row.map(cell => String(cell ?? "")));
  if (!rows.length) {
    return undefined;
  }
  const mapping = value.mapping;
  const totalMapping = isRecord(mapping.totalMapping) ? mapping.totalMapping : {};
  return {
    filename: String(value.filename || ""),
    rows,
    mapping: {
      headers: Array.isArray(mapping.headers) ? mapping.headers.map(String) : rows[0] || [],
      nameCol: Number.isInteger(mapping.nameCol) ? mapping.nameCol as number : -1,
      studentNoCol: Number.isInteger(mapping.studentNoCol) ? mapping.studentNoCol as number : -1,
      subjectMappings: Array.isArray(mapping.subjectMappings)
        ? mapping.subjectMappings
            .filter(isRecord)
            .map(item => ({
              subject: String(item.subject || ""),
              scoreCol: Number.isInteger(item.scoreCol) ? item.scoreCol as number : -1,
              rankClassCol: Number.isInteger(item.rankClassCol) ? item.rankClassCol as number : -1,
              rankSchoolCol: Number.isInteger(item.rankSchoolCol) ? item.rankSchoolCol as number : -1,
            }))
            .filter(item => item.subject && item.scoreCol >= 0)
        : [],
      totalMapping: {
        scoreCol: Number.isInteger(totalMapping.scoreCol) ? totalMapping.scoreCol as number : -1,
        rankClassCol: Number.isInteger(totalMapping.rankClassCol) ? totalMapping.rankClassCol as number : -1,
        rankSchoolCol: Number.isInteger(totalMapping.rankSchoolCol) ? totalMapping.rankSchoolCol as number : -1,
      },
      warnings: Array.isArray(mapping.warnings) ? mapping.warnings.map(String).filter(Boolean) : [],
    },
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
    importSource: normalizeImportSource(value.importSource),
    itemAnalysis: normalizeGradeItemAnalysis(value.itemAnalysis),
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

function syncSavedExamsToStudents(students: Record<string, unknown>[], records: SavedGradeExamRecord[]): Record<string, unknown>[] {
  const syncedStudents: Record<string, unknown>[] = students.map(student => ({
    ...student,
    exams: Array.isArray(student.exams)
      ? student.exams.filter(exam => !isRecord(exam) || exam.source !== "savedExamRecord")
      : [],
  }));
  const candidates = syncedStudents.flatMap<GradeStudentCandidate & { target: Record<string, unknown> }>(student => typeof student.id === "string" && typeof student.name === "string" ? [{
    id: student.id,
    name: student.name,
    studentNo: typeof student.studentNo === "string" ? student.studentNo : undefined,
    aliases: Array.isArray(student.aliases) ? student.aliases.filter((alias: unknown): alias is string => typeof alias === "string") : [],
    enrollmentStatus: student.enrollmentStatus === "archived" ? "archived" as const : "active" as const,
    target: student,
  }] : []);

  records.forEach(record => {
    record.entries.forEach(entry => {
      const matched = resolveGradeStudent(candidates, entry);
      if (!matched) {
        return;
      }
      const student = matched.target;
      if (entry.studentNo && !student.studentNo) {
        student.studentNo = entry.studentNo;
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
      student.exams = existing.filter((exam: unknown) => {
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

function mergeSnapshotDomains(baseState: Record<string, unknown>, input: PersistSnapshotInput): Record<string, unknown> {
  return {
    ...baseState,
    seatOrder: input.seatOrder,
    lockedSeats: input.lockedSeats,
    dormitories: input.dormitories ?? (Array.isArray(baseState.dormitories) ? baseState.dormitories : []),
    fundTransactions: input.fundTransactions ?? (Array.isArray(baseState.fundTransactions) ? baseState.fundTransactions : []),
    attendanceRecords: input.attendanceRecords ?? (Array.isArray(baseState.attendanceRecords) ? baseState.attendanceRecords : []),
    followupTasks: input.followupTasks ?? (Array.isArray(baseState.followupTasks) ? baseState.followupTasks : []),
    drawSessions: input.drawSessions ?? (Array.isArray(baseState.drawSessions) ? baseState.drawSessions : []),
    schedule: input.schedule ?? baseState.schedule,
    homeworkAssignments: input.homeworkAssignments ?? (Array.isArray(baseState.homeworkAssignments) ? baseState.homeworkAssignments : []),
    quickRecordPresets: input.quickRecordPresets ?? (Array.isArray(baseState.quickRecordPresets) ? baseState.quickRecordPresets : []),
    communicationDrafts: input.communicationDrafts ?? (Array.isArray(baseState.communicationDrafts) ? baseState.communicationDrafts : []),
    activityEvents: input.activityEvents ?? (Array.isArray(baseState.activityEvents) ? baseState.activityEvents : []),
    seatHistory: input.seatHistory ?? (Array.isArray(baseState.seatHistory) ? baseState.seatHistory : []),
    savedExams: input.savedExams ?? (Array.isArray(baseState.savedExams) ? baseState.savedExams : []),
    exams: input.exams ?? (Array.isArray(baseState.exams) ? baseState.exams : []),
    settings: mergeSeatSettings(baseState.settings, input.seatSettings, input.settings),
    commentRubric: baseState.commentRubric || null,
  };
}

export function saveLegacySnapshot(input: PersistSnapshotInput): boolean {
  const baseState = getBaseState();
  const previousStudents = Array.isArray(baseState.students) ? baseState.students : [];
  const previousById = new Map<string, Record<string, unknown>>();

  previousStudents.forEach(student => {
    if (isRecord(student) && (typeof student.id === "string" || typeof student.id === "number")) {
      previousById.set(String(student.id), student);
    }
  });

  return writeLegacyRootState({
    ...mergeSnapshotDomains(baseState, input),
    students: input.students.map(student => toLegacyStudent(student, previousById.get(student.id))),
  });
}

export function saveGradeExamRecord(input: SaveGradeExamInput): SeatManagerState | null {
  const { students, record } = input;
  const baseState = getBaseState();
  const previousStudents = Array.isArray(baseState.students) ? baseState.students : [];
  const previousById = new Map<string, Record<string, unknown>>();

  previousStudents.forEach(student => {
    if (isRecord(student) && (typeof student.id === "string" || typeof student.id === "number")) {
      previousById.set(String(student.id), student);
    }
  });

  const savedExams = attachSavedGradeStudentIds([
    record,
    ...getSavedExamRecords(input.savedExams ?? baseState.savedExams).filter(item => item.id !== record.id),
  ], students);
  const legacyStudents = students.map(student => toLegacyStudent(student, previousById.get(student.id)));
  const nextState = {
    ...mergeSnapshotDomains(baseState, input),
    students: syncSavedExamsToStudents(legacyStudents, savedExams),
    savedExams,
  };

  return writeLegacyRootState(nextState) ? createSeatManagerState(nextState) : null;
}

function persistSavedExamRecords(
  input: PersistSnapshotInput,
  savedExams: SavedGradeExamRecord[],
): SeatManagerState | null {
  const { students } = input;
  const baseState = getBaseState();
  const previousStudents = Array.isArray(baseState.students) ? baseState.students : [];
  const previousById = new Map<string, Record<string, unknown>>();

  previousStudents.forEach(student => {
    if (isRecord(student) && (typeof student.id === "string" || typeof student.id === "number")) {
      previousById.set(String(student.id), student);
    }
  });

  const resolvedSavedExams = attachSavedGradeStudentIds(savedExams, students);
  const legacyStudents = students.map(student => toLegacyStudent(student, previousById.get(student.id)));
  const nextState = {
    ...mergeSnapshotDomains(baseState, input),
    students: syncSavedExamsToStudents(legacyStudents, resolvedSavedExams),
    savedExams: resolvedSavedExams,
  };

  return writeLegacyRootState(nextState) ? createSeatManagerState(nextState) : null;
}

export function updateGradeExamRecordMetadata(input: UpdateGradeExamInput): SeatManagerState | null {
  const baseState = getBaseState();
  const savedExams = getSavedExamRecords(input.savedExams ?? baseState.savedExams);
  let changed = false;
  const nextRecords = savedExams.map(record => {
    if (record.id !== input.examId) {
      return record;
    }
    changed = true;
    return {
      ...record,
      name: input.name.trim() || record.name,
      date: input.date,
    };
  });

  return changed ? persistSavedExamRecords(input, nextRecords) : null;
}

export function deleteGradeExamRecord(input: DeleteGradeExamInput): SeatManagerState | null {
  const baseState = getBaseState();
  const savedExams = getSavedExamRecords(input.savedExams ?? baseState.savedExams);
  const nextRecords = savedExams.filter(record => record.id !== input.examId);
  return nextRecords.length !== savedExams.length ? persistSavedExamRecords(input, nextRecords) : null;
}

export function updateGradeExamItemAnalysis(input: PersistSnapshotInput & { examId: string; itemAnalysis: GradeItemAnalysis }): SeatManagerState | null {
  const baseState = getBaseState();
  const savedExams = getSavedExamRecords(input.savedExams ?? baseState.savedExams);
  let changed = false;
  const nextRecords = savedExams.map(record => {
    if (record.id !== input.examId) return record;
    changed = true;
    return { ...record, itemAnalysis: input.itemAnalysis };
  });
  return changed ? persistSavedExamRecords(input, nextRecords) : null;
}
