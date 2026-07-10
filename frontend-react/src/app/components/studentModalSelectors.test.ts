import { describe, expect, it } from "vitest";
import { buildWeekOptions, getExamTotal, getWeekStart, isRecordInWeek, parseAliases, toLocalDateKey } from "./studentModalSelectors";

describe("student modal selectors", () => {
  it("groups local records into stable Monday-based weeks", () => {
    const records = [{ id: "r1", type: "note" as const, note: "跟进", date: "2026-07-08" }];
    const weeks = buildWeekOptions(records, new Date(2026, 6, 10));
    expect(weeks[0].key).toBe("2026-07-06");
    expect(isRecordInWeek(records[0], weeks[0])).toBe(true);
    expect(toLocalDateKey(getWeekStart(new Date(2026, 6, 12)))).toBe("2026-07-06");
  });

  it("derives totals and cleans aliases without mutating state", () => {
    expect(getExamTotal({ id: "e1", name: "期中", date: "", scores: { 语文: 90, 数学: 95 } })).toBe(185);
    expect(parseAliases("小张、 张同学，班长\n")).toEqual(["小张", "张同学", "班长"]);
  });
});
