import { describe, expect, it } from "vitest";

import { detectRosterMapping, parseRosterRows, prepareRosterRows } from "./rosterImport";

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
