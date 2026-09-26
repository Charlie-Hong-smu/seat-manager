import { useEffect, useState } from "react";
import { createActivityEvent } from "../state/activityEvents";
import { isValidDateKey } from "../state/dateKey";
import { localDateKey } from "../state/dormitoryPeriods";
import type { ActivityEvent, DormEvent, Dormitory } from "../state/types";
import { useWorkspaceDraftState } from "./useWorkspaceDraftState";

type EventPatch = Pick<DormEvent, "reason" | "score" | "note" | "punishment" | "date">;
interface Options {
  selectionKey: string;
  dormitory: Dormitory | null;
  onUpdate: (dormId: string, eventId: string, patch: EventPatch) => void;
  onActivity?: (event: ActivityEvent) => void | (() => void);
}

/** Closing suspends the existing cached draft; only a successful save clears it. */
export function useDormitoryEventEditor({ selectionKey, dormitory, onUpdate, onActivity }: Options) {
  const [editingEventId, setEditingEventId] = useState("");
  const source = dormitory && [...dormitory.events, ...dormitory.history.flatMap(archive => archive.events)].find(event => event.id === editingEventId);
  const [editReason, setEditReason, clearReason] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:reason`, source?.reason ?? "");
  const [editScore, setEditScore, clearScore] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:score`, source?.score ?? 0);
  const [editNote, setEditNote, clearNote] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:note`, source?.note ?? "");
  const [editPunishment, setEditPunishment, clearPunishment] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:punishment`, source?.punishment ?? "");
  const [editDate, setEditDate, clearDate] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:date`, source?.date ?? localDateKey());

  useEffect(() => { setEditingEventId(""); }, [selectionKey]);

  function closeEditor() { setEditingEventId(""); }

  function save() {
    if (!dormitory || !source || !isValidDateKey(editDate)) return null;
    const previousEvent = source;
    const dormId = dormitory.id;
    onUpdate(dormId, editingEventId, { reason: editReason, score: editScore, note: editNote, punishment: editPunishment, date: editDate });
    clearReason(); clearScore(); clearNote(); clearPunishment(); clearDate();
    const undoActivity = onActivity?.(createActivityEvent({
      action: "updated", ref: { domain: "dormitory", entityId: editingEventId, studentId: previousEvent.responsibleStudentIds?.[0] || previousEvent.responsibleStudentId },
      studentIds: previousEvent.responsibleStudentIds || (previousEvent.responsibleStudentId ? [previousEvent.responsibleStudentId] : []),
      title: `修改宿舍事件：${editReason}`, detail: `${dormitory.name} · ${editScore > 0 ? "+" : ""}${editScore} 分`,
    }));
    closeEditor();
    return {
      undo() {
        onUpdate(dormId, previousEvent.id, { reason: previousEvent.reason, score: previousEvent.score, note: previousEvent.note, punishment: previousEvent.punishment || "", date: previousEvent.date });
        if (typeof undoActivity === "function") undoActivity();
      },
    };
  }

  return {
    editingEventId, startEditEvent: setEditingEventId, closeEditor, save,
    editReason, setEditReason, editScore, setEditScore, editNote, setEditNote,
    editPunishment, setEditPunishment, editDate, setEditDate,
  };
}
