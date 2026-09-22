import { useScopedRequest } from "../hooks/useScopedRequest";
import { getCurrentWorkspaceScope } from "../state/workspaces";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Copy, Plus, Save, Sparkles, X } from "lucide-react";

import { generateStudentAiComment, hasStoredAiAuth } from "../state/aiCommentService";
import { cacheStudentCommentDraft, readStudentCommentDraft, saveStudentCommentDraft } from "../state/commentStorage";
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
import { MotionCollapse, Checkbox, AiGenerationPanel, Button, SegmentedControl, ToolDrawer, Input, Textarea } from "./ui";

interface AiCommentDrawerProps {
  open: boolean;
  student: AppStudent;
  onClose: () => void;
  elevated?: boolean;
}

type GenerationPhase = "idle" | "loading" | "revealing";

function getAiErrorMessage(reason: string): string {
  return {
    ai_auth_required: "产品授权已失效，请退出后重新登录。",
    ai_unauthorized: "当前授权未开通 AI 或 AI 已到期。",
    ai_auth_failed: "AI 授权暂时不可用，请稍后重试。",
    ai_file_protocol: "当前是本地文件打开方式，请通过网页地址打开后再使用 AI。",
    ai_offline: "当前离线，联网后可生成评语。",
    ai_payload_too_large: "当前素材过多，请减少补充内容后再试。",
    ai_rate_limited: "今日 AI 调用较多，请稍后再试。",
  }[reason] || "AI 评语暂时不可用，请稍后重试。";
}

export function AiCommentDrawer({ open, student, onClose, elevated = false }: AiCommentDrawerProps) {
  const currentScope = getCurrentWorkspaceScope();
  const generation = useScopedRequest(`${currentScope}:${student.id}:${open}`);
  const rubric = useMemo(() => readCommentRubric(), []);
  const [draftState, setDraftState] = useState(() => readStudentCommentDraft(student));
  const [savedText, setSavedText] = useState(() => readStudentCommentProfile(student).generatedComment);
  const [commentProfile, setCommentProfile] = useState<StudentCommentProfile>(() => readStudentCommentProfile(student));
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiAuth());
  const [status, setStatus] = useState("请核对素材，可补充课堂表现后生成。");
  const [statusError, setStatusError] = useState(false);
  const [phase, setPhase] = useState<GenerationPhase>("idle");
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [customCriterionId, setCustomCriterionId] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const revealFrame = useRef<number | null>(null);

  useEffect(() => {
    const draft = readStudentCommentDraft(student);
    setDraftState(draft);
    const profile = readStudentCommentProfile(student);
    setSavedText(profile.generatedComment);
    setCommentProfile(profile);
    setHasAuth(hasStoredAiAuth());
    setAccessCode("");
    setStatus("请核对素材，可补充课堂表现后生成。");
    setPhase("idle");
    setCustomCriterionId("");
    setCustomLabel("");
    setStatusError(false);
    if (revealFrame.current !== null) window.cancelAnimationFrame(revealFrame.current);
  }, [student, open]);

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
    cacheStudentCommentDraft(student.id, { ...draftState, teacherNote: saved.teacherNote, style: saved.style, lengthMode: saved.lengthMode, targetWordCount: saved.targetWordCount, updatedAt: saved.updatedAt });
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
    const request = generation.start();
    const previousText = draftState.generatedComment;
    setStatusError(false);
    setPhase("loading");
    setStatus(`正在生成 ${student.name} 的评语...`);
    try {
      const requestDraft = buildStudentCommentDraft(rubric, commentProfile, previousText);
      const result = await generateStudentAiComment(student, requestDraft, { accessCode, remember: rememberAuth, force: true, signal: request.signal });
      if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
      if (!result.comment) {
        setStatus(result.missingInfo?.length ? `需要补充：${result.missingInfo.join("、")}` : "信息不足，暂未生成评语。");
        setPhase("idle");
        return;
      }
      cacheStudentCommentDraft(student.id, { ...requestDraft, generatedComment: result.comment, updatedAt: new Date().toISOString() });
      setAccessCode("");
      setHasAuth(true);
      setStatus(result.needsMoreInfo ? "已生成，但建议继续补充素材后再润色。" : "草稿已生成，请核对后保存。");
      revealComment(result.comment);
    } catch (error) {
      if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
      setDraftState(current => ({ ...current, generatedComment: previousText }));
      setStatus(getAiErrorMessage(error instanceof Error ? error.message : ""));
      setStatusError(true);
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
      setStatusError(true);
    }
  }

  function updateCachedComment(text: string) {
    const next = { ...draftState, generatedComment: text, updatedAt: new Date().toISOString() };
    setDraftState(next);
    cacheStudentCommentDraft(student.id, next);
  }

  function submitCustomOption(criterion: CommentCriterion) {
    if (!customLabel.trim()) return;
    updateProfileWith(profile => addCommentCustomOption(profile, criterion, customLabel));
    setCustomLabel("");
    setCustomCriterionId("");
  }

  const footer = <div className="flex gap-2">
    <Button variant="ai" disabled={phase !== "idle"} onClick={handleGenerate} className="flex-1">
      <Sparkles className="h-4 w-4" />{phase === "idle" ? (savedText ? "重新生成" : "生成评语") : "生成中"}
    </Button>
    <Button variant="ghost" disabled={!dirty || phase !== "idle"} onClick={handleSave} aria-label="保存评语草稿"><Save className="h-4 w-4" /></Button>
    <Button variant="ghost" disabled={!draftState.generatedComment || phase !== "idle"} onClick={() => void handleCopy()} aria-label="复制评语"><Copy className="h-4 w-4" /></Button>
  </div>;

  return <>
    <ToolDrawer open={open} title={`AI 期末评语 · ${student.name}`} onClose={onClose} widthClassName="w-[420px]" bodyClassName="p-4" positionClassName="fixed" backdropLayerClassName={elevated ? "z-[100]" : "z-[70]"} panelLayerClassName={elevated ? "z-[110]" : "z-[80]"} footer={footer}>
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-background-primary-default">
          <button type="button" aria-expanded={materialsOpen} onClick={() => setMaterialsOpen(value => !value)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/30">
            <span><strong className="block text-body-regular text-text-primary">评语素材</strong><span className="mt-0.5 block text-caption-1-regular text-text-tertiary">预设 {selectedCount} 项 · 自定义 {customCount} 项 · 学生标签 {visibleTags.length} 项</span></span>
            <ChevronDown className={`h-4 w-4 text-text-tertiary transition-transform ${materialsOpen ? "rotate-180" : ""}`} />
          </button>
          <div aria-hidden={!materialsOpen} inert={!materialsOpen ? true : undefined} className={`grid transition-[grid-template-rows,opacity] duration-200 motion-reduce:transition-none ${materialsOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden"><div className="space-y-4 border-t border-separator-border p-4">
              <div><div className="mb-2 text-caption-1-semibold text-text-secondary">学生标签（只读参考）</div><div className="flex flex-wrap gap-1.5">{visibleTags.length ? visibleTags.map(tag => <span key={tag} className="rounded-full border border-separator-border bg-background-secondary-default px-2.5 py-1 text-caption-1-semibold text-text-secondary">{tag}</span>) : <span className="text-caption-1-regular text-text-tertiary">暂无标签</span>}</div></div>
              {rubric.criteria.filter(criterion => !criterion.hidden).map(criterion => {
                const selected = new Set(commentProfile.criteriaValues[criterion.id] || []);
                const customOptions = commentProfile.customOptions[criterion.id] || [];
                return <div key={criterion.id}>
                  <div className="mb-2 flex items-center justify-between"><span className="text-caption-1-semibold text-text-secondary">{criterion.label}</span><button type="button" onClick={() => { setCustomCriterionId(criterion.id); setCustomLabel(""); }} className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-caption-1-semibold text-accent-600 hover:bg-accent-50"><Plus className="h-3.5 w-3.5" />自定义</button></div>
                  <div className="flex flex-wrap gap-2">
                    {criterion.options.map(option => <button key={option.id} type="button" onClick={() => updateProfileWith(profile => toggleCommentCriterion(profile, criterion, option.id))} className={`h-8 rounded-full border px-3 text-caption-1-semibold transition-colors ${selected.has(option.id) ? "border-accent-300 bg-accent-50 text-accent-700" : "border-border-button-default bg-background-primary-default text-text-secondary hover:bg-background-secondary-default"}`}>{option.label}</button>)}
                    {customOptions.map(option => <button key={option.id} type="button" title="点击移除自定义素材" onClick={() => updateProfileWith(profile => removeCommentCustomOption(profile, criterion.id, option.id))} className="inline-flex h-8 items-center gap-1 rounded-full border border-status-success-100 bg-status-success-50 px-3 text-caption-1-semibold text-status-success-700">{option.label}<X className="h-3 w-3" /></button>)}
                  </div>
                  {customCriterionId === criterion.id && <div className="mt-2 flex gap-2"><Input autoFocus value={customLabel} onChange={setCustomLabel} onKeyDown={event => { if (event.key === "Enter") submitCustomOption(criterion); if (event.key === "Escape") setCustomCriterionId(""); }} maxLength={30} placeholder={`补充${criterion.label}素材`} className="min-w-0 flex-1" /><Button size="sm" onClick={() => submitCustomOption(criterion)}>添加</Button></div>}
                </div>;
              })}
            </div></div>
          </div>
        </section>

        <Textarea label="教师补充" value={commentProfile.teacherNote} onChange={value => updateProfile({ teacherNote: value })} rows={3} placeholder="补充学生近期表现、性格特点或需要强调的进步点。"  resize="none" />

        <section className="space-y-3 rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-background-primary-default p-4">
          <div><span className="mb-2 block text-caption-1-semibold text-text-secondary">字数目标</span><SegmentedControl value={commentProfile.lengthMode} ariaLabel="评语字数目标" onChange={value => updateProfile({ lengthMode: value, targetWordCount: resolveCommentWordCount(value, commentProfile.targetWordCount) })} options={COMMENT_LENGTH_MODES} className="flex w-full" /><MotionCollapse open={commentProfile.lengthMode === "custom"}><input type="number" min={10} max={999} value={commentProfile.targetWordCount} onChange={event => updateProfile({ targetWordCount: clampCommentWordCount(event.target.value) })} className="mt-2 h-9 w-full rounded-[var(--app-radius-sm)] border border-border-button-default px-3 text-body-regular outline-none focus:border-accent-300" aria-label="自定义评语字数" /></MotionCollapse></div>
          <div><span className="mb-2 block text-caption-1-semibold text-text-secondary">评语风格</span><SegmentedControl value={commentProfile.style} ariaLabel="评语风格" onChange={value => updateProfile({ style: value })} options={COMMENT_STYLES} className="flex w-full" /></div>
        </section>

        {!hasAuth && <section className="rounded-[var(--app-radius-md)] bg-background-secondary-default p-4"><div className="mb-2 text-caption-1-semibold text-text-secondary">AI 授权</div><Input type="password" value={accessCode} onChange={setAccessCode} placeholder="输入 AI 授权码"  /><Checkbox isSelected={rememberAuth} onChange={setRememberAuth} className="mt-2">记住授权 30 天</Checkbox></section>}

        <section><div className="mb-1.5 flex items-center justify-between"><span className="text-caption-1-semibold text-text-secondary">评语草稿</span><span className={`text-caption-1-semibold ${dirty ? "text-status-warning-600" : "text-status-success-600"}`}>{dirty ? "已缓存，未正式保存" : savedText ? "已保存" : "暂无草稿"}</span></div><div className="relative min-h-[210px] overflow-hidden rounded-[var(--app-radius-sm)]">
          <textarea rows={9} value={draftState.generatedComment} readOnly={phase !== "idle"} onChange={event => updateCachedComment(event.target.value)} className={`min-h-[210px] w-full resize-none rounded-[var(--app-radius-sm)] border border-border-button-default bg-background-primary-default px-3.5 py-3 text-body-regular leading-6 outline-none transition-opacity focus:border-accent-300 ${phase === "loading" ? "opacity-0" : "opacity-100"}`} placeholder="生成后可在这里继续编辑评语草稿。" />
          {phase === "loading" && <div className="absolute inset-0"><AiGenerationPanel compact title="正在生成评语" steps={["整理学生素材", "组织评语结构", "生成评语草稿"]} /></div>}
        </div></section>
        <p className={`rounded-[var(--app-radius-sm)] px-3 py-2 text-caption-1-regular leading-5 ${statusError ? "bg-status-danger-50 text-status-danger-700" : "bg-background-secondary-default text-text-tertiary"}`} role="status">{status}</p>
      </div>
    </ToolDrawer>
  </>;
}
