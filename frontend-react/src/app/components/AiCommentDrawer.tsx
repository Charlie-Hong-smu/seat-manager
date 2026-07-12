import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Plus, Save, Sparkles, X } from "lucide-react";

import { generateStudentAiComment, hasStoredAiAuth } from "../state/aiCommentService";
import { readStudentCommentDraft, saveStudentCommentDraft } from "../state/commentStorage";
import { readCommentRubric, readStudentCommentProfile, saveStudentCommentProfile, summarizeCommentProfile } from "../state/commentRubricStorage";
import type { AppStudent, CommentCriterion, StudentCommentProfile } from "../state/types";
import {
  addCommentCustomOption,
  buildStudentCommentDraft,
  clampCommentWordCount,
  COMMENT_LENGTH_MODES,
  COMMENT_STYLES,
  removeCommentCustomOption,
  resolveCommentWordCount,
  toggleCommentCriterion,
} from "./commentEditor";
import { AiGenerationPanel, Button, SegmentedControl, ToolDrawer, useAppDialog } from "./ui";

interface AiCommentDrawerProps {
  open: boolean;
  student: AppStudent;
  onClose: () => void;
}

type GenerationPhase = "idle" | "loading" | "revealing";

function getAiErrorMessage(reason: string): string {
  return {
    ai_auth_required: "请输入 AI 授权码后再生成。",
    ai_unauthorized: "当前授权未开通 AI 或 AI 已到期。",
    ai_auth_failed: "AI 授权暂时不可用，请稍后重试。",
    ai_file_protocol: "当前是本地文件打开方式，请通过网页地址打开后再使用 AI。",
    ai_offline: "当前离线，联网后可生成评语。",
    ai_payload_too_large: "当前素材过多，请减少补充内容后再试。",
    ai_rate_limited: "今日 AI 调用较多，请稍后再试。",
  }[reason] || "AI 评语暂时不可用，请稍后重试。";
}

export function AiCommentDrawer({ open, student, onClose }: AiCommentDrawerProps) {
  const appDialog = useAppDialog();
  const rubric = useMemo(() => readCommentRubric(), []);
  const [draftState, setDraftState] = useState(() => readStudentCommentDraft(student));
  const [savedText, setSavedText] = useState(() => readStudentCommentDraft(student).generatedComment);
  const [commentProfile, setCommentProfile] = useState<StudentCommentProfile>(() => readStudentCommentProfile(student));
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiAuth());
  const [status, setStatus] = useState("请核对素材，可补充课堂表现后生成。");
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [customCriterionId, setCustomCriterionId] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const revealFrame = useRef<number | null>(null);

  useEffect(() => {
    const draft = readStudentCommentDraft(student);
    setDraftState(draft);
    setSavedText(draft.generatedComment);
    setCommentProfile(readStudentCommentProfile(student));
    setHasAuth(hasStoredAiAuth());
    setAccessCode("");
    setStatus("请核对素材，可补充课堂表现后生成。");
    setPhase("idle");
    setCustomCriterionId("");
    setCustomLabel("");
    if (revealFrame.current !== null) window.cancelAnimationFrame(revealFrame.current);
  }, [student]);

  useEffect(() => () => {
    if (revealFrame.current !== null) window.cancelAnimationFrame(revealFrame.current);
  }, []);

  const summary = summarizeCommentProfile(rubric, commentProfile);
  const selectedCount = summary.criteriaSummary.reduce((total, item) => total + item.values.length, 0);
  const customCount = summary.customOptions.length;
  const visibleTags = [...student.academicTags, ...student.tags].filter(tag => !tag.startsWith("comment_")).slice(0, 8);
  const dirty = draftState.generatedComment !== savedText;

  function persistProfile(next: StudentCommentProfile): StudentCommentProfile {
    const saved = saveStudentCommentProfile(student.id, rubric, next);
    setCommentProfile(saved);
    return saved;
  }

  function updateProfile(patch: Partial<StudentCommentProfile>) {
    const next = persistProfile({
      ...commentProfile,
      ...patch,
      targetWordCount: patch.lengthMode
        ? resolveCommentWordCount(patch.lengthMode, patch.targetWordCount ?? commentProfile.targetWordCount)
        : patch.targetWordCount ?? commentProfile.targetWordCount,
      status: commentProfile.generatedComment ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    });
    setDraftState(current => ({
      ...current,
      teacherNote: next.teacherNote,
      style: next.style,
      lengthMode: next.lengthMode,
      targetWordCount: next.targetWordCount,
    }));
    setStatus("评语素材已更新。");
  }

  function updateProfileWith(transform: (profile: StudentCommentProfile) => StudentCommentProfile) {
    persistProfile(transform(commentProfile));
    setStatus("评语素材已更新。");
  }

  function revealComment(text: string) {
    if (revealFrame.current !== null) window.cancelAnimationFrame(revealFrame.current);
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDraftState(current => ({ ...current, generatedComment: text }));
      setPhase("idle");
      return;
    }
    setPhase("revealing");
    setDraftState(current => ({ ...current, generatedComment: "" }));
    const startedAt = window.performance.now();
    const duration = Math.min(1500, Math.max(520, text.length * 8));
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const visibleLength = Math.min(text.length, Math.max(1, Math.ceil(text.length * (1 - Math.pow(1 - progress, 2.4)))));
      setDraftState(current => ({ ...current, generatedComment: text.slice(0, visibleLength) }));
      if (progress < 1) revealFrame.current = window.requestAnimationFrame(tick);
      else {
        revealFrame.current = null;
        setDraftState(current => ({ ...current, generatedComment: text }));
        setPhase("idle");
      }
    };
    revealFrame.current = window.requestAnimationFrame(tick);
  }

  async function handleGenerate() {
    if (phase !== "idle") return;
    const previousText = draftState.generatedComment;
    setPhase("loading");
    setStatus(`正在生成 ${student.name} 的评语...`);
    try {
      const requestDraft = buildStudentCommentDraft(rubric, commentProfile, previousText);
      const result = await generateStudentAiComment(student, requestDraft, { accessCode, remember: rememberAuth, force: true });
      if (!result.comment) {
        setStatus(result.missingInfo?.length ? `需要补充：${result.missingInfo.join("、")}` : "信息不足，暂未生成评语。");
        setPhase("idle");
        return;
      }
      const savedProfile = persistProfile({ ...commentProfile, generatedComment: result.comment, status: "generated", updatedAt: new Date().toISOString() });
      const savedDraft = saveStudentCommentDraft(student.id, buildStudentCommentDraft(rubric, savedProfile, result.comment));
      setSavedText(savedDraft.generatedComment);
      setAccessCode("");
      setHasAuth(true);
      setStatus(result.needsMoreInfo ? "已生成，但建议继续补充素材后再润色。" : "已生成并保存，可继续编辑。 ");
      revealComment(result.comment);
    } catch (error) {
      setDraftState(current => ({ ...current, generatedComment: previousText }));
      setStatus(getAiErrorMessage(error instanceof Error ? error.message : ""));
      setHasAuth(hasStoredAiAuth());
      setPhase("idle");
    }
  }

  function handleSave() {
    const savedProfile = persistProfile({
      ...commentProfile,
      generatedComment: draftState.generatedComment,
      status: draftState.generatedComment.trim() ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    });
    const saved = saveStudentCommentDraft(student.id, buildStudentCommentDraft(rubric, savedProfile, draftState.generatedComment));
    setDraftState(saved);
    setSavedText(saved.generatedComment);
    setStatus("评语草稿已保存。");
  }

  async function handleCopy() {
    if (!draftState.generatedComment) {
      setStatus("暂无可复制的评语草稿。");
      return;
    }
    try {
      await navigator.clipboard.writeText(draftState.generatedComment);
      setStatus("评语已复制到剪贴板。");
    } catch {
      setStatus("复制失败，请选中评语后手动复制。");
    }
  }

  async function requestClose() {
    if (dirty) {
      const confirmed = await appDialog.confirm({
        title: "放弃未保存的修改？",
        description: `关闭后，${student.name} 当前手动修改的评语草稿不会保留。`,
        confirmLabel: "放弃修改",
        variant: "danger",
      });
      if (!confirmed) return;
    }
    onClose();
  }

  function submitCustomOption(criterion: CommentCriterion) {
    if (!customLabel.trim()) return;
    updateProfileWith(profile => addCommentCustomOption(profile, criterion, customLabel));
    setCustomLabel("");
    setCustomCriterionId("");
  }

  const footer = <div className="flex gap-2">
    <Button disabled={phase !== "idle"} onClick={handleGenerate} className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300">
      <Sparkles className="h-4 w-4" />{phase === "idle" ? (savedText ? "重新生成" : "生成评语") : "生成中"}
    </Button>
    <Button variant="ghost" disabled={!dirty || phase !== "idle"} onClick={handleSave} aria-label="保存评语草稿"><Save className="h-4 w-4" /></Button>
    <Button variant="ghost" disabled={!draftState.generatedComment || phase !== "idle"} onClick={() => void handleCopy()} aria-label="复制评语"><Copy className="h-4 w-4" /></Button>
  </div>;

  return <>
    <ToolDrawer open={open} title={`AI 期末评语 · ${student.name}`} onClose={() => void requestClose()} widthClassName="w-[420px]" bodyClassName="p-4" positionClassName="fixed" backdropLayerClassName="z-[70]" panelLayerClassName="z-[80]" footer={footer}>
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white">
          <button type="button" aria-expanded={materialsOpen} onClick={() => setMaterialsOpen(value => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500/30">
            <span><strong className="block text-sm text-gray-800">评语素材</strong><span className="mt-0.5 block text-xs text-gray-400">预设 {selectedCount} 项 · 自定义 {customCount} 项 · 学生标签 {visibleTags.length} 项</span></span>
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${materialsOpen ? "rotate-180" : ""}`} />
          </button>
          <div aria-hidden={!materialsOpen} inert={!materialsOpen} className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none ${materialsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden"><div className="space-y-4 border-t border-gray-100 p-4">
              <div><div className="mb-2 text-xs font-bold text-gray-500">学生标签（只读参考）</div><div className="flex flex-wrap gap-1.5">{visibleTags.length ? visibleTags.map(tag => <span key={tag} className="rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1 text-xs font-semibold text-gray-600">{tag}</span>) : <span className="text-xs text-gray-400">暂无标签</span>}</div></div>
              {rubric.criteria.filter(criterion => !criterion.hidden).map(criterion => {
                const selected = new Set(commentProfile.criteriaValues[criterion.id] || []);
                const customOptions = commentProfile.customOptions[criterion.id] || [];
                return <div key={criterion.id}>
                  <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-gray-500">{criterion.label}</span><button type="button" onClick={() => { setCustomCriterionId(criterion.id); setCustomLabel(""); }} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50"><Plus className="h-3.5 w-3.5" />自定义</button></div>
                  <div className="flex flex-wrap gap-2">
                    {criterion.options.map(option => <button key={option.id} type="button" onClick={() => updateProfileWith(profile => toggleCommentCriterion(profile, criterion, option.id))} className={`h-8 rounded-full border px-3 text-xs font-semibold transition-colors ${selected.has(option.id) ? "border-violet-200 bg-violet-50 text-violet-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>{option.label}</button>)}
                    {customOptions.map(option => <button key={option.id} type="button" title="点击移除自定义素材" onClick={() => updateProfileWith(profile => removeCommentCustomOption(profile, criterion.id, option.id))} className="inline-flex h-8 items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">{option.label}<X className="h-3 w-3" /></button>)}
                  </div>
                  {customCriterionId === criterion.id && <div className="mt-2 flex gap-2"><input autoFocus value={customLabel} onChange={event => setCustomLabel(event.target.value)} onKeyDown={event => { if (event.key === "Enter") submitCustomOption(criterion); if (event.key === "Escape") setCustomCriterionId(""); }} maxLength={30} placeholder={`补充${criterion.label}素材`} className="h-9 min-w-0 flex-1 rounded-[var(--app-radius-sm)] border border-gray-200 px-3 text-sm outline-none focus:border-blue-300"/><Button size="sm" onClick={() => submitCustomOption(criterion)}>添加</Button></div>}
                </div>;
              })}
            </div></div>
          </div>
        </section>

        <label className="block"><span className="mb-1.5 block text-xs font-bold text-gray-500">教师补充</span><textarea value={commentProfile.teacherNote} onChange={event => updateProfile({ teacherNote: event.target.value })} rows={3} className="w-full resize-none rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm outline-none focus:border-violet-300 focus:bg-white" placeholder="补充学生近期表现、性格特点或需要强调的进步点。" /></label>

        <section className="space-y-3 rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-4">
          <div><span className="mb-2 block text-xs font-bold text-gray-500">字数目标</span><SegmentedControl value={commentProfile.lengthMode} ariaLabel="评语字数目标" onChange={value => updateProfile({ lengthMode: value, targetWordCount: resolveCommentWordCount(value, commentProfile.targetWordCount) })} options={COMMENT_LENGTH_MODES} className="flex w-full" />{commentProfile.lengthMode === "custom" && <input type="number" min={10} max={999} value={commentProfile.targetWordCount} onChange={event => updateProfile({ targetWordCount: clampCommentWordCount(event.target.value) })} className="mt-2 h-9 w-full rounded-[var(--app-radius-sm)] border border-gray-200 px-3 text-sm outline-none focus:border-blue-300" aria-label="自定义评语字数" />}</div>
          <div><span className="mb-2 block text-xs font-bold text-gray-500">评语风格</span><SegmentedControl value={commentProfile.style} ariaLabel="评语风格" onChange={value => updateProfile({ style: value })} options={COMMENT_STYLES} className="flex w-full" /></div>
        </section>

        {!hasAuth && <section className="rounded-[var(--app-radius-md)] border border-violet-100 bg-violet-50 p-4"><div className="mb-2 text-xs font-bold text-violet-600">AI 授权</div><input type="password" value={accessCode} onChange={event => setAccessCode(event.target.value)} className="h-10 w-full rounded-[var(--app-radius-sm)] border border-violet-100 bg-white px-3 text-sm outline-none focus:border-violet-300" placeholder="输入 AI 授权码"/><label className="mt-2 flex items-center gap-2 text-xs text-violet-700"><input type="checkbox" checked={rememberAuth} onChange={event => setRememberAuth(event.target.checked)} className="accent-violet-600"/>记住授权 30 天</label></section>}

        <section><div className="mb-1.5 flex items-center justify-between"><span className="text-xs font-bold text-gray-500">评语草稿</span><span className={`text-xs font-semibold ${dirty ? "text-amber-600" : "text-emerald-600"}`}>{dirty ? "未保存" : savedText ? "已保存" : "暂无草稿"}</span></div><div className="relative min-h-[210px] overflow-hidden rounded-[var(--app-radius-sm)]">
          <textarea rows={9} value={draftState.generatedComment} readOnly={phase !== "idle"} onChange={event => setDraftState(current => ({ ...current, generatedComment: event.target.value }))} className={`min-h-[210px] w-full resize-none rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-6 outline-none transition-opacity focus:border-violet-300 focus:bg-white ${phase === "loading" ? "opacity-0" : "opacity-100"}`} placeholder="生成后可在这里继续编辑评语草稿。" />
          {phase === "loading" && <div className="absolute inset-0"><AiGenerationPanel compact title="正在生成评语" steps={["整理学生素材", "组织评语结构", "生成评语草稿"]} /></div>}
          {phase === "revealing" && <span aria-hidden="true" className="ai-comment-reveal-glow pointer-events-none absolute inset-0 rounded-[var(--app-radius-sm)]" />}
        </div></section>
        <p className="rounded-[var(--app-radius-sm)] bg-violet-50/70 px-3 py-2 text-xs leading-5 text-violet-700" role="status">{status}</p>
      </div>
    </ToolDrawer>
    {appDialog.dialog}
  </>;
}
