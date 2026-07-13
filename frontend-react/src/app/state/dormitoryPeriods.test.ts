import { describe, expect, it } from "vitest";

import { calculateDormitoryPeriodScore, filterDormitoryEventsByRange, getDormitoryPeriodRange, normalizeDormitoryPeriodSettings, shiftDormitoryPeriod } from "./dormitoryPeriods";
import type { DormEvent, Dormitory, DormitoryPeriodSettings } from "./types";

const settings: DormitoryPeriodSettings = { anchorDate: "2026-01-05", unit: "week", intervalCount: 2 };

function event(id: string, date: string, score: number): DormEvent {
  return { id, dormId: "d1", type: score > 0 ? "reward" : "punish", score, reason: id, note: "", date, createdAt: `${date}T08:00:00.000Z` };
}

describe("dormitory period reporting", () => {
  it("uses Monday through Sunday for calendar weeks across years", () => {
    expect(getDormitoryPeriodRange("week", "2026-01-01", settings)).toEqual({ start: "2025-12-29", end: "2026-01-04", label: "2025-12-29 至 2026-01-04" });
    expect(shiftDormitoryPeriod("week", "2026-01-01", 1, settings)).toBe("2026-01-08");
  });

  it("handles calendar months and leap years", () => {
    expect(getDormitoryPeriodRange("month", "2028-02-20", settings)).toEqual({ start: "2028-02-01", end: "2028-02-29", label: "2028 年 2 月" });
    expect(shiftDormitoryPeriod("month", "2026-01-31", 1, settings)).toBe("2026-02-28");
  });

  it("builds repeating multi-week ranges before and after the anchor", () => {
    expect(getDormitoryPeriodRange("custom", "2026-01-18", settings)).toMatchObject({ start: "2026-01-05", end: "2026-01-18" });
    expect(getDormitoryPeriodRange("custom", "2026-01-19", settings)).toMatchObject({ start: "2026-01-19", end: "2026-02-01" });
    expect(getDormitoryPeriodRange("custom", "2026-01-04", settings)).toMatchObject({ start: "2025-12-22", end: "2026-01-04" });
  });

  it("clamps repeating month boundaries at month end", () => {
    const monthly = { anchorDate: "2026-01-31", unit: "month" as const, intervalCount: 1 };
    expect(getDormitoryPeriodRange("custom", "2026-02-28", monthly)).toMatchObject({ start: "2026-02-28", end: "2026-03-30" });
    expect(shiftDormitoryPeriod("custom", "2026-02-28", 1, monthly)).toBe("2026-03-31");
  });

  it("merges current and archived events without duplicate scores", () => {
    const duplicate = event("same", "2026-01-07", 2);
    const dormitory: Dormitory = {
      id: "d1",
      name: "301",
      memberIds: [],
      baseScore: 0,
      currentScore: 1,
      events: [duplicate, event("current", "2026-01-08", -1)],
      periodStart: "2026-01-05",
      history: [{ id: "a1", label: "旧周期", startDate: "2026-01-01", endDate: "2026-01-10", baseScore: 0, finalScore: 5, events: [duplicate, event("archived", "2026-01-09", 4)] }],
    };
    const range = { start: "2026-01-05", end: "2026-01-11", label: "test" };
    expect(filterDormitoryEventsByRange(dormitory, range)).toHaveLength(3);
    expect(calculateDormitoryPeriodScore(dormitory, range)).toBe(5);
  });

  it("normalizes invalid settings to the documented defaults", () => {
    expect(normalizeDormitoryPeriodSettings({ unit: "day", intervalCount: 99 }, "2026-07-13")).toEqual({ anchorDate: "2026-07-13", unit: "week", intervalCount: 12 });
    expect(normalizeDormitoryPeriodSettings(undefined, "2026-07-13")).toEqual({ anchorDate: "2026-07-13", unit: "week", intervalCount: 2 });
  });
});
