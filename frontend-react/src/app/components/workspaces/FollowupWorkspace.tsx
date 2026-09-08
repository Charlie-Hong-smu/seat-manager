import { useMemo, useState } from "react";

import { useInitialTargetEffect } from "../../hooks/useInitialTargetEffect";
import { Bell, CheckCircle2, CircleX, Pencil, RotateCcw, Search } from "lucide-react";
import { getTaskUrgency, prepareFollowupTasks, todayKey } from "../../state/dailyManagement";
import { followupHasStudent, followupStudentLabel, getFollowupStudentIds } from "../../state/followupStudents";
import { matchesStudentSearch } from "../../state/studentSearch";
import type { AppStudent, FollowupTask, HomeworkAssignment, StudentId } from "../../state/types";
import { ActionToast, Button, Card, DashboardStats, Input, IconButton, SegmentedControl, UnderlineTabs, useActionToast, useAppDialog } from "../ui";
import { HomeworkPanel } from "../HomeworkPanel";
import type { FollowupTaskDraft } from "../FollowupTaskDrawer";
import { FollowupTaskForm } from "../FollowupTaskForm";
import type { TimelineTarget } from "../../state/dataInsights";
import type { ActivityEvent, BusinessEntityRef } from "../../state/types";
import { changeFollowupTaskStatus, syncCompletedFollowupHomework, updateFollowupResolution } from "../../state/classManagementCommands";
import { createActivityEvent } from "../../state/activityEvents";
import { ResolutionEditor, SourceLink } from "../LinkedWorkflow";

export function FollowupWorkspace({ students, tasks, homeworkAssignments, subjectCatalog, onChange, onHomeworkChange, onSubjectCatalogChange, onRequestTask, onActivity, onOpenSource, sourceExists, initialTarget, onInitialTargetConsumed, initialMode = "tasks" }: { students: AppStudent[]; tasks: FollowupTask[]; homeworkAssignments: HomeworkAssignment[]; subjectCatalog: string[]; onChange: (tasks: FollowupTask[]) => void; onHomeworkChange: (assignments: HomeworkAssignment[]) => void; onSubjectCatalogChange: (subjects: string[]) => void; onRequestTask: (draft: FollowupTaskDraft) => void; onActivity?: (event: ActivityEvent) => void | (() => void); onOpenSource?: (ref: BusinessEntityRef) => void; sourceExists?: (ref: BusinessEntityRef) => boolean; initialTarget?: TimelineTarget; onInitialTargetConsumed?: () => void; initialMode?: "tasks" | "homework" }) {
  const [mode, setMode] = useState<"tasks" | "homework">(initialMode);
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("常规跟进");
  const [dueDate, setDueDate] = useState(todayKey());
  const [undoSnapshot, setUndoSnapshot] = useState<{ tasks: FollowupTask[]; homework: HomeworkAssignment[]; activityUndos: Array<() => void> } | null>(null);
  const [resolutionTaskId, setResolutionTaskId] = useState("");
  const [focusedTaskId, setFocusedTaskId] = useState("");
  const [homeworkTargetId, setHomeworkTargetId] = useState(() => initialTarget?.entityId);
  const actionToast = useActionToast();
  const appDialog = useAppDialog();
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
  const studentMap = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
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
    const { created } = prepareFollowupTasks({ studentId: studentIds[0] || "", studentIds, title, description, type, plannedDate: todayKey(), dueDate, source: "manual" });
    onChange([...created, ...tasks]);
    const activityUndos = created.flatMap(task => {
      const undo = onActivity?.(createActivityEvent({ action: "created", ref: { domain: "followup", entityId: task.id, studentId: task.studentId || undefined }, studentIds: getFollowupStudentIds(task), title: `创建跟进：${task.title}`, detail: task.description || `截止 ${task.dueDate}` }));
      return typeof undo === "function" ? [undo] : [];
    });
    setStudentIds([]); setTitle(""); setDescription("");
    actionToast.show({
      message: created.length > 1 ? `已创建 ${created.length} 项跟进任务` : "跟进任务已创建",
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => { onChange(tasks); activityUndos.forEach(undo => undo()); },
      duration: 6000,
    });
  }
  async function update(id: string, status: FollowupTask["status"]) {
    const current = tasks.find(task => task.id === id);
    if (!current) return;
    const result = changeFollowupTaskStatus(current, status);
    if (status === "completed") {
      setFilter("all");
      onChange(tasks.map(task => task.id === id ? result.task : task));
      const activityUndo = onActivity?.(result.event);
      setUndoSnapshot({ tasks, homework: homeworkAssignments, activityUndos: typeof activityUndo === "function" ? [activityUndo] : [] });
      setResolutionTaskId(id);
      const homeworkSync = syncCompletedFollowupHomework(current, homeworkAssignments);
      if (homeworkSync) {
        const assignment = homeworkAssignments.find(item => item.id === current.sourceRef?.entityId);
        const shouldSync = await appDialog.confirm({ title: "同步作业状态？", description: `跟进任务已经完成。是否同时把“${assignment?.title || "关联作业"}”中该学生的状态更新为“已交”？选择取消也不会影响任务完成。`, confirmLabel: "同步为已交" });
        if (shouldSync) {
          onHomeworkChange(homeworkSync.assignments);
          const sourceUndo = onActivity?.(homeworkSync.event);
          if (typeof sourceUndo === "function") setUndoSnapshot(snapshot => snapshot ? { ...snapshot, activityUndos: [...snapshot.activityUndos, sourceUndo] } : snapshot);
        }
      }
      return;
    }
    onChange(tasks.map(task => task.id === id ? result.task : task));
    const activityUndo = onActivity?.(result.event);
    setUndoSnapshot({ tasks, homework: homeworkAssignments, activityUndos: typeof activityUndo === "function" ? [activityUndo] : [] });
  }
  async function enableNotifications() { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); }

  function createHomeworkFollowups(assignment: HomeworkAssignment, studentIds: StudentId[]) {
    const { created: additions } = prepareFollowupTasks({ studentId: studentIds[0] || "", studentIds, title: `跟进作业：${assignment.title}`, type: "学业关注", description: assignment.note || "确认作业补交情况", plannedDate: todayKey(), dueDate: assignment.dueDate, source: "homework", sourceRef: { domain: "homework", entityId: assignment.id } }, tasks);
    if (!additions.length) return;
    onChange([...additions, ...tasks]);
    const activityUndos = additions.flatMap(task => {
      const undo = onActivity?.(createActivityEvent({ action: "created", ref: { domain: "followup", entityId: task.id, studentId: task.studentId }, studentIds: [task.studentId], title: `创建作业跟进：${assignment.title}`, detail: studentMap.get(task.studentId)?.name || "学生" }));
      return typeof undo === "function" ? [undo] : [];
    });
    actionToast.show({ message: `已创建 ${additions.length} 项作业跟进`, actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5"/>, onAction: () => { onChange(tasks); activityUndos.forEach(undo => undo()); }, duration: 6000 });
  }

  function openLinkedTask(taskId: string) {
    setMode("tasks");
    setFilter("all");
    setSearch(tasks.find(task => task.id === taskId)?.title || "");
  }

  if (mode === "homework") return <div className="h-full overflow-y-auto bg-background-secondary-default p-4"><div className="mx-auto max-w-6xl space-y-4"><UnderlineTabs value={mode} onChange={setMode} ariaLabel="任务与作业" options={[{ value: "tasks", label: "待办" }, { value: "homework", label: "作业" }]}/><HomeworkPanel students={students} assignments={homeworkAssignments} tasks={tasks} subjectCatalog={subjectCatalog} onChange={onHomeworkChange} onTaskChange={onChange} onOpenTask={openLinkedTask} onSubjectCatalogChange={onSubjectCatalogChange} onCreateFollowups={createHomeworkFollowups} onActivity={onActivity} initialAssignmentId={homeworkTargetId}/></div></div>;

  return <div className="h-full overflow-y-auto bg-background-secondary-default p-4"><div className="mx-auto max-w-6xl space-y-4">
    <UnderlineTabs value={mode} onChange={setMode} ariaLabel="任务与作业" options={[{ value: "tasks", label: "待办" }, { value: "homework", label: "作业" }]}/>
    <DashboardStats columns={3} stats={[
      { icon: Bell, label: "待处理", value: String(pending.length), deltaColor: "neutral" },
      { icon: CheckCircle2, label: "今日到期", value: String(today), deltaColor: "neutral" },
      { icon: CircleX, label: "已逾期", value: String(overdue), deltaColor: "neutral" },
    ]} />
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title="创建跟进"><div className="space-y-3">
        <FollowupTaskForm students={students} compact showSource={false} showPlannedDate={false} value={{ studentId: studentIds[0] || "", studentIds, title, type, description, plannedDate: todayKey(), dueDate, source: "manual" }} onChange={value => { setStudentIds(value.studentIds || (value.studentId ? [value.studentId] : [])); setTitle(value.title); setType(value.type); setDescription(value.description); setDueDate(value.dueDate); }} onSubmit={add}/>
        <Button variant="ghost" onClick={() => void enableNotifications()} className="w-full"><Bell className="h-4 w-4" />开启本机通知</Button>
        <p className="text-caption-1-regular leading-5 text-text-tertiary">应用打开或恢复时检查提醒；浏览器拒绝权限后仍保留应用内徽标。</p>
      </div></Card>
      <Card title="跟进任务"><div className="mb-3 flex flex-wrap gap-3"><Input value={search} onChange={setSearch} leadingIcon={Search} placeholder="搜索学生、事项或说明" className="min-w-48 flex-1" /></div><SegmentedControl value={filter} ariaLabel="任务筛选" onChange={setFilter} className="mb-4 w-full overflow-x-auto" options={[{value:"pending",label:"待处理"},{value:"today",label:"今日"},{value:"overdue",label:"逾期"},{value:"future",label:"未来"},{value:"completed",label:"已完成"},{value:"cancelled",label:"已取消"},{value:"all",label:"全部"}]} />
        <div className="space-y-2">{shown.map(task => { const urgency = getTaskUrgency(task); return <article key={task.id} data-followup-task-id={task.id} className={`view-switch-enter rounded-[var(--app-radius-sm)] border bg-background-primary-default p-4 transition-[border-color,box-shadow] duration-200 hover:border-accent-100 hover:shadow-[var(--app-shadow-card)] ${focusedTaskId === task.id ? "border-accent-300 ring-2 ring-accent-100" : "border-[var(--app-border)]"}`}><div className="grid grid-cols-[0.625rem_minmax(0,1fr)] gap-x-3 gap-y-2 sm:flex sm:items-start sm:gap-3"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${urgency === "overdue" ? "bg-status-danger-500" : urgency === "today" ? "bg-status-warning-500" : task.status === "completed" ? "bg-status-success-500" : task.status === "cancelled" ? "bg-background-primary-disabled" : "bg-accent-500"}`}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`text-body-semibold text-[var(--app-text)] ${task.status !== "pending" ? "text-text-tertiary line-through" : ""}`}>{task.title}</h3><span className="rounded-md bg-background-tertiary-default px-2 py-0.5 text-[10px] font-bold text-text-secondary">{task.type}</span><SourceLink source={task.source} sourceRef={task.sourceRef} onOpen={onOpenSource} exists={!task.sourceRef || sourceExists?.(task.sourceRef) !== false}/>{task.continuedFromTaskId && <span className="rounded-md bg-accent-50 px-2 py-0.5 text-[10px] font-bold text-accent-600">继续跟进</span>}</div><div className="mt-1 text-caption-1-regular text-[var(--app-text-muted)]">{followupStudentLabel(task, new Map(students.map(student => [student.id, student.name])))} · 截止 {task.dueDate || "未设置"}</div>{task.description && <p className="mt-2 text-body-regular leading-5 text-text-secondary">{task.description}</p>}{task.resolutionNote && resolutionTaskId !== task.id && <p className="mt-2 rounded-lg bg-status-success-50 px-3 py-2 text-caption-1-regular leading-5 text-status-success-700">处理结果：{task.resolutionNote}</p>}</div><div className="col-start-2 flex shrink-0 gap-1"><IconButton size="sm" label="编辑任务" onClick={() => onRequestTask({ id: task.id, studentIds: getFollowupStudentIds(task), studentMode: task.studentMode, studentId: task.studentId, title: task.title, type: task.type, description: task.description, plannedDate: task.plannedDate, dueDate: task.dueDate, source: task.source, sourceRef: task.sourceRef })}><Pencil className="h-4 w-4"/></IconButton>{task.status === "pending" ? <><IconButton size="sm" label="完成任务" onClick={() => void update(task.id,"completed")} className="border-status-success-100 bg-status-success-50 text-status-success-600"><CheckCircle2 className="h-4 w-4"/></IconButton><IconButton size="sm" label="取消任务" onClick={() => void update(task.id,"cancelled")}><CircleX className="h-4 w-4"/></IconButton></> : <IconButton size="sm" label="恢复任务" onClick={() => void update(task.id,"pending")}><RotateCcw className="h-4 w-4"/></IconButton>}</div></div>{resolutionTaskId === task.id && <ResolutionEditor task={task} onSave={note => { const result = updateFollowupResolution(task, note); onChange(tasks.map(item => item.id === task.id ? result.task : item)); onActivity?.(result.event); setResolutionTaskId(""); }} onContinue={() => { setResolutionTaskId(""); onRequestTask({ studentIds: getFollowupStudentIds(task), studentMode: task.studentMode, studentId: task.studentId, title: task.title, type: task.type, description: task.resolutionNote ? `上次处理：${task.resolutionNote}` : task.description, plannedDate: todayKey(), dueDate: todayKey(), source: task.source, sourceRef: task.sourceRef, continuedFromTaskId: task.id }); }}/>}</article>})}{!shown.length && <div className="py-14 text-center text-body-regular text-[var(--app-text-muted)]">暂无符合条件的任务</div>}</div>
      </Card>
    </div>
    {undoSnapshot && <ActionToast message="任务状态已更新" actionLabel="撤销" actionIcon={<RotateCcw className="h-3.5 w-3.5"/>} onAction={() => { onChange(undoSnapshot.tasks); onHomeworkChange(undoSnapshot.homework); undoSnapshot.activityUndos.forEach(undo => undo()); setUndoSnapshot(null); setResolutionTaskId(""); }} onClose={() => setUndoSnapshot(null)} duration={6000}/>}
    {appDialog.dialog}
    {actionToast.toast}
  </div></div>;
}
