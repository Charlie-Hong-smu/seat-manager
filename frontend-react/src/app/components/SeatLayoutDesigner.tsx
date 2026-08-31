import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Grid2X2, Link2, Presentation, RotateCcw, Save, Trash2, UsersRound, X } from "lucide-react";

import {
  getSeatLayoutFrontEdgeForPoint,
  getSeatGroupNameError,
  groupSeatLayoutRectangle,
  getSeatLayoutSlots,
  MAX_LAYOUT_SEATS,
  repairSeatLayoutGroups,
  renameSeatLayoutGroup,
  resolveSeatLayout,
  type SeatLayoutSlot,
} from "../state/seatLayout";
import type { SeatLayoutGroup, SeatLayoutV1 } from "../state/types";
import { Button, useAppDialog } from "./ui";
import { changeSeatGridAxis, getSeatGridCells, getSeatGroupCollisions, getSeatGroupGridBounds, getSeatGroupOutlinePath, getSeatGroupResizeBounds, prepareSeatLayoutGrid, resizeSeatLayoutGroup, type SeatGridAxis, type SeatGroupBounds, type SeatGroupEdge } from "../state/seatLayoutGrid";
import { SeatGroupOverlay } from "./SeatGroupOverlay";
import { SeatGridAxisControls, type SeatGridAxisTarget } from "./SeatGridAxisControls";

interface Props {
  current?: SeatLayoutV1;
  seatCount: number;
  onApply: (layout: SeatLayoutV1) => void;
  onCancel: () => void;
}

function cloneLayout(layout: SeatLayoutV1): SeatLayoutV1 {
  return {
    ...layout,
    canvas: { ...layout.canvas },
    podium: layout.podium ? { ...layout.podium } : undefined,
    seats: layout.seats.map(seat => ({ ...seat })),
    groups: layout.groups.map(group => ({ ...group, seatIds: [...group.seatIds] })),
    neighborEdges: layout.neighborEdges.map(edge => ({ ...edge })),
  };
}

function coordinateKey(x: number, y: number): string {
  return `${Math.round(x)}:${Math.round(y)}`;
}

function nextSeatId(layout: SeatLayoutV1, slot: SeatLayoutSlot): string {
  const base = `seat-slot-${slot.row + 1}-${slot.column + 1}`;
  if (!layout.seats.some(seat => seat.id === base)) return base;
  let suffix = 2;
  while (layout.seats.some(seat => seat.id === `${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function removeSeatFromLayout(layout: SeatLayoutV1, seatId: string): SeatLayoutV1 {
  return repairSeatLayoutGroups({
    ...layout,
    template: "freeform",
    seats: layout.seats.filter(seat => seat.id !== seatId),
    groups: layout.groups
      .map(group => ({ ...group, seatIds: group.seatIds.filter(id => id !== seatId) }))
      .filter(group => group.seatIds.length),
    neighborEdges: layout.neighborEdges.filter(edge => edge.a !== seatId && edge.b !== seatId),
  });
}

function addSeatToLayout(layout: SeatLayoutV1, slot: SeatLayoutSlot, slotByCoordinate: Map<string, SeatLayoutSlot>): SeatLayoutV1 {
  if (layout.seats.length >= MAX_LAYOUT_SEATS || layout.seats.some(seat => seat.x === slot.x && seat.y === slot.y)) return layout;
  const id = nextSeatId(layout, slot);
  const groupIndex = Math.floor(slot.column / 2);
  const neighbor = layout.seats.find(seat => {
    const otherSlot = slotByCoordinate.get(coordinateKey(seat.x, seat.y));
    return otherSlot?.row === slot.row
      && Math.floor(otherSlot.column / 2) === groupIndex
      && Math.abs(otherSlot.column - slot.column) === 1;
  });
  return repairSeatLayoutGroups({
    ...layout,
    template: "freeform",
    seats: [...layout.seats, { id, x: slot.x, y: slot.y, rotation: 0, label: `${slot.row + 1}-${slot.column + 1}` }],
    neighborEdges: neighbor ? [...layout.neighborEdges, { a: neighbor.id, b: id }] : [...layout.neighborEdges],
  });
}

export function SeatLayoutDesigner({ current, seatCount, onApply, onCancel }: Props) {
  const appDialog = useAppDialog();
  const dialogOpenRef = useRef(false);
  const beforeAxisRects = useRef<Map<string, DOMRect> | null>(null);
  const [axisTarget, setAxisTarget] = useState<SeatGridAxisTarget | null>(null);
  const resolvedCurrent = useMemo(() => prepareSeatLayoutGrid(resolveSeatLayout(current, seatCount)), [current, seatCount]);
  const [draft, setDraft] = useState(() => cloneLayout(resolvedCurrent));
  const editorRows = draft.slotGridRows || 9;
  const editorColumns = draft.slotGridColumns || 8;
  const slots = useMemo(() => getSeatLayoutSlots(editorRows, editorColumns), [editorRows, editorColumns]);
  const slotByCoordinate = useMemo(() => new Map(slots.map(slot => [coordinateKey(slot.x, slot.y), slot])), [slots]);
  const grid = useMemo(() => getSeatGridCells(draft), [draft]);
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rangeMode, setRangeMode] = useState(false);
  const [rangePreview, setRangePreview] = useState<SeatLayoutSlot | null>(null);
  const [groupMode, setGroupMode] = useState(false);
  const [groupDrag, setGroupDrag] = useState<{ anchor: SeatLayoutSlot; target: SeatLayoutSlot } | null>(null);
  const groupDragRef = useRef<typeof groupDrag>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [groupResize, setGroupResize] = useState<{ id: string; edge: SeatGroupEdge; bounds: SeatGroupBounds } | null>(null);
  const groupResizeRef = useRef<typeof groupResize>(null);
  const resizedDraft = useMemo(() => groupResize ? resizeSeatLayoutGroup(draft, groupResize.id, groupResize.bounds) : draft, [draft, groupResize]);
  const groupDragBounds = groupDrag ? { left: Math.min(groupDrag.anchor.column, groupDrag.target.column), right: Math.max(groupDrag.anchor.column, groupDrag.target.column), top: Math.min(groupDrag.anchor.row, groupDrag.target.row), bottom: Math.max(groupDrag.anchor.row, groupDrag.target.row) } : undefined;
  const collisionBounds = groupResize?.bounds || groupDragBounds;
  const collisionIds = new Set(collisionBounds ? getSeatGroupCollisions(draft, collisionBounds, groupResize?.id).map(group => group.id) : []);
  // Preview the resized target, but keep all original neighbor contours visible until confirmation.
  const overlayGroups = groupResize ? draft.groups.map(group => group.id === groupResize.id ? resizedDraft.groups.find(item => item.id === group.id) || group : group) : draft.groups;
  const dragPodium = groupDragBounds && grid.podium && grid.podium.column >= groupDragBounds.left && grid.podium.column <= groupDragBounds.right && grid.podium.row >= groupDragBounds.top && grid.podium.row <= groupDragBounds.bottom ? { column: grid.podium.column - groupDragBounds.left, row: grid.podium.row - groupDragBounds.top } : undefined;

  const commitGroupBounds = useCallback(async (bounds: SeatGroupBounds, existingId?: string) => {
    if (dialogOpenRef.current) return;
    const ids = new Set(draft.seats.filter(seat => {
      const cell = grid.seats.get(seat.id);
      return cell && cell.column >= bounds.left && cell.column <= bounds.right && cell.row >= bounds.top && cell.row <= bounds.bottom;
    }).map(seat => seat.id));
    if (ids.size < 2) return;
    const existing = draft.groups.find(group => group.id === existingId);
    if (existing && existing.seatIds.length === ids.size && existing.seatIds.every(id => ids.has(id))) return;
    const collisions = getSeatGroupCollisions(draft, bounds, existingId);
    if (collisions.length) {
      dialogOpenRef.current = true;
      const confirmed = await appDialog.confirm({ title: "覆盖现有小组？", description: `新范围与${collisions.map(group => `“${group.name}”`).join("、")}重叠。确认后，相交座位归入${existing ? `“${existing.name}”` : "新小组"}；原小组保留剩余座位。若被切成多块，将自动拆成多个组，其中一块沿用原组名，其余自动编号；没有剩余座位的小组才会移除。`, confirmLabel: "确认覆盖", variant: "danger" });
      dialogOpenRef.current = false;
      if (!confirmed) return;
    }
    setDraft(currentDraft => groupSeatLayoutRectangle(currentDraft, ids, existingId || `group-custom-${Date.now()}`));
    setSelected(new Set());
  }, [appDialog, draft, grid.seats]);

  useEffect(() => {
    const cancel = () => { groupResizeRef.current = null; setGroupResize(null); };
    const move = (event: PointerEvent) => {
      const currentResize = groupResizeRef.current;
      const rect = gridRef.current?.getBoundingClientRect();
      if (!currentResize || !rect) return;
      const point = { column: Math.floor((event.clientX - rect.left) / rect.width * editorColumns), row: Math.floor((event.clientY - rect.top) / rect.height * editorRows) };
      const bounds = getSeatGroupResizeBounds(draft, currentResize.id, currentResize.edge, point);
      if (!bounds) return;
      const next = { ...currentResize, bounds };
      groupResizeRef.current = next;
      setGroupResize(next);
    };
    const finish = (event: PointerEvent) => {
      if (!groupResizeRef.current) return;
      move(event);
      const currentResize = groupResizeRef.current!;
      void commitGroupBounds(currentResize.bounds, currentResize.id);
      cancel();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") cancel(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel); window.removeEventListener("blur", cancel); window.removeEventListener("keydown", escape);
    };
  }, [draft, editorColumns, editorRows, commitGroupBounds]);

  function beginGroupResize(id: string, edge: SeatGroupEdge) {
    const bounds = getSeatGroupGridBounds(draft, id);
    if (!bounds) return;
    const next = { id, edge, bounds };
    groupResizeRef.current = next;
    setGroupResize(next);
    setHoveredGroup(id);
    setRangePreview(null);
  }

  function nudgeGroupEdge(id: string, edge: SeatGroupEdge, delta: number) {
    const currentBounds = getSeatGroupGridBounds(draft, id);
    if (!currentBounds) return;
    const point = { row: (edge === "top" ? currentBounds.top : currentBounds.bottom) + delta, column: (edge === "left" ? currentBounds.left : currentBounds.right) + delta };
    const bounds = getSeatGroupResizeBounds(draft, id, edge, point);
    if (bounds) void commitGroupBounds(bounds, id);
  }

  useEffect(() => {
    const clear = () => { groupDragRef.current = null; setGroupDrag(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && !dialogOpenRef.current) { clear(); setRangeMode(false); setGroupMode(false); setRangePreview(null); setSelected(new Set()); } };
    window.addEventListener("mouseup", clear);
    window.addEventListener("blur", clear);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("mouseup", clear); window.removeEventListener("blur", clear); window.removeEventListener("keydown", escape); };
  }, []);

  useEffect(() => {
    setDraft(cloneLayout(resolvedCurrent));
    setSelected(new Set());
    setRangeMode(false);
    setRangePreview(null);
    setGroupMode(false);
    setGroupDrag(null);
    groupDragRef.current = null;
  }, [resolvedCurrent]);

  useLayoutEffect(() => {
    const before = beforeAxisRects.current;
    beforeAxisRects.current = null;
    if (!before) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gridRef.current?.querySelectorAll<HTMLElement>("[data-seat-grid-seat]").forEach(element => {
      const previous = before.get(element.dataset.seatGridSeat || "");
      if (!previous) return;
      // Start from the last visible frame on rapid edits, without replaying a seat's enable pulse.
      element.getAnimations().forEach(animation => animation.cancel());
      element.querySelector(".seat-layout-slot__face")?.getAnimations().forEach(animation => {
        if (animation instanceof CSSAnimation && animation.animationName === "seat-layout-slot-enable") animation.cancel();
      });
      if (reducedMotion) return;
      const next = element.getBoundingClientRect();
      const x = previous.left - next.left, y = previous.top - next.top;
      const scaleX = previous.width / next.width, scaleY = previous.height / next.height;
      if (Math.abs(x) + Math.abs(y) + Math.abs(previous.width - next.width) + Math.abs(previous.height - next.height) < 1) return;
      element.animate([
        { transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`, transformOrigin: "top left" },
        { transform: "translate(0, 0) scale(1, 1)", transformOrigin: "top left" },
      ], { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
    });
  }, [draft]);

  const seatBySlot = useMemo(() => {
    const result = new Map<string, SeatLayoutV1["seats"][number]>();
    draft.seats.forEach(seat => {
      const slot = slotByCoordinate.get(coordinateKey(seat.x, seat.y));
      if (slot) result.set(slot.key, seat);
    });
    return result;
  }, [draft.seats, slotByCoordinate]);
  const podiumSlot = draft.podium ? slotByCoordinate.get(coordinateKey(draft.podium.x, draft.podium.y)) : undefined;
  const previewKeys = useMemo(() => {
    if (!rangeMode || !rangePreview) return new Set<string>();
    return new Set(slots.filter(slot => slot.row <= rangePreview.row && slot.column <= rangePreview.column).map(slot => slot.key));
  }, [rangeMode, rangePreview, slots]);
  const selectedSeats = useMemo(() => draft.seats.filter(seat => selected.has(seat.id)), [draft.seats, selected]);
  const groupPreviewSeatIds = useMemo(() => {
    if (!groupMode || !groupDrag) return new Set<string>();
    const minRow = Math.min(groupDrag.anchor.row, groupDrag.target.row);
    const maxRow = Math.max(groupDrag.anchor.row, groupDrag.target.row);
    const minColumn = Math.min(groupDrag.anchor.column, groupDrag.target.column);
    const maxColumn = Math.max(groupDrag.anchor.column, groupDrag.target.column);
    return new Set(draft.seats.filter(seat => {
      const slot = slotByCoordinate.get(coordinateKey(seat.x, seat.y));
      return slot && slot.row >= minRow && slot.row <= maxRow && slot.column >= minColumn && slot.column <= maxColumn;
    }).map(seat => seat.id));
  }, [draft.seats, groupDrag, groupMode, slotByCoordinate]);
  const waitingCount = Math.max(0, seatCount - draft.seats.length);

  function applyRange(target: SeatLayoutSlot) {
    const targetSlots = slots.filter(slot => slot.row <= target.row && slot.column <= target.column && slot.key !== podiumSlot?.key);
    const targetKeys = new Set(targetSlots.map(slot => slot.key));
    setDraft(currentDraft => {
      const outsideSeatIds = currentDraft.seats
        .filter(seat => {
          const slot = slotByCoordinate.get(coordinateKey(seat.x, seat.y));
          return !slot || !targetKeys.has(slot.key);
        })
        .map(seat => seat.id);
      const trimmed = outsideSeatIds.reduce((next, seatId) => removeSeatFromLayout(next, seatId), currentDraft);
      const filled = targetSlots.reduce((next, slot) => addSeatToLayout(next, slot, slotByCoordinate), trimmed);
      const groupCount = Math.ceil((target.column + 1) / 2);
      const groups: SeatLayoutGroup[] = Array.from({ length: groupCount }, (_, index) => ({
        id: `group-slot-${index + 1}`,
        name: `第 ${index + 1} 组`,
        shape: "columns",
        seatIds: [],
      }));
      const seats = filled.seats.map(seat => {
        const slot = slotByCoordinate.get(coordinateKey(seat.x, seat.y));
        if (!slot || !targetKeys.has(slot.key)) return seat;
        const group = groups[Math.floor(slot.column / 2)];
        group.seatIds.push(seat.id);
        return { ...seat, label: `${slot.row + 1}-${slot.column + 1}`, groupId: group.id };
      });
      const seatByTargetSlot = new Map(seats.map(seat => {
        const slot = slotByCoordinate.get(coordinateKey(seat.x, seat.y));
        return [slot?.key, seat] as const;
      }).filter((entry): entry is [string, SeatLayoutV1["seats"][number]] => Boolean(entry[0])));
      const neighborEdges = targetSlots.flatMap(slot => {
        if (slot.column % 2 === 0) return [];
        const left = seatByTargetSlot.get(`${slot.row}:${slot.column - 1}`);
        const right = seatByTargetSlot.get(slot.key);
        return left && right ? [{ a: left.id, b: right.id }] : [];
      });
      return { ...filled, seats, groups: groups.filter(group => group.seatIds.length), neighborEdges };
    });
    setSelected(new Set());
    setRangeMode(false);
    setRangePreview(null);
  }

  function toggleSelection(seatId: string) {
    setSelected(currentSelection => {
      const next = new Set(currentSelection);
      if (next.has(seatId)) next.delete(seatId); else next.add(seatId);
      return next;
    });
  }

  function toggleSlot(slot: SeatLayoutSlot, additive: boolean) {
    if (rangeMode) {
      applyRange(slot);
      return;
    }
    const existing = seatBySlot.get(slot.key);
    if (additive && existing) {
      toggleSelection(existing.id);
      return;
    }
    if (existing) {
      setDraft(currentDraft => removeSeatFromLayout(currentDraft, existing.id));
      setSelected(currentSelection => {
        const next = new Set(currentSelection);
        next.delete(existing.id);
        return next;
      });
      return;
    }
    setDraft(currentDraft => addSeatToLayout({ ...currentDraft, podium: podiumSlot?.key === slot.key ? undefined : currentDraft.podium }, slot, slotByCoordinate));
  }

  function setPodium(slot: SeatLayoutSlot) {
    const existing = seatBySlot.get(slot.key);
    setDraft(currentDraft => {
      const withoutSeat = existing ? removeSeatFromLayout(currentDraft, existing.id) : currentDraft;
      const clearing = podiumSlot?.key === slot.key;
      return {
        ...withoutSeat,
        template: "freeform",
        podium: clearing ? undefined : { x: slot.x, y: slot.y },
        frontEdge: clearing ? withoutSeat.frontEdge : getSeatLayoutFrontEdgeForPoint(slot),
      };
    });
    if (existing) setSelected(currentSelection => {
      const next = new Set(currentSelection);
      next.delete(existing.id);
      return next;
    });
  }

  function deleteSelected() {
    if (!selected.size) return;
    setDraft(currentDraft => [...selected].reduce((next, seatId) => removeSeatFromLayout(next, seatId), currentDraft));
    setSelected(new Set());
  }

  async function assignSeatsToGroup(seatIds: Set<string>) {
    if (seatIds.size < 2) return;
    const cells = [...seatIds].flatMap(id => grid.seats.get(id) ? [grid.seats.get(id)!] : []);
    const bounds = { left: Math.min(...cells.map(cell => cell.column)), right: Math.max(...cells.map(cell => cell.column)), top: Math.min(...cells.map(cell => cell.row)), bottom: Math.max(...cells.map(cell => cell.row)) };
    await commitGroupBounds(bounds);
  }

  function groupSelected() {
    assignSeatsToGroup(selected);
  }

  function ungroupSelected() {
    if (!selected.size) return;
    setDraft(currentDraft => repairSeatLayoutGroups({
      ...currentDraft,
      template: "freeform",
      groups: currentDraft.groups.filter(group => !group.seatIds.some(id => selected.has(id))),
    }));
    setSelected(new Set());
  }

  function ungroup(id: string) {
    setDraft(value => repairSeatLayoutGroups({ ...value, groups: value.groups.filter(group => group.id !== id) }));
    setHoveredGroup(null);
    setSelected(new Set());
  }

  function toggleNeighbor() {
    if (selectedSeats.length !== 2) return;
    const [a, b] = selectedSeats.map(seat => seat.id);
    const matches = (edge: { a: string; b: string }) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a);
    setDraft(currentDraft => ({
      ...currentDraft,
      template: "freeform",
      neighborEdges: currentDraft.neighborEdges.some(matches) ? currentDraft.neighborEdges.filter(edge => !matches(edge)) : [...currentDraft.neighborEdges, { a, b }],
    }));
  }

  async function renameGroup(id: string) {
    const group = draft.groups.find(item => item.id === id);
    if (!group) return;
    dialogOpenRef.current = true;
    setRangePreview(null);
    const name = await appDialog.prompt({
      title: "编辑组名", description: "可直接输入组号，也可以填写组名。", defaultValue: group.name,
      confirmLabel: "确定", validate: value => getSeatGroupNameError(draft, id, value),
    });
    dialogOpenRef.current = false;
    if (name !== null) setDraft(value => renameSeatLayoutGroup(value, id, name));
  }

  async function changeAxis(axis: SeatGridAxis, index: number, action: "insert" | "delete") {
    if (dialogOpenRef.current) return;
    if (action === "delete") {
      const count = [...grid.seats.values()].filter(cell => cell?.[axis] === index).length;
      const hasPodium = grid.podium?.[axis] === index;
      if (count || hasPodium) {
        const word = axis === "row" ? "行" : "列";
        dialogOpenRef.current = true;
        const confirmed = await appDialog.confirm({
          title: `删除第 ${index + 1} ${word}？`,
          description: count ? `此${word}已经有学生座位，是否仍要删除？将移除 ${count} 个座位${hasPodium ? "及讲台" : ""}；应用布局后容纳不下的学生会进入等待区。` : `此${word}包含讲台，是否仍要删除？`,
          confirmLabel: "确认删除", variant: "danger",
        });
        dialogOpenRef.current = false;
        if (!confirmed) return;
      }
    }
    beforeAxisRects.current = new Map([...gridRef.current?.querySelectorAll<HTMLElement>("[data-seat-grid-seat]") || []].map(element => [element.dataset.seatGridSeat!, element.getBoundingClientRect()]));
    setDraft(value => changeSeatGridAxis(value, axis, index, action));
    setAxisTarget(null);
    setHoveredGroup(null);
    setRangePreview(null);
    setSelected(new Set());
  }

  function beginGroupDrag(event: ReactMouseEvent<HTMLButtonElement>, slot: SeatLayoutSlot) {
    if (!groupMode) return false;
    event.preventDefault();
    setHoveredGroup(null);
    const nextDrag = { anchor: slot, target: slot };
    groupDragRef.current = nextDrag;
    setGroupDrag(nextDrag);
    return true;
  }

  function moveGroupDragTo(slot: SeatLayoutSlot) {
    const currentDrag = groupDragRef.current;
    if (!currentDrag || slot.key === currentDrag.target.key) return;
    const nextDrag = { ...currentDrag, target: slot };
    groupDragRef.current = nextDrag;
    setGroupDrag(nextDrag);
  }

  function groupSlotAtPoint(event: ReactMouseEvent<HTMLDivElement>) {
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return undefined;
    const column = Math.min(editorColumns - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * editorColumns)));
    const row = Math.min(editorRows - 1, Math.max(0, Math.floor((event.clientY - rect.top) / rect.height * editorRows)));
    return slots[row * editorColumns + column];
  }

  function finishGroupDrag(event: ReactMouseEvent<HTMLDivElement>) {
    const target = groupSlotAtPoint(event);
    const currentDrag = groupDragRef.current && { ...groupDragRef.current, target: target || groupDragRef.current.target };
    if (!currentDrag) return;
    event.preventDefault();
    const minRow = Math.min(currentDrag.anchor.row, currentDrag.target.row);
    const maxRow = Math.max(currentDrag.anchor.row, currentDrag.target.row);
    const minColumn = Math.min(currentDrag.anchor.column, currentDrag.target.column);
    const maxColumn = Math.max(currentDrag.anchor.column, currentDrag.target.column);
    const seatIds = new Set(draft.seats.filter(seat => {
      const slot = slotByCoordinate.get(coordinateKey(seat.x, seat.y));
      return slot && slot.row >= minRow && slot.row <= maxRow && slot.column >= minColumn && slot.column <= maxColumn;
    }).map(seat => seat.id));
    assignSeatsToGroup(seatIds);
    groupDragRef.current = null;
    setGroupDrag(null);
  }

  return (
    <div className="surface-enter flex h-full min-h-0 flex-col" data-seat-layout-editor>
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--app-border)] px-4 py-3">
        <div className="min-w-[15rem] flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[var(--app-text)]">编辑座位槽位</h2>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">{draft.seats.length} 个已启用</span>
            {rangePreview && rangeMode && <span aria-live="polite" className="rounded-full bg-blue-600 px-2 py-0.5 text-[11px] font-bold text-white">{rangePreview.column + 1} 列 × {rangePreview.row + 1} 行</span>}
            {groupDrag && groupMode && <span aria-live="polite" className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">{groupPreviewSeatIds.size} 个座位</span>}
          </div>
        </div>
        <Button size="sm" variant={rangeMode ? "secondary" : "ghost"} aria-pressed={rangeMode} onClick={() => { setRangeMode(value => !value); setRangePreview(null); setGroupMode(false); setGroupDrag(null); }}>
          <Grid2X2 className="h-4 w-4" />{rangeMode ? "批量框选中" : "批量框选"}
        </Button>
        <Button size="sm" variant={groupMode ? "secondary" : "ghost"} aria-pressed={groupMode} onClick={() => { setGroupMode(value => !value); setGroupDrag(null); setRangeMode(false); setRangePreview(null); }}>
          <UsersRound className="h-4 w-4" />{groupMode ? "框选成组中" : "框选成组"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setDraft(cloneLayout(resolvedCurrent)); setSelected(new Set()); setRangeMode(false); setGroupMode(false); setGroupDrag(null); }}>
          <RotateCcw className="h-4 w-4" />恢复进入时布局
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="h-4 w-4" />取消</Button>
        <Button size="sm" onClick={() => { onApply(cloneLayout(draft)); onCancel(); }}><Save className="h-4 w-4" />应用布局</Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="mx-auto flex h-full min-h-0 max-w-6xl flex-col gap-3">

          <div className="min-h-0 flex-1 overflow-auto">
            <div className="seat-grid-editor-frame" style={{ minWidth: `${editorColumns * 64 + 52}px`, minHeight: `${editorRows * 40 + 52}px` }}>
            <SeatGridAxisControls rows={editorRows} columns={editorColumns} disabled={Boolean(groupDrag || groupResize)} onChange={changeAxis} onTarget={target => { setAxisTarget(target); setRangePreview(null); setHoveredGroup(null); }} />
            <div
              ref={gridRef}
              data-seat-layout-slot-grid
              data-group-dragging={groupDrag ? "true" : "false"}
              data-group-resizing={groupResize?.id}
              data-group-target={groupDrag?.target.key}
              className="seat-layout-editor-grid"
              style={{ gridTemplateColumns: `repeat(${editorColumns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${editorRows}, minmax(40px, 1fr))` }}
              onPointerLeave={() => { setRangePreview(null); setHoveredGroup(null); }}
              onMouseUp={finishGroupDrag}
              onMouseMove={event => { if (groupDragRef.current) { const slot = groupSlotAtPoint(event); if (slot) moveGroupDragTo(slot); } }}
            >
              <SeatGroupOverlay groups={overlayGroups} cells={grid.seats} podium={grid.podium} columns={editorColumns} rows={editorRows} hovered={groupResize?.id || (groupDrag ? null : hoveredGroup)} collisions={collisionIds} onHover={id => { setHoveredGroup(id); if (id) setRangePreview(null); }} onUngroup={groupResize || groupDrag ? undefined : ungroup} onRename={groupResize || groupDrag ? undefined : renameGroup} resizable={groupMode && !groupDrag} onResizeStart={beginGroupResize} onResizeNudge={nudgeGroupEdge} />
              {groupDragBounds && <div data-seat-group-selection data-podium-cutout={dragPodium ? "true" : undefined} className="seat-group-selection" style={{ left: `${groupDragBounds.left / editorColumns * 100}%`, top: `${groupDragBounds.top / editorRows * 100}%`, width: `${(groupDragBounds.right - groupDragBounds.left + 1) / editorColumns * 100}%`, height: `${(groupDragBounds.bottom - groupDragBounds.top + 1) / editorRows * 100}%` }}>{dragPodium && <svg className="seat-group-shape__outline" viewBox={`0 0 ${groupDragBounds.right - groupDragBounds.left + 1} ${groupDragBounds.bottom - groupDragBounds.top + 1}`} preserveAspectRatio="none" aria-hidden="true"><path d={getSeatGroupOutlinePath(groupDragBounds.right - groupDragBounds.left + 1, groupDragBounds.bottom - groupDragBounds.top + 1, dragPodium)} vectorEffect="non-scaling-stroke" /></svg>}</div>}
              {slots.map((slot, index) => {
                const seat = seatBySlot.get(slot.key);
                const active = Boolean(seat);
                const podium = podiumSlot?.key === slot.key;
                const preview = previewKeys.has(slot.key) && !podium;
                const selectedSlot = Boolean(seat && selected.has(seat.id));
                return (
                  <div key={seat ? `seat:${seat.id}` : podium ? "podium" : `empty:${slot.key}`} className="group seat-layout-editor-cell" data-seat-layout-slot={slot.key} data-seat-grid-seat={seat?.id} data-axis-target={axisTarget && slot[axisTarget.axis] === axisTarget.index ? "true" : undefined} data-active={active ? "true" : "false"} data-podium={podium ? "true" : "false"} data-group-id={seat?.groupId || undefined} data-group-hovered={!groupDrag && !rangePreview && seat?.groupId && hoveredGroup === seat.groupId ? "true" : "false"} onPointerEnter={() => { if (!groupDragRef.current) setHoveredGroup(seat?.groupId || null); }}>
                    <button
                      type="button"
                      aria-pressed={active}
                      aria-label={`第 ${slot.row + 1} 行第 ${slot.column + 1} 列，${podium ? "讲台" : active ? "已启用" : "未启用"}`}
                      onPointerEnter={() => { if (rangeMode) setRangePreview(slot); }}
                      onMouseEnter={() => moveGroupDragTo(slot)}
                      onMouseDown={event => { beginGroupDrag(event, slot); }}
                      onClick={event => { if (!groupMode) toggleSlot(slot, event.shiftKey || event.metaKey); }}
                      className={`seat-layout-slot__face grid h-full w-full place-items-center rounded-lg border text-[11px] font-bold outline-none transition-[background-color,border-color,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:ring-2 focus-visible:ring-blue-500/30 motion-reduce:transition-none ${podium ? "border-blue-400 bg-blue-50 text-blue-700" : active ? "seat-layout-slot--active border-blue-500 bg-blue-600 text-white" : preview ? "scale-[0.98] border-blue-300 bg-blue-200 text-blue-700" : "border-gray-200 bg-gray-100 text-gray-300 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-400"} ${selectedSlot || (seat && groupPreviewSeatIds.has(seat.id)) ? "ring-2 ring-amber-500 ring-offset-1" : ""}`}
                      style={{ animationDelay: `${Math.min(index, 24) * 8}ms` }}
                    >
                      {podium ? <span className="flex items-center gap-1"><Presentation className="h-3.5 w-3.5" />讲台</span> : active ? <span className="max-w-full truncate px-1">{seat?.label}</span> : preview ? <span>{slot.column + 1} × {slot.row + 1}</span> : <span aria-hidden="true">＋</span>}
                    </button>
                    <button
                      type="button"
                      aria-label={podium ? "取消讲台" : `将第 ${slot.row + 1} 行第 ${slot.column + 1} 列设为讲台`}
                      title={podium ? "取消讲台" : "设为讲台"}
                      onClick={event => { event.stopPropagation(); setPodium(slot); }}
                      className={`absolute right-1 top-1 z-10 grid h-5 w-5 place-items-center rounded-full border bg-white text-blue-600 shadow-sm transition-[opacity,transform,border-color] duration-200 hover:scale-105 hover:border-blue-300 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 motion-reduce:transition-none ${podium ? "border-blue-300 opacity-100" : "pointer-events-none scale-90 border-gray-200 opacity-0 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:scale-100 group-focus-within:opacity-100"}`}
                    ><Presentation className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
            </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 text-xs">
            {selected.size > 0 ? <>
              <span>已选 {selected.size} 座</span>
              <Button size="sm" variant="ghost" disabled={selected.size < 2} onClick={groupSelected}><UsersRound className="h-4 w-4" />组成小组</Button>
              <Button size="sm" variant="ghost" onClick={ungroupSelected}>解除分组</Button>
              <Button size="sm" variant="ghost" disabled={selected.size !== 2} onClick={toggleNeighbor}><Link2 className="h-4 w-4" />切换邻座</Button>
              <Button size="sm" variant="danger" onClick={deleteSelected}><Trash2 className="h-4 w-4" />删除所选</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>取消选择</Button>
            </> : null}
            <span className="flex-1" />
            <span className={waitingCount ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>{waitingCount ? `应用后 ${waitingCount} 名学生进入待排区` : "当前槽位可容纳全部学生"}</span>
          </div>
        </div>
      </div>
      {appDialog.dialog}
    </div>
  );
}
