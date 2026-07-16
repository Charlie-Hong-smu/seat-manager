import { describe, expect, it } from "vitest";

import { createSeatManagerState } from "./legacyStateAdapter";

describe("legacy state normalization", () => {
  it("defaults old students to active and accepts archived students plus activity events", () => {
    const state = createSeatManagerState({
      students: [
        { id: "s1", name: "甲", gender: "男", aliases: [], tags: [], academicTags: [], manualTagIds: [], autoTagIds: [], records: [], exams: [] },
        { id: "s2", name: "乙", gender: "女", aliases: [], tags: [], academicTags: [], manualTagIds: [], autoTagIds: [], records: [], exams: [], enrollmentStatus: "archived", archivedAt: "2026-07-14T08:00:00.000Z" },
      ],
      seatOrder: ["s1", "s2"],
      activityEvents: [{ id: "event-1", action: "archived", ref: { domain: "student", entityId: "s2", studentId: "s2" }, studentIds: ["s2"], title: "移出班级", detail: "保留历史", occurredAt: "2026-07-14T08:00:00.000Z" }],
    });
    expect(state.students.map(student => student.enrollmentStatus)).toEqual(["active", "archived"]);
    expect(state.activityEvents).toHaveLength(1);
    expect(state.activityEvents[0].ref.studentId).toBe("s2");
  });
});
