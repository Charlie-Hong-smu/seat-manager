import { describe, expect, it } from "vitest";

import { createSeatManagerState } from "./legacyStateAdapter";
import { buildSeatOrderByStudentList, placeStudentInFirstEmptySeat } from "./seatActions";
import { createGridSeatLayout } from "./seatLayout";
import { createTestStudent } from "./testFixtures";

describe("custom seat layout compatibility", () => {
  it("keeps legacy classes on the historical eight-column capacity", () => {
    const state = createSeatManagerState({
      students: [
        { id: "s1", name: "张三" },
        { id: "s2", name: "李四" },
        { id: "s3", name: "王五" },
      ],
      seatOrder: ["s1", "s2", "s3"],
      settings: {},
    });

    expect(state.seatSettings.layout).toBeUndefined();
    expect(state.seatOrder).toHaveLength(8);
    expect(state.seatOrder.slice(0, 3)).toEqual(["s1", "s2", "s3"]);
  });

  it("uses exact custom capacity and leaves overflow students waiting", () => {
    const layout = createGridSeatLayout({ rows: 1, columns: 2 });
    const students = [createTestStudent("s1", "张三"), createTestStudent("s2", "李四"), createTestStudent("s3", "王五")];
    const state = createSeatManagerState({
      students,
      seatOrder: ["s1", "s2", "s3"],
      settings: { seatLayout: layout },
    });

    expect(state.seatSettings.layout?.seats).toHaveLength(2);
    expect(state.seatOrder).toEqual(["s1", "s2"]);
    expect(buildSeatOrderByStudentList(students, layout)).toEqual(["s1", "s2"]);
    expect(placeStudentInFirstEmptySeat(["s1", "s2"], "s3", students.length, layout)).toEqual(["s1", "s2"]);
  });
});
