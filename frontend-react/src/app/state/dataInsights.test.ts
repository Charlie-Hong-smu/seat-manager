import { describe, expect, it } from "vitest";
import { buildTimeline, businessEntityExists, filterTimeline, inspectStateHealth, targetFromBusinessRef } from "./dataInsights";
import { createActivityEvent } from "./activityEvents";
import { createEmptySeatManagerState } from "./legacyStateAdapter";
import { createTestStudent } from "./testFixtures";
import { createFollowupTask } from "./dailyManagement";

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

  it("treats followups without a student as class-level tasks", () => {
    const state = createEmptySeatManagerState();
    state.followupTasks = [createFollowupTask({ studentId: "", title: "准备班会", dueDate: "2026-07-14" })];
    expect(buildTimeline(state, "2026-07-13")[0]).toMatchObject({ studentId: undefined, studentName: "班级事项", title: "准备班会" });
    expect(inspectStateHealth(state)).toEqual([]);
  });

  it("prioritizes real activity events, filters every related student and keeps precise targets", () => {
    const state = createEmptySeatManagerState();
    state.students = [createTestStudent("s1"), createTestStudent("s2", "乙")];
    state.homeworkAssignments = [{ id: "h1", title: "订正", subject: "数学", assignedDate: "2026-07-14", dueDate: "2026-07-15", note: "", studentStates: {}, createdAt: "2026-07-14T08:00:00.000Z", updatedAt: "2026-07-14T08:00:00.000Z" }];
    state.activityEvents = [createActivityEvent({ action: "updated", ref: { domain: "homework", entityId: "h1" }, studentIds: ["s1", "s2"], title: "更新作业：订正", detail: "截止日期已调整", occurredAt: "2026-07-14T09:00:00.000Z" })];
    const timeline = buildTimeline(state);
    expect(timeline.filter(item => item.type === "作业")).toHaveLength(1);
    expect(filterTimeline(timeline, { studentId: "s2" })).toHaveLength(1);
    expect(targetFromBusinessRef({ domain: "score", entityId: "e1", subEntityId: "q2" })).toMatchObject({ workspace: "scores", entityId: "e1", subEntityId: "q2" });
  });

  it("detects missing question-level sources without rejecting existing ones", () => {
    const state = createEmptySeatManagerState();
    state.gradeExams = [{ id: "e1", name: "月考", date: "2026-07-14", subjects: ["数学"], rows: [], itemAnalysis: { questions: [{ id: "q1", label: "第1题", subject: "数学", maxScore: 10, knowledgePoints: [], sourceColumn: 2 }], rows: [], updatedAt: "" } }];
    expect(businessEntityExists(state, { domain: "score", entityId: "e1", subEntityId: "q1" })).toBe(true);
    expect(businessEntityExists(state, { domain: "score", entityId: "e1", subEntityId: "q2" })).toBe(false);
  });
});
