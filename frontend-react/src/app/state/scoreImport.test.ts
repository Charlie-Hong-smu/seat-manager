import { describe, expect, it } from "vitest";

import { applyAutomaticClassRanks } from "./gradeRanking";
import { detectScoreMapping, parseRowsWithMapping, prepareScoreRows } from "./scoreImport";

describe("score import", () => {
  it("finds a real header after title rows", () => {
    const rows = [["2026 春季期中成绩"], [], ["学号", "姓名", "语文", "班排"], ["01", "张三", "92", "3"]];
    const prepared = prepareScoreRows(rows);
    expect(prepared[0]).toEqual(["学号", "姓名", "语文", "班排"]);
    expect(detectScoreMapping(prepared).nameCol).toBe(1);
  });

  it("maps score and class rank without treating rank as score", () => {
    const rows = [["姓名", "语文", "班排"], ["张三", "92", "3"]];
    const mapping = detectScoreMapping(rows);
    const draft = parseRowsWithMapping(rows, mapping);
    expect(draft.entries[0].scores["语文"]).toEqual({ score: 92, rankClass: 3, rankSchool: null });
  });

  it("maps grouped subject and total rank columns by their own headers", () => {
    const rows = [
      ["姓名", "语文", "数学", "语文排名", "数学排名", "总分", "总排名", "语文校排", "数学年级排名", "总校排"],
      ["张三", "92", "88", "2", "4", "180", "3", "20", "35", "28"],
    ];
    const mapping = detectScoreMapping(rows);
    expect(mapping.subjectMappings).toEqual(expect.arrayContaining([
      expect.objectContaining({ subject: "语文", rankClassCol: 3, rankSchoolCol: 7 }),
      expect.objectContaining({ subject: "数学", rankClassCol: 4, rankSchoolCol: 8 }),
    ]));
    expect(mapping.totalMapping).toMatchObject({ scoreCol: 5, rankClassCol: 6, rankSchoolCol: 9 });
    const draft = parseRowsWithMapping(rows, mapping);

    expect(draft.entries[0].scores.语文).toMatchObject({ score: 92, rankClass: 2, rankSchool: 20 });
    expect(draft.entries[0].scores.数学).toMatchObject({ score: 88, rankClass: 4, rankSchool: 35 });
    expect(draft.entries[0].total).toMatchObject({ score: 180, rankClass: 3, rankSchool: 28 });
  });

  it("keeps raw and assigned scores while using assigned scores as the effective value", () => {
    const rows = [
      ["姓名", "语文原始分", "语文赋分", "语文班排", "总分原始分", "总分赋分"],
      ["张三", "88", "92", "2", "168", "175"],
    ];
    const draft = parseRowsWithMapping(rows, detectScoreMapping(rows));

    expect(draft.entries[0].scores["语文"]).toEqual({
      score: 92,
      rawScore: 88,
      assignedScore: 92,
      rankClass: 2,
      rankSchool: null,
    });
    expect(draft.entries[0].total).toMatchObject({ score: 175, rawScore: 168, assignedScore: 175 });
  });

  it("fills only missing class ranks with competition ranking and leaves missing scores unranked", () => {
    const rows = [
      ["姓名", "语文赋分", "语文班排", "数学原始分"],
      ["张三", "95", "", "80"],
      ["李四", "95", "9", "80"],
      ["王五", "90", "", "70"],
      ["钱七", "85", "", ""],
      ["赵六", "", "", ""],
    ];
    const ranked = applyAutomaticClassRanks(parseRowsWithMapping(rows, detectScoreMapping(rows)));

    expect(ranked.entries.map(entry => entry.scores["语文"].rankClass)).toEqual([1, 9, 3, 4, null]);
    expect(ranked.entries.map(entry => entry.scores["数学"].rankClass)).toEqual([1, 1, 3, null, null]);
    expect(ranked.entries.map(entry => entry.total.rankClass)).toEqual([1, 1, 3, null, null]);
  });
});
