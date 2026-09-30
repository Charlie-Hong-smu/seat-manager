import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSeatManagerController } from "./seatManagerController";
import { createSeatManagerState } from "./legacyStateAdapter";
import { readLegacyRootState } from "./storage";
import { ensureWorkspaceBook, writeCurrentSliceData, advanceToNextTerm, switchSlice, makeTerm } from "./workspaces";
import { readCommentRubric, readStudentCommentProfile, saveCommentRubric, saveStudentCommentProfile } from "./commentRubricStorage";
import { readStudentCommentDraft, saveStudentCommentDraft } from "./commentStorage";
import { useCommentDrafts } from "../hooks/useCommentDrafts";
import { createTestStudent } from "./testFixtures";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function setup() {
  const student = createTestStudent();
  writeCurrentSliceData({ students: [student], seatOrder: [student.id] });
  const hook = renderHook(() => useSeatManagerController(createSeatManagerState(readLegacyRootState())));
  return { hook, student };
}
describe("comment saves and pending controller writes", () => {
  it.each([false, true])("does not mark a failed official save as saved (all storage blocked: %s), and can retry", allBlocked => {
    const { student } = setup();
    const hook = renderHook(() => useCommentDrafts([student], []));
    act(() => { hook.result.current.updateComment(student.id, { text: "尚待保存的新正文" }); });
    const setItem = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (allBlocked || key === "seat-manager-workspaces-v1") throw new DOMException("quota", "QuotaExceededError");
      setItem.call(this, key, value);
    });
    expect(() => { act(() => { hook.result.current.saveSelectedComment(); }); }).toThrow("comment_save_failed");
    expect(hook.result.current.unsavedComments).toHaveLength(1);
    expect(readStudentCommentProfile(createSeatManagerState(readLegacyRootState()).students[0]).generatedComment).toBe("");
    if (!allBlocked) expect(readStudentCommentDraft(student).generatedComment).toBe("尚待保存的新正文");
    spy.mockRestore();
    act(() => { hook.result.current.saveSelectedComment(); });
    expect(hook.result.current.unsavedComments).toHaveLength(0);
    expect(readStudentCommentProfile(createSeatManagerState(readLegacyRootState()).students[0]).generatedComment).toBe("尚待保存的新正文");
  });
  it("reports failed rubric writes instead of accepting an unsaved configuration", () => {
    setup(); const before = readCommentRubric();
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function(this: Storage, key, value) {
      if (key === "seat-manager-workspaces-v1") throw new DOMException("quota", "QuotaExceededError");
      original.call(this, key, value);
    });
    expect(() => saveCommentRubric({ ...before, criteria: before.criteria.map(item => ({ ...item, label: "未保存修改" })) })).toThrow("comment_save_failed");
    expect(readCommentRubric()).toEqual(before);
  });
  it("leaves corrupt storage untouched so the recovery screen can mount", () => {
    localStorage.setItem("seat-manager-workspaces-v1", "{broken");
    const hook = renderHook(() => useSeatManagerController(createSeatManagerState(null)));
    expect(hook.result.current.persist()).toBe(false);
    expect(localStorage.getItem("seat-manager-workspaces-v1")).toBe("{broken");
  });
  it("retains explicit comment saves across immediate flush, later seating edits and reload without losing pending fields", () => {
    const { hook, student } = setup(); const oldPersist = hook.result.current.persist;
    act(() => {
      hook.result.current.setStudents(students => students.map(item => ({ ...item, address: "尚在防抖中的档案编辑" })));
      const profile = readStudentCommentProfile(student);
      saveStudentCommentProfile(student.id, readCommentRubric(), { ...profile, criteriaValues: { study_attitude: ["serious"] } });
      saveStudentCommentDraft(student.id, { generatedComment: "老师确认的评语", teacherNote: "", style: "warm", lengthMode: "custom", targetWordCount: 230, updatedAt: new Date().toISOString() });
      expect(oldPersist()).toBe(true);
    });
    act(() => { hook.result.current.setSeatOrder(order => [...order].reverse()); hook.result.current.persist(); hook.result.current.reload(); });
    const saved = hook.result.current.state.students[0];
    expect(saved.address).toBe("尚在防抖中的档案编辑");
    expect(readStudentCommentProfile(saved)).toMatchObject({ generatedComment: "老师确认的评语", criteriaValues: { study_attitude: ["serious"] }, targetWordCount: 230 });
    expect(saved.manualTagIds).toContain("comment_attitude_serious");
  });
  it("ignores another workspace's writes and resumes after the controller loads that workspace", () => {
    const { hook, student } = setup(); const old = ensureWorkspaceBook().currentSliceId;
    const next = advanceToNextTerm({ fromSliceId: old, term: makeTerm({ year: 2027, season: "spring" }), copyRoster: true })!;
    switchSlice(next.id);
    const draft = { generatedComment: "新学期确认评语", teacherNote: "", style: "warm" as const, lengthMode: "standard" as const, targetWordCount: 120, updatedAt: new Date().toISOString() };
    act(() => { saveStudentCommentDraft(student.id, draft); });
    expect(hook.result.current.persist()).toBe(false);
    act(() => { hook.result.current.reload(); saveStudentCommentDraft(student.id, { ...draft, generatedComment: "新学期再次保存" }); hook.result.current.persist(); });
    expect(readStudentCommentProfile(hook.result.current.state.students[0]).generatedComment).toBe("新学期再次保存");
    switchSlice(old);
    const original = createSeatManagerState(readLegacyRootState());
    expect(readStudentCommentProfile(original.students[0]).generatedComment).toBe("");
  });
});
