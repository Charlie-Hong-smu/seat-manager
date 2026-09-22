import { useEffect, useState } from "react";
import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { getCurrentWorkspaceScope } from "../state/workspaces";
import type { AppStudent } from "../state/types";
import { FollowupTaskForm, type FollowupTaskDraft } from "./FollowupTaskForm";
import type { FollowupTypeCatalogProps } from "./FollowupTypeField";
import { ToolDrawer } from "./ui";

export type { FollowupTaskDraft } from "./FollowupTaskForm";

export function FollowupTaskDrawer({ open, students, draft, onClose, onConfirm, taskTypes, onTaskTypesChange }: FollowupTypeCatalogProps & { open: boolean; students: AppStudent[]; draft: FollowupTaskDraft | null; onClose: () => void; onConfirm: (draft: FollowupTaskDraft) => void }) {
  const [closingDraft, setClosingDraft] = useState(draft);
  useEffect(() => {
    if (draft) { setClosingDraft(draft); return; }
    const timer = window.setTimeout(() => setClosingDraft(null), window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [draft]);
  const visibleDraft = draft || closingDraft;
  if (!visibleDraft) return null;
  const identity = visibleDraft.id || JSON.stringify([visibleDraft.source, visibleDraft.sourceRef, visibleDraft.studentIds || [visibleDraft.studentId], visibleDraft.continuedFromTaskId]);
  return <DraftForm key={`${getCurrentWorkspaceScope()}:${identity}`} taskTypes={taskTypes} onTaskTypesChange={onTaskTypesChange} open={open && Boolean(draft)} students={students} draft={visibleDraft} identity={identity} onClose={onClose} onConfirm={onConfirm}/>;
}

function DraftForm({ open, students, draft, identity, onClose, onConfirm, taskTypes, onTaskTypesChange }: FollowupTypeCatalogProps & { open: boolean; students: AppStudent[]; draft: FollowupTaskDraft; identity: string; onClose: () => void; onConfirm: (draft: FollowupTaskDraft) => void }) {
  const [value, setValue, clear] = useWorkspaceDraftState(`followup:drawer:${identity}`, draft);
  return <ToolDrawer open={open} title={value.id ? "编辑跟进任务" : "创建跟进任务"} onClose={onClose}>
    <FollowupTaskForm taskTypes={taskTypes} onTaskTypesChange={onTaskTypesChange} students={students} value={value} onChange={setValue} onCancel={onClose} onSubmit={() => { onConfirm({ ...value, title: value.title.trim(), description: value.description.trim() }); clear(); }}/>
  </ToolDrawer>;
}
