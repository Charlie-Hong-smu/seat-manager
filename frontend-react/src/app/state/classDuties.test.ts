import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { archiveStudent, permanentlyDeleteStudent, restoreStudent } from "./classManagementCommands";
import { classDutyNameError, getDutyGroups, readClassDuties, reconcileClassDuties, resetClassDutiesForNewTerm, setStudentClassDuties } from "./classDuties";
import { createSeatManagerState } from "./legacyStateAdapter";
import { buildLegacySnapshot } from "./legacyWriteAdapter";
import { createDefaultSeatLayout } from "./seatLayout";
import { useSeatManagerController } from "./seatManagerController";
import { advanceToNextTerm, ensureWorkspaceBook, makeTerm, writeCurrentSliceData } from "./workspaces";

function fixture() {
  const state = createSeatManagerState({ students: ["s1", "s2", "s3"].map(id => ({ id, name: id, dormitoryId: id === "s3" ? "d2" : "d1" })), seatOrder: ["s1", "s2", "s3"], dormitories: [{ id: "d1", name: "101", memberIds: ["s1", "s2"] }, { id: "d2", name: "102", memberIds: ["s3"] }] });
  const value = readClassDuties(state);
  const group = getDutyGroups(state).find(item => item.memberIds.includes("s1"))!;
  state.settings = { unrelated: "preserved", classDuties: { ...value, assignments: { "class-duty-0": ["s1", "s2"], "subject-duty-语文": ["s1"] }, groupLeaders: { [group.id]: "s1" }, dormitoryLeaders: { d1: "s1", d2: "s3" } } };
  return state;
}

describe("class duties", () => {
  it("uses subject-aware defaults without reviving an intentionally empty catalog", () => {
    const state = fixture();
    state.settings = { subjectCatalog: ["语文", "日语"] };
    expect(readClassDuties(state).roles.filter(role => role.category === "subject").map(role => role.name)).toEqual(["语文课代表", "日语课代表"]);
    state.settings.classDuties = { roles: [], assignments: { orphan: ["s1"] } };
    expect(readClassDuties(state).roles).toEqual([]);
    expect(readClassDuties(state).assignments).toEqual({});
  });
  it("allows multiple appointments and multiple holders without removing other students", () => {
    const value = setStudentClassDuties(readClassDuties(fixture()), "s1", ["subject-duty-数学", "class-duty-1"]);
    expect(value.assignments["class-duty-0"]).toEqual(["s2"]);
    expect(value.assignments["subject-duty-语文"]).toEqual([]);
    expect(value.assignments["subject-duty-数学"]).toEqual(["s1"]);
    expect(value.assignments["class-duty-1"]).toEqual(["s1"]);
  });
  it("round trips appointments through the existing backup snapshot and legacy import", () => {
    const state = fixture();
    const raw = buildLegacySnapshot(state);
    const restored = createSeatManagerState(JSON.parse(JSON.stringify(raw)));
    expect(readClassDuties(restored)).toEqual(readClassDuties(state));
    expect(restored.settings.unrelated).toBe("preserved");
  });
  it("cleans malformed catalogs, missing students and non-member leaders", () => {
    const state = fixture();
    state.settings.classDuties = { roles: [null, { id: "r", name: " 班长 ", category: "bad" }, { id: "r", name: "重复编号" }, { id: "x", name: "班长" }], assignments: { r: ["s1", "missing", "s1", null], orphan: ["s2"] }, dormitoryLeaders: { d1: "s3", missing: "s1" }, groupLeaders: { missing: "s1" } };
    expect(readClassDuties(state)).toEqual({ version: 1, roles: [{ id: "r", name: "班长", category: "class" }], assignments: { r: ["s1"] }, dormitoryLeaders: {}, groupLeaders: {} });
    expect(classDutyNameError(" 班长 ", readClassDuties(state).roles)).toBe("已有同名职务");
  });
  it("releases archived and permanently deleted students and does not silently reappoint on restore", () => {
    const initial = fixture();
    const archived = reconcileClassDuties(archiveStudent(initial, "s1"));
    const restored = reconcileClassDuties(restoreStudent(archived, "s1"));
    expect(readClassDuties(restored).assignments["class-duty-0"]).toEqual(["s2"]);
    expect(readClassDuties(restored).dormitoryLeaders).toEqual({ d2: "s3" });
    expect(readClassDuties(restored).groupLeaders).toEqual({});
    const deleted = reconcileClassDuties(permanentlyDeleteStudent(initial, "s1"));
    expect(readClassDuties(deleted)).toEqual(readClassDuties(archived));
  });
  it("reconciles every controller mutation and never revives a leader moved out of the group", () => {
    const { result } = renderHook(() => useSeatManagerController(fixture()));
    act(() => result.current.setDormitories(dorms => dorms.map(dorm => ({ ...dorm, memberIds: dorm.memberIds.filter(id => id !== "s1") }))));
    expect(readClassDuties(result.current.state).dormitoryLeaders.d1).toBeUndefined();
    const order = [...result.current.state.seatOrder];
    act(() => result.current.setSeatOrder(order.map(id => id === "s1" ? null : id)));
    act(() => result.current.setSeatOrder(order));
    expect(readClassDuties(result.current.state).groupLeaders).toEqual({});
    expect(readClassDuties(result.current.state).assignments["class-duty-0"]).toEqual(["s1", "s2"]);
  });
  it("preserves group appointments when stable seats are reordered atomically", () => {
    const state = fixture();
    state.seatSettings.layout = createDefaultSeatLayout(state.seatOrder.length);
    const { result } = renderHook(() => useSeatManagerController(state));
    act(() => result.current.replace(current => ({ ...current, seatOrder: [...current.seatOrder].reverse(), seatSettings: { ...current.seatSettings, layout: { ...current.seatSettings.layout!, seats: [...current.seatSettings.layout!.seats].reverse() } } })));
    expect(readClassDuties(result.current.state).groupLeaders).toEqual(readClassDuties(state).groupLeaders);
  });
  it("keeps the old term appointments isolated when creating the next workspace slice", () => {
    const book = ensureWorkspaceBook();
    const state = fixture();
    const raw = buildLegacySnapshot(state);
    writeCurrentSliceData(raw);
    const next = advanceToNextTerm({ fromSliceId: book.currentSliceId, term: makeTerm({ year: 2027, season: "spring" }), copyRoster: true });
    expect(readClassDuties(createSeatManagerState(next?.data)).assignments).toEqual({});
    const old = ensureWorkspaceBook().slices.find(slice => slice.id === book.currentSliceId);
    expect(readClassDuties(createSeatManagerState(old?.data)).assignments["class-duty-0"]).toEqual(["s1", "s2"]);
  });
  it("copies custom role names but resets all appointments in a new term without touching the old one", () => {
    const state = fixture();
    const before = JSON.stringify(state.settings);
    const settings = resetClassDutiesForNewTerm(state.settings);
    expect(settings.unrelated).toBe("preserved");
    expect(settings.classDuties).toEqual({ ...readClassDuties(state), assignments: {}, groupLeaders: {}, dormitoryLeaders: {} });
    expect(JSON.stringify(state.settings)).toBe(before);
  });
});
