import { followupHasStudent } from "../state/followupStudents";
import { BookOpenCheck, CalendarCheck, ChevronDown, ClipboardList, GraduationCap, History, House } from "lucide-react";
import type { ReactNode } from "react";

import { listDormitoryEvents } from "../state/dormitoryPeriods";
import type { ActivityEvent, AppStudent, AttendanceRecord, BusinessEntityPreviewFallback, BusinessEntityPreviewModel, BusinessEntityRef, Dormitory, FollowupTask, HomeworkAssignment } from "../state/types";
import { ContextEntityPreview } from "./ContextEntityPreview";

type AttentionItem = { id: string; label: string; detail: string; ref: BusinessEntityRef; icon: ReactNode; tone: string };
export type ContextPreviewRequest = { key: string; source: "attention" | "timeline"; ref: BusinessEntityRef; fallback?: BusinessEntityPreviewFallback };

interface ContextPreviewProps {
  activePreview: ContextPreviewRequest | null;
  onTogglePreview: (request: ContextPreviewRequest) => void;
  resolvePreview: (ref: BusinessEntityRef, fallback?: BusinessEntityPreviewFallback) => BusinessEntityPreviewModel;
  onNavigate?: (ref: BusinessEntityRef) => void;
  leavesWorkbench?: boolean;
}
export function StudentAttentionSummary({ student, attendance, tasks, homework, dormitories, activePreview, onTogglePreview, resolvePreview, onNavigate, leavesWorkbench = false }: { student: AppStudent; attendance: AttendanceRecord[]; tasks: FollowupTask[]; homework: HomeworkAssignment[]; dormitories: Dormitory[] } & ContextPreviewProps) {
  const items: AttentionItem[] = [];
  tasks.filter(task => followupHasStudent(task, student.id) && task.status === "pending").slice(0, 2).forEach(task => items.push({ id: `task-${task.id}`, label: task.title, detail: `待处理 · 截止 ${task.dueDate || "未设置"}`, ref: { domain: "followup", entityId: task.id, studentId: student.id }, icon: <ClipboardList className="h-4 w-4"/>, tone: "text-blue-600 bg-blue-50" }));
  homework.filter(assignment => (assignment.lifecycle || "active") === "active" && (assignment.participantStudentIds?.includes(student.id) || student.id in assignment.studentStates) && assignment.studentStates[student.id]?.status === "pending").slice(0, 2).forEach(assignment => items.push({ id: `homework-${assignment.id}`, label: assignment.title, detail: `作业未交 · 截止 ${assignment.dueDate}`, ref: { domain: "homework", entityId: assignment.id, studentId: student.id }, icon: <BookOpenCheck className="h-4 w-4"/>, tone: "text-rose-600 bg-rose-50" }));
  attendance.filter(record => record.studentId === student.id && (record.status !== "normal" || record.late || record.earlyLeave)).sort((a,b) => b.date.localeCompare(a.date)).slice(0, 2).forEach(record => items.push({ id: `attendance-${record.id}`, label: record.status === "leave" ? "请假" : record.status === "absent" ? "缺勤" : record.late ? "迟到" : "早退", detail: `${record.date}${record.note ? ` · ${record.note}` : ""}`, ref: { domain: "attendance", entityId: record.id, studentId: student.id, date: record.date }, icon: <CalendarCheck className="h-4 w-4"/>, tone: "text-amber-600 bg-amber-50" }));
  dormitories.forEach(dormitory => listDormitoryEvents(dormitory).filter(({ event }) => !event.punishmentDone && (event.responsibleStudentIds?.includes(student.id) || event.responsibleStudentId === student.id)).slice(0, 1).forEach(({ event }) => items.push({ id: `dorm-${event.id}`, label: `${dormitory.name} · ${event.reason}`, detail: "宿舍处理待执行", ref: { domain: "dormitory", entityId: event.id, studentId: student.id, date: event.date }, icon: <House className="h-4 w-4"/>, tone: "text-rose-600 bg-rose-50" })));
  const exams = [...student.exams].sort((a,b) => a.date.localeCompare(b.date));
  if (exams.length >= 2) {
    const previous = exams[exams.length - 2]; const latest = exams[exams.length - 1];
    const previousRank = Number.parseInt(previous.rank || "", 10);
    const latestRank = Number.parseInt(latest.rank || "", 10);
    if (Number.isFinite(previousRank) && Number.isFinite(latestRank) && previousRank !== latestRank) {
      const improvement = previousRank - latestRank;
      items.push({ id: `score-${latest.id}`, label: `${latest.name} 排名${improvement > 0 ? "进步" : "退步"} ${Math.abs(improvement)} 名`, detail: `较 ${previous.name}`, ref: { domain: "score", entityId: latest.id, studentId: student.id }, icon: <GraduationCap className="h-4 w-4"/>, tone: improvement > 0 ? "text-emerald-600 bg-emerald-50" : "text-amber-600 bg-amber-50" });
    }
  }

  const selected = activePreview?.source === "attention" ? activePreview : null;
  const previewModel = selected ? resolvePreview(selected.ref, selected.fallback) : null;
  const previewId = "student-attention-inline-preview";

  return <section className="rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-sm font-bold text-gray-800">当前需要关注</h3><span className="text-xs text-gray-400">{items.length} 项</span></div>{items.length ? <div className="grid gap-2 sm:grid-cols-2">{items.slice(0, 6).map(item => { const open = selected?.key === item.id; return <button key={item.id} type="button" aria-label={`${item.label}事项速览`} aria-expanded={open} aria-controls={open ? previewId : undefined} onClick={() => onTogglePreview({ key: item.id, source: "attention", ref: item.ref })} className={`flex items-center gap-3 rounded-xl p-3 text-left transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${open ? "bg-blue-50 shadow-[inset_0_0_0_1px_rgba(147,197,253,0.7)]" : "bg-gray-50 hover:bg-blue-50"}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${item.tone}`}>{item.icon}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-gray-800">{item.label}</strong><span className="mt-0.5 block truncate text-[11px] text-gray-400">{item.detail}</span></span><ChevronDown className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}/></button>; })}</div> : <p className="py-3 text-center text-xs text-gray-400">当前没有待处理任务、未交作业或近期异常。</p>}<ContextEntityPreview id={previewId} open={Boolean(selected && previewModel)} model={previewModel} leavesWorkbench={leavesWorkbench} onClose={() => selected && onTogglePreview(selected)} onNavigate={onNavigate && selected ? () => onNavigate(selected.ref) : undefined}/></section>;
}

export function StudentActivityTimeline({ studentId, events, activePreview, onTogglePreview, resolvePreview, onNavigate, leavesWorkbench = false }: { studentId: string; events: ActivityEvent[] } & ContextPreviewProps) {
  const related = events.filter(event => event.ref.studentId === studentId || event.studentIds.includes(studentId)).slice(0, 8);
  const selected = activePreview?.source === "timeline" ? activePreview : null;
  const previewModel = selected ? resolvePreview(selected.ref, selected.fallback) : null;
  const previewId = "student-timeline-inline-preview";
  return <section className="rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-3"><div className="mb-2 flex items-center gap-2"><History className="h-4 w-4 text-blue-500"/><h3 className="text-sm font-bold text-gray-800">动作时间线</h3></div>{related.length ? <div className="divide-y divide-gray-100">{related.map(event => { const key = `event-${event.id}`; const open = selected?.key === key; return <button key={event.id} type="button" aria-label={`${event.title}事项速览`} aria-expanded={open} aria-controls={open ? previewId : undefined} onClick={() => onTogglePreview({ key, source: "timeline", ref: event.ref, fallback: { title: event.title, detail: event.detail, occurredAt: event.occurredAt } })} className={`grid w-full grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-1 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 ${open ? "bg-blue-50" : "hover:bg-gray-50"}`}><span className="text-[11px] text-gray-400">{event.occurredAt.slice(0, 10)}</span><span className="min-w-0"><strong className="block truncate text-xs text-gray-700">{event.title}</strong>{event.detail && <span className="mt-0.5 block truncate text-[11px] text-gray-400">{event.detail}</span>}</span><ChevronDown className={`h-3.5 w-3.5 text-gray-300 transition-transform ${open ? "rotate-180" : ""}`}/></button>; })}</div> : <p className="py-3 text-center text-xs text-gray-400">升级后的相关操作会记录在这里。</p>}<ContextEntityPreview id={previewId} open={Boolean(selected && previewModel)} model={previewModel} leavesWorkbench={leavesWorkbench} onClose={() => selected && onTogglePreview(selected)} onNavigate={onNavigate && selected ? () => onNavigate(selected.ref) : undefined}/></section>;
}
