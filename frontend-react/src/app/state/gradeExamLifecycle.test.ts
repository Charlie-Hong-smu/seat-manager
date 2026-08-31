import { describe, expect, it, vi } from "vitest";
import { createSeatManagerState } from "./legacyStateAdapter";
import { deleteGradeExamRecord, saveGradeExamRecord, saveLegacySnapshot, updateGradeExamRecordMetadata } from "./legacyWriteAdapter";
import { ensureWorkspaceBook, readCurrentSliceData, writeCurrentSliceData } from "./workspaces";
import { createTestStudent } from "./testFixtures";
import type { ActivityEvent, SavedGradeExamRecord, SeatManagerState, StudentExamSummary } from "./types";

const cell = { score: 92, rawScore: 88, assignedScore: 92, rankClass: 2, rankSchool: 18 };
const total = { ...cell, rankClass: 3, rankSchool: 27 };
const legacyExam: StudentExamSummary = { id: "legacy", name: "期中考", date: "2026-07-10", scores: { 语文: 92 }, scoreCells: { 语文: cell }, total: 92, totalCell: total, rank: "3" };
const student = { ...createTestStudent("s1", "测试甲"), exams: [legacyExam] };
const archived = { ...createTestStudent("s2", "测试乙"), enrollmentStatus: "archived" as const, exams: [legacyExam] };

function record(id = "midterm"): SavedGradeExamRecord {
  return { id, name: "期中考", date: "2026-07-10", savedAt: "2026-08-31T00:00:00Z", subjects: ["语文"], subjectCount: 1, studentCount: 2,
    rankConfig: { autoClassRank: true, scoreBasis: "effective" },
    entries: [student, archived].map(item => ({ studentId: item.id, name: item.name, scores: { 语文: cell }, total })),
  };
}

function event(id: string, action: ActivityEvent["action"] = "deleted", occurredAt = "2026-08-31T10:00:00Z"): ActivityEvent {
  return { id: `event-${id}-${action}`, action, ref: { domain: "score", entityId: id }, studentIds: [], title: "考试操作", detail: "", occurredAt };
}

function seed(raw: Record<string, unknown> = { students: [student, archived], seatOrder: [student.id] }) {
  ensureWorkspaceBook();
  writeCurrentSliceData(raw);
  return createSeatManagerState(raw);
}

function snapshot(state: SeatManagerState) {
  return { ...state, lockedSeats: state.lockedSeats };
}

function reload() { return createSeatManagerState(readCurrentSliceData()); }

describe("grade exam lifecycle", () => {
  it("deletes from the current normalized roster, archived roster and persisted data without deleting same-name exams", () => {
    const first = saveGradeExamRecord({ ...snapshot(seed()), record: record() })!;
    const second = saveGradeExamRecord({ ...snapshot(first), record: record("another") })!;
    expect(second.students[0].exams.map(item => item.id)).toEqual(["legacy", "another", "midterm"]);
    const next = deleteGradeExamRecord({ ...snapshot(second), examId: "midterm" })!;
    expect(next.gradeExams.map(item => item.id)).toEqual(["another", "legacy"]);
    for (const item of reload().students) expect(item.exams.map(exam => exam.id)).toEqual(["legacy", "another"]);
    expect(next.students[1].enrollmentStatus).toBe("archived");
  });

  it("does not resurrect the last deleted exam through the legacy fallback", () => {
    const state = seed({ students: [{ ...student, exams: [] }], seatOrder: [student.id] });
    const saved = saveGradeExamRecord({ ...snapshot(state), record: record() })!;
    const next = deleteGradeExamRecord({ ...snapshot(saved), examId: "midterm" })!;
    expect(next.savedExams).toEqual([]);
    expect(next.gradeExams).toEqual([]);
    expect(reload().students[0].exams).toEqual([]);
    expect(reload().gradeExams).toEqual([]);
  });

  it("deletes old records with lost source markers by id and retains unrelated orphan records", () => {
    const state = seed({ students: [{ ...student, exams: [{ ...legacyExam, id: "midterm" }, { ...legacyExam, id: "orphan", source: "savedExamRecord" }] }], savedExams: [record()], seatOrder: [student.id] });
    const next = deleteGradeExamRecord({ ...snapshot(state), examId: "midterm" })!;
    expect(next.students[0].exams.map(item => item.id)).toEqual(["orphan"]);
    expect(reload().students[0].exams.map(item => item.id)).toEqual(["orphan"]);
  });

  it("supports deletion of a student-only legacy exam and its old catalog entry", () => {
    const state = seed({ students: [student, archived], seatOrder: [student.id], exams: [{ id: "legacy" }, { id: "unrelated" }] });
    const next = deleteGradeExamRecord({ ...snapshot(state), examId: "legacy" })!;
    expect(next.students.every(item => item.exams.length === 0)).toBe(true);
    expect(next.exams).toEqual([{ id: "unrelated" }]);
    expect(reload().gradeExams).toEqual([]);
  });

  it("preserves score variants, ranks and provenance across snapshot writes and metadata edits", () => {
    const saved = saveGradeExamRecord({ ...snapshot(seed()), record: record() })!;
    expect(saveLegacySnapshot(snapshot(saved))).toBe(true);
    const normalized = reload();
    const updated = updateGradeExamRecordMetadata({ ...snapshot(normalized), examId: "midterm", name: "期中考修订", date: "2026-08-31" })!;
    const exam = updated.students[0].exams.find(item => item.id === "midterm")!;
    expect(exam).toMatchObject({ source: "savedExamRecord", name: "期中考修订", date: "2026-08-31", scoreCells: { 语文: cell }, totalCell: total });
    expect(updated.students[0].exams.filter(item => item.id === "midterm")).toHaveLength(1);
    expect(reload().students[0].exams.find(item => item.id === "legacy")).toMatchObject({ scoreCells: { 语文: cell }, totalCell: total });
  });

  it("keeps other legacy exams visible when undo restores an exam as a saved record", () => {
    const state = seed({ students: [{ ...student, exams: [legacyExam, { ...legacyExam, id: "other-legacy" }] }] });
    const deleted = deleteGradeExamRecord({ ...snapshot(state), examId: "legacy" })!;
    const restored = saveGradeExamRecord({ ...snapshot(deleted), record: record("legacy") })!;
    expect(restored.gradeExams.map(exam => exam.id)).toEqual(["legacy", "other-legacy"]);
    expect(reload().gradeExams).toHaveLength(2);
  });

  it("does not duplicate a student's exam projection when imported rows resolve to the same student", () => {
    const duplicate = record();
    duplicate.entries.push({ ...duplicate.entries[0], scores: { 语文: { ...cell, score: 95, assignedScore: 95 } } });
    const saved = saveGradeExamRecord({ ...snapshot(seed()), record: duplicate })!;
    const exams = saved.students[0].exams.filter(exam => exam.id === duplicate.id);
    expect(exams).toHaveLength(1);
    expect(exams[0].scores.语文).toBe(95);
  });

  it("restores both projections and full scores while retaining intervening cross-domain changes", () => {
    const saved = saveGradeExamRecord({ ...snapshot(seed()), record: record() })!;
    const deletion = event("midterm");
    const deleted = deleteGradeExamRecord({ ...snapshot(saved), examId: "midterm", activityEvents: [deletion] })!;
    const restored = saveGradeExamRecord({ ...snapshot(deleted), record: record(), activityEvents: [], settings: { marker: "new setting" }, students: deleted.students.map(item => ({ ...item, address: "new address" })) })!;
    expect(restored.activityEvents).toEqual([]);
    expect(restored.settings.marker).toBe("new setting");
    expect(restored.students[0].address).toBe("new address");
    expect(restored.students[0].exams.find(item => item.id === "midterm")).toMatchObject({ scoreCells: { 语文: cell }, totalCell: total });
    expect(reload().gradeExams[0].rankConfig).toEqual(record().rankConfig);
  });

  it("does not write or change state when the target does not exist or storage fails", () => {
    const saved = saveGradeExamRecord({ ...snapshot(seed()), record: record() })!;
    const original = JSON.stringify(readCurrentSliceData());
    expect(deleteGradeExamRecord({ ...snapshot(saved), examId: "missing" })).toBeNull();
    const writeSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(deleteGradeExamRecord({ ...snapshot(saved), examId: "midterm", activityEvents: [event("midterm")] })).toBeNull();
    expect(JSON.stringify(readCurrentSliceData())).toBe(original);
    expect(saved.students[0].exams.some(item => item.id === "midterm")).toBe(true);
    writeSpy.mockRestore();
    warning.mockRestore();
  });
});

describe("repair of previously deleted exam projections", () => {
  it("removes only ids backed by a confirmed deletion, without mutating the input or the stored backup during read", () => {
    const raw = { students: [student, archived], savedExams: [], seatOrder: [student.id], activityEvents: [event("legacy")] };
    const before = JSON.stringify(raw);
    const state = seed(raw);
    expect(state.students.every(item => item.exams.length === 0)).toBe(true);
    expect(state.gradeExams).toEqual([]);
    expect(JSON.stringify(raw)).toBe(before);
    expect(JSON.stringify(readCurrentSliceData())).toBe(before);
    expect(saveLegacySnapshot(snapshot(state))).toBe(true);
    expect(reload().students.every(item => item.exams.length === 0)).toBe(true);
  });

  it("repairs an old deletion even when other saved exams remain", () => {
    const state = seed({ students: [student], savedExams: [record()], activityEvents: [event("legacy")] });
    expect(state.students[0].exams).toEqual([]);
    expect(state.gradeExams.map(item => item.id)).toEqual(["midterm"]);
  });

  it("retains historical records without explicit deletion evidence and preserves rich fallback scores", () => {
    const state = seed();
    expect(state.students[0].exams[0].id).toBe("legacy");
    expect(state.gradeExams[0].rows[0]).toMatchObject({ scores: { 语文: cell }, totalCell: total, rankClass: 3, rankSchool: 27 });
  });

  it("retains an explicitly restored record even if an old deletion event remains", () => {
    const state = seed({ students: [student], savedExams: [record("legacy")], activityEvents: [event("legacy")] });
    expect(state.students[0].exams).toHaveLength(1);
  });

  it("respects later restores and ignores deletions of questions or individual score rows", () => {
    for (const latest of [
      event("legacy", "restored", "2026-08-31T11:00:00Z"),
      event("legacy", "created", "2026-08-31T11:00:00Z"),
    ]) {
      const state = seed({ students: [student], activityEvents: [event("legacy"), latest] });
      expect(state.students[0].exams).toHaveLength(1);
    }
    for (const ref of [{ domain: "score", entityId: "legacy", subEntityId: "q1" }, { domain: "score", entityId: "legacy", studentId: "s1" }, { domain: "student", entityId: "legacy" }]) {
      expect(seed({ students: [student], activityEvents: [{ ...event("legacy"), ref }] }).students[0].exams).toHaveLength(1);
    }
  });
});
