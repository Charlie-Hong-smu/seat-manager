export type StudentId = string;
export type Gender = "男" | "女" | "";

export type RecordType = "reward" | "punish" | "note";

export interface StudentRecord {
  id: string;
  type: RecordType;
  note: string;
  date: string;
}

export interface StudentExamSummary {
  id: string;
  name: string;
  date: string;
  scores: Record<string, number>;
  total?: number;
  rank?: string;
}

export interface GradeScoreCell {
  score: number | null;
  rankClass?: number | null;
  rankSchool?: number | null;
}

export interface GradeRow {
  id: string;
  name: string;
  studentId?: StudentId;
  scores: Record<string, GradeScoreCell>;
  total: number | null;
  rankClass?: number | null;
  rankSchool?: number | null;
}

export interface GradeExam {
  id: string;
  name: string;
  date: string;
  savedAt?: string;
  subjects: string[];
  rows: GradeRow[];
}

export interface SeatPairRule {
  a: StudentId;
  b: StudentId;
}

export interface SeatConstraints {
  lockedDeskmatePairs: SeatPairRule[];
  noDeskmatePairs: SeatPairRule[];
  frontRowStudentIds: StudentId[];
  frontRows: number;
  maxRetries: number;
}

export type ComplementRuleId =
  | "talk_quiet"
  | "focus_balance"
  | "role_balance"
  | "cn_balance"
  | "math_balance"
  | "en_balance";

export interface SeatSettings {
  pairByGender: boolean;
  keepLockedEmpty: boolean;
  complementRuleIds: ComplementRuleId[];
  constraints: SeatConstraints;
}

export interface SavedGradeExamEntry {
  name: string;
  scores: Record<string, GradeScoreCell>;
  total: GradeScoreCell;
}

export interface SavedGradeExamRecord {
  id: string;
  name: string;
  date: string;
  savedAt: string;
  studentCount: number;
  subjectCount: number;
  subjects: string[];
  entries: SavedGradeExamEntry[];
}

export interface ScoreImportDraft {
  filename: string;
  subjects: string[];
  entries: SavedGradeExamEntry[];
  rowCount: number;
  warnings: string[];
}

export type CommentStyle = "warm" | "formal" | "brief";
export type CommentLengthMode = "short" | "standard" | "long" | "custom";

export interface StudentCommentDraft {
  generatedComment: string;
  teacherNote: string;
  style: CommentStyle;
  lengthMode: CommentLengthMode;
  targetWordCount: number;
  updatedAt: string;
  criteriaSummary?: CommentCriteriaSummary[];
  customOptions?: CommentCustomOptionSummary[];
}

export interface CommentCriterionOption {
  id: string;
  label: string;
  linkedTagId: string;
  builtIn: boolean;
}

export interface CommentCriterion {
  id: string;
  label: string;
  type: "multi" | "single";
  syncToTags: boolean;
  hidden: boolean;
  builtIn: boolean;
  options: CommentCriterionOption[];
}

export interface CommentRubric {
  version: number;
  criteria: CommentCriterion[];
}

export interface CommentCustomOptionSummary {
  criterionId: string;
  criterionLabel: string;
  label: string;
}

export interface CommentCriteriaSummary {
  criterionId: string;
  label: string;
  values: string[];
}

export interface StudentCommentProfile {
  criteriaValues: Record<string, string[]>;
  customOptions: Record<string, CommentCriterionOption[]>;
  teacherNote: string;
  style: CommentStyle;
  lengthMode: CommentLengthMode;
  targetWordCount: number;
  generatedComment: string;
  status: string;
  updatedAt: string;
}

export interface AppStudent {
  id: StudentId;
  name: string;
  gender: Gender;
  aliases: string[];
  tags: string[];
  academicTags: string[];
  manualTagIds: string[];
  autoTagIds: string[];
  records: StudentRecord[];
  exams: StudentExamSummary[];
  aiComments?: unknown;
}

export interface SeatManagerState {
  source: "legacy" | "mock";
  hasLegacyData: boolean;
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  lockedSeats: number[];
  seatSettings: SeatSettings;
  savedExams: unknown[];
  exams: unknown[];
  manualTags: unknown[];
  autoTags: unknown[];
  aiComments: unknown;
  commentRubric: unknown;
  settings: Record<string, unknown>;
  gradeExams: GradeExam[];
}
