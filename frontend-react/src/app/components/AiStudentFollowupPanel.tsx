import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Clipboard, Loader2, MessageSquareText, PlusCircle, Save, Sparkles, Star, Target } from "lucide-react";

import {
  generateStudentFollowup,
  hasStoredAiFollowupAuth,
  readLastStudentFollowup,
  type AiStudentFollowupContext,
  type AiStudentFollowupResult,
} from "../state/aiStudentFollowupService";
import type { AppStudent } from "../state/types";

interface Props {
  student: AppStudent;
  context?: AiStudentFollowupContext;
  compact?: boolean;
  onSaveRecord?: (note: string) => void;
  onAppendCommentMaterial?: (text: string) => void;
}

function getAiErrorMessage(reason: string): string {
  return {
    ai_auth_required: "请输入 AI 授权码后再生成。",
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
  compact = false,
  onSaveRecord,
  onAppendCommentMaterial,
}: Props) {
  const [result, setResult] = useState<AiStudentFollowupResult | null>(() => readLastStudentFollowup(student.id));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(() => readLastStudentFollowup(student.id) ? "已恢复上次生成的 AI 跟进建议。" : "AI 会结合成绩、标签、记录、宿舍和座位信息生成跟进建议。");
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiFollowupAuth());
  const [savedRecord, setSavedRecord] = useState(false);
  const [savedMaterial, setSavedMaterial] = useState(false);
  const hasResult = Boolean(result);

  useEffect(() => {
    const cached = readLastStudentFollowup(student.id);
    setResult(cached);
    setSavedRecord(false);
    setSavedMaterial(false);
    setStatus(cached ? "已恢复上次生成的 AI 跟进建议。" : "AI 会结合成绩、标签、记录、宿舍和座位信息生成跟进建议。");
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
    setBusy(true);
    setSavedRecord(false);
    setSavedMaterial(false);
    setStatus(`正在为 ${student.name} 生成跟进建议...`);
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
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setStatus(getAiErrorMessage(reason));
      setHasAuth(hasStoredAiFollowupAuth());
    } finally {
      setBusy(false);
    }
  }

  function copyParentDraft() {
    if (!result?.parentMessageDraft) {
      return;
    }
    navigator.clipboard.writeText(result.parentMessageDraft).then(() => {
      setStatus("家校沟通草稿已复制。");
    }).catch(() => {});
  }

  function saveRecord() {
    if (!result || !onSaveRecord) {
      return;
    }
    const text = buildRecordText(result);
    if (!text.trim()) {
      return;
    }
    if (!window.confirm(`把这条 AI 跟进摘要保存到 ${student.name} 的学生记录？`)) {
      return;
    }
    onSaveRecord(text);
    setSavedRecord(true);
    setStatus("已保存到学生记录。");
  }

  function appendMaterial() {
    if (!materialText || !onAppendCommentMaterial) {
      return;
    }
    if (!window.confirm(`把 AI 提炼的评语素材加入 ${student.name} 的补充说明？`)) {
      return;
    }
    onAppendCommentMaterial(materialText);
    setSavedMaterial(true);
    setStatus("已加入评语素材。");
  }

  return (
    <section className={`surface-enter overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-sm ${compact ? "" : "shadow-violet-100/40"}`}>
      <div className="flex items-start justify-between gap-3 border-b border-violet-50 bg-violet-50/50 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-600 text-white">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm text-gray-900" style={{ fontWeight: 900 }}>AI 跟进建议</h3>
              <p className="mt-0.5 truncate text-xs text-violet-500">{student.name} · 关注、沟通、评语素材</p>
            </div>
          </div>
        </div>
        <button
          onClick={() => void handleGenerate(true)}
          disabled={busy}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-3 text-sm text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
          style={{ fontWeight: 800 }}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {hasResult ? "重新生成" : "生成"}
        </button>
      </div>

      <div className="space-y-4 p-4">
        {!hasAuth && (
          <div className="flex items-center gap-2 rounded-2xl bg-violet-50 p-3">
            <input
              type="password"
              value={accessCode}
              onChange={event => setAccessCode(event.target.value)}
              placeholder="AI 授权码"
              className="h-9 min-w-0 flex-1 rounded-xl border border-violet-100 bg-white px-3 text-sm outline-none focus:border-violet-300"
            />
            <label className="flex shrink-0 items-center gap-1 text-xs text-violet-700">
              <input type="checkbox" checked={rememberAuth} onChange={event => setRememberAuth(event.target.checked)} className="accent-violet-600" />
              记住
            </label>
          </div>
        )}

        {result ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500" style={{ fontWeight: 900 }}>
                <Target className="h-3.5 w-3.5 text-violet-500" />近期判断
              </div>
              <p className="text-sm leading-6 text-gray-700">{result.summary || "资料较少，建议先补充课堂观察和近期记录。"}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-red-100 bg-red-50/60 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs text-red-500" style={{ fontWeight: 900 }}>
                  <AlertTriangle className="h-3.5 w-3.5" />关注点
                </div>
                <div className="space-y-1.5">
                  {(result.riskSignals.length ? result.riskSignals : ["暂未发现明确风险，建议继续观察。"]).map(item => (
                    <div key={item} className="rounded-xl bg-white/70 px-2.5 py-1.5 text-xs leading-5 text-red-700">{item}</div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs text-emerald-600" style={{ fontWeight: 900 }}>
                  <Star className="h-3.5 w-3.5" />可表扬
                </div>
                <div className="space-y-1.5">
                  {(result.strengths.length ? result.strengths : ["可补充课堂表现后再提炼亮点。"]).map(item => (
                    <div key={item} className="rounded-xl bg-white/70 px-2.5 py-1.5 text-xs leading-5 text-emerald-700">{item}</div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-blue-600" style={{ fontWeight: 900 }}>
                <PlusCircle className="h-3.5 w-3.5" />下一步动作
              </div>
              <div className="grid gap-2">
                {result.actions.map((item, index) => (
                  <div key={`${index}-${item}`} className="flex gap-2 rounded-xl bg-white px-3 py-2 text-sm leading-6 text-gray-700 shadow-sm shadow-blue-100/40">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-600 text-xs text-white" style={{ fontWeight: 900 }}>{index + 1}</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {result.parentMessageDraft && (
              <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500" style={{ fontWeight: 900 }}>
                    <MessageSquareText className="h-3.5 w-3.5 text-violet-500" />家校沟通草稿
                  </div>
                  <button onClick={copyParentDraft} className="flex h-7 items-center gap-1 rounded-lg bg-gray-100 px-2.5 text-xs text-gray-600 hover:bg-gray-200" style={{ fontWeight: 800 }}>
                    <Clipboard className="h-3.5 w-3.5" />复制
                  </button>
                </div>
                <p className="text-sm leading-6 text-gray-700">{result.parentMessageDraft}</p>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={saveRecord}
                disabled={!onSaveRecord || savedRecord}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-gray-900 text-sm text-white transition-colors hover:bg-black disabled:bg-gray-100 disabled:text-gray-400"
                style={{ fontWeight: 850 }}
              >
                {savedRecord ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                {savedRecord ? "已存记录" : "保存为跟进记录"}
              </button>
              <button
                onClick={appendMaterial}
                disabled={!onAppendCommentMaterial || !materialText || savedMaterial}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-violet-600 text-sm text-white transition-colors hover:bg-violet-700 disabled:bg-gray-100 disabled:text-gray-400"
                style={{ fontWeight: 850 }}
              >
                {savedMaterial ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                {savedMaterial ? "已加素材" : "加入评语素材"}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid place-items-center rounded-2xl border border-dashed border-violet-100 bg-violet-50/40 px-4 py-8 text-center">
            <div className="max-w-sm">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-violet-600 shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm leading-6 text-gray-500">生成后会给出可保存的跟进记录、可复制的家校沟通草稿，以及可加入评语工作台的素材。</p>
            </div>
          </div>
        )}

        <p className="text-xs leading-5 text-violet-600">{status}</p>
      </div>
    </section>
  );
}
