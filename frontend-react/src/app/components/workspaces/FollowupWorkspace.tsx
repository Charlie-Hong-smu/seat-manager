import { useWorkspaceDraftState } from "../../hooks/useWorkspaceDraftState";
import { useState } from "react";

import { useInitialTargetEffect } from "../../hooks/useInitialTargetEffect";
import { Bell, CheckCircle2, CircleX, Pencil, RotateCcw, Search } from "lucide-react";
import { getTaskUrgency, todayKey } from "../../state/dailyManagement";
import { followupHasStudent, followupStudentLabel, getFollowupStudentIds } from "../../state/followupStudents";
import { matchesStudentSearch } from "../../state/studentSearch";
import type { AppStudent, FollowupTask, HomeworkAssignment, StudentId } from "../../state/types";
import { Button, Card, IconButton, SegmentedControl, UnderlineTabs } from "../ui";
import { HomeworkPanel } from "../HomeworkPanel";
import type { FollowupTaskDraft } from "../FollowupTaskDrawer";
import { FollowupTaskForm } from "../FollowupTaskForm";
import type { TimelineTarget } from "../../state/dataInsights";
import type { ActivityEvent, BusinessEntityRef } from "../../state/types";
import { ResolutionEditor, SourceLink } from "../LinkedWorkflow";

export function FollowupWorkspace({ students, tasks, homeworkAssignments, subjectCatalog, onChange, onHomeworkChange, onSubjectCatalogChange, onRequestTask, onActivity, onOpenSource, sourceExists, initialTarget, onInitialTargetConsumed, initialMode = "tasks", onCreateTask, onTaskStatusChange, onSaveResolution }: { onCreateTask: (draft: FollowupTaskDraft) => void; onTaskStatusChange: (id: string, status: FollowupTask["status"]) => Promise<boolean>; onSaveResolution: (id: string, note: string) => void; students: AppStudent[]; tasks: FollowupTask[]; homeworkAssignments: HomeworkAssignment[]; subjectCatalog: string[]; onChange: (tasks: FollowupTask[]) => void; onHomeworkChange: (assignments: HomeworkAssignment[]) => void; onSubjectCatalogChange: (subjects: string[]) => void; onRequestTask: (draft: FollowupTaskDraft) => void; onActivity?: (event: ActivityEvent) => void | (() => void); onOpenSource?: (ref: BusinessEntityRef) => void; sourceExists?: (ref: BusinessEntityRef) => boolean; initialTarget?: TimelineTarget; onInitialTargetConsumed?: () => void; initialMode?: "tasks" | "homework" }) {
  const [mode, setMode] = useState<"tasks" | "homework">(initialMode);
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [studentIds, setStudentIds] = useWorkspaceDraftState<string[]>("followup:new:studentIds", []);
  const [title, setTitle] = useWorkspaceDraftState("followup:new:title", "");
  const [description, setDescription] = useWorkspaceDraftState("followup:new:description", "");
  const [type, setType] = useWorkspaceDraftState("followup:new:type", "常规跟进");
  const [dueDate, setDueDate] = useWorkspaceDraftState("followup:new:dueDate", todayKey());

  const [resolutionTaskId, setResolutionTaskId] = useState("");
  const [focusedTaskId, setFocusedTaskId] = useState("");
  const [homeworkTargetId, setHomeworkTargetId] = useState(() => initialTarget?.entityId);
  useInitialTargetEffect(initialTarget?.entityId, () => {
    const entityId = initialTarget?.entityId || "";
    const targetTask = tasks.find(task => task.id === entityId);
    if (targetTask) {
      setFilter("all");
      setSearch(targetTask.title);
      setFocusedTaskId(entityId);
    }
    setHomeworkTargetId(entityId);
  }, onInitialTargetConsumed);
  const shown = tasks.filter(task => {
    const urgency = getTaskUrgency(task);
    const matchesFilter = filter === "all" || filter === task.status || filter === urgency || (filter === "future" && urgency === "upcoming");
    return matchesFilter && (!search || task.title.includes(search) || task.description.includes(search) || students.some(student => followupHasStudent(task, student.id) && matchesStudentSearch(student, search)));
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pending = tasks.filter(task => task.status === "pending");
  const overdue = pending.filter(task => getTaskUrgency(task) === "overdue").length;
  const today = pending.filter(task => getTaskUrgency(task) === "today").length;

  function add() {
    if (!title.trim()) return;
    onCreateTask({ studentId: studentIds[0] || "", studentIds, title, description, type, plannedDate: todayKey(), dueDate, source: "manual" });
    setStudentIds([]); setTitle(""); setDescription("");
  }
  async function update(id: string, status: FollowupTask["status"]) {
    if (await onTaskStatusChange(id, status) && status === "completed") { setFilter("all"); setResolutionTaskId(id); }
  }
  async function enableNotifications() { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); }

  function createHomeworkFollowups(assignment: HomeworkAssignment, studentIds: StudentId[]) {
    onCreateTask({ studentId: studentIds[0] || "", studentIds, title: `跟进作业：${assignment.title}`, type: "学业关注", description: assignment.note || "确认作业补交情况", plannedDate: todayKey(), dueDate: assignment.dueDate, source: "homework", sourceRef: { domain: "homework", entityId: assignment.id } });
  }

  function openLinkedTask(taskId: string) {
    setMode("tasks");
    setFilter("all");
    setSearch(tasks.find(task => task.id === taskId)?.title || "");
  }

  if (mode === "homework") return <div className="h-full overflow-y-auto bg-gray-50 p-4"><div className="mx-auto max-w-6xl space-y-4"><UnderlineTabs value={mode} onChange={setMode} ariaLabel="任务与作业" options={[{ value: "tasks", label: "待办" }, { value: "homework", label: "作业" }]}/><HomeworkPanel students={students} assignments={homeworkAssignments} tasks={tasks} subjectCatalog={subjectCatalog} onChange={onHomeworkChange} onTaskChange={onChange} onOpenTask={openLinkedTask} onSubjectCatalogChange={onSubjectCatalogChange} onCreateFollowups={createHomeworkFollowups} onActivity={onActivity} initialAssignmentId={homeworkTargetId}/></div></div>;

  return <div className="h-full overflow-y-auto bg-gray-50 p-4"><div className="mx-auto max-w-6xl space-y-4">
    <UnderlineTabs value={mode} onChange={setMode} ariaLabel="任务与作业" options={[{ value: "tasks", label: "待办" }, { value: "homework", label: "作业" }]}/>
    <Card className="surface-enter" bodyClassName="grid gap-3 p-4 sm:grid-cols-3">{[{ label: "待处理", value: pending.length, tone: "text-blue-600" }, { label: "今日到期", value: today, tone: "text-amber-600" }, { label: "已逾期", value: overdue, tone: "text-red-500" }].map(item => <div key={item.label} className="rounded-[var(--app-radius-sm)] bg-[var(--app-surface-muted)] px-4 py-3"><div className="text-xs text-[var(--app-text-muted)]">{item.label}</div><div className={`mt-1 text-xl font-bold ${item.tone}`}>{item.value}</div></div>)}</Card>
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title="创建跟进"><div className="space-y-3">
        <FollowupTaskForm students={students} compact showSource={false} showPlannedDate={false} value={{ studentId: studentIds[0] || "", studentIds, title, type, description, plannedDate: todayKey(), dueDate, source: "manual" }} onChange={value => { setStudentIds(value.studentIds || (value.studentId ? [value.studentId] : [])); setTitle(value.title); setType(value.type); setDescription(value.description); setDueDate(value.dueDate); }} onSubmit={add}/>
        <Button variant="ghost" onClick={() => void enableNotifications()} className="w-full"><Bell className="h-4 w-4" />开启本机通知</Button>
        <p className="text-xs leading-5 text-gray-400">应用打开或恢复时检查提醒；浏览器拒绝权限后仍保留应用内徽标。</p>
      </div></Card>
      <Card title="跟进任务"><div className="mb-3 flex flex-wrap gap-3"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-[var(--app-text-muted)]"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索学生、事项或说明" className="h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10"/></div></div><SegmentedControl value={filter} ariaLabel="任务筛选" onChange={setFilter} className="mb-4 w-full overflow-x-auto" options={[{value:"pending",label:"待处理"},{value:"today",label:"今日"},{value:"overdue",label:"逾期"},{value:"future",label:"未来"},{value:"completed",label:"已完成"},{value:"cancelled",label:"已取消"},{value:"all",label:"全部"}]} />
        <div className="space-y-2">{shown.map(task => { const urgency = getTaskUrgency(task); return <article key={task.id} data-followup-task-id={task.id} className={`view-switch-enter rounded-[var(--app-radius-sm)] border bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:border-blue-100 hover:shadow-[var(--app-shadow-card)] ${focusedTaskId === task.id ? "border-blue-300 ring-2 ring-blue-100" : "border-[var(--app-border)]"}`}><div className="grid grid-cols-[0.625rem_minmax(0,1fr)] gap-x-3 gap-y-2 sm:flex sm:items-start sm:gap-3"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${urgency === "overdue" ? "bg-red-500" : urgency === "today" ? "bg-amber-500" : task.status === "completed" ? "bg-emerald-500" : task.status === "cancelled" ? "bg-gray-300" : "bg-blue-500"}`}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`text-sm font-bold text-[var(--app-text)] ${task.status !== "pending" ? "text-gray-400 line-through" : ""}`}>{task.title}</h3><span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{task.type}</span><SourceLink source={task.source} sourceRef={task.sourceRef} onOpen={onOpenSource} exists={!task.sourceRef || sourceExists?.(task.sourceRef) !== false}/>{task.continuedFromTaskId && <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">继续跟进</span>}</div><div className="mt-1 text-xs text-[var(--app-text-muted)]">{followupStudentLabel(task, new Map(students.map(student => [student.id, student.name])))} · 截止 {task.dueDate || "未设置"}</div>{task.description && <p className="mt-2 text-sm leading-5 text-gray-600">{task.description}</p>}{task.resolutionNote && resolutionTaskId !== task.id && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-700">处理结果：{task.resolutionNote}</p>}</div><div className="col-start-2 flex shrink-0 gap-1"><IconButton size="sm" label="编辑任务" onClick={() => onRequestTask({ id: task.id, studentIds: getFollowupStudentIds(task), studentMode: task.studentMode, studentId: task.studentId, title: task.title, type: task.type, description: task.description, plannedDate: task.plannedDate, dueDate: task.dueDate, source: task.source, sourceRef: task.sourceRef })}><Pencil className="h-4 w-4"/></IconButton>{task.status === "pending" ? <><IconButton size="sm" label="完成任务" onClick={() => void update(task.id,"completed")} className="border-emerald-100 bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-4 w-4"/></IconButton><IconButton size="sm" label="取消任务" onClick={() => void update(task.id,"cancelled")}><CircleX className="h-4 w-4"/></IconButton></> : <IconButton size="sm" label="恢复任务" onClick={() => void update(task.id,"pending")}><RotateCcw className="h-4 w-4"/></IconButton>}</div></div>{resolutionTaskId === task.id && <ResolutionEditor task={task} onSave={note => { onSaveResolution(task.id, note); setResolutionTaskId(""); }} onContinue={() => { setResolutionTaskId(""); onRequestTask({ studentIds: getFollowupStudentIds(task), studentMode: task.studentMode, studentId: task.studentId, title: task.title, type: task.type, description: task.resolutionNote ? `上次处理：${task.resolutionNote}` : task.description, plannedDate: todayKey(), dueDate: todayKey(), source: task.source, sourceRef: task.sourceRef, continuedFromTaskId: task.id }); }}/>}</article>})}{!shown.length && <div className="py-14 text-center text-sm text-[var(--app-text-muted)]">暂无符合条件的任务</div>}</div>
      </Card>
    </div>
  </div></div>;
}
