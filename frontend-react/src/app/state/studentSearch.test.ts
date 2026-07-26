import { describe, expect, it } from "vitest";

import { matchesStudentSearch, normalizeStudentSearch } from "./studentSearch";

describe("studentSearch", () => {
  const student = { name: " 张 三 ", aliases: ["小张", "班长"] };

  it("normalizes whitespace and case", () => {
    expect(normalizeStudentSearch("  Xiao ZHANG ")).toBe("xiaozhang");
  });

  it("matches names and aliases through the same rule", () => {
    expect(matchesStudentSearch(student, "张三")).toBe(true);
    expect(matchesStudentSearch(student, " 小 张 ")).toBe(true);
    expect(matchesStudentSearch(student, "班长")).toBe(true);
    expect(matchesStudentSearch(student, "李")).toBe(false);
  });
});
