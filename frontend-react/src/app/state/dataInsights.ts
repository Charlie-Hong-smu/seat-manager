import type { ActivityEvent, BusinessEntityRef, FollowupTask, SeatManagerState, StudentId } from "./types";
import { toLocalDateKey } from "./dateKey";

export type TimelineType = "学生记录" | "出勤" | "跟进" | "作业" | "沟通稿" | "宿舍" | "成绩" | "班费";
export type TimelineTone = "normal" | "reminder" | "danger" | "success" | "muted";
export type TimelineWorkspace = "today" | "attendance" | "followups" | "dormitories" | "scores" | "funds";

export interface TimelineTarget {
  kind: "student" | "workspace";
  workspace?: TimelineWorkspace;
  entityId: string;
  studentTab?: "records" | "followup";
  date?: string;
  studentId?: StudentId;
  subEntityId?: string;
  disabledReason?: string;
}

export interface TimelineItem {
  id: string;
  date: string;
  occurredAt: string;
  type: TimelineType;
  title: string;
  studentId?: StudentId;
  studentIds?: StudentId[];
  studentName?: string;
  detail: string;
  tone: TimelineTone;
  isAi?: boolean;
  target: TimelineTarget;
  searchText: string;
}

export interface TimelineFilter {
  query?: string;
  studentId?: StudentId;
  type?: TimelineType | "全部";
  startDate?: string;
  endDate?: string;
}

export interface HealthIssue { id: string; severity: "warning" | "critical"; title: string; detail: string }

function safeOccurredAt(date: string, timestamp?: string): string {
  if (timestamp && !Number.isNaN(new Date(timestamp).getTime())) return timestamp;
  return `${date || "0000-00-00"}T00:00:00.000`;
}

function taskTone(task: FollowupTask, today: string): TimelineTone {
  if (task.status === "completed") return "success";
  if (task.status === "cancelled") return "muted";
  if (task.dueDate && task.dueDate < today) return "danger";
  if (task.dueDate === today) return "reminder";
  return "normal";
}

function finishItem(item: Omit<TimelineItem, "searchText">): TimelineItem {
  return { ...item, searchText: [item.type, item.title, item.detail, item.studentName].filter(Boolean).join(" ").toLocaleLowerCase("zh-CN") };
}

export function targetFromBusinessRef(ref: BusinessEntityRef): TimelineTarget {
  if (ref.domain === "student") return { kind: "student", entityId: ref.entityId, studentId: ref.studentId || ref.entityId, studentTab: "records" };
  if (ref.domain === "attendance") return { kind: "workspace", workspace: "attendance", entityId: ref.entityId, studentId: ref.studentId, date: ref.date };
  if (ref.domain === "homework" || ref.domain === "followup") return { kind: "workspace", workspace: "followups", entityId: ref.entityId, studentId: ref.studentId };
  if (ref.domain === "dormitory") return { kind: "workspace", workspace: "dormitories", entityId: ref.entityId, studentId: ref.studentId };
  if (ref.domain === "score") return { kind: "workspace", workspace: "scores", entityId: ref.entityId, subEntityId: ref.subEntityId, studentId: ref.studentId };
  if (ref.domain === "communication") return ref.studentId ? { kind: "student", entityId: ref.studentId, studentId: ref.studentId, studentTab: "followup" } : { kind: "workspace", workspace: "today", entityId: ref.entityId };
  if (ref.domain === "fund") return { kind: "workspace", workspace: "funds", entityId: ref.entityId, studentId: ref.studentId };
  return { kind: "workspace", workspace: "today", entityId: ref.entityId, disabledReason: ref.domain === "ai" ? "这条 AI 建议没有可返回的原始页面" : "当前对象暂不支持直接打开" };
}

export function businessEntityExists(state: SeatManagerState, ref: BusinessEntityRef): boolean {
  if (ref.domain === "ai") return true;
  if (ref.domain === "student") return state.students.some(student => student.id === ref.entityId);
  if (ref.domain === "attendance") return state.attendanceRecords.some(item => item.id === ref.entityId) || Boolean(ref.date);
  if (ref.domain === "homework") return state.homeworkAssignments.some(item => item.id === ref.entityId);
  if (ref.domain === "dormitory") return state.dormitories.some(item => item.id === ref.entityId || [...item.events, ...item.history.flatMap(archive => archive.events)].some(event => event.id === ref.entityId));
  if (ref.domain === "score") { const exam = state.gradeExams.find(item => item.id === ref.entityId); return Boolean(exam && (!ref.subEntityId || exam.itemAnalysis?.questions.some(question => question.id === ref.subEntityId))); }
  if (ref.domain === "communication") return state.communicationDrafts.some(item => item.id === ref.entityId);
  if (ref.domain === "fund") return state.fundTransactions.some(item => item.id === ref.entityId);
  if (ref.domain === "followup") return state.followupTasks.some(item => item.id === ref.entityId);
  return true;
}

function activityType(event: ActivityEvent): TimelineType {
  if (event.ref.domain === "attendance") return "出勤";
  if (event.ref.domain === "homework") return "作业";
  if (event.ref.domain === "followup") return "跟进";
  if (event.ref.domain === "communication") return "沟通稿";
  if (event.ref.domain === "dormitory") return "宿舍";
  if (event.ref.domain === "score") return "成绩";
  if (event.ref.domain === "fund") return "班费";
  return "学生记录";
}

export function buildTimeline(state: SeatManagerState, today = toLocalDateKey()): TimelineItem[] {
  const items: TimelineItem[] = [];
  const studentMap = new Map(state.students.map(student => [student.id, student.name]));
  const activityKeys = new Set(state.activityEvents.map(event => `${event.ref.domain}:${event.ref.entityId}`));
  state.activityEvents.forEach(event => {
    const studentIds = Array.from(new Set([...(event.studentIds || []), ...(event.ref.studentId ? [event.ref.studentId] : [])]));
    const names = studentIds.map(id => studentMap.get(id)).filter(Boolean) as string[];
    items.push(finishItem({ id: event.id, date: event.occurredAt.slice(0, 10), occurredAt: event.occurredAt, type: activityType(event), title: event.title, studentId: studentIds[0], studentIds, studentName: names.join("、") || undefined, detail: event.detail, tone: event.action === "deleted" ? "muted" : event.action === "status_changed" ? "success" : "normal", isAi: event.ref.domain === "ai", target: targetFromBusinessRef(event.ref) }));
  });
  state.students.forEach(student => student.records.forEach(record => items.push(finishItem({
    id: `record-${student.id}-${record.id}`, date: record.date, occurredAt: safeOccurredAt(record.date), type: "学生记录", title: record.note,
    studentId: student.id, studentName: student.name, detail: record.type === "reward" ? "奖励记录" : record.type === "punish" ? "纪律记录" : "日常记录",
    tone: record.type === "reward" ? "success" : record.type === "punish" ? "danger" : "normal",
    target: { kind: "student", entityId: student.id, studentId: student.id, studentTab: "records" },
  }))));
  state.gradeExams.filter(exam => !activityKeys.has(`score:${exam.id}`)).forEach(exam => items.push(finishItem({
    id: `exam-${exam.id}`, date: exam.date, occurredAt: safeOccurredAt(exam.date, exam.savedAt), type: "成绩", title: exam.name,
    detail: `旧数据汇总 · ${exam.rows.length} 名学生`, tone: "normal", target: { kind: "workspace", workspace: "scores", entityId: exam.id },
  })));
  state.dormitories.forEach(dorm => dorm.events.forEach(event => {
    if (activityKeys.has(`dormitory:${event.id}`)) return;
    const studentIds = Array.from(new Set([...(event.responsibleStudentIds || []), ...(event.responsibleStudentId ? [event.responsibleStudentId] : [])]));
    const studentId = studentIds[0];
    items.push(finishItem({
      id: `dorm-${event.id}`, date: event.date, occurredAt: safeOccurredAt(event.date, event.createdAt), type: "宿舍", title: `${dorm.name} · ${event.reason}`,
      studentId, studentIds, studentName: studentIds.map(id => studentMap.get(id)).filter(Boolean).join("、") || event.responsibleStudentNames?.join("、") || event.responsibleStudentName || undefined,
      detail: `旧数据汇总 · ${event.score > 0 ? "+" : ""}${event.score} 分${event.punishmentDone ? " · 已处理" : ""}`,
      tone: event.score < 0 ? "danger" : event.score > 0 ? "success" : "normal",
      target: { kind: "workspace", workspace: "dormitories", entityId: event.id, studentId },
    }));
  }));
  state.fundTransactions.forEach(tx => {
    if (activityKeys.has(`fund:${tx.id}`)) return;
    const studentIds = Array.from(new Set([...(tx.relatedStudentIds || []), ...(tx.relatedStudentId ? [tx.relatedStudentId] : [])]));
    const studentId = studentIds[0];
    items.push(finishItem({
      id: `fund-${tx.id}`, date: tx.date, occurredAt: safeOccurredAt(tx.date, tx.voidedAt || tx.createdAt), type: "班费", title: tx.category,
      studentId, studentIds, studentName: studentIds.map(id => studentMap.get(id)).filter(Boolean).join("、") || tx.relatedStudentNames?.join("、") || tx.relatedStudentName || undefined,
      detail: `旧数据汇总 · ${tx.status === "void" ? "已作废 · " : ""}${tx.type === "income" ? "+" : "-"}¥${tx.amount.toFixed(2)}${tx.note ? ` · ${tx.note}` : ""}`,
      tone: tx.status === "void" ? "muted" : tx.type === "income" ? "success" : "normal",
      target: { kind: "workspace", workspace: "funds", entityId: tx.id, studentId },
    }));
  });
  state.attendanceRecords.filter(record => !activityKeys.has(`attendance:${record.id}`)).forEach(record => {
    const title = record.status === "leave" ? "请假" : record.status === "absent" ? "缺勤" : record.late ? "迟到" : record.earlyLeave ? "早退" : "出勤备注";
    items.push(finishItem({
      id: `attendance-${record.id}`, date: record.date, occurredAt: safeOccurredAt(record.date, record.updatedAt), type: "出勤", title,
      studentId: record.studentId, studentIds: [record.studentId], studentName: studentMap.get(record.studentId) || "未知学生", detail: `旧数据汇总 · ${record.note || [record.late && "迟到", record.earlyLeave && "早退"].filter(Boolean).join("、") || "已登记异常"}`,
      tone: record.status === "absent" ? "danger" : "reminder",
      target: { kind: "workspace", workspace: "attendance", entityId: record.id, date: record.date, studentId: record.studentId },
    }));
  });
  state.followupTasks.filter(task => !activityKeys.has(`followup:${task.id}`)).forEach(task => items.push(finishItem({
    id: `task-${task.id}`, date: task.updatedAt.slice(0, 10) || task.plannedDate, occurredAt: safeOccurredAt(task.updatedAt.slice(0, 10) || task.plannedDate, task.updatedAt), type: "跟进", title: task.title,
    studentId: task.studentId || undefined, studentName: task.studentId ? studentMap.get(task.studentId) || "未知学生" : "班级事项",
    detail: `旧数据汇总 · ${task.status === "completed" ? "已完成" : task.status === "cancelled" ? "已取消" : `截止 ${task.dueDate || "未设置"}`}`,
    tone: taskTone(task, today), isAi: task.source === "ai",
    target: { kind: "workspace", workspace: "followups", entityId: task.id, studentId: task.studentId || undefined },
  })));
  state.homeworkAssignments.filter(assignment => !activityKeys.has(`homework:${assignment.id}`)).forEach(assignment => items.push(finishItem({
    id: `homework-${assignment.id}`, date: assignment.updatedAt.slice(0, 10) || assignment.assignedDate, occurredAt: safeOccurredAt(assignment.updatedAt.slice(0, 10) || assignment.assignedDate, assignment.updatedAt), type: "作业", title: assignment.title,
    detail: `旧数据汇总 · ${assignment.subject || "未分类"} · 截止 ${assignment.dueDate}`, tone: assignment.dueDate < today ? "reminder" : "normal",
    target: { kind: "workspace", workspace: "followups", entityId: assignment.id },
  })));
  state.communicationDrafts.filter(draft => !activityKeys.has(`communication:${draft.id}`)).forEach(draft => items.push(finishItem({
    id: `communication-${draft.id}`, date: draft.updatedAt.slice(0, 10), occurredAt: safeOccurredAt(draft.updatedAt.slice(0, 10), draft.updatedAt), type: "沟通稿", title: draft.scope === "student" ? "个人周沟通稿" : "班级周报",
    studentId: draft.studentId, studentIds: draft.studentId ? [draft.studentId] : [], studentName: draft.studentId ? studentMap.get(draft.studentId) || "未知学生" : undefined, detail: `旧数据汇总 · ${draft.startDate} 至 ${draft.endDate} · ${draft.deliveryStatus === "shared" ? `已通过${draft.channel || "其他方式"}分享` : draft.generatedBy === "ai" ? "AI 润色" : "本地草稿"}`, tone: draft.deliveryStatus === "shared" ? "success" : "normal", isAi: draft.generatedBy === "ai",
    target: draft.studentId ? { kind: "student", entityId: draft.studentId, studentId: draft.studentId, studentTab: "followup" } : { kind: "workspace", workspace: "today", entityId: draft.id },
  })));
  return items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
}

export function filterTimeline(items: TimelineItem[], filter: TimelineFilter): TimelineItem[] {
  const query = filter.query?.trim().toLocaleLowerCase("zh-CN") || "";
  return items.filter(item => (!query || item.searchText.includes(query))
    && (!filter.studentId || item.studentId === filter.studentId || item.studentIds?.includes(filter.studentId))
    && (!filter.type || filter.type === "全部" || item.type === filter.type)
    && (!filter.startDate || item.date >= filter.startDate)
    && (!filter.endDate || item.date <= filter.endDate));
}

export function inspectStateHealth(state: SeatManagerState): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const ids = new Set<string>(); const numbers = new Map<string, string>();
  state.students.forEach(student => { if (ids.has(student.id)) issues.push({ id: `duplicate-id-${student.id}`, severity: "critical", title: "学生 ID 重复", detail: student.name }); ids.add(student.id); if (student.studentNo) { const prior = numbers.get(student.studentNo); if (prior) issues.push({ id: `duplicate-no-${student.studentNo}`, severity: "warning", title: "学号重复", detail: `${prior}、${student.name}` }); else numbers.set(student.studentNo, student.name); } });
  const seated = new Map<string, number>(); state.seatOrder.forEach((id, index) => { if (id && !ids.has(id)) issues.push({ id: `seat-${index}`, severity: "critical", title: "座位引用了不存在的学生", detail: `第 ${index + 1} 个座位` }); if (id) { const prior = seated.get(id); if (prior !== undefined) issues.push({ id: `seat-duplicate-${id}-${index}`, severity: "critical", title: "同一学生占用了多个座位", detail: `第 ${prior + 1}、${index + 1} 个座位` }); else seated.set(id, index); } });
  state.lockedSeats.forEach(index => { if (!Number.isInteger(index) || index < 0 || index >= state.seatOrder.length) issues.push({ id: `locked-seat-${index}`, severity: "warning", title: "锁定座位超出当前座位范围", detail: `座位索引 ${index}` }); });
  const dormOwner = new Map<string, string>(); state.dormitories.forEach(dorm => dorm.memberIds.forEach(id => { if (!ids.has(id)) issues.push({ id: `dorm-missing-${dorm.id}-${id}`, severity: "warning", title: "宿舍成员不存在", detail: dorm.name }); const prior = dormOwner.get(id); if (prior && prior !== dorm.name) issues.push({ id: `dorm-duplicate-${id}`, severity: "critical", title: "学生被分配到多个宿舍", detail: `${prior}、${dorm.name}` }); dormOwner.set(id, dorm.name); }));
  state.attendanceRecords.forEach(record => { if (!ids.has(record.studentId)) issues.push({ id: `attendance-orphan-${record.id}`, severity: "warning", title: "出勤记录引用了不存在的学生", detail: record.date }); });
  state.followupTasks.forEach(task => { if (task.studentId && !ids.has(task.studentId)) issues.push({ id: `task-orphan-${task.id}`, severity: "warning", title: "跟进任务引用了不存在的学生", detail: task.title }); });
  state.homeworkAssignments.forEach(assignment => Object.keys(assignment.studentStates).forEach(id => { if (!ids.has(id)) issues.push({ id: `homework-orphan-${assignment.id}-${id}`, severity: "warning", title: "作业引用了不存在的学生", detail: assignment.title }); }));
  state.drawSessions.forEach(session => session.studentIds.forEach(id => { if (!ids.has(id)) issues.push({ id: `draw-orphan-${session.id}-${id}`, severity: "warning", title: "抽签记录引用了不存在的学生", detail: session.date }); }));
  state.fundTransactions.forEach(tx => [...(tx.relatedStudentIds || []), ...(tx.relatedStudentId ? [tx.relatedStudentId] : [])].forEach(id => { if (!ids.has(id)) issues.push({ id: `fund-orphan-${tx.id}-${id}`, severity: "warning", title: "班费记录引用了不存在的学生", detail: tx.category }); }));
  state.dormitories.forEach(dorm => [...dorm.events, ...dorm.history.flatMap(archive => archive.events)].forEach(event => [...(event.responsibleStudentIds || []), ...(event.responsibleStudentId ? [event.responsibleStudentId] : [])].forEach(id => { if (!ids.has(id)) issues.push({ id: `dorm-event-orphan-${event.id}-${id}`, severity: "warning", title: "宿舍事件引用了不存在的学生", detail: `${dorm.name} · ${event.reason}` }); })));
  state.gradeExams.forEach(exam => exam.rows.forEach(row => { if (row.studentId && !ids.has(row.studentId)) issues.push({ id: `exam-orphan-${exam.id}-${row.id}`, severity: "warning", title: "成绩记录引用了不存在的学生", detail: `${exam.name} · ${row.name}` }); }));
  state.communicationDrafts.forEach(draft => { if (draft.studentId && !ids.has(draft.studentId)) issues.push({ id: `communication-orphan-${draft.id}`, severity: "warning", title: "沟通稿引用了不存在的学生", detail: draft.startDate }); });
  state.gradeExams.forEach(exam => exam.itemAnalysis?.rows.forEach((row, index) => { if (row.studentId && !ids.has(row.studentId)) issues.push({ id: `item-analysis-orphan-${exam.id}-${index}`, severity: "warning", title: "题目分析引用了不存在的学生", detail: `${exam.name} · ${row.studentName}` }); }));
  state.followupTasks.forEach(task => { if (task.sourceRef && !businessEntityExists(state, task.sourceRef)) issues.push({ id: `task-source-orphan-${task.id}`, severity: "warning", title: "跟进任务的来源已不存在", detail: task.title }); });
  const taskIds = new Set(state.followupTasks.map(task => task.id));
  state.dormitories.forEach(dorm => dorm.events.forEach(event => event.followupTaskIds?.forEach(id => { if (!taskIds.has(id)) issues.push({ id: `dorm-task-orphan-${event.id}-${id}`, severity: "warning", title: "宿舍事件关联任务不存在", detail: `${dorm.name} · ${event.reason}` }); })));
  return issues;
}
