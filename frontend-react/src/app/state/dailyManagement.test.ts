import { describe, expect, it } from "vitest";
import { batchUpsertAttendance, createFollowupTask, drawStudents, findOpenLinkedTask, getTaskUrgency, normalizeAttendanceRecords, upsertAttendance } from "./dailyManagement";
import { createTestStudent } from "./testFixtures";

describe("daily management", () => {
  it("stores one exceptional attendance record and removes a default normal record", () => {
    const input = { studentId: "s1", date: "2026-07-11", status: "absent" as const, late: false, earlyLeave: false, note: "未到", leaveStart: undefined, leaveEnd: undefined };
    const saved = upsertAttendance([], input);
    expect(saved).toHaveLength(1);
    expect(normalizeAttendanceRecords([...saved, { ...saved[0], note: "更新" }])[0].note).toBe("更新");
    expect(upsertAttendance(saved, { ...input, status: "normal", note: "" })).toEqual([]);
  });

  it("creates task urgency and draws without duplicates", () => {
    const task = createFollowupTask({ studentId: "s1", title: "联系家长", dueDate: "2026-07-10" });
    expect(getTaskUrgency(task, "2026-07-11")).toBe("overdue");
    const students = [createTestStudent("s1"), createTestStudent("s2", "乙")];
    expect(drawStudents(students, 5).map(item => item.id).sort()).toEqual(["s1", "s2"]);
    expect(drawStudents(students, 2, new Set(["s1"])).map(item => item.id)).toEqual(["s2"]);
  });

  it("batch updates attendance and deduplicates linked open tasks", () => {
    const records = batchUpsertAttendance([], ["s1", "s2"], "2026-07-11", { status: "leave", note: "集体活动" });
    expect(records).toHaveLength(2);
    expect(new Set(records.map(record => `${record.date}:${record.studentId}`)).size).toBe(2);
    const sourceRef = { domain: "dormitory" as const, entityId: "event-1" };
    const task = createFollowupTask({ studentId: "s1", title: "处理", source: "dormitory", sourceRef });
    expect(findOpenLinkedTask([task], "s1", sourceRef)?.id).toBe(task.id);
    expect(findOpenLinkedTask([{ ...task, status: "completed" }], "s1", sourceRef)).toBeUndefined();
    const questionTask = createFollowupTask({ studentId: "s1", title: "第1题", source: "score", sourceRef: { domain: "score", entityId: "exam-1", subEntityId: "q1" } });
    expect(findOpenLinkedTask([questionTask], "s1", { domain: "score", entityId: "exam-1", subEntityId: "q2" })).toBeUndefined();
  });
});
