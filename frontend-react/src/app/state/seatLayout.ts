import type {
  SeatFrontEdge,
  SeatLayoutEdge,
  SeatLayoutGroup,
  SeatLayoutNode,
  SeatLayoutV1,
} from "./types";

export const DEFAULT_SEAT_COLUMNS = 8;
export const MAX_LAYOUT_SEATS = 200;
export const SEAT_LAYOUT_CANVAS_WIDTH = 1000;
export const SEAT_LAYOUT_CANVAS_HEIGHT = 700;
export const SEAT_LAYOUT_EDGE_MARGIN = 50;
export const SEAT_LAYOUT_CARD_WIDTH_PX = 104;
export const SEAT_LAYOUT_CARD_HEIGHT_PX = 68;
export const SEAT_LAYOUT_CARD_GAP_PX = 8;
export const SEAT_LAYOUT_MIN_STAGE_WIDTH_PX = 1040;
export const SEAT_LAYOUT_LOGICAL_CARD_WIDTH = SEAT_LAYOUT_CARD_WIDTH_PX * SEAT_LAYOUT_CANVAS_WIDTH / SEAT_LAYOUT_MIN_STAGE_WIDTH_PX;
export const SEAT_LAYOUT_LOGICAL_CARD_HEIGHT = SEAT_LAYOUT_CARD_HEIGHT_PX * SEAT_LAYOUT_CANVAS_WIDTH / SEAT_LAYOUT_MIN_STAGE_WIDTH_PX;
export const SEAT_LAYOUT_LOGICAL_CARD_GAP = SEAT_LAYOUT_CARD_GAP_PX * SEAT_LAYOUT_CANVAS_WIDTH / SEAT_LAYOUT_MIN_STAGE_WIDTH_PX;
export const SEAT_LAYOUT_SLOT_WIDTH = Math.ceil(SEAT_LAYOUT_LOGICAL_CARD_WIDTH + SEAT_LAYOUT_LOGICAL_CARD_GAP);
export const SEAT_LAYOUT_SLOT_HEIGHT = Math.ceil(SEAT_LAYOUT_LOGICAL_CARD_HEIGHT + SEAT_LAYOUT_LOGICAL_CARD_GAP);
export const SEAT_LAYOUT_EDITOR_COLUMNS = 8;
export const SEAT_LAYOUT_EDITOR_MIN_ROWS = 9;

export interface SeatLayoutPoint {
  x: number;
  y: number;
}

export interface SeatLayoutSlot extends SeatLayoutPoint {
  key: string;
  row: number;
  column: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function makeSeat(id: string, x: number, y: number, label: string, groupId?: string, rotation = 0): SeatLayoutNode {
  return { id, x: Math.round(x), y: Math.round(y), rotation, label, groupId };
}

function distribute(count: number, start: number, end: number): number[] {
  if (count <= 1) return [(start + end) / 2];
  return Array.from({ length: count }, (_, index) => start + (end - start) * index / (count - 1));
}

export function getSeatLayoutSlotKey(row: number, column: number): string {
  return `${row}:${column}`;
}

export function getSeatLayoutEditorRows(seatCount: number): number {
  return clamp(Math.max(SEAT_LAYOUT_EDITOR_MIN_ROWS, Math.ceil(Math.max(1, seatCount) / SEAT_LAYOUT_EDITOR_COLUMNS)), SEAT_LAYOUT_EDITOR_MIN_ROWS, Math.ceil(MAX_LAYOUT_SEATS / SEAT_LAYOUT_EDITOR_COLUMNS));
}

export function getSeatLayoutSlots(rows: number, columns = SEAT_LAYOUT_EDITOR_COLUMNS): SeatLayoutSlot[] {
  const safeRows = clamp(Math.trunc(rows), 1, MAX_LAYOUT_SEATS);
  const safeColumns = clamp(Math.trunc(columns), 1, MAX_LAYOUT_SEATS);
  const xs = distribute(safeColumns, 60, SEAT_LAYOUT_CANVAS_WIDTH - 60);
  const ys = distribute(safeRows, 70, SEAT_LAYOUT_CANVAS_HEIGHT - 70);
  return ys.flatMap((y, row) => xs.map((x, column) => ({
    key: getSeatLayoutSlotKey(row, column),
    row,
    column,
    x: Math.round(x),
    y: Math.round(y),
  })));
}

export function getSeatLayoutFrontEdgeForPoint(point: SeatLayoutPoint): SeatFrontEdge {
  const distances: Array<[SeatFrontEdge, number]> = [
    ["top", point.y],
    ["bottom", SEAT_LAYOUT_CANVAS_HEIGHT - point.y],
    ["left", point.x],
    ["right", SEAT_LAYOUT_CANVAS_WIDTH - point.x],
  ];
  return distances.sort((first, second) => first[1] - second[1])[0][0];
}

function getRectangularTargetColumns(uniqueXs: number[], columns: number): number[] {
  if (uniqueXs.length <= 1) return [Math.floor((columns - 1) / 2)];
  if (uniqueXs.length > columns) {
    return uniqueXs.map((_, index) => Math.round(index * (columns - 1) / (uniqueXs.length - 1)));
  }

  const offset = Math.floor((columns - uniqueXs.length) / 2);
  return uniqueXs.map((_, index) => offset + index);
}

export function snapSeatLayoutToSlotGrid(layout: SeatLayoutV1, rows: number, columns = SEAT_LAYOUT_EDITOR_COLUMNS): SeatLayoutV1 {
  const slots = getSeatLayoutSlots(rows, columns);
  const slotByCoordinate = new Map(slots.map(slot => [`${slot.x}:${slot.y}`, slot]));
  const uniqueXs = [...new Set(layout.seats.map(seat => seat.x))].sort((a, b) => a - b);
  const uniqueYs = [...new Set(layout.seats.map(seat => seat.y))].sort((a, b) => a - b);
  const looksRectangular = uniqueXs.length <= columns
    && uniqueYs.length <= rows
    && (layout.slotGridVersion === 1 || uniqueXs.length * uniqueYs.length <= layout.seats.length + uniqueXs.length);
  const targetColumns = looksRectangular ? getRectangularTargetColumns(uniqueXs, columns) : [];
  const used = new Set<string>();

  const claimNearest = (preferredRow: number, preferredColumn: number): SeatLayoutSlot | undefined => {
    const nearest = slots
      .filter(slot => !used.has(slot.key))
      .sort((first, second) => {
        const firstDistance = (first.row - preferredRow) ** 2 + (first.column - preferredColumn) ** 2;
        const secondDistance = (second.row - preferredRow) ** 2 + (second.column - preferredColumn) ** 2;
        return firstDistance - secondDistance || first.row - second.row || first.column - second.column;
      })[0];
    if (nearest) used.add(nearest.key);
    return nearest;
  };

  const exactSlots = layout.seats.map(seat => slotByCoordinate.get(`${seat.x}:${seat.y}`));
  const alreadySlotted = layout.slotGridVersion === 2
    && exactSlots.every(Boolean)
    && new Set(exactSlots.map(slot => slot?.key)).size === layout.seats.length;
  const seats = alreadySlotted
    ? layout.seats.map((seat, index) => {
      const slot = exactSlots[index]!;
      used.add(slot.key);
      return { ...seat, x: slot.x, y: slot.y };
    })
    : layout.seats.map(seat => {
      const preferredColumn = looksRectangular
        ? targetColumns[uniqueXs.indexOf(seat.x)]
        : Math.round(seat.x / SEAT_LAYOUT_CANVAS_WIDTH * Math.max(0, columns - 1));
      const preferredRow = looksRectangular
        ? uniqueYs.indexOf(seat.y)
        : Math.round(seat.y / SEAT_LAYOUT_CANVAS_HEIGHT * Math.max(0, rows - 1));
      const slot = claimNearest(preferredRow, preferredColumn);
      return slot ? { ...seat, x: slot.x, y: slot.y } : { ...seat };
    });

  let podium = layout.podium ? { ...layout.podium } : undefined;
  if (podium) {
    const exactSlot = slotByCoordinate.get(`${podium.x}:${podium.y}`);
    const preferredColumn = exactSlot?.column ?? Math.round(podium.x / SEAT_LAYOUT_CANVAS_WIDTH * Math.max(0, columns - 1));
    const preferredRow = exactSlot?.row ?? Math.round(podium.y / SEAT_LAYOUT_CANVAS_HEIGHT * Math.max(0, rows - 1));
    const slot = exactSlot && !used.has(exactSlot.key) ? exactSlot : claimNearest(preferredRow, preferredColumn);
    if (slot) used.add(slot.key);
    podium = slot ? { x: slot.x, y: slot.y } : undefined;
  }

  return {
    ...layout,
    slotGridVersion: 2,
    slotGridColumns: columns,
    slotGridRows: rows,
    canvas: { ...layout.canvas },
    podium,
    seats,
    groups: layout.groups.map(group => ({ ...group, seatIds: [...group.seatIds] })),
    neighborEdges: layout.neighborEdges.map(edge => ({ ...edge })),
  };
}

function limitLayout(layout: SeatLayoutV1): SeatLayoutV1 {
  if (layout.seats.length <= MAX_LAYOUT_SEATS) return layout;
  const seats = layout.seats.slice(0, MAX_LAYOUT_SEATS);
  const ids = new Set(seats.map(seat => seat.id));
  return { ...layout, seats, groups: layout.groups.map(group => ({ ...group, seatIds: group.seatIds.filter(id => ids.has(id)) })).filter(group => group.seatIds.length), neighborEdges: layout.neighborEdges.filter(edge => ids.has(edge.a) && ids.has(edge.b)) };
}

export function createGridSeatLayout(input: {
  rows: number;
  columns: number;
  deskSize?: number;
  frontEdge?: SeatFrontEdge;
  template?: SeatLayoutV1["template"];
}): SeatLayoutV1 {
  const rows = clamp(Math.trunc(input.rows), 1, 20);
  const columns = clamp(Math.trunc(input.columns), 1, 20);
  const deskSize = clamp(Math.trunc(input.deskSize || 2), 1, 12);
  const xs = distribute(columns, 80, 920);
  const ys = distribute(rows, 90, 610);
  const seats: SeatLayoutNode[] = [];
  const groups: SeatLayoutGroup[] = [];
  const neighborEdges: SeatLayoutEdge[] = [];
  const columnGroupCount = Math.ceil(columns / deskSize);

  for (let groupIndex = 0; groupIndex < columnGroupCount; groupIndex += 1) {
    groups.push({ id: `group-${groupIndex + 1}`, name: `第 ${groupIndex + 1} 组`, shape: "columns", seatIds: [] });
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const groupIndex = Math.floor(column / deskSize);
      const groupId = groups[groupIndex].id;
      const id = `seat-${index + 1}`;
      seats.push(makeSeat(id, xs[column], ys[rows - 1 - row], `${row + 1}-${column + 1}`, groupId));
      groups[groupIndex].seatIds.push(id);
      const localColumn = column % deskSize;
      if (localColumn > 0) neighborEdges.push({ a: `seat-${index}`, b: id });
    }
  }
  return limitLayout({
    version: 1,
    template: input.template || "grid",
    frontEdge: input.frontEdge || "bottom",
    canvas: { width: SEAT_LAYOUT_CANVAS_WIDTH, height: SEAT_LAYOUT_CANVAS_HEIGHT },
    seats,
    groups,
    neighborEdges,
  });
}

export function createDefaultSeatLayout(seatCount: number): SeatLayoutV1 {
  const rows = Math.max(1, Math.ceil(Math.max(1, seatCount) / DEFAULT_SEAT_COLUMNS));
  const layout = createGridSeatLayout({ rows, columns: DEFAULT_SEAT_COLUMNS, deskSize: 2, template: "default-grid" });
  if (seatCount === 0) return { ...layout, seats: [], groups: layout.groups.map(group => ({ ...group, seatIds: [] })), neighborEdges: [] };
  return layout;
}

export function createGroupedSeatLayout(input: {
  groupCount: number;
  groupRows: number;
  groupColumns: number;
  frontEdge?: SeatFrontEdge;
}): SeatLayoutV1 {
  const groupCount = clamp(Math.trunc(input.groupCount), 1, 20);
  const groupRows = clamp(Math.trunc(input.groupRows), 1, 12);
  const groupColumns = clamp(Math.trunc(input.groupColumns), 1, 12);
  const groupsPerRow = Math.ceil(Math.sqrt(groupCount));
  const groupGridRows = Math.ceil(groupCount / groupsPerRow);
  const seats: SeatLayoutNode[] = [];
  const groups: SeatLayoutGroup[] = [];
  const neighborEdges: SeatLayoutEdge[] = [];
  let seatIndex = 0;

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const gridColumn = groupIndex % groupsPerRow;
    const gridRow = Math.floor(groupIndex / groupsPerRow);
    const groupId = `group-${groupIndex + 1}`;
    const group: SeatLayoutGroup = { id: groupId, name: `第 ${groupIndex + 1} 组`, shape: "grid", seatIds: [] };
    const cellWidth = 860 / groupsPerRow;
    const cellHeight = 540 / groupGridRows;
    const xs = distribute(groupColumns, 70 + gridColumn * cellWidth, 70 + (gridColumn + 1) * cellWidth - 50);
    const ys = distribute(groupRows, 100 + gridRow * cellHeight, 100 + (gridRow + 1) * cellHeight - 50);
    for (let row = 0; row < groupRows; row += 1) {
      for (let column = 0; column < groupColumns; column += 1) {
        seatIndex += 1;
        const id = `seat-${seatIndex}`;
        seats.push(makeSeat(id, xs[column], ys[row], `${groupIndex + 1}-${row + 1}-${column + 1}`, groupId));
        group.seatIds.push(id);
        if (column > 0) neighborEdges.push({ a: `seat-${seatIndex - 1}`, b: id });
        if (row > 0) neighborEdges.push({ a: `seat-${seatIndex - groupColumns}`, b: id });
      }
    }
    groups.push(group);
  }
  return limitLayout({ version: 1, template: "group-grid", frontEdge: input.frontEdge || "bottom", canvas: { width: SEAT_LAYOUT_CANVAS_WIDTH, height: SEAT_LAYOUT_CANVAS_HEIGHT }, seats, groups, neighborEdges });
}

export function createRoundTableSeatLayout(input: { tables: number; seatsPerTable: number; frontEdge?: SeatFrontEdge }): SeatLayoutV1 {
  const tables = clamp(Math.trunc(input.tables), 1, 20);
  const seatsPerTable = clamp(Math.trunc(input.seatsPerTable), 2, 12);
  const tablesPerRow = Math.ceil(Math.sqrt(tables));
  const tableRows = Math.ceil(tables / tablesPerRow);
  const seats: SeatLayoutNode[] = [];
  const groups: SeatLayoutGroup[] = [];
  const neighborEdges: SeatLayoutEdge[] = [];
  let seatIndex = 0;
  for (let tableIndex = 0; tableIndex < tables; tableIndex += 1) {
    const column = tableIndex % tablesPerRow;
    const row = Math.floor(tableIndex / tablesPerRow);
    const centerX = 100 + (column + 0.5) * 800 / tablesPerRow;
    const centerY = 80 + (row + 0.5) * 560 / tableRows;
    const radiusX = Math.min(110, 300 / tablesPerRow);
    const radiusY = Math.min(90, 220 / tableRows);
    const groupId = `group-${tableIndex + 1}`;
    const group: SeatLayoutGroup = { id: groupId, name: `第 ${tableIndex + 1} 组`, shape: "round", seatIds: [] };
    for (let local = 0; local < seatsPerTable; local += 1) {
      seatIndex += 1;
      const id = `seat-${seatIndex}`;
      const angle = -Math.PI / 2 + local * Math.PI * 2 / seatsPerTable;
      seats.push(makeSeat(id, centerX + Math.cos(angle) * radiusX, centerY + Math.sin(angle) * radiusY, `${tableIndex + 1}-${local + 1}`, groupId, Math.round(angle * 180 / Math.PI + 90)));
      group.seatIds.push(id);
    }
    group.seatIds.forEach((id, local) => neighborEdges.push({ a: id, b: group.seatIds[(local + 1) % group.seatIds.length] }));
    groups.push(group);
  }
  return limitLayout({ version: 1, template: "round-table", frontEdge: input.frontEdge || "bottom", canvas: { width: SEAT_LAYOUT_CANVAS_WIDTH, height: SEAT_LAYOUT_CANVAS_HEIGHT }, seats, groups, neighborEdges });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeSeatLayout(value: unknown): SeatLayoutV1 | undefined {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.seats) || value.seats.length > MAX_LAYOUT_SEATS) return undefined;
  const seen = new Set<string>();
  const seats = value.seats.reduce<SeatLayoutNode[]>((result, item, index) => {
    if (!isRecord(item)) return result;
    const id = typeof item.id === "string" && item.id.trim() && !seen.has(item.id) ? item.id : `seat-${index + 1}`;
    if (seen.has(id)) return result;
    seen.add(id);
    result.push(makeSeat(
      id,
      clamp(Number(item.x) || 0, 0, SEAT_LAYOUT_CANVAS_WIDTH),
      clamp(Number(item.y) || 0, 0, SEAT_LAYOUT_CANVAS_HEIGHT),
      typeof item.label === "string" ? item.label : String(index + 1),
      typeof item.groupId === "string" ? item.groupId : undefined,
      clamp(Number(item.rotation) || 0, -180, 180),
    ));
    return result;
  }, []);
  const seatIds = new Set(seats.map(seat => seat.id));
  const groups = Array.isArray(value.groups) ? value.groups.reduce<SeatLayoutGroup[]>((result, item, index) => {
    if (!isRecord(item)) return result;
    const id = typeof item.id === "string" && item.id ? item.id : `group-${index + 1}`;
    result.push({ id, name: typeof item.name === "string" && item.name ? item.name : `第 ${index + 1} 组`, ...(item.nameIsCustom === true ? { nameIsCustom: true } : {}), ...(item.outline === "seats" ? { outline: "seats" as const } : {}), shape: ["columns", "grid", "round", "custom"].includes(String(item.shape)) ? item.shape as SeatLayoutGroup["shape"] : "custom", seatIds: Array.isArray(item.seatIds) ? item.seatIds.filter((seatId): seatId is string => typeof seatId === "string" && seatIds.has(seatId)) : [] });
    return result;
  }, []) : [];
  const edgeSeen = new Set<string>();
  const neighborEdges = Array.isArray(value.neighborEdges) ? value.neighborEdges.reduce<SeatLayoutEdge[]>((result, item) => {
    if (!isRecord(item) || typeof item.a !== "string" || typeof item.b !== "string" || item.a === item.b || !seatIds.has(item.a) || !seatIds.has(item.b)) return result;
    const key = edgeKey(item.a, item.b);
    if (!edgeSeen.has(key)) { edgeSeen.add(key); result.push({ a: item.a, b: item.b }); }
    return result;
  }, []) : [];
  const templates = ["default-grid", "grid", "group-grid", "round-table", "freeform"];
  const frontEdges = ["top", "bottom", "left", "right"];
  return {
    version: 1,
    slotGridVersion: value.slotGridVersion === 2 ? 2 : value.slotGridVersion === 1 ? 1 : undefined,
    slotGridColumns: value.slotGridVersion === 2 ? clamp(Math.trunc(Number(value.slotGridColumns) || 8), 1, 20) : undefined,
    slotGridRows: value.slotGridVersion === 2 ? clamp(Math.trunc(Number(value.slotGridRows) || 9), 1, MAX_LAYOUT_SEATS) : undefined,
    template: templates.includes(String(value.template)) ? value.template as SeatLayoutV1["template"] : "freeform",
    frontEdge: frontEdges.includes(String(value.frontEdge)) ? value.frontEdge as SeatFrontEdge : "bottom",
    canvas: { width: SEAT_LAYOUT_CANVAS_WIDTH, height: SEAT_LAYOUT_CANVAS_HEIGHT },
    podium: isRecord(value.podium) ? {
      x: clamp(Number(value.podium.x) || 0, 0, SEAT_LAYOUT_CANVAS_WIDTH),
      y: clamp(Number(value.podium.y) || 0, 0, SEAT_LAYOUT_CANVAS_HEIGHT),
    } : undefined,
    seats,
    groups,
    neighborEdges,
  };
}

export function resolveSeatLayout(layout: SeatLayoutV1 | undefined, seatCount: number): SeatLayoutV1 {
  const resolved = normalizeSeatLayout(layout) || createDefaultSeatLayout(seatCount);
  return resolved.slotGridVersion ? repairSeatLayoutGroups(resolved) : resolved;
}

/** Keep exclusive membership, including explicitly trimmed contours; reject ambiguous legacy rectangles. */
export function repairSeatLayoutGroups(layout: SeatLayoutV1): SeatLayoutV1 {
  const bounds = (ids: string[]) => {
    const members = layout.seats.filter(seat => ids.includes(seat.id));
    return { left: Math.min(...members.map(seat => seat.x)), right: Math.max(...members.map(seat => seat.x)), top: Math.min(...members.map(seat => seat.y)), bottom: Math.max(...members.map(seat => seat.y)) };
  };
  const kept: Array<{ group: SeatLayoutGroup; box: ReturnType<typeof bounds> }> = [];
  const validIds = new Set(layout.seats.filter(seat => !layout.podium || seat.x !== layout.podium.x || seat.y !== layout.podium.y).map(seat => seat.id));
  const claimed = new Set<string>();
  // Newer explicit selections win over old overlapping groups, without moving/deleting seats.
  for (const source of [...layout.groups].reverse()) {
    const group = { ...source, seatIds: [...new Set(source.seatIds)].filter(id => validIds.has(id) && (source.outline !== "seats" || !claimed.has(id))) };
    if (!group.seatIds.length) continue;
    const box = bounds(group.seatIds);
    const inside = layout.seats.filter(seat => seat.x >= box.left && seat.x <= box.right && seat.y >= box.top && seat.y <= box.bottom);
    if (group.outline !== "seats") {
      if (!inside.length || inside.some(seat => !group.seatIds.includes(seat.id))) continue;
      if (kept.some(item => item.group.outline === "seats"
        ? inside.some(seat => item.group.seatIds.includes(seat.id))
        : box.left <= item.box.right && box.right >= item.box.left && box.top <= item.box.bottom && box.bottom >= item.box.top)) continue;
    }
    group.seatIds.forEach(id => claimed.add(id));
    kept.push({ group, box });
  }
  const isAutomatic = (group: SeatLayoutGroup) => !group.nameIsCustom && /^第\s*\d+\s*组$/.test(group.name);
  const reservedNames = new Set(kept.filter(({ group }) => !isAutomatic(group)).map(({ group }) => group.name.replace(/\s/g, "")));
  const groups = kept.sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left).map(({ group }, index) => {
    if (!isAutomatic(group)) return group;
    let number = index + 1;
    while (reservedNames.has(`第${number}组`)) number += 1;
    reservedNames.add(`第${number}组`);
    return { ...group, name: `第 ${number} 组` };
  });
  const membership = new Map(groups.flatMap(group => group.seatIds.map(id => [id, group.id] as const)));
  return { ...layout, groups, seats: layout.seats.map(seat => ({ ...seat, groupId: membership.get(seat.id) })) };
}

export function normalizeSeatGroupName(value: string): string {
  const name = value.trim();
  const number = name.match(/^(?:第\s*)?([1-9]\d*)\s*(?:组)?$/)?.[1];
  return number ? `第 ${number} 组` : name;
}

export function getSeatGroupNameError(layout: SeatLayoutV1, groupId: string, value: string): string | undefined {
  const name = normalizeSeatGroupName(value);
  if (!name) return "请输入组名";
  if (name.length > 24) return "组名不能超过 24 个字";
  if (layout.groups.some(group => group.id !== groupId && group.name.replace(/\s/g, "") === name.replace(/\s/g, ""))) return "已有同名小组，请换一个组名";
  return undefined;
}

export function renameSeatLayoutGroup(layout: SeatLayoutV1, groupId: string, value: string): SeatLayoutV1 {
  if (!layout.groups.some(group => group.id === groupId) || getSeatGroupNameError(layout, groupId, value)) return layout;
  return { ...layout, groups: layout.groups.map(group => group.id === groupId ? { ...group, name: normalizeSeatGroupName(value), nameIsCustom: true } : group) };
}

export function groupSeatLayoutRectangle(layout: SeatLayoutV1, ids: Set<string>, groupId: string): SeatLayoutV1 {
  const selected = layout.seats.filter(seat => ids.has(seat.id));
  if (selected.length < 2) return layout;
  const left = Math.min(...selected.map(seat => seat.x)), right = Math.max(...selected.map(seat => seat.x));
  const top = Math.min(...selected.map(seat => seat.y)), bottom = Math.max(...selected.map(seat => seat.y));
  const inside = layout.seats.filter(seat => seat.x >= left && seat.x <= right && seat.y >= top && seat.y <= bottom);
  const insideIds = new Set(inside.filter(seat => !layout.podium || seat.x !== layout.podium.x || seat.y !== layout.podium.y).map(seat => seat.id));
  if (insideIds.size < 2) return layout;
  const existing = layout.groups.find(group => group.id === groupId);
  const remainders = layout.groups.filter(group => group.id !== groupId).flatMap(group => {
    const remaining = group.seatIds.filter(id => !insideIds.has(id));
    if (!remaining.length) return [];
    return [{ ...group, nameIsCustom: true, ...(remaining.length !== group.seatIds.length ? { outline: "seats" as const } : {}), seatIds: remaining }];
  });
  const names = new Set([...remainders.map(group => group.name.replace(/\s/g, "")), ...(existing ? [existing.name.replace(/\s/g, "")] : [])]);
  const nextName = () => { let number = 1; while (names.has(`第${number}组`)) number += 1; names.add(`第${number}组`); return `第 ${number} 组`; };
  const targetName = existing?.name || nextName();
  const usedIds = new Set([...layout.groups.map(group => group.id), groupId]);
  const slots = getSeatLayoutSlots(layout.slotGridRows || 9, layout.slotGridColumns || 8);
  const slotByPoint = new Map(slots.map(slot => [`${slot.x}:${slot.y}`, slot]));
  const retained = remainders.flatMap(group => {
    const previous = layout.groups.find(item => item.id === group.id)!;
    if (previous.seatIds.length === group.seatIds.length) return [group];
    const byCell = new Map(layout.seats.filter(seat => group.seatIds.includes(seat.id)).map(seat => {
      const slot = slotByPoint.get(`${seat.x}:${seat.y}`);
      return [slot ? `${slot.row}:${slot.column}` : seat.id, seat.id] as const;
    }));
    const components: string[][] = [];
    // Top-left remaining piece keeps the original name/ID; each disconnected piece gets a fresh group.
    for (const key of [...byCell.keys()].sort((a, b) => {
      const [ar, ac] = a.split(":").map(Number), [br, bc] = b.split(":").map(Number);
      return ar - br || ac - bc;
    })) {
      if (!byCell.has(key)) continue;
      const members: string[] = [], queue = [key];
      while (queue.length) {
        const cell = queue.pop()!;
        const seatId = byCell.get(cell);
        if (!seatId) continue;
        byCell.delete(cell); members.push(seatId);
        const [row, column] = cell.split(":").map(Number);
        queue.push(`${row - 1}:${column}`, `${row + 1}:${column}`, `${row}:${column - 1}`, `${row}:${column + 1}`);
      }
      components.push(group.seatIds.filter(id => members.includes(id)));
    }
    return components.map((seatIds, index) => {
      if (!index) return { ...group, seatIds };
      let suffix = index + 1;
      while (usedIds.has(`${group.id}-part-${suffix}`)) suffix += 1;
      const id = `${group.id}-part-${suffix}`;
      usedIds.add(id);
      return { ...group, id, name: nextName(), seatIds };
    });
  });
  return repairSeatLayoutGroups({ ...layout, template: "freeform", groups: [...retained, { id: groupId, name: targetName, nameIsCustom: true, shape: "custom", seatIds: [...insideIds] }] });
}

export function isSeatLayoutPointClear(layout: SeatLayoutV1, seatId: string | undefined, x: number, y: number): boolean {
  const horizontalClearance = SEAT_LAYOUT_LOGICAL_CARD_WIDTH + SEAT_LAYOUT_LOGICAL_CARD_GAP;
  const verticalClearance = SEAT_LAYOUT_LOGICAL_CARD_HEIGHT + SEAT_LAYOUT_LOGICAL_CARD_GAP;
  return layout.seats.every(seat => seat.id === seatId || Math.abs(seat.x - x) >= horizontalClearance || Math.abs(seat.y - y) >= verticalClearance);
}

export function getSeatLayoutOpenPoints(layout: SeatLayoutV1, ignoredSeatId?: string): SeatLayoutPoint[] {
  const minX = SEAT_LAYOUT_EDGE_MARGIN;
  const maxX = layout.canvas.width - SEAT_LAYOUT_EDGE_MARGIN;
  const minY = SEAT_LAYOUT_EDGE_MARGIN;
  const maxY = layout.canvas.height - SEAT_LAYOUT_EDGE_MARGIN;
  const candidates = new Map<string, SeatLayoutPoint>();
  const addCandidate = (x: number, y: number) => {
    if (x < minX || x > maxX || y < minY || y > maxY || !isSeatLayoutPointClear(layout, ignoredSeatId, x, y)) return;
    const point = { x: Math.round(x), y: Math.round(y) };
    if (!isSeatLayoutPointClear(layout, ignoredSeatId, point.x, point.y)) return;
    candidates.set(`${point.x}:${point.y}`, point);
  };

  const ignoredSeat = ignoredSeatId ? layout.seats.find(seat => seat.id === ignoredSeatId) : undefined;
  if (ignoredSeat) addCandidate(ignoredSeat.x, ignoredSeat.y);

  for (let y = minY; y <= maxY; y += SEAT_LAYOUT_SLOT_HEIGHT) {
    for (let x = minX; x <= maxX; x += SEAT_LAYOUT_SLOT_WIDTH) addCandidate(x, y);
  }

  for (const seat of layout.seats) {
    for (const offsetX of [-SEAT_LAYOUT_SLOT_WIDTH, 0, SEAT_LAYOUT_SLOT_WIDTH]) {
      for (const offsetY of [-SEAT_LAYOUT_SLOT_HEIGHT, 0, SEAT_LAYOUT_SLOT_HEIGHT]) {
        if (offsetX || offsetY) addCandidate(seat.x + offsetX, seat.y + offsetY);
      }
    }
  }

  if (!layout.seats.length) addCandidate(layout.canvas.width / 2, layout.canvas.height / 2);
  return [...candidates.values()];
}

export function findNearestSeatLayoutOpenPoint(layout: SeatLayoutV1, preferredX: number, preferredY: number, ignoredSeatId?: string): SeatLayoutPoint | null {
  let nearest: { point: SeatLayoutPoint; distance: number } | null = null;
  for (const point of getSeatLayoutOpenPoints(layout, ignoredSeatId)) {
    const distance = (point.x - preferredX) ** 2 + (point.y - preferredY) ** 2;
    if (!nearest || distance < nearest.distance) nearest = { point, distance };
  }
  return nearest?.point ?? null;
}

export function findSeatLayoutOpenPoint(layout: SeatLayoutV1, preferredX = layout.canvas.width / 2, preferredY = layout.canvas.height / 2): { x: number; y: number } | null {
  return findNearestSeatLayoutOpenPoint(layout, preferredX, preferredY);
}

export function getSeatLayoutStageMinWidth(layout: SeatLayoutV1): number {
  let requiredWidth = SEAT_LAYOUT_MIN_STAGE_WIDTH_PX;
  const requiredHorizontalGap = SEAT_LAYOUT_CARD_WIDTH_PX + SEAT_LAYOUT_CARD_GAP_PX;
  const requiredVerticalGap = SEAT_LAYOUT_CARD_HEIGHT_PX + SEAT_LAYOUT_CARD_GAP_PX;

  for (let first = 0; first < layout.seats.length; first += 1) {
    for (let second = first + 1; second < layout.seats.length; second += 1) {
      const dx = Math.abs(layout.seats[first].x - layout.seats[second].x);
      const dy = Math.abs(layout.seats[first].y - layout.seats[second].y);
      if (dx === 0 && dy === 0) continue;
      const widthForX = dx > 0 ? requiredHorizontalGap * layout.canvas.width / dx : Number.POSITIVE_INFINITY;
      const widthForY = dy > 0 ? requiredVerticalGap * layout.canvas.width / dy : Number.POSITIVE_INFINITY;
      requiredWidth = Math.max(requiredWidth, Math.min(widthForX, widthForY));
    }
  }

  return Math.ceil(requiredWidth);
}

export function getNeighborIndexPairs(layout: SeatLayoutV1): Array<[number, number]> {
  const indexById = new Map(layout.seats.map((seat, index) => [seat.id, index]));
  return layout.neighborEdges.reduce<Array<[number, number]>>((pairs, edge) => {
    const a = indexById.get(edge.a); const b = indexById.get(edge.b);
    if (a !== undefined && b !== undefined) pairs.push([a, b]);
    return pairs;
  }, []);
}

export function areSeatIndicesNeighbors(layout: SeatLayoutV1, a: number, b: number): boolean {
  const seatA = layout.seats[a]; const seatB = layout.seats[b];
  return Boolean(seatA && seatB && layout.neighborEdges.some(edge => edgeKey(edge.a, edge.b) === edgeKey(seatA.id, seatB.id)));
}

export function areSeatIndicesInSameGroup(layout: SeatLayoutV1, a: number, b: number): boolean {
  const groupA = layout.seats[a]?.groupId;
  return Boolean(groupA && groupA === layout.seats[b]?.groupId);
}

export function getFrontSeatIndices(layout: SeatLayoutV1, depthRows: number): Set<number> {
  const depth = Math.max(1, depthRows);
  const values = layout.seats.map(seat => layout.frontEdge === "top" ? seat.y : layout.frontEdge === "bottom" ? -seat.y : layout.frontEdge === "left" ? seat.x : -seat.x);
  const distinct = [...new Set(values.map(value => Math.round(value / 25) * 25))].sort((a, b) => a - b);
  const cutoff = distinct[Math.min(depth - 1, distinct.length - 1)] ?? 0;
  return new Set(values.map((value, index) => value <= cutoff ? index : -1).filter(index => index >= 0));
}

export function getSeatPositionLabel(layout: SeatLayoutV1, index: number): string {
  if (index < 0 || !layout.seats[index]) return "未入座";
  const seat = layout.seats[index];
  const group = layout.groups.find(item => item.id === seat.groupId);
  return `${group ? `${group.name} · ` : ""}${seat.label || `座位 ${index + 1}`}`;
}
