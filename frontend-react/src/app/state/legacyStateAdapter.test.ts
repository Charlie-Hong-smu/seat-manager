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

  it("rebuilds dormitory members from each active student's canonical dormitory id", () => {
    const state = createSeatManagerState({
      students: [
        { id: "s1", name: "甲", gender: "男", aliases: [], tags: [], academicTags: [], manualTagIds: [], autoTagIds: [], records: [], exams: [], dormitoryId: "d2" },
        { id: "s2", name: "乙", gender: "女", aliases: [], tags: [], academicTags: [], manualTagIds: [], autoTagIds: [], records: [], exams: [], dormitoryId: "d1", enrollmentStatus: "archived" },
      ],
      dormitories: [
        { id: "d1", name: "一号", memberIds: ["s1", "s2"], baseScore: 100, currentScore: 100, events: [], periodStart: "2026-08-01", history: [] },
        { id: "d2", name: "二号", memberIds: [], baseScore: 100, currentScore: 100, events: [], periodStart: "2026-08-01", history: [] },
      ],
    });
    expect(state.dormitories.find(dorm => dorm.id === "d1")?.memberIds).toEqual([]);
    expect(state.dormitories.find(dorm => dorm.id === "d2")?.memberIds).toEqual(["s1"]);
  });

  it("upgrades uniquely matched legacy grades to a stable student id", () => {
    const raw = {
      students: [{ id: "s1", name: "旧姓名", gender: "男", aliases: [], tags: [], academicTags: [], manualTagIds: [], autoTagIds: [], records: [], exams: [], studentNo: "001" }],
      savedExams: [{ id: "e1", name: "月考", date: "2026-08-01", subjects: ["数学"], entries: [{ name: "旧姓名", studentNo: "001", scores: { 数学: { score: 90 } }, total: { score: 90 } }] }],
    };
    const upgraded = createSeatManagerState(raw);
    expect((upgraded.savedExams[0] as { entries: Array<{ studentId?: string }> }).entries[0].studentId).toBe("s1");
    const renamed = createSeatManagerState({ ...raw, students: [{ ...raw.students[0], name: "新姓名" }], savedExams: upgraded.savedExams });
    expect(renamed.gradeExams[0].rows[0]).toMatchObject({ studentId: "s1", name: "新姓名" });
  });
});
