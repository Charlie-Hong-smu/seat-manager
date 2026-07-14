import { useEffect, useMemo, useState } from "react";
import { Download, ListPlus, RotateCcw, Search, Settings2 } from "lucide-react";
import { batchUpsertAttendance, todayKey, upsertAttendance } from "../../state/dailyManagement";
import type { AppStudent, AttendanceRecord, StudentId } from "../../state/types";
import type { FollowupTaskDraft } from "../FollowupTaskDrawer";
import type { TimelineTarget } from "../../state/dataInsights";
import { AttendanceStatusControl } from "../AttendanceStatusControl";
import { ActionToast, Button, Card, DatePicker, SegmentedControl, useAppDialog } from "../ui";

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
  useEffect(() => {
    if (!initialTarget) return;
    if (initialTarget.date) setDate(initialTarget.date);
    const student = students.find(item => item.id === initialTarget.studentId);
    if (student) setSearch(student.name);
  }, [initialTarget, students]);
  const byStudent = useMemo(() => new Map(records.filter(item => item.date === date).map(item => [item.studentId, item])), [date, records]);
  const rows = students.filter(student => (!search || student.name.includes(search) || student.aliases.some(alias => alias.includes(search))) && (filter === "all" || (filter === "abnormal" ? Boolean(byStudent.get(student.id)) : (byStudent.get(student.id)?.status || "normal") === filter)));
  const counts = students.reduce((map, student) => { const status = byStudent.get(student.id)?.status || "normal"; map[status] += 1; return map; }, { normal: 0, leave: 0, absent: 0 });
  function commit(next: AttendanceRecord[]) { setUndo(records); onChange(next); }
  function patchStudent(studentId: string, patch: Partial<Pick<AttendanceRecord, "status" | "late" | "earlyLeave" | "note" | "leaveStart" | "leaveEnd">>) { const current = byStudent.get(studentId); commit(upsertAttendance(records, { studentId, date, status: patch.status ?? current?.status ?? "normal", late: patch.late ?? current?.late ?? false, earlyLeave: patch.earlyLeave ?? current?.earlyLeave ?? false, note: patch.note ?? current?.note ?? "", leaveStart: patch.leaveStart ?? current?.leaveStart, leaveEnd: patch.leaveEnd ?? current?.leaveEnd })); }
  async function batch(patch: Partial<Pick<AttendanceRecord, "status" | "late" | "earlyLeave">>, label: string) { if (!selected.size || !await appDialog.confirm({ title: `批量设置为${label}？`, description: `将覆盖所选 ${selected.size} 名学生在 ${date} 的出勤状态。提交后可通过页面提示短时撤销。`, confirmLabel: `确认设置为${label}`, variant: "primary" })) return; commit(batchUpsertAttendance(records, [...selected], date, patch)); setSelected(new Set()); }
  function toggle(id: string) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  return <div className="h-full overflow-y-auto bg-gray-50 p-4"><div className="mx-auto max-w-6xl space-y-4">
    <Card className="surface-enter" bodyClassName="grid gap-3 p-4 sm:grid-cols-3">{[{ k:"normal",l:"默认正常",c:"text-emerald-600"},{k:"leave",l:"请假",c:"text-amber-600"},{k:"absent",l:"缺勤",c:"text-red-500"}].map(item => <div key={item.k} className="rounded-[var(--app-radius-sm)] bg-[var(--app-surface-muted)] px-4 py-3"><div className="text-xs text-[var(--app-text-muted)]">{item.l}</div><div className={`mt-1 text-xl font-bold ${item.c}`}>{counts[item.k as keyof typeof counts]}</div></div>)}</Card>
    <Card title="每日出勤" action={<Button size="sm" variant="ghost" onClick={() => downloadCsv(students, records, date)}><Download className="h-4 w-4"/>导出</Button>}>
      <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">全班默认正常，只保存异常、迟到、早退或带备注的记录。今日已记录 {byStudent.size} 人。</div>
      <div className="mb-4 flex flex-wrap items-center gap-3"><DatePicker value={date} onChange={value => { setDate(value); setSelected(new Set()); }} ariaLabel="出勤日期" className="w-44 bg-gray-50"/><div className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-gray-400"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索学生" className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-blue-300"/></div><SegmentedControl value={filter} ariaLabel="出勤筛选" onChange={setFilter} options={[{value:"all",label:"全部"},{value:"abnormal",label:"已记录"},{value:"leave",label:"请假"},{value:"absent",label:"缺勤"}]}/></div>
      {selected.size > 0 && <div className="view-switch-enter mb-3 flex flex-wrap items-center gap-2 rounded-[var(--app-radius-sm)] border border-blue-100 bg-blue-50 p-2.5"><span className="mr-auto text-xs font-bold text-blue-700">已选 {selected.size} 人</span><Button size="sm" variant="secondary" onClick={() => batch({status:"normal",late:false,earlyLeave:false},"正常")}>正常</Button><Button size="sm" variant="secondary" onClick={() => batch({status:"leave"},"请假")}>请假</Button><Button size="sm" variant="danger" onClick={() => batch({status:"absent"},"缺勤")}>缺勤</Button><Button size="sm" variant="secondary" onClick={() => batch({late:true},"迟到")}>迟到</Button><Button size="sm" variant="secondary" onClick={() => batch({earlyLeave:true},"早退")}>早退</Button><Button size="sm" onClick={()=>onRequestTask({studentId:[...selected][0],studentIds:[...selected],title:"出勤异常跟进",type:"出勤关注",description:`${date} 出勤批量跟进`,plannedDate:date,dueDate:date,source:"attendance",sourceRef:{domain:"attendance",entityId:`${date}-batch`}})}><ListPlus className="h-3.5 w-3.5"/>创建任务</Button></div>}
      <div className="overflow-hidden rounded-xl border border-gray-100">{rows.map(student => { const record=byStudent.get(student.id); const status=record?.status||"normal"; const editing=editingId===student.id; return <div key={student.id} className="view-switch-enter border-b border-gray-50 px-4 py-3 last:border-0"><div className="grid grid-cols-[auto_minmax(7rem,1fr)_auto] items-center gap-3"><input type="checkbox" checked={selected.has(student.id)} onChange={() => toggle(student.id)} className="accent-blue-600" aria-label={`选择 ${student.name}`}/><div><div className="font-bold text-gray-800">{student.name}</div><div className="text-xs text-gray-400">{record?.note || "默认正常"}</div></div><div className="flex items-center gap-2"><AttendanceStatusControl compact value={status} late={record?.late||false} earlyLeave={record?.earlyLeave||false} onChange={patch => patchStudent(student.id, patch)}/><button onClick={() => setEditingId(editing ? "" : student.id)} className="rounded-lg bg-gray-50 p-2 text-gray-500" aria-label="编辑详情"><Settings2 className="h-4 w-4"/></button></div></div>{editing && <div className="mt-3 grid gap-2 rounded-xl bg-gray-50 p-3 sm:grid-cols-3"><input value={record?.note||""} onChange={event => patchStudent(student.id,{note:event.target.value})} placeholder="备注" className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none"/><AttendanceDateTimeFields label="请假开始" value={record?.leaveStart||""} onChange={value => patchStudent(student.id,{leaveStart:value})}/><AttendanceDateTimeFields label="请假结束" value={record?.leaveEnd||""} onChange={value => patchStudent(student.id,{leaveEnd:value})}/>{record && <button onClick={() => onRequestTask({studentId:student.id,title:`出勤跟进：${record.status==="leave"?"请假":record.status==="absent"?"缺勤":record.late?"迟到":"早退"}`,type:"出勤关注",description:`${date}${record.note?` · ${record.note}`:""}`,plannedDate:date,dueDate:date,source:"attendance",sourceRef:{domain:"attendance",entityId:record.id}})} className="sm:col-span-3 flex items-center justify-center gap-1 rounded-lg bg-violet-50 py-2 text-xs font-bold text-violet-700"><ListPlus className="h-3.5 w-3.5"/>创建跟进任务</button>}</div>}</div>})}{!rows.length&&<div className="py-12 text-center text-sm text-gray-400">没有符合条件的学生</div>}</div>
    </Card>
    {undo && <ActionToast message="出勤修改已保存" actionLabel="撤销" actionIcon={<RotateCcw className="h-3.5 w-3.5"/>} onAction={() => onChange(undo)} onClose={() => setUndo(null)} duration={6000}/>}
    {appDialog.dialog}
  </div></div>;
}
