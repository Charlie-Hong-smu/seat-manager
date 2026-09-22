import { Plus, X } from "lucide-react";

import type { AppStudent, FollowupTask, FollowupTaskSource, StudentId } from "../state/types";
import { getFollowupStudentIds, isIndividualFollowup } from "../state/followupStudents";
import { StudentMultiPicker } from "./StudentPicker";
import { FollowupTypeField, type FollowupTypeCatalogProps } from "./FollowupTypeField";
import { Button, DatePicker, Input, Textarea } from "./ui";

export interface FollowupTaskDraft {
  id?: string;
  studentId: StudentId;
  studentIds?: StudentId[];
  studentMode?: FollowupTask["studentMode"];
  title: string;
  type: string;
  description: string;
  plannedDate: string;
  dueDate: string;
  source: FollowupTaskSource;
  sourceRef?: FollowupTask["sourceRef"];
  continuedFromTaskId?: string;
}

const SOURCE_LABEL: Record<string, string> = { dormitory: "宿舍处理", attendance: "出勤异常", homework: "作业登记", score: "成绩分析", communication: "沟通稿", student: "学生档案", ai: "AI 建议", manual: "手动创建" };

export function FollowupTaskForm({ students, value, onChange, onSubmit, onCancel, showSource = true, showPlannedDate = true, compact = false, taskTypes, onTaskTypesChange }: FollowupTypeCatalogProps & {
  students: AppStudent[];
  value: FollowupTaskDraft;
  onChange: (value: FollowupTaskDraft) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  showSource?: boolean;
  showPlannedDate?: boolean;
  compact?: boolean;
}) {
  const selectedIds = getFollowupStudentIds(value);
  const individual = isIndividualFollowup(value);
  const fixedStudent = individual && (Boolean(value.id) || ["attendance", "ai"].includes(value.sourceRef?.domain || value.source));
  return <div className="space-y-3">
    {showSource && <div className={`rounded-[var(--app-radius-sm)] border px-3 py-2 text-caption-1-regular leading-5 ${value.source === "ai" ? "border-status-ai-100 bg-status-ai-50 text-status-ai-700" : "border-accent-100 bg-accent-50 text-accent-700"}`}>来源：{SOURCE_LABEL[value.sourceRef?.domain || value.source] || "业务记录"}。请确认内容后创建。</div>}
    {fixedStudent ? <div className="text-body-regular text-[var(--app-text)]">关联学生：{selectedIds.map(id => students.find(student => student.id === id)?.name || "未知学生").join("、") || "未指定"}</div> : <StudentMultiPicker students={students} values={selectedIds} onChange={studentIds => onChange({ ...value, studentIds, studentId: studentIds[0] || "" })} label={individual ? "逐人跟进学生" : "关联学生（可选）"} emptyLabel="不指定学生" />}
    <FollowupTypeField value={value.type} onChange={type => onChange({ ...value, type })} taskTypes={taskTypes} onTaskTypesChange={onTaskTypesChange}/>
    <Input label="标题" value={value.title} onChange={title => onChange({ ...value, title })} placeholder="跟进事项，例如：确认处罚执行情况"/>
    <Textarea label="说明" rows={compact ? 3 : 4} value={value.description} onChange={description => onChange({ ...value, description })} placeholder="补充背景、处理要求或后续安排"/>
    <div className={`grid gap-3 ${showPlannedDate ? "grid-cols-2" : "grid-cols-1"}`}>{showPlannedDate && <label><span className="mb-1.5 block text-caption-1-semibold text-[var(--app-text-muted)]">计划日期</span><DatePicker value={value.plannedDate} onChange={plannedDate => onChange({ ...value, plannedDate })} ariaLabel="计划日期" className="w-full"/></label>}<label><span className="mb-1.5 block text-caption-1-semibold text-[var(--app-text-muted)]">截止日期</span><DatePicker value={value.dueDate} onChange={dueDate => onChange({ ...value, dueDate })} ariaLabel="截止日期" className="w-full"/></label></div>
    <div className="flex gap-2 pt-1">{onCancel && <Button variant="ghost" onClick={onCancel} className="flex-1"><X className="h-4 w-4"/>取消</Button>}<Button disabled={!value.title.trim() || (individual && !selectedIds.length)} onClick={onSubmit} className="flex-1"><Plus className="h-4 w-4"/>{value.id ? "保存修改" : individual && selectedIds.length > 1 ? `分别创建 ${selectedIds.length} 项` : "创建任务"}</Button></div>
  </div>;
}
