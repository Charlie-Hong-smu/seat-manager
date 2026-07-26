import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createEmptySeatManagerState } from "../state/legacyStateAdapter";
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
