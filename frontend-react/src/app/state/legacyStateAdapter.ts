import { EXAMS, INITIAL_SEATS, SAMPLE_RECORDS, STUDENTS } from "../components/mockData";
import type {
  AppStudent,
  Gender,
  GradeExam,
  GradeRow,
  GradeScoreCell,
  RecordType,
  SeatManagerState,
  StudentExamSummary,
  StudentId,
  StudentRecord,
} from "./types";

const COLS = 8;
const SUBJECT_ORDER = ["语文", "数学", "英语", "物理", "化学", "地理", "历史", "政治", "生物"];

const TAG_LABELS: Record<string, string> = {
  cn_strong: "语文强",
  cn_mid: "语文中",
  cn_weak: "语文弱",
  math_strong: "数学强",
  math_mid: "数学中",
  math_weak: "数学弱",
  en_strong: "英语强",
  en_mid: "英语中",
  en_weak: "英语弱",
  physics_strong: "物理强",
  physics_mid: "物理中",
  physics_weak: "物理弱",
  chemistry_strong: "化学强",
  chemistry_mid: "化学中",
  chemistry_weak: "化学弱",
  geo_strong: "地理强",
  geo_mid: "地理中",
  geo_weak: "地理弱",
  history_strong: "历史强",
  history_mid: "历史中",
  history_weak: "历史弱",
  politics_strong: "政治强",
  politics_mid: "政治中",
  politics_weak: "政治弱",
  biology_strong: "生物强",
  biology_mid: "生物中",
  biology_weak: "生物弱",
  talkative: "爱讲话",
  quiet: "沉默",
  distractible: "容易分心",
  focused: "专注",
  leader: "主动",
  supporter: "配合",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function toStudentId(value: unknown): StudentId {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return "";
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map(item => (typeof item === "string" || typeof item === "number" ? String(item).trim() : ""))
        .filter(Boolean)
    : [];
}

function toUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeGender(value: unknown): Gender {
  return value === "男" || value === "女" ? value : "";
}

function normalizeName(name: unknown): string {
  return toStringValue(name)
    .replace(/\u3000/g, " ")
    .replace(/[()（）][^()（）]*[()（）]/g, "")
    .replace(/(同学|学生)$/g, "")
    .replace(/\s+/g, "");
}

function getTagLabels(ids: string[]): string[] {
  return ids.map(id => TAG_LABELS[id] || id).filter(Boolean);
}

function isAcademicTag(label: string): boolean {
  return /^(语文|数学|英语|物理|化学|地理|历史|政治|生物)(强|中|弱)$/.test(label);
}

function normalizeRecord(value: unknown, index: number): StudentRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawType = toStringValue(value.type);
  const type: RecordType = rawType === "reward" || rawType === "punish" || rawType === "note" ? rawType : "note";
  const note = toStringValue(value.note) || toStringValue(value.text) || toStringValue(value.reason);
  const date = toStringValue(value.date) || toStringValue(value.weekStart) || toStringValue(value.createdAt);

  return {
    id: toStringValue(value.id, `record-${index}`),
    type,
    note,
    date,
  };
}

function pickScores(value: Record<string, unknown>): Record<string, number> {
  const explicitScores = isRecord(value.scores) ? value.scores : value;
  return SUBJECT_ORDER.reduce<Record<string, number>>((scores, subject) => {
    const score = parseScoreCell(explicitScores[subject]).score;
    if (score !== null) {
      scores[subject] = score;
    }
    return scores;
  }, {});
}

function toRank(value: unknown): number | null {
  const parsed = toNumber(value);
  return parsed && Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseScoreCell(value: unknown): GradeScoreCell {
  if (isRecord(value)) {
    return {
      score: toNumber(value.score) ?? null,
      rankClass: toRank(value.rankClass),
      rankSchool: toRank(value.rankSchool),
    };
  }

  return {
    score: toNumber(value) ?? null,
    rankClass: null,
    rankSchool: null,
  };
}

function sumScoreCells(scores: Record<string, GradeScoreCell>): number | null {
  let total = 0;
  let hasScore = false;
  Object.values(scores).forEach(cell => {
    if (typeof cell.score === "number" && Number.isFinite(cell.score)) {
      total += cell.score;
      hasScore = true;
    }
  });
  return hasScore ? Math.round(total * 10) / 10 : null;
}

function normalizeExam(value: unknown, index: number): StudentExamSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const scores = pickScores(value);
  if (!Object.keys(scores).length) {
    return null;
  }
  const totalCell = parseScoreCell(value.total);

  return {
    id: toStringValue(value.id, `exam-${index}`),
    name: toStringValue(value.name) || toStringValue(value.examName) || toStringValue(value.title) || "考试记录",
    date: toStringValue(value.date),
    scores,
    total: totalCell.score ?? toNumber(value.total) ?? toNumber(value.totalScore),
    rank: toStringValue(value.rank) || toStringValue(value.classRank) || toStringValue(value.schoolRank) || (totalCell.rankClass ? String(totalCell.rankClass) : ""),
  };
}

function getSeatCapacity(studentCount: number, seatOrder: Array<StudentId | null>): number {
  const lastAssignedIndex = [...seatOrder].reverse().findIndex(id => id !== null);
  const lastIndex = lastAssignedIndex === -1 ? -1 : seatOrder.length - 1 - lastAssignedIndex;
  const minNeeded = Math.max(studentCount, lastIndex + 1);
  return minNeeded ? Math.ceil(minNeeded / COLS) * COLS : 0;
}

function normalizeSeatOrder(students: AppStudent[], rawSeatOrder: unknown): Array<StudentId | null> {
  const ids = students.map(student => student.id);
  const idSet = new Set(ids);
  const rawOrder = Array.isArray(rawSeatOrder)
    ? rawSeatOrder.map(item => {
        const id = toStudentId(item);
        return id && idSet.has(id) ? id : null;
      })
    : [];
  const total = getSeatCapacity(students.length, rawOrder);
  const order: Array<StudentId | null> = new Array(total).fill(null);
  const used = new Set<StudentId>();

  rawOrder.forEach((id, index) => {
    if (index >= order.length || id === null || used.has(id)) {
      return;
    }
    used.add(id);
    order[index] = id;
  });

  ids.forEach(id => {
    if (used.has(id)) {
      return;
    }
    const emptyIndex = order.indexOf(null);
    if (emptyIndex !== -1) {
      order[emptyIndex] = id;
      used.add(id);
    }
  });

  return order;
}

function normalizeLockedSeats(value: unknown, seatCount: number): number[] {
  const unique = new Set<number>();
  toUnknownArray(value).forEach(item => {
    const index = Math.trunc(toNumber(item) ?? -1);
    if (index >= 0 && index < seatCount) {
      unique.add(index);
    }
  });
  return [...unique];
}

function normalizeStudent(value: unknown, index: number): AppStudent | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = toStudentId(value.id) || `legacy-${index}`;
  const name = toStringValue(value.name);
  if (!name) {
    return null;
  }

  const manualTagIds = toStringArray(value.manualTags);
  const autoTagIds = toStringArray(value.autoTags);
  const manualLabels = getTagLabels(manualTagIds);
  const autoLabels = getTagLabels(autoTagIds);
  const allLabels = [...manualLabels, ...autoLabels];

  return {
    id,
    name,
    gender: normalizeGender(value.gender),
    aliases: toStringArray(value.aliases),
    tags: allLabels.filter(label => !isAcademicTag(label)),
    academicTags: allLabels.filter(isAcademicTag),
    manualTagIds,
    autoTagIds,
    records: toUnknownArray(value.records).map(normalizeRecord).filter((item): item is StudentRecord => Boolean(item)),
    exams: toUnknownArray(value.exams).map(normalizeExam).filter((item): item is StudentExamSummary => Boolean(item)),
    aiComments: value.aiComments,
  };
}

function createMockStudents(): AppStudent[] {
  return STUDENTS.map(student => {
    const exams = EXAMS.reduce<StudentExamSummary[]>((items, exam) => {
      const score = exam.scores.find(item => item.studentId === student.id);
      if (score) {
        items.push({
            id: exam.id,
            name: exam.name,
            date: exam.date,
            scores: score.scores,
            total: score.total,
            rank: String(score.classRank),
        });
      }
      return items;
    }, []);

    return {
      id: String(student.id),
      name: student.name,
      gender: student.gender,
      aliases: student.alias ? [student.alias] : [],
      tags: student.tags,
      academicTags: student.academicTags,
      manualTagIds: [],
      autoTagIds: [],
      records: SAMPLE_RECORDS.filter(record => record.studentId === student.id).map(record => ({
        id: record.id,
        type: record.type,
        note: record.note,
        date: record.date,
      })),
      exams,
    };
  });
}

function createMockGradeExams(): GradeExam[] {
  return EXAMS.map(exam => ({
    id: exam.id,
    name: exam.name,
    date: exam.date,
    subjects: exam.subjects,
    rows: exam.scores.map(score => {
      const student = STUDENTS.find(item => item.id === score.studentId);
      const scores = exam.subjects.reduce<Record<string, GradeScoreCell>>((map, subject) => {
        map[subject] = { score: score.scores[subject] ?? null };
        return map;
      }, {});

      return {
        id: `${exam.id}-${score.studentId}`,
        name: student?.name || String(score.studentId),
        studentId: String(score.studentId),
        scores,
        total: score.total,
        rankClass: score.classRank,
      };
    }),
  }));
}

function createStudentNameLookup(students: AppStudent[]): Map<string, AppStudent[]> {
  const lookup = new Map<string, AppStudent[]>();
  students.forEach(student => {
    [student.name, ...student.aliases].forEach(name => {
      const key = normalizeName(name);
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

function normalizeSavedExamRecord(record: unknown, index: number, students: AppStudent[]): GradeExam | null {
  if (!isRecord(record)) {
    return null;
  }

  const subjects = toStringArray(record.subjects);
  const rawEntries = toUnknownArray(record.entries);
  if (!subjects.length || !rawEntries.length) {
    return null;
  }

  const nameLookup = createStudentNameLookup(students);
  const rows = rawEntries.reduce<GradeRow[]>((items, entry, entryIndex) => {
    if (!isRecord(entry)) {
      return items;
    }

    const name = toStringValue(entry.name);
    if (!name) {
      return items;
    }

    const rawScores = isRecord(entry.scores) ? entry.scores : {};
    const scores = subjects.reduce<Record<string, GradeScoreCell>>((map, subject) => {
      map[subject] = parseScoreCell(rawScores[subject]);
      return map;
    }, {});
    const totalCell = parseScoreCell(entry.total);
    const matchedStudent = nameLookup.get(normalizeName(name))?.shift();

    items.push({
      id: `${toStringValue(record.id, `exam-${index}`)}-${entryIndex}`,
      name,
      studentId: matchedStudent?.id,
      scores,
      total: totalCell.score ?? sumScoreCells(scores),
      rankClass: totalCell.rankClass,
      rankSchool: totalCell.rankSchool,
    });
    return items;
  }, []);

  if (!rows.length) {
    return null;
  }

  return {
    id: toStringValue(record.id, `exam-${index}`),
    name: toStringValue(record.name, "考试"),
    date: toStringValue(record.date),
    savedAt: toStringValue(record.savedAt),
    subjects,
    rows,
  };
}

function normalizeGradeExams(rawSavedExams: unknown, students: AppStudent[]): GradeExam[] {
  const exams = toUnknownArray(rawSavedExams)
    .map((record, index) => normalizeSavedExamRecord(record, index, students))
    .filter((item): item is GradeExam => Boolean(item));

  return exams.length ? exams : createMockGradeExams();
}

export function createMockSeatManagerState(): SeatManagerState {
  const students = createMockStudents();
  const seatOrder = INITIAL_SEATS.map(id => (id === null ? null : String(id)));

  return {
    source: "mock",
    hasLegacyData: false,
    students,
    seatOrder,
    lockedSeats: [],
    savedExams: EXAMS,
    exams: EXAMS,
    manualTags: [],
    autoTags: [],
    aiComments: null,
    commentRubric: null,
    settings: {},
    gradeExams: createMockGradeExams(),
  };
}

export function createSeatManagerState(raw: unknown): SeatManagerState {
  if (!isRecord(raw)) {
    return createMockSeatManagerState();
  }

  const students = toUnknownArray(raw.students)
    .map(normalizeStudent)
    .filter((item): item is AppStudent => Boolean(item));

  if (!students.length) {
    return createMockSeatManagerState();
  }

  const seatOrder = normalizeSeatOrder(students, raw.seatOrder);
  const settings = isRecord(raw.settings) ? raw.settings : {};

  return {
    source: "legacy",
    hasLegacyData: true,
    students,
    seatOrder,
    lockedSeats: normalizeLockedSeats(raw.lockedSeats, seatOrder.length),
    savedExams: toUnknownArray(raw.savedExams),
    exams: toUnknownArray(raw.exams),
    manualTags: toUnknownArray(raw.manualTags),
    autoTags: toUnknownArray(raw.autoTags),
    aiComments: raw.aiComments ?? null,
    commentRubric: raw.commentRubric ?? null,
    settings,
    gradeExams: normalizeGradeExams(raw.savedExams, students),
  };
}
