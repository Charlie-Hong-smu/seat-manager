import { describe, expect, it } from "vitest";

import { attachSavedGradeStudentIds, resolveGradeStudent } from "./gradeStudentIdentity";
import { createTestStudent } from "./testFixtures";
import type { SavedGradeExamRecord } from "./types";

function record(entry: SavedGradeExamRecord["entries"][number]): SavedGradeExamRecord {
  return {
    id: "exam-1",
    name: "月考",
    date: "2026-08-01",
    savedAt: "2026-08-01T08:00:00.000Z",
    studentCount: 1,
    subjectCount: 1,
    subjects: ["数学"],
    entries: [entry],
  };
}

describe("grade student identity", () => {
  it("uses a unique student number before a duplicate name", () => {
    const students = [
      { ...createTestStudent("s1", "同名"), studentNo: "001" },
      { ...createTestStudent("s2", "同名"), studentNo: "002" },
    ];
    expect(resolveGradeStudent(students, { name: "同名", studentNo: "002" })?.id).toBe("s2");
  });

  it("keeps a stable student link after the student is renamed", () => {
    const students = [{ ...createTestStudent("s1", "新姓名"), studentNo: "001" }];
    expect(resolveGradeStudent(students, { studentId: "s1", name: "旧姓名" })?.name).toBe("新姓名");
  });

  it("does not guess when multiple active students only share a name", () => {
    const students = [createTestStudent("s1", "同名"), createTestStudent("s2", "同名")];
    expect(resolveGradeStudent(students, { name: "同名" })).toBeUndefined();
    expect(attachSavedGradeStudentIds([record({ name: "同名", scores: {}, total: { score: 90 } })], students)[0].entries[0].studentId).toBeUndefined();
  });
});
