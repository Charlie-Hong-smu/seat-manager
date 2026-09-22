import { describe, expect, it } from "vitest";
import { DEFAULT_FOLLOWUP_TYPES, normalizeFollowupTypes, validateFollowupTypes } from "./followupTypes";
describe("followup type catalog", () => {
  it("keeps legacy defaults and normalizes persisted catalogs", () => {
    expect(normalizeFollowupTypes(undefined)).toEqual(DEFAULT_FOLLOWUP_TYPES);
    expect(normalizeFollowupTypes([" 阅读跟进 ", null, "阅读跟进", ""])).toEqual(["阅读跟进"]);
    expect(normalizeFollowupTypes([])).toEqual(DEFAULT_FOLLOWUP_TYPES);
  });
  it("validates edited names without silently discarding duplicates", () => {
    expect(validateFollowupTypes("阅读跟进\n家校联系")).toEqual({ values: ["阅读跟进", "家校联系"], error: "" });
    expect(validateFollowupTypes("\n").error).not.toBe("");
    expect(validateFollowupTypes("阅读跟进\n 阅读跟进 ").error).not.toBe("");
    expect(validateFollowupTypes("长".repeat(31)).error).not.toBe("");
  });
});
