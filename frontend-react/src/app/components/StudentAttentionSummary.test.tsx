import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentAttentionSummary, StudentActivityTimeline } from "./StudentAttentionSummary";
import { createTestStudent } from "../state/testFixtures";
import { createDormEvent } from "../state/dormitoryActions";
import { buildWeeklyFacts } from "../state/teacherWorkbench";
import { createActivityEvent } from "../state/activityEvents";
import type { Dormitory } from "../state/types";

afterEach(cleanup);
const student = createTestStudent("s1", "张三");
const props = { activePreview: null, onTogglePreview: vi.fn(), resolvePreview: vi.fn() };
function createDorm(): Dormitory {
  const event = createDormEvent({ dormId: "d1", score: 2, reason: "卫生优秀", date: "2026-09-21", responsibleStudentIds: [student.id] }, [student]);
  return { id: "d1", name: "101", memberIds: [student.id], baseScore: 0, currentScore: 2, periodStart: "2026-09-21", history: [], events: [event] };
}

describe("student attention and report consistency", () => {
  it("keeps a reward without a handling measure out of pending attention and weekly pending counts", () => {
    const dorm = createDorm();
    render(<StudentAttentionSummary {...props} student={student} attendance={[]} tasks={[]} homework={[]} dormitories={[dorm]} />);
    expect(screen.queryByText("宿舍处理待执行")).not.toBeInTheDocument();
    const facts = buildWeeklyFacts({ students: [student], attendance: [], tasks: [], homework: [], dormitories: [dorm], startDate: "2026-09-21", endDate: "2026-09-27" });
    expect(facts).toContain("宿舍事件 1 条");
  });

  it("shows an outstanding measure from an archived event and removes it when completed", () => {
    const dorm = createDorm();
    const event = { ...dorm.events[0], punishment: "整理公共区域" };
    dorm.events = [];
    dorm.history = [{ id: "archive", label: "旧周期", startDate: "2026-09-21", endDate: "2026-09-21", baseScore: 0, finalScore: 2, events: [event] }];
    const view = render(<StudentAttentionSummary {...props} student={student} attendance={[]} tasks={[]} homework={[]} dormitories={[dorm]} />);
    expect(screen.getByText("宿舍处理待执行")).toBeInTheDocument();
    const input = { students: [student], attendance: [], tasks: [], homework: [], dormitories: [dorm], startDate: "2026-09-21", endDate: "2026-09-27" };
    expect(buildWeeklyFacts(input)).toContain("宿舍事件 1 条，待处理 1 条");
    event.punishmentDone = true;
    view.rerender(<StudentAttentionSummary {...props} student={student} attendance={[]} tasks={[]} homework={[]} dormitories={[dorm]} />);
    expect(screen.queryByText("宿舍处理待执行")).not.toBeInTheDocument();
    expect(buildWeeklyFacts(input)).toContain("宿舍事件 1 条");
  });

  it("uses the local day in the student's action timeline", () => {
    const event = createActivityEvent({ action: "created", ref: { domain: "student", entityId: student.id }, studentIds: [student.id], title: "记录", detail: "", occurredAt: new Date(2026, 8, 21, 0, 30).toISOString() });
    render(<StudentActivityTimeline {...props} studentId={student.id} events={[event]} />);
    expect(screen.getByText("2026-09-21")).toBeInTheDocument();
  });
});
