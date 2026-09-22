import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useScopedRequest } from "./useScopedRequest";

describe("scoped asynchronous work", () => {
  it("invalidates replaced requests, student/workspace switches, and unmounts even when an API ignores abort", () => {
    const hook = renderHook(({ scope }) => useScopedRequest(scope), { initialProps: { scope: "class-a:student-a" } });
    const first = hook.result.current.start();
    const second = hook.result.current.start();
    expect(first.signal.aborted).toBe(true); expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    hook.rerender({ scope: "class-a:student-b" });
    expect(second.signal.aborted).toBe(true); expect(second.isCurrent()).toBe(false);
    const third = hook.result.current.start();
    hook.rerender({ scope: "class-b:student-b" });
    expect(third.isCurrent()).toBe(false);
    const fourth = hook.result.current.start();
    hook.unmount();
    expect(fourth.signal.aborted).toBe(true); expect(fourth.isCurrent()).toBe(false);
  });
  it("cancels on dismissal and lets a fresh request start", () => {
    const hook = renderHook(() => useScopedRequest("selection"));
    const old = hook.result.current.start();
    act(() => hook.result.current.cancel());
    expect(old.isCurrent()).toBe(false);
    expect(hook.result.current.start().isCurrent()).toBe(true);
  });
});
