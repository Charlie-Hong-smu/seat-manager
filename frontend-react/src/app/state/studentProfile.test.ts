import { describe, expect, it } from "vitest";
import { updateStudentProfile } from "./studentActions";
import { createTestStudent } from "./testFixtures";

const input = { name: "张三", gender: "男" as const, aliases: [], manualTagIds: [] as string[] };
describe("student profile tag projection", () => {
  it("removes the last behavior label immediately", () => {
    const student = { ...createTestStudent(), manualTagIds: ["talkative"], tags: ["爱讲话"] };
    expect(updateStudentProfile(student, input).tags).toEqual([]);
  });
  it("includes manual academic labels and removes them when unselected", () => {
    const student = { ...createTestStudent(), manualTagIds: ["math_strong"], academicTags: ["数学强"] };
    expect(updateStudentProfile(student, { ...input, manualTagIds: ["en_strong"] }).academicTags).toEqual(["英语强"]);
    expect(updateStudentProfile(student, input).academicTags).toEqual([]);
  });
  it("retains automatic tags and label-only legacy categories", () => {
    const auto = { ...createTestStudent(), autoTagIds: ["math_strong"], manualTagIds: ["talkative"], tags: ["爱讲话"], academicTags: ["数学强"] };
    expect(updateStudentProfile(auto, input)).toMatchObject({ tags: [], academicTags: ["数学强"] });
    const legacy = { ...createTestStudent(), tags: ["旧行为"], academicTags: ["数学强"] };
    expect(updateStudentProfile(legacy, input)).toMatchObject({ tags: ["旧行为"], academicTags: ["数学强"] });
  });
});
