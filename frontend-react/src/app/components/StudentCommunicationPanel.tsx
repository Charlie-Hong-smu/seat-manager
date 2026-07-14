import { Sparkles } from "lucide-react";
import { useState } from "react";

import { generateAiWeeklyDraft } from "../state/teacherAiService";
import { buildLocalWeeklyDraft, buildWeeklyFacts, digestFacts, getWeekRange } from "../state/teacherWorkbench";
import type { AppStudent, AttendanceRecord, CommunicationDraft, FollowupTask, HomeworkAssignment } from "../state/types";
import { AiGenerationPanel, Button } from "./ui";

export function StudentCommunicationPanel({ student, students, attendance, tasks, homework, drafts, onDraftsChange }: { student: AppStudent; students: AppStudent[]; attendance: AttendanceRecord[]; tasks: FollowupTask[]; homework: HomeworkAssignment[]; drafts: CommunicationDraft[]; onDraftsChange: (drafts: CommunicationDraft[]) => void }) {
  const range = getWeekRange();
  const facts = buildWeeklyFacts({ students, attendance, tasks, homework, ...range, studentId: student.id });
  const existing = drafts.find(item => item.scope === "student" && item.studentId === student.id && item.startDate === range.startDate && item.endDate === range.endDate);
  const [content, setContent] = useState(existing?.content || buildLocalWeeklyDraft(student.name, range.startDate, range.endDate, facts));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("已生成本地事实草稿，确认内容后可复制或保存。");
  const [generatedBy, setGeneratedBy] = useState<"local" | "ai">(existing?.generatedBy || "local");

  async function enhance() {
    setBusy(true); setStatus("");
    try { const result = await generateAiWeeklyDraft({ scope: "student", subjectName: student.name, startDate: range.startDate, endDate: range.endDate, facts, localDraft: content }); setContent(result.content); setGeneratedBy("ai"); setStatus(result.disclaimer); }
    catch { setStatus("AI 暂时不可用，本地草稿未受影响。"); }
    finally { setBusy(false); }
  }

  function save() {
    const next: CommunicationDraft = { id: existing?.id || `communication-${Date.now()}`, scope: "student", studentId: student.id, startDate: range.startDate, endDate: range.endDate, facts, content: content.trim(), generatedBy, sourceDigest: digestFacts(facts), updatedAt: new Date().toISOString() };
    onDraftsChange([next, ...drafts.filter(item => item.id !== next.id)]); setStatus("沟通草稿已保存到历史。");
  }

  return <div className="space-y-4">{busy ? <AiGenerationPanel title={`正在整理 ${student.name} 的沟通稿`} steps={["核对本周事实", "组织家校表达", "生成可编辑草稿"]}/> : <><div className="flex flex-wrap gap-2">{facts.map(fact => <span key={fact} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">{fact}</span>)}</div><textarea rows={12} value={content} onChange={event => setContent(event.target.value)} className="w-full resize-y rounded-xl border border-gray-200 px-3 py-3 text-sm leading-6 outline-none focus:border-blue-300"/><div className="flex gap-2"><Button variant="secondary" onClick={() => void enhance()}><Sparkles className="h-4 w-4"/>AI 润色</Button><Button className="flex-1" disabled={!content.trim()} onClick={save}>保存沟通稿</Button></div></>}{status && <p className="text-xs leading-5 text-gray-500">{status}</p>}</div>;
}
