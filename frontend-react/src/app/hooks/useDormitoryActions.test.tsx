import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createEmptySeatManagerState, createSeatManagerState } from "../state/legacyStateAdapter";
import { useSeatManagerController } from "../state/seatManagerController";
import { createTestStudent } from "../state/testFixtures";
import type { Dormitory } from "../state/types";
import { useDormitoryActions } from "./useDormitoryActions";

function dormitory(id: string, name: string, memberIds: string[]): Dormitory {
  return {
    id,
    name,
    memberIds,
    baseScore: 0,
    currentScore: 0,
    events: [],
    periodStart: "2026-07-01",
    history: [],
  };
}

describe("useDormitoryActions", () => {
  function setup() {
    return renderHook(() => {
      const controller = useSeatManagerController({ ...createEmptySeatManagerState(), students: [createTestStudent("s1", "甲")], dormitories: [dormitory("d1", "101", ["s1"])] });
      const actions = useDormitoryActions({ students: controller.state.students, dormitories: controller.state.dormitories, setStudents: controller.setStudents, setDormitories: controller.setDormitories });
      return { controller, actions };
    });
  }
  it("keeps all 200 old events and linked records after adding and undoing event 201", () => {
    const { result } = setup();
    for (let index = 0; index < 200; index++) act(() => { result.current.actions.handleAddDormitoryEvent({ dormId: "d1", score: -1, reason: `记录${index}`, responsibleStudentIds: ["s1"] }); });
    const before = result.current.controller.state;
    let addedId = "";
    act(() => { addedId = result.current.actions.handleAddDormitoryEvent({ dormId: "d1", score: 2, reason: "新记录", responsibleStudentIds: ["s1"] })!.id; });
    expect(result.current.controller.state.dormitories[0].events).toHaveLength(201);
    act(() => { result.current.actions.handleDeleteDormEvent("d1", addedId); });
    expect(result.current.controller.state.dormitories).toEqual(before.dormitories);
    expect(result.current.controller.state.students[0].records).toEqual(before.students[0].records);
    expect(createSeatManagerState(JSON.parse(JSON.stringify(result.current.controller.state))).dormitories[0].events).toHaveLength(200);
  });
  it.each([2, 0, -2])("corrects an explicitly linked personal record with score %s and new evidence", score => {
    const { result } = setup(); let eventId = "";
    act(() => { eventId = result.current.actions.handleAddDormitoryEvent({ dormId: "d1", score: -2, reason: "旧原因", note: "旧备注", responsibleStudentIds: ["s1"] })!.id; });
    act(() => { result.current.actions.handleUpdateDormEvent("d1", eventId, { score, reason: "核实原因", note: "更正备注", date: "2026-09-29" }); });
    const record = result.current.controller.state.students[0].records[0];
    expect(record.type).toBe(score > 0 ? "reward" : score < 0 ? "punish" : "note");
    expect(record.note).toContain("核实原因"); expect(record.note).toContain("更正备注"); expect(record.note).not.toContain("旧原因");
    expect(record.date).toBe("2026-09-29");
    expect(createSeatManagerState(JSON.parse(JSON.stringify(result.current.controller.state))).students[0].records[0]).toEqual(record);
  });
  it("keeps student and dormitory membership consistent when delete is undone after reassignment", () => {
    const initial = {
      ...createEmptySeatManagerState(),
      students: [
        { ...createTestStudent("s1", "张三"), dormitoryId: "d1" },
        { ...createTestStudent("s2", "李四"), dormitoryId: "d2" },
      ],
      dormitories: [
        dormitory("d1", "101", ["s1"]),
        dormitory("d2", "102", ["s2"]),
      ],
    };
    const { result } = renderHook(() => {
      const controller = useSeatManagerController(initial);
      const actions = useDormitoryActions({
        students: controller.state.students,
        dormitories: controller.state.dormitories,
        setStudents: controller.setStudents,
        setDormitories: controller.setDormitories,
      });
      return { controller, actions };
    });

    let undo = () => {};
    act(() => {
      undo = result.current.actions.handleDeleteDormitory("d1");
    });
    act(() => {
      result.current.actions.handleAssignStudentDormitory("s1", "d2");
    });
    act(() => {
      undo();
    });

    expect(result.current.controller.state.students.find(student => student.id === "s1")?.dormitoryId).toBe("d1");
    expect(result.current.controller.state.dormitories.find(item => item.id === "d1")?.memberIds).toEqual(["s1"]);
    expect(result.current.controller.state.dormitories.find(item => item.id === "d2")?.memberIds).toEqual(["s2"]);
  });
});
