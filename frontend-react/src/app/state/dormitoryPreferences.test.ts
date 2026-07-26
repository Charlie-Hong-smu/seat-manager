import { describe, expect, it } from "vitest";

import { normalizeDormitoryPreferences, readLegacyDormitoryPreferences } from "./dormitoryPreferences";

describe("dormitoryPreferences", () => {
  it("normalizes saved presets and finite scores", () => {
    expect(normalizeDormitoryPreferences({
      presets: [{ label: " 早操 " }, { label: "早操" }, { label: "" }],
      scoreMemory: { "早操": 2, "坏值": "1" },
    })).toEqual({ version: 1, presets: [{ label: "早操" }], scoreMemory: { "早操": 2 } });
  });

  it("reads old global keys without mutating them", () => {
    const values = new Map([
      ["dorm-presets", JSON.stringify([{ label: "内务" }])],
      ["dorm-score-memory", JSON.stringify({ "内务": 3 })],
    ]);
    const storage = { getItem: (key: string) => values.get(key) || null };
    expect(readLegacyDormitoryPreferences(storage)).toEqual({
      version: 1,
      presets: [{ label: "内务" }],
      scoreMemory: { "内务": 3 },
    });
  });
});
