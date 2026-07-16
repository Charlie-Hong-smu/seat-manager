import { BookOpenCheck, CalendarDays, CheckCircle2, Clipboard, ClipboardList, FileSpreadsheet, LayoutGrid, Sparkles, UserRoundCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { generateAiWeeklyDraft } from "../../state/teacherAiService";
import { buildLocalWeeklyDraft, buildTodayWorkItems, buildWeeklyFacts, digestFacts, getWeekRange, parseScheduleRows } from "../../state/teacherWorkbench";
import { readRowsFromFile } from "../../state/scoreImport";
import { createActivityEvent } from "../../state/activityEvents";
import type { ActivityEvent, AppStudent, AttendanceRecord, BusinessEntityRef, ClassScheduleV1, CommunicationDraft, Dormitory, FollowupTask, GradeExam, HomeworkAssignment } from "../../state/types";
import { AiGenerationPanel, Button, Card, FileDropZone, ToolDrawer } from "../ui";

export function TodayWorkspace({ students, attendance, tasks, homework, dormitories = [], gradeExams = [], schedule, drafts, onScheduleChange, onDraftsChange, onOpenSeats, onOpenAttendance, onOpenTasks, onOpenHomework, onOpenQuickRecord, onOpenEntity, onActivity, initialDraftId }: {
  students: AppStudent[];
  attendance: AttendanceRecord[];
  tasks: FollowupTask[];
  homework: HomeworkAssignment[];
  dormitories?: Dormitory[];
  gradeExams?: GradeExam[];
  schedule: ClassScheduleV1;
  drafts: CommunicationDraft[];
  onScheduleChange: (schedule: ClassScheduleV1) => void;
  onDraftsChange: (drafts: CommunicationDraft[]) => void;
  onOpenSeats: () => void;
  onOpenAttendance: () => void;
  onOpenTasks: () => void;
  onOpenHomework: () => void;
  onOpenQuickRecord: () => void;
  onOpenEntity?: (ref: BusinessEntityRef) => void;
  onActivity?: (event: ActivityEvent) => void;
  initialDraftId?: string;
}) {
  const today = new Date().toLocaleDateString("sv-SE");
  const weekday = new Date().getDay() || 7;
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [weeklyContent, setWeeklyContent] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [weeklyStatus, setWeeklyStatus] = useState("");
  const [weeklyGeneratedBy, setWeeklyGeneratedBy] = useState<"local" | "ai">("local");
  const [weeklyDraftId, setWeeklyDraftId] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  const items = useMemo(() => buildTodayWorkItems({ date: today, students, attendance, tasks, homework }), [attendance, homework, students, tasks, today]);
  const todayEntries = schedule.entries.filter(item => item.weekday === weekday).sort((a, b) => schedule.periods.findIndex(period => period.id === a.periodId) - schedule.periods.findIndex(period => period.id === b.periodId));
  const abnormalCount = attendance.filter(item => item.date === today && (item.status !== "normal" || item.late || item.earlyLeave)).length;
  const dueTaskCount = tasks.filter(item => item.status === "pending" && item.dueDate <= today).length;
  const dueHomework = homework.filter(item => (item.lifecycle || "active") === "active" && item.dueDate <= today).length;
  const range = getWeekRange();
  const facts = buildWeeklyFacts({ students, attendance, tasks, homework, dormitories, gradeExams, ...range });

  useEffect(() => {
    if (!initialDraftId) return;
    const draft = drafts.find(item => item.id === initialDraftId);
    if (!draft) return;
    setWeeklyContent(draft.content);
    setWeeklyDraftId(draft.id);
    setWeeklyGeneratedBy(draft.generatedBy);
    setWeeklyStatus("已从历史打开保存的周报草稿。");
    setWeeklyOpen(true);
  }, [drafts, initialDraftId]);

  function openItem(item: ReturnType<typeof buildTodayWorkItems>[number]) {
    if (onOpenEntity) {
      onOpenEntity({ domain: item.kind === "task" ? "followup" : item.kind, entityId: item.entityId, studentId: item.studentId, date: item.kind === "attendance" ? today : undefined });
      return;
    }
    (item.kind === "attendance" ? onOpenAttendance : item.kind === "homework" ? onOpenHomework : onOpenTasks)();
  }

  function openWeekly() {
    const existing = drafts.find(item => item.scope === "class" && item.startDate === range.startDate && item.endDate === range.endDate);
    setWeeklyContent(existing?.content || buildLocalWeeklyDraft("班级", range.startDate, range.endDate, facts));
    setWeeklyDraftId(existing?.id || "");
    setWeeklyGeneratedBy(existing?.generatedBy || "local");
    setWeeklyStatus("已基于本机数据生成，可直接编辑或按需使用 AI 润色。");
    setWeeklyOpen(true);
  }

  async function enhanceWeekly() {
    setAiBusy(true); setWeeklyStatus("");
    try {
      const result = await generateAiWeeklyDraft({ scope: "class", subjectName: "班级", startDate: range.startDate, endDate: range.endDate, facts, localDraft: weeklyContent });
      setWeeklyContent(result.content); setWeeklyGeneratedBy("ai"); setWeeklyStatus(result.disclaimer);
    } catch { setWeeklyStatus("AI 暂时不可用，本地草稿仍可继续编辑和保存。"); }
    finally { setAiBusy(false); }
  }

  function saveWeekly() {
    const now = new Date().toISOString();
    const draft: CommunicationDraft = { id: weeklyDraftId || `communication-${Date.now()}`, scope: "class", startDate: range.startDate, endDate: range.endDate, facts, content: weeklyContent.trim(), generatedBy: weeklyGeneratedBy, sourceDigest: digestFacts(facts), deliveryStatus: "draft", updatedAt: now };
    onDraftsChange([draft, ...drafts.filter(item => !(item.scope === "class" && item.startDate === range.startDate && item.endDate === range.endDate))]);
    setWeeklyDraftId(draft.id);
    onActivity?.(createActivityEvent({ action: "updated", ref: { domain: "communication", entityId: draft.id }, studentIds: [], title: "保存班级周报", detail: `${range.startDate} 至 ${range.endDate}` }));
    setWeeklyStatus("周报草稿已保存到历史。");
  }

  async function copyWeekly() { await navigator.clipboard.writeText(weeklyContent); setWeeklyStatus("周报已复制，可粘贴到家长群或其他渠道。" ); }

  async function importSchedule(file: File | null) {
    if (!file) return;
    setStatus("正在解析课表...");
    try { onScheduleChange(parseScheduleRows(await readRowsFromFile(file), file.name)); setStatus("课表已导入并保存。"); }
    catch { setStatus("未识别出周一至周日和课节，请调整表头后重试。"); }
  }

  return <div className="h-full overflow-y-auto bg-[var(--app-bg)] p-4"><div className="mx-auto max-w-6xl space-y-4">
    <Card bodyClassName="p-4"><div className="flex flex-wrap items-center gap-4"><div><div className="text-xs font-bold text-blue-600">今日班务</div><h1 className="mt-1 text-xl font-black text-gray-900">{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</h1></div><div className="ml-auto flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={onOpenSeats}><LayoutGrid className="h-4 w-4"/>座位</Button><Button size="sm" variant="ghost" onClick={() => setScheduleOpen(true)}><CalendarDays className="h-4 w-4"/>管理课表</Button><Button size="sm" onClick={openWeekly}><ClipboardList className="h-4 w-4"/>本周复盘</Button></div></div>
      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{todayEntries.length ? todayEntries.map(entry => <span key={entry.id} className="whitespace-nowrap rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">{schedule.periods.find(period => period.id === entry.periodId)?.label} · {entry.subject}</span>) : <button type="button" onClick={() => setScheduleOpen(true)} className="rounded-xl border border-dashed border-gray-200 px-3 py-2 text-sm text-gray-400">今天还没有课表，点击导入</button>}</div>
    </Card>
    <div className="grid gap-3 sm:grid-cols-3">{[{ label: "出勤异常", value: abnormalCount, action: onOpenAttendance, tone: "text-amber-600" }, { label: "到期待办", value: dueTaskCount, action: onOpenTasks, tone: "text-rose-600" }, { label: "到期作业", value: dueHomework, action: onOpenHomework, tone: "text-blue-600" }].map(item => <button type="button" key={item.label} onClick={item.action} className="rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-4 text-left shadow-[var(--app-shadow-card)] transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-md motion-reduce:transition-none"><div className="text-xs font-bold text-gray-400">{item.label}</div><div className={`mt-1 text-2xl font-black ${item.tone}`}>{item.value}</div></button>)}</div>
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card title="需要处理" action={<button type="button" onClick={() => setQueueOpen(true)} className="text-xs font-bold text-blue-600">查看全部</button>}><div className="space-y-2">{items.slice(0, 8).map(item => <button type="button" key={item.id} onClick={() => openItem(item)} className="flex w-full items-start gap-3 rounded-xl border border-gray-100 px-3 py-3 text-left hover:border-blue-100 hover:bg-blue-50/40"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${item.urgency === 0 ? "bg-red-500" : item.urgency === 1 ? "bg-amber-500" : "bg-blue-500"}`}/><span className="min-w-0 flex-1"><strong className="block truncate text-sm text-gray-800">{item.title}</strong><span className="mt-1 block text-xs text-gray-400">{item.detail}</span></span></button>)}{!items.length && <div className="py-12 text-center"><CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500"/><p className="mt-2 text-sm text-gray-400">今天没有待处理事项</p></div>}</div></Card>
      <Card title="快捷处理"><div className="grid grid-cols-2 gap-2">{[{ label: "快捷记录", icon: <UserRoundCheck className="h-5 w-5"/>, action: onOpenQuickRecord }, { label: "登记出勤", icon: <CheckCircle2 className="h-5 w-5"/>, action: onOpenAttendance }, { label: "新建任务", icon: <ClipboardList className="h-5 w-5"/>, action: onOpenTasks }, { label: "布置作业", icon: <BookOpenCheck className="h-5 w-5"/>, action: onOpenHomework }].map(item => <button type="button" key={item.label} aria-label={item.label} onClick={item.action} className="grid min-h-24 place-items-center rounded-xl border border-gray-100 bg-gray-50 p-3 text-sm font-bold text-gray-700 transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-blue-700"><span className="grid gap-2 place-items-center">{item.icon}{item.label}</span></button>)}</div></Card>
    </div>
  </div>
  <ToolDrawer open={scheduleOpen} title="课表管理" onClose={() => setScheduleOpen(false)}><div className="space-y-4"><FileDropZone accept=".xlsx,.xls,.xlsm,.csv,.tsv" onChange={file => void importSchedule(file)}><FileSpreadsheet className="h-7 w-7 text-blue-500"/><strong className="text-sm text-gray-700">导入 Excel 课表</strong><span className="text-xs text-gray-400">首列为课节，后续列包含周一至周日</span></FileDropZone>{status && <p className="text-sm text-blue-600">{status}</p>}<div className="space-y-2">{schedule.periods.map(period => <div key={period.id} className="rounded-xl border border-gray-100 px-3 py-2"><div className="text-xs font-bold text-gray-400">{period.label}</div><div className="mt-1 flex flex-wrap gap-1">{schedule.entries.filter(entry => entry.periodId === period.id).map(entry => <span key={entry.id} className="rounded-lg bg-gray-100 px-2 py-1 text-xs text-gray-600">周{["", "一", "二", "三", "四", "五", "六", "日"][entry.weekday]} {entry.subject}</span>)}</div></div>)}</div></div></ToolDrawer>
  <ToolDrawer open={weeklyOpen} title="本周班级复盘" onClose={() => setWeeklyOpen(false)}><div className="space-y-4">{aiBusy ? <AiGenerationPanel title="正在润色周报" steps={["读取本周事实", "整理表达", "生成可编辑草稿"]}/> : <><div className="flex flex-wrap gap-2">{facts.map(fact => <span key={fact} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">{fact}</span>)}</div><textarea rows={14} value={weeklyContent} onChange={event => setWeeklyContent(event.target.value)} className="w-full resize-y rounded-xl border border-gray-200 px-3 py-3 text-sm leading-6 outline-none focus:border-blue-300"/><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void enhanceWeekly()}><Sparkles className="h-4 w-4"/>AI 润色</Button><Button variant="secondary" disabled={!weeklyContent.trim()} onClick={() => void copyWeekly()}><Clipboard className="h-4 w-4"/>复制</Button><Button className="flex-1" disabled={!weeklyContent.trim()} onClick={saveWeekly}>保存草稿</Button></div></>}{weeklyStatus && <p className="text-xs leading-5 text-gray-500">{weeklyStatus}</p>}</div></ToolDrawer>
  <ToolDrawer open={queueOpen} title={`全部待处理 · ${items.length}`} onClose={() => setQueueOpen(false)}><div className="space-y-2">{items.map(item => <button type="button" key={item.id} onClick={() => { setQueueOpen(false); openItem(item); }} className="flex w-full items-start gap-3 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] p-3 text-left hover:border-blue-200 hover:bg-blue-50/40"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${item.urgency === 0 ? "bg-red-500" : item.urgency === 1 ? "bg-amber-500" : "bg-blue-500"}`}/><span><strong className="block text-sm text-gray-800">{item.title}</strong><span className="mt-1 block text-xs text-gray-500">{item.detail}</span></span></button>)}{!items.length && <p className="py-12 text-center text-sm text-gray-400">今天没有待处理事项</p>}</div></ToolDrawer>
  </div>;
}
