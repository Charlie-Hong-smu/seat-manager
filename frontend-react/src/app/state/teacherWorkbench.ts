import type {
  AppStudent,
  AttendanceRecord,
  ClassScheduleV1,
  CommunicationDraft,
  Dormitory,
  FollowupTask,
  GradeExam,
  GradeItemAnalysis,
  GradeQuestionDefinition,
  HomeworkAssignment,
  HomeworkStudentState,
  HomeworkStudentStatus,
  QuickRecordPreset,
  RecordType,
  StudentId,
} from "./types";
import { listDormitoryEvents } from "./dormitoryPeriods";

const HOMEWORK_STATUSES = new Set<HomeworkStudentStatus>(["unrecorded", "pending", "submitted", "resubmitted", "excused"]);
const RECORD_TYPES = new Set<RecordType>(["reward", "punish", "note"]);
export const DEFAULT_SUBJECT_CATALOG = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "政治", "地理"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createDefaultSchedule(): ClassScheduleV1 {
  return {
    version: 1,
    periods: Array.from({ length: 8 }, (_, index) => ({ id: `period-${index + 1}`, label: `第${index + 1}节` })),
    entries: [],
  };
}

export function createDefaultQuickRecordPresets(): QuickRecordPreset[] {
  return [
    { id: "preset-praise", label: "课堂表扬", type: "reward", note: "课堂表现积极", score: 1, enabled: true, order: 0 },
    { id: "preset-remind", label: "课堂提醒", type: "punish", note: "课堂行为需要提醒", score: -1, enabled: true, order: 1 },
    { id: "preset-observe", label: "随手记录", type: "note", note: "", enabled: true, order: 2 },
  ];
}

export function normalizeSubjectCatalog(value: unknown, usedSubjects: string[] = []): string[] {
  const configured = Array.isArray(value) ? value.map(text).filter(Boolean) : DEFAULT_SUBJECT_CATALOG;
  const merged = [...configured, ...usedSubjects.map(text).filter(Boolean)];
  const unique = merged.filter((subject, index) => merged.indexOf(subject) === index);
  return unique.length ? unique : [...DEFAULT_SUBJECT_CATALOG];
}

export function normalizeSchedule(value: unknown): ClassScheduleV1 {
  if (!isRecord(value)) return createDefaultSchedule();
  const periods = Array.isArray(value.periods) ? value.periods.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    return [{ id: text(item.id) || `period-${index + 1}`, label: text(item.label) || `第${index + 1}节`, startTime: text(item.startTime) || undefined, endTime: text(item.endTime) || undefined }];
  }) : [];
  const validPeriodIds = new Set(periods.map(item => item.id));
  const entries = Array.isArray(value.entries) ? value.entries.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const weekday = number(item.weekday);
    const periodId = text(item.periodId);
    const subject = text(item.subject);
    if (weekday < 1 || weekday > 7 || !validPeriodIds.has(periodId) || !subject) return [];
    return [{ id: text(item.id) || `schedule-${index}`, weekday, periodId, subject, note: text(item.note) || undefined }];
  }) : [];
  return { version: 1, periods: periods.length ? periods : createDefaultSchedule().periods, entries, importSource: isRecord(value.importSource) ? { filename: text(value.importSource.filename), importedAt: text(value.importSource.importedAt) } : undefined };
}

export function normalizeQuickRecordPresets(value: unknown): QuickRecordPreset[] {
  if (!Array.isArray(value)) return createDefaultQuickRecordPresets();
  const presets = value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const type = text(item.type) as RecordType;
    if (!RECORD_TYPES.has(type)) return [];
    const rawScore = Number(item.score);
    return [{ id: text(item.id) || `preset-${index}`, label: text(item.label) || "快捷记录", type, note: text(item.note), score: Number.isFinite(rawScore) ? rawScore : undefined, enabled: item.enabled !== false, order: number(item.order, index) }];
  });
  return presets.length ? presets.sort((a, b) => a.order - b.order) : createDefaultQuickRecordPresets();
}

function normalizeHomeworkState(value: unknown): HomeworkStudentState {
  const item = isRecord(value) ? value : {};
  const rawStatus = text(item.status) as HomeworkStudentStatus;
  return { status: HOMEWORK_STATUSES.has(rawStatus) ? rawStatus : "pending", note: text(item.note), updatedAt: text(item.updatedAt) || new Date().toISOString() };
}

export function normalizeHomeworkAssignments(value: unknown): HomeworkAssignment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item) || !text(item.title)) return [];
    const studentStates = isRecord(item.studentStates) ? Object.fromEntries(Object.entries(item.studentStates).map(([id, state]) => [id, normalizeHomeworkState(state)])) : {};
    const createdAt = text(item.createdAt) || new Date().toISOString();
    const lifecycle = item.lifecycle === "closed" || item.lifecycle === "archived" ? item.lifecycle : "active";
    const participantStudentIds = Array.isArray(item.participantStudentIds) ? item.participantStudentIds.map(text).filter(Boolean) : Object.keys(studentStates);
    return [{ id: text(item.id) || `homework-${index}`, title: text(item.title), subject: text(item.subject), assignedDate: text(item.assignedDate), dueDate: text(item.dueDate), note: text(item.note), studentStates, lifecycle, participantStudentIds, createdAt, updatedAt: text(item.updatedAt) || createdAt }];
  });
}

export function normalizeCommunicationDrafts(value: unknown): CommunicationDraft[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item) || !text(item.content)) return [];
    const scope = item.scope === "student" ? "student" : "class";
    const deliveryStatus = item.deliveryStatus === "shared" ? "shared" : "draft";
    const channel = ["家长群", "私聊", "电话记录", "纸质", "其他"].includes(text(item.channel)) ? text(item.channel) as CommunicationDraft["channel"] : undefined;
    return [{ id: text(item.id) || `communication-${index}`, scope, studentId: scope === "student" ? text(item.studentId) || undefined : undefined, startDate: text(item.startDate), endDate: text(item.endDate), facts: Array.isArray(item.facts) ? item.facts.map(text).filter(Boolean) : [], content: text(item.content), generatedBy: item.generatedBy === "ai" ? "ai" : "local", sourceDigest: text(item.sourceDigest), deliveryStatus, channel, sharedAt: text(item.sharedAt) || undefined, deliveryNote: text(item.deliveryNote) || undefined, updatedAt: text(item.updatedAt) || new Date().toISOString() }];
  });
}

export function parseScheduleRows(rows: string[][], filename = "课表"): ClassScheduleV1 {
  const clean = rows.filter(row => row.some(cell => text(cell)));
  if (clean.length < 2) throw new Error("schedule_empty");
  const headerIndex = clean.findIndex(row => row.some(cell => /周一|星期一|礼拜一/.test(text(cell))));
  const start = headerIndex >= 0 ? headerIndex : 0;
  const headers = clean[start].map(text);
  const weekdays = headers.map(header => {
    const labels = ["一", "二", "三", "四", "五", "六", "日"];
    return labels.findIndex(label => header.includes(`周${label}`) || header.includes(`星期${label}`) || header.includes(`礼拜${label}`)) + 1;
  });
  const periods = clean.slice(start + 1).map((row, index) => ({ id: `period-${index + 1}`, label: text(row[0]) || `第${index + 1}节` }));
  const entries = clean.slice(start + 1).flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) => {
    const weekday = weekdays[columnIndex];
    const subject = text(cell);
    return weekday && subject ? [{ id: `schedule-${weekday}-${rowIndex + 1}`, weekday, periodId: periods[rowIndex].id, subject }] : [];
  }));
  if (!entries.length) throw new Error("schedule_mapping_failed");
  return { version: 1, periods, entries, importSource: { filename, importedAt: new Date().toISOString() } };
}

export type TodayWorkItem = {
  id: string;
  kind: "task" | "attendance" | "homework";
  title: string;
  detail: string;
  urgency: 0 | 1 | 2 | 3;
  entityId: string;
  studentId?: StudentId;
};

export function buildTodayWorkItems(input: { date: string; students: AppStudent[]; attendance: AttendanceRecord[]; tasks: FollowupTask[]; homework: HomeworkAssignment[] }): TodayWorkItem[] {
  const names = new Map(input.students.map(student => [student.id, student.name]));
  const tasks = input.tasks.filter(task => task.status === "pending" && task.dueDate <= input.date).map(task => ({ id: `task:${task.id}`, kind: "task" as const, title: task.title, detail: `${task.studentId ? names.get(task.studentId) || "未知学生" : "班级事项"} · ${task.dueDate < input.date ? "已逾期" : "今日截止"}`, urgency: (task.dueDate < input.date ? 0 : 1) as 0 | 1, entityId: task.id, studentId: task.studentId || undefined }));
  const attendance = input.attendance.filter(item => item.date === input.date && (item.status !== "normal" || item.late || item.earlyLeave)).map(item => ({ id: `attendance:${item.id}`, kind: "attendance" as const, title: `${names.get(item.studentId) || "未知学生"}出勤异常`, detail: [item.status === "leave" ? "请假" : item.status === "absent" ? "缺勤" : "", item.late ? "迟到" : "", item.earlyLeave ? "早退" : ""].filter(Boolean).join(" · "), urgency: 2 as const, entityId: item.id, studentId: item.studentId }));
  const homework = input.homework.filter(item => (item.lifecycle || "active") === "active" && item.dueDate <= input.date).flatMap(item => {
    const participantIds = new Set(item.participantStudentIds?.length ? item.participantStudentIds : Object.keys(item.studentStates));
    const pendingIds = input.students.filter(student => participantIds.has(student.id) && item.studentStates[student.id]?.status === "pending").map(student => student.id);
    const unrecordedIds = input.students.filter(student => participantIds.has(student.id) && (item.studentStates[student.id]?.status || "unrecorded") === "unrecorded").map(student => student.id);
    const detail = [pendingIds.length ? `${pendingIds.length} 人未交` : "", unrecordedIds.length ? `${unrecordedIds.length} 人待登记` : "", item.dueDate < input.date ? "已逾期" : "今日截止"].filter(Boolean).join(" · ");
    return pendingIds.length || unrecordedIds.length ? [{ id: `homework:${item.id}`, kind: "homework" as const, title: item.title, detail, urgency: (pendingIds.length && item.dueDate < input.date ? 0 : 1) as 0 | 1, entityId: item.id }] : [];
  });
  return [...tasks, ...homework, ...attendance].sort((a, b) => a.urgency - b.urgency || a.title.localeCompare(b.title, "zh-CN"));
}

export function getWeekRange(date = new Date()): { startDate: string; endDate: string } {
  const day = date.getDay() || 7;
  const start = new Date(date);
  start.setDate(date.getDate() - day + 1);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const key = (value: Date) => value.toLocaleDateString("sv-SE");
  return { startDate: key(start), endDate: key(end) };
}

export function buildWeeklyFacts(input: { students: AppStudent[]; attendance: AttendanceRecord[]; tasks: FollowupTask[]; homework: HomeworkAssignment[]; dormitories?: Dormitory[]; gradeExams?: GradeExam[]; startDate: string; endDate: string; studentId?: StudentId }): string[] {
  const inRange = (date: string) => date >= input.startDate && date <= input.endDate;
  const studentIds = input.studentId ? new Set([input.studentId]) : new Set(input.students.map(student => student.id));
  const attendance = input.attendance.filter(item => studentIds.has(item.studentId) && inRange(item.date) && (item.status !== "normal" || item.late || item.earlyLeave));
  const completed = input.tasks.filter(item => (!input.studentId || item.studentId === input.studentId) && item.status === "completed" && item.completedAt && inRange(item.completedAt.slice(0, 10))).length;
  const pending = input.tasks.filter(item => (!input.studentId || item.studentId === input.studentId) && item.status === "pending" && item.dueDate <= input.endDate).length;
  const records = input.students.filter(student => studentIds.has(student.id)).flatMap(student => student.records).filter(record => inRange(record.date));
  const assignments = input.homework.filter(item => (item.lifecycle || "active") !== "archived" && (inRange(item.assignedDate) || inRange(item.dueDate)));
  const pendingHomework = assignments.reduce((sum, item) => { const participants = new Set(item.participantStudentIds?.length ? item.participantStudentIds : Object.keys(item.studentStates)); return sum + [...studentIds].filter(id => participants.has(id) && item.studentStates[id]?.status === "pending").length; }, 0);
  const unrecordedHomework = assignments.reduce((sum, item) => { const participants = new Set(item.participantStudentIds?.length ? item.participantStudentIds : Object.keys(item.studentStates)); return sum + [...studentIds].filter(id => participants.has(id) && (item.studentStates[id]?.status || "unrecorded") === "unrecorded").length; }, 0);
  const dormEvents = (input.dormitories || []).flatMap(dormitory => listDormitoryEvents(dormitory).map(item => item.event)).filter(event => inRange(event.date) && (!input.studentId || event.responsibleStudentId === input.studentId || event.responsibleStudentIds?.includes(input.studentId)));
  const gradeFacts = input.studentId
    ? input.students.find(student => student.id === input.studentId)?.exams.filter(exam => inRange(exam.date)).map(exam => `${exam.name}${exam.total !== undefined ? ` ${exam.total} 分` : ""}`) || []
    : (input.gradeExams || []).filter(exam => inRange(exam.date)).map(exam => exam.name);
  return [
    `出勤异常 ${attendance.length} 次`,
    `完成跟进 ${completed} 项，待处理 ${pending} 项`,
    `记录表扬 ${records.filter(item => item.type === "reward").length} 条、提醒 ${records.filter(item => item.type === "punish").length} 条`,
    `本周作业 ${assignments.length} 项，当前未交 ${pendingHomework} 人次、待登记 ${unrecordedHomework} 人次`,
    `宿舍事件 ${dormEvents.length} 条${dormEvents.filter(event => !event.punishmentDone).length ? `，待处理 ${dormEvents.filter(event => !event.punishmentDone).length} 条` : ""}`,
    `本周成绩记录 ${gradeFacts.length ? gradeFacts.join("、") : "无新增考试"}`,
  ];
}

export function buildLocalWeeklyDraft(scopeLabel: string, startDate: string, endDate: string, facts: string[]): string {
  return `${scopeLabel} ${startDate} 至 ${endDate} 周报\n\n${facts.map(item => `- ${item}`).join("\n")}\n\n建议结合本周课堂观察，确认需要继续跟进的事项。`;
}

export function digestFacts(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(36);
}

export function buildItemAnalysisFromWideRows(rows: string[][], exam: GradeExam): GradeItemAnalysis {
  const headers = rows[0] || [];
  const questionColumns = headers.map((header, index) => ({ header: text(header), index })).filter(item => /^(第?\s*\d+\s*题|q\s*\d+)/i.test(item.header));
  if (!questionColumns.length) throw new Error("item_columns_missing");
  const questions: GradeQuestionDefinition[] = questionColumns.map((item, index) => ({ id: `question-${index + 1}`, label: item.header || `第${index + 1}题`, subject: exam.subjects[0] || "未分类", maxScore: Math.max(1, ...rows.slice(1).map(row => number(row[item.index], 0))), knowledgePoints: [], sourceColumn: item.index }));
  const nameColumn = headers.findIndex(header => /姓名|学生/.test(text(header)));
  const studentByName = new Map(exam.rows.map(row => [row.name.replace(/\s+/g, ""), row.studentId]));
  return { questions, rows: rows.slice(1).filter(row => row.some(cell => text(cell))).map(row => { const studentName = text(row[nameColumn >= 0 ? nameColumn : 0]); return { studentId: studentByName.get(studentName.replace(/\s+/g, "")), studentName, scores: Object.fromEntries(questions.map(question => { const raw = text(row[question.sourceColumn]); return [question.id, raw === "" ? null : number(raw, 0)]; })) }; }), updatedAt: new Date().toISOString() };
}

export function getQuestionStats(itemAnalysis: GradeItemAnalysis) {
  return itemAnalysis.questions.map(question => {
    const values = itemAnalysis.rows.map(row => row.scores[question.id]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const rate = question.maxScore ? Math.round((average / question.maxScore) * 1000) / 10 : 0;
    const weakStudentIds = itemAnalysis.rows.filter(row => typeof row.scores[question.id] === "number" && (row.scores[question.id] || 0) / question.maxScore < 0.6).map(row => row.studentId).filter((id): id is string => Boolean(id));
    return { question, average: Math.round(average * 10) / 10, rate, weakStudentIds };
  }).sort((a, b) => a.rate - b.rate);
}

export function normalizeGradeItemAnalysis(value: unknown): GradeItemAnalysis | undefined {
  if (!isRecord(value) || !Array.isArray(value.questions) || !Array.isArray(value.rows)) return undefined;
  const questions = value.questions.flatMap((item, index): GradeQuestionDefinition[] => {
    if (!isRecord(item)) return [];
    const maxScore = number(item.maxScore);
    return maxScore > 0 ? [{ id: text(item.id) || `question-${index + 1}`, label: text(item.label) || `第${index + 1}题`, subject: text(item.subject) || "未分类", maxScore, description: text(item.description) || undefined, knowledgePoints: Array.isArray(item.knowledgePoints) ? item.knowledgePoints.map(text).filter(Boolean) : [], sourceColumn: number(item.sourceColumn, index) }] : [];
  });
  const questionIds = new Set(questions.map(item => item.id));
  const rows = value.rows.flatMap(item => {
    if (!isRecord(item) || !text(item.studentName) || !isRecord(item.scores)) return [];
    return [{ studentId: text(item.studentId) || undefined, studentName: text(item.studentName), scores: Object.fromEntries(Object.entries(item.scores).filter(([id]) => questionIds.has(id)).map(([id, score]) => [id, score === null || score === "" ? null : number(score)])) }];
  });
  return questions.length && rows.length ? { questions, rows, updatedAt: text(value.updatedAt) || new Date().toISOString() } : undefined;
}
