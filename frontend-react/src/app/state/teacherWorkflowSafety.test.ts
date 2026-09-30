import { describe, expect, it } from "vitest";
import { confirmLeaveReturn, getAttendanceForDate } from "./attendancePeriods";
import { normalizeAttendanceRecords, upsertAttendance } from "./dailyManagement";
import { createSeatManagerState } from "./legacyStateAdapter";
import { parseScheduleRows } from "./teacherWorkbench";
import { createTestStudent } from "./testFixtures";

describe("teacher workflow persistence", () => {
  it("retains a confirmed return when updating a leave note and reloading", () => {
    const leave = upsertAttendance([], { studentId: "s1", date: "2026-09-28", status: "leave", late: false, earlyLeave: false, note: "", leaveStart: "2026-09-28T08:00", leaveEnd: "2026-09-29T08:00", leaveTracking: true });
    const returned = confirmLeaveReturn(leave, leave[0].id, "2026-09-29");
    const input = { ...returned[0] }; delete input.leaveReturnedAt;
    const saved = upsertAttendance(returned, { ...input, note: "补写说明" });
    const reloaded = normalizeAttendanceRecords(JSON.parse(JSON.stringify(saved)));
    expect(reloaded[0].leaveReturnedAt).toBe(returned[0].leaveReturnedAt);
    expect(getAttendanceForDate(reloaded, "2026-09-30")).toEqual([]);
    expect(upsertAttendance(saved, { ...input, leaveReturnedAt: undefined })[0].leaveReturnedAt).toBeUndefined();
  });

  it("preserves explicit waiting students and locked empty seats across reload", () => {
    const raw = { students: [createTestStudent("a", "甲"), createTestStudent("b", "乙")], seatOrder: [null, "b", null, null, null, null, null, null], lockedSeats: [0] };
    const reloaded = createSeatManagerState(JSON.parse(JSON.stringify(raw)));
    expect(reloaded.seatOrder).toEqual(raw.seatOrder);
    expect(reloaded.lockedSeats).toEqual([0]);
    expect(createSeatManagerState({ students: raw.students }).seatOrder.slice(0, 2)).toEqual(["a", "b"]);
    expect(createSeatManagerState({ ...raw, students: [{ ...raw.students[0], enrollmentStatus: "archived" }, raw.students[1]], seatOrder: ["a", "b", ...raw.seatOrder.slice(2)] }).seatOrder).toEqual(raw.seatOrder);
  });

  it.each(["星期天", "周天", "礼拜天", "星期日", "周日"])("imports the entire Sunday column named %s", label => {
    expect(parseScheduleRows([["节次", "星期一", label], ["第一节", "语文", "数学"]]).entries.map(entry => [entry.weekday, entry.subject])).toEqual([[1, "语文"], [7, "数学"]]);
  });
  it("rejects an unrecognized populated timetable column before replacing data", () => {
    expect(() => parseScheduleRows([["节次", "周一", "未知日"], ["第一节", "语文", "数学"]])).toThrow("schedule_unrecognized_column");
  });
});
