import { describe, expect, it } from "vitest";

import { advanceToNextTerm, ensureWorkspaceBook, importWholeBook, makeTerm, nextGradeNumber, readCurrentSliceData, writeCurrentSliceData } from "./workspaces";

describe("workspace storage", () => {
  it("migrates the legacy single-class state without changing its data", () => {
    const legacy = { students: [{ id: "s1", name: "张三" }], seatOrder: ["s1"], settings: { compact: true } };
    window.localStorage.setItem("homeroom-seat-manager-v1", JSON.stringify(legacy));
    const book = ensureWorkspaceBook();
    expect(book.slices).toHaveLength(1);
    expect(readCurrentSliceData()).toEqual(legacy);
  });

  it("imports an existing workspace book without changing the schema", () => {
    const payload = {
      version: 1 as const,
      currentSliceId: "slice-1",
      slices: [{
        id: "slice-1",
        classId: "class-1",
        className: "高一(2)班",
        term: { id: "term-1", year: 2026, season: "spring" as const, label: "2026 春", createdAt: "2026-01-01T00:00:00.000Z" },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        data: { students: [], seatOrder: [] },
      }],
    };
    expect(importWholeBook(payload)).toBe(true);
    expect(ensureWorkspaceBook()).toEqual(payload);
  });

  it("advances grade only from spring to autumn", () => {
    expect(nextGradeNumber("senior", 1, "spring", "autumn")).toBe(2);
    expect(nextGradeNumber("senior", 2, "autumn", "spring")).toBe(2);
  });

  it("keeps long-lived student profile fields when advancing a term", () => {
    const book = ensureWorkspaceBook();
    writeCurrentSliceData({ students: [{ id: "s1", name: "甲", studentNo: "01", gender: "男", aliases: [], parentPhone: "138", address: "地址", emergencyContact: "家长", isBoarding: true, records: [{ id: "r", type: "note", note: "旧记录", date: "2026-01-01" }], exams: [] }], seatOrder: [], settings: { dormitoryPeriod: { anchorDate: "2026-01-05", unit: "week", intervalCount: 2 } } });
    const next = advanceToNextTerm({ fromSliceId: book.currentSliceId, term: makeTerm({ year: 2026, season: "autumn" }), copyRoster: true });
    const student = next?.data.students as Array<Record<string, unknown>>;
    expect(student[0]).toMatchObject({ studentNo: "01", parentPhone: "138", address: "地址", emergencyContact: "家长", isBoarding: true, records: [] });
    expect(next?.data.settings).toEqual({ dormitoryPeriod: { anchorDate: "2026-01-05", unit: "week", intervalCount: 2 } });
  });
});
