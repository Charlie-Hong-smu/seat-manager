import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";

import {
  getChangedSeatIndices,
  getSeatPositionLabel,
  getSeatPreviewStats,
  type SeatEvaluation,
  type ShuffleCandidate,
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

type DetailTab = "changed" | "required" | "gender" | "complement" | "front";

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
}

function PreviewStat({ active, label, value, onClick }: { active: boolean; label: string; value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
        active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-100 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      <span className="block text-xs opacity-70" style={{ fontWeight: 700 }}>{label}</span>
      <strong className="block mt-1 text-sm">{value}</strong>
    </button>
  );
}

function DetailItem({ children, tone = "muted" }: { children: React.ReactNode; tone?: "ok" | "warn" | "muted" }) {
  const className = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-100",
    warn: "bg-amber-50 text-amber-700 border-amber-100",
    muted: "bg-gray-50 text-gray-500 border-gray-100",
  }[tone];
  return <div className={`rounded-xl border px-3 py-2 text-xs ${className}`}>{children}</div>;
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-400" style={{ fontWeight: 800 }}>{title}</div>
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

  function finishSwap(fromIndex: number, targetIndex: number) {
    const sourceRect = seatRectsRef.current.get(fromIndex);
    const targetRect = seatRectsRef.current.get(targetIndex);
    const targetPush = getTargetPush(fromIndex, targetIndex, 1);
    const sourceStudentId = candidate.order[fromIndex] ?? null;
    const targetStudentId = candidate.order[targetIndex] ?? null;
    const next = [...candidate.order];
    next[fromIndex] = targetStudentId;
    next[targetIndex] = sourceStudentId;
    setDragVisual(null);
    setDragIndex(null);
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
        ], { duration: 680, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
      if (targetStudentId) {
        const startX = targetRect.left + targetPush.x - sourceRect.left;
        const startY = targetRect.top + targetPush.y - sourceRect.top;
        const arcX = Math.abs(startY) > Math.abs(startX) ? 7 : 0;
        const arcY = Math.abs(startX) >= Math.abs(startY) ? -6 : 0;
        cards.find(card => card.dataset.previewStudentId === targetStudentId)?.animate([
          { offset: 0, opacity: 0.86, transform: `translate3d(${startX}px, ${startY}px, 0) scale(0.945)` },
          { offset: 0.2, opacity: 1, transform: `translate3d(${startX * 0.92 + arcX * 0.35}px, ${startY * 0.92 + arcY * 0.35}px, 0) scale(0.965)` },
          { offset: 0.72, opacity: 1, transform: `translate3d(${startX * 0.2 + arcX}px, ${startY * 0.2 + arcY}px, 0) scale(1.008)` },
          { offset: 1, opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
        ], { duration: 1180, easing: "cubic-bezier(0.45, 0, 0.15, 1)" });
      }
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
      setDragVisual(current => current ? { ...current, targetIndex, proximity: targetIndex === null ? 0 : 1, phase: "settling", settleLeft: destination?.left, settleTop: destination?.top } : current);
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (targetIndex === null) {
          setDragVisual(null);
          setDragIndex(null);
        } else {
          finishSwap(fromIndex, targetIndex);
        }
      }, reducedMotion ? 0 : targetIndex === null ? 420 : 440);
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
    ["required", "明确要求", stats.requiredTotal ? `${stats.requiredSatisfied}/${stats.requiredTotal} 条已满足` : "未设置"],
    ["gender", "男女搭配", `${stats.mixedGenderPairs}/${stats.occupiedPairs} 对`],
    ["complement", "互补关系", stats.complementEnabled ? `互补同桌 ${stats.complementMatchedCount} 对` : "未启用"],
    ["front", "前排要求", stats.frontTotal ? `${stats.frontSatisfied}/${stats.frontTotal} 人` : "无"],
  ];

  return (
    <div className="soft-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
      <div ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="随机排座预览" className="modal-panel-enter flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white bg-white shadow-2xl outline-none">
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <div className="text-xs text-blue-500 mb-1" style={{ fontWeight: 800 }}>座位调整</div>
            <h3 className="text-gray-900" style={{ fontSize: "1.25rem", fontWeight: 800 }}>随机排座预览</h3>
            <p className="text-sm text-gray-400 mt-1">可拖动交换座位，采用前不会影响当前座位。</p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors" aria-label="关闭预览">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_19rem] gap-4 p-5 overflow-auto bg-gray-50">
          <div ref={boardRef} className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-4 overflow-x-auto ${dragVisual ? "select-none" : ""}`}>
{seatSettings.layout ? <SeatLayoutSurface layout={layout} renderSeat={(seat, index) => { const studentId = candidate.order[index] ?? null; const student = studentId ? studentById.get(studentId) : null; const genderColor = student?.gender === "男" ? "bg-blue-400" : student?.gender === "女" ? "bg-pink-400" : "bg-gray-300"; return <button key={seat.id} type="button" data-preview-seat-index={index} data-preview-student-id={student?.id} onPointerDown={event => beginPointerDrag(event, index)} onClick={() => student && onSelectStudent?.(student)} className={`h-full w-full rounded-xl border px-2 text-left transition-[background-color,border-color,box-shadow,opacity,transform] duration-300 ${student ? "border-gray-200 bg-white" : "border-dashed border-gray-200 bg-gray-50 text-gray-300"} ${changedSet.has(index) ? "ring-2 ring-blue-100" : ""} ${dragIndex === index ? "opacity-25" : ""} ${dragVisual?.targetIndex === index ? "border-blue-400 bg-blue-50" : ""}`} style={{ transform: seatVisualTransform(index), transitionProperty: student ? undefined : "background-color, border-color, box-shadow" }} title={getSeatPositionLabel(index, seatSettings, candidate.order.length)}><span className="flex min-w-0 items-center gap-1.5"><span className={`h-1.5 w-1.5 shrink-0 rounded-full ${genderColor}`}/><span className="truncate text-sm font-bold text-gray-800">{student?.name || "空"}</span></span><span className="mt-0.5 block text-[10px] text-gray-300">{seat.label}</span></button>; }} /> :
            <div className="grid gap-2 min-w-[760px]" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
              {Array.from({ length: rows }).map((_, row) => (
                <div key={`row-${row}`} className="col-span-8 grid gap-2 items-center" style={{ gridTemplateColumns: `3.25rem repeat(${COLS}, minmax(0, 1fr))` }}>
                  <div className="text-xs text-gray-400 text-right pr-1" style={{ fontWeight: 700 }}>第{row + 1}排</div>
                  {Array.from({ length: COLS }).map((__, col) => {
                    const index = row * COLS + col;
                    const studentId = candidate.order[index] ?? null;
                    const student = studentId ? studentById.get(studentId) : null;
                    const genderColor = student?.gender === "男" ? "bg-blue-400" : student?.gender === "女" ? "bg-pink-400" : "bg-gray-300";
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
                          student ? "bg-white border-gray-200 hover:border-blue-200" : "bg-gray-50 border-dashed border-gray-200 text-gray-300"
                        } ${changedSet.has(index) ? "ring-2 ring-blue-100" : ""} ${dragIndex === index ? "opacity-25" : ""} ${dragVisual?.targetIndex === index ? "border-blue-400 bg-blue-50/90 shadow-[0_0_0_4px_rgba(59,130,246,0.16),0_12px_28px_rgba(37,99,235,0.14)]" : ""}`}
                        style={{ transform: seatVisualTransform(index), touchAction: "manipulation", transitionProperty: student ? undefined : "background-color, border-color, box-shadow" }}
                        title={getSeatPositionLabel(index, seatSettings, candidate.order.length)}
                      >
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${genderColor}`} />
                          <span className="truncate text-sm text-gray-800" style={{ fontWeight: 700 }}>{student?.name || "空"}</span>
                        </span>
                        <span className="block text-[10px] text-gray-300 mt-0.5">{row + 1}-{col + 1}</span>
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
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4 max-h-[23rem] overflow-y-auto">
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
            </div>
          </aside>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-white">
          <button onClick={onRegenerate} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm" style={{ fontWeight: 700 }}>
            <RefreshCw className="w-3.5 h-3.5" />再随机一次
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 text-sm" style={{ fontWeight: 700 }}>取消</button>
          <button onClick={onApply} className="px-4 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-sm" style={{ fontWeight: 800 }}>采用方案</button>
        </div>
      </div>
      {dragVisual && createPortal(
        <div
          aria-hidden="true"
          className={`pointer-events-none fixed z-[100] overflow-hidden rounded-xl border border-blue-300 bg-white/95 shadow-[0_18px_45px_rgba(37,99,235,0.24)] backdrop-blur-sm transition-[transform,opacity,box-shadow] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${dragVisual.phase === "settling" ? "duration-[440ms]" : "duration-150"}`}
          style={{
            left: 0,
            top: 0,
            width: dragVisual.width,
            height: dragVisual.height,
            opacity: dragVisual.phase === "settling" ? 0.92 : 1,
            transform: `translate3d(${overlayLeft || 0}px, ${overlayTop || 0}px, 0) scale(${dragVisual.phase === "settling" ? 0.985 : 1.025})`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-white to-violet-50/60" />
          <div className="relative flex h-full min-w-0 items-center gap-2 px-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${draggedStudent?.gender === "男" ? "bg-blue-400" : draggedStudent?.gender === "女" ? "bg-pink-400" : "bg-gray-300"}`} />
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{draggedStudent?.name || "空"}</span>
            <span className="text-[10px] font-semibold text-blue-500">换座</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
import { SeatLayoutSurface } from "./SeatLayoutSurface";
