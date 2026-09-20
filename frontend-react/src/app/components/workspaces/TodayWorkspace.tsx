import { cx } from "@/utils/cx";
import { ArrowRight, Clock3, Plus, BookOpenCheck, CalendarDays, CheckCircle2, Clipboard, ClipboardList, FileSpreadsheet, LayoutGrid, Sparkles, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";

import { useInitialTargetEffect } from "../../hooks/useInitialTargetEffect";
import { generateAiWeeklyDraft } from "../../state/teacherAiService";
import { buildLocalWeeklyDraft, buildTodayWorkItems, buildWeeklyFacts, getWeekRange, parseScheduleRows } from "../../state/teacherWorkbench";
import { readRowsFromFile } from "../../state/scoreImport";
import type { AppStudent, AttendanceRecord, BusinessEntityRef, ClassScheduleV1, CommunicationDraft, Dormitory, FollowupTask, GradeExam, HomeworkAssignment } from "../../state/types";
import { AiGenerationPanel, Button, Card, Chip, FileDropZone, IconButton, InlineStatus, MetricStrip, Textarea, ToolDrawer } from "../ui";
import { ResolutionEditor } from "../LinkedWorkflow";

export function TodayWorkspace({ students, attendance, tasks, homework, dormitories = [], gradeExams = [], schedule, drafts, onScheduleChange, onOpenSeats, onOpenAttendance, onOpenTasks, onOpenHomework, onOpenQuickRecord, onOpenEntity, onCompleteTask, onSaveTaskResolution, onContinueTask, initialDraftId, onInitialDraftConsumed }: {
  students: AppStudent[];
  attendance: AttendanceRecord[];
  tasks: FollowupTask[];
  homework: HomeworkAssignment[];
  dormitories?: Dormitory[];
  gradeExams?: GradeExam[];
  schedule: ClassScheduleV1;
  drafts: CommunicationDraft[];
  onScheduleChange: (schedule: ClassScheduleV1) => void;
  onOpenSeats: () => void;
  onOpenAttendance: () => void;
  onOpenTasks: () => void;
  onOpenHomework: () => void;
  onOpenQuickRecord: () => void;
  onOpenEntity?: (ref: BusinessEntityRef) => void;
  onCompleteTask?: (taskId: string) => boolean | Promise<boolean>;
  onSaveTaskResolution?: (taskId: string, note: string) => void;
  onContinueTask?: (taskId: string) => void;
  initialDraftId?: string;
  onInitialDraftConsumed?: () => void;
}) {
  const today = new Date().toLocaleDateString("sv-SE");
  const weekday = new Date().getDay() || 7;
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [weeklyContent, setWeeklyContent] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [weeklyStatus, setWeeklyStatus] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [resolutionTaskId, setResolutionTaskId] = useState("");
  const items = useMemo(() => buildTodayWorkItems({ date: today, students, attendance, tasks, homework }), [attendance, homework, students, tasks, today]);
  const todayEntries = schedule.entries.filter(item => item.weekday === weekday).sort((a, b) => schedule.periods.findIndex(period => period.id === a.periodId) - schedule.periods.findIndex(period => period.id === b.periodId));
  const abnormalCount = attendance.filter(item => item.date === today && (item.status !== "normal" || item.late || item.earlyLeave)).length;
  const dueTaskCount = tasks.filter(item => item.status === "pending" && item.dueDate <= today).length;
  const dueHomework = homework.filter(item => (item.lifecycle || "active") === "active" && item.dueDate <= today).length;
  // 统计卡页脚的真实对比数据：昨日异常数、逾期任务数、今日到期作业的待登记/未交人数。
  const yesterdayKey = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  const hadYesterdayRecords = attendance.some(item => item.date === yesterdayKey);
  const yesterdayAbnormal = attendance.filter(item => item.date === yesterdayKey && (item.status !== "normal" || item.late || item.earlyLeave)).length;
  const abnormalDelta = abnormalCount - yesterdayAbnormal;
  const overdueTaskCount = tasks.filter(item => item.status === "pending" && item.dueDate < today).length;
  const homeworkPendingCount = homework
    .filter(item => (item.lifecycle || "active") === "active" && item.dueDate <= today)
    .reduce((sum, item) => sum + Object.values(item.studentStates).filter(state => state.status === "unrecorded" || state.status === "pending").length, 0);
  const range = getWeekRange();
  const facts = buildWeeklyFacts({ students, attendance, tasks, homework, dormitories, gradeExams, ...range });

  useInitialTargetEffect(initialDraftId, () => {
    const draft = drafts.find(item => item.id === initialDraftId);
    if (!draft) return;
    setWeeklyContent(draft.content);
    setWeeklyStatus("已从历史打开保存的周报草稿。");
    setWeeklyOpen(true);
  }, onInitialDraftConsumed);

  function openItem(item: ReturnType<typeof buildTodayWorkItems>[number]) {
    if (onOpenEntity) {
      onOpenEntity({ domain: item.kind === "task" ? "followup" : item.kind, entityId: item.entityId, studentId: item.studentId, date: item.kind === "attendance" ? today : undefined });
      return;
    }
    (item.kind === "attendance" ? onOpenAttendance : item.kind === "homework" ? onOpenHomework : onOpenTasks)();
  }

  // 跟进任务就地完成：先做 180ms 收起补位，再交给来源领域写状态（可经 toast 撤销）。
  function completeItem(item: ReturnType<typeof buildTodayWorkItems>[number]) {
    if (!onCompleteTask || item.kind !== "task") return;
    const finish = async () => {
      if (await onCompleteTask(item.entityId)) {
        setQueueOpen(false);
        setResolutionTaskId(item.entityId);
      }
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void finish();
      return;
    }
    setCompletingIds(current => new Set(current).add(item.id));
    window.setTimeout(() => {
      void finish();
      setCompletingIds(current => { const next = new Set(current); next.delete(item.id); return next; });
    }, 180);
  }

  function renderQueueItem(item: ReturnType<typeof buildTodayWorkItems>[number], onOpen: () => void) {
    const collapsing = completingIds.has(item.id);
    const Icon = item.kind === "homework" ? BookOpenCheck : item.kind === "attendance" ? UserRoundCheck : ClipboardList;
    return <div key={item.id} className={cx("overflow-hidden transition-[max-height,opacity] duration-200 ease-out motion-reduce:transition-none", collapsing ? "max-h-0 opacity-0" : "max-h-32")}>
      <div className="group flex items-center gap-2 rounded-xl px-2 transition-colors duration-150 hover:bg-background-secondary-default">
        <button type="button" aria-label={`${item.title} ${item.detail}`} onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-border-button-default bg-background-primary-default text-foreground-icon-secondary"><Icon className="size-4"/></span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-body-medium text-text-primary">{item.title}</strong><span className="mt-1 block text-caption-1-regular text-text-secondary">{item.detail.replace(/ · (今日截止|已逾期)$/, "")}</span></span>
          <Chip variant="caption" color={item.urgency === 0 ? "rose" : "soft"} className="hidden sm:inline-flex">{item.urgency === 0 ? "已逾期" : item.kind === "attendance" ? "需关注" : "今日截止"}</Chip>
        </button>
        {item.kind === "task" && onCompleteTask ? <IconButton label={`完成跟进：${item.title}`} size="sm" onClick={() => completeItem(item)}><CheckCircle2 className="size-4"/></IconButton> : <ArrowRight aria-hidden="true" className="mx-2 size-4 shrink-0 text-foreground-icon-tertiary"/>}
      </div>
    </div>;
  }

  function openWeekly() {
    const existing = drafts.find(item => item.scope === "class" && item.startDate === range.startDate && item.endDate === range.endDate);
    setWeeklyContent(existing?.content || buildLocalWeeklyDraft("班级", range.startDate, range.endDate, facts));
    setWeeklyStatus("已基于本机数据生成，可直接编辑或按需使用 AI 润色。");
    setWeeklyOpen(true);
  }

  async function enhanceWeekly() {
    setAiBusy(true); setWeeklyStatus("");
    try {
      const result = await generateAiWeeklyDraft({ scope: "class", subjectName: "班级", startDate: range.startDate, endDate: range.endDate, facts, localDraft: weeklyContent });
      setWeeklyContent(result.content); setWeeklyStatus(result.disclaimer);
    } catch { setWeeklyStatus("AI 暂时不可用，本地草稿仍可继续编辑或复制。"); }
    finally { setAiBusy(false); }
  }

  async function copyWeekly() { await navigator.clipboard.writeText(weeklyContent); setWeeklyStatus("周报已复制，可粘贴到家长群或其他渠道。" ); }

  async function importSchedule(file: File | null) {
    if (!file) return;
    setStatus("正在解析课表...");
    try { onScheduleChange(parseScheduleRows(await readRowsFromFile(file), file.name)); setStatus("课表已导入并保存。"); }
    catch { setStatus("未识别出周一至周日和课节，请调整表头后重试。"); }
  }

  return <div className="h-full overflow-y-auto bg-background-primary-default" data-today-workspace>
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 p-5 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <div className="flex flex-col gap-1"><h1 className="text-title-2-medium text-text-primary">今日班务</h1><p className="text-body-regular text-text-secondary">{new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })} · {students.length} 位学生</p></div>
        <MetricStrip items={[
          { key: "attendance", label: "出勤异常", value: abnormalCount, dot: "bg-status-warning-500", caption: abnormalDelta !== 0 ? `较昨日 ${abnormalDelta > 0 ? "+" : ""}${abnormalDelta}` : hadYesterdayRecords ? "较昨日持平" : "今日", onOpen: onOpenAttendance },
          { key: "tasks", label: "到期待办", value: dueTaskCount, dot: "bg-accent-500", caption: overdueTaskCount > 0 ? `含逾期 ${overdueTaskCount} 项` : "今日截止", onOpen: onOpenTasks },
          { key: "homework", label: "到期作业", value: dueHomework, dot: "bg-status-cyan-500", caption: homeworkPendingCount > 0 ? `${homeworkPendingCount} 人待登记或未交` : "全部已登记", onOpen: onOpenHomework },
        ]} />
        <div className="ml-auto flex flex-wrap items-center gap-2"><Button variant="secondary" onClick={openWeekly}><ClipboardList className="size-4"/>本周复盘</Button><Button onClick={onOpenQuickRecord}><Plus className="size-4"/>快捷记录</Button></div>
      </header>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,1fr)]">
        <Card title="需要处理" className="min-w-0" bodyClassName="px-3 pb-3" action={<Button size="sm" variant="ghost" onClick={() => setQueueOpen(true)}>查看全部 <span className="text-text-secondary">{items.length}</span></Button>}>
          <div className="flex items-center justify-between border-b border-separator-border px-2 pb-3 text-caption-1-regular text-text-secondary"><span>事项 · 按紧急程度排序</span><span>操作</span></div>
          <div className="divide-y divide-separator-border">{items.slice(0, 8).map(item => renderQueueItem(item, () => openItem(item)))}</div>
          {!items.length && <div className="flex min-h-60 flex-col items-center justify-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-background-secondary-default text-foreground-icon-secondary"><CheckCircle2 className="size-6"/></span><p className="text-body-medium text-text-primary">今天没有待处理事项</p><p className="text-body-regular text-text-secondary">可以从右侧开始登记新的班务。</p></div>}
        </Card>
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="今日课表" bodyClassName="px-4 pb-4" action={<IconButton label="管理课表" size="sm" onClick={() => setScheduleOpen(true)}><CalendarDays className="size-4"/></IconButton>}>
            {todayEntries.length ? <div className="flex flex-col gap-2">{todayEntries.map(entry => <div key={entry.id} className="flex items-center gap-3 rounded-xl bg-background-secondary-default p-3"><Clock3 className="size-4 shrink-0 text-foreground-icon-secondary"/><span className="text-body-medium text-text-primary">{entry.subject}</span><span className="ml-auto text-caption-1-regular text-text-secondary">{schedule.periods.find(period => period.id === entry.periodId)?.label}</span></div>)}</div> : <button type="button" onClick={() => setScheduleOpen(true)} className="flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-button-default bg-background-secondary-default p-4 text-body-regular text-text-secondary transition-colors duration-150 hover:bg-background-secondary-hover"><CalendarDays className="size-5"/>今天还没有课表，点击导入</button>}
          </Card>
          <Card title="快捷处理" bodyClassName="px-3 pb-3"><div className="flex flex-col gap-1">{[
            { label: "登记出勤", detail: "记录请假、迟到与缺勤", icon: UserRoundCheck, action: onOpenAttendance },
            { label: "新建任务", detail: "安排班级或学生跟进", icon: ClipboardList, action: onOpenTasks },
            { label: "布置作业", detail: "登记作业与提交情况", icon: BookOpenCheck, action: onOpenHomework },
            { label: "座位", detail: "查看与调整班级座位", icon: LayoutGrid, action: onOpenSeats },
          ].map(item => <button type="button" key={item.label} aria-label={item.label} onClick={item.action} className="flex items-center gap-3 rounded-xl p-3 text-left outline-none transition-colors duration-150 hover:bg-background-secondary-default focus-visible:ring-2 focus-visible:ring-border-focus-ring"><item.icon className="size-5 shrink-0 text-foreground-icon-secondary"/><span className="flex-1"><span className="block text-body-medium text-text-primary">{item.label}</span><span className="mt-0.5 block text-caption-1-regular text-text-secondary">{item.detail.replace(/ · (今日截止|已逾期)$/, "")}</span></span><ArrowRight className="size-4 text-foreground-icon-tertiary"/></button>)}</div></Card>
        </div>
      </div>
    </div>
    <ToolDrawer open={scheduleOpen} title="课表管理" onClose={() => setScheduleOpen(false)}>
      <div className="space-y-5"><p className="text-body-regular text-text-secondary">导入本学期课表，在今日班务中查看当天课程。</p><FileDropZone accept=".xlsx,.xls,.xlsm,.csv,.tsv" onChange={file => void importSchedule(file)}><FileSpreadsheet className="size-7 text-foreground-icon-secondary"/><strong className="text-body-medium text-text-primary">导入 Excel 课表</strong><span className="text-caption-1-regular text-text-secondary">首列为课节，后续列包含周一至周日</span></FileDropZone>{status && <InlineStatus message={status}/>}
        <div className="flex flex-col gap-2">{schedule.periods.map(period => <div key={period.id} className="rounded-xl bg-background-secondary-default p-3"><div className="text-body-medium text-text-primary">{period.label}</div><div className="mt-2 flex flex-wrap gap-1">{schedule.entries.filter(entry => entry.periodId === period.id).map(entry => <Chip key={entry.id} variant="caption" color="soft">周{["", "一", "二", "三", "四", "五", "六", "日"][entry.weekday]} {entry.subject}</Chip>)}</div></div>)}</div>
      </div>
    </ToolDrawer>
    <ToolDrawer open={weeklyOpen} title="本周班级复盘" widthClassName="w-[520px]" onClose={() => setWeeklyOpen(false)} footer={<div className="flex flex-wrap justify-center gap-2"><Button variant="ai" disabled={aiBusy} onClick={() => void enhanceWeekly()}><Sparkles className="size-4"/>AI 润色</Button><Button variant="secondary" disabled={aiBusy || !weeklyContent.trim()} onClick={() => void copyWeekly()}><Clipboard className="size-4"/>复制</Button></div>}>
      <div className="flex flex-col gap-5"><p className="text-body-regular text-text-secondary">{range.startDate} — {range.endDate}</p><div><h3 className="mb-3 text-body-medium text-text-primary">本周事实</h3><div className="flex flex-wrap gap-2">{facts.map(fact => <Chip key={fact} variant="caption" color="soft">{fact}</Chip>)}</div></div>
        {aiBusy ? <AiGenerationPanel title="正在润色周报" steps={["读取本周事实", "整理表达", "生成可编辑草稿"]}/> : <Textarea label="复盘草稿" rows={14} value={weeklyContent} onChange={setWeeklyContent} hint="核对并编辑后，可复制到家长群或其他渠道。"/>}
        {weeklyStatus && <InlineStatus message={weeklyStatus} tone="ai"/>}
      </div>
    </ToolDrawer>
    <ToolDrawer open={queueOpen} title={`全部待处理 · ${items.length}`} widthClassName="w-[520px]" onClose={() => setQueueOpen(false)}><div className="divide-y divide-separator-border">{items.map(item => renderQueueItem(item, () => { setQueueOpen(false); openItem(item); }))}{!items.length && <p className="py-12 text-center text-body-regular text-text-secondary">今天没有待处理事项</p>}</div></ToolDrawer>
    <ToolDrawer open={Boolean(resolutionTaskId)} title="补充处理结果" onClose={() => setResolutionTaskId("")}>{(() => { const task = tasks.find(item => item.id === resolutionTaskId); return task ? <ResolutionEditor task={task} onSave={note => { onSaveTaskResolution?.(task.id, note); setResolutionTaskId(""); }} onContinue={() => { onContinueTask?.(task.id); setResolutionTaskId(""); }}/> : null; })()}</ToolDrawer>
  </div>;
}
