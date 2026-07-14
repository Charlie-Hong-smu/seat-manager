import { beforeEach, describe, expect, it } from "vitest";

import { inspectWorkspaceStorage, prepareWorkspaceImport, WORKSPACES_KEY } from "./workspaces";
import { validateWorkspaceBook } from "./workspaceValidation";

function validBook() {
  return {
    version: 1 as const,
    currentSliceId: "slice-1",
    slices: [{
      id: "slice-1",
      classId: "class-1",
      className: "高一(1)班",
      term: { id: "term-1", year: 2026, season: "autumn" as const, label: "2026 秋", createdAt: "2026-07-14T00:00:00.000Z" },
      createdAt: "2026-07-14T00:00:00.000Z",
      updatedAt: "2026-07-14T00:00:00.000Z",
      data: { students: [], seatOrder: [], futureField: { keep: true } },
      futureSliceField: "keep",
    }],
    futureRootField: "keep",
  };
}

describe("workspace validation", () => {
  beforeEach(() => localStorage.clear());

  it("preserves unknown compatibility fields", () => {
    const result = validateWorkspaceBook(validBook());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.book as unknown as Record<string, unknown>).futureRootField).toBe("keep");
    expect((result.book.slices[0] as unknown as Record<string, unknown>).futureSliceField).toBe("keep");
    expect(result.book.slices[0].data.futureField).toEqual({ keep: true });
  });

  it("rejects duplicate IDs and malformed slice data", () => {
    const book = validBook();
    book.slices.push({ ...book.slices[0], data: { students: [] } } as typeof book.slices[0]);
    const result = validateWorkspaceBook(book);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map(issue => issue.message)).toEqual(expect.arrayContaining(["切片 ID 不能重复", "学期 ID 不能重复", "座位列表必须是数组"]));
  });

  it("reports corrupt local data without overwriting it", () => {
    const raw = "{broken-json";
    localStorage.setItem(WORKSPACES_KEY, raw);
    expect(inspectWorkspaceStorage()).toMatchObject({ status: "corrupt", raw });
    expect(localStorage.getItem(WORKSPACES_KEY)).toBe(raw);
  });

  it("wraps a valid legacy state but rejects a legacy state without seats", () => {
    expect(prepareWorkspaceImport({ students: [], seatOrder: [], custom: true }).format).toBe("legacy-state");
    expect(() => prepareWorkspaceImport({ students: [] })).toThrow("workspace_storage_corrupt");
  });
});
