import { useState } from "react";
import { Banknote, BedDouble, BookOpenCheck, CalendarCheck2, Check, ClipboardList, GraduationCap, History, MessageSquareText, Pencil, RotateCcw, Save, Search, Trash2, UserRound, X } from "lucide-react";
import type { AppStudent, SeatHistorySnapshot } from "../../state/types";
import { filterTimeline, type TimelineItem, type TimelineTarget, type TimelineTone, type TimelineType } from "../../state/dataInsights";
import { StudentPicker } from "../StudentPicker";
import { Button, Card, ConfirmDialog, DatePicker, IconButton, SegmentedControl, useActionToast } from "../ui";

type HistoryView = "activity" | "seats";
type DateRange = "7" | "30" | "term" | "custom";
const VIEW_STORAGE_KEY = "seat-manager-history-view-v1";
const TIMELINE_TYPES: Array<TimelineType | "全部"> = ["全部", "学生记录", "出勤", "跟进", "作业", "沟通稿", "宿舍", "成绩", "班费"];

function readInitialView(): HistoryView {
  try { return localStorage.getItem(VIEW_STORAGE_KEY) === "seats" ? "seats" : "activity"; } catch { return "activity"; }
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "未记录时间" : date.toLocaleString("zh-CN", { hour12: false });
}

function dateDaysAgo(days: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function displayDate(value: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (value === today) return `今天 · ${value}`;
  if (value === dateDaysAgo(1)) return `昨天 · ${value}`;
  return value;
}

const TONE_CLASS: Record<TimelineTone, string> = {
  normal: "border-blue-100 bg-blue-50 text-blue-600",
  reminder: "border-amber-100 bg-amber-50 text-amber-600",
  danger: "border-red-100 bg-red-50 text-red-600",
  success: "border-emerald-100 bg-emerald-50 text-emerald-600",
  muted: "border-gray-100 bg-gray-50 text-gray-400",
};

function TimelineIcon({ type }: { type: TimelineType }) {
  const icons = { "学生记录": UserRound, "出勤": CalendarCheck2, "跟进": ClipboardList, "作业": BookOpenCheck, "沟通稿": MessageSquareText, "宿舍": BedDouble, "成绩": GraduationCap, "班费": Banknote };
  const Icon = icons[type];
  return <Icon className="h-4 w-4" />;
}

export function HistoryWorkspace({ students, history, timeline = [], onSave, onRename, onView, onApply, onDelete, onOpenTimeline }: {
  students: AppStudent[];
  history: SeatHistorySnapshot[];
  timeline?: TimelineItem[];
  onSave: (note: string) => void;
  onRename: (id: string, note: string) => void;
  onView: (snapshot: SeatHistorySnapshot) => void;
  onApply: (snapshot: SeatHistorySnapshot) => void;
  onDelete: (id: string) => boolean;
  onOpenTimeline: (target: TimelineTarget) => void;
}) {
  const [view, setView] = useState<HistoryView>(readInitialView);
  const [note, setNote] = useState("");
  const [renamingId, setRenamingId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SeatHistorySnapshot | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const [type, setType] = useState<TimelineType | "全部">("全部");
  const [dateRange, setDateRange] = useState<DateRange>("30");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const actionToast = useActionToast();

  function changeView(next: HistoryView) {
    setView(next);
    try { localStorage.setItem(VIEW_STORAGE_KEY, next); } catch { /* UI preference failure is non-blocking. */ }
  }
  function save() { if (!note.trim()) return; onSave(note.trim()); setNote(""); }
  function saveRename(id: string) {
    if (!renameValue.trim()) return;
    const previousName = history.find(snapshot => snapshot.id === id)?.note || "";
    onRename(id, renameValue.trim());
    setRenamingId("");
    actionToast.show({
      message: "座位快照名称已保存",
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => onRename(id, previousName),
      duration: 6000,
    });
  }
  function clearFilters() { setQuery(""); setStudentId(""); setType("全部"); setDateRange("30"); setCustomStart(""); setCustomEnd(""); }

  const dateFilter = dateRange === "7" ? { startDate: dateDaysAgo(6) } : dateRange === "30" ? { startDate: dateDaysAgo(29) } : dateRange === "custom" ? { startDate: customStart || undefined, endDate: customEnd || undefined } : {};
  const visibleTimeline = filterTimeline(timeline, { query, studentId, type, ...dateFilter });
  const groupedTimeline = (() => {
    const groups = new Map<string, TimelineItem[]>();
    visibleTimeline.forEach(item => groups.set(item.date, [...(groups.get(item.date) || []), item]));
    return Array.from(groups.entries());
  })();
  const filtersActive = Boolean(query || studentId || type !== "全部" || dateRange !== "30" || customStart || customEnd);

  return <div className="h-full overflow-y-auto bg-[var(--app-bg)] p-4">
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div><h1 className="text-lg font-bold text-[var(--app-text)]">历史</h1><p className="mt-1 text-xs text-[var(--app-text-muted)]">回看班级动态，或管理已保存的座位快照。</p></div>
        <SegmentedControl value={view} onChange={changeView} ariaLabel="历史视图" options={[{ value: "activity", label: "班级动态" }, { value: "seats", label: "座位快照" }]} />
      </div>

      {view === "activity" ? <div className="view-switch-enter space-y-4">
        <Card overflow="visible" className="relative z-20" bodyClassName="p-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_260px]">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[var(--app-text-muted)]"/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索学生、事项、说明或业务类型" className="h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] pl-9 pr-10 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10"/>{query && <button type="button" onClick={() => setQuery("")} aria-label="清除搜索" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-lg text-gray-400 hover:bg-gray-100"><X className="h-3.5 w-3.5"/></button>}</div>
            <StudentPicker students={students} value={studentId} onChange={setStudentId} label="筛选学生" allowClear />
          </div>
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2"><span className="w-16 shrink-0 text-xs font-bold text-[var(--app-text-muted)]">时间范围</span><SegmentedControl value={dateRange} onChange={setDateRange} ariaLabel="时间范围" className="max-w-full overflow-x-auto" options={[{value:"7",label:"近 7 天"},{value:"30",label:"近 30 天"},{value:"term",label:"本学期"},{value:"custom",label:"自定义"}]} />{dateRange === "custom" && <div className="flex flex-wrap items-center gap-2"><DatePicker value={customStart} onChange={setCustomStart} ariaLabel="开始日期" className="w-40"/><span className="text-xs text-gray-400">至</span><DatePicker value={customEnd} onChange={setCustomEnd} ariaLabel="结束日期" className="w-40" min={customStart}/></div>}</div>
            <div className="flex items-center gap-2"><span className="w-16 shrink-0 text-xs font-bold text-[var(--app-text-muted)]">事件类型</span><SegmentedControl value={type} onChange={setType} ariaLabel="事件类型" className="min-w-0 flex-1 overflow-x-auto" options={TIMELINE_TYPES.map(value => ({ value, label: value }))} /></div>
          </div>
        </Card>

        <Card className="history-timeline-card relative z-0" title={`班级动态 · ${visibleTimeline.length} 条`} action={filtersActive ? <Button variant="ghost" size="sm" onClick={clearFilters}>清除筛选</Button> : undefined} bodyClassName="p-0">
          {groupedTimeline.length ? <div>{groupedTimeline.map(([date, items]) => <section key={date} className="border-b border-[var(--app-border)] last:border-0"><div className="sticky top-0 z-10 bg-[var(--app-surface-muted)] px-5 py-2 text-xs font-bold text-[var(--app-text-muted)]">{displayDate(date)}</div><div className="divide-y divide-gray-100 px-3 sm:px-5">{items.map(item => <button key={item.id} type="button" onClick={() => onOpenTimeline(item.target)} disabled={Boolean(item.target.disabledReason)} title={item.target.disabledReason || `打开${item.type}详情`} className={`group grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-3 rounded-[var(--app-radius-sm)] px-2 py-3 text-left transition-colors hover:bg-[var(--app-surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 ${item.tone === "muted" ? "text-gray-400" : ""}`}><span className={`grid h-9 w-9 place-items-center rounded-[var(--app-radius-sm)] border ${TONE_CLASS[item.tone]}`}><TimelineIcon type={item.type}/></span><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-sm text-[var(--app-text)]">{item.title}</strong>{item.isAi && <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-600">AI 建议</span>}</span><span className="mt-1 block text-xs text-[var(--app-text-muted)]">{[item.studentName, item.detail].filter(Boolean).join(" · ")}</span></span><span className="rounded-lg bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-500 group-hover:bg-white">{item.type}</span></button>)}</div></section>)}</div> : <div className="px-6 py-16 text-center"><History className="mx-auto h-9 w-9 text-gray-300"/><h3 className="mt-3 text-sm font-bold text-gray-700">{timeline.length ? "没有符合条件的动态" : "还没有班级动态"}</h3><p className="mt-1 text-xs leading-5 text-[var(--app-text-muted)]">{timeline.length ? "可以调整关键词、学生、时间或事件类型。" : "登记学生记录、出勤、跟进、宿舍、成绩或班费后，动态会自动汇总在这里。"}</p>{timeline.length && <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-4">清除筛选</Button>}</div>}
        </Card>
      </div> : <div className="view-switch-enter grid items-stretch gap-4 [&>section]:min-h-[22rem] lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card title="保存当前座位"><div className="space-y-3"><input value={note} onChange={event => setNote(event.target.value)} onKeyDown={event => { if (event.key === "Enter") save(); }} className="h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] px-3 text-sm outline-none focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10" placeholder="记录名称，例如：期中后调整"/><Button onClick={save} disabled={!note.trim()} className="w-full"><Save className="h-4 w-4"/>保存座位</Button><p className="text-xs leading-5 text-[var(--app-text-muted)]">保存后可随时查看或恢复，不影响当前班级其他数据。</p></div></Card>
        <Card title={`座位快照 · ${history.length} 条`} bodyClassName="p-3 sm:p-5"><div className="space-y-2">{history.map(snapshot => <article key={snapshot.id} className="rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1">{renamingId === snapshot.id ? <input autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === "Enter") saveRename(snapshot.id); }} className="h-9 w-full rounded-[var(--app-radius-sm)] border border-blue-200 bg-white px-3 text-sm outline-none ring-2 ring-blue-500/10"/> : <h3 className="truncate text-sm font-bold text-[var(--app-text)]">{snapshot.note || "未命名座位"}</h3>}<p className="mt-1 text-xs text-[var(--app-text-muted)]">{formatHistoryTime(snapshot.time)} · {snapshot.rows} 排</p></div><div className="flex flex-wrap items-center gap-2">{renamingId === snapshot.id ? <><Button size="sm" onClick={() => saveRename(snapshot.id)}><Check className="h-4 w-4"/>保存</Button><IconButton size="sm" label="取消重命名" onClick={() => setRenamingId("")}><X className="h-4 w-4"/></IconButton></> : <IconButton size="sm" label="重命名座位快照" onClick={() => { setRenamingId(snapshot.id); setRenameValue(snapshot.note); }}><Pencil className="h-4 w-4"/></IconButton>}<Button variant="ghost" size="sm" onClick={() => onView(snapshot)}>查看</Button><Button size="sm" onClick={() => onApply(snapshot)}><RotateCcw className="h-4 w-4"/>恢复</Button><IconButton size="sm" label="删除座位快照" onClick={() => { setDeleteError(""); setPendingDelete(snapshot); }} className="border-red-100 bg-red-50 text-red-500 hover:bg-red-100"><Trash2 className="h-4 w-4"/></IconButton></div></div></article>)}{!history.length && <div className="py-16 text-center"><History className="mx-auto h-9 w-9 text-gray-300"/><h3 className="mt-3 text-sm font-bold text-gray-700">暂无座位快照</h3><p className="mt-1 text-xs text-[var(--app-text-muted)]">在左侧填写名称并保存当前座位。</p></div>}</div></Card>
      </div>}
      <ConfirmDialog open={Boolean(pendingDelete)} title="删除这份座位快照？" description={`“${pendingDelete?.note || "未命名座位"}”删除后无法恢复，当前座位不会受到影响。`} confirmLabel="确认删除" error={deleteError} onCancel={() => { setPendingDelete(null); setDeleteError(""); }} onConfirm={() => { if (!pendingDelete) return; if (onDelete(pendingDelete.id)) setPendingDelete(null); else setDeleteError("删除失败，请检查本机存储空间后重试。"); }} />
      {actionToast.toast}
    </div>
  </div>;
}
