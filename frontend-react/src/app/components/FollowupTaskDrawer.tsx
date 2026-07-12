import { X } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppStudent, FollowupTask, FollowupTaskSource, StudentId } from "../state/types";
import { StudentMultiPicker } from "./StudentPicker";
import { Button, DatePicker, ToolDrawer } from "./ui";

export interface FollowupTaskDraft { id?: string; studentId: StudentId; studentIds?: StudentId[]; title: string; type: string; description: string; plannedDate: string; dueDate: string; source: FollowupTaskSource; sourceRef?: FollowupTask["sourceRef"] }
const TYPES = ["常规跟进", "家校沟通", "行为处理", "学业关注", "出勤关注"];

export function FollowupTaskDrawer({ open, students, draft, onClose, onConfirm }: { open: boolean; students: AppStudent[]; draft: FollowupTaskDraft | null; onClose: () => void; onConfirm: (draft: FollowupTaskDraft) => void }) {
  const [value, setValue] = useState<FollowupTaskDraft | null>(draft);
  useEffect(() => setValue(draft), [draft]);
  if (!value) return null;
  return <ToolDrawer open={open} title={value.id ? "编辑跟进任务" : "创建跟进任务"} onClose={onClose}>
    <div className="space-y-4"><div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-700">来源：{value.source === "dormitory" ? "宿舍处理" : value.source === "attendance" ? "出勤异常" : value.source === "ai" ? "AI 建议" : "手动创建"}。这是其他功能预填的任务，请确认内容后创建。</div>
      <StudentMultiPicker students={students} values={value.studentIds?.length ? value.studentIds : value.studentId ? [value.studentId] : []} onChange={studentIds => setValue(current => current ? { ...current, studentIds, studentId: studentIds[0] || "" } : current)} />
      <div><div className="mb-1.5 text-xs font-bold text-gray-400">任务类型</div><div className="flex flex-wrap gap-1.5">{TYPES.map(type => <button key={type} type="button" onClick={() => setValue(current => current ? { ...current, type } : current)} className={`rounded-full border px-3 py-1 text-xs font-bold ${value.type === type ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-500"}`}>{type}</button>)}</div></div>
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-400">标题</span><input value={value.title} onChange={event => setValue({ ...value, title: event.target.value })} className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-300"/></label>
      <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-400">说明</span><textarea rows={4} value={value.description} onChange={event => setValue({ ...value, description: event.target.value })} className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300"/></label>
      <div className="grid grid-cols-2 gap-3"><label><span className="mb-1.5 block text-xs font-bold text-gray-400">计划日期</span><DatePicker value={value.plannedDate} onChange={plannedDate => setValue({ ...value, plannedDate })} ariaLabel="计划日期" className="w-full" /></label><label><span className="mb-1.5 block text-xs font-bold text-gray-400">截止日期</span><DatePicker value={value.dueDate} onChange={dueDate => setValue({ ...value, dueDate })} ariaLabel="截止日期" className="w-full" /></label></div>
      <div className="flex gap-2 pt-2"><Button variant="ghost" onClick={onClose} className="flex-1"><X className="h-4 w-4"/>取消</Button><Button disabled={!value.studentId || !value.title.trim()} onClick={() => onConfirm({ ...value, title: value.title.trim(), description: value.description.trim() })} className="flex-1">{value.id ? "保存修改" : "确认创建"}</Button></div>
    </div>
  </ToolDrawer>;
}
