export type StudentId = string;
export type Gender = "男" | "女" | "";

export type RecordType = "reward" | "punish" | "note";

export interface StudentRecord {
  id: string;
  type: RecordType;
  note: string;
  date: string;
  score?: number;
  presetId?: string;
  createdAt?: string;
}

export interface QuickRecordPreset {
  id: string;
  label: string;
  type: RecordType;
  note: string;
  score?: number;
  enabled: boolean;
  order: number;
}

export interface SchedulePeriod {
  id: string;
  label: string;
  startTime?: string;
  endTime?: string;
}

export interface ScheduleEntry {
  id: string;
  weekday: number;
  periodId: string;
  subject: string;
  note?: string;
}

export interface ClassScheduleV1 {
  version: 1;
  periods: SchedulePeriod[];
  entries: ScheduleEntry[];
  importSource?: { filename: string; importedAt: string };
}

export type HomeworkStudentStatus = "unrecorded" | "pending" | "submitted" | "resubmitted" | "excused";

export interface HomeworkStudentState {
  status: HomeworkStudentStatus;
  note: string;
  updatedAt: string;
}

export interface HomeworkAssignment {
  id: string;
  title: string;
  subject: string;
  assignedDate: string;
  dueDate: string;
  note: string;
  studentStates: Record<StudentId, HomeworkStudentState>;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationDraft {
  id: string;
  scope: "class" | "student";
  studentId?: StudentId;
  startDate: string;
  endDate: string;
  facts: string[];
  content: string;
  generatedBy: "local" | "ai";
  sourceDigest: string;
  updatedAt: string;
}

export type DormEventType = "reward" | "punish" | "note";

export interface DormEvent {
  id: string;
  dormId: string;
  type: DormEventType;
  score: number;
  reason: string;
  /** @deprecated 旧字段，仅保留向后兼容（单个责任人）。新数据请用 responsibleStudentIds。 */
  responsibleStudentId?: StudentId;
  /** @deprecated 旧字段，仅保留向后兼容。 */
  responsibleStudentName?: string;
  /** 多个责任人 ID（新）。 */
  responsibleStudentIds?: StudentId[];
  /** 多个责任人姓名（新）。 */
  responsibleStudentNames?: string[];
  note: string;
  /** 老师拟定的处罚措施（可选）。 */
  punishment?: string;
  /** 处罚是否已执行。 */
  punishmentDone?: boolean;
  followupTaskIds?: string[];
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

export type DormitoryPeriodMode = "week" | "month" | "custom";

export interface DormitoryPeriodSettings {
  anchorDate: string;
  unit: "week" | "month";
  intervalCount: number;
}

// ── 班费管理 ──────────────────────────────────────────────────────────────
export type FundTxType = "income" | "expense";

export interface FundTransaction {
  id: string;
  type: FundTxType;
  amount: number;
  category: string;
  note: string;
  /** @deprecated 旧字段，仅保留向后兼容（单个关联学生）。新数据请用 relatedStudentIds。 */
  relatedStudentId?: StudentId;
  /** @deprecated 旧字段，仅保留向后兼容。 */
  relatedStudentName?: string;
  /** 多个关联学生 ID（新）。 */
  relatedStudentIds?: StudentId[];
  /** 多个关联学生姓名（新）。 */
  relatedStudentNames?: string[];
  date: string;
  createdAt: string;
  status: "active" | "void";
  voidedAt?: string;
  voidReason?: string;
}

export type AttendanceStatus = "normal" | "leave" | "absent";

export interface AttendanceRecord {
  id: string;
  studentId: StudentId;
  date: string;
  status: AttendanceStatus;
  late: boolean;
  earlyLeave: boolean;
  note: string;
  leaveStart?: string;
  leaveEnd?: string;
  createdAt: string;
  updatedAt: string;
}

export type FollowupTaskStatus = "pending" | "completed" | "cancelled";
export type FollowupTaskSource = "manual" | "ai" | "score" | "attendance" | "dormitory" | "homework";

export interface FollowupTask {
  id: string;
  /** 空字符串表示不绑定具体学生的班级事项。 */
  studentId: StudentId;
  title: string;
  type: string;
  description: string;
  plannedDate: string;
  dueDate: string;
  status: FollowupTaskStatus;
  source: FollowupTaskSource;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  lastNotifiedAt?: string;
  sourceRef?: { domain: "dormitory" | "attendance" | "ai" | "homework" | "score"; entityId: string };
}

export interface DrawSession {
  id: string;
  date: string;
  studentIds: StudentId[];
  createdAt: string;
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
  studentNo?: string;
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
  importSource?: ScoreImportSource;
  itemAnalysis?: GradeItemAnalysis;
}

export interface GradeQuestionDefinition {
  id: string;
  label: string;
  subject: string;
  maxScore: number;
  description?: string;
  knowledgePoints: string[];
  sourceColumn: number;
}

export interface GradeItemAnalysisRow {
  studentId?: StudentId;
  studentName: string;
  scores: Record<string, number | null>;
}

export interface GradeItemAnalysis {
  questions: GradeQuestionDefinition[];
  rows: GradeItemAnalysisRow[];
  updatedAt: string;
}

export interface SeatPairRule {
  a: StudentId;
  b: StudentId;
  /** 旧规则缺省为相邻；group 表示必须同组或不能同组。 */
  scope?: "neighbor" | "group";
}

export type SeatLayoutTemplate = "default-grid" | "grid" | "group-grid" | "round-table" | "freeform";
export type SeatFrontEdge = "top" | "bottom" | "left" | "right";

export interface SeatLayoutNode {
  id: string;
  x: number;
  y: number;
  rotation: number;
  label: string;
  groupId?: string;
}

export interface SeatLayoutGroup {
  id: string;
  name: string;
  shape: "columns" | "grid" | "round" | "custom";
  seatIds: string[];
}

export interface SeatLayoutEdge {
  a: string;
  b: string;
}

export interface SeatLayoutV1 {
  version: 1;
  template: SeatLayoutTemplate;
  frontEdge: SeatFrontEdge;
  canvas: { width: number; height: number };
  seats: SeatLayoutNode[];
  groups: SeatLayoutGroup[];
  neighborEdges: SeatLayoutEdge[];
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
  /** 默认 off，保持旧版只评价邻座；开启后同时评价整组构成。 */
  groupBalanceMode: "off" | "neighbor-and-group";
  /** 缺失时按当前 seatOrder 派生原有 8 列布局。 */
  layout?: SeatLayoutV1;
  constraints: SeatConstraints;
}

export interface SeatHistorySnapshot {
  id: string;
  time: string;
  note: string;
  rows: number;
  seats: string[];
  layout?: SeatLayoutV1;
}

export interface SavedGradeExamEntry {
  name: string;
  studentNo?: string;
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
  importSource?: ScoreImportSource;
  itemAnalysis?: GradeItemAnalysis;
}

export interface ScoreImportDraft {
  filename: string;
  subjects: string[];
  entries: SavedGradeExamEntry[];
  rowCount: number;
  warnings: string[];
}

export interface ScoreImportSource {
  filename: string;
  rows: string[][];
  mapping: {
    headers: string[];
    nameCol: number;
    studentNoCol: number;
    subjectMappings: Array<{ subject: string; scoreCol: number; rankClassCol: number; rankSchoolCol: number }>;
    totalMapping: { scoreCol: number; rankClassCol: number; rankSchoolCol: number };
    warnings: string[];
  };
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
  studentNo?: string;
  gender: Gender;
  aliases: string[];
  parentPhone?: string;
  address?: string;
  emergencyContact?: string;
  isBoarding?: boolean;
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
  fundTransactions: FundTransaction[];
  attendanceRecords: AttendanceRecord[];
  followupTasks: FollowupTask[];
  drawSessions: DrawSession[];
  schedule: ClassScheduleV1;
  homeworkAssignments: HomeworkAssignment[];
  quickRecordPresets: QuickRecordPreset[];
  communicationDrafts: CommunicationDraft[];
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
