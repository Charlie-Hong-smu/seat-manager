import { describe, expect, it } from "vitest";

import { deleteGradeExamRecord, saveGradeExamRecord } from "./legacyWriteAdapter";
import { readCurrentSliceData, ensureWorkspaceBook, writeCurrentSliceData } from "./workspaces";
import { createTestStudent } from "./testFixtures";
import type { AppStudent, SavedGradeExamRecord } from "./types";

function archivedStudent(id: string, name: string): AppStudent {
  return { ...createTestStudent(id, name), enrollmentStatus: "archived", archivedAt: "2026-06-30T00:00:00.000Z" };
}

function examRecord(entryName: string): SavedGradeExamRecord {
  return {
    id: "exam-1",
    name: "期中考试",
    date: "2026-04-30",
    savedAt: "2026-04-30T08:00:00.000Z",
    studentCount: 1,
    subjectCount: 1,
    subjects: ["语文"],
    entries: [{
      name: entryName,
      scores: { 语文: { score: 90, rankClass: null, rankSchool: null } },
      total: { score: 90, rankClass: null, rankSchool: null },
    }],
  };
}

function seedSlice(students: AppStudent[]) {
  ensureWorkspaceBook();
  writeCurrentSliceData({ students, seatOrder: students.map(student => student.id) });
}

describe("legacyWriteAdapter roster retention", () => {
  it("keeps archived students when a grade exam is saved with the full roster", () => {
    const active = createTestStudent("s-active", "李四");
    const archived = archivedStudent("s-archived", "张三");
    seedSlice([active, archived]);

    const next = saveGradeExamRecord({ record: examRecord("李四"), students: [active, archived], seatOrder: [active.id], lockedSeats: [] });

    expect(next).not.toBeNull();
    expect(next?.students.map(student => student.id)).toEqual(["s-active", "s-archived"]);
    expect(next?.students.find(student => student.id === "s-archived")?.enrollmentStatus).toBe("archived");
    const stored = readCurrentSliceData() as { students: Array<{ id: string; enrollmentStatus?: string }> };
    expect(stored.students.map(student => student.id)).toContain("s-archived");
  });

  it("keeps archived students when a grade exam is deleted", () => {
    const active = createTestStudent("s-active", "李四");
    const archived = archivedStudent("s-archived", "张三");
    seedSlice([active, archived]);
    saveGradeExamRecord({ record: examRecord("李四"), students: [active, archived], seatOrder: [active.id], lockedSeats: [] });

    const next = deleteGradeExamRecord({ examId: "exam-1", students: [active, archived], seatOrder: [active.id], lockedSeats: [] });

    expect(next).not.toBeNull();
    expect(next?.students.map(student => student.id)).toEqual(["s-active", "s-archived"]);
  });

  it("prefers the active student when an archived student shares the same name", () => {
    const archived = archivedStudent("s-archived", "张三");
    const active = createTestStudent("s-active", "张三");
    seedSlice([archived, active]);

    const next = saveGradeExamRecord({ record: examRecord("张三"), students: [archived, active], seatOrder: [active.id], lockedSeats: [] });

    expect(next).not.toBeNull();
    expect(next?.students.find(student => student.id === "s-active")?.exams).toHaveLength(1);
    expect(next?.students.find(student => student.id === "s-archived")?.exams).toHaveLength(0);
  });
});
