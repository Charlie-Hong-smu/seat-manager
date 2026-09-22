import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readWorkspaceDraft, useWorkspaceDraftState } from "./useWorkspaceDraftState";

const workspace = vi.hoisted(() => ({ scope: "class-a" }));
vi.mock("../state/workspaces", () => ({ getCurrentWorkspaceScope: () => workspace.scope }));
let sequence = 0;
let name: string;
beforeEach(() => { workspace.scope = "class-a"; name = `draft-regression-${++sequence}`; });
const key = () => `seat-manager-form-draft-v1:${workspace.scope}:${name}`;

describe("workspace draft recovery", () => {
  it("keeps the latest edit after a failed write and remount", () => {
    localStorage.setItem(key(), JSON.stringify("old"));
    const first = renderHook(() => useWorkspaceDraftState(name, ""));
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    act(() => first.result.current[1]("latest"));
    first.unmount();
    write.mockRestore();
    const second = renderHook(() => useWorkspaceDraftState(name, ""));
    expect(second.result.current[0]).toBe("latest");
    act(() => second.result.current[1](value => `${value} saved`));
    expect(JSON.parse(localStorage.getItem(key())!)).toBe("latest saved");
  });

  it("does not resurrect a cleared draft when removal fails", () => {
    localStorage.setItem(key(), JSON.stringify("already submitted"));
    const first = renderHook(() => useWorkspaceDraftState(name, "empty"));
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
    act(() => first.result.current[2]());
    expect(first.result.current[0]).toBe("empty");
    first.unmount();
    remove.mockRestore();
    expect(readWorkspaceDraft(name, "empty")).toBe("empty");
  });

  it("ignores setters and clear callbacks retained from another workspace", () => {
    const hook = renderHook(() => useWorkspaceDraftState(name, ""));
    act(() => hook.result.current[1]("class A"));
    const oldSet = hook.result.current[1];
    const oldClear = hook.result.current[2];
    workspace.scope = "class-b";
    hook.rerender();
    act(() => hook.result.current[1]("class B"));
    act(() => { oldSet(value => `${value} stale`); oldClear(); });
    expect(hook.result.current[0]).toBe("class B");
    workspace.scope = "class-a";
    hook.rerender();
    expect(hook.result.current[0]).toBe("class A");
  });

  it("applies a same-event functional update to the cleared value", () => {
    const hook = renderHook(() => useWorkspaceDraftState(name, "initial"));
    act(() => hook.result.current[1]("old draft"));
    act(() => { hook.result.current[2](); hook.result.current[1](value => `${value} next`); });
    expect(hook.result.current[0]).toBe("initial next");
  });

  it("rejects null object drafts and malformed JSON", () => {
    const fallback = { title: "safe", description: "" };
    localStorage.setItem(key(), "null");
    expect(readWorkspaceDraft(name, fallback)).toEqual(fallback);
    localStorage.setItem(key(), "{broken");
    expect(readWorkspaceDraft(name, fallback)).toEqual(fallback);
  });

  it("uses normal persistent writes and keeps objects separate by form identity", () => {
    const hook = renderHook(({ form }) => useWorkspaceDraftState(form, { title: "" }), { initialProps: { form: name } });
    act(() => hook.result.current[1]({ title: "saved draft" }));
    expect(JSON.parse(localStorage.getItem(key())!)).toEqual({ title: "saved draft" });
    hook.rerender({ form: `${name}-other` });
    expect(hook.result.current[0]).toEqual({ title: "" });
    hook.rerender({ form: name });
    expect(hook.result.current[0]).toEqual({ title: "saved draft" });
    act(() => hook.result.current[2]());
    expect(localStorage.getItem(key())).toBeNull();
  });
});
