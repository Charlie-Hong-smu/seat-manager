import { describe, expect, it } from "vitest";

import { buildAttendanceCsv, buildAttendanceRangeCsv } from "./attendanceExport";
import { createTestStudent } from "./testFixtures";

describe("attendance export", () => {
  it("includes the full active roster and treats unsaved rows as normal", () => {
    const students = [createTestStudent("s1", "甲"), createTestStudent("s2", "乙")];
    const csv = buildAttendanceCsv(students, [{ id: "a1", studentId: "s1", date: "2026-07-14", status: "leave", late: false, earlyLeave: false, note: "病假", createdAt: "", updatedAt: "" }], "2026-07-14");
    expect(csv).toContain('"甲","请假"');
    expect(csv).toContain('"乙","正常"');
    expect(csv.split("\n")).toHaveLength(3);
  });

  it("exports chronological range details and per-student summaries", () => {
    const students = [createTestStudent("s1", "甲"), createTestStudent("s2", "乙")];
    const csv = buildAttendanceRangeCsv(students, [
      { id: "a2", studentId: "s1", date: "2026-07-16", status: "absent", late: false, earlyLeave: false, note: "", createdAt: "", updatedAt: "" },
      { id: "a1", studentId: "s1", date: "2026-07-14", status: "leave", late: true, earlyLeave: false, note: "病假", createdAt: "", updatedAt: "" },
      { id: "outside", studentId: "s2", date: "2026-07-20", status: "absent", late: false, earlyLeave: false, note: "", createdAt: "", updatedAt: "" },
    ], "2026-07-13", "2026-07-19");
    expect(csv.indexOf("2026-07-14")).toBeLessThan(csv.indexOf("2026-07-16"));
    expect(csv).toContain('"甲","1","1","1","0"');
    expect(csv).not.toContain("2026-07-20");
    expect(csv).not.toContain('"乙","0","1"');
  });
});
