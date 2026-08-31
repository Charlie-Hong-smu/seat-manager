import { describe, expect, it } from "vitest";

import { createActivityEvent } from "./activityEvents";
import { changeFollowupTaskStatus, permanentlyDeleteStudent, syncCompletedFollowupHomework } from "./classManagementCommands";
import { createFollowupTask, editFollowupTask, findMatchingFollowupTask, normalizeFollowupTasks, prepareFollowupTasks } from "./dailyManagement";
import { buildTimeline, filterTimeline, inspectStateHealth } from "./dataInsights";
import { getFollowupStudentIds } from "./followupStudents";
import { createEmptySeatManagerState, createSeatManagerState } from "./legacyStateAdapter";
import { saveLegacySnapshot } from "./legacyWriteAdapter";
import { buildTodayWorkItems, buildWeeklyFacts } from "./teacherWorkbench";
import { createTestStudent } from "./testFixtures";
import { ensureWorkspaceBook, readCurrentSliceData } from "./workspaces";

const students = [createTestStudent("a", "同名学生"), createTestStudent("b", "同名学生"), createTestStudent("c", "学生丙")];
const input = { studentId: "a", studentIds: ["a", "b"], title: "返校打扫", dueDate: "2026-08-31", plannedDate: "2026-08-31" };

describe("shared matters and individual followups", () => {
  it("creates one shared matter for distinct IDs, including students with the same name", () => {
    const { created } = prepareFollowupTasks({ ...input, studentIds: ["a", "b", "a"] });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ studentId: "a", studentIds: ["a", "b"], studentMode: "shared" });
    expect(prepareFollowupTasks(input, created).created).toHaveLength(1); // independent manual submissions aren't merged by title
    expect(prepareFollowupTasks({ ...input, studentIds: [] }).created[0]).toMatchObject({ studentId: "", studentIds: [] });
  });

  it("keeps multi-selection through editing, clearing, normalization and the real workspace storage", () => {
    const original = createFollowupTask(input);
    const edited = editFollowupTask(original, { ...input, studentIds: ["b", "c"] });
    expect(edited).toMatchObject({ id: original.id, studentId: "b", studentIds: ["b", "c"] });
    expect(editFollowupTask(edited, { ...input, studentIds: [] })).toMatchObject({ studentId: "", studentIds: [] });
    ensureWorkspaceBook();
    expect(saveLegacySnapshot({ students, seatOrder: ["a", "b", "c"], lockedSeats: [], followupTasks: [edited] })).toBe(true);
    const reloaded = createSeatManagerState(JSON.parse(JSON.stringify(readCurrentSliceData())));
    expect(reloaded.followupTasks[0]).toMatchObject({ id: original.id, studentId: "b", studentIds: ["b", "c"] });
    const legacy = { ...original, studentIds: undefined, studentMode: undefined };
    expect(normalizeFollowupTasks([legacy, { ...legacy, id: "separate-old-task" }])).toHaveLength(2);
    expect(getFollowupStudentIds(normalizeFollowupTasks([legacy])[0])).toEqual(["a"]);
  });

  it("normalizes duplicate and invalid student IDs without changing the intended participant", () => {
    expect(normalizeFollowupTasks([{ ...createFollowupTask(input), studentIds: ["b", "b", null, "", 7] }])[0]).toMatchObject({ studentId: "b", studentIds: ["b"] });
  });

  it.each(["homework", "score", "attendance", "ai"] as const)("keeps %s outcomes separate and never drops the second student when the first already has a task", source => {
    const draft = { ...input, source, sourceRef: { domain: source, entityId: "source", subEntityId: "question-1" } };
    const first = prepareFollowupTasks({ ...draft, studentIds: ["a"] }).created;
    expect(findMatchingFollowupTask(first, draft)).toBeUndefined();
    const batch = prepareFollowupTasks(draft, first);
    expect(batch.created).toHaveLength(1);
    expect(batch.created[0]).toMatchObject({ studentId: "b", studentIds: ["b"], sourceRef: { studentId: "b" } });
    expect(batch.taskIds).toEqual([first[0].id, batch.created[0].id]);
    expect(prepareFollowupTasks(draft, [...first, ...batch.created]).created).toHaveLength(0);
    const completed = changeFollowupTaskStatus(first[0], "completed");
    expect(completed.event.studentIds).toEqual(["a"]);
    expect(batch.created[0].status).toBe("pending");
    expect(editFollowupTask(first[0], { ...draft, studentIds: ["b", "c"] }).studentIds).toEqual(["a"]);
    expect(prepareFollowupTasks({ ...draft, sourceRef: { ...draft.sourceRef, subEntityId: "question-2" } }, first).created).toHaveLength(2);
    expect(prepareFollowupTasks({ ...draft, continuedFromTaskId: first[0].id }, first).created).toHaveLength(2);
  });

  it("preserves one dormitory matter with all students and only reuses an exact participant set", () => {
    const draft = { ...input, source: "dormitory" as const, sourceRef: { domain: "dormitory" as const, entityId: "dorm-event" } };
    const batch = prepareFollowupTasks(draft);
    expect(batch.created).toHaveLength(1);
    expect(findMatchingFollowupTask(batch.created, { ...draft, studentIds: ["b", "a"] })?.id).toBe(batch.created[0].id);
    expect(findMatchingFollowupTask(batch.created, { ...draft, studentIds: ["a", "c"] })).toBeUndefined();
    expect(prepareFollowupTasks({ ...input, studentMode: "individual" }).created).toHaveLength(2); // collection reminders
  });

  it("counts a shared matter once for the class and makes it visible to every participant", () => {
    const state = createEmptySeatManagerState();
    state.students = students;
    state.followupTasks = [createFollowupTask(input)];
    const completed = changeFollowupTaskStatus(state.followupTasks[0], "completed");
    expect(completed.event.studentIds).toEqual(["a", "b"]);
    expect(buildTodayWorkItems({ date: input.dueDate, students, tasks: state.followupTasks, attendance: [], homework: [] })).toHaveLength(1);
    const facts = buildWeeklyFacts({ ...state, attendance: [], tasks: state.followupTasks, homework: [], startDate: "2026-08-01", endDate: "2026-08-31", studentId: "b" });
    expect(facts).toContain("完成跟进 0 项，待处理 1 项");
    expect(filterTimeline(buildTimeline(state), { studentId: "b" }).some(item => item.title === input.title)).toBe(true);
    state.activityEvents = [createActivityEvent({ action: "created", ref: { domain: "followup", entityId: state.followupTasks[0].id }, studentIds: ["a", "b"], title: input.title, detail: "共同事项" })];
    expect(filterTimeline(buildTimeline(state), { studentId: "b" })).toHaveLength(1);
    expect(inspectStateHealth({ ...state, students: [students[0]] }).some(issue => issue.id.startsWith("task-orphan"))).toBe(true);
  });

  it("deleting either participant keeps the shared matter and clears stale source ownership", () => {
    const state = createEmptySeatManagerState();
    state.students = students;
    state.followupTasks = [createFollowupTask({ ...input, sourceRef: { domain: "dormitory", entityId: "event", studentId: "a" } })];
    const next = permanentlyDeleteStudent(state, "a");
    expect(next.followupTasks).toHaveLength(1);
    expect(next.followupTasks[0]).toMatchObject({ studentId: "b", studentIds: ["b"] });
    expect(next.followupTasks[0].sourceRef?.studentId).toBeUndefined();
    expect(permanentlyDeleteStudent(state, "b").followupTasks[0].studentIds).toEqual(["a"]);
    expect(createSeatManagerState(next).followupTasks[0].studentIds).toEqual(["b"]);
  });

  it("homework sync changes only its student and never guesses a mismatched or multi-student source", () => {
    const task = prepareFollowupTasks({ ...input, source: "homework", sourceRef: { domain: "homework", entityId: "h" } }).created[0];
    const assignment = { id: "h", title: "作业", subject: "数学", note: "", assignedDate: input.dueDate, dueDate: input.dueDate, createdAt: "", updatedAt: "", studentStates: { a: { status: "pending" as const, note: "", updatedAt: "" }, b: { status: "pending" as const, note: "", updatedAt: "" } } };
    expect(syncCompletedFollowupHomework(task, [assignment])?.assignments[0].studentStates).toMatchObject({ a: { status: "submitted" }, b: { status: "pending" } });
    expect(syncCompletedFollowupHomework({ ...task, studentIds: ["a", "b"] }, [assignment])).toBeNull();
    expect(syncCompletedFollowupHomework({ ...task, sourceRef: { domain: "homework", entityId: "h", studentId: "b" } }, [assignment])).toBeNull();
    expect(syncCompletedFollowupHomework(task, [{ ...assignment, studentStates: { b: assignment.studentStates.b } }])).toBeNull();
  });
});
