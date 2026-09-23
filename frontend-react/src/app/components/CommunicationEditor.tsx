import { Clipboard, Save, Sparkles } from "lucide-react";
import { useState } from "react";
import { useScopedRequest } from "../hooks/useScopedRequest";
import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { generateAiWeeklyDraft } from "../state/teacherAiService";
import { buildLocalWeeklyDraft, digestFacts } from "../state/teacherWorkbench";
import type { CommunicationDraft } from "../state/types";
import { getCurrentWorkspaceScope } from "../state/workspaces";
import { AiGenerationPanel, Button, Chip, InlineStatus, MotionSwitch, SelectMenu, Textarea } from "./ui";

export type SaveCommunication = (draft: CommunicationDraft) => boolean;
const channels: NonNullable<CommunicationDraft["channel"]>[] = ["家长群", "私聊", "电话记录", "纸质", "其他"];

/** Both communication entry points keep local drafts separate from confirmed business records. */
export function CommunicationEditor({ scope, studentId, subjectName, startDate, endDate, facts, saved, onSave }: {
  scope: CommunicationDraft["scope"]; studentId?: string; subjectName: string;
  startDate: string; endDate: string; facts: string[]; saved?: CommunicationDraft; onSave?: SaveCommunication;
}) {
  const workspace = getCurrentWorkspaceScope();
  const key = scope === "class" ? `weekly:class:${startDate}:${endDate}` : `weekly:student:${studentId}:${startDate}:${endDate}`;
  const [content, setContent] = useWorkspaceDraftState(key, () => saved?.content || buildLocalWeeklyDraft(subjectName, startDate, endDate, facts));
  const [channel, setChannel] = useWorkspaceDraftState<NonNullable<CommunicationDraft["channel"]>>(`${key}:channel`, saved?.channel || (scope === "class" ? "家长群" : "私聊"));
  const [note, setNote] = useWorkspaceDraftState(`${key}:note`, saved?.deliveryNote || "");
  const [generatedBy, setGeneratedBy] = useWorkspaceDraftState<CommunicationDraft["generatedBy"]>(`${key}:generatedBy`, saved?.generatedBy || "local");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const requests = useScopedRequest(`${workspace}:${key}`);
  const dirty = content !== saved?.content || note !== (saved?.deliveryNote || "") || channel !== (saved?.channel || (scope === "class" ? "家长群" : "私聊"));

  async function enhance() {
    const request = requests.start();
    setBusy(true); setStatus("");
    try {
      const result = await generateAiWeeklyDraft({ scope, subjectName, startDate, endDate, facts, localDraft: content });
      if (!request.isCurrent() || getCurrentWorkspaceScope() !== workspace) return;
      setContent(result.content); setGeneratedBy("ai"); setStatus("润色结果已放入草稿，核对后点击保存。");
    } catch { if (request.isCurrent()) setStatus("AI 暂时不可用，原草稿仍保留。"); }
    finally { if (request.isCurrent()) setBusy(false); }
  }

  function save(deliveryStatus: "draft" | "shared") {
    if (!content.trim() || !onSave || getCurrentWorkspaceScope() !== workspace) return;
    const now = new Date().toISOString();
    const draft: CommunicationDraft = {
      id: saved?.id || `communication-${crypto.randomUUID()}`, scope, studentId, startDate, endDate,
      content: content.trim(), facts, sourceDigest: digestFacts(facts), generatedBy, channel,
      deliveryNote: note.trim(), deliveryStatus, sharedAt: deliveryStatus === "shared" ? now : undefined, updatedAt: now,
    };
    if (onSave(draft)) {
      setContent(draft.content); setNote(draft.deliveryNote || "");
      setStatus(deliveryStatus === "shared" ? "已记录沟通渠道与时间。" : "沟通稿已保存，可从历史重新打开。");
    } else setStatus("本机保存失败，编辑草稿仍保留，请先处理顶部保存提示。");
  }

  async function copy() {
    try { await navigator.clipboard.writeText(content); setStatus("正文已复制，沟通状态保持不变。"); }
    catch { setStatus("复制失败，请选中正文手动复制。"); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><span className="text-body-medium text-text-primary">{subjectName}</span><span className="text-caption-1-regular text-text-secondary">{startDate} — {endDate}</span><Chip color="soft" variant="caption">{dirty ? "编辑未保存" : saved?.deliveryStatus === "shared" ? "已沟通" : "已保存草稿"}</Chip></div>
    <div className="flex flex-wrap gap-2">{facts.map(fact => <Chip key={fact} color="soft" variant="caption">{fact}</Chip>)}</div>
    <MotionSwitch transitionKey={busy ? "loading" : "editor"}>{busy ? <AiGenerationPanel title="正在润色沟通稿" steps={["读取事实", "整理表达", "生成可编辑草稿"]}/> : <Textarea label="沟通稿正文" rows={12} value={content} onChange={setContent} hint="编辑会自动保留；点击保存后纳入备份和历史。"/>}</MotionSwitch>
    <div className="grid gap-3 sm:grid-cols-2"><SelectMenu value={channel} onChange={value => setChannel(value as typeof channel)} ariaLabel="沟通渠道" options={channels.map(value => ({ value, label: value }))}/><Textarea label="沟通备注" rows={2} value={note} onChange={setNote}/></div>
    {saved?.sharedAt && <p className="text-caption-1-regular text-text-secondary">上次沟通：{new Date(saved.sharedAt).toLocaleString("zh-CN")} · {saved.channel}</p>}
    <div className="flex flex-wrap gap-2"><Button disabled={busy || !onSave || !content.trim()} onClick={() => save("draft")}><Save className="size-4"/>保存沟通稿</Button><Button variant="secondary" disabled={busy || !onSave || !saved || dirty} onClick={() => save(saved?.deliveryStatus === "shared" ? "draft" : "shared")}>{saved?.deliveryStatus === "shared" ? "恢复为草稿" : "标记已沟通"}</Button><Button variant="secondary" disabled={busy || !content.trim()} onClick={() => void copy()}><Clipboard className="size-4"/>复制</Button><Button variant="ai" disabled={busy} onClick={() => void enhance()}><Sparkles className="size-4"/>AI 润色</Button></div>
    {status && <InlineStatus message={status}/>}
  </div>;
}
