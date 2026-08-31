import { describe, expect, it } from "vitest";
import { createGridSeatLayout, getSeatGroupNameError, getSeatLayoutSlots, groupSeatLayoutRectangle, normalizeSeatLayout, renameSeatLayoutGroup, repairSeatLayoutGroups, snapSeatLayoutToSlotGrid } from "./seatLayout";
import { changeSeatGridAxis, getSeatGridCells, getSeatGroupCollisions, getSeatGroupGridBounds, getSeatGroupOutlinePath, getSeatGroupResizeBounds, prepareSeatLayoutGrid, resizeSeatLayoutGrid, resizeSeatLayoutGroup } from "./seatLayoutGrid";

describe("shared seat grid", () => {
  it("resizes an existing group without renaming it or moving seats and trims overlapped neighbors", () => {
    const layout = renameSeatLayoutGroup(snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 4, columns: 8 }), 9), "group-1", "7");
    const initial = getSeatGroupGridBounds(layout, "group-1")!;
    const bounds = getSeatGroupResizeBounds(layout, "group-1", "bottom", { row: initial.top + 1, column: 0 })!;
    const resized = resizeSeatLayoutGroup(layout, "group-1", bounds);
    expect(resized.groups.find(group => group.id === "group-1")).toMatchObject({ name: "第 7 组", seatIds: expect.any(Array) });
    expect(resized.groups[0].seatIds).toHaveLength(4);
    expect(resized.seats.map(({ groupId: _id, ...seat }) => seat)).toEqual(layout.seats.map(({ groupId: _id, ...seat }) => seat));
    expect(resized.neighborEdges).toEqual(layout.neighborEdges);
    expect(getSeatGroupResizeBounds(layout, "group-1", "right", { row: 0, column: 7 })!.right).toBe(7);
    const expanded = resizeSeatLayoutGroup(layout, "group-1", { ...initial, right: 4 });
    expect(expanded.groups.find(group => group.id === "group-1")).toMatchObject({ name: "第 7 组", seatIds: expect.any(Array) });
    expect(expanded.groups.find(group => group.id === "group-1")!.seatIds).toHaveLength(20);
    expect(expanded.groups.find(group => group.id === "group-2")).toBeUndefined();
    expect(expanded.groups.find(group => group.id === "group-3")).toMatchObject({ name: "第 3 组", outline: "seats" });
    expect(expanded.groups.find(group => group.id === "group-3")!.seatIds).toHaveLength(4);
    expect(getSeatGroupCollisions(layout, { ...initial, right: 4 }).map(group => group.id)).toEqual(["group-1", "group-2", "group-3"]);
    const podiumSeat = layout.seats.find(seat => getSeatGridCells(layout).seats.get(seat.id)!.key === "1:0")!;
    const withPodium = repairSeatLayoutGroups({ ...layout, podium: { x: podiumSeat.x, y: podiumSeat.y }, seats: layout.seats.filter(seat => seat.id !== podiumSeat.id), groups: layout.groups.map(group => ({ ...group, seatIds: group.seatIds.filter(id => id !== podiumSeat.id) })) });
    const podiumGroup = resizeSeatLayoutGroup(withPodium, "group-1", initial);
    expect(podiumGroup.groups[0].seatIds).not.toContain(podiumSeat.id);
    expect(podiumGroup.podium).toEqual(withPodium.podium);
    expect(podiumGroup.groups[0].seatIds).toHaveLength(7);
  });

  it.each([{ column: 0, row: 0 }, { column: 1, row: 1 }, { column: 0, row: 1 }, { column: 2, row: 2 }])("leaves a precise podium cutout in the group perimeter at $row:$column", podium => {
    const path = getSeatGroupOutlinePath(3, 3, podium);
    const signedArea = [...path.matchAll(/M([^Z]+)Z/g)].reduce((area, match) => {
      const points = match[1].split("L").map(point => point.split(",").map(Number));
      return area + points.slice(0, -1).reduce((sum, [x, y], i) => sum + x * points[i + 1][1] - points[i + 1][0] * y, 0) / 2;
    }, 0);
    expect(signedArea).toBe(8);
    expect(path).not.toContain("undefined");
  });
  it.each(["row", "column"] as const)("inserts an empty %s between existing strips and preserves surviving identity", axis => {
    const layout = renameSeatLayoutGroup(snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 4, columns: 8 }), 9), "group-1", "7");
    layout.podium = getSeatLayoutSlots(9, 8)[8 * 8 + 4];
    const original = JSON.stringify(layout);
    const before = getSeatGridCells(layout);
    const inserted = changeSeatGridAxis(layout, axis, 1, "insert");
    const after = getSeatGridCells(inserted);
    expect(JSON.stringify(layout)).toBe(original);
    expect(inserted.seats.map(seat => seat.id)).toEqual(layout.seats.map(seat => seat.id));
    expect(inserted.groups).toEqual(layout.groups);
    expect(inserted.neighborEdges).toEqual(layout.neighborEdges);
    for (const [id, cell] of before.seats) expect(after.seats.get(id)?.[axis]).toBe(cell[axis] >= 1 ? cell[axis] + 1 : cell[axis]);
    expect([...after.seats.values()].some(cell => cell[axis] === 1)).toBe(false);
    expect(after.podium?.[axis]).toBe(before.podium![axis] + 1);
    const deleted = changeSeatGridAxis(inserted, axis, 1, "delete");
    expect(deleted).toEqual({ ...layout, podium: { x: layout.podium.x, y: layout.podium.y }, template: "freeform" });
    expect(prepareSeatLayoutGrid(normalizeSeatLayout(JSON.parse(JSON.stringify(inserted)))!)).toEqual(inserted);
  });

  it.each(["row", "column"] as const)("deletes exactly the selected %s and cleans removed members and neighbors", axis => {
    const layout = snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 4, columns: 8 }), 9);
    const before = getSeatGridCells(layout);
    const removed = new Set(layout.seats.filter(seat => before.seats.get(seat.id)![axis] === 1).map(seat => seat.id));
    const result = changeSeatGridAxis(layout, axis, 1, "delete");
    const after = getSeatGridCells(result);
    expect(result.seats.map(seat => seat.id)).toEqual(layout.seats.filter(seat => !removed.has(seat.id)).map(seat => seat.id));
    for (const [id, cell] of after.seats) expect(cell[axis]).toBe(before.seats.get(id)![axis] > 1 ? before.seats.get(id)![axis] - 1 : before.seats.get(id)![axis]);
    expect(result.groups.every(group => group.seatIds.every(id => !removed.has(id)))).toBe(true);
    expect(result.neighborEdges.every(edge => !removed.has(edge.a) && !removed.has(edge.b))).toBe(true);
    expect(prepareSeatLayoutGrid(normalizeSeatLayout(result)!)).toEqual(result);
  });

  it("supports first/last boundaries, podium removal and dimension limits", () => {
    const layout = snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 1, columns: 2 }), 9);
    layout.podium = getSeatLayoutSlots(9, 8)[71];
    const first = changeSeatGridAxis(layout, "column", 0, "insert");
    expect(getSeatGridCells(first).seats.get(layout.seats[0].id)!.column).toBe(4);
    const last = changeSeatGridAxis(layout, "row", 9, "insert");
    expect([...getSeatGridCells(last).seats.values()].map(cell => cell.key)).toEqual([...getSeatGridCells(layout).seats.values()].map(cell => cell.key));
    expect(changeSeatGridAxis(layout, "row", 8, "delete").podium).toBeUndefined();
    const minimal = { ...layout, seats: [], groups: [], neighborEdges: [], podium: undefined, slotGridRows: 1, slotGridColumns: 1 };
    expect(changeSeatGridAxis(minimal, "row", 0, "delete")).toBe(minimal);
    expect(changeSeatGridAxis(minimal, "column", 0, "delete")).toBe(minimal);
    for (const index of [-1, 9, 0.5, Number.NaN]) expect(changeSeatGridAxis(layout, "column", index, "delete")).toBe(layout);
    const maximum = resizeSeatLayoutGrid(layout, 25, 20);
    expect(changeSeatGridAxis(maximum, "row", 25, "insert")).toBe(maximum);
    expect(changeSeatGridAxis(maximum, "column", 20, "insert")).toBe(maximum);
  });

  it("compacts legacy aisle columns without changing seat order, membership or teacher data", () => {
    const source = createGridSeatLayout({ rows: 8, columns: 8 });
    const oldSlots = getSeatLayoutSlots(9, 12);
    source.slotGridVersion = 1;
    source.seats = source.seats.map((seat, index) => {
      const column = index % 8;
      const slot = oldSlots[(7 - Math.floor(index / 8)) * 12 + column + Math.floor(column / 2)];
      return { ...seat, x: slot.x, y: slot.y };
    });
    // Two isolated slots reproduce the user's 66-seat layout without dropping them.
    for (const column of [4, 7]) {
      const slot = oldSlots[8 * 12 + column];
      source.seats.push({ id: `extra-${column}`, x: slot.x, y: slot.y, label: `9-${column}`, rotation: 0 });
    }
    const before = JSON.stringify(source);
    const result = prepareSeatLayoutGrid(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(result.seats.map(seat => seat.id)).toEqual(source.seats.map(seat => seat.id));
    expect(result.groups).toEqual(source.groups);
    expect(result.neighborEdges).toEqual(source.neighborEdges);
    const cells = getSeatGridCells(result);
    expect(new Set([...cells.seats.values()].map(cell => cell.column))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(new Set([...cells.seats.values()].map(cell => cell.key)).size).toBe(66);
    expect(prepareSeatLayoutGrid(normalizeSeatLayout(result)!)).toEqual(result);
  });

  it("keeps intentional gaps and ungrouped seats across resize and reload", () => {
    const layout = snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 2, columns: 8 }), 9);
    layout.seats = layout.seats.filter((_, index) => index !== 1);
    layout.groups = [];
    layout.seats = layout.seats.map(seat => ({ ...seat, groupId: undefined }));
    const before = getSeatGridCells(layout);
    layout.podium = getSeatLayoutSlots(9)[71];
    const resized = resizeSeatLayoutGrid(layout, 10, 9);
    const after = getSeatGridCells(normalizeSeatLayout(resized)!);
    for (const [id, cell] of before.seats) expect(after.seats.get(id)?.key).toBe(cell.key);
    expect(after.podium?.key).toBe("8:7");
    expect(prepareSeatLayoutGrid(resized).groups).toEqual([]);
  });

  it("transfers only intersected seats while retaining old group names, remaining members and neighbors", () => {
    const layout = snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 8, columns: 8 }), 9);
    const cells = getSeatGridCells(layout).seats;
    const selected = layout.seats.filter(seat => {
      const cell = cells.get(seat.id)!;
      return cell.row >= 1 && cell.row <= 3 && cell.column >= 1 && cell.column <= 4;
    }).map(seat => seat.id);
    const before = JSON.stringify(layout);
    const result = groupSeatLayoutRectangle(layout, new Set(selected), "group-custom-test");
    expect(JSON.stringify(layout)).toBe(before);
    expect(result.groups.map(group => group.id).sort()).toEqual(["group-1", "group-2", "group-2-part-2", "group-3", "group-4", "group-custom-test"]);
    for (const previous of layout.groups) {
      const remaining = result.groups.find(group => group.id === previous.id)!;
      expect(remaining.name).toBe(previous.name);
      const allPieces = result.groups.filter(group => group.id === previous.id || group.id.startsWith(`${previous.id}-part-`));
      expect(allPieces.flatMap(group => group.seatIds).sort()).toEqual(previous.seatIds.filter(id => !selected.includes(id)).sort());
      if (previous.id !== "group-4") expect(remaining.outline).toBe("seats");
    }
    expect(new Set(result.groups.flatMap(group => group.seatIds)).size).toBe(64);
    expect(result.groups.find(group => group.id === "group-2")!.seatIds).toHaveLength(2);
    expect(result.groups.find(group => group.id === "group-2-part-2")!.seatIds).toHaveLength(8);
    expect(new Set(result.groups.map(group => group.name)).size).toBe(6);
    expect(result.groups.find(group => group.id === "group-custom-test")!.seatIds.sort()).toEqual(selected.sort());
    expect(result.seats.map(({ groupId: _groupId, ...seat }) => seat)).toEqual(layout.seats.map(({ groupId: _groupId, ...seat }) => seat));
    expect(result.neighborEdges).toEqual(layout.neighborEdges);
    expect(result.seats.filter(seat => seat.groupId === undefined)).toHaveLength(0);
    // A new selection in a carved-out area must not collide with old bounding boxes.
    expect(getSeatGroupCollisions(result, { left: 1, right: 4, top: 1, bottom: 3 }).map(group => group.id)).toEqual(["group-custom-test"]);
    expect(prepareSeatLayoutGrid(normalizeSeatLayout(result)!)).toEqual(result);
  });

  it("repairs intersecting legacy remnants without enclosing another group's seats or rewriting input", () => {
    const layout = snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 4, columns: 4 }), 9);
    const before = JSON.stringify(layout);
    const selected = [layout.seats[1].id, layout.seats[10].id];
    // A modifier selection includes every enabled seat within the rectangle, not just its corners.
    const result = groupSeatLayoutRectangle(layout, new Set(selected), "custom");
    expect(result.groups).toHaveLength(3);
    const selectedGroup = result.groups.find(group => group.id === "custom")!;
    expect(selectedGroup.seatIds).toHaveLength(6);
    const legacy = { ...layout, groups: [...layout.groups.map(group => ({ ...group, seatIds: group.seatIds.filter(id => !selectedGroup.seatIds.includes(id)) })), selectedGroup] };
    const repaired = repairSeatLayoutGroups(legacy);
    expect(repaired.groups.map(group => group.id)).toEqual(["custom"]);
    expect(repaired.seats).toHaveLength(16);
    expect(JSON.stringify(layout)).toBe(before);
  });

  it("gives the newest rectangle exclusive ownership when duplicate legacy groups overlap", () => {
    const layout = snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 2, columns: 2 }), 9);
    layout.groups.push({ ...layout.groups[0], id: "newer", name: "老师自定义组名" });
    const repaired = repairSeatLayoutGroups(layout);
    expect(repaired.groups.map(group => group.name)).toEqual(["老师自定义组名"]);
    expect(repaired.seats.every(seat => seat.groupId === "newer")).toBe(true);
    expect(groupSeatLayoutRectangle(repaired, new Set(["unknown"]), "unused")).toBe(repaired);
  });

  it("traces every 3 by 3 remaining-seat pattern without enclosing transferred cells or losing islands", () => {
    for (let mask = 1; mask < 512; mask++) {
      const members = Array.from({ length: 9 }, (_, index) => ({ row: Math.floor(index / 3), column: index % 3 })).filter((_, index) => mask & (1 << index));
      const path = getSeatGroupOutlinePath(3, 3, undefined, members);
      const loops = [...path.matchAll(/M([^Z]+)Z/g)].map(match => match[1].split("L").map(point => point.split(",").map(Number)));
      const area = loops.reduce((sum, points) => sum + points.slice(0, -1).reduce((a, [x, y], i) => a + x * points[i + 1][1] - points[i + 1][0] * y, 0) / 2, 0);
      expect(area).toBe(members.length);
      for (let index = 0; index < 9; index++) {
        const x = index % 3 + 0.5, y = Math.floor(index / 3) + 0.5;
        const crossings = loops.flatMap(points => points.slice(0, -1).map(([ax, ay], i) => {
          const [bx, by] = points[i + 1];
          return (ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax;
        })).filter(Boolean).length;
        expect(crossings % 2 === 1).toBe(Boolean(mask & (1 << index)));
      }
    }
  });

  it("preserves an edited group number through normalization, grid changes and automatic numbering", () => {
    const layout = snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 4, columns: 8 }), 9);
    const renamed = renameSeatLayoutGroup(layout, "group-1", " 7 ");
    expect(renamed.groups[0]).toMatchObject({ name: "第 7 组", nameIsCustom: true });
    expect(layout.groups[0].name).toBe("第 1 组");
    expect(renamed.seats).toBe(layout.seats);
    expect(renamed.neighborEdges).toBe(layout.neighborEdges);
    const restored = prepareSeatLayoutGrid(normalizeSeatLayout(JSON.parse(JSON.stringify(renamed)))!);
    expect(restored.groups[0].name).toBe("第 7 组");
    expect(prepareSeatLayoutGrid(resizeSeatLayoutGrid(restored, 10, 9)).groups[0].name).toBe("第 7 组");
    // Custom numbers also reserve their name when other groups are later re-numbered.
    const withoutFirst = { ...restored, groups: restored.groups.filter(group => group.id !== "group-1") };
    const customFirst = renameSeatLayoutGroup(withoutFirst, "group-4", "第1组");
    const repaired = repairSeatLayoutGroups(customFirst);
    expect(repaired.groups.find(group => group.id === "group-4")!.name).toBe("第 1 组");
    expect(new Set(repaired.groups.map(group => group.name)).size).toBe(repaired.groups.length);
  });

  it("rejects empty, long or duplicate group names without changing the draft", () => {
    const layout = snapSeatLayoutToSlotGrid(createGridSeatLayout({ rows: 2, columns: 4 }), 9);
    for (const name of [" ", "很".repeat(25), "第2组", "2"]) {
      expect(getSeatGroupNameError(layout, "group-1", name)).toBeTruthy();
      expect(renameSeatLayoutGroup(layout, "group-1", name)).toBe(layout);
    }
    expect(renameSeatLayoutGroup(layout, "absent", "新组")).toBe(layout);
    expect(renameSeatLayoutGroup(layout, "group-1", "  阅读组  ").groups[0].name).toBe("阅读组");
  });
});
