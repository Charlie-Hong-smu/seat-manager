import { Check, CheckCircle2, LayoutGrid, List, Plus, RotateCcw, Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { todayKey } from "../state/dailyManagement";
import type { AppStudent, HomeworkAssignment, HomeworkStudentStatus, StudentId } from "../state/types";
import { Button, Card, DatePicker, SegmentedControl, SelectMenu, ToolDrawer, useActionToast, useAppDialog } from "./ui";

const STATUS_OPTIONS: Array<{ value: HomeworkStudentStatus; label: string }> = [
  { value: "unrecorded", label: "待登记" },
  { value: "submitted", label: "已交" },
  { value: "pending", label: "未交" },
  { value: "resubmitted", label: "补交" },
  { value: "excused", label: "免交" },
];

const STATUS_META: Record<HomeworkStudentStatus, { label: string; card: string; badge: string }> = {
  unrecorded: { label: "待登记", card: "border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/40", badge: "bg-gray-100 text-gray-500" },
  submitted: { label: "已交", card: "border-emerald-100 bg-emerald-50/55 hover:border-emerald-200", badge: "bg-emerald-100 text-emerald-700" },
  pending: { label: "未交", card: "border-rose-100 bg-rose-50/55 hover:border-rose-200", badge: "bg-rose-100 text-rose-700" },
  resubmitted: { label: "补交", card: "border-blue-100 bg-blue-50/55 hover:border-blue-200", badge: "bg-blue-100 text-blue-700" },
  excused: { label: "免交", card: "border-amber-100 bg-amber-50/55 hover:border-amber-200", badge: "bg-amber-100 text-amber-700" },
};

export function HomeworkPanel({ students, assignments, subjectCatalog, onChange, onSubjectCatalogChange, onCreateFollowups, initialAssignmentId }: {
  students: AppStudent[];
  assignments: HomeworkAssignment[];
  subjectCatalog: string[];
  onChange: (assignments: HomeworkAssignment[]) => void;
  onSubjectCatalogChange: (subjects: string[]) => void;
  onCreateFollowups: (assignment: HomeworkAssignment, studentIds: StudentId[]) => void;
  initialAssignmentId?: string;
}) {
  const appDialog = useAppDialog();
  const actionToast = useActionToast();
  const assignmentsRef = useRef(assignments);
  const feedbackTimerRef = useRef<number | null>(null);
  assignmentsRef.current = assignments;
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [dueDate, setDueDate] = useState(todayKey());
  const [note, setNote] = useState("");
  const [selectedId, setSelectedId] = useState(initialAssignmentId || assignments[0]?.id || "");
  const [viewMode, setViewMode] = useState<"quick" | "detail">("quick");
  const [markStatus, setMarkStatus] = useState<HomeworkStudentStatus>("submitted");
  const [filter, setFilter] = useState<"all" | HomeworkStudentStatus>("all");
  const [search, setSearch] = useState("");
  const [undoAssignments, setUndoAssignments] = useState<HomeworkAssignment[] | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [draftSubjects, setDraftSubjects] = useState<string[]>(subjectCatalog);
  const [newSubject, setNewSubject] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("");
  const [recentUpdate, setRecentUpdate] = useState<{ studentId: StudentId; message: string } | null>(null);
  const selected = assignments.find(item => item.id === selectedId) || assignments[0];

  const studentStates = useMemo(() => new Map(students.map(student => [student.id, selected?.studentStates[student.id]?.status || "pending"] as const)), [selected, students]);
  const counts = useMemo(() => Object.fromEntries(STATUS_OPTIONS.map(option => [option.value, students.filter(student => studentStates.get(student.id) === option.value).length])) as Record<HomeworkStudentStatus, number>, [studentStates, students]);
  const pendingIds = useMemo(() => selected ? students.filter(student => studentStates.get(student.id) === "pending").map(student => student.id) : [], [selected, studentStates, students]);
  const shownStudents = useMemo(() => students.filter(student => (!search.trim() || student.name.includes(search.trim()) || student.aliases.some(alias => alias.includes(search.trim()))) && (filter === "all" || studentStates.get(student.id) === filter)), [filter, search, studentStates, students]);
  const registeredCount = students.length - counts.unrecorded;

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  function add() {
    if (!title.trim() || !subject) return;
    const now = new Date().toISOString();
    const assignment: HomeworkAssignment = {
      id: `homework-${Date.now()}`,
      title: title.trim(),
      subject,
      assignedDate: todayKey(),
      dueDate,
      note: note.trim(),
      studentStates: Object.fromEntries(students.map(student => [student.id, { status: "unrecorded", note: "", updatedAt: now }])),
      createdAt: now,
      updatedAt: now,
    };
    onChange([assignment, ...assignments]);
    setSelectedId(assignment.id);
    setTitle("");
    setNote("");
    setFilter("all");
    actionToast.show({
      message: `“${assignment.title}”已创建，${students.length} 人待登记`,
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => onChange(assignmentsRef.current.filter(item => item.id !== assignment.id)),
      duration: 6000,
    });
  }

  function updateStudents(studentIds: StudentId[], status: HomeworkStudentStatus): boolean {
    if (!selected || !studentIds.length) return false;
    const changedIds = studentIds.filter(studentId => studentStates.get(studentId) !== status);
    if (!changedIds.length) return false;
    const previous = assignments;
    const now = new Date().toISOString();
    setUndoAssignments(previous);
    onChange(assignments.map(item => item.id === selected.id ? {
      ...item,
      studentStates: { ...item.studentStates, ...Object.fromEntries(changedIds.map(studentId => [studentId, { status, note: item.studentStates[studentId]?.note || "", updatedAt: now }])) },
      updatedAt: now,
    } : item));
    return true;
  }

  function markStudent(student: AppStudent) {
    const changed = updateStudents([student.id], markStatus);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setRecentUpdate({ studentId: student.id, message: changed ? `${student.name} 已设为${STATUS_META[markStatus].label}` : `${student.name} 已是${STATUS_META[markStatus].label}` });
    feedbackTimerRef.current = window.setTimeout(() => setRecentUpdate(null), 1400);
  }

  function updateStudentNote(studentId: StudentId, studentNote: string) {
    if (!selected) return;
    const now = new Date().toISOString();
    onChange(assignments.map(item => item.id === selected.id ? { ...item, studentStates: { ...item.studentStates, [studentId]: { status: studentStates.get(studentId) || "pending", note: studentNote, updatedAt: now } }, updatedAt: now } : item));
  }

  async function markAllSubmitted() {
    if (!selected || !students.length) return;
    const confirmed = await appDialog.confirm({ title: "全部设为已交？", description: `将“${selected.title}”的 ${students.length} 名学生全部设为已交。操作后仍可撤销或单独修改异常学生。`, confirmLabel: "全部设为已交" });
    if (!confirmed) return;
    updateStudents(students.map(student => student.id), "submitted");
    actionToast.show({ message: `${students.length} 名学生已全部设为已交` });
  }

  function undoLastRegistration() {
    if (!undoAssignments) return;
    onChange(undoAssignments);
    setUndoAssignments(null);
  }

  function openCatalog() {
    setDraftSubjects(subjectCatalog);
    setNewSubject("");
    setCatalogStatus("");
    setCatalogOpen(true);
  }

  function addSubject() {
    const value = newSubject.trim();
    if (!value) return;
    if (draftSubjects.some(item => item.trim() === value)) { setCatalogStatus("这个学科已经存在。"); return; }
    setDraftSubjects(current => [...current, value]);
    setNewSubject("");
    setCatalogStatus("");
  }

  function saveCatalog() {
    const next = draftSubjects.map(item => item.trim()).filter(Boolean).filter((item, index, values) => values.indexOf(item) === index);
    if (!next.length) { setCatalogStatus("至少保留一个学科。"); return; }
    const selectedIndex = subjectCatalog.indexOf(subject);
    if (selectedIndex >= 0 && next[selectedIndex]) setSubject(next[selectedIndex]);
    onSubjectCatalogChange(next);
    setCatalogOpen(false);
    actionToast.show({ message: "常用学科已保存" });
  }

  return <>
    <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <Card title="布置作业"><div className="space-y-3">
          <input value={title} onChange={event => setTitle(event.target.value)} placeholder="作业名称" className="h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"/>
          <div className="flex gap-2"><SelectMenu value={subject} onChange={setSubject} ariaLabel="作业学科" placeholder="选择学科" searchable className="min-w-0 flex-1" options={subjectCatalog.map(item => ({ value: item, label: item }))}/><Button size="sm" variant="secondary" onClick={openCatalog}><Settings2 className="h-4 w-4"/>管理</Button></div>
          <DatePicker value={dueDate} onChange={setDueDate} ariaLabel="作业截止日期" className="w-full"/>
          <textarea value={note} onChange={event => setNote(event.target.value)} rows={3} placeholder="说明（可选）" className="w-full resize-none rounded-[var(--app-radius-sm)] border border-[var(--app-border)] px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"/>
          <Button className="w-full" disabled={!title.trim() || !subject} onClick={add}><Plus className="h-4 w-4"/>保存作业</Button>
          {!subject && <p className="text-xs text-[var(--app-text-muted)]">选择学科后即可保存；自定义学科可在“管理”中添加。</p>}
        </div></Card>
        <Card title="作业列表" bodyClassName="p-2"><div className="space-y-1">{assignments.map(item => {
          const unrecorded = students.filter(student => item.studentStates[student.id]?.status === "unrecorded").length;
          const missing = students.filter(student => (item.studentStates[student.id]?.status || "pending") === "pending").length;
          return <button type="button" key={item.id} onClick={() => { setSelectedId(item.id); setFilter("all"); setSearch(""); setUndoAssignments(null); }} className={`w-full rounded-[var(--app-radius-sm)] px-3 py-3 text-left transition-colors ${selected?.id === item.id ? "bg-blue-50 text-blue-800" : "hover:bg-gray-50"}`}><span className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm">{item.title}</strong>{item.subject && <span className="rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-bold text-blue-600">{item.subject}</span>}</span><span className="mt-1 block text-xs text-gray-400">{item.dueDate} · 待登记 {unrecorded} · 未交 {missing}</span></button>;
        })}{!assignments.length && <p className="py-8 text-center text-sm text-gray-400">暂无作业</p>}</div></Card>
      </div>

      <Card title={selected ? selected.title : "学生交付状态"} action={selected && pendingIds.length ? <Button size="sm" variant="secondary" onClick={() => onCreateFollowups(selected, pendingIds)}>为未交 {pendingIds.length} 人建跟进</Button> : undefined}>
        {selected ? <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--app-radius-md)] bg-[var(--app-surface-muted)] p-3">
            <div className="min-w-36"><div className="text-xs font-bold text-[var(--app-text-muted)]">登记进度</div><div className="mt-1 text-lg font-black text-[var(--app-text)]">{registeredCount} / {students.length}</div></div>
            <div className="min-w-48 flex-1"><div className="mb-1.5 text-xs font-bold text-[var(--app-text-muted)]">快速登记：点击学生标记为</div><SegmentedControl value={markStatus} onChange={value => setMarkStatus(value as HomeworkStudentStatus)} ariaLabel="快速登记状态" className="w-full overflow-x-auto" options={STATUS_OPTIONS.map(option => ({ value: option.value, label: option.label }))}/></div>
            <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void markAllSubmitted()}><Check className="h-4 w-4"/>全部已交</Button><Button size="sm" variant="ghost" disabled={!undoAssignments} onClick={undoLastRegistration}><RotateCcw className="h-4 w-4"/>撤销上一步</Button></div>
          </div>

          <div className="flex min-h-6 items-center"><p aria-live="polite" className={`text-xs font-bold transition-colors duration-200 ${recentUpdate ? "text-blue-600" : "text-[var(--app-text-muted)]"}`}>{recentUpdate?.message || "学生始终按班级名单顺序显示；只有主动筛选时才会缩小列表。"}</p></div>

          <div className="flex flex-wrap items-center gap-2">{[{ value: "all" as const, label: "全部", count: students.length }, ...STATUS_OPTIONS.map(option => ({ ...option, count: counts[option.value] }))].map(option => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 ${filter === option.value ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}>{option.label} {option.count}</button>)}<div className="relative ml-auto min-w-48 flex-1 sm:max-w-64"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索学生" className="h-9 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"/></div><SegmentedControl value={viewMode} onChange={value => setViewMode(value as "quick" | "detail")} ariaLabel="作业登记视图" options={[{ value: "quick", label: "快速", icon: <LayoutGrid className="h-4 w-4"/> }, { value: "detail", label: "详细", icon: <List className="h-4 w-4"/> }]}/></div>

          {viewMode === "quick" ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{shownStudents.map(student => { const status = studentStates.get(student.id) || "pending"; const meta = STATUS_META[status]; return <button key={student.id} type="button" data-homework-student-id={student.id} aria-label={`${student.name}当前${meta.label}，点击设为${STATUS_META[markStatus].label}`} onClick={() => markStudent(student)} className={`flex min-h-16 items-center gap-3 rounded-[var(--app-radius-sm)] border px-3 py-2 text-left transition-[border-color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 motion-reduce:transition-none ${meta.card} ${recentUpdate?.studentId === student.id ? "ring-2 ring-blue-400 ring-offset-1 shadow-md" : ""}`}><span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${status === "submitted" ? "bg-emerald-500 text-white" : "bg-white text-gray-400"}`}>{status === "submitted" ? <Check className="h-4 w-4"/> : student.name.slice(0, 1)}</span><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-gray-800">{student.name}</strong><span className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ${meta.badge}`}>{meta.label}</span></span></button>; })}</div> : <div className="space-y-2">{shownStudents.map(student => { const state = selected.studentStates[student.id] || { status: "pending" as const, note: "" }; return <div key={student.id} className="grid items-center gap-2 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] p-3 sm:grid-cols-[7rem_8rem_minmax(0,1fr)]"><strong className="truncate text-sm text-gray-700">{student.name}</strong><SelectMenu value={state.status} onChange={value => updateStudents([student.id], value as HomeworkStudentStatus)} ariaLabel={`${student.name}作业状态`} options={STATUS_OPTIONS}/><input value={state.note} onChange={event => updateStudentNote(student.id, event.target.value)} placeholder={state.status === "submitted" ? "备注（可选）" : "记录原因或说明"} className="h-9 min-w-0 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"/></div>; })}</div>}
          {!shownStudents.length && <div className="py-14 text-center text-sm text-[var(--app-text-muted)]">没有符合当前筛选的学生</div>}
        </div> : <div className="py-16 text-center text-gray-400"><CheckCircle2 className="mx-auto h-7 w-7"/><p className="mt-2 text-sm">先在左侧布置一项作业</p></div>}
      </Card>
    </div>

    <ToolDrawer open={catalogOpen} title="管理常用学科" onClose={() => setCatalogOpen(false)} footer={<div className="flex gap-2"><Button variant="ghost" className="flex-1" onClick={() => setCatalogOpen(false)}>取消</Button><Button className="flex-1" onClick={saveCatalog}>保存学科设置</Button></div>}>
      <div className="space-y-4"><p className="text-sm leading-6 text-[var(--app-text-muted)]">这些学科属于当前班级和学期。修改名称不会重写历史作业；历史中已使用的学科会继续保留。</p><div className="space-y-2">{draftSubjects.map((item, index) => <label key={index} className="block text-xs font-bold text-[var(--app-text-muted)]">学科 {index + 1}<input value={item} onChange={event => setDraftSubjects(current => current.map((subjectItem, subjectIndex) => subjectIndex === index ? event.target.value : subjectItem))} aria-label={`学科 ${index + 1}`} className="mt-1 h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] px-3 text-sm font-normal text-[var(--app-text)] outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"/></label>)}</div><div className="rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3"><div className="text-xs font-bold text-[var(--app-text-muted)]">添加学科</div><div className="mt-2 flex gap-2"><input value={newSubject} onChange={event => setNewSubject(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addSubject(); }} placeholder="例如：信息技术" className="h-10 min-w-0 flex-1 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-3 text-sm outline-none focus:border-blue-300"/><Button size="sm" disabled={!newSubject.trim()} onClick={addSubject}><Plus className="h-4 w-4"/>添加</Button></div>{catalogStatus && <p role="alert" className="mt-2 text-xs font-bold text-rose-600">{catalogStatus}</p>}</div></div>
    </ToolDrawer>
    {appDialog.dialog}
    {actionToast.toast}
  </>;
}
