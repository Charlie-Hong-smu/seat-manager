import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ActivityEvent, DormEvent, Dormitory } from "../state/types";
import { useDormitoryEventEditor } from "./useDormitoryEventEditor";

const workspace = vi.hoisted(() => ({ scope: "dorm-editor-a" }));
vi.mock("../state/workspaces", () => ({ getCurrentWorkspaceScope: () => workspace.scope }));
beforeEach(() => { localStorage.clear(); workspace.scope = "dorm-editor-a"; });
const event: DormEvent = { id: "event-a", dormId: "dorm-a", type: "punish", reason: "旧原因", score: -1, note: "旧备注", punishment: "整理", responsibleStudentIds: ["s1", "s2"], date: "2026-09-25", createdAt: "2026-09-25T00:00:00.000Z" };
const dorm: Dormitory = { id: "dorm-a", name: "甲宿舍", memberIds: [], baseScore: 0, currentScore: -1, periodStart: "", events: [event], history: [] };

it("suspends drafts on close and isolates them by workspace without writing teacher data", () => {
  const onUpdate = vi.fn();
  const hook = renderHook(() => useDormitoryEventEditor({ selectionKey: dorm.id, dormitory: dorm, onUpdate }));
  act(() => hook.result.current.startEditEvent(event.id));
  act(() => hook.result.current.setEditReason("未保存修改"));
  act(() => hook.result.current.closeEditor());
  act(() => hook.result.current.startEditEvent(event.id));
  expect(hook.result.current.editReason).toBe("未保存修改");
  workspace.scope = "dorm-editor-b";
  hook.rerender();
  expect(hook.result.current.editReason).toBe("旧原因");
  workspace.scope = "dorm-editor-a";
  hook.rerender();
  expect(hook.result.current.editReason).toBe("未保存修改");
  expect(onUpdate).not.toHaveBeenCalled();
});

it("saves an archived event and captures the original record and activity for undo", () => {
  const onUpdate = vi.fn();
  const undoActivity = vi.fn();
  const onActivity = vi.fn((_event: ActivityEvent) => undoActivity);
  const archived = { ...dorm, events: [], history: [{ id: "old", label: "旧周期", startDate: event.date, endDate: event.date, baseScore: 0, finalScore: -1, events: [event] }] };
  const hook = renderHook(({ selected }) => useDormitoryEventEditor({ selectionKey: selected.id, dormitory: selected, onUpdate, onActivity }), { initialProps: { selected: archived } });
  act(() => hook.result.current.startEditEvent(event.id));
  act(() => { hook.result.current.setEditScore(3); hook.result.current.setEditReason("新原因"); });
  let saved: ReturnType<typeof hook.result.current.save>;
  act(() => { saved = hook.result.current.save(); });
  expect(onUpdate).toHaveBeenLastCalledWith(dorm.id, event.id, { reason: "新原因", score: 3, note: event.note, punishment: event.punishment, date: event.date });
  expect(onActivity.mock.calls[0][0]).toMatchObject({ studentIds: ["s1", "s2"] });
  expect(hook.result.current.editingEventId).toBe("");
  expect(localStorage.getItem(`seat-manager-form-draft-v1:${workspace.scope}:dormitory:edit:${event.id}:reason`)).toBeNull();
  hook.rerender({ selected: { ...archived, id: "dorm-b" } });
  act(() => saved!.undo());
  expect(onUpdate).toHaveBeenLastCalledWith(dorm.id, event.id, { reason: event.reason, score: event.score, note: event.note, punishment: event.punishment, date: event.date });
  expect(undoActivity).toHaveBeenCalledOnce();
});

it("rejects invalid dates and removed events and retains a draft when saving fails", () => {
  const onUpdate = vi.fn(() => { throw new Error("save failed"); });
  const hook = renderHook(({ selected }) => useDormitoryEventEditor({ selectionKey: selected.id, dormitory: selected, onUpdate }), { initialProps: { selected: dorm } });
  act(() => hook.result.current.startEditEvent(event.id));
  act(() => hook.result.current.setEditDate("2026-02-30"));
  expect(hook.result.current.save()).toBeNull();
  act(() => { hook.result.current.setEditDate(event.date); hook.result.current.setEditReason("保留草稿"); });
  expect(() => hook.result.current.save()).toThrow("save failed");
  expect(hook.result.current.editReason).toBe("保留草稿");
  expect(hook.result.current.editingEventId).toBe(event.id);
  hook.rerender({ selected: { ...dorm, events: [] } });
  expect(hook.result.current.save()).toBeNull();
  expect(onUpdate).toHaveBeenCalledOnce();
});
