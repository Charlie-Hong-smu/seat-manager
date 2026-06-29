import { useEffect, useState } from "react";
import { Copy, Save, Sparkles, X } from "lucide-react";

import { generateStudentAiComment, hasStoredAiAuth } from "../state/aiCommentService";
import { readStudentCommentDraft, saveStudentCommentDraft } from "../state/commentStorage";
import {
  readCommentRubric,
  readStudentCommentProfile,
  saveStudentCommentProfile,
  summarizeCommentProfile,
} from "../state/commentRubricStorage";
import type { AppStudent, CommentCriterion, StudentCommentProfile } from "../state/types";

interface AiCommentDrawerProps {
  open: boolean;
  student: AppStudent;
  onClose: () => void;
}

export function AiCommentDrawer({ open, student, onClose }: AiCommentDrawerProps) {
  const [draftState, setDraftState] = useState(() => readStudentCommentDraft(student));
  const [rubric] = useState(() => readCommentRubric());
  const [commentProfile, setCommentProfile] = useState<StudentCommentProfile>(() => readStudentCommentProfile(student));
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiAuth());
  const [status, setStatus] = useState("请核对素材，可补充课堂表现后生成。");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDraftState(readStudentCommentDraft(student));
    setCommentProfile(readStudentCommentProfile(student));
    setHasAuth(hasStoredAiAuth());
    setStatus("请核对素材，可补充课堂表现后生成。");
  }, [student]);

  if (!open) {
    return null;
  }

  async function handleGenerate() {
    setBusy(true);
    setStatus("正在生成评语...");
    try {
      const summary = summarizeCommentProfile(rubric, commentProfile);
      const result = await generateStudentAiComment(student, {
        ...draftState,
        teacherNote: commentProfile.teacherNote || draftState.teacherNote,
        style: commentProfile.style,
        lengthMode: commentProfile.lengthMode,
        targetWordCount: commentProfile.targetWordCount,
        criteriaSummary: summary.criteriaSummary,
        customOptions: summary.customOptions,
      }, {
        accessCode,
        remember: rememberAuth,
        force: true,
      });
      if (!result.comment) {
        setStatus(result.missingInfo?.length ? `需要补充：${result.missingInfo.join("、")}` : "信息不足，暂未生成评语。");
        return;
      }
      const saved = saveStudentCommentDraft(student.id, { ...draftState, generatedComment: result.comment });
      setDraftState(saved);
      setAccessCode("");
      setHasAuth(true);
      setStatus(result.needsMoreInfo ? "已生成，但建议继续补充素材后再润色。" : "已生成，可继续编辑或复制。");
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      const message = {
        ai_auth_required: "请输入 AI 授权码后再生成。",
        ai_unauthorized: "当前授权未开通 AI 或 AI 已到期。",
        ai_auth_failed: "AI 授权暂时不可用，请稍后重试。",
        ai_file_protocol: "当前是本地文件打开方式，请通过网页地址打开后再使用 AI。",
        ai_offline: "当前离线，联网后可生成评语。",
        ai_payload_too_large: "当前素材过多，请减少补充内容后再试。",
        ai_rate_limited: "今日 AI 调用较多，请稍后再试。",
      }[reason] || "AI 评语暂时不可用，请稍后重试。";
      setStatus(message);
      setHasAuth(hasStoredAiAuth());
    } finally {
      setBusy(false);
    }
  }

  function updateProfile(patch: Partial<StudentCommentProfile>) {
    setCommentProfile(current => {
      const next = saveStudentCommentProfile(student.id, rubric, {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      setDraftState(prev => ({
        ...prev,
        teacherNote: next.teacherNote,
        style: next.style,
        lengthMode: next.lengthMode,
        targetWordCount: next.targetWordCount,
      }));
      return next;
    });
    setStatus("评语素材已更新。");
  }

  function toggleCriterionOption(criterion: CommentCriterion, optionId: string) {
    const current = new Set(commentProfile.criteriaValues[criterion.id] || []);
    if (current.has(optionId)) {
      current.delete(optionId);
    } else if (criterion.type === "single") {
      current.clear();
      current.add(optionId);
    } else {
      current.add(optionId);
    }
    updateProfile({
      criteriaValues: {
        ...commentProfile.criteriaValues,
        [criterion.id]: [...current],
      },
    });
  }

  const selectedCount = summarizeCommentProfile(rubric, commentProfile).criteriaSummary.reduce((total, item) => total + item.values.length, 0);
  const lengthModes = [
    { value: "short", label: "80～100 字" },
    { value: "standard", label: "100～150 字" },
    { value: "long", label: "150～200 字" },
  ] as const;
  const styles = [
    { value: "warm", label: "温和鼓励" },
    { value: "formal", label: "客观正式" },
    { value: "brief", label: "简洁家长会" },
  ] as const;

  return (
    <div className="fixed inset-y-0 right-0 z-[60] w-full max-w-md bg-white border-l border-gray-100 shadow-2xl flex flex-col">
      <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-violet-500 mb-0.5" style={{ fontWeight: 700 }}>AI 期末评语</div>
          <h3 className="text-gray-900" style={{ fontSize: "1rem", fontWeight: 800 }}>{student.name}</h3>
        </div>
        <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
          <div className="text-xs text-gray-500 mb-2" style={{ fontWeight: 700 }}>学生标签</div>
          <div className="flex flex-wrap gap-1.5">
            {[...student.academicTags, ...student.tags].slice(0, 8).map(tag => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full border border-gray-100 bg-white text-gray-600" style={{ fontWeight: 600 }}>
                {tag}
              </span>
            ))}
            {student.academicTags.length === 0 && student.tags.length === 0 && (
              <span className="text-sm text-gray-400">暂无标签</span>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <div className="text-sm text-gray-800" style={{ fontWeight: 800 }}>评语标准选择</div>
              <div className="text-xs text-gray-400 mt-0.5">已选 {selectedCount} 项</div>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {rubric.criteria.filter(criterion => !criterion.hidden).map(criterion => {
              const selected = new Set(commentProfile.criteriaValues[criterion.id] || []);
              return (
                <div key={criterion.id} className="px-4 py-3">
                  <div className="mb-2 text-xs text-gray-500" style={{ fontWeight: 800 }}>{criterion.label}</div>
                  <div className="flex flex-wrap gap-2">
                    {criterion.options.map(option => (
                      <button
                        key={option.id}
                        onClick={() => toggleCriterionOption(criterion, option.id)}
                        className={`h-8 rounded-full border px-3 text-xs transition-colors ${
                          selected.has(option.id)
                            ? "border-violet-200 bg-violet-50 text-violet-700"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                        style={{ fontWeight: 700 }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <label className="block">
          <span className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 700 }}>教师补充</span>
          <textarea
            value={commentProfile.teacherNote}
            onChange={event => updateProfile({ teacherNote: event.target.value })}
            rows={4}
            className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-violet-300 resize-none"
            placeholder="补充学生近期表现、性格特点或需要强调的进步点。"
          />
        </label>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 space-y-3">
          <div>
            <span className="block text-xs text-gray-500 mb-2" style={{ fontWeight: 700 }}>字数目标</span>
            <div className="flex flex-wrap gap-2">
              {lengthModes.map(mode => (
                <button
                  key={mode.value}
                  onClick={() => updateProfile({ lengthMode: mode.value, targetWordCount: mode.value === "short" ? 90 : mode.value === "long" ? 180 : 120 })}
                  className={`h-8 rounded-full border px-3 text-xs ${commentProfile.lengthMode === mode.value ? "border-violet-200 bg-violet-50 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                  style={{ fontWeight: 700 }}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className="block text-xs text-gray-500 mb-2" style={{ fontWeight: 700 }}>评语风格</span>
            <div className="flex flex-wrap gap-2">
              {styles.map(style => (
                <button
                  key={style.value}
                  onClick={() => updateProfile({ style: style.value })}
                  className={`h-8 rounded-full border px-3 text-xs ${commentProfile.style === style.value ? "border-violet-200 bg-violet-50 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                  style={{ fontWeight: 700 }}
                >
                  {style.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {!hasAuth && (
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
            <div className="text-xs text-violet-600 mb-2" style={{ fontWeight: 700 }}>AI 授权</div>
            <input
              type="password"
              value={accessCode}
              onChange={event => setAccessCode(event.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-violet-100 rounded-xl outline-none focus:border-violet-300"
              placeholder="输入 AI 授权码"
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-violet-700 cursor-pointer">
              <input type="checkbox" checked={rememberAuth} onChange={event => setRememberAuth(event.target.checked)} className="accent-violet-600" />
              记住授权 30 天
            </label>
          </div>
        )}

        <label className="block">
          <span className="block text-xs text-gray-500 mb-1.5" style={{ fontWeight: 700 }}>评语草稿</span>
          <textarea
            rows={9}
            value={draftState.generatedComment}
            onChange={event => setDraftState(prev => ({ ...prev, generatedComment: event.target.value }))}
            className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-violet-300 resize-none"
            placeholder="在这里编辑当前学生的评语草稿。"
          />
        </label>

        <p className="text-sm text-violet-600">{status}</p>
      </div>

      <div className="shrink-0 border-t border-gray-100 p-4 flex gap-2">
        <button
          disabled={busy}
          onClick={handleGenerate}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-violet-600 text-white text-sm hover:bg-violet-700 disabled:opacity-60"
          style={{ fontWeight: 700 }}
        >
          <Sparkles className="w-4 h-4" />{busy ? "生成中" : "生成评语"}
        </button>
        <button
          onClick={() => {
            setDraftState(prev => saveStudentCommentDraft(student.id, prev));
          }}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          <Save className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            if (draftState.generatedComment) navigator.clipboard.writeText(draftState.generatedComment).catch(() => {});
          }}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          <Copy className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
