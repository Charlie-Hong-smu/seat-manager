import { describe, expect, it } from "vitest";

import { createDefaultSeatLayout, createGridSeatLayout, createGroupedSeatLayout, createRoundTableSeatLayout, getFrontSeatIndices, getNeighborIndexPairs, MAX_LAYOUT_SEATS, normalizeSeatLayout } from "./seatLayout";

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
});
