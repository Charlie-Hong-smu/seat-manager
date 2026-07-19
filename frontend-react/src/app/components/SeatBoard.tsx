import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Star } from "lucide-react";
import type { AppStudent, SeatSettings, StudentId } from "../state/types";
import { resolveSeatLayout } from "../state/seatLayout";

interface Props {
  cardMode: "compact" | "detail";
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  onSelectStudent: (student: AppStudent) => void;
  onOpenStudentFollowup?: (student: AppStudent) => void;
  onMoveSeat: (fromIndex: number, toIndex: number) => void;
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

function SeatCard({
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
}

export function SeatBoard({ cardMode, students, seatOrder, seatSettings, onSelectStudent, onMoveSeat, onAssignStudentToSeat, lockedSeats, onToggleLock }: Props) {
  const [draggingSeat, setDraggingSeat] = useState<number | null>(null);
  const [dragVisual, setDragVisual] = useState<DragVisualState | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const seatRectsRef = useRef(new Map<number, SeatRect>());
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const layout = useMemo(() => resolveSeatLayout(seatSettings.layout, seatOrder.length), [seatOrder.length, seatSettings.layout]);
  const seatedIds = useMemo(() => new Set(seatOrder.filter((id): id is StudentId => Boolean(id))), [seatOrder]);
  const waitingStudents = students.filter(student => !seatedIds.has(student.id));
  const [pendingStudentId, setPendingStudentId] = useState<StudentId | null>(null);
  const rowCount = Math.ceil(seatOrder.length / COLS);

  const rows = Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      seatIndex: r * COLS + c,
      studentId: seatOrder[r * COLS + c] ?? null,
    }))
  );

  // Groups: [0,1] [2,3] [4,5] [6,7]
  const groups = [
    [0, 1], [2, 3], [4, 5], [6, 7],
  ];

  useEffect(() => () => {
    dragCleanupRef.current?.();
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
  }, []);

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

  function targetAtPoint(clientX: number, clientY: number, fromIndex: number) {
    let nearest: { targetIndex: number; proximity: number; distance: number } | null = null;
    for (const [targetIndex, rect] of seatRectsRef.current) {
      if (targetIndex === fromIndex || lockedSeats.has(targetIndex)) continue;
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

  function beginPointerDrag(event: ReactPointerEvent<HTMLElement>, fromIndex: number) {
    if (event.button !== 0 || lockedSeats.has(fromIndex) || !seatOrder[fromIndex]) return;
    dragCleanupRef.current?.();
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    const sourceElement = event.currentTarget;
    const sourceRect = sourceElement.getBoundingClientRect();
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
        setDraggingSeat(fromIndex);
      }
      pointerEvent.preventDefault();
      const { targetIndex, proximity } = targetAtPoint(pointerEvent.clientX, pointerEvent.clientY, fromIndex);
      setDragVisual({
        fromIndex,
        targetIndex,
        pointerX: pointerEvent.clientX,
        pointerY: pointerEvent.clientY,
        offsetX,
        offsetY,
        width: sourceRect.width,
        height: sourceRect.height,
        proximity,
        phase: "dragging",
      });
    };

    const finishDrag = (pointerEvent: PointerEvent, cancelled: boolean) => {
      if (pointerEvent.pointerId !== pointerId) return;
      cleanup();
      if (!active) return;
      pointerEvent.preventDefault();
      const { targetIndex } = cancelled ? { targetIndex: null } : targetAtPoint(pointerEvent.clientX, pointerEvent.clientY, fromIndex);
      const destinationRect = targetIndex === null ? seatRectsRef.current.get(fromIndex) : seatRectsRef.current.get(targetIndex);
      setDragVisual(current => current ? {
        ...current,
        targetIndex,
        proximity: targetIndex === null ? 0 : 1,
        phase: "settling",
        settleLeft: destinationRect?.left,
        settleTop: destinationRect?.top,
      } : current);

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (targetIndex === null) {
          setDragVisual(null);
          setDraggingSeat(null);
          return;
        }
        const sourceStudentId = seatOrder[fromIndex];
        if (!sourceStudentId) return;
        animateCompletedSwap(fromIndex, targetIndex, sourceStudentId, seatOrder[targetIndex] || null);
      }, reducedMotion ? 0 : 240);
    };

    const handlePointerUp = (pointerEvent: PointerEvent) => finishDrag(pointerEvent, false);
    const handlePointerCancel = (pointerEvent: PointerEvent) => finishDrag(pointerEvent, true);
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp, { passive: false });
    window.addEventListener("pointercancel", handlePointerCancel, { passive: false });
    dragCleanupRef.current = cleanup;
  }

  function seatVisualTransform(seatIndex: number): string | undefined {
    if (!dragVisual || dragVisual.targetIndex === null || seatIndex === dragVisual.fromIndex) return undefined;
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

  const draggedStudentId = draggingSeat === null ? null : seatOrder[draggingSeat];
  const draggedStudent = draggedStudentId ? studentById.get(draggedStudentId) : null;
  const overlayLeft = dragVisual?.phase === "settling" ? dragVisual.settleLeft : dragVisual ? dragVisual.pointerX - dragVisual.offsetX : 0;
  const overlayTop = dragVisual?.phase === "settling" ? dragVisual.settleTop : dragVisual ? dragVisual.pointerY - dragVisual.offsetY : 0;

  const dragOverlay = dragVisual && draggedStudent ? createPortal(
    <div aria-hidden="true" className={`pointer-events-none fixed z-[100] overflow-hidden rounded-xl border border-blue-300 bg-white/95 shadow-[var(--app-shadow-float)] backdrop-blur-sm transition-[transform,opacity,box-shadow] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${dragVisual.phase === "settling" ? "duration-200" : "duration-150"}`} style={{ left: 0, top: 0, width: dragVisual.width, height: dragVisual.height, opacity: dragVisual.phase === "settling" ? 0.92 : 1, transform: `translate3d(${overlayLeft || 0}px, ${overlayTop || 0}px, 0) scale(${dragVisual.phase === "settling" ? 0.985 : 1.025})` }}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/80 via-white to-violet-50/60" />
      <div className="relative flex h-full min-w-0 items-center gap-2 px-3"><span className={`h-2 w-2 shrink-0 rounded-full ${draggedStudent.gender === "男" ? "bg-blue-400" : draggedStudent.gender === "女" ? "bg-pink-400" : "bg-gray-300"}`} /><span className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900">{draggedStudent.name}</span><span className="text-[10px] font-semibold text-blue-500">换座</span></div>
    </div>, document.body
  ) : null;

  if (!students.length) {
    return <div className="grid h-full min-h-80 place-items-center rounded-[var(--app-radius-lg)] border border-dashed border-[var(--app-border)] bg-[var(--app-surface-muted)] px-6 text-center"><div><p className="text-base font-bold text-[var(--app-text)]">还没有学生可以排座</p><p className="mt-2 text-sm text-[var(--app-text-muted)]">请先到“数据管理”导入名单，或在学生管理中添加学生。</p></div></div>;
  }

  if (seatSettings.layout) {
    return <div className="flex h-full min-h-0 flex-col gap-3">
      {waitingStudents.length > 0 && <section aria-label="待排学生" className="shrink-0 rounded-[var(--app-radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2"><div className="mb-2 text-xs font-bold text-amber-800">待排区 · {waitingStudents.length} 人</div><div className="flex flex-wrap gap-2">{waitingStudents.map(student => <button key={student.id} type="button" draggable onDragStart={event => event.dataTransfer.setData("text/seat-student-id", student.id)} aria-pressed={pendingStudentId === student.id} onClick={() => setPendingStudentId(current => current === student.id ? null : student.id)} className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${pendingStudentId === student.id ? "border-amber-500 bg-amber-500 text-white" : "border-amber-200 bg-white text-amber-800"}`}>{student.name}</button>)}</div><p className="mt-2 text-[11px] text-amber-700">拖到空座，或先点学生再点目标座位。</p></section>}
      <div ref={boardRef} className={`relative min-h-[420px] flex-1 overflow-auto rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] ${dragVisual ? "select-none" : ""}`}>
        <div className="relative mx-auto h-full min-h-[520px] min-w-[760px]" style={{ aspectRatio: `${layout.canvas.width}/${layout.canvas.height}` }}>
          <div className={`absolute z-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 ${layout.frontEdge === "top" ? "left-1/2 top-2 -translate-x-1/2" : layout.frontEdge === "bottom" ? "bottom-2 left-1/2 -translate-x-1/2" : layout.frontEdge === "left" ? "left-2 top-1/2 -translate-y-1/2 -rotate-90" : "right-2 top-1/2 -translate-y-1/2 rotate-90"}`}>讲台</div>
          {layout.groups.filter(group => group.shape === "round").map(group => { const nodes = group.seatIds.map(id => layout.seats.find(seat => seat.id === id)).filter(Boolean) as typeof layout.seats; const x = nodes.reduce((sum, seat) => sum + seat.x, 0) / Math.max(1, nodes.length); const y = nodes.reduce((sum, seat) => sum + seat.y, 0) / Math.max(1, nodes.length); return <div key={group.id} className="pointer-events-none absolute z-0 grid h-20 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[50%] border border-violet-200 bg-violet-50/80 text-xs font-bold text-violet-500" style={{ left: `${x / layout.canvas.width * 100}%`, top: `${y / layout.canvas.height * 100}%` }}>{group.name}</div>; })}
          {layout.seats.map((seat, seatIndex) => <div key={seat.id} className="absolute z-10 h-[68px] w-[104px]" style={{ left: `${seat.x / layout.canvas.width * 100}%`, top: `${seat.y / layout.canvas.height * 100}%`, transform: `translate(-50%, -50%) rotate(${seat.rotation}deg)` }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const studentId = event.dataTransfer.getData("text/seat-student-id"); if (studentId) onAssignStudentToSeat(studentId, seatIndex); }} onClick={() => { if (pendingStudentId) { onAssignStudentToSeat(pendingStudentId, seatIndex); setPendingStudentId(null); } }}>
            <SeatCard studentId={seatOrder[seatIndex] ?? null} studentById={studentById} seatIndex={seatIndex} isLocked={lockedSeats.has(seatIndex)} isDragging={draggingSeat === seatIndex} isDropTarget={dragVisual?.targetIndex === seatIndex} dragActive={Boolean(dragVisual)} visualTransform={seatVisualTransform(seatIndex)} cardMode={cardMode} onSelect={onSelectStudent} onPointerDragStart={beginPointerDrag} onToggleLock={onToggleLock} />
            <span className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-semibold text-[var(--app-text-muted)]">{seat.label}</span>
          </div>)}
        </div>
      </div>
      {dragOverlay}
    </div>;
  }

  return (
    <div ref={boardRef} className={`h-full min-h-0 overflow-auto ${dragVisual ? "select-none" : ""}`}>
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
                      <SeatCard
                        key={cell.seatIndex}
                        studentId={cell.studentId}
                        studentById={studentById}
                        seatIndex={cell.seatIndex}
                        isLocked={lockedSeats.has(cell.seatIndex)}
                        isDragging={draggingSeat === cell.seatIndex}
                        isDropTarget={dragVisual?.targetIndex === cell.seatIndex}
                        dragActive={Boolean(dragVisual)}
                        visualTransform={seatVisualTransform(cell.seatIndex)}
                        cardMode={cardMode}
                        onSelect={onSelectStudent}
                        onPointerDragStart={beginPointerDrag}
                        onToggleLock={onToggleLock}
                      />
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
      {dragOverlay}
    </div>
  );
}
