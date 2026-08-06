import { describe, expect, it } from "vitest";

import { archiveStudent, changeFollowupTaskStatus, completeFollowupTask, normalizeAttendancePatch, permanentlyDeleteStudent, restoreStudent, syncCompletedFollowupHomework, updateFollowupResolution } from "./classManagementCommands";
import { createFollowupTask } from "./dailyManagement";
import { createEmptySeatManagerState } from "./legacyStateAdapter";
import { createTestStudent } from "./testFixtures";

describe("class management commands", () => {
  it("shares task status changes and linked homework synchronization", () => {
    const task = createFollowupTask({ studentId: "s1", title: "补交作业", source: "homework", sourceRef: { domain: "homework", entityId: "h1", studentId: "s1" } });
    expect(changeFollowupTaskStatus(task, "completed").task.status).toBe("completed");
    const synced = syncCompletedFollowupHomework(task, [{ id: "h1", title: "数学作业", subject: "数学", assignedDate: "2026-08-01", dueDate: "2026-08-02", note: "", studentStates: { s1: { status: "pending", note: "补交", updatedAt: "2026-08-01T00:00:00.000Z" } }, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }]);
    expect(synced?.assignments[0].studentStates.s1.status).toBe("submitted");
    expect(synced?.event.ref.domain).toBe("homework");
  });
  it("completes a task, stores an optional result and supports a continued chain", () => {
    const task = createFollowupTask({ studentId: "s1", title: "确认补交", source: "homework", sourceRef: { domain: "homework", entityId: "h1", studentId: "s1" } });
    const completed = completeFollowupTask(task);
    expect(completed.task.status).toBe("completed");
    const resolved = updateFollowupResolution(completed.task, "已于周五补交");
    expect(resolved.task.resolutionNote).toBe("已于周五补交");
    const continued = createFollowupTask({ studentId: "s1", title: task.title, sourceRef: task.sourceRef, continuedFromTaskId: task.id });
    expect(continued.continuedFromTaskId).toBe(task.id);
  });

  it("clears incompatible attendance details", () => {
    const current = { id: "a1", studentId: "s1", date: "2026-07-14", status: "leave" as const, late: true, earlyLeave: true, note: "", leaveStart: "2026-07-14T08:00", leaveEnd: "2026-07-14T12:00", createdAt: "", updatedAt: "" };
    expect(normalizeAttendancePatch(current, "absent")).toEqual({ status: "absent", late: false, earlyLeave: false, leaveStart: undefined, leaveEnd: undefined });
    expect(normalizeAttendancePatch(current, "normal")).toEqual({ status: "normal", late: false, earlyLeave: false, leaveStart: undefined, leaveEnd: undefined });
  });

  it("archives and restores without removing history", () => {
    const state = createEmptySeatManagerState();
    state.students = [createTestStudent("s1")];
    state.seatOrder = ["s1"];
    state.attendanceRecords = [{ id: "a1", studentId: "s1", date: "2026-07-14", status: "absent", late: false, earlyLeave: false, note: "", createdAt: "", updatedAt: "" }];
    const archived = archiveStudent(state, "s1");
    expect(archived.students[0].enrollmentStatus).toBe("archived");
    expect(archived.seatOrder).toEqual([null]);
    expect(archived.attendanceRecords).toHaveLength(1);
    const restored = restoreStudent(archived, "s1");
    expect(restored.students[0].enrollmentStatus).toBe("active");
    expect(restored.attendanceRecords).toHaveLength(1);
  });

  it("restores the archived student's single dormitory membership", () => {
    const state = createEmptySeatManagerState();
    state.students = [{ ...createTestStudent("s1"), dormitoryId: "d1" }];
    state.dormitories = [{ id: "d1", name: "301", baseScore: 0, currentScore: 0, periodStart: "2026-07-14", memberIds: ["s1"], events: [], history: [] }];
    const restored = restoreStudent(archiveStudent(state, "s1"), "s1");
    expect(restored.students[0].dormitoryId).toBe("d1");
    expect(restored.dormitories[0].memberIds).toEqual(["s1"]);
  });

  it("permanently deletes student-owned rows while preserving shared business events", () => {
    const state = createEmptySeatManagerState();
    state.students = [createTestStudent("s1"), createTestStudent("s2", "乙")];
    state.homeworkAssignments = [{ id: "h1", title: "订正", subject: "数学", assignedDate: "2026-07-14", dueDate: "2026-07-15", note: "", lifecycle: "active", participantStudentIds: ["s1", "s2"], studentStates: { s1: { status: "pending", note: "", updatedAt: "" }, s2: { status: "submitted", note: "", updatedAt: "" } }, createdAt: "", updatedAt: "" }];
    state.dormitories = [{ id: "d1", name: "301", baseScore: 0, currentScore: -1, periodStart: "2026-07-14", memberIds: ["s1", "s2"], events: [{ id: "e1", dormId: "d1", type: "punish", reason: "卫生", score: -1, note: "", date: "2026-07-14", responsibleStudentIds: ["s1", "s2"], responsibleStudentNames: ["张三", "乙"], createdAt: "" }], history: [] }];
    state.gradeExams = [{ id: "g1", name: "月考", date: "2026-07-14", subjects: ["数学"], rows: [{ id: "r1", name: "张三", studentId: "s1", scores: { 数学: { score: 80 } }, total: 80 }, { id: "r2", name: "乙", studentId: "s2", scores: { 数学: { score: 90 } }, total: 90 }] }];
    state.savedExams = [{ id: "g1", name: "月考", date: "2026-07-14", savedAt: "", studentCount: 2, subjectCount: 1, subjects: ["数学"], entries: [{ studentId: "s1", name: "张三", scores: { 数学: { score: 80 } }, total: { score: 80 } }, { studentId: "s2", name: "乙", scores: { 数学: { score: 90 } }, total: { score: 90 } }] }];
    const next = permanentlyDeleteStudent(state, "s1");
    expect(next.students.map(student => student.id)).toEqual(["s2"]);
    expect(next.homeworkAssignments[0].participantStudentIds).toEqual(["s2"]);
    expect(next.dormitories[0].events).toHaveLength(1);
    expect(next.dormitories[0].events[0].responsibleStudentIds).toEqual(["s2"]);
    expect(next.gradeExams[0].rows.map(row => row.studentId)).toEqual(["s2"]);
    expect((next.savedExams[0] as { entries: Array<{ studentId?: string }> }).entries.map(row => row.studentId)).toEqual(["s2"]);
  });
});
