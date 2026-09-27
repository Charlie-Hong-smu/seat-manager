import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBlendedColors } from "./useBlendedColors";

afterEach(() => vi.useRealTimers());

describe("useBlendedColors", () => {
  it("blends a colour change within the same structure and settles on the target", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
    const { result, rerender } = renderHook(({ colors, key }) => useBlendedColors(colors, key, false), { initialProps: { colors: ["red", "blue"], key: "a" } });
    rerender({ colors: ["green", "blue"], key: "a" });
    expect(result.current[0]).toMatch(/^color-mix\(in oklch, green \d+%, red\)$/);
    expect(result.current[1]).toBe("blue");
    act(() => { vi.advanceTimersByTime(400); });
    expect(result.current).toEqual(["green", "blue"]);
  });

  it("clamps a negative rAF timestamp offset instead of extrapolating the mix", () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "performance"] });
    const { result, rerender } = renderHook(({ colors, key }) => useBlendedColors(colors, key, false), { initialProps: { colors: ["red", "blue"], key: "a" } });
    rerender({ colors: ["green", "blue"], key: "a" });
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current[0]).toMatch(/^color-mix\(in oklch, green (0|[1-9]\d{0,2})%, red\)$/);
  });

  it("switches immediately when the structure changes or motion is reduced", () => {
    const { result, rerender } = renderHook(({ colors, key, reduced }) => useBlendedColors(colors, key, reduced), { initialProps: { colors: ["red"], key: "a", reduced: false } });
    rerender({ colors: ["green", "blue"], key: "b", reduced: false });
    expect(result.current).toEqual(["green", "blue"]);
    rerender({ colors: ["red", "blue"], key: "b", reduced: true });
    expect(result.current).toEqual(["red", "blue"]);
  });
});
