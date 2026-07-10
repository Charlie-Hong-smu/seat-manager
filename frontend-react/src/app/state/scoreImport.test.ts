import { describe, expect, it } from "vitest";

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
});
