import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";

import {
  getChangedSeatIndices,
  getSeatPositionLabel,
  getSeatPreviewStats,
  type SeatEvaluation,
  type ShuffleCandidate,
  settleDurationFor,
} from "../state/seatPlanner";
import { resolveSeatLayout } from "../state/seatLayout";
import type { AppStudent, SeatSettings, StudentId } from "../state/types";
import { useModalFocus } from "./ui";

const COLS = 8;

interface Props {
  students: AppStudent[];
  currentOrder: Array<StudentId | null>;
  candidate: ShuffleCandidate;
  seatSettings: SeatSettings;
  onOrderChange: (order: Array<StudentId | null>) => void;
  onRegenerate: () => void;
  onApply: () => void;
  onClose: () => void;
  onSelectStudent?: (student: AppStudent) => void;
}

type DetailTab = "changed" | "required" | "gender" | "complement" | "front" | "rotation";

interface PreviewSeatRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PreviewDragVisual {
  fromIndex: number;
  targetIndex: number | null;
  pointerX: number;
  pointerY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  proximity: number;
  phase: "dragging" | "settling";
  settleLeft?: number;
  settleTop?: number;
  settleMs?: number;
}

function PreviewStat({ active, label, value, onClick }: { active: boolean; label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
        active ? "border-accent-200 bg-accent-50 text-accent-700" : "border-separator-border bg-background-primary-default text-text-secondary hover:bg-background-secondary-default"
      }`}
    >
      <span className="block text-caption-1-regular opacity-70" style={{ fontWeight: 700 }}>{label}</span>
      <strong className="block mt-1 text-body-regular">{value}</strong>
    </button>
  );
}

function DetailItem({ children, tone = "muted" }: { children: React.ReactNode; tone?: "ok" | "warn" | "muted" }) {
  const className = {
    ok: "bg-status-success-50 text-status-success-700 border-status-success-100",
    warn: "bg-status-warning-50 text-status-warning-700 border-status-warning-100",
    muted: "bg-background-secondary-default text-text-secondary border-separator-border",
  }[tone];
  return <div className={`rounded-xl border px-3 py-2 text-caption-1-regular ${className}`}>{children}</div>;
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-caption-1-regular text-text-tertiary" style={{ fontWeight: 800 }}>{title}</div>
      {children}
    </div>
  );
}

function renderRequiredDetails(evaluation: SeatEvaluation) {
  const satisfied = evaluation.details.required.filter(item => item.satisfied);
  const unmet = evaluation.details.required.filter(item => !item.satisfied);
  return (
    <>
      <DetailBlock title="已满足的明确要求">
        {satisfied.length ? satisfied.map(item => (
          <DetailItem key={`${item.type}-${item.label}`} tone="ok">{item.label}（{item.seats.join("、")}）</DetailItem>
        )) : <DetailItem>暂无明确要求。</DetailItem>}
      </DetailBlock>
      <DetailBlock title="未满足的明确要求">
        {unmet.length ? unmet.map(item => (
          <DetailItem key={`${item.type}-${item.label}`} tone="warn">{item.label}（当前：{item.seats.join("、")}）</DetailItem>
        )) : <DetailItem tone="ok">明确要求都已满足。</DetailItem>}
      </DetailBlock>
    </>
  );
}

function renderGenderDetails(evaluation: SeatEvaluation, pairByGender: boolean) {
  const { mixed, same, unknown } = evaluation.details.gender;
  return (
    <>
      <DetailBlock title="男女同桌">
        {mixed.length ? mixed.map(item => (
          <DetailItem key={`${item.leftId}-${item.rightId}`} tone="ok">{item.leftName} - {item.rightName}：{item.leftGender} + {item.rightGender}</DetailItem>
        )) : <DetailItem>暂未形成男女同桌。</DetailItem>}
      </DetailBlock>
      <DetailBlock title={pairByGender ? "还没做到的同桌" : "同性别同桌"}>
        {same.length ? same.map(item => (
          <DetailItem key={`${item.leftId}-${item.rightId}`} tone={pairByGender ? "warn" : "muted"}>{item.leftName} - {item.rightName}：{item.leftGender} + {item.rightGender}</DetailItem>
        )) : <DetailItem tone="ok">没有同性别同桌。</DetailItem>}
      </DetailBlock>
      <DetailBlock title="无法判断的同桌">
        {unknown.length ? unknown.map(item => (
          <DetailItem key={`${item.leftId}-${item.rightId}`}>{item.leftName} - {item.rightName}：性别未完整填写</DetailItem>
        )) : <DetailItem tone="ok">没有性别未知的同桌。</DetailItem>}
      </DetailBlock>
    </>
  );
}

function renderComplementDetails(evaluation: SeatEvaluation) {
  if (!evaluation.complementEnabled) {
    return <DetailItem>未勾选互补关系；如需强弱/性格互补，请在排座要求中勾选。</DetailItem>;
  }
  if (!evaluation.details.complement.length) {
    return <DetailItem>本次没有形成明显互补同桌。</DetailItem>;
  }
  const byRule = new Map<string, React.ReactNode[]>();
  evaluation.details.complement.forEach(item => {
    item.matches.forEach(match => {
      const list = byRule.get(match.ruleLabel) || [];
      list.push(
        <DetailItem key={`${item.leftId}-${item.rightId}-${match.ruleId}`} tone="ok">
          {item.leftName} - {item.rightName}（{item.leftSeat}、{item.rightSeat}）：{match.reason}
        </DetailItem>
      );
      byRule.set(match.ruleLabel, list);
    });
  });
  return [...byRule.entries()].map(([rule, items]) => (
    <DetailBlock key={rule} title={rule}>{items}</DetailBlock>
  ));
}

function renderFrontDetails(evaluation: SeatEvaluation) {
  const satisfied = evaluation.details.front.filter(item => item.satisfied);
  const unmet = evaluation.details.front.filter(item => !item.satisfied);
  return (
    <>
      <DetailBlock title="已坐到前排">
        {satisfied.length ? satisfied.map(item => (
          <DetailItem key={item.label} tone="ok">{item.label}：当前 {item.seats[0]}</DetailItem>
        )) : <DetailItem>暂无前排照顾学生。</DetailItem>}
      </DetailBlock>
      <DetailBlock title="还未坐到前排">
        {unmet.length ? unmet.map(item => (
          <DetailItem key={item.label} tone="warn">{item.label}：当前第 {item.currentRow} 排</DetailItem>
        )) : <DetailItem tone="ok">前排照顾都已满足。</DetailItem>}
      </DetailBlock>
    </>
  );
}

export function SeatShufflePreview({ students, currentOrder, candidate, seatSettings, onOrderChange, onRegenerate, onApply, onClose, onSelectStudent }: Props) {
  const modalRef = useModalFocus(true, onClose);
  const [activeDetail, setActiveDetail] = useState<DetailTab>("required");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragVisual, setDragVisual] = useState<PreviewDragVisual | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const seatRectsRef = useRef(new Map<number, PreviewSeatRect>());
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const stats = getSeatPreviewStats(students, currentOrder, candidate.order, candidate.evaluation, seatSettings);
  const layout = useMemo(() => resolveSeatLayout(seatSettings.layout, candidate.order.length), [candidate.order.length, seatSettings.layout]);
  const rows = Math.ceil(candidate.order.length / COLS);
  const changedSet = new Set(getChangedSeatIndices(currentOrder, candidate.order));

  useEffect(() => () => {
    dragCleanupRef.current?.();
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  function readSeatRects() {
    const next = new Map<number, PreviewSeatRect>();
    boardRef.current?.querySelectorAll<HTMLElement>("[data-preview-seat-index]").forEach(element => {
      const index = Number(element.dataset.previewSeatIndex);
      if (!Number.isInteger(index) || next.has(index)) return;
      const rect = element.getBoundingClientRect();
      next.set(index, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    });
    return next;
  }

  function targetAtPoint(clientX: number, clientY: number, fromIndex: number) {
    let nearest: { targetIndex: number; proximity: number; distance: number } | null = null;
    for (const [targetIndex, rect] of seatRectsRef.current) {
      if (targetIndex === fromIndex) continue;
      const influencePadding = 40;
      const outsideX = Math.max(rect.left - influencePadding - clientX, 0, clientX - (rect.left + rect.width + influencePadding));
      const outsideY = Math.max(rect.top - influencePadding - clientY, 0, clientY - (rect.top + rect.height + influencePadding));
      if (outsideX > 0 || outsideY > 0) continue;
      const dx = clientX - (rect.left + rect.width / 2);
      const dy = clientY - (rect.top + rect.height / 2);
      const normalizedDistance = Math.hypot(dx / (rect.width / 2 + influencePadding), dy / (rect.height / 2 + influencePadding));
      if (normalizedDistance > 1) continue;
      const proximity = Math.max(0.08, Math.min(1, 1 - normalizedDistance));
      const distance = Math.hypot(dx, dy);
      if (!nearest || distance < nearest.distance) nearest = { targetIndex, proximity, distance };
    }
    return nearest ? { targetIndex: nearest.targetIndex, proximity: nearest.proximity } : { targetIndex: null, proximity: 0 };
  }

  function getTargetPush(fromIndex: number, targetIndex: number, proximity: number) {
    const sourceRect = seatRectsRef.current.get(fromIndex);
    const targetRect = seatRectsRef.current.get(targetIndex);
    if (!sourceRect || !targetRect) return { x: 0, y: 0 };
    const dx = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);
    const length = Math.hypot(dx, dy) || 1;
    const horizontalMove = Math.abs(dx) >= Math.abs(dy);
    const extent = horizontalMove ? targetRect.width : targetRect.height;
    const amount = Math.min(horizontalMove ? 72 : 56, extent * (horizontalMove ? 0.78 : 1)) * proximity;
    return { x: dx / length * amount, y: dy / length * amount };
  }

  // 与主座位板一致：松手即提交交换，被挤开的卡片从挤压预览位置滑向空出的座位。
  function commitSwap(fromIndex: number, targetIndex: number) {
    const sourceRect = seatRectsRef.current.get(fromIndex);
    const targetRect = seatRectsRef.current.get(targetIndex);
    const targetPush = getTargetPush(fromIndex, targetIndex, 1);
    const sourceStudentId = candidate.order[fromIndex] ?? null;
    const targetStudentId = candidate.order[targetIndex] ?? null;
    const next = [...candidate.order];
    next[fromIndex] = targetStudentId;
    next[targetIndex] = sourceStudentId;
    onOrderChange(next);
    // Empty-slot moves finish with the overlay snap, without replaying a fade.
    if (!targetStudentId || !studentById.has(targetStudentId)) return;
    if (!sourceRect || !targetRect || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const cards = Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-preview-student-id]") || []);
      if (sourceStudentId) {
        cards.find(card => card.dataset.previewStudentId === sourceStudentId)?.animate([
          { opacity: 0.35, transform: "scale(0.96)" },
          { opacity: 1, transform: "scale(1)" },
        ], { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
      const startX = targetRect.left + targetPush.x - sourceRect.left;
      const startY = targetRect.top + targetPush.y - sourceRect.top;
      const arcX = Math.abs(startY) > Math.abs(startX) ? 7 : 0;
      const arcY = Math.abs(startX) >= Math.abs(startY) ? -6 : 0;
      cards.find(card => card.dataset.previewStudentId === targetStudentId)?.animate([
        { offset: 0, opacity: 0.92, transform: `translate3d(${startX}px, ${startY}px, 0) scale(0.97)` },
        { offset: 0.28, opacity: 1, transform: `translate3d(${startX * 0.72 + arcX * 0.4}px, ${startY * 0.72 + arcY * 0.4}px, 0) scale(0.985)` },
        { offset: 0.78, opacity: 1, transform: `translate3d(${startX * 0.16 + arcX}px, ${startY * 0.16 + arcY}px, 0) scale(1)` },
        { offset: 1, opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
      ], { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    }));
  }

  function beginPointerDrag(event: ReactPointerEvent<HTMLButtonElement>, fromIndex: number) {
    if (event.button !== 0) return;
    dragCleanupRef.current?.();
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const sourceRect = event.currentTarget.getBoundingClientRect();
    const offsetX = startX - sourceRect.left;
    const offsetY = startY - sourceRect.top;
    seatRectsRef.current = readSeatRects();
    let active = false;

    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      dragCleanupRef.current = null;
    };
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== pointerId) return;
      if (!active && Math.hypot(pointerEvent.clientX - startX, pointerEvent.clientY - startY) < 6) return;
      if (!active) {
        active = true;
        setDragIndex(fromIndex);
      }
      pointerEvent.preventDefault();
      const { targetIndex, proximity } = targetAtPoint(pointerEvent.clientX, pointerEvent.clientY, fromIndex);
      setDragVisual({ fromIndex, targetIndex, pointerX: pointerEvent.clientX, pointerY: pointerEvent.clientY, offsetX, offsetY, width: sourceRect.width, height: sourceRect.height, proximity, phase: "dragging" });
    };
    const finishDrag = (pointerEvent: PointerEvent, cancelled: boolean) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      if (!active) return;
      pointerEvent.preventDefault();
      const { targetIndex } = cancelled ? { targetIndex: null } : targetAtPoint(pointerEvent.clientX, pointerEvent.clientY, fromIndex);
      const destination = targetIndex === null ? seatRectsRef.current.get(fromIndex) : seatRectsRef.current.get(targetIndex);
      const settleMs = destination ? settleDurationFor(pointerEvent.clientX - offsetX, pointerEvent.clientY - offsetY, destination.left, destination.top) : 440;
      setDragVisual(current => current ? { ...current, targetIndex, proximity: targetIndex === null ? 0 : 1, phase: "settling", settleLeft: destination?.left, settleTop: destination?.top, settleMs } : current);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // 与主座位板一致：落点有效时松手即提交，位移卡片与拖拽浮层同时开始移动。
      if (targetIndex !== null) commitSwap(fromIndex, targetIndex);
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        setDragVisual(null);
        setDragIndex(null);
      }, reducedMotion ? 0 : settleMs);
    };
    const handlePointerUp = (pointerEvent: PointerEvent) => finishDrag(pointerEvent, false);
    const handlePointerCancel = (pointerEvent: PointerEvent) => finishDrag(pointerEvent, true);
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel, { passive: false });
    dragCleanupRef.current = cleanup;
  }

  function seatVisualTransform(index: number) {
    if (!dragVisual || dragVisual.targetIndex === null || index === dragVisual.fromIndex) return undefined;
    // Match the main board: empty slots accept a snap without moving any seats aside.
    if (!studentById.has(candidate.order[dragVisual.targetIndex] ?? "") || !studentById.has(candidate.order[index] ?? "")) return undefined;
    const proximity = dragVisual.phase === "settling" ? 1 : dragVisual.proximity;
    if (index === dragVisual.targetIndex) {
      const push = getTargetPush(dragVisual.fromIndex, dragVisual.targetIndex, proximity);
      return `translate3d(${push.x}px, ${push.y}px, 0) scale(${1 - proximity * 0.055})`;
    }
    const rowDistance = Math.abs(Math.floor(index / COLS) - Math.floor(dragVisual.targetIndex / COLS));
    const colDistance = Math.abs(index % COLS - dragVisual.targetIndex % COLS);
    const neighborDistance = rowDistance + colDistance;
    if (neighborDistance < 1 || neighborDistance > 2) return undefined;
    const targetRect = seatRectsRef.current.get(dragVisual.targetIndex);
    const seatRect = seatRectsRef.current.get(index);
    if (!targetRect || !seatRect) return undefined;
    const dx = seatRect.left + seatRect.width / 2 - (targetRect.left + targetRect.width / 2);
    const dy = seatRect.top + seatRect.height / 2 - (targetRect.top + targetRect.height / 2);
    const length = Math.hypot(dx, dy) || 1;
    const amount = (neighborDistance === 1 ? 14 : 6) * proximity;
    return `translate3d(${dx / length * amount}px, ${dy / length * amount}px, 0)`;
  }

  const draggedStudentId = dragIndex === null ? null : candidate.order[dragIndex] ?? null;
  const draggedStudent = draggedStudentId ? studentById.get(draggedStudentId) : null;
  const overlayLeft = dragVisual?.phase === "settling" ? dragVisual.settleLeft : dragVisual ? dragVisual.pointerX - dragVisual.offsetX : 0;
  const overlayTop = dragVisual?.phase === "settling" ? dragVisual.settleTop : dragVisual ? dragVisual.pointerY - dragVisual.offsetY : 0;

  const statCards: Array<[DetailTab, string, string]> = [
    ["changed", "变动座位", `${stats.changedCount} 个`],
    ...(candidate.rotation ? [["rotation", "近期轮换", `${candidate.rotation.sameSeatStudents.length} 人重坐 · ${candidate.rotation.repeatedNeighborPairs.length} 对重搭`] as [DetailTab, string, string]] : []),
    ["required", "明确要求", stats.requiredTotal ? `${stats.requiredSatisfied}/${stats.requiredTotal} 条已满足` : "未设置"],
    ["gender", "男女搭配", `${stats.mixedGenderPairs}/${stats.occupiedPairs} 对`],
    ["complement", "互补关系", stats.complementEnabled ? `互补同桌 ${stats.complementMatchedCount} 对` : "未启用"],
    ["front", "前排要求", stats.frontTotal ? `${stats.frontSatisfied}/${stats.frontTotal} 人` : "无"],
  ];

  return (
    <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4">
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="随机排座预览" className="modal-panel-enter app-modal-panel flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden outline-none">
        <div className="flex items-start justify-between px-6 py-5 border-b border-separator-border">
          <div>
            <div className="text-caption-1-regular text-accent-500 mb-1" style={{ fontWeight: 800 }}>座位调整</div>
            <h3 className="text-text-primary" style={{ fontSize: "1.25rem", fontWeight: 800 }}>随机排座预览</h3>
            <p className="text-body-regular text-text-tertiary mt-1">可拖动交换座位，采用前不会影响当前座位。</p>
          </div>
          <button onClick={onClose} className="p-2 text-text-tertiary hover:text-text-secondary hover:bg-background-tertiary-default rounded-xl transition-colors" aria-label="关闭预览">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_19rem] gap-4 p-5 overflow-auto bg-background-secondary-default">
          <div ref={boardRef} className={`bg-background-primary-default rounded-2xl border border-separator-border shadow-sm p-4 overflow-x-auto ${dragVisual ? "select-none" : ""}`}>
{seatSettings.layout ? <SeatLayoutSurface layout={layout} renderSeat={(seat, index) => { const studentId = candidate.order[index] ?? null; const student = studentId ? studentById.get(studentId) : null; const genderColor = student?.gender === "男" ? "bg-accent-400" : student?.gender === "女" ? "bg-status-pink-400" : "bg-background-primary-disabled"; return <button key={seat.id} type="button" data-preview-seat-index={index} data-preview-student-id={student?.id} onPointerDown={event => beginPointerDrag(event, index)} onClick={() => student && onSelectStudent?.(student)} className={`h-full w-full rounded-xl border px-2 text-left transition-[background-color,border-color,box-shadow,opacity,transform] duration-300 ${student ? "border-border-button-default bg-background-primary-default" : "border-dashed border-border-button-default bg-background-secondary-default text-text-tertiary"} ${changedSet.has(index) ? "ring-2 ring-accent-100" : ""} ${dragIndex === index ? "opacity-25" : ""} ${dragVisual?.targetIndex === index ? "border-accent-400 bg-accent-50" : ""}`} style={{ transform: seatVisualTransform(index), transitionProperty: student ? undefined : "background-color, border-color, box-shadow" }} title={getSeatPositionLabel(index, seatSettings, candidate.order.length)}><span className="flex min-w-0 items-center gap-1.5"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${genderColor}`}/><span className="truncate text-body-semibold text-text-primary">{student?.name || "空"}</span></span><span className="mt-0.5 block text-[10px] text-text-tertiary">{seat.label}</span></button>; }} /> :
            <div className="grid gap-2 min-w-[760px]" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
              {Array.from({ length: rows }).map((_, row) => (
                <div key={`row-${row}`} className="col-span-8 grid gap-2 items-center" style={{ gridTemplateColumns: `3.25rem repeat(${COLS}, minmax(0, 1fr))` }}>
                  <div className="text-caption-1-regular text-text-tertiary text-right pr-1" style={{ fontWeight: 700 }}>第{row + 1}排</div>
                  {Array.from({ length: COLS }).map((__, col) => {
                    const index = row * COLS + col;
                    const studentId = candidate.order[index] ?? null;
                    const student = studentId ? studentById.get(studentId) : null;
                    const genderColor = student?.gender === "男" ? "bg-accent-400" : student?.gender === "女" ? "bg-status-pink-400" : "bg-background-primary-disabled";
                    return (
                      <button
                        key={index}
                        type="button"
                        data-preview-seat-index={index}
                        data-preview-student-id={student?.id}
                        onPointerDown={event => beginPointerDrag(event, index)}
                        onClick={event => {
                          if (dragVisual || dragIndex !== null) {
                            event.preventDefault();
                            return;
                          }
                          if (student && onSelectStudent) {
                            onSelectStudent(student);
                          }
                        }}
                        className={`h-12 rounded-xl border px-2 text-left transition-[background-color,border-color,box-shadow,opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                          student ? "bg-background-primary-default border-border-button-default hover:border-accent-200" : "bg-background-secondary-default border-dashed border-border-button-default text-text-tertiary"
                        } ${changedSet.has(index) ? "ring-2 ring-accent-100" : ""} ${dragIndex === index ? "opacity-25" : ""} ${dragVisual?.targetIndex === index ? "border-accent-400 bg-accent-50/90 shadow-[0_0_0_4px_rgba(59,130,246,0.16),0_12px_28px_rgba(37,99,235,0.14)]" : ""}`}
                        style={{ transform: seatVisualTransform(index), touchAction: "manipulation", transitionProperty: student ? undefined : "background-color, border-color, box-shadow" }}
                        title={getSeatPositionLabel(index, seatSettings, candidate.order.length)}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${genderColor}`} />
                          <span className="truncate text-body-regular text-text-primary" style={{ fontWeight: 700 }}>{student?.name || "空"}</span>
                        </span>
                        <span className="block text-[10px] text-text-tertiary mt-0.5">{row + 1}-{col + 1}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>}
          </div>

          <aside className="space-y-3">
            <div className="grid grid-cols-1 gap-2">
              {statCards.map(([key, label, value]) => (
                <PreviewStat key={key} active={activeDetail === key} label={label} value={value} onClick={() => setActiveDetail(key)} />
              ))}
            </div>
            <div className="bg-background-primary-default rounded-2xl border border-separator-border shadow-sm p-4 space-y-4 max-h-[23rem] overflow-y-auto">
              {activeDetail === "changed" && (
                <DetailBlock title="发生变化的座位">
                  {stats.changedCount ? getChangedSeatIndices(currentOrder, candidate.order).map(index => {
                    const before = currentOrder[index] ? studentById.get(currentOrder[index] as StudentId)?.name || "未知" : "空";
                    const after = candidate.order[index] ? studentById.get(candidate.order[index] as StudentId)?.name || "未知" : "空";
                    return <DetailItem key={index}>{getSeatPositionLabel(index)}：{before} → {after}</DetailItem>;
                  }) : <DetailItem>本次方案和当前座位完全一致。</DetailItem>}
                </DetailBlock>
              )}
              {activeDetail === "required" && renderRequiredDetails(candidate.evaluation)}
              {activeDetail === "gender" && renderGenderDetails(candidate.evaluation, seatSettings.pairByGender)}
              {activeDetail === "complement" && renderComplementDetails(candidate.evaluation)}
              {activeDetail === "front" && renderFrontDetails(candidate.evaluation)}
              {activeDetail === "rotation" && candidate.rotation && <>
                <DetailBlock title={`参考当前排位及 ${candidate.rotation.savedCount} 份近期快照`}>
                  <DetailItem>{candidate.rotation.sameSeatStudents.length} 人回到近期坐过的座位，{candidate.rotation.repeatedNeighborPairs.length} 对学生再次相邻。锁定座位不计入重坐。</DetailItem>
                </DetailBlock>
                <DetailBlock title="重复座位">{candidate.rotation.sameSeatStudents.length ? candidate.rotation.sameSeatStudents.map(id => <DetailItem key={id} tone="warn">{studentById.get(id)?.name || "未知学生"}</DetailItem>) : <DetailItem tone="ok">没有重坐近期座位。</DetailItem>}</DetailBlock>
                <DetailBlock title="重复相邻">{candidate.rotation.repeatedNeighborPairs.length ? candidate.rotation.repeatedNeighborPairs.map(([a, b]) => <DetailItem key={`${a}-${b}`} tone="warn">{studentById.get(a)?.name || "未知学生"}、{studentById.get(b)?.name || "未知学生"}</DetailItem>) : <DetailItem tone="ok">没有重复相邻搭配。</DetailItem>}</DetailBlock>
              </>}
            </div>
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-separator-border bg-background-primary-default">
          <button onClick={onRegenerate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border-button-default text-text-secondary hover:bg-background-secondary-default text-body-regular" style={{ fontWeight: 700 }}>
            <RefreshCw className="w-3.5 h-3.5" />再随机一次
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-border-button-default text-text-secondary hover:bg-background-secondary-default text-body-regular" style={{ fontWeight: 700 }}>取消</button>
          <button onClick={onApply} className="px-4 py-2 rounded-xl bg-accent-600 text-text-white hover:bg-accent-700 text-body-regular" style={{ fontWeight: 800 }}>采用方案</button>
        </div>
      </div>
      {dragVisual && createPortal(
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[100] overflow-hidden rounded-xl border border-accent-300 bg-background-primary-default/95 shadow-[0_18px_45px_rgba(37,99,235,0.24)] backdrop-blur-sm transition-[transform,opacity,box-shadow] ease-[cubic-bezier(0.16,1,0.3,1)] duration-150 motion-reduce:transition-none"
          style={{
            left: 0,
            top: 0,
            width: dragVisual.width,
            height: dragVisual.height,
            opacity: dragVisual.phase === "settling" ? 0.92 : 1,
            transform: `translate3d(${overlayLeft || 0}px, ${overlayTop || 0}px, 0) scale(${dragVisual.phase === "settling" ? 0.985 : 1.025})`,
            transitionDuration: dragVisual.phase === "settling" ? `${dragVisual.settleMs ?? 440}ms` : undefined,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent-50/80 via-background-primary-default to-background-secondary-default" />
          <div className="relative flex h-full min-w-0 items-center gap-2 px-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${draggedStudent?.gender === "男" ? "bg-accent-400" : draggedStudent?.gender === "女" ? "bg-status-pink-400" : "bg-background-primary-disabled"}`} />
            <span className="min-w-0 flex-1 truncate text-body-semibold text-text-primary">{draggedStudent?.name || "空"}</span>
            <span className="text-[10px] font-semibold text-accent-500">换座</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
import { SeatLayoutSurface } from "./SeatLayoutSurface";
