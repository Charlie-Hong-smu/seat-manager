import { followupStudentLabel } from "./followupStudents";
import { listDormitoryEvents } from "./dormitoryPeriods";
import type {
  AppStudent,
  BusinessDomain,
  BusinessEntityPreviewFallback,
  BusinessEntityPreviewModel,
  BusinessEntityRef,
  GradeRow,
  SeatManagerState,
  StudentExamSummary,
} from "./types";

const DOMAIN_LABELS: Record<BusinessDomain, string> = {
  student: "学生记录",
  attendance: "出勤",
  followup: "跟进任务",
  homework: "作业",
  dormitory: "宿舍",
  score: "成绩",
  communication: "家校沟通",
  fund: "班费",
  seat: "座位",
  draw: "抽签",
  schedule: "课表",
  ai: "AI 建议",
};

const NAVIGATION_LABELS: Partial<Record<BusinessDomain, string>> = {
  student: "前往学生记录",
  attendance: "前往出勤工作区",
  followup: "前往任务工作区",
  homework: "前往作业工作区",
  dormitory: "前往宿舍工作区",
  score: "前往成绩工作区",
  communication: "前往沟通记录",
  fund: "前往班费工作区",
};

function unavailable(ref: BusinessEntityRef, fallback?: BusinessEntityPreviewFallback): BusinessEntityPreviewModel {
  return {
    ref,
    domainLabel: DOMAIN_LABELS[ref.domain],
    title: fallback?.title || "原始内容已不存在",
    subtitle: fallback?.occurredAt?.slice(0, 10),
    description: fallback?.detail || "这条历史记录仍可查看，但对应的业务内容可能已删除或来自旧版数据。",
    facts: [],
    availability: "missing",
    status: "无法定位",
    statusTone: "muted",
  };
}

function unsupported(ref: BusinessEntityRef, fallback?: BusinessEntityPreviewFallback): BusinessEntityPreviewModel {
  return {
    ref,
    domainLabel: DOMAIN_LABELS[ref.domain],
    title: fallback?.title || DOMAIN_LABELS[ref.domain],
    subtitle: fallback?.occurredAt?.slice(0, 10),
    description: fallback?.detail || "当前记录可以在这里查看摘要，暂不支持打开独立工作区。",
    facts: [],
    availability: "unsupported",
    status: "仅供查看",
    statusTone: "muted",
  };
}

function totalForExam(exam: StudentExamSummary): number {
  return typeof exam.total === "number" ? exam.total : Object.values(exam.scores).reduce((sum, score) => sum + score, 0);
}

function findGradeRow(state: SeatManagerState, ref: BusinessEntityRef): { examName: string; examDate: string; row: GradeRow; subjects: string[] } | null {
  const exam = state.gradeExams.find(item => item.id === ref.entityId);
  if (!exam) return null;
  const student = ref.studentId ? state.students.find(item => item.id === ref.studentId) : undefined;
  const row = exam.rows.find(item => item.studentId === ref.studentId)
    || exam.rows.find(item => student && item.name === student.name);
  return row ? { examName: exam.name, examDate: exam.date, row, subjects: exam.subjects } : null;
}

function scorePreview(state: SeatManagerState, ref: BusinessEntityRef, fallback?: BusinessEntityPreviewFallback): BusinessEntityPreviewModel {
  const student = ref.studentId ? state.students.find(item => item.id === ref.studentId) : undefined;
  const summaries = student ? [...student.exams].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const summaryIndex = summaries.findIndex(exam => exam.id === ref.entityId);
  const summary = summaryIndex >= 0 ? summaries[summaryIndex] : undefined;
  const grade = findGradeRow(state, ref);
  if (!summary && !grade) return unavailable(ref, fallback);

  const scores = summary?.scores || Object.fromEntries(
    Object.entries(grade?.row.scores || {}).flatMap(([subject, cell]) => typeof cell.score === "number" ? [[subject, cell.score]] : []),
  );
  const total = summary ? totalForExam(summary) : grade?.row.total;
  const previous = summaryIndex > 0 ? summaries[summaryIndex - 1] : undefined;
  const subjectSummary = Object.entries(scores)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 4)
    .map(([subject, score]) => `${subject} ${score}`)
    .join(" · ");
  const rank = summary?.rank
    ? (/名|第/.test(summary.rank) ? summary.rank : `班级第 ${summary.rank} 名`)
    : grade?.row.rankClass ? `班级第 ${grade.row.rankClass} 名` : "";
  const previousRank = Number.parseInt(previous?.rank || "", 10);
  const currentRank = Number.parseInt(summary?.rank || String(grade?.row.rankClass || ""), 10);
  const rankImprovement = Number.isFinite(previousRank) && Number.isFinite(currentRank) ? previousRank - currentRank : undefined;

  return {
    ref,
    domainLabel: DOMAIN_LABELS.score,
    title: summary?.name || grade?.examName || fallback?.title || "考试成绩",
    subtitle: summary?.date || grade?.examDate,
    status: rankImprovement === undefined ? "成绩记录" : rankImprovement > 0 ? `较上次排名进步 ${rankImprovement} 名` : rankImprovement < 0 ? `较上次排名退步 ${Math.abs(rankImprovement)} 名` : "较上次排名持平",
    statusTone: rankImprovement === undefined || rankImprovement === 0 ? "default" : rankImprovement > 0 ? "success" : "warning",
    facts: [
      ...(typeof total === "number" ? [{ label: "总分", value: String(total) }] : []),
      ...(rank ? [{ label: "排名", value: rank }] : []),
      ...(previous ? [{ label: "对比考试", value: previous.name }] : []),
      ...(subjectSummary ? [{ label: "主要科目", value: subjectSummary }] : []),
    ],
    availability: "available",
    navigationLabel: NAVIGATION_LABELS.score,
  };
}

export function resolveBusinessEntityPreview(
  state: SeatManagerState,
  ref: BusinessEntityRef,
  fallback?: BusinessEntityPreviewFallback,
): BusinessEntityPreviewModel {
  if (ref.domain === "followup") {
    const task = state.followupTasks.find(item => item.id === ref.entityId);
    if (!task) return unavailable(ref, fallback);
    const status = task.status === "pending" ? "待处理" : task.status === "completed" ? "已完成" : "已取消";
    return { ref, domainLabel: DOMAIN_LABELS.followup, title: task.title, subtitle: task.type, status, statusTone: task.status === "pending" ? "warning" : task.status === "completed" ? "success" : "muted", facts: [{ label: "关联学生", value: followupStudentLabel(task, new Map(state.students.map(student => [student.id, student.name]))) }, { label: "计划日期", value: task.plannedDate || "未设置" }, { label: "截止日期", value: task.dueDate || "未设置" }, { label: "来源", value: task.source === "ai" ? "AI 建议" : task.source === "manual" ? "手动创建" : task.source }], description: task.resolutionNote ? `${task.description ? `${task.description}\n` : ""}处理结果：${task.resolutionNote}` : task.description, availability: "available", navigationLabel: NAVIGATION_LABELS.followup };
  }

  if (ref.domain === "homework") {
    const assignment = state.homeworkAssignments.find(item => item.id === ref.entityId);
    if (!assignment) return unavailable(ref, fallback);
    const studentState = ref.studentId ? assignment.studentStates[ref.studentId] : undefined;
    const statusLabels = { unrecorded: "待登记", pending: "未交", submitted: "已交", resubmitted: "补交", excused: "免交" } as const;
    const status = studentState ? statusLabels[studentState.status] : assignment.lifecycle === "archived" ? "已归档" : assignment.lifecycle === "closed" ? "已结束" : "进行中";
    return { ref, domainLabel: DOMAIN_LABELS.homework, title: assignment.title, subtitle: assignment.subject, status, statusTone: studentState?.status === "pending" ? "danger" : studentState?.status === "submitted" || studentState?.status === "resubmitted" ? "success" : "default", facts: [{ label: "布置日期", value: assignment.assignedDate }, { label: "截止日期", value: assignment.dueDate }, ...(studentState?.updatedAt ? [{ label: "状态更新", value: studentState.updatedAt.slice(0, 10) }] : [])], description: studentState?.note || assignment.note, availability: "available", navigationLabel: NAVIGATION_LABELS.homework };
  }

  if (ref.domain === "attendance") {
    const record = state.attendanceRecords.find(item => item.id === ref.entityId)
      || state.attendanceRecords.find(item => item.studentId === ref.studentId && item.date === ref.date);
    if (!record) return unavailable(ref, fallback);
    const labels = [record.status === "leave" ? "请假" : record.status === "absent" ? "缺勤" : "正常", record.late ? "迟到" : "", record.earlyLeave ? "早退" : ""].filter(Boolean);
    return { ref, domainLabel: DOMAIN_LABELS.attendance, title: labels.join(" · "), subtitle: record.date, status: record.status === "normal" && !record.late && !record.earlyLeave ? "正常" : "出勤异常", statusTone: record.status === "absent" ? "danger" : record.status === "normal" ? "default" : "warning", facts: [...(record.leaveStart ? [{ label: "开始时间", value: record.leaveStart }] : []), ...(record.leaveEnd ? [{ label: "结束时间", value: record.leaveEnd }] : [])], description: record.note, availability: "available", navigationLabel: NAVIGATION_LABELS.attendance };
  }

  if (ref.domain === "dormitory") {
    const match = state.dormitories.flatMap(dormitory => listDormitoryEvents(dormitory).map(({ event }) => ({ dormitory, event }))).find(item => item.event.id === ref.entityId);
    if (!match) return unavailable(ref, fallback);
    const { dormitory, event } = match;
    return { ref, domainLabel: DOMAIN_LABELS.dormitory, title: event.reason, subtitle: `${dormitory.name} · ${event.date}`, status: event.punishment ? event.punishmentDone ? "处理已执行" : "待执行处理" : "宿舍记录", statusTone: event.punishment && !event.punishmentDone ? "warning" : event.type === "reward" ? "success" : event.type === "punish" ? "danger" : "default", facts: [{ label: "记录类型", value: event.type === "reward" ? "表扬" : event.type === "punish" ? "扣分" : "备注" }, { label: "分值", value: `${event.score > 0 ? "+" : ""}${event.score}` }, ...(event.punishment ? [{ label: "处理措施", value: event.punishment }] : [])], description: event.note, availability: "available", navigationLabel: NAVIGATION_LABELS.dormitory };
  }

  if (ref.domain === "score") return scorePreview(state, ref, fallback);

  if (ref.domain === "communication") {
    const draft = state.communicationDrafts.find(item => item.id === ref.entityId);
    if (!draft) return unavailable(ref, fallback);
    return { ref, domainLabel: DOMAIN_LABELS.communication, title: draft.scope === "student" ? "学生周沟通稿" : "班级周报", subtitle: `${draft.startDate} 至 ${draft.endDate}`, status: draft.deliveryStatus === "shared" ? "已分享" : "草稿", statusTone: draft.deliveryStatus === "shared" ? "success" : "default", facts: [...(draft.channel ? [{ label: "分享渠道", value: draft.channel }] : []), ...(draft.sharedAt ? [{ label: "分享时间", value: draft.sharedAt.slice(0, 10) }] : []), { label: "生成方式", value: draft.generatedBy === "ai" ? "AI 润色" : "本地事实" }], description: draft.content, availability: "available", navigationLabel: NAVIGATION_LABELS.communication };
  }

  if (ref.domain === "fund") {
    const transaction = state.fundTransactions.find(item => item.id === ref.entityId);
    if (!transaction) return unavailable(ref, fallback);
    return { ref, domainLabel: DOMAIN_LABELS.fund, title: transaction.category, subtitle: transaction.date, status: transaction.status === "void" ? "已作废" : transaction.type === "income" ? "收入" : "支出", statusTone: transaction.status === "void" ? "muted" : transaction.type === "income" ? "success" : "default", facts: [{ label: "金额", value: `¥${transaction.amount.toFixed(2)}` }, { label: "类型", value: transaction.type === "income" ? "收入" : "支出" }], description: transaction.note, availability: "available", navigationLabel: NAVIGATION_LABELS.fund };
  }

  if (ref.domain === "student") {
    const student: AppStudent | undefined = state.students.find(item => item.id === (ref.studentId || ref.entityId));
    if (!student) return unavailable(ref, fallback);
    const record = student.records.find(item => item.id === ref.entityId);
    return { ref, domainLabel: DOMAIN_LABELS.student, title: record?.note || fallback?.title || student.name, subtitle: record?.date || fallback?.occurredAt?.slice(0, 10), status: record ? record.type === "reward" ? "表扬" : record.type === "punish" ? "提醒" : "备注" : "学生档案", statusTone: record?.type === "reward" ? "success" : record?.type === "punish" ? "warning" : "default", facts: record?.score === undefined ? [] : [{ label: "分值", value: `${record.score > 0 ? "+" : ""}${record.score}` }], description: fallback?.detail, availability: "available", navigationLabel: NAVIGATION_LABELS.student };
  }

  return unsupported(ref, fallback);
}
