import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateStudentAiComment } from "./aiCommentService";
import { cacheStudentCommentDraft, readStudentCommentDraft } from "./commentStorage";
import { createTestStudent } from "./testFixtures";
import { readLegacyRootState } from "./storage";
import { writeCurrentSliceData } from "./workspaces";

const draft = { generatedComment: "原评语", teacherNote: "课堂积极", style: "warm" as const, lengthMode: "custom" as const, targetWordCount: 180, updatedAt: "2026-01-01T00:00:00Z" };
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("seat-manager-product-auth-token", "test-token"); localStorage.setItem("seat-manager-product-auth-expires", String(Date.now() + 60000)); });
describe("comment candidate persistence boundary", () => {
  it("returns new and cached suggestions without overwriting saved teacher data", async () => {
    const student = createTestStudent(); student.aiComments = { profile: draft };
    writeCurrentSliceData({ students: [student] });
    const before = JSON.stringify(readLegacyRootState());
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ comment: "待确认新评语" })); vi.stubGlobal("fetch", fetchMock);
    expect((await generateStudentAiComment(student, draft)).comment).toBe("待确认新评语");
    expect((await generateStudentAiComment(student, draft)).comment).toBe("待确认新评语");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.stringify(readLegacyRootState())).toBe(before);
    expect(readStudentCommentDraft(student).generatedComment).toBe("原评语");
  });
  it("does not cache a late result after cancellation", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => { controller.abort(); return Response.json({ comment: "已过期的结果" }); }));
    await expect(generateStudentAiComment(createTestStudent(), draft, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(localStorage.getItem("seat-manager-ai-result-cache-v1")).toBeNull();
  });
  it("recovers local drafts when old saved timestamps are absent or a material save has the same timestamp", () => {
    const student = createTestStudent(); student.aiComments = { profile: { ...draft, updatedAt: "" } };
    cacheStudentCommentDraft(student.id, { ...draft, generatedComment: "未保存草稿" });
    expect(readStudentCommentDraft(student).generatedComment).toBe("未保存草稿");
    student.aiComments = { profile: draft };
    expect(readStudentCommentDraft(student).generatedComment).toBe("未保存草稿");
  });
});

describe("custom comment length request contract", () => {
  it.each([[10, 50], [49, 50], [50, 50], [300, 300], [301, 300], [999, 300]])("sends target %s as supported %s without a real model", async (input, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ comment: "合成建议" })); vi.stubGlobal("fetch", fetchMock);
    await generateStudentAiComment(createTestStudent(), { ...draft, targetWordCount: input }, { force: true });
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.targetWordCount).toBe(expected);
    expect(payload.lengthInstruction).toContain(String(expected));
  });
});
