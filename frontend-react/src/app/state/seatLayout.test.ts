import { describe, expect, it } from "vitest";

import { createDefaultSeatLayout, createGridSeatLayout, createGroupedSeatLayout, createRoundTableSeatLayout, findNearestSeatLayoutOpenPoint, getFrontSeatIndices, getNeighborIndexPairs, getSeatLayoutEditorRows, getSeatLayoutFrontEdgeForPoint, getSeatLayoutOpenPoints, getSeatLayoutSlots, getSeatLayoutStageMinWidth, isSeatLayoutPointClear, MAX_LAYOUT_SEATS, normalizeSeatLayout, SEAT_LAYOUT_MIN_STAGE_WIDTH_PX, SEAT_LAYOUT_SLOT_HEIGHT, SEAT_LAYOUT_SLOT_WIDTH, snapSeatLayoutToSlotGrid } from "./seatLayout";

describe("seat layout topology", () => {
  it("keeps the legacy default at eight columns and four column groups", () => {
    const layout = createDefaultSeatLayout(10);
    expect(layout.template).toBe("default-grid");
    expect(layout.seats).toHaveLength(16);
    expect(layout.groups).toHaveLength(4);
    expect(getNeighborIndexPairs(layout)).toHaveLength(8);
    expect(layout.seats[0]).toMatchObject({ id: "seat-1", label: "1-1", groupId: "group-1" });
  });

  it("builds custom grid, three-row groups and round tables", () => {
    const grid = createGridSeatLayout({ rows: 5, columns: 7, deskSize: 2 });
    expect(grid.seats).toHaveLength(35);
    expect(grid.groups).toHaveLength(4);

    const grouped = createGroupedSeatLayout({ groupCount: 4, groupRows: 3, groupColumns: 2 });
    expect(grouped.seats).toHaveLength(24);
    expect(grouped.groups.every(group => group.seatIds.length === 6)).toBe(true);

    const round = createRoundTableSeatLayout({ tables: 3, seatsPerTable: 6 });
    expect(round.seats).toHaveLength(18);
    expect(round.groups.every(group => group.shape === "round" && group.seatIds.length === 6)).toBe(true);
    expect(getNeighborIndexPairs(normalizeSeatLayout(round)!)).toHaveLength(18);
  });

  it("derives the front zone from the selected classroom edge", () => {
    const bottom = createGridSeatLayout({ rows: 3, columns: 4, frontEdge: "bottom" });
    const top = { ...bottom, frontEdge: "top" as const };
    expect([...getFrontSeatIndices(bottom, 1)]).toEqual([0, 1, 2, 3]);
    expect([...getFrontSeatIndices(top, 1)]).toEqual([8, 9, 10, 11]);
  });

  it("caps generated and imported layouts at the supported capacity", () => {
    expect(createGridSeatLayout({ rows: 20, columns: 20 }).seats).toHaveLength(MAX_LAYOUT_SEATS);
    const oversized = { ...createGridSeatLayout({ rows: 2, columns: 2 }), seats: Array.from({ length: MAX_LAYOUT_SEATS + 1 }, (_, index) => ({ id: `s-${index}`, x: 1, y: 1, rotation: 0, label: String(index) })) };
    expect(normalizeSeatLayout(oversized)).toBeUndefined();
  });

  it("offers fixed-distance freeform slots without overlapping another seat", () => {
    const layout = createGridSeatLayout({ rows: 1, columns: 1 });
    const source = layout.seats[0];
    const points = getSeatLayoutOpenPoints(layout, source.id);
    expect(points).toContainEqual({ x: source.x, y: source.y });
    expect(points).toContainEqual({ x: source.x + SEAT_LAYOUT_SLOT_WIDTH, y: source.y });
    expect(points).toContainEqual({ x: source.x, y: source.y + SEAT_LAYOUT_SLOT_HEIGHT });
    expect(points.every(point => isSeatLayoutPointClear(layout, source.id, point.x, point.y))).toBe(true);
    expect(findNearestSeatLayoutOpenPoint(layout, source.x + SEAT_LAYOUT_SLOT_WIDTH, source.y, source.id)).toEqual({ x: source.x + SEAT_LAYOUT_SLOT_WIDTH, y: source.y });
  });

  it("expands the rendered stage when fixed-size seat cards would overlap", () => {
    const layout = createGridSeatLayout({ rows: 8, columns: 8 });
    const width = getSeatLayoutStageMinWidth(layout);
    expect(width).toBeGreaterThanOrEqual(SEAT_LAYOUT_MIN_STAGE_WIDTH_PX);
    for (let first = 0; first < layout.seats.length; first += 1) {
      for (let second = first + 1; second < layout.seats.length; second += 1) {
        const dx = Math.abs(layout.seats[first].x - layout.seats[second].x) * width / layout.canvas.width;
        const dy = Math.abs(layout.seats[first].y - layout.seats[second].y) * width / layout.canvas.width;
        expect(dx >= 112 || dy >= 76).toBe(true);
      }
    }
  });

  it("maps an existing classroom into contiguous fixed slots while preserving stable ids", () => {
    const layout = createGridSeatLayout({ rows: 6, columns: 8 });
    const editorRows = getSeatLayoutEditorRows(layout.seats.length);
    const slots = getSeatLayoutSlots(editorRows);
    const slotByPoint = new Map(slots.map(slot => [`${slot.x}:${slot.y}`, slot]));
    const snapped = snapSeatLayoutToSlotGrid(layout, editorRows);
    const occupied = snapped.seats.map(seat => slotByPoint.get(`${seat.x}:${seat.y}`));
    expect(snapped.seats.map(seat => seat.id)).toEqual(layout.seats.map(seat => seat.id));
    expect(new Set(occupied.map(slot => slot?.column))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(new Set(occupied.map(slot => slot?.row))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    expect(snapped.seats.find(seat => seat.id === "seat-1")!.y).toBeGreaterThan(snapped.seats.find(seat => seat.id === "seat-41")!.y);
    expect(snapSeatLayoutToSlotGrid(snapped, editorRows).seats).toEqual(snapped.seats);
  });

  it("preserves a snapped podium and derives its classroom edge", () => {
    const layout = createGridSeatLayout({ rows: 2, columns: 2 });
    const podium = { x: 500, y: 680 };
    const normalized = normalizeSeatLayout({ ...layout, podium });
    expect(normalized?.podium).toEqual(podium);
    expect(getSeatLayoutFrontEdgeForPoint(podium)).toBe("bottom");
    const snapped = snapSeatLayoutToSlotGrid(normalized!, getSeatLayoutEditorRows(layout.seats.length));
    expect(snapped.podium).toBeDefined();
    expect(snapped.seats.some(seat => seat.x === snapped.podium?.x && seat.y === snapped.podium?.y)).toBe(false);
  });
});
