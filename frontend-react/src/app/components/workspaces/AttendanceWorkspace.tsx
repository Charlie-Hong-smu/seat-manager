import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, LayoutGrid, List, ListPlus, RotateCcw, Search, Settings2 } from "lucide-react";
import { batchUpsertAttendance, todayKey, upsertAttendance } from "../../state/dailyManagement";
import type { AppStudent, AttendanceRecord, StudentId } from "../../state/types";
import type { FollowupTaskDraft } from "../FollowupTaskDrawer";
import type { TimelineTarget } from "../../state/dataInsights";
import { AttendanceStatusControl } from "../AttendanceStatusControl";
import { ActionToast, Button, Card, DatePicker, SegmentedControl, useAppDialog } from "../ui";

type AttendanceQuickStatus = "leave" | "absent" | "late" | "earlyLeave" | "normal";

const QUICK_STATUS_OPTIONS: { value: AttendanceQuickStatus; label: string }[] = [
  { value: "leave", label: "请假" },
  { value: "absent", label: "缺勤" },
  { value: "late", label: "迟到" },
  { value: "earlyLeave", label: "早退" },
  { value: "normal", label: "正常" },
];

function attendanceSummary(record?: AttendanceRecord) {
  const labels: string[] = [];
  if (record?.status === "leave") labels.push("请假");
  else if (record?.status === "absent") labels.push("缺勤");
  if (record?.late) labels.push("迟到");
  if (record?.earlyLeave) labels.push("早退");
  return labels.length ? labels.join(" · ") : "正常";
}

function attendanceCardStyle(record?: AttendanceRecord) {
  if (record?.status === "absent") return { card: "border-rose-200 bg-rose-50/70", badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500 text-white" };
  if (record?.status === "leave") return { card: "border-amber-200 bg-amber-50/70", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500 text-white" };
  if (record?.late && record?.earlyLeave) return { card: "border-violet-200 bg-violet-50/70", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500 text-white" };
  if (record?.late) return { card: "border-blue-200 bg-blue-50/70", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500 text-white" };
  if (record?.earlyLeave) return { card: "border-violet-200 bg-violet-50/70", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500 text-white" };
  return { card: "border-emerald-100 bg-white", badge: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500 text-white" };
}

function downloadCsv(students: AppStudent[], records: AttendanceRecord[], date: string) {
  const names = new Map(students.map(student => [student.id, student.name]));
  const rows = [["日期", "姓名", "状态", "迟到", "早退", "请假开始", "请假结束", "备注"], ...records.filter(item => item.date === date).map(item => [date, names.get(item.studentId) || item.studentId, item.status === "leave" ? "请假" : item.status === "absent" ? "缺勤" : "正常", item.late ? "是" : "", item.earlyLeave ? "是" : "", item.leaveStart || "", item.leaveEnd || "", item.note])];
  const content = `\ufeff${rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n")}`;
  const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" })); link.download = `出勤_${date}.csv`; link.click(); URL.revokeObjectURL(link.href);
}

function AttendanceDateTimeFields({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const [datePart = "", timePart = ""] = value.split("T");
  const update = (nextDate: string, nextTime: string) => onChange(nextDate ? `${nextDate}T${nextTime || "00:00"}` : "");
  return <fieldset className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2"><legend className="sr-only">{label}</legend><DatePicker value={datePart} onChange={next => update(next, timePart)} ariaLabel={`${label}日期`} className="w-full bg-white"/><input type="time" aria-label={`${label}时间`} value={timePart} onChange={event => update(datePart || todayKey(), event.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-2 text-xs"/></fieldset>;
}

export function AttendanceWorkspace({ students, records, onChange, onRequestTask, initialTarget }: { students: AppStudent[]; records: AttendanceRecord[]; onChange: (records: AttendanceRecord[]) => void; onRequestTask: (draft: FollowupTaskDraft) => void; initialTarget?: TimelineTarget }) {
  const appDialog = useAppDialog();
  const [date, setDate] = useState(todayKey()); const [search, setSearch] = useState(""); const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Set<StudentId>>(new Set()); const [editingId, setEditingId] = useState(""); const [undo, setUndo] = useState<AttendanceRecord[] | null>(null);
  const [viewMode, setViewMode] = useState<"quick" | "detail">("quick");
  const [quickStatus, setQuickStatus] = useState<AttendanceQuickStatus>("leave");
  const [recentUpdate, setRecentUpdate] = useState<{ studentId: StudentId; message: string } | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  useEffect(() => () => { if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current); }, []);
  useEffect(() => {
    if (!initialTarget) return;
    if (initialTarget.date) setDate(initialTarget.date);
    const student = students.find(item => item.id === initialTarget.studentId);
    if (student) setSearch(student.name);
  }, [initialTarget, students]);
  const byStudent = useMemo(() => new Map(records.filter(item => item.date === date).map(item => [item.studentId, item])), [date, records]);
  const rows = students.filter(student => {
    const record = byStudent.get(student.id);
    const matchesSearch = !search || student.name.includes(search) || student.aliases.some(alias => alias.includes(search));
    const matchesFilter = filter === "all"
      || (filter === "abnormal" ? Boolean(record) : filter === "late" ? Boolean(record?.late) : filter === "earlyLeave" ? Boolean(record?.earlyLeave) : (record?.status || "normal") === filter);
    return matchesSearch && matchesFilter;
  });
  const counts = students.reduce((map, student) => { const record = byStudent.get(student.id); const status = record?.status || "normal"; map[status] += 1; if (record?.late) map.late += 1; if (record?.earlyLeave) map.earlyLeave += 1; return map; }, { normal: 0, leave: 0, absent: 0, late: 0, earlyLeave: 0 });
  function commit(next: AttendanceRecord[]) { setUndo(records); onChange(next); }
  function patchStudent(studentId: string, patch: Partial<Pick<AttendanceRecord, "status" | "late" | "earlyLeave" | "note" | "leaveStart" | "leaveEnd">>) { const current = byStudent.get(studentId); commit(upsertAttendance(records, { studentId, date, status: patch.status ?? current?.status ?? "normal", late: patch.late ?? current?.late ?? false, earlyLeave: patch.earlyLeave ?? current?.earlyLeave ?? false, note: patch.note ?? current?.note ?? "", leaveStart: patch.leaveStart ?? current?.leaveStart, leaveEnd: patch.leaveEnd ?? current?.leaveEnd })); }
  async function batch(patch: Partial<Pick<AttendanceRecord, "status" | "late" | "earlyLeave" | "leaveStart" | "leaveEnd">>, label: string) { if (!selected.size || !await appDialog.confirm({ title: `批量设置为${label}？`, description: `将覆盖所选 ${selected.size} 名学生在 ${date} 的出勤状态。提交后可通过页面提示短时撤销。`, confirmLabel: `确认设置为${label}`, variant: "primary" })) return; commit(batchUpsertAttendance(records, [...selected], date, patch)); setSelected(new Set()); }
  function toggle(id: string) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  function markStudent(student: AppStudent) {
    const current = byStudent.get(student.id);
    const already = quickStatus === "normal"
      ? !current
      : quickStatus === "leave"
        ? current?.status === "leave"
        : quickStatus === "absent"
          ? current?.status === "absent"
          : quickStatus === "late"
            ? Boolean(current?.late)
            : Boolean(current?.earlyLeave);
    if (!already) {
      if (quickStatus === "normal") patchStudent(student.id, { status: "normal", late: false, earlyLeave: false, leaveStart: "", leaveEnd: "" });
      else if (quickStatus === "leave" || quickStatus === "absent") patchStudent(student.id, { status: quickStatus });
      else patchStudent(student.id, { [quickStatus]: true });
    }
    const label = QUICK_STATUS_OPTIONS.find(option => option.value === quickStatus)?.label || "正常";
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setRecentUpdate({ studentId: student.id, message: `${student.name} ${already ? "已是" : "已设为"}${label}` });
    feedbackTimerRef.current = window.setTimeout(() => setRecentUpdate(null), 1400);
  }

  const filterOptions = [
    { value: "all", label: "全部", count: students.length },
    { value: "abnormal", label: "已记录", count: byStudent.size },
    { value: "leave", label: "请假", count: counts.leave },
    { value: "absent", label: "缺勤", count: counts.absent },
    { value: "late", label: "迟到", count: counts.late },
    { value: "earlyLeave", label: "早退", count: counts.earlyLeave },
  ];

  return <div className="h-full overflow-y-auto bg-gray-50 p-4"><div className="mx-auto max-w-6xl space-y-4">
    <Card className="surface-enter" bodyClassName="grid gap-3 p-4 sm:grid-cols-3">{[{ k:"normal",l:"正常",c:"text-emerald-600"},{k:"leave",l:"请假",c:"text-amber-600"},{k:"absent",l:"缺勤",c:"text-red-500"}].map(item => <div key={item.k} className="rounded-[var(--app-radius-sm)] bg-[var(--app-surface-muted)] px-4 py-3"><div className="text-xs text-[var(--app-text-muted)]">{item.l}</div><div className={`mt-1 text-xl font-bold ${item.c}`}>{counts[item.k as keyof typeof counts]}</div></div>)}</Card>
    <Card title="每日出勤" action={<Button size="sm" variant="ghost" onClick={() => downloadCsv(students, records, date)}><Download className="h-4 w-4"/>导出</Button>}>
      <div className="mb-3 rounded-[var(--app-radius-md)] bg-[var(--app-surface-muted)] p-3">
        <div className="mb-2 text-xs font-bold text-[var(--app-text-muted)]">快速登记：点击学生标记为</div>
        <div className="flex flex-wrap items-center gap-3">
          <DatePicker value={date} onChange={value => { setDate(value); setSelected(new Set()); setRecentUpdate(null); }} ariaLabel="出勤日期" className="w-44 bg-white"/>
          <SegmentedControl value={quickStatus} onChange={value => setQuickStatus(value as AttendanceQuickStatus)} ariaLabel="快速出勤状态" className="min-w-72 flex-1 overflow-x-auto" options={QUICK_STATUS_OPTIONS}/>
          <Button size="sm" variant="ghost" disabled={!undo} onClick={() => { if (!undo) return; onChange(undo); setUndo(null); }}><RotateCcw className="h-4 w-4"/>撤销上一步</Button>
        </div>
      </div>

      <p aria-live="polite" className="sr-only">{recentUpdate?.message || ""}</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filterOptions.map(option => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 ${filter === option.value ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}>{option.label} {option.count}</button>)}
        <div className="relative ml-auto min-w-48 flex-1 sm:max-w-64"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索学生" className="h-9 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"/></div>
        <SegmentedControl value={viewMode} onChange={value => { setViewMode(value as "quick" | "detail"); setSelected(new Set()); }} ariaLabel="出勤登记视图" options={[{ value: "quick", label: "快速", icon: <LayoutGrid className="h-4 w-4"/> }, { value: "detail", label: "详细", icon: <List className="h-4 w-4"/> }]}/>
      </div>

      {viewMode === "quick" ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{rows.map(student => {
        const record = byStudent.get(student.id);
        const summary = attendanceSummary(record);
        const style = attendanceCardStyle(record);
        const targetLabel = QUICK_STATUS_OPTIONS.find(option => option.value === quickStatus)?.label || "正常";
        return <button key={student.id} type="button" data-attendance-student-id={student.id} aria-label={`${student.name}当前${summary}，点击设为${targetLabel}`} onClick={() => markStudent(student)} className={`flex min-h-16 items-center gap-3 rounded-[var(--app-radius-sm)] border px-3 py-2 text-left transition-[border-color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 motion-reduce:transition-none ${style.card} ${recentUpdate?.studentId === student.id ? "ring-2 ring-blue-400 ring-offset-1 shadow-md" : ""}`}>
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${style.dot}`}>{record ? <Check className="h-4 w-4"/> : student.name.slice(0, 1)}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-gray-800">{student.name}</strong><span className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ${style.badge}`}>{summary}</span></span>
        </button>;
      })}</div> : <>
        {selected.size > 0 && <div className="view-switch-enter mb-3 flex flex-wrap items-center gap-2 rounded-[var(--app-radius-sm)] border border-blue-100 bg-blue-50 p-2.5"><span className="mr-auto text-xs font-bold text-blue-700">已选 {selected.size} 人</span><Button size="sm" variant="secondary" onClick={() => batch({status:"normal",late:false,earlyLeave:false,leaveStart:"",leaveEnd:""},"正常")}>正常</Button><Button size="sm" variant="secondary" onClick={() => batch({status:"leave"},"请假")}>请假</Button><Button size="sm" variant="danger" onClick={() => batch({status:"absent"},"缺勤")}>缺勤</Button><Button size="sm" variant="secondary" onClick={() => batch({late:true},"迟到")}>迟到</Button><Button size="sm" variant="secondary" onClick={() => batch({earlyLeave:true},"早退")}>早退</Button><Button size="sm" onClick={()=>onRequestTask({studentId:[...selected][0],studentIds:[...selected],title:"出勤异常跟进",type:"出勤关注",description:`${date} 出勤批量跟进`,plannedDate:date,dueDate:date,source:"attendance",sourceRef:{domain:"attendance",entityId:`${date}-batch`}})}><ListPlus className="h-3.5 w-3.5"/>创建任务</Button></div>}
        <div className="overflow-hidden rounded-xl border border-gray-100">{rows.map(student => { const record=byStudent.get(student.id); const status=record?.status||"normal"; const editing=editingId===student.id; return <div key={student.id} className="view-switch-enter border-b border-gray-50 px-4 py-3 last:border-0"><div className="grid grid-cols-[auto_minmax(7rem,1fr)_auto] items-center gap-3"><input type="checkbox" checked={selected.has(student.id)} onChange={() => toggle(student.id)} className="accent-blue-600" aria-label={`选择 ${student.name}`}/><div><div className="font-bold text-gray-800">{student.name}</div><div className="text-xs text-gray-400">{record?.note || attendanceSummary(record)}</div></div><div className="flex items-center gap-2"><AttendanceStatusControl compact value={status} late={record?.late||false} earlyLeave={record?.earlyLeave||false} onChange={patch => patchStudent(student.id, patch)}/><button onClick={() => setEditingId(editing ? "" : student.id)} className="rounded-lg bg-gray-50 p-2 text-gray-500" aria-label={`编辑 ${student.name} 详情`}><Settings2 className="h-4 w-4"/></button></div></div>{editing && <div className="mt-3 grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-3"><input value={record?.note||""} onChange={event => patchStudent(student.id,{note:event.target.value})} placeholder="备注" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none"/><AttendanceDateTimeFields label="请假开始" value={record?.leaveStart||""} onChange={value => patchStudent(student.id,{leaveStart:value})}/><AttendanceDateTimeFields label="请假结束" value={record?.leaveEnd||""} onChange={value => patchStudent(student.id,{leaveEnd:value})}/>{record && <button onClick={() => onRequestTask({studentId:student.id,title:`出勤跟进：${record.status==="leave"?"请假":record.status==="absent"?"缺勤":record.late?"迟到":"早退"}`,type:"出勤关注",description:`${date}${record.note?` · ${record.note}`:""}`,plannedDate:date,dueDate:date,source:"attendance",sourceRef:{domain:"attendance",entityId:record.id}})} className="sm:col-span-3 flex items-center justify-center gap-1 rounded-lg bg-violet-50 py-2 text-xs font-bold text-violet-700"><ListPlus className="h-3.5 w-3.5"/>创建跟进任务</button>}</div>}</div>})}</div>
      </>}
      {!rows.length && <div className="py-12 text-center text-sm text-gray-400">没有符合条件的学生</div>}
    </Card>
    {undo && <ActionToast message="出勤修改已保存" actionLabel="撤销" actionIcon={<RotateCcw className="h-3.5 w-3.5"/>} onAction={() => { onChange(undo); setUndo(null); }} onClose={() => setUndo(null)} duration={6000}/>}
    {appDialog.dialog}
  </div></div>;
}
