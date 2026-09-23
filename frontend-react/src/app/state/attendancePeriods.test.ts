import { describe, expect, it } from "vitest";
import { confirmLeaveReturn, getAttendanceForDate, getAttendanceRange } from "./attendancePeriods";
import { upsertAttendance } from "./dailyManagement";
import { buildAttendanceCsv } from "./attendanceExport";
import { createTestStudent } from "./testFixtures";
const input = { studentId: "s1", date: "2026-09-22", status: "leave" as const, late: false, earlyLeave: false, note: "", leaveStart: "2026-09-22T08:00", leaveEnd: "2026-09-24T18:00" };
describe("leave periods", () => {
  it("shows legacy multi-day leave within its interval without extending old records", () => {
    const records = upsertAttendance([], input);
    expect(getAttendanceForDate(records, "2026-09-23")[0].status).toBe("leave");
    expect(getAttendanceForDate(records, "2026-09-25")).toEqual([]);
    expect(buildAttendanceCsv([createTestStudent()], records, "2026-09-23")).toContain("请假");
  });
  it("rejects invalid intervals without changing an existing record", () => {
    const records = upsertAttendance([], input);
    expect(upsertAttendance(records, { ...input, leaveEnd: "2026-09-21T18:00" })).toBe(records);
    expect(upsertAttendance(records, { ...input, leaveEnd: "2026-09-24T25:00" })).toBe(records);
  });
  it("keeps tracked leave awaiting confirmation, supports early return, and keeps previous days", () => {
    const records = upsertAttendance([], { ...input, leaveTracking: true });
    expect(getAttendanceForDate(records, "2026-09-25")[0].status).toBe("leave");
    const returned = confirmLeaveReturn(records, records[0].id, "2026-09-23");
    expect(getAttendanceForDate(returned, "2026-09-23")).toEqual([]);
    expect(getAttendanceRange(returned, "2026-09-22", "2026-09-25")).toHaveLength(1);
  });
  it("keeps an explicit normal day over inherited leave without ending other days", () => {
    const records = upsertAttendance([], { ...input, leaveTracking: true });
    const next = upsertAttendance(records, { studentId: "s1", date: "2026-09-23", status: "normal", late: false, earlyLeave: false, note: "" });
    expect(getAttendanceForDate(next, "2026-09-23")[0].status).toBe("normal");
    expect(getAttendanceForDate(next, "2026-09-24")[0].status).toBe("leave");
  });
});
