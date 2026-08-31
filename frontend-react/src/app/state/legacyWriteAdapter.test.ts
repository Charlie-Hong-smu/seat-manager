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

  it("stores and reloads a stable student id selected by student number", () => {
    const first = { ...createTestStudent("s1", "同名"), studentNo: "001" };
    const second = { ...createTestStudent("s2", "同名"), studentNo: "002" };
    seedSlice([first, second]);
    const input = examRecord("同名");
    input.entries[0].studentNo = "002";

    const next = saveGradeExamRecord({ record: input, students: [first, second], seatOrder: [first.id, second.id], lockedSeats: [] });

    expect(next?.gradeExams[0].rows[0].studentId).toBe("s2");
    const stored = readCurrentSliceData() as { savedExams: SavedGradeExamRecord[] };
    expect(stored.savedExams[0].entries[0].studentId).toBe("s2");
  });

  it("preserves the current cross-domain snapshot during a direct grade write", () => {
    const student = createTestStudent("s1", "张三");
    seedSlice([student]);
    const next = saveGradeExamRecord({
      record: examRecord("张三"),
      students: [student],
      seatOrder: [student.id],
      lockedSeats: [],
      fundTransactions: [{ id: "fund-new", type: "income", amount: 20, category: "班费", note: "", date: "2026-08-02", createdAt: "2026-08-02T08:00:00.000Z", status: "active" }],
      attendanceRecords: [{ id: "attendance-new", studentId: student.id, date: "2026-08-02", status: "normal", late: true, earlyLeave: false, note: "", createdAt: "2026-08-02T08:00:00.000Z", updatedAt: "2026-08-02T08:00:00.000Z" }],
    });
    expect(next?.fundTransactions.map(item => item.id)).toEqual(["fund-new"]);
    expect(next?.attendanceRecords.map(item => item.id)).toEqual(["attendance-new"]);
  });

  it("persists raw scores, assigned scores, per-subject ranks and ranking choice", () => {
    const student = createTestStudent("s1", "张三");
    seedSlice([student]);
    const input = examRecord("张三");
    input.rankConfig = { autoClassRank: true, scoreBasis: "effective" };
    input.entries[0].scores.语文 = { score: 92, rawScore: 88, assignedScore: 92, rankClass: 2, rankSchool: 18 };
    input.entries[0].total = { score: 175, rawScore: 168, assignedScore: 175, rankClass: 3, rankSchool: 27 };

    const next = saveGradeExamRecord({ record: input, students: [student], seatOrder: [student.id], lockedSeats: [] });

    expect(next?.gradeExams[0]).toMatchObject({ rankConfig: { autoClassRank: true, scoreBasis: "effective" } });
    expect(next?.gradeExams[0].rows[0].scores.语文).toEqual({ score: 92, rawScore: 88, assignedScore: 92, rankClass: 2, rankSchool: 18 });
    expect(next?.gradeExams[0].rows[0].totalCell).toEqual({ score: 175, rawScore: 168, assignedScore: 175, rankClass: 3, rankSchool: 27 });
    expect(next?.students[0].exams[0].scoreCells?.语文).toEqual({ score: 92, rawScore: 88, assignedScore: 92, rankClass: 2, rankSchool: 18 });
    const stored = readCurrentSliceData() as { savedExams: SavedGradeExamRecord[] };
    expect(stored.savedExams[0].entries[0].scores.语文.assignedScore).toBe(92);
  });
});
