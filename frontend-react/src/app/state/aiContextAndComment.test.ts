import { describe, expect, it } from "vitest";

import { buildStudentAiContext, compactStudentContextForToken } from "./aiStudentContext";
import { localizeTrendText, restoreStudentDisplayName } from "./aiTrendService";
import { normalizeStudentCommentDraft, readStudentCommentDraft, saveStudentCommentDraft } from "./commentStorage";
import { createTestStudent } from "./testFixtures";

describe("AI student context and comment cache", () => {
  it("converts internal trend field names into teacher-facing Chinese", () => {
    const localized = localizeTrendText("totalScore: -51,classRank: 29,subjects: 物理: -35; 英语: -27.5; 语文: 16");
    expect(localized).toBe("总分下降51分；班级排名退步29名；各科变化：物理下降35分、英语下降27.5分、语文上升16分。");
    expect(localized).not.toMatch(/totalScore|classRank|subjects/);
  });

  it("restores the real student name only in the local display result", () => {
    expect(restoreStudentDisplayName("学生A本学期总分上升，建议继续关注学生 A。", "林梓晴"))
      .toBe("林梓晴本学期总分上升，建议继续关注林梓晴。");
  });

  it("builds chronological context and keeps first/latest details when compacting", () => {
    const student = createTestStudent();
    student.exams = Array.from({ length: 10 }, (_, index) => ({
      id: `e${index}`,
      name: `考试${index}`,
      date: `2026-${String(index + 1).padStart(2, "0")}-01`,
      scores: { 语文: 70 + index, 数学: 80 + index },
      total: 150 + index * 2,
      rank: String(20 - index),
    }));
    const context = buildStudentAiContext({ student });
    expect(context.trend.examCount).toBe(10);
    expect(context.trend.totalScoreChange).toBe(18);
    const compact = compactStudentContextForToken(context, 4);
    expect(compact.exams[0].subjects.length).toBeGreaterThan(0);
    expect(compact.exams[compact.exams.length - 1]?.subjects.length).toBeGreaterThan(0);
    expect(compact.exams.filter(exam => exam.subjects.length > 0).length).toBeLessThanOrEqual(4);
  });

  it("normalizes, saves and reuses the newest comment draft", () => {
    const student = createTestStudent();
    const normalized = normalizeStudentCommentDraft({ text: " 评语 ", style: "invalid", targetWordCount: 999 });
    expect(normalized).toMatchObject({ generatedComment: "评语", style: "warm", targetWordCount: 300 });
    const saved = saveStudentCommentDraft(student.id, {
      generatedComment: "很好",
      teacherNote: "继续努力",
      style: "warm",
      lengthMode: "standard",
      targetWordCount: 120,
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(readStudentCommentDraft(student)).toEqual(saved);
    expect(normalizeStudentCommentDraft(null)).toBeNull();
    window.localStorage.setItem("seat-manager-ai-comment-draft:s1", "not-json");
    expect(readStudentCommentDraft(student).generatedComment).toBe("很好");
  });
});
