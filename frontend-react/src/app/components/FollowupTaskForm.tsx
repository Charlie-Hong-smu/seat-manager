import { Plus, X } from "lucide-react";

import type { AppStudent, FollowupTask, FollowupTaskSource, StudentId } from "../state/types";
import { StudentMultiPicker } from "./StudentPicker";
import { Button, DatePicker, SegmentedControl } from "./ui";

export interface FollowupTaskDraft {
  id?: string;
  studentId: StudentId;
  studentIds?: StudentId[];
  title: string;
  type: string;
  description: string;
  plannedDate: string;
  dueDate: string;
  source: FollowupTaskSource;
  sourceRef?: FollowupTask["sourceRef"];
  continuedFromTaskId?: string;
}

const TYPES = ["常规跟进", "家校沟通", "行为处理", "学业关注", "出勤关注"];
const SOURCE_LABEL: Record<string, string> = { dormitory: "宿舍处理", attendance: "出勤异常", homework: "作业登记", score: "成绩分析", communication: "沟通稿", student: "学生档案", ai: "AI 建议", manual: "手动创建" };

export function FollowupTaskForm({ students, value, onChange, onSubmit, onCancel, showSource = true, showPlannedDate = true, compact = false }: {
  students: AppStudent[];
  value: FollowupTaskDraft;
  onChange: (value: FollowupTaskDraft) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  showSource?: boolean;
  showPlannedDate?: boolean;
  compact?: boolean;
}) {
  const selectedIds = value.studentIds?.length ? value.studentIds : value.studentId ? [value.studentId] : [];
  return <div className="space-y-3">
    {showSource && <div className={`rounded-[var(--app-radius-sm)] border px-3 py-2 text-xs leading-5 ${value.source === "ai" ? "border-violet-100 bg-violet-50 text-violet-700" : "border-blue-100 bg-blue-50 text-blue-700"}`}>来源：{SOURCE_LABEL[value.sourceRef?.domain || value.source] || "业务记录"}。请确认内容后创建。</div>}
    <StudentMultiPicker students={students} values={selectedIds} onChange={studentIds => onChange({ ...value, studentIds, studentId: studentIds[0] || "" })} label="关联学生（可选）" emptyLabel="不指定学生" />
    <div><div className="mb-1.5 text-xs font-bold text-[var(--app-text-muted)]">任务类型</div><SegmentedControl value={value.type} onChange={type => onChange({ ...value, type })} ariaLabel="跟进类型" className="w-full overflow-x-auto" options={TYPES.map(type => ({ value: type, label: type }))}/></div>
    <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--app-text-muted)]">标题</span><input value={value.title} onChange={event => onChange({ ...value, title: event.target.value })} placeholder="跟进事项，例如：确认处罚执行情况" className="h-10 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-3 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"/></label>
    <label className="block"><span className="mb-1.5 block text-xs font-bold text-[var(--app-text-muted)]">说明</span><textarea rows={compact ? 3 : 4} value={value.description} onChange={event => onChange({ ...value, description: event.target.value })} placeholder="补充说明（可选）" className="w-full resize-none rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/10"/></label>
    <div className={`grid gap-3 ${showPlannedDate ? "grid-cols-2" : "grid-cols-1"}`}>{showPlannedDate && <label><span className="mb-1.5 block text-xs font-bold text-[var(--app-text-muted)]">计划日期</span><DatePicker value={value.plannedDate} onChange={plannedDate => onChange({ ...value, plannedDate })} ariaLabel="计划日期" className="w-full"/></label>}<label><span className="mb-1.5 block text-xs font-bold text-[var(--app-text-muted)]">截止日期</span><DatePicker value={value.dueDate} onChange={dueDate => onChange({ ...value, dueDate })} ariaLabel="截止日期" className="w-full"/></label></div>
    <div className="flex gap-2 pt-1">{onCancel && <Button variant="ghost" onClick={onCancel} className="flex-1"><X className="h-4 w-4"/>取消</Button>}<Button disabled={!value.title.trim()} onClick={onSubmit} className="flex-1"><Plus className="h-4 w-4"/>{value.id ? "保存修改" : selectedIds.length > 1 ? `创建 ${selectedIds.length} 项` : "创建任务"}</Button></div>
  </div>;
}
