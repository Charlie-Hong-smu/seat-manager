import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { getCurrentWorkspaceScope } from "../state/workspaces";
import type { AppStudent } from "../state/types";
import { FollowupTaskForm, type FollowupTaskDraft } from "./FollowupTaskForm";
import { ToolDrawer } from "./ui";

export type { FollowupTaskDraft } from "./FollowupTaskForm";

export function FollowupTaskDrawer({ open, students, draft, onClose, onConfirm }: { open: boolean; students: AppStudent[]; draft: FollowupTaskDraft | null; onClose: () => void; onConfirm: (draft: FollowupTaskDraft) => void }) {
  if (!draft) return null;
  const identity = draft.id || JSON.stringify([draft.source, draft.sourceRef, draft.studentIds || [draft.studentId], draft.continuedFromTaskId]);
  return <DraftForm key={`${getCurrentWorkspaceScope()}:${identity}`} open={open} students={students} draft={draft} identity={identity} onClose={onClose} onConfirm={onConfirm}/>;
}

function DraftForm({ open, students, draft, identity, onClose, onConfirm }: { open: boolean; students: AppStudent[]; draft: FollowupTaskDraft; identity: string; onClose: () => void; onConfirm: (draft: FollowupTaskDraft) => void }) {
  const [value, setValue, clear] = useWorkspaceDraftState(`followup:drawer:${identity}`, draft);
  return <ToolDrawer open={open} title={value.id ? "编辑跟进任务" : "创建跟进任务"} onClose={onClose}>
    <FollowupTaskForm students={students} value={value} onChange={setValue} onCancel={onClose} onSubmit={() => { onConfirm({ ...value, title: value.title.trim(), description: value.description.trim() }); clear(); }}/>
  </ToolDrawer>;
}
