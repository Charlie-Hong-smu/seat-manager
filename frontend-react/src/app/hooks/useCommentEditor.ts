import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useScopedRequest } from "./useScopedRequest";
import { getCurrentWorkspaceScope } from "../state/workspaces";
import { generateStudentAiComment, hasStoredAiAuth } from "../state/aiCommentService";
import { refineCommentSelection, replaceCommentSelection, type CommentRefinementAction } from "../state/aiCommentRefinementService";
import { getCommentAiErrorMessage as getAiErrorMessage } from "../components/commentEditor";
import type { StudentId } from "../state/types";
import type { CommentDrafts } from "./useCommentDrafts";

type SingleGenerationPhase = "idle" | "loading" | "revealing";
type RefinementPhase = "idle" | "loading" | "ready";

interface CommentTextSelection {
  start: number;
  end: number;
  text: string;
  actionLeft: number;
  actionTop: number;
}

function measureTextareaSelection(textarea: HTMLTextAreaElement, selectionStart: number, selectionEnd: number) {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const borderWidth = (Number.parseFloat(computed.borderLeftWidth) || 0) + (Number.parseFloat(computed.borderRightWidth) || 0);
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${textarea.clientWidth + borderWidth}px`,
    boxSizing: computed.boxSizing,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    font: computed.font,
    letterSpacing: computed.letterSpacing,
    lineHeight: computed.lineHeight,
    padding: computed.padding,
    border: computed.border,
  });
  mirror.appendChild(document.createTextNode(textarea.value.slice(0, selectionStart)));
  const selectedSpan = document.createElement("span");
  selectedSpan.textContent = textarea.value.slice(selectionStart, selectionEnd) || "\u200b";
  mirror.appendChild(selectedSpan);
  document.body.appendChild(mirror);
  const mirrorRect = mirror.getBoundingClientRect();
  const selectedRects = Array.from(selectedSpan.getClientRects());
  const lastRect = selectedRects[selectedRects.length - 1];
  const anchor = lastRect
    ? { left: lastRect.left - mirrorRect.left, top: lastRect.top - mirrorRect.top, height: lastRect.height }
    : { left: 8, top: 8, height: 28 };
  const viewportLeft = anchor.left - textarea.scrollLeft;
  const belowTop = anchor.top + anchor.height + 8;
  const viewportBelowTop = belowTop - textarea.scrollTop;
  mirror.remove();
  return {
    left: Math.min(Math.max(8, viewportLeft), Math.max(8, textarea.clientWidth - 238)) + textarea.scrollLeft,
    top: viewportBelowTop > textarea.clientHeight - 42
      ? Math.max(8, anchor.top - 42)
      : belowTop,
  };
}

interface Options {
  drafts: CommentDrafts;
  accessCode: string; rememberAuth: boolean;
  setAccessCode: (value: string) => void; setHasAuth: (value: boolean) => void;
  setAiStatus: (value: string) => void; onGenerated: (id: StudentId) => void;
}

export function useCommentEditor({ drafts, accessCode, rememberAuth, setAccessCode, setHasAuth, setAiStatus, onGenerated }: Options) {
  const { students, selectedId, selectedStudent, selectedComment, buildDraft, updateComment } = drafts;
  const currentScope = getCurrentWorkspaceScope();
  const generation = useScopedRequest(`${currentScope}:${selectedId}`);
  const refinement = useScopedRequest(`${currentScope}:${selectedId}`);
  const rosterScope = `${currentScope}:${students.map(student => student.id).join("|")}`;
  const [singleGenerationPhase, setSingleGenerationPhase] = useState<SingleGenerationPhase>("idle");
  const [displayedCommentText, setDisplayedCommentText] = useState(() => selectedComment?.text || "");
  const [commentSelection, setCommentSelection] = useState<CommentTextSelection | null>(null);
  const [refinementPhase, setRefinementPhase] = useState<RefinementPhase>("idle");
  const [refinementSuggestion, setRefinementSuggestion] = useState("");

  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const commentPreviewScrollRef = useRef<HTMLDivElement>(null);
  const selectionToolbarRef = useRef<HTMLDivElement>(null);
  const commentScrollPosition = useRef(0);
  const commentRevealFrame = useRef<number | null>(null);
  useEffect(() => { setSingleGenerationPhase("idle"); }, [rosterScope]);
  useEffect(() => {
    if (commentRevealFrame.current !== null) {
      window.cancelAnimationFrame(commentRevealFrame.current);
      commentRevealFrame.current = null;
    }
    setSingleGenerationPhase("idle");
    setDisplayedCommentText(selectedComment?.text || "");
    setCommentSelection(null);
    setRefinementPhase("idle");
    setRefinementSuggestion("");
    return () => {
      if (commentRevealFrame.current !== null) window.cancelAnimationFrame(commentRevealFrame.current);
    };
  }, [selectedComment?.text, selectedId]);

  useEffect(() => {
    setCommentSelection(null);
    setRefinementPhase("idle");
    setRefinementSuggestion("");
  }, [selectedId]);

  useEffect(() => {
    if (singleGenerationPhase === "idle") setDisplayedCommentText(selectedComment?.text || "");
  }, [selectedComment?.text, singleGenerationPhase]);

  useLayoutEffect(() => {
    if (refinementPhase === "idle" || !commentPreviewScrollRef.current) return;
    commentPreviewScrollRef.current.scrollTop = commentScrollPosition.current;
  }, [refinementPhase, refinementSuggestion]);

  function dismissCommentRefinement() {
    refinement.cancel();
    setCommentSelection(null);
    setRefinementPhase("idle");
    setRefinementSuggestion("");
  }

  function handleCommentSelection() {
    const textarea = commentTextareaRef.current;
    if (!textarea || singleGenerationPhase !== "idle" || refinementPhase === "loading") return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value.slice(start, end);
    if (start === end || !text.trim()) {
      if (refinementPhase !== "ready") dismissCommentRefinement();
      return;
    }
    const position = measureTextareaSelection(textarea, start, end);
    const sameSelection = commentSelection?.start === start && commentSelection.end === end && commentSelection.text === text;
    setCommentSelection({ start, end, text, actionLeft: position.left, actionTop: position.top });
    if (!sameSelection) {
      setRefinementPhase("idle");
      setRefinementSuggestion("");
    }
  }

  function syncSelectionToolbar(textarea: HTMLTextAreaElement) {
    commentScrollPosition.current = textarea.scrollTop;
    if (!selectionToolbarRef.current || !commentSelection) return;
    selectionToolbarRef.current.style.left = `${commentSelection.actionLeft - textarea.scrollLeft}px`;
    selectionToolbarRef.current.style.top = `${commentSelection.actionTop - textarea.scrollTop}px`;
  }

  async function requestCommentRefinement(action: CommentRefinementAction) {
    if (!selectedStudent || !selectedComment || !commentSelection || refinementPhase === "loading") return;
    if (commentSelection.text.length > 600) {
      setAiStatus("一次最多优化 600 个字，请缩小选中文字范围。");
      return;
    }
    const request = refinement.start();
    commentScrollPosition.current = commentTextareaRef.current?.scrollTop || 0;
    setRefinementPhase("loading");
    setRefinementSuggestion("");
    setAiStatus("");
    try {
      const result = await refineCommentSelection({
        studentId: selectedStudent.id,
        action,
        selectedText: commentSelection.text,
        contextBefore: selectedComment.text.slice(0, commentSelection.start),
        contextAfter: selectedComment.text.slice(commentSelection.end),
        accessCode,
        remember: rememberAuth,
        signal: request.signal,
      });
      if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
      setRefinementSuggestion(result.replacement);
      setRefinementPhase("ready");
      setAiStatus("");
    } catch (error) {
      if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
      setRefinementPhase("idle");
      setAiStatus(getAiErrorMessage(error instanceof Error ? error.message : ""));
    }
  }

  function applyCommentRefinement() {
    if (!selectedComment || !commentSelection || !refinementSuggestion) return;
    if (selectedComment.text.slice(commentSelection.start, commentSelection.end) !== commentSelection.text) {
      setAiStatus("评语内容已经变化，请重新选择要优化的文字。");
      dismissCommentRefinement();
      return;
    }
    const nextText = replaceCommentSelection(
      selectedComment.text,
      commentSelection.start,
      commentSelection.end,
      refinementSuggestion,
    );
    const caretPosition = commentSelection.start + refinementSuggestion.length;
    setDisplayedCommentText(nextText);
    updateComment(selectedId, { text: nextText, generated: Boolean(nextText) });
    dismissCommentRefinement();
    setAiStatus("已应用到当前草稿；请继续检查，保存后才会写入评语记录。");
    window.requestAnimationFrame(() => {
      commentTextareaRef.current?.focus();
      commentTextareaRef.current?.setSelectionRange(caretPosition, caretPosition);
    });
  }

  function revealGeneratedComment(text: string) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setDisplayedCommentText(text); setSingleGenerationPhase("idle"); return; }
    if (commentRevealFrame.current !== null) window.cancelAnimationFrame(commentRevealFrame.current);
    setSingleGenerationPhase("revealing");
    setDisplayedCommentText("");
    const startedAt = window.performance.now();
    const duration = Math.min(1500, Math.max(520, text.length * 8));
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 2.4);
      const visibleLength = Math.min(text.length, Math.max(1, Math.ceil(text.length * eased)));
      setDisplayedCommentText(text.slice(0, visibleLength));
      if (progress < 1) {
        commentRevealFrame.current = window.requestAnimationFrame(tick);
      } else {
        commentRevealFrame.current = null;
        setDisplayedCommentText(text);
        setSingleGenerationPhase("idle");
      }
    };
    commentRevealFrame.current = window.requestAnimationFrame(tick);
  }

  async function generateSingle() {
    if (!selectedStudent || !selectedComment || singleGenerationPhase !== "idle") return;
    const request = generation.start();
    setSingleGenerationPhase("loading");
    setDisplayedCommentText("");
    setAiStatus("");
    try {
      const draft = buildDraft(selectedComment);
      const result = await generateStudentAiComment(selectedStudent, draft, { accessCode, remember: rememberAuth, force: true, signal: request.signal });
      if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
      if (!result.comment) {
        setAiStatus(result.missingInfo?.length ? `需要补充：${result.missingInfo.join("、")}` : "信息不足，暂未生成评语。");
        setDisplayedCommentText(selectedComment.text);
        setSingleGenerationPhase("idle");
        return;
      }
      updateComment(selectedId, { text: result.comment, generated: true, needsInfo: Boolean(result.needsMoreInfo), failed: false });
      onGenerated(selectedId);
      setAccessCode("");
      setHasAuth(true);
      setAiStatus("草稿已生成，请核对后保存。");
      revealGeneratedComment(result.comment);
    } catch (error) {
      if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
      setAiStatus(getAiErrorMessage(error instanceof Error ? error.message : ""));
      setHasAuth(hasStoredAiAuth());
      setDisplayedCommentText(selectedComment.text);
      setSingleGenerationPhase("idle");
    }
  }

  return { singleGenerationPhase, displayedCommentText, commentSelection, refinementPhase, refinementSuggestion,
    commentTextareaRef, commentPreviewScrollRef, selectionToolbarRef, commentScrollPosition,
    setDisplayedCommentText, dismissCommentRefinement, handleCommentSelection, syncSelectionToolbar,
    requestCommentRefinement, applyCommentRefinement, generateSingle,
    beginBatch() {
      if (commentRevealFrame.current !== null) { window.cancelAnimationFrame(commentRevealFrame.current); commentRevealFrame.current = null; }
      setSingleGenerationPhase("loading"); setDisplayedCommentText("");
    },
    endBatch() { setSingleGenerationPhase("idle"); },
  };
}
