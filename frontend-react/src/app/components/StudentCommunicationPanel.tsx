import { Clipboard, ListPlus, RotateCcw, Send, Sparkles } from "lucide-react";
import { useState } from "react";

import { generateAiWeeklyDraft } from "../state/teacherAiService";
import { buildLocalWeeklyDraft, buildWeeklyFacts, digestFacts, getWeekRange } from "../state/teacherWorkbench";
import { createActivityEvent } from "../state/activityEvents";
import type { ActivityEvent, AppStudent, AttendanceRecord, CommunicationDraft, Dormitory, FollowupTask, HomeworkAssignment } from "../state/types";
import { AiGenerationPanel, Button, SelectMenu } from "./ui";

const CHANNELS = ["家长群", "私聊", "电话记录", "纸质", "其他"];

export function StudentCommunicationPanel({ student, students, attendance, tasks, homework, dormitories, drafts, onDraftsChange, onCreateFollowupTask, onActivity }: { student: AppStudent; students: AppStudent[]; attendance: AttendanceRecord[]; tasks: FollowupTask[]; homework: HomeworkAssignment[]; dormitories: Dormitory[]; drafts: CommunicationDraft[]; onDraftsChange: (drafts: CommunicationDraft[]) => void; onCreateFollowupTask?: (input: { studentId: string; title: string; description: string }) => void; onActivity?: (event: ActivityEvent) => void }) {
  const range = getWeekRange();
  const facts = buildWeeklyFacts({ students, attendance, tasks, homework, dormitories, ...range, studentId: student.id });
  const existing = drafts.find(item => item.scope === "student" && item.studentId === student.id && item.startDate === range.startDate && item.endDate === range.endDate);
  const [content, setContent] = useState(existing?.content || buildLocalWeeklyDraft(student.name, range.startDate, range.endDate, facts));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("已生成本地事实草稿，确认内容后可复制或保存。");
  const [generatedBy, setGeneratedBy] = useState<"local" | "ai">(existing?.generatedBy || "local");
  const [deliveryStatus, setDeliveryStatus] = useState<"draft" | "shared">(existing?.deliveryStatus || "draft");
  const [channel, setChannel] = useState<string>(existing?.channel || "私聊");
  const [deliveryNote, setDeliveryNote] = useState(existing?.deliveryNote || "");

  async function enhance() {
    setBusy(true); setStatus("");
    try { const result = await generateAiWeeklyDraft({ scope: "student", subjectName: student.name, startDate: range.startDate, endDate: range.endDate, facts, localDraft: content }); setContent(result.content); setGeneratedBy("ai"); setStatus(result.disclaimer); }
    catch { setStatus("AI 暂时不可用，本地草稿未受影响。"); }
    finally { setBusy(false); }
  }

  function save(nextDeliveryStatus = deliveryStatus) {
    const now = new Date().toISOString();
    const next: CommunicationDraft = { id: existing?.id || `communication-${Date.now()}`, scope: "student", studentId: student.id, startDate: range.startDate, endDate: range.endDate, facts, content: content.trim(), generatedBy, sourceDigest: digestFacts(facts), deliveryStatus: nextDeliveryStatus, channel: nextDeliveryStatus === "shared" ? channel as CommunicationDraft["channel"] : existing?.channel, sharedAt: nextDeliveryStatus === "shared" ? existing?.sharedAt || now : undefined, deliveryNote: deliveryNote.trim() || undefined, updatedAt: now };
    onDraftsChange([next, ...drafts.filter(item => item.id !== next.id)]); setStatus("沟通草稿已保存到历史。");
    onActivity?.(createActivityEvent({ action: nextDeliveryStatus === "shared" ? "shared" : "updated", ref: { domain: "communication", entityId: next.id, studentId: student.id }, studentIds: [student.id], title: nextDeliveryStatus === "shared" ? `已分享沟通稿：${student.name}` : `保存沟通稿：${student.name}`, detail: nextDeliveryStatus === "shared" ? `${channel}${deliveryNote.trim() ? ` · ${deliveryNote.trim()}` : ""}` : "草稿已保存" }));
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(content);
    setStatus("沟通稿已复制，可粘贴到家长群或私聊。");
  }

  function markShared() { setDeliveryStatus("shared"); save("shared"); setStatus(`已标记为通过${channel}分享。`); }
  function restoreDraft() { setDeliveryStatus("draft"); save("draft"); setStatus("已恢复为草稿，可继续编辑。" ); }

  return <div className="space-y-4">{busy ? <AiGenerationPanel title={`正在整理 ${student.name} 的沟通稿`} steps={["核对本周事实", "组织家校表达", "生成可编辑草稿"]}/> : <><div className="flex flex-wrap gap-2">{facts.map(fact => <span key={fact} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">{fact}</span>)}</div><textarea rows={12} value={content} onChange={event => setContent(event.target.value)} className="w-full resize-y rounded-xl border border-gray-200 px-3 py-3 text-sm leading-6 outline-none focus:border-blue-300"/><div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]"><SelectMenu value={channel} onChange={setChannel} ariaLabel="分享渠道" options={CHANNELS.map(value => ({ value, label: value }))}/><input value={deliveryNote} onChange={event => setDeliveryNote(event.target.value)} placeholder="分享备注（可选）" className="h-10 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-blue-300"/></div><div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={() => void enhance()}><Sparkles className="h-4 w-4"/>AI 润色</Button><Button variant="secondary" disabled={!content.trim()} onClick={() => void copyDraft()}><Clipboard className="h-4 w-4"/>复制</Button><Button disabled={!content.trim()} onClick={() => save()} className="flex-1">保存沟通稿</Button>{deliveryStatus === "shared" ? <Button variant="secondary" onClick={restoreDraft}><RotateCcw className="h-4 w-4"/>恢复草稿</Button> : <Button disabled={!content.trim()} onClick={markShared}><Send className="h-4 w-4"/>标记已分享</Button>}</div>{onCreateFollowupTask && <Button variant="ghost" className="w-full" onClick={() => onCreateFollowupTask({ studentId: student.id, title: `家校沟通后续：${student.name}`, description: deliveryNote.trim() || `继续跟进 ${range.startDate} 至 ${range.endDate} 沟通事项` })}><ListPlus className="h-4 w-4"/>创建后续家校沟通任务</Button>}</>}{status && <p className="text-xs leading-5 text-gray-500">{status}</p>}</div>;
}
