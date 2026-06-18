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
}
