import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useRegistrationUndo } from "./useRegistrationUndo";

type Entry = { status: string; note?: string; leaveStart?: string };
type Entries = Record<string, Entry | undefined>;
function setup(initial: Entries = {}) {
  return renderHook(({ scope }) => {
    const [entries, setEntries] = useState(initial);
    const history = useRegistrationUndo({ scope, entries, onRestore: values => setEntries(current => ({ ...current, ...values })) });
    return { ...history, entries, setEntries, change(next: Entries, action?: string, activity?: () => void) { const undo = history.record(next, action, activity); setEntries(next); return undo; } };
  }, { initialProps: { scope: "test-a" } });
}

describe("registration undo", () => {
  it("restores the exact prior cell, preserving other students and undoing only its own activity", () => {
    const before = { status: "leave", note: "就医", leaveStart: "2026-09-22T08:00" };
    const hook = setup({ a: before }); const activityA = vi.fn(); const activityB = vi.fn();
    act(() => { hook.result.current.change({ a: { status: "normal", note: "就医" } }, "normal", activityA); });
    act(() => { hook.result.current.change({ ...hook.result.current.entries, b: { status: "absent" } }, "absent", activityB); });
    act(() => { expect(hook.result.current.tryRevert("a", "normal")).toBe(true); });
    expect(hook.result.current.entries).toEqual({ a: before, b: { status: "absent" } });
    expect(activityA).toHaveBeenCalledOnce(); expect(activityB).not.toHaveBeenCalled();
    act(() => { hook.result.current.undoLast(); });
    expect(hook.result.current.entries.b).toBeUndefined(); expect(activityB).toHaveBeenCalledOnce();
  });
  it("allows repeat clicks only before the six-second deadline, while keeping explicit Undo", () => {
    let now = 1000; vi.spyOn(Date, "now").mockImplementation(() => now);
    const hook = setup();
    act(() => { hook.result.current.change({ a: { status: "leave" } }, "leave"); });
    now = 6999;
    act(() => { expect(hook.result.current.tryRevert("a", "leave")).toBe(true); });
    act(() => { hook.result.current.change({ a: { status: "leave" } }, "leave"); });
    now = 12999;
    act(() => { expect(hook.result.current.tryRevert("a", "leave")).toBe(false); });
    act(() => { expect(hook.result.current.undoLast()).toBe(true); });
    expect(hook.result.current.entries.a).toBeUndefined();
  });
  it("treats another chosen status as a new action and prevents repeated or stale undo", () => {
    const hook = setup(); let firstUndo: (() => boolean) | undefined;
    act(() => { firstUndo = hook.result.current.change({ a: { status: "leave" } }, "leave"); });
    act(() => { expect(hook.result.current.tryRevert("a", "absent")).toBe(false); hook.result.current.change({ a: { status: "absent" } }, "absent"); });
    act(() => { expect(firstUndo?.()).toBe(false); expect(hook.result.current.tryRevert("a", "absent")).toBe(true); });
    expect(hook.result.current.entries.a?.status).toBe("leave");
    act(() => { expect(firstUndo?.()).toBe(false); expect(hook.result.current.tryRevert("a", "absent")).toBe(false); });
  });
  it("does not overwrite a subsequent note edit or restore across date/workspace changes", () => {
    const hook = setup(); let undo: (() => boolean) | undefined;
    act(() => { undo = hook.result.current.change({ a: { status: "leave" } }, "leave"); });
    act(() => { hook.result.current.setEntries({ a: { status: "leave", note: "新说明" } }); });
    act(() => { expect(undo?.()).toBe(false); });
    act(() => { hook.result.current.change({ a: { status: "absent" } }, "absent"); });
    const oldUndo = hook.result.current.undoLast;
    hook.rerender({ scope: "test-b" });
    act(() => { expect(oldUndo()).toBe(false); expect(hook.result.current.tryRevert("a", "absent")).toBe(false); });
    hook.rerender({ scope: "test-a" });
    act(() => { expect(oldUndo()).toBe(false); expect(hook.result.current.tryRevert("a", "absent")).toBe(false); });
  });
  it("restores a batch atomically and leaves later unrelated changes intact", () => {
    const hook = setup({ a: { status: "leave" }, b: { status: "absent" } }); let undo: (() => boolean) | undefined;
    act(() => { undo = hook.result.current.change({}, undefined); });
    act(() => { hook.result.current.change({ c: { status: "late" } }, "late"); });
    act(() => { expect(undo?.()).toBe(true); });
    expect(hook.result.current.entries).toEqual({ a: { status: "leave" }, b: { status: "absent" }, c: { status: "late" } });
  });
});
