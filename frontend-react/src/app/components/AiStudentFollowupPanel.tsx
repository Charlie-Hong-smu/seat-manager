import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clipboard, FilePlus2, Loader2, MessageSquareText, PlusCircle, Save, Sparkles, Star, Target } from "lucide-react";

import {
  generateStudentFollowup,
  hasStoredAiFollowupAuth,
  readLastStudentFollowup,
  type AiStudentFollowupContext,
  type AiStudentFollowupResult,
} from "../state/aiStudentFollowupService";
import type { AppStudent } from "../state/types";
import { AiGenerationPanel, Button, Checkbox, IconButton, Input, useAppDialog } from "./ui";

interface Props {
  student: AppStudent;
  context?: AiStudentFollowupContext;
  compact?: boolean;
  onSaveRecord?: (note: string) => void;
  onAppendCommentMaterial?: (text: string) => void;
  onCreateTask?: (input: { title: string; description: string }) => void;
}

function getAiErrorMessage(reason: string): string {
  return {
    ai_auth_required: "产品授权已失效，请退出后重新登录。",
    ai_unauthorized: "当前授权未开通 AI 或 AI 已到期。",
    ai_auth_failed: "AI 授权暂时不可用，请稍后重试。",
    ai_file_protocol: "当前是本地文件打开方式，请通过网页地址打开后再使用 AI。",
    ai_offline: "当前离线，联网后可生成跟进建议。",
    ai_payload_too_large: "当前学生资料过多，请减少补充内容后再试。",
    ai_rate_limited: "今日 AI 调用较多，请稍后再试。",
  }[reason] || "AI 跟进建议暂时不可用，请稍后再试。";
}

function joinList(items: string[]): string {
  return items.map(item => item.replace(/^[\d.\s、-]+/, "").trim()).filter(Boolean).join("；");
}

function buildRecordText(result: AiStudentFollowupResult): string {
  const parts = [
    result.summary ? `AI跟进摘要：${result.summary}` : "",
    result.riskSignals.length ? `关注点：${joinList(result.riskSignals)}` : "",
    result.actions.length ? `建议动作：${joinList(result.actions)}` : "",
  ].filter(Boolean);
  return parts.join("\n");
}

export function AiStudentFollowupPanel({
  student,
  context,
  onSaveRecord,
  onAppendCommentMaterial,
  onCreateTask,
}: Props) {
  const appDialog = useAppDialog();
  const [result, setResult] = useState<AiStudentFollowupResult | null>(() => readLastStudentFollowup(student.id));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(() => readLastStudentFollowup(student.id) ? "已恢复上次生成的 AI 跟进建议。" : "AI 会结合成绩、标签、记录、宿舍和座位信息生成跟进建议。");
  const [statusError, setStatusError] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiFollowupAuth());
  const [savedRecord, setSavedRecord] = useState(false);
  const [savedMaterial, setSavedMaterial] = useState(false);
  const [resultVisible, setResultVisible] = useState(() => Boolean(readLastStudentFollowup(student.id)));
  const revealFrame = useRef<number | null>(null);
  const hasResult = Boolean(result);

  useEffect(() => {
    const cached = readLastStudentFollowup(student.id);
    setResult(cached);
    setSavedRecord(false);
    setSavedMaterial(false);
    setResultVisible(Boolean(cached));
    setStatus(cached ? "已恢复上次生成的 AI 跟进建议。" : "AI 会结合成绩、标签、记录、宿舍和座位信息生成跟进建议。");
    setStatusError(false);
    return () => {
      if (revealFrame.current !== null) window.cancelAnimationFrame(revealFrame.current);
    };
  }, [student.id]);
  const materialText = useMemo(() => {
    if (!result) {
      return "";
    }
    const parts = [
      ...result.strengths.map(item => `可表扬：${item}`),
      ...result.riskSignals.map(item => `待改进：${item}`),
      ...result.commentMaterials,
    ];
    return Array.from(new Set(parts.map(item => item.trim()).filter(Boolean))).join("\n");
  }, [result]);

  async function handleGenerate(force = true) {
    if (revealFrame.current !== null) window.cancelAnimationFrame(revealFrame.current);
    setResultVisible(false);
    setBusy(true);
    setSavedRecord(false);
    setSavedMaterial(false);
    setStatus(`正在为 ${student.name} 生成跟进建议...`);
    setStatusError(false);
    try {
      const next = await generateStudentFollowup(student, context || {}, {
        accessCode,
        remember: rememberAuth,
        force,
      });
      setResult(next);
      setAccessCode("");
      setHasAuth(true);
      setStatus(next.disclaimer);
      setStatusError(false);
      setBusy(false);
      revealFrame.current = window.requestAnimationFrame(() => {
        revealFrame.current = window.requestAnimationFrame(() => {
          setResultVisible(true);
          revealFrame.current = null;
        });
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setStatus(getAiErrorMessage(reason));
      setStatusError(true);
      setHasAuth(hasStoredAiFollowupAuth());
      setBusy(false);
      setResultVisible(Boolean(result));
    }
  }

  function copyParentDraft() {
    if (!result?.parentMessageDraft) {
      return;
    }
    navigator.clipboard.writeText(result.parentMessageDraft).then(() => {
      setStatus("家校沟通草稿已复制。");
      setStatusError(false);
    }).catch(() => {});
  }

  async function saveRecord() {
    if (!result || !onSaveRecord) {
      return;
    }
    const text = buildRecordText(result);
    if (!text.trim()) {
      return;
    }
    if (!await appDialog.confirm({ title: "存入学生记录？", description: `将把这条 AI 跟进摘要写入 ${student.name} 的学生记录。AI 内容仍应由教师确认后使用。`, confirmLabel: "确认存入", variant: "primary" })) {
      return;
    }
    onSaveRecord(text);
    setSavedRecord(true);
    setStatus("已保存到学生记录。");
    setStatusError(false);
  }

  async function appendMaterial() {
    if (!materialText || !onAppendCommentMaterial) {
      return;
    }
    if (!await appDialog.confirm({ title: "加入评语补充说明？", description: `将把 AI 提炼的内容加入 ${student.name} 的评语补充说明，之后仍可继续编辑。`, confirmLabel: "确认加入", variant: "primary" })) {
      return;
    }
    onAppendCommentMaterial(materialText);
    setSavedMaterial(true);
    setStatus("已加入评语补充说明。");
    setStatusError(false);
  }

  async function createTask() {
    if (!result || !onCreateTask) return;
    const title = result.actions[0] || result.summary || `跟进 ${student.name}`;
    if (!await appDialog.confirm({ title: "转为待办任务？", description: `将根据这条 AI 建议为 ${student.name} 预填待办任务，请在下一步确认日期和内容。`, confirmLabel: "继续填写", variant: "primary" })) return;
    onCreateTask({ title: title.slice(0, 80), description: buildRecordText(result).slice(0, 800) });
    setStatus("已打开待办任务表单，请确认内容后创建。");
    setStatusError(false);
  }

  return <>
    <section className="surface-enter overflow-hidden rounded-2xl border border-[var(--app-border)] bg-background-primary-default shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-separator-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 shrink-0 text-status-ai-500" />
          <div className="min-w-0">
            <h3 className="truncate text-body-semibold text-text-primary">AI 跟进建议</h3>
            <p className="mt-0.5 truncate text-caption-1-regular text-text-tertiary">{student.name} · 关注、沟通、评语素材</p>
          </div>
        </div>
        <Button variant="ai" size="sm" onClick={() => void handleGenerate(true)} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Sparkles className="h-4 w-4" />}
          {hasResult ? "重新生成" : "生成"}
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {!hasAuth && (
          <div className="flex items-end gap-3 rounded-[var(--app-radius-sm)] bg-background-secondary-default p-3">
            <div className="min-w-0 flex-1"><Input type="password" label="AI 授权码" value={accessCode} onChange={setAccessCode} placeholder="输入授权码" /></div>
            <Checkbox isSelected={rememberAuth} onChange={setRememberAuth}>记住</Checkbox>
          </div>
        )}

        {busy && <AiGenerationPanel title="正在生成学生跟进建议" steps={["整理学生表现", "提炼关注重点", "形成跟进建议"]} />}

        {!busy && !result && (
          <div className="grid place-items-center rounded-[var(--app-radius-md)] border border-dashed border-[var(--app-border)] px-4 py-8 text-center">
            <p className="max-w-sm text-body-regular leading-6 text-text-secondary">生成后会给出可保存的跟进记录、可复制的家校沟通草稿，以及可加入评语工作台的素材。</p>
          </div>
        )}

        <div aria-hidden={!result || busy || !resultVisible} inert={!result || busy || !resultVisible ? true : undefined} className={`grid transition-[grid-template-rows,opacity,transform] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${result && !busy && resultVisible ? "grid-rows-[1fr] translate-y-0 opacity-100" : "grid-rows-[0fr] -translate-y-1 opacity-0"}`}>
          <div className="overflow-hidden">
          {result && <div className="divide-y divide-separator-border pb-0.5">
            <div className="pb-3">
              <div className="mb-1 flex items-center gap-1.5 text-caption-1-semibold text-text-tertiary">
                <Target className="h-3.5 w-3.5" />近期判断
              </div>
              <p className="text-body-regular leading-6 text-text-primary">{result.summary || "资料较少，建议先补充课堂观察和近期记录。"}</p>
            </div>

            <div className="grid gap-4 py-3 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-caption-1-semibold text-text-tertiary">
                  <AlertTriangle className={`h-3.5 w-3.5 ${result.riskSignals.length ? "text-status-warning-500" : ""}`} />关注点
                </div>
                <ul className="space-y-1.5">
                  {(result.riskSignals.length ? result.riskSignals : ["暂未发现明确风险，建议继续观察。"]).map(item => (
                    <li key={item} className="flex gap-1.5 text-caption-1-regular leading-5 text-text-secondary"><span aria-hidden="true" className={result.riskSignals.length ? "text-status-warning-500" : "text-text-tertiary"}>•</span><span className="min-w-0">{item}</span></li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-caption-1-semibold text-text-tertiary">
                  <Star className="h-3.5 w-3.5 text-status-success-500" />可表扬
                </div>
                <ul className="space-y-1.5">
                  {(result.strengths.length ? result.strengths : ["可补充课堂表现后再提炼亮点。"]).map(item => (
                    <li key={item} className="flex gap-1.5 text-caption-1-regular leading-5 text-text-secondary"><span aria-hidden="true" className={result.strengths.length ? "text-status-success-500" : "text-text-tertiary"}>•</span><span className="min-w-0">{item}</span></li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="py-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-caption-1-semibold text-text-tertiary">
                <PlusCircle className="h-3.5 w-3.5" />下一步动作
              </div>
              <ol className="grid gap-2">
                {result.actions.map((item, index) => (
                  <li key={`${index}-${item}`} className="flex gap-2.5 text-body-regular leading-6 text-text-primary">
                    <span className="grid h-5 w-5 shrink-0 translate-y-0.5 place-items-center rounded-full bg-background-tertiary-default text-[11px] font-semibold text-text-secondary">{index + 1}</span>
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
              </ol>
            </div>

            {result.parentMessageDraft && (
              <div className="py-3">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-caption-1-semibold text-text-tertiary">
                    <MessageSquareText className="h-3.5 w-3.5" />家校沟通草稿
                  </div>
                  <IconButton label="复制家校沟通草稿" size="xs" variant="ghost" onClick={copyParentDraft}><Clipboard className="h-3.5 w-3.5" /></IconButton>
                </div>
                <p className="text-body-regular leading-6 text-text-primary">{result.parentMessageDraft}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-3">
              <Button variant="secondary" size="sm" onClick={saveRecord} disabled={!onSaveRecord || savedRecord}>
                {savedRecord ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {savedRecord ? "已存记录" : "存入学生记录"}
              </Button>
              <Button variant="secondary" size="sm" onClick={appendMaterial} disabled={!onAppendCommentMaterial || !materialText || savedMaterial}>
                {savedMaterial ? <Check className="h-4 w-4" /> : <FilePlus2 className="h-4 w-4" />}
                {savedMaterial ? "已加入说明" : "加入评语补充说明"}
              </Button>
              {onCreateTask && <Button variant="ghost" size="sm" onClick={createTask}><PlusCircle className="h-4 w-4" />转为待办任务</Button>}
            </div>
          </div>}
          </div>
        </div>

        <p className={`text-caption-1-regular leading-5 ${statusError ? "text-status-danger-600" : "text-text-tertiary"}`} aria-live="polite">{status}</p>
      </div>
    </section>
    {appDialog.dialog}
  </>;
}
