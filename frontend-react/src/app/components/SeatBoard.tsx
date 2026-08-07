import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Lock, Star, UserRoundPlus, Users } from "lucide-react";
import type { AppStudent, SeatSettings, StudentId } from "../state/types";
import { resolveSeatLayout } from "../state/seatLayout";

interface Props {
  cardMode: "compact" | "detail";
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  onSelectStudent: (student: AppStudent) => void;
  onOpenStudentFollowup?: (student: AppStudent) => void;
  onMoveSeat: (fromIndex: number, toIndex: number) => void;
  onMoveStudentToWaiting: (fromIndex: number) => void;
  lockedSeats: Set<number>;
  onToggleLock: (idx: number) => void;
  seatSettings: SeatSettings;
  onAssignStudentToSeat: (studentId: StudentId, seatIndex: number) => void;
}

const COLS = 8;

interface SeatRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface DragVisualState {
  sourceType: "seat" | "waiting";
  studentId: StudentId;
  fromIndex: number | null;
  targetIndex: number | null;
  waitingTarget: boolean;
  pointerX: number;
  pointerY: number;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  proximity: number;
  phase: "dragging" | "holding" | "settling";
}

const WAITING_CARD_WIDTH = 64;
const WAITING_CARD_HEIGHT = 36;
const DRAG_SETTLE_MS = 220;

function compactWaitingName(name: string) {
  const characters = Array.from(name.trim()).slice(0, 4);
  return characters.length === 4
    ? [characters.slice(0, 2).join(""), characters.slice(2).join("")]
    : [characters.join("")];
}

// memo：拖拽时 dragVisual 每帧变化触发 SeatBoard 重渲染，
// 未受影响的座位卡必须跳过（props 全部保持稳定值/稳定引用）。
const SeatCard = memo(function SeatCard({
  studentId,
  studentById,
  seatIndex,
  isLocked,
  isDragging,
  isDropTarget,
  dragActive,
  visualTransform,
  cardMode,
  onSelect,
  onPointerDragStart,
  onToggleLock,
}: {
  studentId: StudentId | null;
  studentById: Map<StudentId, AppStudent>;
  seatIndex: number;
  isLocked: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  dragActive: boolean;
  visualTransform?: string;
  cardMode: "compact" | "detail";
  onSelect: (s: AppStudent) => void;
  onPointerDragStart: (event: ReactPointerEvent<HTMLElement>, seatIndex: number) => void;
  onToggleLock: (idx: number) => void;
}) {
  const student = studentId ? studentById.get(studentId) : null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (student) {
        onSelect(student);
      }
    }
  }

  const row = Math.floor(seatIndex / COLS) + 1;
  const col = (seatIndex % COLS) + 1;

  if (!studentId || !student) {
    return (
      <div
        data-seat-index={seatIndex}
        data-seat-locked={isLocked ? "true" : "false"}
        className={`seat-card-enter relative h-full min-h-0 overflow-hidden rounded-xl border border-dashed text-xs text-gray-300 select-none transition-[background-color,border-color,box-shadow] duration-200 ${isLocked ? "border-amber-200 bg-amber-50/30" : "border-gray-200/80 bg-transparent hover:border-blue-200 hover:bg-blue-50/30"} ${isDropTarget ? "border-blue-400 bg-blue-50/80 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]" : ""}`}
        style={{ animationDelay: `${Math.min(seatIndex, 12) * 10}ms`, transform: visualTransform }}
      >
        <span className={`absolute inset-0 grid place-items-center transition-[opacity,transform] duration-200 ease-out ${cardMode === "compact" ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"}`}>空</span>
        <span className={`absolute inset-0 grid place-items-center text-gray-300 transition-[opacity,transform] duration-200 ease-out ${cardMode === "detail" ? "scale-100 opacity-100 delay-100" : "pointer-events-none scale-105 opacity-0 delay-0"}`}>{row}-{col}</span>
      </div>
    );
  }

  const genderDot = student.gender === "男" ? "bg-blue-400" : student.gender === "女" ? "bg-pink-400" : "bg-gray-300";
  const hasTags = student.academicTags.length > 0;
  const visibleTags = student.academicTags.slice(0, 2);
  const hiddenTagCount = Math.max(0, student.academicTags.length - visibleTags.length);

  return (
    <div
      role="button"
      tabIndex={0}
      data-seat-index={seatIndex}
      data-seat-locked={isLocked ? "true" : "false"}
      data-student-id={student.id}
      onClick={event => {
        if (dragActive || isDragging) {
          event.preventDefault();
          return;
        }
        onSelect(student);
      }}
      onKeyDown={handleKeyDown}
      onPointerDown={event => {
        if (!isLocked) onPointerDragStart(event, seatIndex);
      }}
      className={`seat-card-enter relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-[var(--app-surface-muted)] text-left group ring-1 ring-inset transition-[background-color,box-shadow,opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-px hover:bg-white hover:shadow-[var(--app-shadow-card)] cursor-pointer ${
        isLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${isLocked ? "bg-amber-50/50 ring-amber-300" : "ring-gray-200/80"} ${isDragging ? "opacity-25 ring-2 ring-blue-200" : ""} ${isDropTarget ? "bg-blue-50/90 ring-2 ring-blue-400 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]" : ""}`}
      style={{ animationDelay: `${Math.min(seatIndex, 12) * 10}ms`, transform: visualTransform, touchAction: "manipulation" }}
    >
      {/* Lock toggle */}
      <button
        type="button"
        aria-label={isLocked ? `解锁 ${student.name} 的座位` : `锁定 ${student.name} 的座位`}
        onClick={e => { e.stopPropagation(); onToggleLock(seatIndex); }}
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        title={isLocked ? "解锁座位" : "锁定座位"}
        className={`absolute top-0.5 right-0.5 z-10 grid h-5 w-5 place-items-center rounded-md transition-opacity hover:bg-gray-100 ${isLocked ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <Lock className={`h-3 w-3 ${isLocked ? "text-amber-400" : "text-gray-300"}`} />
      </button>

      {/* 姓名始终只渲染一份，模式切换时从垂直居中平滑移动到卡片顶部。 */}
      <div className={`absolute left-2.5 right-2.5 flex min-w-0 items-center gap-1.5 transition-[top] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${cardMode === "compact" ? "top-[13px]" : "top-2"}`}>
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${genderDot}`} title={student.gender || "未知"} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">{student.name}</span>
        <span className={`shrink-0 text-[10px] tabular-nums text-gray-300 transition-[opacity,transform] duration-200 ${cardMode === "detail" ? "translate-x-0 opacity-100 delay-100" : "pointer-events-none translate-x-1 opacity-0 delay-0"}`}>{row}-{col}</span>
      </div>

      {/* 次要信息在卡片接近展开后再淡入，避免高度动画中途反复裁切。 */}
      <div aria-hidden={cardMode !== "detail"} inert={cardMode !== "detail" ? true : undefined} className={`absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${cardMode === "detail" ? "translate-y-0 opacity-100 delay-100" : "pointer-events-none translate-y-1 opacity-0 delay-0"}`}>
          {hasTags ? (
            <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap">
              {visibleTags.map(tag => {
                const isStrong = tag.endsWith("强");
                return (
                  <span
                    key={tag}
                    className={`max-w-[4.5rem] shrink truncate rounded-full border px-1.5 py-0.5 text-[10px] ${isStrong ? "border-emerald-100 bg-emerald-50 text-emerald-600" : "border-red-100 bg-red-50 text-red-400"}`}
                    style={{ fontWeight: 600 }}
                  >
                    {tag}
                  </span>
                );
              })}
              {hiddenTagCount > 0 && <span className="shrink-0 text-[10px] text-gray-400">+{hiddenTagCount}</span>}
            </div>
          ) : (
            <span className="text-[10px] text-gray-300">—</span>
          )}
      </div>
    </div>
  );
});

export function SeatBoard({ cardMode, students, seatOrder, seatSettings, onSelectStudent, onMoveSeat, onMoveStudentToWaiting, onAssignStudentToSeat, lockedSeats, onToggleLock }: Props) {
  const [draggingSeat, setDraggingSeat] = useState<number | null>(null);
  const [dragVisual, setDragVisual] = useState<DragVisualState | null>(null);
  const [waitingDockOpen, setWaitingDockOpen] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const waitingDockBarRef = useRef<HTMLDivElement>(null);
  const waitingDockRevealRef = useRef<HTMLDivElement>(null);
  const waitingDockListRef = useRef<HTMLDivElement>(null);
  const seatRectsRef = useRef(new Map<number, SeatRect>());
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const suppressWaitingClickRef = useRef<StudentId | null>(null);
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const layout = useMemo(() => resolveSeatLayout(seatSettings.layout, seatOrder.length), [seatOrder.length, seatSettings.layout]);
  const seatedIds = useMemo(() => new Set(seatOrder.filter((id): id is StudentId => Boolean(id))), [seatOrder]);
  const waitingStudents = useMemo(() => students.filter(student => !seatedIds.has(student.id)), [seatedIds, students]);
  const previousWaitingCountRef = useRef(waitingStudents.length);
  const [pendingStudentId, setPendingStudentId] = useState<StudentId | null>(null);
  const rowCount = Math.ceil(seatOrder.length / COLS);

  const rows = useMemo(() => Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      seatIndex: r * COLS + c,
      studentId: seatOrder[r * COLS + c] ?? null,
    }))
  ), [rowCount, seatOrder]);

  // Groups: [0,1] [2,3] [4,5] [6,7]
  const groups = [
    [0, 1], [2, 3], [4, 5], [6, 7],
  ];

  useEffect(() => () => {
    dragCleanupRef.current?.();
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

  useEffect(() => {
    const previousCount = previousWaitingCountRef.current;
    if (waitingStudents.length === 0) {
      setWaitingDockOpen(false);
      setPendingStudentId(null);
    } else if (previousCount === 0) {
      setWaitingDockOpen(true);
    }
    previousWaitingCountRef.current = waitingStudents.length;
  }, [waitingStudents.length]);

  function readSeatRects(): Map<number, SeatRect> {
    const next = new Map<number, SeatRect>();
    boardRef.current?.querySelectorAll<HTMLElement>("[data-seat-index]").forEach(element => {
      const seatIndex = Number(element.dataset.seatIndex);
      if (!Number.isInteger(seatIndex) || next.has(seatIndex)) return;
      const rect = element.getBoundingClientRect();
      next.set(seatIndex, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    });
    return next;
  }

  function targetAtPoint(clientX: number, clientY: number, fromIndex: number | null, emptyOnly = false) {
    let nearest: { targetIndex: number; proximity: number; distance: number } | null = null;
    for (const [targetIndex, rect] of seatRectsRef.current) {
      if (targetIndex === fromIndex || lockedSeats.has(targetIndex) || (emptyOnly && seatOrder[targetIndex] !== null)) continue;
      // 边缘多给几个像素的感应区，让推开从“靠近”开始，而不是进入卡片后突然发生。
      const influencePadding = 48;
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

  function waitingDockBounds() {
    const bar = waitingDockBarRef.current?.getBoundingClientRect();
    if (!bar) return null;
    const reveal = waitingDockRevealRef.current?.getBoundingClientRect();
    const includeReveal = reveal && reveal.width > 1;
    const left = includeReveal ? Math.min(bar.left, reveal.left) : bar.left;
    const top = includeReveal ? Math.min(bar.top, reveal.top) : bar.top;
    const right = includeReveal ? Math.max(bar.right, reveal.right) : bar.right;
    const bottom = includeReveal ? Math.max(bar.bottom, reveal.bottom) : bar.bottom;
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function pointIsNearWaitingDock(clientX: number, clientY: number, buffer = 56) {
    const bounds = waitingDockBounds();
    if (!bounds) return false;
    return clientX >= bounds.left - buffer
      && clientX <= bounds.right + buffer
      && clientY >= bounds.top - buffer
      && clientY <= bounds.bottom + buffer;
  }

  function pointIsInsideWaitingDock(clientX: number, clientY: number) {
    return pointIsNearWaitingDock(clientX, clientY, 0);
  }

  function getTargetPush(fromIndex: number, targetIndex: number, proximity: number) {
    const sourceRect = seatRectsRef.current.get(fromIndex);
    const targetRect = seatRectsRef.current.get(targetIndex);
    if (!sourceRect || !targetRect) return { x: 0, y: 0 };
    const dx = targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
    const dy = targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2);
    const length = Math.hypot(dx, dy) || 1;
    const horizontalMove = Math.abs(dx) >= Math.abs(dy);
    const availableExtent = horizontalMove ? targetRect.width : targetRect.height;
    const pushRatio = horizontalMove ? 0.74 : 1;
    const amount = Math.min(horizontalMove ? 84 : 62, availableExtent * pushRatio) * proximity;
    return { x: dx / length * amount, y: dy / length * amount };
  }

  function animateCompletedSwap(fromIndex: number, targetIndex: number, sourceStudentId: StudentId, targetStudentId: StudentId | null) {
    const sourceRect = seatRectsRef.current.get(fromIndex);
    const targetRect = seatRectsRef.current.get(targetIndex);
    const targetPush = getTargetPush(fromIndex, targetIndex, 1);
    setDragVisual(null);
    setDraggingSeat(null);
    onMoveSeat(fromIndex, targetIndex);
    if (!sourceRect || !targetRect || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const cards = Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-student-id]") || []);
      const sourceCard = cards.find(card => card.dataset.studentId === sourceStudentId);
      sourceCard?.animate([
        { opacity: 0.35, transform: "scale(0.96)" },
        { opacity: 1, transform: "scale(1)" },
      ], { duration: 680, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });

      if (targetStudentId) {
        const targetCard = cards.find(card => card.dataset.studentId === targetStudentId);
        const startX = targetRect.left + targetPush.x - sourceRect.left;
        const startY = targetRect.top + targetPush.y - sourceRect.top;
        const arcX = Math.abs(startY) > Math.abs(startX) ? 7 : 0;
        const arcY = Math.abs(startX) >= Math.abs(startY) ? -6 : 0;
        targetCard?.animate([
          { offset: 0, opacity: 0.86, transform: `translate3d(${startX}px, ${startY}px, 0) scale(0.945)` },
          { offset: 0.2, opacity: 1, transform: `translate3d(${startX * 0.92 + arcX * 0.35}px, ${startY * 0.92 + arcY * 0.35}px, 0) scale(0.965)` },
          { offset: 0.72, opacity: 1, transform: `translate3d(${startX * 0.2 + arcX}px, ${startY * 0.2 + arcY}px, 0) scale(1.008)` },
          { offset: 1, opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
        ], { duration: 680, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
      }
    }));
  }

  // memo 的 SeatCard 需要稳定的回调身份；ref 转发保证拿到的始终是最新闭包。
  const beginSeatPointerDragRef = useRef<(event: ReactPointerEvent<HTMLElement>, fromIndex: number) => void>(() => {});
  const beginWaitingPointerDragRef = useRef<(event: ReactPointerEvent<HTMLElement>, studentId: StudentId) => void>(() => {});
  const handleSeatPointerDrag = useCallback((event: ReactPointerEvent<HTMLElement>, fromIndex: number) => beginSeatPointerDragRef.current(event, fromIndex), []);
  const handleWaitingPointerDrag = useCallback((event: ReactPointerEvent<HTMLElement>, studentId: StudentId) => beginWaitingPointerDragRef.current(event, studentId), []);
  beginSeatPointerDragRef.current = (event, fromIndex) => {
    const studentId = seatOrder[fromIndex];
    if (studentId) beginStudentPointerDrag(event, { sourceType: "seat", studentId, fromIndex });
  };
  beginWaitingPointerDragRef.current = (event, studentId) => beginStudentPointerDrag(event, { sourceType: "waiting", studentId, fromIndex: null });

  function beginStudentPointerDrag(
    event: ReactPointerEvent<HTMLElement>,
    source: { sourceType: "seat" | "waiting"; studentId: StudentId; fromIndex: number | null },
  ) {
    if (event.button !== 0 || dragVisual && dragVisual.phase !== "dragging" || (source.fromIndex !== null && lockedSeats.has(source.fromIndex))) return;
    dragCleanupRef.current?.();
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const sourceElement = event.currentTarget;
    const sourceRect = sourceElement.getBoundingClientRect();
    const anchorX = sourceRect.width > 0 ? Math.min(1, Math.max(0, (startX - sourceRect.left) / sourceRect.width)) : 0.5;
    const anchorY = sourceRect.height > 0 ? Math.min(1, Math.max(0, (startY - sourceRect.top) / sourceRect.height)) : 0.5;
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
        setDraggingSeat(source.fromIndex);
        setPendingStudentId(null);
        if (source.sourceType === "waiting") suppressWaitingClickRef.current = source.studentId;
      }
      pointerEvent.preventDefault();
      const waitingTarget = source.sourceType === "seat" && pointIsNearWaitingDock(pointerEvent.clientX, pointerEvent.clientY);
      const { targetIndex, proximity } = waitingTarget
        ? { targetIndex: null, proximity: 0 }
        : targetAtPoint(pointerEvent.clientX, pointerEvent.clientY, source.fromIndex, source.sourceType === "waiting");
      const targetRect = targetIndex === null ? null : seatRectsRef.current.get(targetIndex);
      const waitingShape = waitingTarget || (source.sourceType === "waiting" && targetIndex === null);
      setDragVisual({
        ...source,
        targetIndex,
        waitingTarget,
        pointerX: pointerEvent.clientX,
        pointerY: pointerEvent.clientY,
        anchorX,
        anchorY,
        width: waitingShape ? WAITING_CARD_WIDTH : (targetRect?.width ?? sourceRect.width),
        height: waitingShape ? WAITING_CARD_HEIGHT : (targetRect?.height ?? sourceRect.height),
        proximity,
        phase: "dragging",
      });
    };

    const finishDrag = (pointerEvent: PointerEvent, cancelled: boolean) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      if (!active) return;
      pointerEvent.preventDefault();
      const waitingTarget = source.sourceType === "seat" && !cancelled && pointIsInsideWaitingDock(pointerEvent.clientX, pointerEvent.clientY);
      const { targetIndex } = cancelled || waitingTarget
        ? { targetIndex: null }
        : targetAtPoint(pointerEvent.clientX, pointerEvent.clientY, source.fromIndex, source.sourceType === "waiting");
      const validSeatTarget = targetIndex !== null;
      const targetRect = validSeatTarget ? seatRectsRef.current.get(targetIndex) : null;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (waitingTarget && source.fromIndex !== null) {
        // 松手时先留在当前指针位置，等真实等待卡渲染并完成横向滚动后，再执行唯一一次吸附。
        setDragVisual(current => current ? {
          ...current,
          targetIndex: null,
          waitingTarget: true,
          proximity: 0,
          phase: "holding",
          pointerX: pointerEvent.clientX,
          pointerY: pointerEvent.clientY,
          width: WAITING_CARD_WIDTH,
          height: WAITING_CARD_HEIGHT,
        } : current);
        setWaitingDockOpen(true);
        setPendingStudentId(null);
        onMoveStudentToWaiting(source.fromIndex);
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          const waitingList = waitingDockListRef.current;
          if (waitingList) waitingList.scrollLeft = waitingList.scrollWidth;
          const waitingCard = Array.from(document.querySelectorAll<HTMLElement>("[data-waiting-student-id]"))
            .find(element => element.dataset.waitingStudentId === source.studentId);
          const fallbackRect = waitingDockBarRef.current?.getBoundingClientRect();
          const measuredRect = waitingCard?.getBoundingClientRect();
          const settledRect = measuredRect ?? (fallbackRect ? {
            left: fallbackRect.left + 12,
            top: fallbackRect.top + (fallbackRect.height - WAITING_CARD_HEIGHT) / 2,
            width: WAITING_CARD_WIDTH,
            height: WAITING_CARD_HEIGHT,
          } : null);
          if (!settledRect) {
            setDragVisual(null);
            setDraggingSeat(null);
            return;
          }
          setDragVisual(current => current?.studentId === source.studentId && current.phase === "holding" ? {
            ...current,
            phase: "settling",
            pointerX: settledRect.left + settledRect.width * anchorX,
            pointerY: settledRect.top + settledRect.height * anchorY,
            width: settledRect.width,
            height: settledRect.height,
          } : current);
          settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            setDragVisual(null);
            setDraggingSeat(null);
          }, reducedMotion ? 0 : DRAG_SETTLE_MS);
        }));
        return;
      }

      const destinationRect = targetRect ?? sourceRect;
      setDragVisual(current => current ? {
        ...current,
        targetIndex,
        waitingTarget: false,
        proximity: targetIndex === null ? 0 : 1,
        phase: "settling",
        pointerX: destinationRect.left + destinationRect.width * anchorX,
        pointerY: destinationRect.top + destinationRect.height * anchorY,
        width: source.sourceType === "waiting" && !validSeatTarget ? WAITING_CARD_WIDTH : destinationRect.width,
        height: source.sourceType === "waiting" && !validSeatTarget ? WAITING_CARD_HEIGHT : destinationRect.height,
      } : current);

      if (source.sourceType === "waiting" && validSeatTarget) {
        onAssignStudentToSeat(source.studentId, targetIndex);
        setPendingStudentId(null);
      }

      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (source.sourceType === "waiting") {
          setDragVisual(null);
          setDraggingSeat(null);
          window.setTimeout(() => {
            if (suppressWaitingClickRef.current === source.studentId) suppressWaitingClickRef.current = null;
          }, 0);
          return;
        }
        if (targetIndex === null) {
          setDragVisual(null);
          setDraggingSeat(null);
          return;
        }
        if (source.fromIndex === null) return;
        animateCompletedSwap(source.fromIndex, targetIndex, source.studentId, seatOrder[targetIndex] || null);
      }, reducedMotion ? 0 : DRAG_SETTLE_MS);
    };

    const handlePointerUp = (pointerEvent: PointerEvent) => finishDrag(pointerEvent, false);
    const handlePointerCancel = (pointerEvent: PointerEvent) => finishDrag(pointerEvent, true);
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel, { passive: false });
    dragCleanupRef.current = cleanup;
  }

  function seatVisualTransform(seatIndex: number): string | undefined {
    if (!dragVisual || dragVisual.sourceType !== "seat" || dragVisual.fromIndex === null || dragVisual.targetIndex === null || seatIndex === dragVisual.fromIndex) return undefined;
    const proximity = dragVisual.phase === "settling" ? 1 : dragVisual.proximity;
    if (seatIndex === dragVisual.targetIndex) {
      const push = getTargetPush(dragVisual.fromIndex, dragVisual.targetIndex, proximity);
      return `translate3d(${push.x}px, ${push.y}px, 0) scale(${1 - proximity * 0.055})`;
    }
    const rowDistance = Math.abs(Math.floor(seatIndex / COLS) - Math.floor(dragVisual.targetIndex / COLS));
    const colDistance = Math.abs(seatIndex % COLS - dragVisual.targetIndex % COLS);
    const neighborDistance = rowDistance + colDistance;
    if (neighborDistance < 1 || neighborDistance > 2) return undefined;
    const targetRect = seatRectsRef.current.get(dragVisual.targetIndex);
    const seatRect = seatRectsRef.current.get(seatIndex);
    if (!targetRect || !seatRect) return undefined;
    const dx = seatRect.left + seatRect.width / 2 - (targetRect.left + targetRect.width / 2);
    const dy = seatRect.top + seatRect.height / 2 - (targetRect.top + targetRect.height / 2);
    const length = Math.hypot(dx, dy) || 1;
    const amount = (neighborDistance === 1 ? 18 : 7) * proximity;
    return `translate3d(${dx / length * amount}px, ${dy / length * amount}px, 0)`;
  }

  const draggedStudent = dragVisual ? studentById.get(dragVisual.studentId) : null;
  const waitingShape = dragVisual?.waitingTarget || (dragVisual?.sourceType === "waiting" && dragVisual.targetIndex === null);

  const dragOverlay = dragVisual && draggedStudent ? createPortal(
    <div
      aria-hidden="true"
      className="seat-student-morph pointer-events-none fixed z-[100] overflow-hidden border bg-white/95 shadow-[var(--app-shadow-float)] backdrop-blur-sm motion-reduce:transition-none"
      data-drag-phase={dragVisual.phase}
      data-drag-shape={waitingShape ? "waiting" : "seat"}
      data-drag-student-id={dragVisual.studentId}
      style={{
        left: 0,
        top: 0,
        width: dragVisual.width,
        height: dragVisual.height,
        transform: `translate3d(${dragVisual.pointerX}px, ${dragVisual.pointerY}px, 0) translate(${-dragVisual.anchorX * 100}%, ${-dragVisual.anchorY * 100}%)`,
      }}
    >
      <div className="seat-student-morph__seat absolute inset-0 flex min-w-0 items-center gap-2 px-3">
        <span className={`h-2 w-2 shrink-0 rounded-full ${draggedStudent.gender === "男" ? "bg-blue-400" : draggedStudent.gender === "女" ? "bg-pink-400" : "bg-gray-300"}`} />
        <span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{draggedStudent.name}</span>
      </div>
      <span className="seat-student-morph__waiting absolute inset-0 grid place-content-center text-center text-xs font-bold text-gray-900">
        {compactWaitingName(draggedStudent.name).map(line => <span key={line}>{line}</span>)}
      </span>
    </div>, document.body
  ) : null;

  if (!students.length) {
    return <div className="grid h-full min-h-80 place-items-center rounded-[var(--app-radius-lg)] border border-dashed border-[var(--app-border)] bg-[var(--app-surface-muted)] px-6 text-center"><div><p className="text-base font-bold text-[var(--app-text)]">还没有学生可以排座</p><p className="mt-2 text-sm text-[var(--app-text-muted)]">请先到“数据管理”导入名单，或在学生管理中添加学生。</p></div></div>;
  }

  const waitingDockExpanded = waitingDockOpen || Boolean(dragVisual?.waitingTarget);
  const pendingStudent = pendingStudentId ? studentById.get(pendingStudentId) : null;

  function assignWaitingStudentToSeat(studentId: StudentId, seatIndex: number) {
    onAssignStudentToSeat(studentId, seatIndex);
    setPendingStudentId(null);
    if (waitingStudents.length <= 1 && waitingStudents.some(student => student.id === studentId)) {
      setWaitingDockOpen(false);
    }
  }

  // 默认只占一枚紧凑入口；手动展开或已入座学生拖近时，以悬浮层显示待排名单，不挤压座位网格。
  const waitingSection = (
    <section
      aria-label="待排学生"
      className="seat-waiting-dock shrink-0 self-start"
      data-expanded={waitingDockExpanded ? "true" : "false"}
      data-drop-active={dragVisual?.waitingTarget ? "true" : "false"}
    >
      <div ref={waitingDockBarRef} className="seat-waiting-dock__bar">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-xs font-bold text-[var(--app-text)]">
          <Users className="h-4 w-4 shrink-0 text-[var(--app-text-muted)]" />
          <span className="truncate">等待区</span>
          <span className="seat-waiting-dock__count tabular-nums">{waitingStudents.length}</span>
        </div>
        <button
          type="button"
          aria-expanded={waitingDockExpanded}
          aria-controls="seat-waiting-dock-reveal"
          aria-label={waitingDockExpanded ? "收起等待区" : "展开等待区"}
          onClick={() => setWaitingDockOpen(value => !value)}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--app-radius-sm)] text-[var(--app-text-muted)] transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25"
        >
          <ChevronDown className="seat-waiting-dock__chevron h-4 w-4" />
        </button>
      </div>
      <div
        ref={waitingDockRevealRef}
        id="seat-waiting-dock-reveal"
        aria-hidden={!waitingDockExpanded}
        inert={!waitingDockExpanded ? true : undefined}
        className="seat-waiting-dock__reveal"
      >
        <div className="seat-waiting-dock__inner">
          <div className="seat-waiting-dock__cue">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-dashed border-gray-300 text-[var(--app-text-muted)]">
              <UserRoundPlus className="h-4 w-4" />
            </span>
            <div className="min-w-0 truncate text-[11px] font-bold text-[var(--app-text)]">
              {dragVisual?.waitingTarget ? "松开移入，原座位留空" : pendingStudent ? `为 ${pendingStudent.name} 选座位` : waitingStudents.length > 0 ? `${waitingStudents.length} 人等待，可拖回座位` : "把未锁定学生拖到这里"}
            </div>
          </div>
          {waitingStudents.length > 0 && (
            <div ref={waitingDockListRef} className="seat-waiting-dock__list">
              {waitingStudents.map(student => (
                <button
                  key={student.id}
                  type="button"
                  data-waiting-student-id={student.id}
                  aria-pressed={pendingStudentId === student.id}
                  aria-label={`等待学生 ${student.name}，拖至座位或点击选择座位`}
                  onPointerDown={event => handleWaitingPointerDrag(event, student.id)}
                  onClick={event => {
                    if (suppressWaitingClickRef.current === student.id || dragVisual?.studentId === student.id) {
                      event.preventDefault();
                      return;
                    }
                    setPendingStudentId(current => current === student.id ? null : student.id);
                  }}
                  className={`seat-waiting-person shrink-0 border text-center text-xs transition-[background-color,border-color,box-shadow,opacity] ${pendingStudentId === student.id ? "border-blue-400 bg-blue-50 text-blue-800 shadow-[0_0_0_3px_rgba(59,130,246,0.10)]" : "border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text)] hover:border-gray-300 hover:bg-white"} ${dragVisual?.studentId === student.id ? "pointer-events-none opacity-0" : ""}`}
                >
                  {compactWaitingName(student.name).map(line => <span key={line}>{line}</span>)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );

  if (seatSettings.layout) {
    return <div className="flex h-full min-h-0 flex-col gap-3">
      <div ref={boardRef} className={`relative min-h-[420px] flex-1 overflow-auto rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] ${dragVisual ? "select-none" : ""}`}>
        <div className="relative mx-auto h-full min-h-[520px] min-w-[760px]" style={{ aspectRatio: `${layout.canvas.width}/${layout.canvas.height}` }}>
          <div className={`absolute z-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ${layout.frontEdge === "top" ? "left-1/2 top-2 -translate-x-1/2" : layout.frontEdge === "bottom" ? "bottom-2 left-1/2 -translate-x-1/2" : layout.frontEdge === "left" ? "left-2 top-1/2 -translate-y-1/2 -rotate-90" : "right-2 top-1/2 -translate-y-1/2 rotate-90"}`}>讲台</div>
          {layout.groups.filter(group => group.shape === "round").map(group => { const nodes = group.seatIds.map(id => layout.seats.find(seat => seat.id === id)).filter(Boolean) as typeof layout.seats; const x = nodes.reduce((sum, seat) => sum + seat.x, 0) / Math.max(1, nodes.length); const y = nodes.reduce((sum, seat) => sum + seat.y, 0) / Math.max(1, nodes.length); return <div key={group.id} className="pointer-events-none absolute z-0 grid h-20 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[50%] border border-violet-200 bg-violet-50/80 text-xs font-bold text-violet-500" style={{ left: `${x / layout.canvas.width * 100}%`, top: `${y / layout.canvas.height * 100}%` }}>{group.name}</div>; })}
          {layout.seats.map((seat, seatIndex) => <div key={seat.id} className="absolute z-10 h-[68px] w-[104px]" style={{ left: `${seat.x / layout.canvas.width * 100}%`, top: `${seat.y / layout.canvas.height * 100}%`, transform: `translate(-50%, -50%) rotate(${seat.rotation}deg)` }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={event => { event.preventDefault(); const studentId = event.dataTransfer.getData("text/seat-student-id"); if (studentId) assignWaitingStudentToSeat(studentId, seatIndex); }} onClick={() => { if (pendingStudentId) assignWaitingStudentToSeat(pendingStudentId, seatIndex); }}>
            <SeatCard studentId={seatOrder[seatIndex] ?? null} studentById={studentById} seatIndex={seatIndex} isLocked={lockedSeats.has(seatIndex)} isDragging={draggingSeat === seatIndex} isDropTarget={dragVisual?.targetIndex === seatIndex} dragActive={Boolean(dragVisual) || pendingStudentId !== null} visualTransform={seatVisualTransform(seatIndex)} cardMode={cardMode} onSelect={onSelectStudent} onPointerDragStart={handleSeatPointerDrag} onToggleLock={onToggleLock} />
            <span className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-[var(--app-text-muted)]">{seat.label}</span>
          </div>)}
        </div>
      </div>
      {waitingSection}
      {dragOverlay}
    </div>;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div ref={boardRef} className={`min-h-0 flex-1 overflow-auto ${dragVisual ? "select-none" : ""}`}>
      <div className="flex min-h-full min-w-[760px] flex-col">
        {/* Column group headers */}
        <div className="mb-2 flex shrink-0 gap-3 pl-12">
          {groups.map((_, gi) => (
            <div key={gi} className="flex-1 text-center text-xs text-gray-400" style={{ fontWeight: 600 }}>
              第 {gi + 1} 组
            </div>
          ))}
        </div>

        {/* Rows */}
        <div
          className="grid min-h-[384px] flex-1 content-center gap-2 transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ gridTemplateRows: `repeat(${rowCount}, ${cardMode === "compact" ? "48px" : "72px"})` }}
        >
          {rows.map((_, displayIdx) => {
            const rowIdx = rows.length - 1 - displayIdx;
            const row = rows[rowIdx];
            return (
            <div
              key={rowIdx}
              className="seat-row-enter flex min-h-0 items-stretch gap-3"
              style={{ animationDelay: `${displayIdx * 18}ms` }}
            >
              {/* Row label */}
              <div className="flex w-9 shrink-0 items-center justify-center text-center">
                <span className="text-xs text-gray-400" style={{ fontWeight: 600 }}>第{rowIdx + 1}排</span>
              </div>

              {/* 4 groups of 2 columns */}
              {groups.map((cols, gi) => (
                <div key={gi} className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                  {cols.map(colIdx => {
                    const cell = row[colIdx];
                    return (
                      <div
                        key={cell.seatIndex}
                        className="min-h-0 min-w-0"
                        onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                        onDrop={event => { event.preventDefault(); const studentId = event.dataTransfer.getData("text/seat-student-id"); if (studentId) assignWaitingStudentToSeat(studentId, cell.seatIndex); }}
                        onClick={() => { if (pendingStudentId) assignWaitingStudentToSeat(pendingStudentId, cell.seatIndex); }}
                      >
                        <SeatCard
                          studentId={cell.studentId}
                          studentById={studentById}
                          seatIndex={cell.seatIndex}
                          isLocked={lockedSeats.has(cell.seatIndex)}
                          isDragging={draggingSeat === cell.seatIndex}
                          isDropTarget={dragVisual?.targetIndex === cell.seatIndex}
                          dragActive={Boolean(dragVisual) || pendingStudentId !== null}
                          visualTransform={seatVisualTransform(cell.seatIndex)}
                          cardMode={cardMode}
                          onSelect={onSelectStudent}
                          onPointerDragStart={handleSeatPointerDrag}
                          onToggleLock={onToggleLock}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          );
          })}
        </div>

        <div className="mt-3 shrink-0 rounded-[var(--app-radius-sm)] border border-blue-100 bg-blue-50/70 py-2 text-center text-xs text-blue-600" style={{ fontWeight: 700 }}>
          讲台
        </div>

        {/* Legend */}
        <div className="mt-3 flex shrink-0 items-center gap-4 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-blue-400" />男生
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-pink-400" />女生
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Star className="w-3 h-3 text-emerald-400" />学科优势
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Lock className="w-3 h-3 text-amber-400" />座位锁定
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-4 h-4 rounded border-2 border-dashed border-gray-300" />空座
          </div>
        </div>
      </div>
      </div>
      {waitingSection}
      {dragOverlay}
    </div>
  );
}
