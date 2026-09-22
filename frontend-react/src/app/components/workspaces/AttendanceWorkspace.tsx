import { useEffect, useMemo, useRef, useState } from "react";

import { useAttendanceUndo } from "../../hooks/useAttendanceUndo";
import { useInitialTargetEffect } from "../../hooks/useInitialTargetEffect";
import { Check, Download, LayoutGrid, List, ListPlus, RotateCcw, Search, Settings2 } from "lucide-react";
import { batchUpsertAttendance, todayKey, upsertAttendance } from "../../state/dailyManagement";
import { normalizeAttendancePatch } from "../../state/classManagementCommands";
import { createActivityEvent } from "../../state/activityEvents";
import { buildAttendanceCsv, buildAttendanceRangeCsv } from "../../state/attendanceExport";
import { getFundPeriodRange } from "../../state/classFundActions";
import { downloadCsvFile } from "../../state/csv";
import { matchesStudentSearch } from "../../state/studentSearch";
import type { ActivityEvent, AppStudent, AttendanceRecord, FollowupTask, StudentId } from "../../state/types";
import type { FollowupTaskDraft } from "../FollowupTaskDrawer";
import type { TimelineTarget } from "../../state/dataInsights";
import { AttendanceStatusControl } from "../AttendanceStatusControl";
import { MotionList, MotionSwitch, MotionCollapse, useActionToast, AnimatedPopover, Button, Input, IconButton, Checkbox, DatePicker, MetricStrip, SegmentedControl, useAppDialog } from "../ui";

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
  if (record?.status === "absent") return { badge: "bg-status-rose-100 text-status-rose-700", dot: "bg-status-rose-500 text-text-white" };
  if (record?.status === "leave") return { badge: "bg-status-warning-100 text-status-warning-700", dot: "bg-status-warning-500 text-text-white" };
  if (record?.late && record?.earlyLeave) return { badge: "bg-status-warning-100 text-status-warning-700", dot: "bg-status-warning-500 text-text-white" };
  if (record?.late) return { badge: "bg-accent-100 text-accent-700", dot: "bg-accent-500 text-text-white" };
  if (record?.earlyLeave) return { badge: "bg-status-warning-100 text-status-warning-700", dot: "bg-status-warning-500 text-text-white" };
  return { badge: "bg-status-success-50 text-status-success-700", dot: "bg-status-success-500 text-text-white" };
}

function downloadCsv(students: AppStudent[], records: AttendanceRecord[], date: string) {
  downloadCsvFile(`出勤_${date}.csv`, buildAttendanceCsv(students, records, date));
}

function downloadRangeCsv(students: AppStudent[], records: AttendanceRecord[], from: string, to: string) {
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  downloadCsvFile(`出勤_${start}_${end}.csv`, buildAttendanceRangeCsv(students, records, start, end));
}

function AttendanceDateTimeFields({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
  const [datePart = "", timePart = ""] = value.split("T");
  const update = (nextDate: string, nextTime: string) => onChange(nextDate ? `${nextDate}T${nextTime || "00:00"}` : "");
  return <fieldset className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2"><legend className="sr-only">{label}</legend><DatePicker value={datePart} onChange={next => update(next, timePart)} ariaLabel={`${label}日期`} className="w-full bg-background-primary-default"/><input type="time" aria-label={`${label}时间`} value={timePart} onChange={event => update(datePart || todayKey(), event.target.value)} className="h-10 rounded-xl border border-border-button-default bg-background-primary-default px-2 text-caption-1-regular"/></fieldset>;
}

export function AttendanceWorkspace({ students, records, tasks = [], onChange, onRequestTask, onActivity, onOpenTask, initialTarget, onInitialTargetConsumed }: { students: AppStudent[]; records: AttendanceRecord[]; tasks?: FollowupTask[]; onChange: (records: AttendanceRecord[]) => void; onRequestTask: (draft: FollowupTaskDraft) => void; onActivity?: (event: ActivityEvent) => void | (() => void); onOpenTask?: (taskId: string) => void; initialTarget?: TimelineTarget; onInitialTargetConsumed?: () => void }) {
  const appDialog = useAppDialog();
  const [date, setDate] = useState(todayKey()); const [search, setSearch] = useState(""); const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState<Set<StudentId>>(new Set()); const [editingId, setEditingId] = useState("");
  const [viewMode, setViewMode] = useState<"quick" | "detail">("quick");
  const [quickStatus, setQuickStatus] = useState<AttendanceQuickStatus>("leave");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFrom, setExportFrom] = useState(() => getFundPeriodRange("week", todayKey())?.start || todayKey());
  const [exportTo, setExportTo] = useState(todayKey());
  const [recentUpdate, setRecentUpdate] = useState<{ studentId: StudentId; message: string } | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const registration = useAttendanceUndo(records, onChange, date);
  const actionToast = useActionToast();
  useEffect(() => () => { if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current); }, []);
  const [focusedStudentId, setFocusedStudentId] = useState<StudentId | "">("");
  useInitialTargetEffect(initialTarget ? `${initialTarget.entityId || ""}|${initialTarget.studentId || ""}|${initialTarget.date || ""}` : undefined, () => {
    if (!initialTarget) return;
    if (initialTarget.date) setDate(initialTarget.date);
    const student = students.find(item => item.id === initialTarget.studentId);
    if (student) {
      setSearch(student.name);
      setFocusedStudentId(student.id);
      window.setTimeout(() => document.querySelector(`[data-attendance-student-id="${CSS.escape(student.id)}"]`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }), 80);
    }
  }, onInitialTargetConsumed);
  const byStudent = useMemo(() => new Map(records.filter(item => item.date === date).map(item => [item.studentId, item])), [date, records]);
  const rows = students.filter(student => {
    const record = byStudent.get(student.id);
    const matchesSearch = matchesStudentSearch(student, search);
    const matchesFilter = filter === "all"
      || (filter === "abnormal" ? Boolean(record) : filter === "late" ? Boolean(record?.late) : filter === "earlyLeave" ? Boolean(record?.earlyLeave) : (record?.status || "normal") === filter);
    return matchesSearch && matchesFilter;
  });
  const counts = students.reduce((map, student) => { const record = byStudent.get(student.id); const status = record?.status || "normal"; map[status] += 1; if (record?.late) map.late += 1; if (record?.earlyLeave) map.earlyLeave += 1; return map; }, { normal: 0, leave: 0, absent: 0, late: 0, earlyLeave: 0 });
  function commit(next: AttendanceRecord[], action?: string, undoActivity?: void | (() => void)) {
    const undo = registration.commit(next, action, undoActivity);
    if (undo) actionToast.show({ message: action ? "出勤已保存，6 秒内再次点击可恢复" : "出勤修改已保存", actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5"/>, onAction: () => { undo(); }, duration: 6000 });
  }
  function patchStudent(studentId: string, patch: Partial<Pick<AttendanceRecord, "status" | "late" | "earlyLeave" | "note" | "leaveStart" | "leaveEnd">>, action?: string) {
    const statusAction = action ?? (patch.status ? `status:${patch.status}` : "late" in patch ? "late" : "earlyLeave" in patch ? "earlyLeave" : undefined);
    if (statusAction && registration.tryRevert(studentId, statusAction)) { actionToast.show("已恢复上次出勤状态"); return; }
    const current = byStudent.get(studentId);
    if (patch.status && (current?.status || "normal") === patch.status && Object.keys(patch).length === 1) return;
    const normalized = patch.status ? normalizeAttendancePatch(current, patch.status) : null;
    const next = upsertAttendance(records, { studentId, date, status: normalized?.status ?? current?.status ?? "normal", late: patch.late ?? normalized?.late ?? current?.late ?? false, earlyLeave: patch.earlyLeave ?? normalized?.earlyLeave ?? current?.earlyLeave ?? false, note: patch.note ?? current?.note ?? "", leaveStart: patch.status ? patch.leaveStart ?? normalized?.leaveStart : patch.leaveStart ?? current?.leaveStart, leaveEnd: patch.status ? patch.leaveEnd ?? normalized?.leaveEnd : patch.leaveEnd ?? current?.leaveEnd });
    const student = students.find(item => item.id === studentId);
    const undoActivity = statusAction ? onActivity?.(createActivityEvent({ action: "status_changed", ref: { domain: "attendance", entityId: current?.id || `${date}:${studentId}`, studentId, date }, studentIds: [studentId], title: `登记出勤：${student?.name || "学生"}`, detail: attendanceSummary(next.find(item => item.date === date && item.studentId === studentId)) })) : undefined;
    commit(next, statusAction, undoActivity);
  }
  async function batch(patch: Partial<Pick<AttendanceRecord, "status" | "late" | "earlyLeave" | "leaveStart" | "leaveEnd">>, label: string) {
    if (!selected.size || !await appDialog.confirm({ title: `批量设置为${label}？`, description: `将覆盖所选 ${selected.size} 名学生在 ${date} 的出勤状态。提交后可撤销。`, confirmLabel: `确认设置为${label}`, variant: "primary" })) return;
    const studentIds = [...selected];
    const undoActivity = onActivity?.(createActivityEvent({ action: "status_changed", ref: { domain: "attendance", entityId: `${date}-batch`, date }, studentIds, title: `批量登记出勤：${label}`, detail: `${studentIds.length} 名学生` }));
    commit(batchUpsertAttendance(records, studentIds, date, patch), undefined, undoActivity);
    setSelected(new Set());
  }
  function toggle(id: string) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }

  // 全班全勤是最高频场景：一键清掉当日全部异常记录（正常不写记录），可经 toast 撤销。
  async function markAllNormal() {
    const todaysRecords = records.filter(item => item.date === date);
    if (!todaysRecords.length) return;
    const affectedIds = todaysRecords.map(item => item.studentId);
    const confirmed = await appDialog.confirm({
      title: "全部设为正常？",
      description: `将清除 ${date} 已登记的 ${todaysRecords.length} 条出勤记录（请假、缺勤、迟到、早退），全班按正常出勤计。提交后可通过页面提示短时撤销。`,
      confirmLabel: "确认全部正常",
      variant: "primary",
    });
    if (!confirmed) return;
    const undoActivity = onActivity?.(createActivityEvent({ action: "status_changed", ref: { domain: "attendance", entityId: `${date}-all-normal`, date }, studentIds: affectedIds, title: "全班设为正常出勤", detail: `清除 ${todaysRecords.length} 条异常记录` }));
    commit(records.filter(item => item.date !== date), undefined, undoActivity);
    setSelected(new Set());
  }

  function markStudent(student: AppStudent) {
    const current = byStudent.get(student.id);
    const action = `quick:${quickStatus}`;
    if (registration.tryRevert(student.id, action)) { actionToast.show("已恢复上次出勤状态"); setRecentUpdate(null); return; }
    const already = quickStatus === "normal" ? !current || (current.status === "normal" && !current.late && !current.earlyLeave && !current.leaveStart && !current.leaveEnd) : quickStatus === "leave" || quickStatus === "absent" ? current?.status === quickStatus : Boolean(current?.[quickStatus]);
    if (!already) {
      if (quickStatus === "normal") patchStudent(student.id, { status: "normal", late: false, earlyLeave: false, leaveStart: "", leaveEnd: "" }, action);
      else if (quickStatus === "leave" || quickStatus === "absent") patchStudent(student.id, normalizeAttendancePatch(current, quickStatus), action);
      else patchStudent(student.id, { [quickStatus]: true }, action);
    }
    const label = QUICK_STATUS_OPTIONS.find(option => option.value === quickStatus)?.label || "正常";
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    setRecentUpdate({ studentId: student.id, message: `${student.name} ${already ? "已是" : "已设为"}${label}` });
    feedbackTimerRef.current = window.setTimeout(() => setRecentUpdate(null), 1400);
  }

  const linkedTasks = tasks.filter(task => task.status === "pending" && task.sourceRef?.domain === "attendance" && (task.sourceRef.date === date || records.some(record => record.date === date && record.id === task.sourceRef?.entityId)));

  return <div className="h-full overflow-y-auto bg-background-primary-default p-4"><div className="mx-auto max-w-6xl space-y-4">
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <MetricStrip size="sm" items={[
        { key: "all", label: "全部", value: students.length, selected: filter === "all", onOpen: () => setFilter("all") },
        { key: "normal", label: "正常", value: counts.normal, dot: "bg-status-success-500", selected: filter === "normal", onOpen: () => setFilter("normal") },
        { key: "leave", label: "请假", value: counts.leave, dot: "bg-status-warning-500", selected: filter === "leave", onOpen: () => setFilter("leave") },
        { key: "absent", label: "缺勤", value: counts.absent, dot: "bg-status-rose-500", selected: filter === "absent", onOpen: () => setFilter("absent") },
        { key: "late", label: "迟到", value: counts.late, dot: "bg-accent-500", selected: filter === "late", onOpen: () => setFilter("late") },
        { key: "earlyLeave", label: "早退", value: counts.earlyLeave, dot: "bg-status-warning-500", selected: filter === "earlyLeave", onOpen: () => setFilter("earlyLeave") },
      ]} />
      <div className="ml-auto flex items-center gap-2">
        <Input value={search} onChange={setSearch} leadingIcon={Search} placeholder="搜索学生" className="min-w-40 flex-1 sm:max-w-56" />
        <SegmentedControl value={viewMode} onChange={value => { setViewMode(value as "quick" | "detail"); setSelected(new Set()); }} ariaLabel="出勤登记视图" options={[{ value: "quick", label: "快速", icon: <LayoutGrid className="h-4 w-4"/> }, { value: "detail", label: "详细", icon: <List className="h-4 w-4"/> }]}/>
      </div>
    </div>
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span className="text-caption-1-semibold text-text-secondary">快速登记（6 秒内再点恢复）：标记为</span>
      <DatePicker required value={date} onChange={value => { setDate(value); setSelected(new Set()); setRecentUpdate(null); }} ariaLabel="出勤日期" className="w-44 bg-background-primary-default"/>
      <SegmentedControl value={quickStatus} onChange={value => setQuickStatus(value as AttendanceQuickStatus)} ariaLabel="快速出勤状态" className="min-w-72 flex-1 overflow-x-auto" options={QUICK_STATUS_OPTIONS}/>
      <Button size="sm" variant="secondary" disabled={!byStudent.size} onClick={() => void markAllNormal()}><Check className="h-4 w-4"/>全部正常</Button>
      <Button size="sm" variant="ghost" disabled={!registration.canUndo} onClick={() => { registration.undoLast(); actionToast.dismiss(); }}><RotateCcw className="h-4 w-4"/>撤销上一步</Button>
      {linkedTasks.length > 0 && <Button size="sm" variant="secondary" onClick={() => onOpenTask?.(linkedTasks[0].id)}><ListPlus className="h-3.5 w-3.5"/>已有跟进 {linkedTasks.length}</Button>}
      <div className="relative ml-auto">
        <IconButton label="导出出勤" size="md" aria-expanded={exportOpen} onClick={() => setExportOpen(value => !value)}><Download className="h-4 w-4"/></IconButton>
        <AnimatedPopover open={exportOpen} className="absolute right-0 top-full z-50 mt-2 w-72 rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-background-primary-default p-2 shadow-[var(--app-shadow-float)]">
          <button type="button" onClick={() => { downloadCsv(students, records, date); setExportOpen(false); }} className="flex h-10 w-full items-center rounded-[var(--app-radius-sm)] px-3 text-body-regular text-text-secondary transition-colors hover:bg-background-secondary-default">导出当日（{date}）</button>
          <button type="button" onClick={() => { const range = getFundPeriodRange("week", date); if (range) downloadRangeCsv(students, records, range.start, range.end); setExportOpen(false); }} className="flex h-10 w-full items-center rounded-[var(--app-radius-sm)] px-3 text-body-regular text-text-secondary transition-colors hover:bg-background-secondary-default">导出本周（含汇总）</button>
          <button type="button" onClick={() => { const range = getFundPeriodRange("month", date); if (range) downloadRangeCsv(students, records, range.start, range.end); setExportOpen(false); }} className="flex h-10 w-full items-center rounded-[var(--app-radius-sm)] px-3 text-body-regular text-text-secondary transition-colors hover:bg-background-secondary-default">导出本月（含汇总）</button>
          <div className="mt-1 space-y-2 rounded-[var(--app-radius-sm)] bg-background-secondary-default p-2.5">
            <div className="text-caption-1-semibold text-text-secondary">自定义区间</div>
            <div className="grid grid-cols-2 gap-2">
              <DatePicker value={exportFrom} onChange={setExportFrom} ariaLabel="导出开始日期" className="w-full bg-background-primary-default"/>
              <DatePicker value={exportTo} onChange={setExportTo} ariaLabel="导出结束日期" className="w-full bg-background-primary-default"/>
            </div>
            <Button size="sm" className="w-full" onClick={() => { downloadRangeCsv(students, records, exportFrom, exportTo); setExportOpen(false); }}>导出所选区间</Button>
          </div>
        </AnimatedPopover>
        {exportOpen && <button type="button" aria-label="关闭导出菜单" className="fixed inset-0 z-40 cursor-default" onClick={() => setExportOpen(false)} />}
      </div>
    </div>

    <p aria-live="polite" className="sr-only">{recentUpdate?.message || ""}</p>

      <MotionSwitch transitionKey={viewMode} sharedLayout>{viewMode === "quick" ? <MotionList className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{rows.map(student => {
        const record = byStudent.get(student.id);
        const summary = attendanceSummary(record);
        const style = attendanceCardStyle(record);
        const targetLabel = QUICK_STATUS_OPTIONS.find(option => option.value === quickStatus)?.label || "正常";
        return <button key={student.id} type="button" data-attendance-student-id={student.id} data-motion-surface={student.id} aria-label={`${student.name}当前${summary}，点击设为${targetLabel}`} onClick={() => markStudent(student)} className={`flex min-h-16 items-center gap-3 rounded-[var(--app-radius-sm)] border px-3 py-2 text-left transition-[border-color,background-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/25 motion-reduce:transition-none registration-tile ${recentUpdate?.studentId === student.id || focusedStudentId === student.id ? "ring-2 ring-accent-400 ring-offset-1 shadow-md" : ""}`}>
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${style.dot}`}>{record ? <Check className="h-4 w-4"/> : student.name.slice(0, 1)}</span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-body-regular text-text-primary">{student.name}</strong><span className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold ${style.badge}`}>{summary}</span></span>
        </button>;
      })}</MotionList> : <>
        <MotionCollapse open={selected.size > 0}><div className="mb-3 flex flex-wrap items-center gap-2 rounded-[var(--app-radius-sm)] border border-accent-100 bg-accent-50 p-2.5"><span className="mr-auto text-caption-1-semibold text-accent-700">已选 {selected.size} 人</span><Button size="sm" variant="secondary" onClick={() => batch(normalizeAttendancePatch(undefined,"normal"),"正常")}>正常</Button><Button size="sm" variant="secondary" onClick={() => batch(normalizeAttendancePatch(undefined,"leave"),"请假")}>请假</Button><Button size="sm" variant="danger" onClick={() => batch(normalizeAttendancePatch(undefined,"absent"),"缺勤")}>缺勤</Button><Button size="sm" variant="secondary" onClick={() => batch({late:true},"迟到")}>迟到</Button><Button size="sm" variant="secondary" onClick={() => batch({earlyLeave:true},"早退")}>早退</Button><Button size="sm" onClick={()=>onRequestTask({studentId:[...selected][0],studentIds:[...selected],title:"出勤异常跟进",type:"出勤关注",description:`${date} 出勤批量跟进`,plannedDate:date,dueDate:date,source:"attendance",sourceRef:{domain:"attendance",entityId:`${date}-batch`,date}})}><ListPlus className="h-3.5 w-3.5"/>创建任务</Button></div></MotionCollapse>
        <MotionList className="space-y-2">{rows.map(student => { const record=byStudent.get(student.id); const status=record?.status||"normal"; const editing=editingId===student.id; return <div key={student.id} data-attendance-student-id={student.id} data-motion-surface={student.id} className={`registration-tile border px-4 py-3 ${focusedStudentId === student.id ? "entity-focus-highlight" : ""}`}><div className="grid grid-cols-[auto_minmax(7rem,1fr)_auto] items-center gap-3"><Checkbox isSelected={selected.has(student.id)} onChange={() => toggle(student.id)} aria-label={`选择 ${student.name}`} /><div><div className="font-bold text-text-primary">{student.name}</div><div className="text-caption-1-regular text-text-tertiary">{record?.note || attendanceSummary(record)}</div></div><div className="flex items-center gap-2"><AttendanceStatusControl compact value={status} late={record?.late||false} earlyLeave={record?.earlyLeave||false} onChange={patch => patchStudent(student.id, patch)}/><button onClick={() => setEditingId(editing ? "" : student.id)} className="rounded-lg bg-background-secondary-default p-2 text-text-secondary" aria-label={`编辑 ${student.name} 详情`}><Settings2 className="h-4 w-4"/></button></div></div><MotionCollapse open={editing}><div className="mt-3 grid gap-2 rounded-xl bg-background-secondary-default p-3 sm:grid-cols-3"><Input value={record?.note||""} onChange={value => patchStudent(student.id,{note:value})} placeholder="备注" /><AttendanceDateTimeFields label="请假开始" value={record?.leaveStart||""} onChange={value => patchStudent(student.id,{leaveStart:value})}/><AttendanceDateTimeFields label="请假结束" value={record?.leaveEnd||""} onChange={value => patchStudent(student.id,{leaveEnd:value})}/>{record && <button onClick={() => onRequestTask({studentId:student.id,title:`出勤跟进：${record.status==="leave"?"请假":record.status==="absent"?"缺勤":record.late?"迟到":"早退"}`,type:"出勤关注",description:`${date}${record.note?` · ${record.note}`:""}`,plannedDate:date,dueDate:date,source:"attendance",sourceRef:{domain:"attendance",entityId:record.id,studentId:student.id,date}})} className="sm:col-span-3 flex items-center justify-center gap-1 rounded-lg bg-accent-50 py-2 text-caption-1-semibold text-accent-700"><ListPlus className="h-3.5 w-3.5"/>创建跟进任务</button>}</div></MotionCollapse></div>})}</MotionList>
      </>}</MotionSwitch>
      {!rows.length && <div className="py-12 text-center text-body-regular text-text-tertiary">没有符合条件的学生</div>}
    {actionToast.toast}
    {appDialog.dialog}
  </div></div>;
}
