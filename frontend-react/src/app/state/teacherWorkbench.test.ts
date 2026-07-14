import { describe, expect, it } from "vitest";

import { buildItemAnalysisFromWideRows, buildTodayWorkItems, buildWeeklyFacts, getQuestionStats, normalizeHomeworkAssignments, normalizeSubjectCatalog, parseScheduleRows } from "./teacherWorkbench";
import { createTestStudent } from "./testFixtures";
import type { GradeExam } from "./types";

describe("teacher workbench domains", () => {
  it("imports a wide weekly schedule after a title row", () => {
    const schedule = parseScheduleRows([["七年级课表"], ["节次", "周一", "周二"], ["第1节", "语文", "数学"], ["第2节", "英语", "体育"]], "课表.xlsx");
    expect(schedule.periods).toHaveLength(2);
    expect(schedule.entries.map(item => `${item.weekday}:${item.subject}`)).toEqual(["1:语文", "2:数学", "1:英语", "2:体育"]);
  });

  it("normalizes homework and builds a non-duplicated today queue", () => {
    const students = [createTestStudent("s1", "甲")];
    const homework = normalizeHomeworkAssignments([{ id: "h1", title: "订正", dueDate: "2026-07-14", assignedDate: "2026-07-13", studentStates: { s1: { status: "pending" } } }]);
    const items = buildTodayWorkItems({ date: "2026-07-14", students, attendance: [], tasks: [], homework });
    expect(items).toMatchObject([{ kind: "homework", entityId: "h1" }]);
    expect(items[0].detail).toContain("1 人未交");
  });

  it("keeps old missing homework states and builds an editable subject catalog", () => {
    const homework = normalizeHomeworkAssignments([{ title: "订正", studentStates: { s1: { status: "pending" }, s2: { status: "unrecorded" } } }]);
    expect(homework[0].studentStates.s1.status).toBe("pending");
    expect(homework[0].studentStates.s2.status).toBe("unrecorded");
    expect(normalizeSubjectCatalog(["语文", "信息技术"], ["语文", "体育"])).toEqual(["语文", "信息技术", "体育"]);
  });

  it("creates local weekly facts without invoking AI", () => {
    const student = { ...createTestStudent("s1", "甲"), records: [{ id: "r1", type: "reward" as const, note: "积极", date: "2026-07-14" }] };
    const facts = buildWeeklyFacts({ students: [student], attendance: [], tasks: [], homework: [], startDate: "2026-07-13", endDate: "2026-07-19" });
    expect(facts.join(" ")).toContain("记录表扬 1 条");
  });

  it("reads per-question wide columns and calculates weak students", () => {
    const exam: GradeExam = { id: "e1", name: "单元测", date: "2026-07-14", subjects: ["数学"], rows: [{ id: "row1", name: "甲", studentId: "s1", scores: { 数学: { score: 80 } }, total: 80 }] };
    const analysis = buildItemAnalysisFromWideRows([["姓名", "第1题", "Q2"], ["甲", "2", "8"], ["乙", "10", "10"]], exam);
    const stats = getQuestionStats(analysis);
    expect(analysis.questions).toHaveLength(2);
    expect(stats.find(item => item.question.label === "第1题")?.weakStudentIds).toEqual(["s1"]);
  });
});
