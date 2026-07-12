import { useEffect, useMemo, useState } from "react";
import { Bell, CheckCircle2, CircleX, Pencil, Plus, RotateCcw, Search } from "lucide-react";
import { createFollowupTask, getTaskUrgency, todayKey } from "../../state/dailyManagement";
import type { AppStudent, FollowupTask, FollowupTaskSource } from "../../state/types";
import { Button, Card, DatePicker, IconButton, SegmentedControl } from "../ui";
import { StudentMultiPicker } from "../StudentPicker";
import type { FollowupTaskDraft } from "../FollowupTaskDrawer";
import { UndoToast } from "../UndoToast";
import type { TimelineTarget } from "../../state/dataInsights";

const TYPE_OPTIONS = ["常规跟进", "家校沟通", "行为处理", "学业关注", "出勤关注"];
const SOURCE_LABEL: Record<FollowupTaskSource, string> = { manual: "手动", ai: "AI 建议", score: "成绩", attendance: "出勤", dormitory: "宿舍" };

export function FollowupWorkspace({ students, tasks, onChange, onRequestTask, initialTarget }: { students: AppStudent[]; tasks: FollowupTask[]; onChange: (tasks: FollowupTask[]) => void; onRequestTask: (draft: FollowupTaskDraft) => void; initialTarget?: TimelineTarget }) {
  const [filter, setFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState(TYPE_OPTIONS[0]);
  const [dueDate, setDueDate] = useState(todayKey());
  const [undoTasks, setUndoTasks] = useState<FollowupTask[] | null>(null);
  useEffect(() => {
    if (!initialTarget?.entityId) return;
    setFilter("all");
    setSearch(tasks.find(task => task.id === initialTarget.entityId)?.title || "");
  }, [initialTarget, tasks]);
  const studentMap = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const shown = tasks.filter(task => {
    const urgency = getTaskUrgency(task);
    const matchesFilter = filter === "all" || filter === task.status || filter === urgency || (filter === "future" && urgency === "upcoming");
    return matchesFilter && (!search || task.title.includes(search) || task.description.includes(search) || studentMap.get(task.studentId)?.name.includes(search));
  }).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const pending = tasks.filter(task => task.status === "pending");
  const overdue = pending.filter(task => getTaskUrgency(task) === "overdue").length;
  const today = pending.filter(task => getTaskUrgency(task) === "today").length;

  function add() {
    if (!studentIds.length || !title.trim()) return;
    const created = studentIds.map(studentId => createFollowupTask({ studentId, title, description, type, plannedDate: todayKey(), dueDate, source: "manual" }));
    onChange([...created, ...tasks]);
    setStudentIds([]); setTitle(""); setDescription("");
  }
  function update(id: string, status: FollowupTask["status"]) {
    const now = new Date().toISOString();
    setUndoTasks(tasks);
    onChange(tasks.map(task => task.id === id ? { ...task, status, updatedAt: now, completedAt: status === "completed" ? now : undefined } : task));
    window.setTimeout(() => setUndoTasks(null), 6000);
  }
  async function enableNotifications() { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); }

  return <div className="h-full overflow-y-auto bg-gray-50 p-4"><div className="mx-auto max-w-6xl space-y-4">
    <Card className="surface-enter" bodyClassName="grid gap-3 p-4 sm:grid-cols-3">{[{ label: "待处理", value: pending.length, tone: "text-blue-600" }, { label: "今日到期", value: today, tone: "text-amber-600" }, { label: "已逾期", value: overdue, tone: "text-red-500" }].map(item => <div key={item.label} className="rounded-[var(--app-radius-sm)] bg-[var(--app-surface-muted)] px-4 py-3"><div className="text-xs text-[var(--app-text-muted)]">{item.label}</div><div className={`mt-1 text-xl font-bold ${item.tone}`}>{item.value}</div></div>)}</Card>
    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <Card title="创建跟进"><div className="space-y-3">
        <StudentMultiPicker students={students} values={studentIds} onChange={setStudentIds} />
        <div><div className="mb-1.5 text-xs font-bold text-[var(--app-text-muted)]">跟进类型</div><SegmentedControl value={type} ariaLabel="跟进类型" onChange={setType} className="w-full overflow-x-auto" options={TYPE_OPTIONS.map(option => ({ value: option, label: option }))} /></div>
        <input value={title} onChange={event => setTitle(event.target.value)} placeholder="跟进事项，例如：确认处罚执行情况" className="h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-3 text-sm outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10" />
        <textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="补充说明（可选）" rows={3} className="w-full resize-none rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10" />
        <DatePicker value={dueDate} onChange={setDueDate} ariaLabel="跟进截止日期" className="w-full" />
        <Button disabled={!studentIds.length || !title.trim()} onClick={add} className="w-full"><Plus className="h-4 w-4" />创建 {studentIds.length > 1 ? `${studentIds.length} 项` : "任务"}</Button>
        <Button variant="ghost" onClick={() => void enableNotifications()} className="w-full"><Bell className="h-4 w-4" />开启本机通知</Button>
        <p className="text-xs leading-5 text-gray-400">应用打开或恢复时检查提醒；浏览器拒绝权限后仍保留应用内徽标。</p>
      </div></Card>
      <Card title="跟进任务"><div className="mb-3 flex flex-wrap gap-3"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-[var(--app-text-muted)]"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索学生、事项或说明" className="h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10"/></div></div><SegmentedControl value={filter} ariaLabel="任务筛选" onChange={setFilter} className="mb-4 w-full overflow-x-auto" options={[{value:"pending",label:"待处理"},{value:"today",label:"今日"},{value:"overdue",label:"逾期"},{value:"future",label:"未来"},{value:"completed",label:"已完成"},{value:"cancelled",label:"已取消"},{value:"all",label:"全部"}]} />
        <div className="space-y-2">{shown.map(task => { const urgency = getTaskUrgency(task); return <article key={task.id} className="view-switch-enter rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white p-4 transition-[border-color,box-shadow] duration-200 hover:border-blue-100 hover:shadow-[var(--app-shadow-card)]"><div className="flex items-start gap-3"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${urgency === "overdue" ? "bg-red-500" : urgency === "today" ? "bg-amber-500" : task.status === "completed" ? "bg-emerald-500" : task.status === "cancelled" ? "bg-gray-300" : "bg-blue-500"}`}/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`text-sm font-bold text-[var(--app-text)] ${task.status !== "pending" ? "text-gray-400 line-through" : ""}`}>{task.title}</h3><span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{task.type}</span><span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${task.source === "ai" ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"}`}>{SOURCE_LABEL[task.source]}</span></div><div className="mt-1 text-xs text-[var(--app-text-muted)]">{studentMap.get(task.studentId)?.name || "未知学生"} · 截止 {task.dueDate || "未设置"}</div>{task.description && <p className="mt-2 text-sm leading-5 text-gray-600">{task.description}</p>}</div><div className="flex shrink-0 gap-1"><IconButton size="sm" label="编辑任务" onClick={() => onRequestTask({ id: task.id, studentId: task.studentId, title: task.title, type: task.type, description: task.description, plannedDate: task.plannedDate, dueDate: task.dueDate, source: task.source, sourceRef: task.sourceRef })}><Pencil className="h-4 w-4"/></IconButton>{task.status === "pending" ? <><IconButton size="sm" label="完成任务" onClick={() => update(task.id,"completed")} className="border-emerald-100 bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-4 w-4"/></IconButton><IconButton size="sm" label="取消任务" onClick={() => update(task.id,"cancelled")}><CircleX className="h-4 w-4"/></IconButton></> : <IconButton size="sm" label="恢复任务" onClick={() => update(task.id,"pending")}><RotateCcw className="h-4 w-4"/></IconButton>}</div></div></article>})}{!shown.length && <div className="py-14 text-center text-sm text-[var(--app-text-muted)]">暂无符合条件的任务</div>}</div>
      </Card>
    </div>
    {undoTasks && <UndoToast message="任务状态已更新" onUndo={() => { onChange(undoTasks); setUndoTasks(null); }} onClose={() => setUndoTasks(null)}/>}
  </div></div>;
}
