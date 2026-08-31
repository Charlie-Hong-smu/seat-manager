import { getSeatLayoutEditorRows, getSeatLayoutSlots, groupSeatLayoutRectangle, repairSeatLayoutGroups, snapSeatLayoutToSlotGrid } from "./seatLayout";
import type { SeatLayoutV1 } from "./types";

export interface GridCell { row: number; column: number }
export interface SeatGroupBounds { left: number; right: number; top: number; bottom: number }
export type SeatGroupEdge = "top" | "right" | "bottom" | "left";
export type SeatGridAxis = "row" | "column";
export const MAX_SEAT_GRID_ROWS = 25;
export const MAX_SEAT_GRID_COLUMNS = 20;

/** Derived grid migration: stable IDs/order and original teacher data are never rewritten on load. */
export function prepareSeatLayoutGrid(source: SeatLayoutV1): SeatLayoutV1 {
  if (source.slotGridVersion === 2) return repairSeatLayoutGroups(source);
  const columns = source.slotGridVersion === 1
    ? Math.max(8, new Set(source.seats.map(seat => seat.x)).size)
    : 8;
  const rows = Math.max(getSeatLayoutEditorRows(source.seats.length), Math.ceil(source.seats.length / columns));
  return repairSeatLayoutGroups(snapSeatLayoutToSlotGrid(source, rows, columns));
}

export function getSeatGridCells(layout: SeatLayoutV1) {
  const columns = layout.slotGridColumns || 8;
  const rows = layout.slotGridRows || 9;
  const slots = getSeatLayoutSlots(rows, columns);
  const byPoint = new Map(slots.map(slot => [`${slot.x}:${slot.y}`, slot]));
  const seats = new Map(layout.seats.map(seat => [seat.id, byPoint.get(`${seat.x}:${seat.y}`)!]));
  const podium = layout.podium ? byPoint.get(`${layout.podium.x}:${layout.podium.y}`) : undefined;
  return { columns, rows, slots, seats, podium };
}

/** Resize a draft without moving any existing row/column or changing seat IDs. */
export function resizeSeatLayoutGrid(layout: SeatLayoutV1, rows: number, columns: number): SeatLayoutV1 {
  const before = getSeatGridCells(layout);
  const after = new Map(getSeatLayoutSlots(rows, columns).map(slot => [slot.key, slot]));
  return {
    ...layout, slotGridRows: rows, slotGridColumns: columns,
    seats: layout.seats.map(seat => {
      const cell = before.seats.get(seat.id);
      const next = cell && after.get(cell.key);
      return next ? { ...seat, x: next.x, y: next.y } : seat;
    }),
    podium: before.podium ? after.get(before.podium.key) : undefined,
  };
}

/** Insert an empty strip at a boundary, or delete exactly one strip. Surviving IDs/order stay stable. */
export function changeSeatGridAxis(layout: SeatLayoutV1, axis: SeatGridAxis, index: number, action: "insert" | "delete"): SeatLayoutV1 {
  const before = getSeatGridCells(layout);
  const count = axis === "row" ? before.rows : before.columns;
  const limit = axis === "row" ? MAX_SEAT_GRID_ROWS : MAX_SEAT_GRID_COLUMNS;
  if (!Number.isInteger(index) || index < 0 || index >= count + (action === "insert" ? 1 : 0)) return layout;
  if (action === "insert" ? count >= limit : count <= 1) return layout;
  const delta = action === "insert" ? 1 : -1;
  const rows = before.rows + (axis === "row" ? delta : 0);
  const columns = before.columns + (axis === "column" ? delta : 0);
  const after = new Map(getSeatLayoutSlots(rows, columns).map(slot => [slot.key, slot]));
  const move = (cell: GridCell | undefined) => {
    if (!cell || (action === "delete" && cell[axis] === index)) return undefined;
    const shifted = cell[axis] >= index ? cell[axis] + delta : cell[axis];
    return after.get(axis === "row" ? `${shifted}:${cell.column}` : `${cell.row}:${shifted}`);
  };
  const seats = layout.seats.flatMap(seat => {
    const next = move(before.seats.get(seat.id));
    return next ? [{ ...seat, x: next.x, y: next.y }] : [];
  });
  const ids = new Set(seats.map(seat => seat.id));
  const podium = move(before.podium);
  return repairSeatLayoutGroups({
    ...layout, template: "freeform", slotGridVersion: 2, slotGridRows: rows, slotGridColumns: columns,
    seats, podium: podium ? { x: podium.x, y: podium.y } : undefined,
    groups: layout.groups.map(group => ({ ...group, seatIds: group.seatIds.filter(id => ids.has(id)) })).filter(group => group.seatIds.length),
    neighborEdges: layout.neighborEdges.filter(edge => ids.has(edge.a) && ids.has(edge.b)),
  });
}

export function getSeatGroupGridBounds(layout: SeatLayoutV1, id: string): SeatGroupBounds | undefined {
  const group = layout.groups.find(item => item.id === id);
  const cells = getSeatGridCells(layout).seats;
  const members = group?.seatIds.flatMap(seatId => cells.get(seatId) ? [cells.get(seatId)!] : []) || [];
  if (!members.length) return undefined;
  return { left: Math.min(...members.map(cell => cell.column)), right: Math.max(...members.map(cell => cell.column)), top: Math.min(...members.map(cell => cell.row)), bottom: Math.max(...members.map(cell => cell.row)) };
}

export function getSeatGroupCollisions(layout: SeatLayoutV1, bounds: SeatGroupBounds, ignoredId?: string) {
  const cells = getSeatGridCells(layout).seats;
  return layout.groups.filter(group => group.id !== ignoredId && group.seatIds.some(id => {
    const cell = cells.get(id);
    return cell && cell.column >= bounds.left && cell.column <= bounds.right && cell.row >= bounds.top && cell.row <= bounds.bottom;
  }));
}

/** Preview only: overlapping groups are allowed here; the editor must confirm before committing. */
export function getSeatGroupResizeBounds(layout: SeatLayoutV1, id: string, edge: SeatGroupEdge, point: GridCell): SeatGroupBounds | undefined {
  const initial = getSeatGroupGridBounds(layout, id);
  if (!initial) return undefined;
  const { rows, columns, seats } = getSeatGridCells(layout);
  const next = { ...initial };
  if (edge === "left") next.left = Math.max(0, Math.min(initial.right, point.column));
  if (edge === "right") next.right = Math.min(columns - 1, Math.max(initial.left, point.column));
  if (edge === "top") next.top = Math.max(0, Math.min(initial.bottom, point.row));
  if (edge === "bottom") next.bottom = Math.min(rows - 1, Math.max(initial.top, point.row));
  return [...seats.values()].filter(cell => cell.column >= next.left && cell.column <= next.right && cell.row >= next.top && cell.row <= next.bottom).length >= 2 ? next : initial;
}

export function resizeSeatLayoutGroup(layout: SeatLayoutV1, id: string, bounds: SeatGroupBounds): SeatLayoutV1 {
  if (!layout.groups.some(group => group.id === id)) return layout;
  const cells = getSeatGridCells(layout).seats;
  const ids = layout.seats.filter(seat => {
    const cell = cells.get(seat.id);
    return cell && cell.column >= bounds.left && cell.column <= bounds.right && cell.row >= bounds.top && cell.row <= bounds.bottom;
  }).map(seat => seat.id);
  if (ids.length < 2) return layout;
  return groupSeatLayoutRectangle(layout, new Set(ids), id);
}

/** Trace actual cell contours, including holes, disconnected islands and diagonal contacts. */
export function getSeatGroupOutlinePath(columns: number, rows: number, podium?: GridCell, members?: GridCell[], inset = { x: 0, y: 0 }): string {
  type Edge = { x: number; y: number; nx: number; ny: number; direction: number };
  const edges = new Map<string, Edge[]>();
  const occupied = members && new Set(members.map(cell => `${cell.column},${cell.row}`));
  const filled = (x: number, y: number) => x >= 0 && x < columns && y >= 0 && y < rows && !(podium?.column === x && podium.row === y) && (!occupied || occupied.has(`${x},${y}`));
  const add = (x: number, y: number, nx: number, ny: number, direction: number) => {
    const key = `${x},${y}`;
    edges.set(key, [...edges.get(key) || [], { x, y, nx, ny, direction }]);
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < columns; x++) {
    if (!filled(x, y)) continue;
    if (!filled(x, y - 1)) add(x, y, x + 1, y, 0);
    if (!filled(x + 1, y)) add(x + 1, y, x + 1, y + 1, 1);
    if (!filled(x, y + 1)) add(x + 1, y + 1, x, y + 1, 2);
    if (!filled(x - 1, y)) add(x, y + 1, x, y, 3);
  }
  let path = "";
  while (edges.size) {
    const start = edges.values().next().value![0];
    let current = start;
    const loop: Edge[] = [];
    do {
      loop.push(current);
      const key = `${current.x},${current.y}`;
      const rest = edges.get(key)!.filter(edge => edge !== current);
      if (rest.length) edges.set(key, rest); else edges.delete(key);
      if (current.nx === start.x && current.ny === start.y) break;
      const candidates = edges.get(`${current.nx},${current.ny}`)!;
      // Keep the occupied cells on the right, so diagonal islands do not merge at a vertex.
      const priority = (edge: Edge) => [1, 0, 3, 2].indexOf((edge.direction - current.direction + 4) % 4);
      current = [...candidates].sort((a, b) => priority(a) - priority(b))[0];
    } while (current);
    const points = loop.map((edge, index) => {
      const previous = loop[(index + loop.length - 1) % loop.length];
      const normal = (item: Edge) => ({ x: item.y - item.ny, y: item.nx - item.x });
      const a = normal(previous), b = normal(edge);
      return `${edge.x + (a.x || b.x) * inset.x},${edge.y + (a.y || b.y) * inset.y}`;
    });
    path += `M${points.join("L")}L${points[0]}Z`;
  }
  return path;
}
