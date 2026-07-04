export type StudentId = string;
export type Gender = "男" | "女" | "";

export type RecordType = "reward" | "punish" | "note";

export interface StudentRecord {
  id: string;
  type: RecordType;
  note: string;
  date: string;
}

export type DormEventType = "reward" | "punish" | "note";

export interface DormEvent {
  id: string;
  dormId: string;
  type: DormEventType;
  score: number;
  reason: string;
  responsibleStudentId?: StudentId;
  responsibleStudentName?: string;
  note: string;
  /** 老师拟定的处罚措施（可选）。 */
  punishment?: string;
  /** 处罚是否已执行。 */
  punishmentDone?: boolean;
  date: string;
  createdAt: string;
}

export interface DormPeriodArchive {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  baseScore: number;
  finalScore: number;
  events: DormEvent[];
}

export interface Dormitory {
  id: string;
  name: string;
  memberIds: StudentId[];
  baseScore: number;
  currentScore: number;
  events: DormEvent[];
  periodStart: string;
  history: DormPeriodArchive[];
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

export interface SeatHistorySnapshot {
  id: string;
  time: string;
  note: string;
  rows: number;
  seats: string[];
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
  dormitoryId?: string;
  aiComments?: unknown;
}

export interface SeatManagerState {
  source: "legacy" | "mock";
  hasLegacyData: boolean;
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  lockedSeats: number[];
  seatSettings: SeatSettings;
  dormitories: Dormitory[];
  seatHistory: SeatHistorySnapshot[];
  savedExams: unknown[];
  exams: unknown[];
  manualTags: unknown[];
  autoTags: unknown[];
  aiComments: unknown;
  commentRubric: unknown;
  settings: Record<string, unknown>;
  gradeExams: GradeExam[];
}

// ── 多班级 / 学期(文件柜) ─────────────────────────────────────────────────
// 每个"切片"(WorkspaceSlice)保存一个班级在某个学期下的完整数据,
// 其 data 字段就是原来单一 localStorage 键 `homeroom-seat-manager-v1` 的完整内容,
// 结构不变。文件柜(WorkspaceBook)在最外层管理多个切片和当前选中项。

/** 学期季节:春 / 秋;或用户手动输入的自定义学期名。 */
export type TermSeason = "spring" | "autumn" | "custom";

export interface WorkspaceTerm {
  /** 学期唯一 id。 */
  id: string;
  /** 学年年份,如 2024;自定义学期可为 0。 */
  year: number;
  /** 季节。 */
  season: TermSeason;
  /** 显示名,如 "2024 秋" 或自定义文本。 */
  label: string;
  createdAt: string;
}

export interface WorkspaceSlice {
  /** 切片唯一 id(班级+学期的组合)。 */
  id: string;
  classId: string;
  className: string;
  term: WorkspaceTerm;
  /**
   * 结构化年级信息(新)。班级身份 = 学段 + 班号(跨学年不变),
   * 年级(gradeNumber)随学期变化。有这些字段时,班名按"学段+年级+班号"动态显示;
   * 老数据没有这些字段时,回退用 className 字符串。
   */
  stage?: "primary" | "junior" | "senior";
  /** 当前年级序号:小学 1-6,初中/高中 1-3。 */
  gradeNumber?: number;
  /** 班号,如 "2"。 */
  classNo?: string;
  /** 用户手动改过的班名(优先于自动拼接)。 */
  customName?: string;
  createdAt: string;
  updatedAt: string;
  /** 这个班级这个学期的完整数据(等同旧的单一 localStorage 内容)。 */
  data: Record<string, unknown>;
}

export interface WorkspaceBook {
  version: 1;
  /** 当前选中的切片 id。 */
  currentSliceId: string;
  slices: WorkspaceSlice[];
}

/** 给切换器 UI 用的精简班级视图:一个班级下有哪些学期切片。 */
export interface WorkspaceClassView {
  classId: string;
  className: string;
  slices: WorkspaceSlice[];
}
