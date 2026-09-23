import { CheckCircle2, CircleX, ListChecks, Pencil, RotateCcw } from "lucide-react";
import { followupStudentLabel, getFollowupStudentIds, type FollowupTaskGroup } from "../state/followupStudents";
import { getTaskUrgency, todayKey } from "../state/dailyManagement";
import type { AppStudent, BusinessEntityRef, FollowupTask } from "../state/types";
import type { FollowupTaskDraft } from "./FollowupTaskForm";
import { ResolutionEditor, SourceLink } from "./LinkedWorkflow";
import { IconButton, MotionCollapse } from "./ui";

export function FollowupTaskGroupCard({ group, students, focusedTaskId, resolutionTaskId, onRequestTask, onTaskStatusChange, onGroupStatusChange, onSaveResolution, onSetResolutionTaskId, onOpenSource, sourceExists }: {
  group: FollowupTaskGroup; students: AppStudent[]; focusedTaskId: string; resolutionTaskId: string;
  onRequestTask: (draft: FollowupTaskDraft) => void;
  onTaskStatusChange: (id: string, status: FollowupTask["status"]) => void;
  onGroupStatusChange: (ids: string[], status: FollowupTask["status"]) => void;
  onSaveResolution: (id: string, note: string) => void;
  onSetResolutionTaskId: (id: string) => void;
  onOpenSource?: (ref: BusinessEntityRef) => void;
  sourceExists?: (ref: BusinessEntityRef) => boolean;
}) {
  const representative = group.members[0];
  const names = new Map(students.map(student => [student.id, student.name]));
  const members = [...group.members].sort((a, b) => followupStudentLabel(a, names).localeCompare(followupStudentLabel(b, names), "zh-CN"));
  const pending = members.filter(task => task.status === "pending");
  const urgency = pending.some(task => getTaskUrgency(task) === "overdue") ? "overdue" : pending.some(task => getTaskUrgency(task) === "today") ? "today" : "none";
  const dot = urgency === "overdue" ? "bg-status-danger-500" : urgency === "today" ? "bg-status-warning-500" : pending.length ? "bg-accent-500" : members.every(task => task.status === "completed") ? "bg-status-success-500" : "bg-background-primary-disabled";
  return <article className={`rounded-[var(--app-radius-sm)] border bg-background-primary-default p-4 ${members.some(task => task.id === focusedTaskId) ? "border-accent-300 ring-2 ring-accent-100" : "border-[var(--app-border)]"}`}>
    <div className="flex items-start gap-3"><span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot}`}/><div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><h3 className="text-body-semibold text-text-primary">{representative.title}</h3><span className="rounded-md bg-background-tertiary-default px-2 py-0.5 text-[10px] font-bold text-text-secondary">{representative.type}</span><SourceLink source={representative.source} sourceRef={representative.sourceRef} onOpen={onOpenSource} exists={!representative.sourceRef || sourceExists?.(representative.sourceRef) !== false}/></div>
      <p className="mt-1 text-caption-1-regular text-text-secondary">共 {members.length} 人 · 待处理 {pending.length} 人 · 截止 {representative.dueDate || "未设置"}</p>
      {representative.description && <p className="mt-2 text-body-regular text-text-secondary">{representative.description}</p>}
      <ul className="mt-3 divide-y divide-separator-border rounded-[var(--app-radius-sm)] border border-separator-border">
        {members.map(task => {
          const name = followupStudentLabel(task, names);
          const edit: FollowupTaskDraft = { id: task.id, studentId: task.studentId, studentIds: getFollowupStudentIds(task), studentMode: task.studentMode, title: task.title, type: task.type, description: task.description, plannedDate: task.plannedDate, dueDate: task.dueDate, source: task.source, sourceRef: task.sourceRef };
          return <li key={task.id} data-followup-task-id={task.id} className="px-3 py-2">
            <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-body-regular text-text-primary">{name}</span><span className="text-caption-1-regular text-text-secondary">{task.status === "pending" ? "待处理" : task.status === "completed" ? "已完成" : "已取消"}</span><IconButton size="xs" label={`编辑任务：${name}`} onClick={() => onRequestTask(edit)}><Pencil className="size-3.5"/></IconButton>{task.status === "pending" ? <><IconButton size="xs" label={`完成任务：${name}`} onClick={() => onTaskStatusChange(task.id, "completed")}><CheckCircle2 className="size-3.5"/></IconButton><IconButton size="xs" label={`取消任务：${name}`} onClick={() => onTaskStatusChange(task.id, "cancelled")}><CircleX className="size-3.5"/></IconButton></> : <IconButton size="xs" label={`恢复任务：${name}`} onClick={() => onTaskStatusChange(task.id, "pending")}><RotateCcw className="size-3.5"/></IconButton>}</div>
            {task.resolutionNote && resolutionTaskId !== task.id && <p className="mt-1 text-caption-1-regular text-status-success-700">处理结果：{task.resolutionNote}</p>}
            <MotionCollapse open={resolutionTaskId === task.id}><ResolutionEditor task={task} onSave={note => { onSaveResolution(task.id, note); onSetResolutionTaskId(""); }} onContinue={() => { onSetResolutionTaskId(""); onRequestTask({ ...edit, id: undefined, description: task.resolutionNote ? `上次处理：${task.resolutionNote}` : task.description, plannedDate: todayKey(), dueDate: todayKey(), continuedFromTaskId: task.id }); }}/></MotionCollapse>
          </li>;
        })}
      </ul>
      {pending.length > 1 && <div className="mt-3 flex flex-wrap gap-2">
        <IconButton size="sm" label="全部完成" title={`全部完成（${pending.length} 人）`} onClick={() => onGroupStatusChange(pending.map(task => task.id), "completed")}><ListChecks className="size-4"/></IconButton>
        <IconButton size="sm" label="全部取消" title={`全部取消（${pending.length} 人）`} onClick={() => onGroupStatusChange(pending.map(task => task.id), "cancelled")}><CircleX className="size-4"/></IconButton>
      </div>}
    </div></div>
  </article>;
}
