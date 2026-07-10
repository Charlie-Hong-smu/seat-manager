import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createEmptySeatManagerState } from "./legacyStateAdapter";
import { useSeatManagerController } from "./seatManagerController";

describe("SeatManagerController", () => {
  it("updates persistent fields through one canonical state object", () => {
    const initial = createEmptySeatManagerState();
    const { result } = renderHook(() => useSeatManagerController(initial));
    act(() => {
      result.current.setStudents(current => [...current, {
        id: "s1",
        name: "张三",
        gender: "男",
        aliases: [],
        tags: [],
        academicTags: [],
        manualTagIds: [],
        autoTagIds: [],
        records: [],
        exams: [],
      }]);
      result.current.setSeatOrder(["s1"]);
      result.current.setLockedSeats(new Set([0]));
    });
    expect(result.current.state.students[0].name).toBe("张三");
    expect(result.current.state.seatOrder).toEqual(["s1"]);
    expect(result.current.state.lockedSeats).toEqual([0]);
  });

  it("replaces and reloads the whole state without parallel field copies", () => {
    const initial = createEmptySeatManagerState();
    const { result } = renderHook(() => useSeatManagerController(initial));
    const replacement = { ...initial, settings: { density: "compact" } };
    act(() => result.current.replace(replacement));
    expect(result.current.state).toBe(replacement);
  });
});
