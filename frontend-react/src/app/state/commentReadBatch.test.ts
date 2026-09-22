import { afterEach, expect, it, vi } from "vitest";
import { readStudentCommentDraft, readStudentCommentDrafts } from "./commentStorage";
import { readStudentCommentProfile, readStudentCommentProfiles } from "./commentRubricStorage";
import { createTestStudent } from "./testFixtures";

afterEach(() => vi.restoreAllMocks());

it("reads a class of drafts with one scope lookup, preserving latest drafts and class isolation", () => {
  const students = Array.from({ length: 60 }, (_, index) => createTestStudent(`batch-${index}`));
  const createdAt = "2026-09-22T00:00:00Z";
  const book = { version: 1, currentSliceId: "a", slices: ["a", "b"].map(id => ({ id, classId: id, className: id, term: { id, year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data: { students, seatOrder: students.map(student => student.id) } })) };
  localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify(book));
  localStorage.setItem("seat-manager-ai-comment-draft:a:batch-0", JSON.stringify({ text: "班级A草稿", updatedAt: "2026-09-22" }));
  localStorage.setItem("seat-manager-ai-comment-draft:b:batch-0", JSON.stringify({ text: "班级B草稿", updatedAt: "2026-09-22" }));
  const expected = Object.fromEntries(students.map(student => [student.id, readStudentCommentDraft(student)]));
  const reads = vi.spyOn(Storage.prototype, "getItem");
  expect(readStudentCommentDrafts(students)).toEqual(expected);
  expect(reads.mock.calls.filter(([key]) => key === "seat-manager-workspaces-v1")).toHaveLength(1);
  expect(expected["batch-0"].generatedComment).toBe("班级A草稿");
  book.currentSliceId = "b";
  localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify(book));
  expect(readStudentCommentDrafts(students)["batch-0"].generatedComment).toBe("班级B草稿");
});

it("reads profiles once per batch and observes newer persisted edits on the next read", () => {
  const students = [createTestStudent("profile-a"), createTestStudent("profile-b")];
  students[0].aiComments = { profile: { teacherNote: "内存中较新", updatedAt: "2026-09-22" } };
  const createdAt = "2026-09-22T00:00:00Z";
  const persisted = students.map(student => ({ ...student, aiComments: { profile: { teacherNote: "已保存资料", updatedAt: "2026-09-21" } } }));
  const book = { version: 1, currentSliceId: "profiles", slices: [{ id: "profiles", classId: "profiles", className: "测试", term: { id: "term", year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data: { students: persisted, seatOrder: students.map(student => student.id) } }] };
  localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify(book));
  const expected = Object.fromEntries(students.map(student => [student.id, readStudentCommentProfile(student)]));
  const reads = vi.spyOn(Storage.prototype, "getItem");
  expect(readStudentCommentProfiles(students)).toEqual(expected);
  expect(reads.mock.calls.filter(([key]) => key === "seat-manager-workspaces-v1")).toHaveLength(1);
  expect(expected["profile-a"].teacherNote).toBe("内存中较新");
  persisted[0].aiComments.profile = { teacherNote: "后续保存的新资料", updatedAt: "2026-09-23" };
  localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify(book));
  expect(readStudentCommentProfiles(students)["profile-a"].teacherNote).toBe("后续保存的新资料");
});

it("keeps in-memory drafts readable when the workspace scope is unavailable", () => {
  localStorage.setItem("seat-manager-workspaces-v1", "invalid-json");
  const student = createTestStudent("offline");
  student.aiComments = { draft: { text: "未丢失的草稿", updatedAt: "2026-09-22" } };
  expect(readStudentCommentDrafts([student])[student.id]).toEqual(readStudentCommentDraft(student));
  expect(readStudentCommentDrafts([student])[student.id].generatedComment).toBe("未丢失的草稿");
});
