import { describe, expect, it } from "vitest";

import { ensureWorkspaceBook, importWholeBook, nextGradeNumber, readCurrentSliceData } from "./workspaces";

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
});
