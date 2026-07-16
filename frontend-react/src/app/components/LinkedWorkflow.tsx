import { ArrowUpRight, CheckCircle2, Link2, Save } from "lucide-react";
import { useEffect, useState } from "react";

import type { BusinessEntityRef, FollowupTask } from "../state/types";
import { Button } from "./ui";

const SOURCE_LABEL: Record<string, string> = { manual: "手动", ai: "AI 建议", score: "成绩", attendance: "出勤", dormitory: "宿舍", homework: "作业", student: "学生", communication: "沟通稿" };

export function SourceLink({ source, sourceRef, onOpen, exists = true }: { source: string; sourceRef?: BusinessEntityRef; onOpen?: (ref: BusinessEntityRef) => void; exists?: boolean }) {
  const label = SOURCE_LABEL[sourceRef?.domain || source] || "来源";
  if (sourceRef && !exists) return <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-400" title="原始业务对象已被删除">{label} · 来源已删除</span>;
  if (!sourceRef || !onOpen) return <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${source === "ai" ? "bg-violet-50 text-violet-600" : "bg-blue-50 text-blue-600"}`}>{label}</span>;
  return <button type="button" onClick={() => onOpen(sourceRef)} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition-colors ${source === "ai" ? "bg-violet-50 text-violet-600 hover:bg-violet-100" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`} aria-label={`打开${label}来源`} title={`打开${label}来源`}><Link2 className="h-3 w-3"/>{label}<ArrowUpRight className="h-3 w-3"/></button>;
}

export function LinkedTaskBadge({ task, onOpen }: { task?: FollowupTask; onOpen?: (taskId: string) => void }) {
  if (!task) return null;
  const label = task.status === "completed" ? "跟进已完成" : task.status === "cancelled" ? "跟进已取消" : "已有跟进";
  const className = task.status === "completed" ? "bg-emerald-50 text-emerald-700" : task.status === "cancelled" ? "bg-gray-100 text-gray-500" : "bg-blue-50 text-blue-700";
  return <button type="button" disabled={!onOpen} onClick={() => onOpen?.(task.id)} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${className}`}><CheckCircle2 className="h-3 w-3"/>{label}</button>;
}

export function ResolutionEditor({ task, onSave, onContinue }: { task: FollowupTask; onSave: (note: string) => void; onContinue: () => void }) {
  const [note, setNote] = useState(task.resolutionNote || "");
  useEffect(() => setNote(task.resolutionNote || ""), [task.id, task.resolutionNote]);
  return <div className="view-switch-enter mt-3 rounded-[var(--app-radius-sm)] border border-emerald-100 bg-emerald-50/50 p-3"><label className="text-xs font-bold text-emerald-800">处理结果（可选）<textarea rows={2} value={note} onChange={event => setNote(event.target.value)} placeholder="例如：已与家长沟通，学生将在周五前补交" className="mt-2 w-full resize-none rounded-[var(--app-radius-sm)] border border-emerald-100 bg-white px-3 py-2 text-sm font-normal text-gray-700 outline-none focus:border-emerald-300"/></label><div className="mt-2 flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={onContinue}>继续跟进</Button><Button size="sm" onClick={() => onSave(note)}><Save className="h-3.5 w-3.5"/>保存结果</Button></div></div>;
}
