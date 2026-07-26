import { describe, expect, it } from "vitest";

import { applyParsedRoster, detectRosterMapping, parseRosterRows, prepareRosterRows, type ParsedRoster } from "./rosterImport";
import { ensureWorkspaceBook, readCurrentSliceData, writeCurrentSliceData } from "./workspaces";

describe("roster import", () => {
  it("finds the header and preserves student metadata", () => {
    const rows = [["高一（2）班名单"], ["学号", "姓名", "性别"], ["01", "张三", "男"]];
    const prepared = prepareRosterRows(rows);
    const parsed = parseRosterRows(prepared, detectRosterMapping(prepared));
    expect(parsed.names).toEqual(["张三"]);
    expect(parsed.studentNoList).toEqual(["01"]);
    expect(parsed.genderList).toEqual(["男"]);
  });

  it("converts explicit row and column positions to seats", () => {
    const rows = [["姓名", "行", "列"], ["张三", "2", "3"]];
    const parsed = parseRosterRows(rows, detectRosterMapping(rows));
    expect(parsed.hasPlacement).toBe(true);
    expect(parsed.placements[10]).toBe("张三");
  });
});

function parsedNames(names: string[]): ParsedRoster {
  return {
    names,
    placements: [],
    genders: [],
    studentNos: [],
    genderList: names.map(() => ""),
    studentNoList: names.map(() => ""),
    hasPlacement: false,
  };
}

function seedRoster(students: Array<Record<string, unknown>>) {
  ensureWorkspaceBook();
  writeCurrentSliceData({ students, seatOrder: students.filter(student => student.enrollmentStatus !== "archived").map(student => String(student.id)) });
}

describe("roster replace import protection", () => {
  it("archives active students missing from the new roster instead of deleting them", () => {
    seedRoster([
      { id: "s1", name: "张三", records: [{ id: "r1", type: "reward", note: "旧记录", date: "2026-03-01" }] },
      { id: "s2", name: "李四" },
      { id: "s3", name: "王五", enrollmentStatus: "archived", archivedAt: "2026-05-01T00:00:00.000Z" },
    ]);

    const result = applyParsedRoster(parsedNames(["张三", "赵六"]), { replaceExisting: true, keepHistory: true });

    expect(result.mode).toBe("replace");
    expect(result.matchedCount).toBe(1);
    expect(result.archivedCount).toBe(1);
    const byName = new Map(result.state.students.map(student => [student.name, student]));
    expect(byName.get("张三")?.id).toBe("s1");
    expect(byName.get("张三")?.records).toHaveLength(1);
    expect(byName.get("李四")?.enrollmentStatus).toBe("archived");
    expect(byName.get("王五")?.enrollmentStatus).toBe("archived");
    expect(byName.get("赵六")?.enrollmentStatus).not.toBe("archived");
    const stored = readCurrentSliceData() as { students: Array<{ id: string }> };
    expect(stored.students).toHaveLength(4);
  });

  it("parks every previous active student in the archive when history is not kept", () => {
    seedRoster([{ id: "s1", name: "张三" }]);

    const result = applyParsedRoster(parsedNames(["张三"]), { replaceExisting: true, keepHistory: false });

    expect(result.matchedCount).toBe(0);
    const archived = result.state.students.filter(student => student.enrollmentStatus === "archived");
    expect(archived.map(student => student.id)).toEqual(["s1"]);
    const active = result.state.students.filter(student => student.enrollmentStatus !== "archived");
    expect(active).toHaveLength(1);
    expect(active[0].id).not.toBe("s1");
  });

  it("revives an archived student matched by the replacing roster", () => {
    seedRoster([{ id: "s1", name: "张三", enrollmentStatus: "archived", archivedAt: "2026-05-01T00:00:00.000Z" }]);

    const result = applyParsedRoster(parsedNames(["张三"]), { replaceExisting: true, keepHistory: true });

    const student = result.state.students.find(item => item.id === "s1");
    expect(student?.enrollmentStatus).not.toBe("archived");
    expect(result.state.students).toHaveLength(1);
  });
});

describe("roster append import", () => {
  it("skips duplicate active names, revives archived matches and appends the rest", () => {
    seedRoster([
      { id: "s1", name: "张三" },
      { id: "s2", name: "李四", enrollmentStatus: "archived", archivedAt: "2026-05-01T00:00:00.000Z" },
    ]);

    const result = applyParsedRoster(parsedNames(["张三", "李四", "赵六"]), { replaceExisting: false, keepHistory: true });

    expect(result.mode).toBe("append");
    expect(result.skippedCount).toBe(1);
    expect(result.matchedCount).toBe(1);
    expect(result.newCount).toBe(1);
    expect(result.studentCount).toBe(3);
    const liFour = result.state.students.find(student => student.id === "s2");
    expect(liFour?.enrollmentStatus).not.toBe("archived");
    expect(result.state.seatOrder).toContain("s2");
  });
});
