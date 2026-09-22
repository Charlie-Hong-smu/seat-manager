import { describe, expect, it } from "vitest";
import { timestampToLocalDateKey } from "./dateKey";
import { createFollowupTask, getDueFollowupNotifications } from "./dailyManagement";
import { createActivityEvent } from "./activityEvents";
import { buildTimeline, filterTimeline } from "./dataInsights";
import { resolveBusinessEntityPreview } from "./businessEntityPreview";
import { buildWeeklyFacts, normalizeCommunicationDrafts, normalizeHomeworkAssignments } from "./teacherWorkbench";
import { createEmptySeatManagerState } from "./legacyStateAdapter";

// Local Monday just after midnight; in Asia/Shanghai its ISO timestamp is still Sunday.
const date = "2026-09-21";
const timestamp = new Date(2026, 8, 21, 0, 30).toISOString();

describe("local dates across notifications, reports and history", () => {
  it("converts timestamps while preserving date-only values and rejecting invalid values", () => {
    expect(timestampToLocalDateKey(timestamp)).toBe(date);
    expect(timestampToLocalDateKey(date)).toBe(date);
    expect(timestampToLocalDateKey("2026-02-30")).toBe("");
    expect(timestampToLocalDateKey("broken")).toBe("");
    expect(timestampToLocalDateKey()).toBe("");
  });

  it("notifies once per local day, including midnight, and excludes future/completed tasks", () => {
    const task = createFollowupTask({ studentId: "s1", title: "待办", dueDate: date });
    expect(getDueFollowupNotifications([task], date)).toEqual([task]);
    const notified = { ...task, lastNotifiedAt: timestamp };
    expect(getDueFollowupNotifications([notified], date)).toEqual([]);
    expect(getDueFollowupNotifications([notified], "2026-09-22")).toEqual([notified]);
    expect(getDueFollowupNotifications([{ ...task, dueDate: "2026-09-22" }, { ...task, status: "completed" }], date)).toEqual([]);
  });

  it("includes a Monday morning completion in the new week's facts", () => {
    const task = { ...createFollowupTask({ studentId: "s1", title: "已处理" }), status: "completed" as const, completedAt: timestamp };
    const facts = buildWeeklyFacts({ students: [], attendance: [], tasks: [task], homework: [], startDate: date, endDate: "2026-09-27" });
    expect(facts).toContain("完成跟进 1 项，待处理 0 项");
  });

  it("filters real activity and legacy summaries by the same local date", () => {
    const state = createEmptySeatManagerState();
    state.activityEvents = [createActivityEvent({ action: "created", ref: { domain: "student", entityId: "s1" }, studentIds: ["s1"], title: "新记录", detail: "", occurredAt: timestamp })];
    state.followupTasks = [{ ...createFollowupTask({ studentId: "s1", title: "旧待办" }), updatedAt: timestamp }];
    state.homeworkAssignments = normalizeHomeworkAssignments([{ id: "h1", title: "旧作业", updatedAt: timestamp }]);
    state.communicationDrafts = normalizeCommunicationDrafts([{ id: "c1", content: "旧周报", updatedAt: timestamp }]);
    const timeline = buildTimeline(state, date);
    expect(timeline).toHaveLength(4);
    expect(filterTimeline(timeline, { startDate: date, endDate: date })).toHaveLength(4);
    expect(new Set(timeline.map(item => item.date))).toEqual(new Set([date]));
  });

  it("shows local dates in missing sources, homework updates and shared communication", () => {
    const state = createEmptySeatManagerState();
    state.homeworkAssignments = normalizeHomeworkAssignments([{ id: "h1", title: "作业", studentStates: { s1: { status: "submitted", updatedAt: timestamp } } }]);
    state.communicationDrafts = normalizeCommunicationDrafts([{ id: "c1", content: "周报", deliveryStatus: "shared", sharedAt: timestamp }]);
    expect(resolveBusinessEntityPreview(state, { domain: "followup", entityId: "missing" }, { title: "旧记录", occurredAt: timestamp }).subtitle).toBe(date);
    expect(resolveBusinessEntityPreview(state, { domain: "homework", entityId: "h1", studentId: "s1" }).facts).toContainEqual({ label: "状态更新", value: date });
    expect(resolveBusinessEntityPreview(state, { domain: "communication", entityId: "c1" }).facts).toContainEqual({ label: "分享时间", value: date });
  });
});
