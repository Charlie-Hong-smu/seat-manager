import type { FollowupTask, SeatManagerState, StudentId } from "./types";

export type TimelineType = "学生记录" | "出勤" | "跟进" | "宿舍" | "成绩" | "班费";
export type TimelineTone = "normal" | "reminder" | "danger" | "success" | "muted";
export type TimelineWorkspace = "attendance" | "followups" | "dormitories" | "scores" | "funds";

export interface TimelineTarget {
  kind: "student" | "workspace";
  workspace?: TimelineWorkspace;
  entityId: string;
  studentTab?: "records" | "followup";
  date?: string;
  studentId?: StudentId;
  disabledReason?: string;
}

export interface TimelineItem {
  id: string;
  date: string;
  occurredAt: string;
  type: TimelineType;
  title: string;
  studentId?: StudentId;
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

export function buildTimeline(state: SeatManagerState, today = new Date().toISOString().slice(0, 10)): TimelineItem[] {
  const items: TimelineItem[] = [];
  const studentMap = new Map(state.students.map(student => [student.id, student.name]));
  state.students.forEach(student => student.records.forEach(record => items.push(finishItem({
    id: `record-${student.id}-${record.id}`, date: record.date, occurredAt: safeOccurredAt(record.date), type: "学生记录", title: record.note,
    studentId: student.id, studentName: student.name, detail: record.type === "reward" ? "奖励记录" : record.type === "punish" ? "纪律记录" : "日常记录",
    tone: record.type === "reward" ? "success" : record.type === "punish" ? "danger" : "normal",
    target: { kind: "student", entityId: student.id, studentId: student.id, studentTab: "records" },
  }))));
  state.gradeExams.forEach(exam => items.push(finishItem({
    id: `exam-${exam.id}`, date: exam.date, occurredAt: safeOccurredAt(exam.date, exam.savedAt), type: "成绩", title: exam.name,
    detail: `${exam.rows.length} 名学生`, tone: "normal", target: { kind: "workspace", workspace: "scores", entityId: exam.id },
  })));
  state.dormitories.forEach(dorm => dorm.events.forEach(event => {
    const studentId = event.responsibleStudentIds?.[0] || event.responsibleStudentId;
    items.push(finishItem({
      id: `dorm-${event.id}`, date: event.date, occurredAt: safeOccurredAt(event.date, event.createdAt), type: "宿舍", title: `${dorm.name} · ${event.reason}`,
      studentId, studentName: studentId ? studentMap.get(studentId) || event.responsibleStudentNames?.[0] || event.responsibleStudentName || "未知学生" : undefined,
      detail: `${event.score > 0 ? "+" : ""}${event.score} 分${event.punishmentDone ? " · 已处理" : ""}`,
      tone: event.score < 0 ? "danger" : event.score > 0 ? "success" : "normal",
      target: { kind: "workspace", workspace: "dormitories", entityId: event.id, studentId },
    }));
  }));
  state.fundTransactions.forEach(tx => {
    const studentId = tx.relatedStudentIds?.[0] || tx.relatedStudentId;
    items.push(finishItem({
      id: `fund-${tx.id}`, date: tx.date, occurredAt: safeOccurredAt(tx.date, tx.voidedAt || tx.createdAt), type: "班费", title: tx.category,
      studentId, studentName: studentId ? studentMap.get(studentId) || tx.relatedStudentNames?.[0] || tx.relatedStudentName || "未知学生" : undefined,
      detail: `${tx.status === "void" ? "已作废 · " : ""}${tx.type === "income" ? "+" : "-"}¥${tx.amount.toFixed(2)}${tx.note ? ` · ${tx.note}` : ""}`,
      tone: tx.status === "void" ? "muted" : tx.type === "income" ? "success" : "normal",
      target: { kind: "workspace", workspace: "funds", entityId: tx.id, studentId },
    }));
  });
  state.attendanceRecords.forEach(record => {
    const title = record.status === "leave" ? "请假" : record.status === "absent" ? "缺勤" : record.late ? "迟到" : record.earlyLeave ? "早退" : "出勤备注";
    items.push(finishItem({
      id: `attendance-${record.id}`, date: record.date, occurredAt: safeOccurredAt(record.date, record.updatedAt), type: "出勤", title,
      studentId: record.studentId, studentName: studentMap.get(record.studentId) || "未知学生", detail: record.note || [record.late && "迟到", record.earlyLeave && "早退"].filter(Boolean).join("、") || "已登记异常",
      tone: record.status === "absent" ? "danger" : "reminder",
      target: { kind: "workspace", workspace: "attendance", entityId: record.id, date: record.date, studentId: record.studentId },
    }));
  });
  state.followupTasks.forEach(task => items.push(finishItem({
    id: `task-${task.id}`, date: task.updatedAt.slice(0, 10) || task.plannedDate, occurredAt: safeOccurredAt(task.updatedAt.slice(0, 10) || task.plannedDate, task.updatedAt), type: "跟进", title: task.title,
    studentId: task.studentId || undefined, studentName: task.studentId ? studentMap.get(task.studentId) || "未知学生" : "班级事项",
    detail: task.status === "completed" ? "已完成" : task.status === "cancelled" ? "已取消" : `截止 ${task.dueDate || "未设置"}`,
    tone: taskTone(task, today), isAi: task.source === "ai",
    target: { kind: "workspace", workspace: "followups", entityId: task.id, studentId: task.studentId || undefined },
  })));
  return items.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
}

export function filterTimeline(items: TimelineItem[], filter: TimelineFilter): TimelineItem[] {
  const query = filter.query?.trim().toLocaleLowerCase("zh-CN") || "";
  return items.filter(item => (!query || item.searchText.includes(query))
    && (!filter.studentId || item.studentId === filter.studentId)
    && (!filter.type || filter.type === "全部" || item.type === filter.type)
    && (!filter.startDate || item.date >= filter.startDate)
    && (!filter.endDate || item.date <= filter.endDate));
}

export function inspectStateHealth(state: SeatManagerState): HealthIssue[] {
  const issues: HealthIssue[] = [];
  const ids = new Set<string>(); const numbers = new Map<string, string>();
  state.students.forEach(student => { if (ids.has(student.id)) issues.push({ id: `duplicate-id-${student.id}`, severity: "critical", title: "学生 ID 重复", detail: student.name }); ids.add(student.id); if (student.studentNo) { const prior = numbers.get(student.studentNo); if (prior) issues.push({ id: `duplicate-no-${student.studentNo}`, severity: "warning", title: "学号重复", detail: `${prior}、${student.name}` }); else numbers.set(student.studentNo, student.name); } });
  state.seatOrder.forEach((id, index) => { if (id && !ids.has(id)) issues.push({ id: `seat-${index}`, severity: "critical", title: "座位引用了不存在的学生", detail: `第 ${index + 1} 个座位` }); });
  const dormOwner = new Map<string, string>(); state.dormitories.forEach(dorm => dorm.memberIds.forEach(id => { if (!ids.has(id)) issues.push({ id: `dorm-missing-${dorm.id}-${id}`, severity: "warning", title: "宿舍成员不存在", detail: dorm.name }); const prior = dormOwner.get(id); if (prior && prior !== dorm.name) issues.push({ id: `dorm-duplicate-${id}`, severity: "critical", title: "学生被分配到多个宿舍", detail: `${prior}、${dorm.name}` }); dormOwner.set(id, dorm.name); }));
  state.attendanceRecords.forEach(record => { if (!ids.has(record.studentId)) issues.push({ id: `attendance-orphan-${record.id}`, severity: "warning", title: "出勤记录引用了不存在的学生", detail: record.date }); });
  state.followupTasks.forEach(task => { if (task.studentId && !ids.has(task.studentId)) issues.push({ id: `task-orphan-${task.id}`, severity: "warning", title: "跟进任务引用了不存在的学生", detail: task.title }); });
  return issues;
}
