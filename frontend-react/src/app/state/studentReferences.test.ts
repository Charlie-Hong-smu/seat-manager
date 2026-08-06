import { describe, expect, it } from "vitest";

import { resolveReferencedStudentNames } from "./studentReferences";

describe("resolveReferencedStudentNames", () => {
  const students = [{ id: "s1", name: "新姓名" }] as Parameters<typeof resolveReferencedStudentNames>[0]["students"];

  it("uses the current student name when a stable id is available", () => {
    expect(resolveReferencedStudentNames({ students, studentIds: ["s1"], snapshotNames: ["旧姓名"] })).toEqual(["新姓名"]);
  });

  it("keeps the snapshot name when the referenced student no longer exists", () => {
    expect(resolveReferencedStudentNames({ students, studentId: "missing", snapshotName: "已删除学生" })).toEqual(["已删除学生"]);
  });
});
