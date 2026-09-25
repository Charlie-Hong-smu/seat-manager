import { describe, expect, it } from "vitest";

import type { ScoreMapping } from "../state/scoreImport";
import { assignColumnRole, columnRoleOf, columnRoleOptions, mappedColumnCount } from "./scoreColumnRoles";

function mapping(): ScoreMapping {
  return {
    headers: ["姓名", "语文", "语文班排", "总分"],
    nameCol: 0,
    studentNoCol: -1,
    subjectMappings: [{ subject: "语文", scoreCol: 1, rawScoreCol: -1, assignedScoreCol: -1, rankClassCol: 2, rankSchoolCol: -1 }],
    totalMapping: { scoreCol: 3, rawScoreCol: -1, assignedScoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 },
    warnings: [],
  };
}

describe("score column roles", () => {
  it("reads each column's role from the subject-centric mapping", () => {
    const map = mapping();
    expect(columnRoleOf(map, 0)).toBe("name");
    expect(columnRoleOf(map, 1)).toBe("subject:0:scoreCol");
    expect(columnRoleOf(map, 2)).toBe("subject:0:rankClassCol");
    expect(columnRoleOf(map, 3)).toBe("total:scoreCol");
    expect(columnRoleOf(map, 4)).toBe("unused");
    expect(mappedColumnCount(map, 5)).toBe(4);
  });

  it("moves a role to a new column and frees both ends", () => {
    const map = mapping();
    const next = assignColumnRole(map, 4, "subject:0:scoreCol");
    expect(next.subjectMappings[0].scoreCol).toBe(4);
    expect(columnRoleOf(next, 1)).toBe("unused");
    expect(columnRoleOf(next, 4)).toBe("subject:0:scoreCol");
    expect(next.nameCol).toBe(0);
  });

  it("reassigning a column clears its previous role", () => {
    const next = assignColumnRole(mapping(), 0, "studentNo");
    expect(next.nameCol).toBe(-1);
    expect(next.studentNoCol).toBe(0);
  });

  it("offers base roles, every subject field and total fields", () => {
    const options = columnRoleOptions(mapping()).map(option => option.label);
    expect(options.slice(0, 3)).toEqual(["未使用", "姓名", "学号"]);
    expect(options).toContain("语文 · 班排");
    expect(options).toContain("总分 · 校排");
  });
});
