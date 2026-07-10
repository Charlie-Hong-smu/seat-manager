import { describe, expect, it } from "vitest";

import { evaluateSeatOrder, getChangedSeatIndices } from "./seatPlanner";
import { createDefaultSeatSettings } from "./legacyStateAdapter";
import type { AppStudent } from "./types";

function student(id: string, name: string, gender: AppStudent["gender"]): AppStudent {
  return { id, name, gender, aliases: [], tags: [], academicTags: [], manualTagIds: [], autoTagIds: [], records: [], exams: [] };
}

describe("seat planner", () => {
  it("reports changed seat indices", () => {
    expect(getChangedSeatIndices(["a", "b", null], ["b", "a", null])).toEqual([0, 1]);
  });

  it("detects a forbidden deskmate pair", () => {
    const students = [student("a", "张三", "男"), student("b", "李四", "女")];
    const settings = createDefaultSeatSettings();
    settings.constraints.noDeskmatePairs = [{ a: "a", b: "b" }];
    const result = evaluateSeatOrder(students, ["a", "b"], settings);
    expect(result.hardViolations).toBeGreaterThan(0);
    expect(result.details.required.some(item => item.type === "避免同桌" && !item.satisfied)).toBe(true);
  });
});
