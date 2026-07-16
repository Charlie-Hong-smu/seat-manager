import { useEffect, useState } from "react";
import type { AppStudent } from "../state/types";
import { FollowupTaskForm, type FollowupTaskDraft } from "./FollowupTaskForm";
import { ToolDrawer } from "./ui";

export type { FollowupTaskDraft } from "./FollowupTaskForm";

export function FollowupTaskDrawer({ open, students, draft, onClose, onConfirm }: { open: boolean; students: AppStudent[]; draft: FollowupTaskDraft | null; onClose: () => void; onConfirm: (draft: FollowupTaskDraft) => void }) {
  const [value, setValue] = useState<FollowupTaskDraft | null>(draft);
  useEffect(() => setValue(draft), [draft]);
  if (!value) return null;
  return <ToolDrawer open={open} title={value.id ? "编辑跟进任务" : "创建跟进任务"} onClose={onClose}>
    <FollowupTaskForm students={students} value={value} onChange={setValue} onCancel={onClose} onSubmit={() => onConfirm({ ...value, title: value.title.trim(), description: value.description.trim() })}/>
  </ToolDrawer>;
}
