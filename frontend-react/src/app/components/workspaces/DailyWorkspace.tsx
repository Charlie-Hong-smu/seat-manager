import { getAttendanceForDate } from "../../state/attendancePeriods";
import { Users } from "lucide-react";
import type { ClassDutiesBinding } from "../../state/classDuties";
import { RetryableLazy, preloadFeature } from "../RetryableLazy";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Dices,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Plus,
  Settings2,
  Shuffle,
  Undo2,
  UserPlus,
} from "lucide-react";

import { SeatSettingsModal } from "../SeatSettingsModal";
import { SeatLayoutDesigner } from "../SeatLayoutDesigner";
import { ActionMenu, MotionCollapse, Checkbox, Button, IconButton, MetricStrip, NumberStepper, SegmentedControl, SelectMenu, ToolDrawer, ToolPopover, Input, useAppDialog } from "../ui";
import type {
  AppStudent,
  Gender,
  SeatSettings,
  StudentId,
} from "../../state/types";
import { useSeatModeTransition } from "../useSeatModeTransition";
import { SeatBoard } from "../SeatBoard";
import { getDrawRound, retainDrawSessions, drawStudents, todayKey } from "../../state/dailyManagement";
import { groupFollowupTasks } from "../../state/followupStudents";
import type { ShuffleCandidate } from "../../state/seatPlanner";
import type { AttendanceRecord, DrawSession, FollowupTask } from "../../state/types";

const loadClassDutiesPanel = () => import("../ClassDutiesPanel");
const SEAT_MANAGE_TRIGGER_ID = "seat-manage-trigger";
const loadSeatShufflePreview = () => import("../SeatShufflePreview").then(module => ({ default: module.SeatShufflePreview }));

export function DailyWorkspace({
  classDuties,
  students,
  seatOrder,
  lockedSeats,
  seatSettings,
  canUndoSeatOrder,
  shufflePreview,
  onRandomizeSeats,
  onShufflePreviewOrderChange,
  onApplyShufflePreview,
  onDiscardShufflePreview,
  onOrderSeatsByList,
  onUndoSeatOrder,
  onUpdateSeatSettings,
  onApplySeatLayout,
  onAddStudent,
  onSelectStudent,
  onOpenStudentFollowup,
  onMoveSeat,
  onMoveStudentToWaiting,
  onAssignStudentToSeat,
  onToggleLock,
  drawSessions,
  onDrawSessionsChange,
  attendanceRecords,
  followupTasks,
  onOpenAttendance,
  onOpenFollowups,
}: {
  classDuties?: ClassDutiesBinding;
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  lockedSeats: Set<number>;
  seatSettings: SeatSettings;
  canUndoSeatOrder: boolean;
  shufflePreview: ShuffleCandidate | null;
  onRandomizeSeats: () => boolean;
  onShufflePreviewOrderChange: (order: Array<StudentId | null>) => void;
  onApplyShufflePreview: () => void;
  onDiscardShufflePreview: () => void;
  onOrderSeatsByList: () => void;
  onUndoSeatOrder: () => void;
  onUpdateSeatSettings: (updater: (current: SeatSettings) => SeatSettings) => void;
  onApplySeatLayout: (layout: NonNullable<SeatSettings["layout"]>) => void;
  onAddStudent: (name: string, gender: Gender, alias?: string) => void;
  onSelectStudent: (student: AppStudent) => void;
  onOpenStudentFollowup: (student: AppStudent) => void;
  onMoveSeat: (fromIndex: number, toIndex: number) => void;
  onMoveStudentToWaiting: (fromIndex: number) => void;
  onAssignStudentToSeat: (studentId: StudentId, seatIndex: number) => void;
  onToggleLock: (idx: number) => void;
  drawSessions: DrawSession[];
  onDrawSessionsChange: (sessions: DrawSession[]) => void;
  attendanceRecords: AttendanceRecord[];
  followupTasks: FollowupTask[];
  onOpenAttendance: () => void;
  onOpenFollowups: () => void;
}) {
  const [seatFlow, setSeatFlow] = useState<"view" | "rules" | "preview">("view");
  const [evaluationOpen, setEvaluationOpen] = useState(false);
  const [wideSeatPanel, setWideSeatPanel] = useState(false);
  const { editingLayout, transitioning, seatPanelRef, switchLayoutEditing } = useSeatModeTransition();
  useEffect(() => {
    const panel = seatPanelRef.current;
    if (!panel) return;
    const observer = new ResizeObserver(entries => setWideSeatPanel(entries[0].contentRect.width > 1400));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [seatPanelRef]);
  const [designerToolbarHost, setDesignerToolbarHost] = useState<HTMLDivElement | null>(null);
  const [activeTool, setActiveTool] = useState<"student" | "draw" | "duties" | null>(null);
  const [cardMode, setCardMode] = useState<"compact" | "detail">("compact");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [alias, setAlias] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [drawCount, setDrawCount] = useState(1);
  const [noRepeat, setNoRepeat] = useState(false);
  const appDialog = useAppDialog();
  const discardShuffleRef = useRef(onDiscardShufflePreview);
  discardShuffleRef.current = onDiscardShufflePreview;
  useEffect(() => () => discardShuffleRef.current(), []);
  const [drawBusy, setDrawBusy] = useState(false);
  const [drawResult, setDrawResult] = useState<string[]>([]);
  const [drawRound, setDrawRound] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  // 抽签历史直接读持久化的 drawSessions，切页或刷新后仍然可见。
  const drawHistory = useMemo(() => {
    const studentById = new Map(students.map(student => [student.id, student]));
    return drawSessions.slice(0, 10).map(session => ({
      id: session.id,
      time: `${session.date === todayKey() ? "" : `${session.date} `}${new Date(session.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}`,
      names: session.studentIds.map(id => studentById.get(id)?.name || "已移出学生"),
    }));
  }, [drawSessions, students]);
  const constraints = seatSettings.constraints;
  const activeConstraintCount = constraints.lockedDeskmatePairs.length
    + constraints.noDeskmatePairs.length
    + constraints.frontRowStudentIds.length
    + seatSettings.complementRuleIds.length
    + (seatSettings.pairByGender ? 1 : 0);
  const activeStudentIds = new Set(students.filter(student => student.enrollmentStatus !== "archived").map(student => student.id));
  const todayAttendance = getAttendanceForDate(attendanceRecords, todayKey()).filter(item => activeStudentIds.has(item.studentId));
  const abnormalAttendance = todayAttendance.filter(item => item.status !== "normal" || item.late || item.earlyLeave).length;
  const dueTasks = groupFollowupTasks(followupTasks.filter(item => item.status === "pending" && item.dueDate && item.dueDate <= todayKey())).length;
  const evaluationVisible = seatFlow === "preview" && (wideSeatPanel || evaluationOpen);
  const seatShuffleCleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => seatShuffleCleanupRef.current?.(), []);

  function transitionSeatBoard(update: () => void) {
    seatShuffleCleanupRef.current?.();
    seatShuffleCleanupRef.current = null;
    const layer = seatPanelRef.current?.querySelector<HTMLElement>("[data-seat-board-layer]");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const previous = new Map<number, { studentId: string | null; rect: DOMRect; content: HTMLElement }>();
    if (layer && !reducedMotion) {
      layer.querySelectorAll<HTMLElement>("[data-seat-index]").forEach(card => {
        previous.set(Number(card.dataset.seatIndex), {
          studentId: card.dataset.studentId ?? null,
          rect: card.getBoundingClientRect(),
          content: card.cloneNode(true) as HTMLElement,
        });
      });
    }
    flushSync(update);
    if (!layer || reducedMotion || !previous.size) return;

    // Keep desks fixed. A row wave changes only the faces of seats whose
    // occupants changed, so a full-class shuffle never becomes a tangle of cards.
    const origin = layer.getBoundingClientRect();
    const positions = [...previous.values()].map(item => item.rect);
    const topMin = Math.min(...positions.map(rect => rect.top));
    const topRange = Math.max(1, Math.max(...positions.map(rect => rect.top)) - topMin);
    const leftMin = Math.min(...positions.map(rect => rect.left));
    const leftRange = Math.max(1, Math.max(...positions.map(rect => rect.left)) - leftMin);
    const overlay = document.createElement("div");
    overlay.className = "seat-shuffle-morph-layer";
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    const animations: Animation[] = [];
    const changedCards: HTMLElement[] = [];
    layer.querySelectorAll<HTMLElement>("[data-seat-index]").forEach(card => {
      const index = Number(card.dataset.seatIndex);
      const before = previous.get(index);
      if (!before || before.studentId === (card.dataset.studentId ?? null)) return;
      const delay = Math.round((before.rect.top - topMin) / topRange * 238 + (before.rect.left - leftMin) / leftRange * 35);
      const wrapper = document.createElement("div");
      wrapper.className = "seat-shuffle-morph-ghost";
      wrapper.dataset.seatShuffleGhost = String(index);
      Object.assign(wrapper.style, {
        left: `${before.rect.left - origin.left}px`, top: `${before.rect.top - origin.top}px`,
        width: `${before.rect.width}px`, height: `${before.rect.height}px`,
      });
      before.content.removeAttribute("data-seat-index");
      before.content.removeAttribute("data-student-id");
      before.content.removeAttribute("role");
      before.content.removeAttribute("tabindex");
      before.content.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
      before.content.style.transform = "none";
      wrapper.append(before.content);
      overlay.append(wrapper);
      card.dataset.seatShuffleMorphing = "true";
      changedCards.push(card);
      animations.push(wrapper.animate([
        { opacity: 1, transform: "translateY(0) scale(1)" },
        { opacity: 0, transform: "translateY(-8px) scale(0.985)" },
      ], { duration: 250, delay, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }));
      animations.push(card.animate([
        { opacity: 0, transform: "translateY(8px) scale(0.985)" },
        { opacity: 1, transform: "translateY(0) scale(1)" },
      ], { duration: 390, delay: delay + 70, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }));
    });
    if (!animations.length) return;
    layer.append(overlay);
    const clean = () => {
      animations.forEach(animation => animation.cancel());
      changedCards.forEach(card => delete card.dataset.seatShuffleMorphing);
      overlay.remove();
    };
    seatShuffleCleanupRef.current = clean;
    void Promise.allSettled(animations.map(animation => animation.finished)).then(() => {
      if (seatShuffleCleanupRef.current !== clean) return;
      clean();
      seatShuffleCleanupRef.current = null;
    });
  }

  function returnToSeats() {
    transitionSeatBoard(() => { onDiscardShufflePreview(); setSeatFlow("view"); setEvaluationOpen(false); });
    requestAnimationFrame(() => document.getElementById("seat-shuffle-trigger")?.focus({ preventScroll: true }));
  }

  function generatePreview() {
    transitionSeatBoard(() => { if (onRandomizeSeats()) { setSeatFlow("preview"); setEvaluationOpen(false); } });
    requestAnimationFrame(() => document.getElementById("seat-preview-title")?.focus({ preventScroll: true }));
  }

  function regeneratePreview() {
    transitionSeatBoard(() => { onRandomizeSeats(); });
  }

  function backToRules() {
    transitionSeatBoard(() => { setSeatFlow("rules"); setEvaluationOpen(false); });
    requestAnimationFrame(() => document.getElementById("seat-generate-preview")?.focus({ preventScroll: true }));
  }

  function applyPreview() {
    transitionSeatBoard(() => { onApplyShufflePreview(); setSeatFlow("view"); setEvaluationOpen(false); });
    requestAnimationFrame(() => document.getElementById("seat-shuffle-trigger")?.focus({ preventScroll: true }));
  }

  function orderSeatsByList() {
    transitionSeatBoard(() => { onOrderSeatsByList(); setSeatFlow("view"); setEvaluationOpen(false); });
    requestAnimationFrame(() => document.getElementById("seat-shuffle-trigger")?.focus({ preventScroll: true }));
  }

  function movePreviewSeat(fromIndex: number, toIndex: number) {
    if (!shufflePreview || lockedSeats.has(fromIndex) || lockedSeats.has(toIndex)) return;
    const order = [...shufflePreview.order];
    [order[fromIndex], order[toIndex]] = [order[toIndex], order[fromIndex]];
    onShufflePreviewOrderChange(order);
  }

  function movePreviewStudentToWaiting(fromIndex: number) {
    if (!shufflePreview || lockedSeats.has(fromIndex) || !shufflePreview.order[fromIndex]) return;
    const order = [...shufflePreview.order];
    order[fromIndex] = null;
    onShufflePreviewOrderChange(order);
  }

  function assignPreviewStudentToSeat(studentId: StudentId, seatIndex: number) {
    if (!shufflePreview || !students.some(student => student.id === studentId)
      || seatIndex < 0 || seatIndex >= shufflePreview.order.length
      || lockedSeats.has(seatIndex) || lockedSeats.has(shufflePreview.order.indexOf(studentId))) return;
    const order = shufflePreview.order.map(id => id === studentId ? null : id);
    order[seatIndex] = studentId;
    onShufflePreviewOrderChange(order);
  }

  function addStudent() {
    if (!name.trim()) return;
    onAddStudent(name, gender, alias);
    setName("");
    setGender("");
    setAlias("");
    nameInputRef.current?.focus();
  }

  async function draw() {
    if (drawBusy) return;
    setDrawBusy(true);
    try {
      const round = getDrawRound(drawSessions);
      let roundId = round.roundId;
      let selected = drawStudents(students, drawCount, noRepeat ? round.usedIds : new Set());
      if (!selected.length && noRepeat && students.length) {
        if (!await appDialog.confirm({ title: "本轮已抽完", description: "所有在班学生本轮都已抽过。确认后开始新一轮，历史记录仍保留。", confirmLabel: "开始新一轮" })) return;
        roundId = crypto.randomUUID();
        selected = drawStudents(students, drawCount);
      }
      if (selected.length) onDrawSessionsChange(retainDrawSessions([{ id: `draw-${crypto.randomUUID()}`, roundId, date: todayKey(), studentIds: selected.map(student => student.id), createdAt: new Date().toISOString() }, ...drawSessions]));
      setDrawResult(selected.map(student => student.name));
      setDrawRound(round => round + 1);
    } finally { setDrawBusy(false); }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background-primary-default">
      <div className="daily-toolbar seat-mode-toolbar shrink-0 border-b border-[var(--app-border)] bg-background-primary-default" data-editing={editingLayout ? "true" : "false"} data-seat-flow={seatFlow}>
        <div className="seat-mode-toolbar__board flex flex-wrap items-center gap-3 px-4 py-3" aria-hidden={editingLayout || seatFlow !== "view"} inert={editingLayout || seatFlow !== "view" || transitioning ? true : undefined}>
        <div className="daily-toolbar-primary flex flex-1 items-center gap-3">
          <MetricStrip size="sm" items={[
            { key: "students", label: "学生", value: students.length },
            { key: "seats", label: "座位", value: seatOrder.length },
            { key: "abnormal", label: "今日异常", value: abnormalAttendance, dot: "bg-status-warning-500", onOpen: onOpenAttendance },
            { key: "tasks", label: "待跟进", value: dueTasks, dot: "bg-accent-500", onOpen: onOpenFollowups },
          ]} />
        </div>

        <div className="daily-toolbar-actions ml-auto flex shrink-0 items-center justify-end gap-1 whitespace-nowrap">
          <Button id="daily-draw-tool-trigger" size="sm" variant="quiet" aria-haspopup="dialog" aria-expanded={activeTool === "draw"} onClick={() => setActiveTool(activeTool === "draw" ? null : "draw")}>
            <Dices className="h-4 w-4" />抽签
          </Button>
          <ActionMenu label="管理" triggerId={SEAT_MANAGE_TRIGGER_ID} icon={<Settings2 className="h-4 w-4" />} items={[
            { key: "student", label: "新增学生", icon: <UserPlus className="h-4 w-4" />, onSelect: () => setActiveTool("student") },
            ...(classDuties ? [{ key: "duties", label: "班级职务", icon: <Users className="h-4 w-4" />, onSelect: () => setActiveTool("duties") }] : []),
            { key: "layout", label: "编辑布局", icon: <LayoutGrid className="h-4 w-4" />, onSelect: () => { setActiveTool(null); switchLayoutEditing(true); } },
          ]} />
          <span className="mx-1.5 h-5 w-px bg-separator-border" aria-hidden="true" />
          <span className="seat-undo-slot" data-visible={canUndoSeatOrder ? "true" : "false"} aria-hidden={!canUndoSeatOrder || undefined} inert={!canUndoSeatOrder ? true : undefined}>
            <IconButton label="撤销" size="sm" variant="quiet" disabled={!canUndoSeatOrder} onClick={onUndoSeatOrder}><Undo2 className="h-4 w-4" /></IconButton>
          </span>
          <Button id="seat-shuffle-trigger" size="sm" title={activeConstraintCount > 0 ? `${activeConstraintCount} 条排座规则生效` : undefined} onClick={() => { setActiveTool(null); onDiscardShufflePreview(); void preloadFeature(loadSeatShufflePreview).catch(() => {}); setSeatFlow("rules"); requestAnimationFrame(() => document.getElementById("seat-rules-intro")?.focus({ preventScroll: true })); }}>
            <Shuffle className="h-4 w-4" />排座
            {activeConstraintCount > 0 && <span key={activeConstraintCount} aria-hidden="true" className="seat-rule-count">{activeConstraintCount}</span>}
          </Button>
        </div>

        </div>
        <div ref={setDesignerToolbarHost} className="seat-mode-toolbar__editor flex flex-wrap items-center gap-3 px-4 py-3" aria-hidden={!editingLayout} inert={!editingLayout || transitioning ? true : undefined} />
        <div className="seat-mode-toolbar__shuffle flex min-h-14 flex-wrap items-center gap-2 px-4 py-3" aria-hidden={seatFlow === "view"} inert={seatFlow === "view" || transitioning ? true : undefined}>
          <nav aria-label="排座流程" className="flex min-w-0 items-center gap-1">
            <Button size="sm" variant="quiet" aria-label="返回座位" onClick={returnToSeats}><ArrowLeft className="h-4 w-4" />座位</Button>
            <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
            <strong id="seat-preview-title" tabIndex={-1} className="block min-w-0 truncate text-body-semibold text-text-primary outline-none"><span key={seatFlow} className="seat-flow-title-enter inline-block">{seatFlow === "preview" ? "方案预览" : "排座"}</span></strong>
          </nav>
          {seatFlow === "preview" && <span className="seat-flow-title-enter text-caption-1-regular text-text-tertiary">采用后才会保存</span>}
          {seatFlow === "preview" && shufflePreview && <div className="seat-flow-actions-enter ml-auto flex flex-wrap items-center justify-end gap-1">
            <span className={`mr-1 rounded-[var(--app-radius-sm)] px-2.5 py-1.5 text-caption-1-semibold ${shufflePreview.evaluation.details.required.every(item => item.satisfied) ? "bg-status-success-50 text-status-success-700" : "bg-status-warning-50 text-status-warning-700"}`}>明确要求 {shufflePreview.evaluation.details.required.filter(item => item.satisfied).length}/{shufflePreview.evaluation.details.required.length}</span>
            <Button size="sm" variant="quiet" onClick={backToRules}>返回规则</Button>
            <Button id="seat-evaluation-trigger" size="sm" variant="quiet" aria-expanded={evaluationVisible} onClick={() => {
              if (wideSeatPanel) { document.getElementById("seat-shuffle-evaluation")?.focus({ preventScroll: true }); return; }
              setEvaluationOpen(value => !value);
              if (!evaluationOpen) requestAnimationFrame(() => document.getElementById("seat-shuffle-evaluation")?.focus({ preventScroll: true }));
            }}>评估详情</Button>
            <Button size="sm" variant="secondary" onClick={regeneratePreview}><Shuffle className="h-4 w-4" />再随机一次</Button>
            <Button size="sm" onClick={applyPreview}>采用方案</Button>
          </div>}
        </div>
      </div>

      <div className="min-h-0 flex-1 p-3">
        <div ref={seatPanelRef} data-seat-flow={seatFlow} data-evaluation-open={evaluationOpen ? "true" : "false"} className="seat-workflow-panel relative h-full min-h-0 overflow-hidden bg-background-primary-default">
          {(!editingLayout || transitioning) && <div data-seat-board-layer className="absolute inset-0 p-2" style={{ visibility: editingLayout ? "hidden" : undefined }} aria-hidden={editingLayout || seatFlow === "rules"} inert={editingLayout || seatFlow === "rules" || transitioning ? true : undefined}>
            <SeatBoard footerAccessory={<SegmentedControl
              value={cardMode}
              ariaLabel="座位卡显示方式"
              onChange={value => setCardMode(value as "compact" | "detail")}
              options={[
                { value: "compact", label: "简洁", icon: <Minimize2 className="h-3.5 w-3.5" /> },
                { value: "detail", label: "详细", icon: <Maximize2 className="h-3.5 w-3.5" /> },
              ]}
            />} cardMode={cardMode} previewMode={seatFlow === "preview"} students={students} seatOrder={seatFlow === "preview" && shufflePreview ? shufflePreview.order : seatOrder} seatSettings={seatSettings} onSelectStudent={onSelectStudent} onOpenStudentFollowup={onOpenStudentFollowup} onMoveSeat={seatFlow === "preview" ? movePreviewSeat : onMoveSeat} onMoveStudentToWaiting={seatFlow === "preview" ? movePreviewStudentToWaiting : onMoveStudentToWaiting} onAssignStudentToSeat={seatFlow === "preview" ? assignPreviewStudentToSeat : onAssignStudentToSeat} lockedSeats={lockedSeats} onToggleLock={seatFlow === "preview" ? () => {} : onToggleLock} />
          </div>}
          {!editingLayout && <div data-seat-rules-layer aria-hidden={seatFlow !== "rules"} inert={seatFlow !== "rules" ? true : undefined}>
            <SeatSettingsModal inline open students={students} settings={seatSettings} canUndo={canUndoSeatOrder} onUpdate={onUpdateSeatSettings} onRandomize={generatePreview} onOrderByList={orderSeatsByList} onUndo={() => transitionSeatBoard(onUndoSeatOrder)} onClose={returnToSeats} />
          </div>}
          {shufflePreview && !editingLayout && <div id="seat-shuffle-evaluation" tabIndex={-1} data-seat-preview-layer aria-hidden={!evaluationVisible} inert={!evaluationVisible ? true : undefined}>
            <RetryableLazy load={loadSeatShufflePreview} componentProps={{ inline: true, students, currentOrder: seatOrder, candidate: shufflePreview, seatSettings, onOrderChange: onShufflePreviewOrderChange, onRegenerate: regeneratePreview, onApply: applyPreview, onClose: returnToSeats, onBackToRules: backToRules, onSelectStudent }} fallback={<div className="flex h-full items-center justify-center text-body-regular text-text-secondary">正在准备评估详情…</div>} />
          </div>}
          {(editingLayout || transitioning) && (
            <div data-seat-designer-layer className="absolute inset-0" style={{ visibility: editingLayout ? undefined : "hidden" }} aria-hidden={!editingLayout} inert={!editingLayout || transitioning ? true : undefined}>
              <SeatLayoutDesigner current={seatSettings.layout} seatCount={seatOrder.length} onApply={onApplySeatLayout} onCancel={() => switchLayoutEditing(false)} toolbarHost={designerToolbarHost} />
            </div>
          )}
        </div>
      </div>

      {classDuties && <ToolDrawer open={activeTool === "duties"} title="班级职务" returnFocusId={SEAT_MANAGE_TRIGGER_ID} onClose={() => setActiveTool(null)}>{activeTool === "duties" && <RetryableLazy load={loadClassDutiesPanel} componentProps={{ binding: classDuties }} />}</ToolDrawer>}

      <ToolPopover open={activeTool === "student"} title="新增学生" anchorId={SEAT_MANAGE_TRIGGER_ID} onClose={() => setActiveTool(null)}>
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); addStudent(); }}>
          <Input value={name} onChange={setName} placeholder="姓名" elementRef={nameInputRef} />
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <Input value={alias} onChange={setAlias} placeholder="别名 / 拼音（可选）" className="min-w-0" />
            <SelectMenu value={gender} onChange={value => setGender(value as Gender)} ariaLabel="学生性别" options={[{ value: "", label: "未知" }, { value: "男", label: "男" }, { value: "女", label: "女" }]} />
          </div>
          <Button type="submit" className="w-full" disabled={!name.trim()}><Plus className="h-4 w-4" />添加到班级</Button>
        </form>
      </ToolPopover>

      <ToolPopover open={activeTool === "draw"} title="课堂抽签" anchorId="daily-draw-tool-trigger" onClose={() => setActiveTool(null)} widthClassName="w-[22rem]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-body-regular text-text-secondary">人数<NumberStepper value={drawCount} onChange={setDrawCount} min={1} max={Math.max(1, students.length)} ariaLabel="抽取人数" /></div>
            <Checkbox isSelected={noRepeat} onChange={setNoRepeat}>本轮不重复</Checkbox>
          </div>
          <Button data-popover-autofocus className="w-full" disabled={drawBusy} onClick={() => void draw()}><Dices className="h-4 w-4" />{drawResult.length ? "再抽一次" : "开始抽签"}</Button>
          <MotionCollapse open={drawResult.length > 0} className="!mt-0" contentClassName="pt-4">
            <div aria-live="polite" className="draw-result-stage grid min-h-24 place-items-center rounded-[var(--app-radius-md)] bg-background-secondary-default px-4 py-5">
              <div key={drawRound} className="flex flex-wrap justify-center gap-x-5 gap-y-2">{drawResult.map((resultName, index) => <span key={`${drawRound}-${index}`} className="draw-result-name text-title-2-semibold text-text-primary" style={{ "--draw-index": index } as CSSProperties}>{resultName}</span>)}</div>
            </div>
          </MotionCollapse>
          {drawHistory.length > 0 && (
            <div className="border-t border-separator-border pt-2">
              <button type="button" aria-expanded={historyOpen} onClick={() => setHistoryOpen(value => !value)} className="flex h-9 w-full items-center justify-between rounded-lg px-1 text-caption-1-semibold text-text-secondary transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring">
                最近 {drawHistory.length} 次<ChevronDown className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${historyOpen ? "rotate-180" : ""}`} />
              </button>
              <MotionCollapse open={historyOpen}><div className="max-h-52 divide-y divide-separator-border overflow-y-auto">{drawHistory.map(item => (
                <div key={item.id} className="flex items-baseline gap-3 px-1 py-2"><span className="shrink-0 text-caption-1-regular tabular-nums text-text-tertiary">{item.time}</span><span className="min-w-0 flex-1 text-caption-1-medium text-text-primary">{item.names.join("、")}</span></div>
              ))}</div></MotionCollapse>
            </div>
          )}
        </div>
      </ToolPopover>

      {appDialog.dialog}
    </div>
  );
}
