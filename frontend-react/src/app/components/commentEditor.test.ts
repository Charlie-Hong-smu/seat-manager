import { describe, expect, it } from "vitest";

import type { CommentCriterion, CommentRubric, StudentCommentProfile } from "../state/types";
import {
  addCommentCustomOption,
  buildStudentCommentDraft,
  clampCommentWordCount,
  removeCommentCustomOption,
  resolveCommentWordCount,
  toggleCommentCriterion,
} from "./commentEditor";

const criterion: CommentCriterion = {
  id: "attitude",
  label: "学习态度",
  type: "single",
  syncToTags: false,
  hidden: false,
  builtIn: true,
  options: [
    { id: "active", label: "积极", linkedTagId: "", builtIn: true },
    { id: "steady", label: "踏实", linkedTagId: "", builtIn: true },
  ],
};

const profile: StudentCommentProfile = {
  criteriaValues: {}, customOptions: {}, teacherNote: "课堂表现稳定", style: "warm",
  lengthMode: "custom", targetWordCount: 360, generatedComment: "", status: "draft", updatedAt: "",
};

describe("shared comment editor logic", () => {
  it("uses the same word count rules for both comment entry points", () => {
    expect(resolveCommentWordCount("short", 500)).toBe(90);
    expect(resolveCommentWordCount("standard", 500)).toBe(125);
    expect(resolveCommentWordCount("long", 500)).toBe(175);
    expect(resolveCommentWordCount("custom", 360)).toBe(360);
    expect(clampCommentWordCount(1)).toBe(10);
    expect(clampCommentWordCount(1200)).toBe(999);
  });

  it("honors single-select criteria and manages custom material", () => {
    const active = toggleCommentCriterion(profile, criterion, "active");
    const steady = toggleCommentCriterion(active, criterion, "steady");
    expect(steady.criteriaValues.attitude).toEqual(["steady"]);
    const withCustom = addCommentCustomOption(steady, criterion, "主动订正");
    expect(withCustom.customOptions.attitude?.[0]?.label).toBe("主动订正");
    const duplicate = addCommentCustomOption(withCustom, criterion, "主动订正");
    expect(duplicate.customOptions.attitude).toHaveLength(1);
    expect(removeCommentCustomOption(duplicate, criterion.id, duplicate.customOptions.attitude[0].id).customOptions.attitude).toEqual([]);
  });

  it("builds a request draft from the shared profile summary", () => {
    const rubric: CommentRubric = { version: 1, criteria: [criterion] };
    const selected = toggleCommentCriterion(profile, criterion, "active");
    const draft = buildStudentCommentDraft(rubric, selected, "评语草稿");
    expect(draft).toMatchObject({ generatedComment: "评语草稿", targetWordCount: 360, teacherNote: "课堂表现稳定" });
    expect(draft.criteriaSummary?.[0]?.values).toEqual(["积极"]);
  });
});
