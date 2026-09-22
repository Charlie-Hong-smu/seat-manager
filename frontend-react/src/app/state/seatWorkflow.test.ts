import { describe, expect, it } from "vitest";
import { createSeatManagerState } from "./legacyStateAdapter";
import { buildLegacySnapshot } from "./legacyWriteAdapter";
import { createDefaultSeatLayout } from "./seatLayout";
import { buildSeatOrderByStudentList, swapSeatOrder } from "./seatActions";
import { captureSeatChange, restoreSeatChange, restoreSeatSnapshot } from "./seatWorkflow";
import { getDutyGroups, readClassDuties, reconcileClassDuties } from "./classDuties";
import type { SeatHistorySnapshot } from "./types";

const fixture = () => createSeatManagerState({ students: [{ id: "a", name: "同名" }, { id: "b", name: "同名" }, { id: "c", name: "张三" }], seatOrder: ["c", "b", "a", null, null, null, null, null] });
const snapshot = (patch: Partial<SeatHistorySnapshot> = {}): SeatHistorySnapshot => ({ id: "old", time: "2026-09-22", note: "", rows: 1, seats: ["同名", "同名", "张三", "", "", "", "", ""], ...patch });

describe("seating workflow integrity", () => {
  it("orders the roster around locked occupants and locked empty seats", () => {
    const state = fixture();
    expect(buildSeatOrderByStudentList(state.students, undefined, state.seatOrder, new Set([0, 3]))).toEqual(["c", "a", "b", null, null, null, null, null]);
    expect(swapSeatOrder(state.seatOrder, -1, 1, new Set())).toBe(state.seatOrder);
    expect(swapSeatOrder(state.seatOrder, 0, 8, new Set())).toBe(state.seatOrder);
  });
  it("restores IDs despite renamed and duplicate names, without matching deleted IDs to namesakes", () => {
    const state = fixture(); state.students[0].name = "改名";
    const saved = snapshot({ studentIds: ["b", "a", "gone", null, null, null, null, null], lockedSeats: [1] });
    const restored = restoreSeatSnapshot(state, saved);
    expect(restored.state.seatOrder).toEqual(["b", "a", null, null, null, null, null, null]);
    expect(restored.unresolved).toBe(1);
    expect(restored.state.lockedSeats).toEqual([1]);
  });
  it("keeps ambiguous legacy names empty and restores the default layout", () => {
    const state = fixture(); state.seatSettings.layout = createDefaultSeatLayout(8);
    const result = restoreSeatSnapshot(state, snapshot());
    expect(result.state.seatOrder.slice(0, 3)).toEqual([null, null, "c"]);
    expect(result.unresolved).toBe(2);
    expect(result.state.seatSettings.layout).toBeUndefined();
  });
  it("round trips optional snapshot IDs and locks through backup while reading legacy snapshots", () => {
    const state = fixture(); state.seatHistory = [snapshot({ studentIds: ["b", "a", "c"], lockedSeats: [1, 1, 99] }), snapshot({ id: "legacy" })];
    const restored = createSeatManagerState(JSON.parse(JSON.stringify(buildLegacySnapshot(state))));
    expect(restored.seatHistory[0].studentIds).toEqual(["b", "a", "c", null, null, null, null, null]);
    expect(restored.seatHistory[0].lockedSeats).toEqual([1]);
    expect(restored.seatHistory[1].studentIds).toBeUndefined();
  });
  it("undoes layout, order and removed locks together, retaining subsequent lock edits and unrelated data", () => {
    const before = fixture(); const layout = createDefaultSeatLayout(8);
    before.lockedSeats = [1, 7];
    const after = { ...before, seatOrder: ["b", "c"], lockedSeats: [0], seatSettings: { ...before.seatSettings, layout: { ...layout, seats: [layout.seats[1], layout.seats[0]] } } };
    const current = { ...after, lockedSeats: [0, 1], settings: { ...after.settings, marker: "later edit" } };
    const result = restoreSeatChange(current, captureSeatChange(before, after));
    expect(result.seatOrder).toEqual(before.seatOrder);
    expect(result.seatSettings.layout).toBeUndefined();
    expect(new Set(result.lockedSeats)).toEqual(new Set([0, 1, 7]));
    expect(result.settings.marker).toBe("later edit");
  });
  it("restores a displaced group leader but never resurrects archived students or replaces a new appointment", () => {
    const before = fixture(); const group = getDutyGroups(before).find(item => item.memberIds.includes("c"))!;
    before.settings.classDuties = { ...readClassDuties(before), groupLeaders: { [group.id]: "c" } };
    const after = reconcileClassDuties({ ...before, seatOrder: before.seatOrder.map(id => id === "c" ? null : id) });
    const entry = captureSeatChange(before, after);
    expect(readClassDuties(restoreSeatChange(after, entry)).groupLeaders[group.id]).toBe("c");
    const archived = { ...after, students: after.students.map(student => student.id === "c" ? { ...student, enrollmentStatus: "archived" as const } : student) };
    expect(restoreSeatChange(archived, entry).seatOrder).not.toContain("c");
    const current = { ...after, settings: { ...after.settings, classDuties: { ...readClassDuties(after), groupLeaders: { [group.id]: "b" } } } };
    expect(readClassDuties(restoreSeatChange(current, entry)).groupLeaders[group.id]).toBe("b");
  });
});
