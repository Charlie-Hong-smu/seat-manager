import { type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { Button } from "./ui";
import { ChevronDown, Lock, UserRoundPlus, Users } from "lucide-react";
import type { AppStudent, SeatSettings, StudentId } from "../state/types";
import { resolveSeatLayout } from "../state/seatLayout";
import { settleDurationFor } from "../state/seatPlanner";
import { SeatLayoutSurface } from "./SeatLayoutSurface";

interface Props {
  cardMode: "compact" | "detail";
  previewMode?: boolean;
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
  /** Board-level controls that share the waiting-dock row (e.g. card density). */
  footerAccessory?: ReactNode;
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
  targetOccupied: boolean;
  waitingTarget: boolean;
  pointerX: number;
  pointerY: number;
  anchorX: number;
  anchorY: number;
  width: number;
  height: number;
  proximity: number;
  phase: "dragging" | "holding" | "settling";
  settleMs: number;
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
  isConcealed,
  isDropTarget,
  dragActive,
  interactiveEmpty,
  visualTransform,
  positionLabel,
  cardMode,
  previewMode,
  onSelect,
  onPointerDragStart,
  onToggleLock,
}: {
  studentId: StudentId | null;
  studentById: Map<StudentId, AppStudent>;
  seatIndex: number;
  isLocked: boolean;
  isDragging: boolean;
  isConcealed: boolean;
  isDropTarget: boolean;
  dragActive: boolean;
  interactiveEmpty: boolean;
  visualTransform?: string;
  positionLabel?: string;
  cardMode: "compact" | "detail";
  previewMode: boolean;
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
  const seatPositionLabel = positionLabel || `${row}-${col}`;

  if (!studentId || !student) {
    return (
      <div
        role={interactiveEmpty ? "button" : undefined}
        tabIndex={interactiveEmpty ? 0 : undefined}
        aria-label={interactiveEmpty ? `空座位 ${seatPositionLabel}` : undefined}
        onKeyDown={event => { if (interactiveEmpty && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); event.currentTarget.click(); } }}
        data-seat-index={seatIndex}
        data-seat-locked={isLocked ? "true" : "false"}
        data-seat-empty="true"
        title={interactiveEmpty ? undefined : `空座位 ${seatPositionLabel}`}
        className={`seat-empty-card relative h-full min-h-0 overflow-hidden rounded-xl border border-dashed text-caption-1-regular text-text-tertiary select-none transition-[background-color,border-color,box-shadow] duration-200 ${isLocked ? "border-status-warning-200 bg-status-warning-50/30" : "border-border-button-default bg-transparent hover:border-accent-200 hover:bg-accent-50/30"} ${isDropTarget ? "border-accent-400 bg-accent-50/80 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]" : ""}`}
        style={{ transform: visualTransform }}
      >
        <span className={`absolute inset-0 grid place-items-center text-text-tertiary transition-[opacity,transform] duration-200 ease-out ${cardMode === "detail" ? "scale-100 opacity-100 delay-100" : "pointer-events-none scale-105 opacity-0 delay-0"}`}>{seatPositionLabel}</span>
      </div>
    );
  }

  const genderDot = student.gender === "男" ? "seat-gender-dot--male" : student.gender === "女" ? "seat-gender-dot--female" : "bg-background-primary-disabled";
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
      className={`relative h-full min-h-0 w-full overflow-hidden rounded-xl text-left group ring-1 ring-inset transition-[background-color,box-shadow,opacity,transform] duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)]  hover:shadow-[var(--app-shadow-card)] hover:ring-accent-200 cursor-pointer ${
        isLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${isLocked ? "bg-status-warning-50/50 ring-status-warning-300" : "bg-background-primary-default ring-border-button-default/80"} ${isDragging ? "opacity-25 ring-2 ring-accent-200" : ""} ${isConcealed ? "invisible" : ""} ${isDropTarget ? "bg-accent-50/90 ring-2 ring-accent-400 shadow-[0_0_0_3px_rgba(59,130,246,0.12)]" : ""}`}
      style={{ transform: visualTransform, touchAction: "manipulation" }}
    >
      {/* Lock toggle */}
      {!previewMode && <button
        type="button"
        aria-label={isLocked ? `解锁 ${student.name} 的座位` : `锁定 ${student.name} 的座位`}
        onClick={e => { e.stopPropagation(); onToggleLock(seatIndex); }}
        onPointerDown={e => e.stopPropagation()}
        onMouseDown={e => e.stopPropagation()}
        title={isLocked ? "解锁座位" : "锁定座位"}
        className={`absolute top-0.5 right-0.5 z-10 grid h-5 w-5 place-items-center rounded-md transition-opacity hover:bg-background-tertiary-default ${isLocked ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
      >
        <Lock className={`h-3 w-3 ${isLocked ? "text-status-warning-400" : "text-text-tertiary"}`} />
      </button>}

      {/* 姓名始终只渲染一份，模式切换时从垂直居中平滑移动到卡片顶部。 */}
      <div className={`absolute left-2.5 right-2.5 flex min-w-0 items-center gap-1.5 transition-[top,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${cardMode === "compact" ? "top-1/2 -translate-y-1/2" : "top-2"}`}>
        <span className={`seat-gender-dot h-1.5 w-1.5 shrink-0 rounded-full ${genderDot}`} title={student.gender || "未知"} />
        <span className="min-w-0 flex-1 truncate text-body-semibold text-text-primary">{student.name}</span>
        <span data-seat-position-label className={`shrink-0 truncate text-[10px] tabular-nums text-text-tertiary transition-[opacity,transform,max-width] duration-200 ${cardMode === "detail" ? "max-w-[3.5rem] translate-x-0 opacity-100 delay-100" : "pointer-events-none max-w-0 translate-x-1 opacity-0 delay-0"}`}>{seatPositionLabel}</span>
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
                    className={`max-w-[4.5rem] shrink truncate rounded-full border px-1.5 py-0.5 text-[10px] ${isStrong ? "border-status-success-100 bg-status-success-50 text-status-success-600" : "border-status-danger-100 bg-status-danger-50 text-status-danger-400"}`}
                    style={{ fontWeight: 600 }}
                  >
                    {tag}
                  </span>
                );
              })}
              {hiddenTagCount > 0 && <span className="shrink-0 text-[10px] text-text-tertiary">+{hiddenTagCount}</span>}
            </div>
          ) : (
            <span className="text-[10px] text-text-tertiary">—</span>
          )}
      </div>
    </div>
  );
});

export function SeatBoard({ footerAccessory, cardMode, previewMode = false, students, seatOrder, seatSettings, onSelectStudent, onMoveSeat, onMoveStudentToWaiting, onAssignStudentToSeat, lockedSeats, onToggleLock }: Props) {
  const isMobile = useMediaQuery("(max-width: 767px), (max-height: 500px) and (pointer: coarse)");
  const hasCoarsePointer = useMediaQuery("(any-pointer: coarse)");
  const touchControls = isMobile || hasCoarsePointer;
  const [touchMoveMode, setTouchMoveMode] = useState(false);
  const [touchSourceId, setTouchSourceId] = useState<StudentId | null>(null);
  const [touchStatus, setTouchStatus] = useState("");
  const touchFlights = useRef<Animation[]>([]);
  useEffect(() => () => touchFlights.current.forEach(animation => animation.cancel()), []);
  const touchMoving = touchControls && touchMoveMode;
  const [draggingSeat, setDraggingSeat] = useState<number | null>(null);
  const [dragVisual, setDragVisual] = useState<DragVisualState | null>(null);
  const [waitingDockOpen, setWaitingDockOpen] = useState(false);
  useEffect(() => {
    dragCleanupRef.current?.();
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    setDragVisual(null);
    setDraggingSeat(null);
    setPendingStudentId(null);
    setTouchSourceId(null);
    setTouchStatus("");
  }, [previewMode]);
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
  const waitingOrderRef = useRef<StudentId[]>([]);
  const waitingStudents = useMemo(() => {
    const waitingIds = new Set(students.filter(student => !seatedIds.has(student.id)).map(student => student.id));
    const nextOrder = waitingOrderRef.current.filter(studentId => waitingIds.has(studentId));
    const retainedIds = new Set(nextOrder);
    students.forEach(student => {
      if (waitingIds.has(student.id) && !retainedIds.has(student.id)) {
        nextOrder.push(student.id);
        retainedIds.add(student.id);
      }
    });
    waitingOrderRef.current = nextOrder;
    return nextOrder.flatMap(studentId => {
      const student = studentById.get(studentId);
      return student ? [student] : [];
    });
  }, [seatedIds, studentById, students]);
  const previousWaitingCountRef = useRef(waitingStudents.length);
  const [pendingStudentId, setPendingStudentId] = useState<StudentId | null>(null);

  function chooseTouchSeat(index: number) {
    if (lockedSeats.has(index)) { setTouchStatus("该座位已锁定，请先解锁。"); return; }
    if (pendingStudentId) { assignWaitingStudentToSeat(pendingStudentId, index); setTouchSourceId(null); return; }
    const from = touchSourceId ? seatOrder.indexOf(touchSourceId) : -1;
    if (from < 0) {
      setTouchSourceId(seatOrder[index] || null);
      setTouchStatus(seatOrder[index] ? "再点目标座位；点原位可取消。" : "先点需要调整的学生。");
      return;
    }
    if (from === index) { setTouchSourceId(null); setTouchStatus(""); return; }
    if (lockedSeats.has(from)) { setTouchSourceId(null); setTouchStatus("原座位已锁定，请重新选择。"); return; }
    const ids = [seatOrder[from], seatOrder[index]].filter((id): id is string => Boolean(id));
    const cards = () => Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-student-id]") || []).filter(node => ids.includes(node.dataset.studentId!));
    const previous = new Map(cards().map(node => [node.dataset.studentId, node.getBoundingClientRect()]));
    touchFlights.current.forEach(animation => animation.cancel());
    flushSync(() => { onMoveSeat(from, index); setTouchSourceId(null); setTouchStatus(previewMode ? "方案已调整，采用前不会改当前座位。" : "座位已调整，可在工具栏撤销。"); });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    touchFlights.current = cards().flatMap(node => {
      const before = previous.get(node.dataset.studentId), after = node.getBoundingClientRect();
      return before ? [node.animate([{ transform: `translate(${before.x - after.x}px, ${before.y - after.y}px)` }, { transform: "translate(0, 0)" }], { duration: 320, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })] : [];
    });
  }

  // 简洁/详细切换：渲染阶段趁 DOM 仍是旧模式时快照卡片几何，提交后逐卡 FLIP，
  // 行级错峰播放，避免整版网格逐帧 reflow 造成的锯齿感。
  const renderedCardModeRef = useRef(cardMode);
  const pendingFlipRef = useRef<Map<number, { left: number; top: number; height: number }> | null>(null);
  if (cardMode !== renderedCardModeRef.current) {
    renderedCardModeRef.current = cardMode;
    const snapshot = new Map<number, { left: number; top: number; height: number }>();
    boardRef.current?.querySelectorAll<HTMLElement>("[data-seat-index]").forEach(element => {
      const rect = element.getBoundingClientRect();
      snapshot.set(Number(element.dataset.seatIndex), { left: rect.left, top: rect.top, height: rect.height });
    });
    pendingFlipRef.current = snapshot;
  }
  useLayoutEffect(() => {
    const snapshot = pendingFlipRef.current;
    pendingFlipRef.current = null;
    if (!snapshot || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const board = boardRef.current;
    if (!board) return;
    // 位移窗口内静音卡片内部过渡：top/opacity 等过渡会让 48 张卡逐帧
    // 排布或重绘，直接落位即可——卡片位移本身足够遮盖内部形态切换。
    board.dataset.seatSettling = "true";
    const boardTop = board.getBoundingClientRect().top;
    const animations: Animation[] = [];
    board.querySelectorAll<HTMLElement>("[data-seat-index]").forEach(element => {
      const previous = snapshot.get(Number(element.dataset.seatIndex));
      if (!previous) return;
      const now = element.getBoundingClientRect();
      const dx = previous.left - now.left;
      const dy = previous.top - now.top;
      if (!dx && !dy && Math.abs(previous.height - now.height) < 1) return;
      const rowDelay = Math.min(150, Math.max(0, Math.round((now.top - boardTop) / 56)) * 16);
      // 只动画 transform（合成器属性）。height/clip-path 都会退回主线程
      // 逐帧排布或光栅化 48 张卡，是掉帧的来源。
      animations.push(element.animate([
        { transform: `translate3d(${dx}px, ${dy}px, 0)` },
        { transform: "translate3d(0, 0, 0)" },
      ], { duration: 340, delay: rowDelay, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" }));
    });
    if (animations.length) {
      void Promise.allSettled(animations.map(animation => animation.finished))
        .then(() => { delete board.dataset.seatSettling; });
    } else {
      delete board.dataset.seatSettling;
    }
  }, [cardMode]);

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

  // 占位交换：松手瞬间提交真实顺序，被挤开的学生从挤压预览位置平滑滑向空出的座位，
  // 与拖拽浮层的吸附同时进行，避免"先停一下再瞬移"的割裂感。
  function animateOccupiedSwap(fromIndex: number, targetIndex: number, sourceStudentId: StudentId, targetStudentId: StudentId | null) {
    const sourceRect = seatRectsRef.current.get(fromIndex);
    const targetRect = seatRectsRef.current.get(targetIndex);
    const targetPush = getTargetPush(fromIndex, targetIndex, 1);
    onMoveSeat(fromIndex, targetIndex);
    if (!targetStudentId || !studentById.has(targetStudentId)) return;
    if (!sourceRect || !targetRect || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const cards = Array.from(boardRef.current?.querySelectorAll<HTMLElement>("[data-student-id]") || []);
      const sourceCard = cards.find(card => card.dataset.studentId === sourceStudentId);
      sourceCard?.animate([
        { opacity: 0.35, transform: "scale(0.96)" },
        { opacity: 1, transform: "scale(1)" },
      ], { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });

      const targetCard = cards.find(card => card.dataset.studentId === targetStudentId);
      const startX = targetRect.left + targetPush.x - sourceRect.left;
      const startY = targetRect.top + targetPush.y - sourceRect.top;
      const arcX = Math.abs(startY) > Math.abs(startX) ? 7 : 0;
      const arcY = Math.abs(startX) >= Math.abs(startY) ? -6 : 0;
      targetCard?.animate([
        { offset: 0, opacity: 0.92, transform: `translate3d(${startX}px, ${startY}px, 0) scale(0.97)` },
        { offset: 0.28, opacity: 1, transform: `translate3d(${startX * 0.72 + arcX * 0.4}px, ${startY * 0.72 + arcY * 0.4}px, 0) scale(0.985)` },
        { offset: 0.78, opacity: 1, transform: `translate3d(${startX * 0.16 + arcX}px, ${startY * 0.16 + arcY}px, 0) scale(1)` },
        { offset: 1, opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
      ], { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
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
    if (event.pointerType === "touch" && touchControls) return; // Touch scrolls the board; explicit tap-to-move avoids accidental rearrangement.
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
      const targetOccupied = targetIndex !== null && studentById.has(seatOrder[targetIndex] ?? "");
      const waitingShape = waitingTarget || (source.sourceType === "waiting" && targetIndex === null);
      setDragVisual({
        ...source,
        targetIndex,
        targetOccupied,
        waitingTarget,
        pointerX: pointerEvent.clientX,
        pointerY: pointerEvent.clientY,
        anchorX,
        anchorY,
        width: waitingShape ? WAITING_CARD_WIDTH : (targetRect?.width ?? sourceRect.width),
        height: waitingShape ? WAITING_CARD_HEIGHT : (targetRect?.height ?? sourceRect.height),
        proximity,
        phase: "dragging",
        settleMs: DRAG_SETTLE_MS,
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
      const targetOccupied = targetIndex !== null && studentById.has(seatOrder[targetIndex] ?? "");
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const emptySeatTarget = source.sourceType === "seat"
        && source.fromIndex !== null
        && targetIndex !== null
        && !targetOccupied;

      if (waitingTarget && source.fromIndex !== null) {
        // 松手时先留在当前指针位置，等真实等待卡渲染并完成横向滚动后，再执行唯一一次吸附。
        setDragVisual(current => current ? {
          ...current,
          targetIndex: null,
          targetOccupied: false,
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
        waitingOrderRef.current = [...waitingOrderRef.current.filter(studentId => studentId !== source.studentId), source.studentId];
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
          const settleMs = settleDurationFor(
            pointerEvent.clientX,
            pointerEvent.clientY,
            settledRect.left + settledRect.width * anchorX,
            settledRect.top + settledRect.height * anchorY,
          );
          setDragVisual(current => current?.studentId === source.studentId && current.phase === "holding" ? {
            ...current,
            phase: "settling",
            pointerX: settledRect.left + settledRect.width * anchorX,
            pointerY: settledRect.top + settledRect.height * anchorY,
            width: settledRect.width,
            height: settledRect.height,
            settleMs,
          } : current);
          settleTimerRef.current = window.setTimeout(() => {
            settleTimerRef.current = null;
            setDragVisual(null);
            setDraggingSeat(null);
          }, reducedMotion ? 0 : settleMs);
        }));
        return;
      }

      const destinationRect = targetRect ?? sourceRect;
      const settleX = destinationRect.left + destinationRect.width * anchorX;
      const settleY = destinationRect.top + destinationRect.height * anchorY;
      const settleMs = settleDurationFor(pointerEvent.clientX, pointerEvent.clientY, settleX, settleY);
      setDragVisual(current => current ? {
        ...current,
        targetIndex,
        targetOccupied,
        waitingTarget: false,
        proximity: targetIndex === null ? 0 : 1,
        phase: "settling",
        pointerX: settleX,
        pointerY: settleY,
        width: source.sourceType === "waiting" && !validSeatTarget ? WAITING_CARD_WIDTH : destinationRect.width,
        height: source.sourceType === "waiting" && !validSeatTarget ? WAITING_CARD_HEIGHT : destinationRect.height,
        settleMs,
      } : current);

      const occupiedSeatTarget = source.sourceType === "seat"
        && source.fromIndex !== null
        && targetIndex !== null
        && targetOccupied;
      if (source.sourceType === "waiting" && validSeatTarget) {
        onAssignStudentToSeat(source.studentId, targetIndex);
        setPendingStudentId(null);
      } else if (emptySeatTarget && source.fromIndex !== null && targetIndex !== null) {
        // 空座落点在松手时就更新真实顺序，由 overlay 遮住目标卡直到吸附结束，避免旧座位回闪一帧。
        onMoveSeat(source.fromIndex, targetIndex);
      } else if (occupiedSeatTarget && source.fromIndex !== null && targetIndex !== null) {
        // 占位交换在松手时提交，被挤开的学生与拖拽浮层同时开始移动。
        animateOccupiedSwap(source.fromIndex, targetIndex, source.studentId, seatOrder[targetIndex] || null);
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
        setDragVisual(null);
        setDraggingSeat(null);
      }, reducedMotion ? 0 : settleMs);
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
    // Empty slots stay fixed; only occupied-seat swaps preview displacement.
    if (!dragVisual.targetOccupied || !studentById.has(seatOrder[seatIndex] ?? "")) return undefined;
    // 占位交换在松手时已提交，被拖学生的真实卡已在目标位，不再施加挤压偏移。
    if (seatOrder[seatIndex] === dragVisual.studentId) return undefined;
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
      className="seat-student-morph pointer-events-none fixed z-[100] overflow-hidden border bg-background-primary-default/95 shadow-[var(--app-shadow-float)] backdrop-blur-sm motion-reduce:transition-none"
      data-drag-phase={dragVisual.phase}
      data-drag-shape={waitingShape ? "waiting" : "seat"}
      data-drag-student-id={dragVisual.studentId}
      style={{
        left: 0,
        top: 0,
        width: dragVisual.width,
        height: dragVisual.height,
        transform: `translate3d(${dragVisual.pointerX}px, ${dragVisual.pointerY}px, 0) translate(${-dragVisual.anchorX * 100}%, ${-dragVisual.anchorY * 100}%)`,
        transitionDuration: dragVisual.phase === "settling" ? `${dragVisual.settleMs}ms` : undefined,
      }}
    >
      <div className="seat-student-morph__seat absolute inset-0 flex min-w-0 items-center gap-2 px-3">
        <span className={`seat-gender-dot h-2 w-2 shrink-0 rounded-full ${draggedStudent.gender === "男" ? "seat-gender-dot--male" : draggedStudent.gender === "女" ? "seat-gender-dot--female" : "bg-background-primary-disabled"}`} />
        <span className="min-w-0 flex-1 truncate text-body-semibold text-text-primary">{draggedStudent.name}</span>
      </div>
      <span className="seat-student-morph__waiting absolute inset-0 grid place-content-center text-center text-caption-1-semibold text-text-primary">
        {compactWaitingName(draggedStudent.name).map(line => <span key={line}>{line}</span>)}
      </span>
    </div>, document.body
  ) : null;

  if (!students.length) {
    return <div className="grid h-full min-h-80 place-items-center rounded-[var(--app-radius-lg)] border border-dashed border-[var(--app-border)] bg-[var(--app-surface-muted)] px-6 text-center"><div><p className="text-headline-semibold text-[var(--app-text)]">还没有学生可以排座</p><p className="mt-2 text-body-regular text-[var(--app-text-muted)]">请先到“数据管理”导入名单，或在学生管理中添加学生。</p></div></div>;
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
      data-empty={waitingStudents.length === 0 ? "true" : "false"}
    >
      <div ref={waitingDockBarRef} className="seat-waiting-dock__bar">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-caption-1-semibold text-[var(--app-text)]">
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
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--app-radius-sm)] text-[var(--app-text-muted)] transition-colors hover:bg-background-tertiary-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/25"
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
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-dashed border-border-button-hover text-[var(--app-text-muted)]">
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
                  className={`seat-waiting-person shrink-0 border text-center text-caption-1-regular transition-[background-color,border-color,box-shadow] ${pendingStudentId === student.id ? "border-accent-400 bg-accent-50 text-accent-800 shadow-[0_0_0_3px_rgba(59,130,246,0.10)]" : "border-[var(--app-border)] bg-[var(--app-surface-muted)] text-[var(--app-text)] hover:border-border-button-hover hover:bg-background-primary-default"} ${dragVisual?.studentId === student.id ? "pointer-events-none invisible" : ""}`}
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

  return <div className="flex h-full min-h-0 flex-col gap-3">
      {touchControls && <div className="seat-touch-tools flex shrink-0 flex-wrap items-center gap-2">
        <Button size="sm" variant={touchMoving ? "primary" : "secondary"} aria-pressed={touchMoving} onClick={() => { setTouchMoveMode(value => !value); setTouchSourceId(null); setTouchStatus(""); setPendingStudentId(null); }}>{touchMoving ? "完成调座" : "点选调座"}</Button>
        {touchMoving && touchSourceId && <Button size="sm" variant="secondary" onClick={() => {
          const fromIndex = seatOrder.indexOf(touchSourceId);
          if (fromIndex < 0 || lockedSeats.has(fromIndex)) return;
          onMoveStudentToWaiting(fromIndex);
          setTouchSourceId(null);
          setTouchStatus(previewMode ? "已移入候选等待区，采用前不会改当前座位。" : "已移入等待区，可在工具栏撤销。");
          setWaitingDockOpen(true);
        }}>移入等待区</Button>}
        {touchMoving && <span role="status" className="min-w-0 flex-1 text-caption-1-regular text-text-secondary">{touchStatus || "点选学生，再点目标座位。"}</span>}
      </div>}
      <div ref={boardRef} className={`min-h-0 flex-1 overflow-auto ${dragVisual ? "select-none" : ""}`}>
        <SeatLayoutSurface layout={layout} detail={cardMode === "detail"} renderSeat={(seat, seatIndex) =>
          <div className="seat-card-enter h-full min-h-0" data-touch-selected={touchMoving && touchSourceId === seatOrder[seatIndex] ? "true" : undefined} onClickCapture={event => { if (touchMoving && !(event.target as HTMLElement).closest("button")) { event.stopPropagation(); chooseTouchSeat(seatIndex); } }} onKeyDownCapture={event => { if (touchMoving && (event.key === "Enter" || event.key === " ") && !(event.target as HTMLElement).closest("button")) { event.preventDefault(); event.stopPropagation(); chooseTouchSeat(seatIndex); } }} style={{ animationDelay: `${Math.min(seatIndex, 12) * 10}ms` }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }} onDrop={event => { event.preventDefault(); const studentId = event.dataTransfer.getData("text/seat-student-id"); if (studentId) assignWaitingStudentToSeat(studentId, seatIndex); }} onClick={() => { if (pendingStudentId) assignWaitingStudentToSeat(pendingStudentId, seatIndex); }}>
            <SeatCard studentId={seatOrder[seatIndex] ?? null} studentById={studentById} seatIndex={seatIndex} isLocked={lockedSeats.has(seatIndex)} isDragging={draggingSeat === seatIndex} isConcealed={dragVisual?.phase === "settling" && dragVisual.studentId === seatOrder[seatIndex]} isDropTarget={dragVisual?.targetIndex === seatIndex} dragActive={Boolean(dragVisual) || pendingStudentId !== null} interactiveEmpty={touchMoving || pendingStudentId !== null} visualTransform={seatVisualTransform(seatIndex)} positionLabel={seat.label} cardMode={cardMode} onSelect={onSelectStudent} onPointerDragStart={handleSeatPointerDrag} onToggleLock={onToggleLock} previewMode={previewMode} />
          </div>
        } />
      </div>
      <div className="seat-board-footer" data-dock-expanded={waitingDockExpanded ? "true" : "false"}>
        {waitingSection}
        {footerAccessory && <div className="seat-board-footer__accessory" aria-hidden={waitingDockExpanded || undefined} inert={waitingDockExpanded ? true : undefined}>{footerAccessory}</div>}
      </div>
      {dragOverlay}
    </div>;
}
