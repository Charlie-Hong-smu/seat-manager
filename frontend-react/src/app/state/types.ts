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

export type CommentStyle = "warm" | "formal" | "brief";
export type CommentLengthMode = "short" | "standard" | "long" | "custom";

export interface StudentCommentDraft {
  generatedComment: string;
  teacherNote: string;
  style: CommentStyle;
  lengthMode: CommentLengthMode;
  targetWordCount: number;
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
  savedExams: unknown[];
  exams: unknown[];
  manualTags: unknown[];
  autoTags: unknown[];
  aiComments: unknown;
  commentRubric: unknown;
  settings: Record<string, unknown>;
  gradeExams: GradeExam[];
}
