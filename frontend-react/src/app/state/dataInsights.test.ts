import { describe, expect, it } from "vitest";
import { buildTimeline, filterTimeline, inspectStateHealth } from "./dataInsights";
import { createEmptySeatManagerState } from "./legacyStateAdapter";
import { createTestStudent } from "./testFixtures";

describe("data insights", () => {
  it("aggregates timeline and finds broken references", () => {
    const state = createEmptySeatManagerState();
    state.students = [{ ...createTestStudent("s1"), studentNo: "01", records: [{ id: "r1", type: "note", note: "谈话", date: "2026-07-11" }] }, { ...createTestStudent("s2", "乙"), studentNo: "01" }];
    state.seatOrder = ["missing"];
    expect(buildTimeline(state)[0].title).toContain("谈话");
    expect(inspectStateHealth(state).map(issue => issue.title)).toEqual(expect.arrayContaining(["学号重复", "座位引用了不存在的学生"]));
  });

  it("builds searchable typed events with semantic states and stable ordering", () => {
    const state = createEmptySeatManagerState();
    state.students = [{ ...createTestStudent("s1", "张三"), records: [{ id: "r1", type: "punish", note: "课堂提醒", date: "2026-07-10" }] }];
    state.attendanceRecords = [{ id: "a1", studentId: "s1", date: "2026-07-11", status: "absent", late: false, earlyLeave: false, note: "未到校", createdAt: "2026-07-11T08:00:00.000Z", updatedAt: "2026-07-11T08:30:00.000Z" }];
    state.followupTasks = [{ id: "t1", studentId: "s1", title: "联系家长", type: "家校沟通", description: "确认情况", plannedDate: "2026-07-10", dueDate: "2026-07-10", status: "pending", source: "ai", createdAt: "2026-07-10T09:00:00.000Z", updatedAt: "2026-07-11T09:00:00.000Z" }];
    state.fundTransactions = [{ id: "f1", type: "expense", amount: 12, category: "文具采购", note: "", date: "2026-07-09", createdAt: "2026-07-09T10:00:00.000Z", status: "void", voidedAt: "2026-07-11T10:00:00.000Z" }];

    const timeline = buildTimeline(state, "2026-07-11");
    expect(timeline.map(item => item.id)).toEqual(["fund-f1", "task-t1", "attendance-a1", "record-s1-r1"]);
    expect(timeline.find(item => item.id === "attendance-a1")?.tone).toBe("danger");
    expect(timeline.find(item => item.id === "task-t1")).toMatchObject({ tone: "danger", isAi: true, studentName: "张三" });
    expect(timeline.find(item => item.id === "fund-f1")?.tone).toBe("muted");
    expect(filterTimeline(timeline, { query: "张三", type: "出勤", startDate: "2026-07-11", endDate: "2026-07-11" }).map(item => item.id)).toEqual(["attendance-a1"]);
  });

  it("keeps orphan references readable and filterable", () => {
    const state = createEmptySeatManagerState();
    state.attendanceRecords = [{ id: "a1", studentId: "missing", date: "2026-07-11", status: "leave", late: false, earlyLeave: false, note: "病假", createdAt: "2026-07-11T08:00:00.000Z", updatedAt: "2026-07-11T08:00:00.000Z" }];
    const item = buildTimeline(state, "2026-07-11")[0];
    expect(item).toMatchObject({ studentName: "未知学生", type: "出勤", tone: "reminder" });
    expect(filterTimeline([item], { studentId: "missing" })).toHaveLength(1);
  });
});
