import type {
  SeatFrontEdge,
  SeatLayoutEdge,
  SeatLayoutGroup,
  SeatLayoutNode,
  SeatLayoutV1,
} from "./types";

export const DEFAULT_SEAT_COLUMNS = 8;
export const MAX_LAYOUT_SEATS = 200;
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 700;

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
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
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
  return limitLayout({ version: 1, template: "group-grid", frontEdge: input.frontEdge || "bottom", canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }, seats, groups, neighborEdges });
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
  return limitLayout({ version: 1, template: "round-table", frontEdge: input.frontEdge || "bottom", canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }, seats, groups, neighborEdges });
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
      clamp(Number(item.x) || 0, 0, CANVAS_WIDTH),
      clamp(Number(item.y) || 0, 0, CANVAS_HEIGHT),
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
    result.push({ id, name: typeof item.name === "string" && item.name ? item.name : `第 ${index + 1} 组`, shape: ["columns", "grid", "round", "custom"].includes(String(item.shape)) ? item.shape as SeatLayoutGroup["shape"] : "custom", seatIds: Array.isArray(item.seatIds) ? item.seatIds.filter((seatId): seatId is string => typeof seatId === "string" && seatIds.has(seatId)) : [] });
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
    template: templates.includes(String(value.template)) ? value.template as SeatLayoutV1["template"] : "freeform",
    frontEdge: frontEdges.includes(String(value.frontEdge)) ? value.frontEdge as SeatFrontEdge : "bottom",
    canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT },
    seats,
    groups,
    neighborEdges,
  };
}

export function resolveSeatLayout(layout: SeatLayoutV1 | undefined, seatCount: number): SeatLayoutV1 {
  return normalizeSeatLayout(layout) || createDefaultSeatLayout(seatCount);
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
