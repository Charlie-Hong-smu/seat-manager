import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createTestStudent } from "../state/testFixtures";
import { BEHAVIOR_TAG_IDS } from "../state/tagCatalog";
import { useStudentProfileEditor } from "./useStudentProfileEditor";

it("commits only on save, normalizes aliases and preserves unrelated manual tags", () => {
  const student = { ...createTestStudent(), manualTagIds: ["unrelated-tag"] };
  const onUpdate = vi.fn();
  const hook = renderHook(() => useStudentProfileEditor(student, onUpdate, "profile"));
  act(() => { hook.result.current.setProfileEditing(true); hook.result.current.setNameInput("  修改姓名  "); hook.result.current.setAliasesInput("小名、别名、小名"); hook.result.current.toggleBehaviorTag([...BEHAVIOR_TAG_IDS][0]); });
  expect(hook.result.current.profileDirty).toBe(true);
  expect(onUpdate).not.toHaveBeenCalled();
  act(() => hook.result.current.saveProfile());
  expect(onUpdate).toHaveBeenCalledOnce();
  expect(onUpdate.mock.calls[0][0]).toMatchObject({ id: student.id, name: "修改姓名", aliases: ["小名", "别名"] });
  expect(onUpdate.mock.calls[0][0].manualTagIds).toContain("unrelated-tag");
  expect(hook.result.current.profileEditing).toBe(false);
});

it("cancel and student changes reset the entire profile edit session", () => {
  const first = createTestStudent("a", "甲");
  const second = { ...createTestStudent("b", "乙"), parentPhone: "123", address: "乙地址" };
  const onUpdate = vi.fn();
  const hook = renderHook(({ student }) => useStudentProfileEditor(student, onUpdate, "profile"), { initialProps: { student: first } });
  act(() => { hook.result.current.setProfileEditing(true); hook.result.current.setParentPhoneInput("未保存"); hook.result.current.setIsBoardingInput(true); });
  act(() => hook.result.current.cancelProfileEditing());
  expect(hook.result.current.parentPhoneInput).toBe("");
  expect(hook.result.current.isBoardingInput).toBe(false);
  expect(hook.result.current.profileDirty).toBe(false);
  act(() => { hook.result.current.setProfileEditing(true); hook.result.current.setNameInput("甲草稿"); });
  hook.rerender({ student: second });
  expect(hook.result.current.nameInput).toBe("乙");
  expect(hook.result.current.parentPhoneInput).toBe("123");
  expect(hook.result.current.addressInput).toBe("乙地址");
  expect(hook.result.current.profileEditing).toBe(false);
  expect(onUpdate).not.toHaveBeenCalled();
});

it("keeps the editor open for an invalid name or a failed save", () => {
  const student = createTestStudent();
  const onUpdate = vi.fn(() => { throw new Error("save failed"); });
  const hook = renderHook(() => useStudentProfileEditor(student, onUpdate, "profile"));
  act(() => { hook.result.current.setProfileEditing(true); hook.result.current.setNameInput(" "); });
  act(() => hook.result.current.saveProfile());
  expect(hook.result.current.profileStatus).toBe("姓名不能为空。");
  expect(onUpdate).not.toHaveBeenCalled();
  act(() => hook.result.current.setNameInput("有效姓名"));
  expect(() => hook.result.current.saveProfile()).toThrow("save failed");
  expect(hook.result.current.profileEditing).toBe(true);
  expect(hook.result.current.nameInput).toBe("有效姓名");
});
