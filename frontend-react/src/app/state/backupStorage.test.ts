import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseBackupFile, restoreBackup } from "./backupStorage";
import { readLegacyRootState } from "./storage";

describe("backup storage", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  it("parses and restores a compatible backup without changing its data", async () => {
    const data = { students: [{ id: "s1", name: "张三" }], seatOrder: ["s1"], custom: { keep: true } };
    const file = { text: async () => JSON.stringify({ version: 1, exportedAt: "2026-01-01", data }) } as File;
    const preview = await parseBackupFile(file);
    expect(preview.studentCount).toBe(1);
    expect(preview.warning).toBe("");
    expect(restoreBackup(preview)).toBe(true);
    expect(readLegacyRootState()).toEqual(data);
  });

  it("rejects a payload without students and seat order", async () => {
    const file = { text: async () => JSON.stringify({ version: 1, data: { students: [] } }) } as File;
    await expect(parseBackupFile(file)).rejects.toThrow("invalid_backup");
  });
});
