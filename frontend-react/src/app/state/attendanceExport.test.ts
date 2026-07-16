import { describe, expect, it } from "vitest";

import { buildAttendanceCsv } from "./attendanceExport";
import { createTestStudent } from "./testFixtures";

describe("attendance export", () => {
  it("includes the full active roster and treats unsaved rows as normal", () => {
    const students = [createTestStudent("s1", "甲"), createTestStudent("s2", "乙")];
    const csv = buildAttendanceCsv(students, [{ id: "a1", studentId: "s1", date: "2026-07-14", status: "leave", late: false, earlyLeave: false, note: "病假", createdAt: "", updatedAt: "" }], "2026-07-14");
    expect(csv).toContain('"甲","请假"');
    expect(csv).toContain('"乙","正常"');
    expect(csv.split("\n")).toHaveLength(3);
  });
});
