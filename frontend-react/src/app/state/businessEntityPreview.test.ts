import { describe, expect, it } from "vitest";

import { resolveBusinessEntityPreview } from "./businessEntityPreview";
import { createEmptySeatManagerState } from "./legacyStateAdapter";
import { createTestStudent } from "./testFixtures";

function createPreviewState() {
  const state = createEmptySeatManagerState();
  state.students = [{
    ...createTestStudent("s1", "张三"),
    exams: [
      { id: "exam-old", name: "月考", date: "2026-06-10", scores: { 语文: 90, 数学: 80 }, total: 170, rank: "12" },
      { id: "exam-new", name: "期中考", date: "2026-07-10", scores: { 语文: 95, 数学: 88 }, total: 183, rank: "8" },
    ],
  }];
  state.followupTasks = [{ id: "task-1", studentId: "s1", title: "联系家长", type: "家校沟通", description: "了解近期学习状态", plannedDate: "2026-07-20", dueDate: "2026-07-22", status: "pending", source: "manual", createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-20T08:00:00.000Z" }];
  state.homeworkAssignments = [{ id: "homework-1", title: "数学练习", subject: "数学", assignedDate: "2026-07-18", dueDate: "2026-07-20", note: "完成错题订正", studentStates: { s1: { status: "pending", note: "尚未提交", updatedAt: "2026-07-20T08:00:00.000Z" } }, lifecycle: "active", participantStudentIds: ["s1"], createdAt: "2026-07-18T08:00:00.000Z", updatedAt: "2026-07-20T08:00:00.000Z" }];
  state.attendanceRecords = [{ id: "attendance-1", studentId: "s1", date: "2026-07-20", status: "leave", late: false, earlyLeave: false, note: "上午看病", leaveStart: "08:00", leaveEnd: "12:00", createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-20T08:00:00.000Z" }];
  state.dormitories = [{ id: "dorm-1", name: "301", memberIds: ["s1"], baseScore: 100, currentScore: 98, events: [{ id: "dorm-event-1", dormId: "dorm-1", type: "punish", score: -2, reason: "晚归", responsibleStudentIds: ["s1"], note: "已联系舍长", punishment: "值日一次", punishmentDone: false, date: "2026-07-19", createdAt: "2026-07-19T22:00:00.000Z" }], periodStart: "2026-07-14", history: [] }];
  state.communicationDrafts = [{ id: "communication-1", scope: "student", studentId: "s1", startDate: "2026-07-14", endDate: "2026-07-20", facts: [], content: "本周学习状态稳定。", generatedBy: "local", sourceDigest: "digest", deliveryStatus: "shared", channel: "私聊", sharedAt: "2026-07-20T10:00:00.000Z", updatedAt: "2026-07-20T10:00:00.000Z" }];
  state.fundTransactions = [{ id: "fund-1", type: "expense", amount: 25.5, category: "班级用品", note: "购买白板笔", relatedStudentIds: ["s1"], relatedStudentNames: ["张三"], date: "2026-07-18", createdAt: "2026-07-18T08:00:00.000Z", status: "active" }];
  return state;
}

describe("business entity context preview", () => {
  it("resolves followup, homework, attendance and dormitory facts", () => {
    const state = createPreviewState();

    expect(resolveBusinessEntityPreview(state, { domain: "followup", entityId: "task-1", studentId: "s1" })).toMatchObject({ title: "联系家长", status: "待处理", availability: "available", navigationLabel: "前往任务工作区" });
    expect(resolveBusinessEntityPreview(state, { domain: "homework", entityId: "homework-1", studentId: "s1" })).toMatchObject({ title: "数学练习", status: "未交", description: "尚未提交" });
    expect(resolveBusinessEntityPreview(state, { domain: "attendance", entityId: "attendance-1", studentId: "s1" })).toMatchObject({ title: "请假", subtitle: "2026-07-20", description: "上午看病" });
    expect(resolveBusinessEntityPreview(state, { domain: "dormitory", entityId: "dorm-event-1", studentId: "s1" })).toMatchObject({ title: "晚归", status: "待执行处理", description: "已联系舍长" });
  });

  it("resolves score, communication and fund without copying edit behavior", () => {
    const state = createPreviewState();

    const score = resolveBusinessEntityPreview(state, { domain: "score", entityId: "exam-new", studentId: "s1" });
    expect(score).toMatchObject({ title: "期中考", status: "较上次进步 13 分", availability: "available" });
    expect(score.facts).toEqual(expect.arrayContaining([{ label: "总分", value: "183" }, { label: "排名", value: "班级第 8 名" }]));
    expect(resolveBusinessEntityPreview(state, { domain: "communication", entityId: "communication-1", studentId: "s1" })).toMatchObject({ status: "已分享", description: "本周学习状态稳定。" });
    expect(resolveBusinessEntityPreview(state, { domain: "fund", entityId: "fund-1", studentId: "s1" })).toMatchObject({ title: "班级用品", status: "支出", description: "购买白板笔" });
  });

  it("keeps legacy refs, deleted entities and unsupported AI sources understandable", () => {
    const state = createPreviewState();

    expect(resolveBusinessEntityPreview(state, { domain: "attendance", entityId: "legacy-missing", studentId: "s1", date: "2026-07-20" })).toMatchObject({ title: "请假", availability: "available" });
    const deleted = resolveBusinessEntityPreview(state, { domain: "followup", entityId: "deleted" }, { title: "已删除任务", detail: "历史动作摘要", occurredAt: "2026-07-01T08:00:00.000Z" });
    expect(deleted).toMatchObject({ title: "已删除任务", availability: "missing", description: "历史动作摘要" });
    expect(deleted).not.toHaveProperty("navigationLabel");
    const ai = resolveBusinessEntityPreview(state, { domain: "ai", entityId: "ai-1", studentId: "s1" }, { title: "AI 建议已生成", detail: "建议联系任课老师" });
    expect(ai).toMatchObject({ title: "AI 建议已生成", availability: "unsupported" });
    expect(ai).not.toHaveProperty("navigationLabel");
  });
});
