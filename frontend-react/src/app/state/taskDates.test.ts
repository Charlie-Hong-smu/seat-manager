import { describe, expect, it } from "vitest";
import { createFollowupTask, editFollowupTask, getDueFollowupNotifications, getTaskUrgency, isTaskReady } from "./dailyManagement";
import { buildTodayWorkItems } from "./teacherWorkbench";

describe("consistent task dates", () => {
  it("retains explicitly cleared dates on creation and editing", () => {
    const input = { studentId: "", title: "未安排", dueDate: "", plannedDate: "" };
    const created = createFollowupTask(input);
    expect(created).toMatchObject({ dueDate: "", plannedDate: "" });
    expect(editFollowupTask(created, input)).toMatchObject(input);
    expect(getTaskUrgency(created, "2026-09-22")).toBe("none");
    expect(getDueFollowupNotifications([created], "2026-09-22")).toEqual([]);
    expect(isTaskReady(created, "2026-09-22")).toBe(false);
  });
  it("shows planned work once, keeps overdue priority, and excludes future plans", () => {
    const tasks = [
      createFollowupTask({ studentId: "", title: "本日开始", plannedDate: "2026-09-22", dueDate: "2026-09-29" }),
      createFollowupTask({ studentId: "", title: "逾期事项", plannedDate: "2026-09-20", dueDate: "2026-09-21" }),
      createFollowupTask({ studentId: "", title: "未来计划", plannedDate: "2026-09-23", dueDate: "" }),
    ];
    const items = buildTodayWorkItems({ date: "2026-09-22", tasks, students: [], attendance: [], homework: [] });
    expect(items.map(item => item.title)).toEqual(["逾期事项", "本日开始"]);
    expect(items[1].urgency).toBe(3);
    expect(getDueFollowupNotifications(tasks, "2026-09-22").map(task => task.title)).toEqual(["逾期事项"]);
  });
});
