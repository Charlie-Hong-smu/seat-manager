import { useMediaQuery } from "../hooks/useMediaQuery";
import { useScopedRequest } from "../hooks/useScopedRequest";
import { getCurrentWorkspaceScope } from "../state/workspaces";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Download,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Settings2,
  Sparkles,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { generateStudentAiComment, hasStoredAiAuth } from "../state/aiCommentService";
import {
  COMMENT_REFINEMENT_ACTIONS,
  refineCommentSelection,
  replaceCommentSelection,
  type CommentRefinementAction,
} from "../state/aiCommentRefinementService";
import { AiStudentFollowupPanel } from "./AiStudentFollowupPanel";
import { cacheStudentCommentDraft, readStudentCommentDraft, readStudentCommentDrafts, saveStudentCommentDraft } from "../state/commentStorage";
import {
  readCommentRubric,
  readStudentCommentProfile,
  readStudentCommentProfiles,
  saveCommentRubric,
  saveStudentCommentProfile,
  summarizeCommentProfile,
} from "../state/commentRubricStorage";
import type { AppStudent, CommentCriterion, CommentRubric, StudentCommentDraft, StudentCommentProfile, StudentId } from "../state/types";
import { MobilePaneTabs, MotionList, MotionCollapse, DialogPresence, AiGenerationPanel, Button, IconButton, MotionSwitch, SegmentedControl, useModalFocus, useAppDialog } from "./ui";
import {
  addCommentCustomOption,
  COMMENT_LENGTH_MODES,
  COMMENT_STYLES,
  makeCommentItemId,
  removeCommentCustomOption,
  resolveCommentWordCount,
  toggleCommentCriterion,
} from "./commentEditor";
import {
  emptyCommentBatchState,
  loadCommentBatchState,
  saveCommentBatchState,
  type CommentBatchState,
} from "./commentBatchStorage";
import { toLocalDateKey } from "../state/dateKey";
import { matchesStudentSearch } from "../state/studentSearch";

interface CommentState {
  studentId: StudentId;
  text: string;
  generated: boolean;
  needsInfo: boolean;
  failed: boolean;
  lengthMode: string;
  style: string;
  targetWordCount: number;
}

type CommentFilterMode = "all" | "pending" | "needsInfo";
type WorkbenchMode = "single" | "batch";
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

function buildInitialComments(students: AppStudent[], failedIds: StudentId[] = []): CommentState[] {
  const failedSet = new Set(failedIds);
  const drafts = readStudentCommentDrafts(students);
  return students.map(s => {
    const draft = drafts[s.id];
    return {
    studentId: s.id,
    text: draft.generatedComment,
    generated: Boolean(draft.generatedComment),
    needsInfo: failedSet.has(s.id) || (s.academicTags.length === 0 && !draft.teacherNote),
    failed: failedSet.has(s.id),
    lengthMode: draft.lengthMode,
    style: draft.style,
    targetWordCount: draft.targetWordCount,
  };
  });
}

interface Props {
  students: AppStudent[];
  onClose: () => void;
  onSelectStudent: (student: AppStudent) => void;
}

const LENGTH_MODES = COMMENT_LENGTH_MODES;
const STYLES = COMMENT_STYLES;

function getBestSubject(scores: Record<string, number>): string {
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function getWeakSubject(scores: Record<string, number>): string {
  return Object.entries(scores).sort((a, b) => a[1] - b[1])[0]?.[0] || "";
}

function csvEscape(value: string | number): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export function CommentWorkbench({ students, onClose, onSelectStudent }: Props) {
  const appDialog = useAppDialog();
  const isMobile = useMediaQuery("(max-width: 767px), (max-height: 500px) and (pointer: coarse)");
  const [mobilePane, setMobilePane] = useState<"roster" | "editor" | "materials">("editor");
  const [initialBatchState] = useState(() => loadCommentBatchState(students));
  const initialRubric = useMemo(() => readCommentRubric(), []);
  const [storedComments, setComments] = useState<CommentState[]>(() => buildInitialComments(students, initialBatchState.failed));
  const comments = useMemo(() => {
    const byId = new Map(storedComments.map(comment => [comment.studentId, comment]));
    return students.map(student => byId.get(student.id) || buildInitialComments([student])[0]);
  }, [storedComments, students]);
  const [rubric, setRubric] = useState<CommentRubric>(() => initialRubric);
  const persistedProfiles = useMemo(() => readStudentCommentProfiles(students), [students]);
  const [storedProfiles, setCommentProfiles] = useState(persistedProfiles);
  const commentProfiles = useMemo(() => Object.fromEntries(students.map(student => {
    const local = storedProfiles[student.id];
    const saved = persistedProfiles[student.id];
    return [student.id, !local || (Date.parse(saved.updatedAt) || 0) > (Date.parse(local.updatedAt) || 0) ? saved : local];
  })), [students, storedProfiles, persistedProfiles]);
  const [requestedStudentId, setSelectedId] = useState<StudentId>(students[0]?.id || "");
  const selectedId = students.some(student => student.id === requestedStudentId) ? requestedStudentId : students[0]?.id || "";
  const [filterSearch, setFilterSearch] = useState("");
  const [filterMode, setFilterMode] = useState<CommentFilterMode>("all");
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<StudentId>>(() => new Set());
  const [workbenchMode, setWorkbenchMode] = useState<WorkbenchMode>("single");
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(() => new Set(
    initialRubric.criteria
      .filter(criterion => ["学习态度", "课堂表现", "成绩表现"].includes(criterion.label))
      .map(criterion => criterion.id)
  ));
  const [showGenerationSettings, setShowGenerationSettings] = useState(false);
  const [showTeacherNote, setShowTeacherNote] = useState(() => Boolean(commentProfiles[students[0]?.id]?.teacherNote || comments[0]?.needsInfo));
  const [teacherNote, setTeacherNote] = useState(() => commentProfiles[students[0]?.id]?.teacherNote || "");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchState, setBatchState] = useState<CommentBatchState>(() => initialBatchState);
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiAuth());
  const [aiStatus, setAiStatus] = useState("");
  const [singleGenerationPhase, setSingleGenerationPhase] = useState<SingleGenerationPhase>("idle");
  const [displayedCommentText, setDisplayedCommentText] = useState(() => comments[0]?.text || "");
  const [commentSelection, setCommentSelection] = useState<CommentTextSelection | null>(null);
  const [refinementPhase, setRefinementPhase] = useState<RefinementPhase>("idle");
  const [refinementSuggestion, setRefinementSuggestion] = useState("");

  const [customMaterialCriterionId, setCustomMaterialCriterionId] = useState("");
  const [customMaterialLabel, setCustomMaterialLabel] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const exportPanelRef = useModalFocus(showExportModal, () => setShowExportModal(false));
  const [showFollowupPanel, setShowFollowupPanel] = useState(false);
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<StudentId>>(() => new Set());

  const [exportFormat, setExportFormat] = useState<"csv" | "txt">("csv");
  const pauseRequested = useRef(false);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const commentPreviewScrollRef = useRef<HTMLDivElement>(null);
  const selectionToolbarRef = useRef<HTMLDivElement>(null);
  const commentScrollPosition = useRef(0);
  const commentRevealFrame = useRef<number | null>(null);
  const batchProgress = batchState.total ? Math.round((batchState.done / batchState.total) * 100) : 0;
  const resumableCount = batchState.queue.length + batchState.failed.length;

  const generatedCount = comments.filter(c => c.generated).length;
  const pendingCount = comments.filter(c => !c.generated).length;
  const needsInfoCount = comments.filter(c => c.needsInfo).length;
  const generatedExportIds = useMemo(
    () => new Set(comments.filter(comment => comment.generated).map(comment => comment.studentId)),
    [comments]
  );
  const allGeneratedExportSelected = generatedExportIds.size > 0 &&
    [...generatedExportIds].every(id => exportSelectedIds.has(id));

  const commentByStudentId = useMemo(() => new Map(comments.map(comment => [comment.studentId, comment])), [comments]);
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const state = commentByStudentId.get(s.id);
      if (!state) return false;
      if (!matchesStudentSearch(s, filterSearch)) return false;
      if (filterMode === "pending" && state.generated) return false;
      if (filterMode === "needsInfo" && !state.needsInfo) return false;
      return true;
    });
  }, [commentByStudentId, filterMode, filterSearch, students]);
  const filteredStudentIds = useMemo(() => filteredStudents.map(student => student.id), [filteredStudents]);
  const selectedBatchCount = students.filter(student => selectedBatchIds.has(student.id)).length;
  const currentScope = getCurrentWorkspaceScope();
  const generation = useScopedRequest(`${currentScope}:${selectedId}`);
  const refinement = useScopedRequest(`${currentScope}:${selectedId}`);
  const rosterScope = `${currentScope}:${students.map(student => student.id).join("|")}`;
  const batchRequest = useScopedRequest(rosterScope);
  useEffect(() => { setBatchRunning(false); setSingleGenerationPhase("idle"); }, [rosterScope]);
  const draftContext = useRef({ selectedId, teacherNote, commentProfiles, rubric, students });
  draftContext.current = { selectedId, teacherNote, commentProfiles, rubric, students };
  const commentsRef = useRef(comments);
  commentsRef.current = comments;
  const revision = useRef(new Map<StudentId, number>());
  const unsavedComments = comments.filter(comment => comment.text !== (commentProfiles[comment.studentId]?.generatedComment || ""));
  const allFilteredSelected = filteredStudentIds.length > 0 && filteredStudentIds.every(id => selectedBatchIds.has(id));

  const selectedStudentIndex = students.findIndex(student => student.id === selectedId);
  const selectedStudent = students[selectedStudentIndex] || students[0];
  const selectedComment = comments.find(c => c.studentId === selectedStudent?.id) || comments[0];
  const selectedProfile = selectedStudent ? commentProfiles[selectedStudent.id] || readStudentCommentProfile(selectedStudent) : null;
  const selectedSummary = selectedProfile ? summarizeCommentProfile(rubric, selectedProfile) : { criteriaSummary: [], customOptions: [] };
  const latestExam = selectedStudent?.exams[0];

  useEffect(() => {
    if (selectedProfile && selectedStudent) {
      const recoveredDraft = readStudentCommentDraft(selectedStudent);
      const draftIsNewer = (Date.parse(recoveredDraft.updatedAt || "") || 0) >= (Date.parse(selectedProfile.updatedAt || "") || 0);
      const recoveredTeacherNote = draftIsNewer ? recoveredDraft.teacherNote : selectedProfile.teacherNote;
      setTeacherNote(recoveredTeacherNote);
      setShowTeacherNote(Boolean(recoveredTeacherNote || selectedComment?.needsInfo));
      const selectedCriterionIds = Object.entries(selectedProfile.criteriaValues)
        .filter(([, values]) => values.length > 0)
        .map(([criterionId]) => criterionId);
      const customCriterionIds = Object.entries(selectedProfile.customOptions)
        .filter(([, values]) => values.length > 0)
        .map(([criterionId]) => criterionId);
      if (selectedCriterionIds.length || customCriterionIds.length) {
        setExpandedCriteria(current => new Set([...current, ...selectedCriterionIds, ...customCriterionIds]));
      }
    }
  }, [selectedComment?.needsInfo, selectedId, selectedProfile, selectedStudent]);

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

  function handleWorkbenchKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (showExportModal) setShowExportModal(false);
      else if (commentSelection || refinementPhase !== "idle") dismissCommentRefinement();
      else onClose();
      return;
    }
  }

  function updateComment(id: StudentId, patch: Partial<CommentState>) {
    revision.current.set(id, (revision.current.get(id) || 0) + 1);
    const next = commentsRef.current.map(comment => comment.studentId === id ? { ...comment, ...patch, generated: Boolean((patch.text ?? comment.text).trim()) } : comment);
    commentsRef.current = next;
    setComments(next);
    const changed = next.find(comment => comment.studentId === id);
    if (changed) cacheStudentCommentDraft(id, buildDraft(changed));
  }

  function cacheSelectedCommentText(text: string, nextTeacherNote = teacherNote) {
    if (!selectedStudent || !selectedComment) return;
    cacheStudentCommentDraft(selectedStudent.id, {
      generatedComment: text,
      teacherNote: nextTeacherNote,
      style: selectedComment.style as "warm" | "formal" | "brief",
      lengthMode: selectedComment.lengthMode as "short" | "standard" | "long" | "custom",
      targetWordCount: resolveCommentWordCount(selectedComment.lengthMode as "short" | "standard" | "long" | "custom", selectedComment.targetWordCount),
      updatedAt: new Date().toISOString(),
    });
  }

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

  function persistRubric(next: CommentRubric) {
    const saved = saveCommentRubric(next);
    setRubric(saved);
    const profiles = Object.fromEntries(Object.entries(commentProfiles).map(([studentId, profile]) => [studentId, saveStudentCommentProfile(studentId, saved, profile)]));
    setCommentProfiles(profiles);
    commentsRef.current.forEach(comment => cacheStudentCommentDraft(comment.studentId, buildDraft(comment)));
  }

  function updateSelectedProfile(updater: (profile: StudentCommentProfile) => StudentCommentProfile) {
    if (!selectedStudent || !selectedProfile) {
      return;
    }
    revision.current.set(selectedStudent.id, (revision.current.get(selectedStudent.id) || 0) + 1);
    const nextProfile = updater({ ...selectedProfile });
    const saved = saveStudentCommentProfile(selectedStudent.id, rubric, nextProfile);
    setCommentProfiles(prev => ({ ...prev, [selectedStudent.id]: saved }));
    if (selectedComment) cacheStudentCommentDraft(selectedStudent.id, { ...buildDraft(selectedComment, teacherNote), updatedAt: saved.updatedAt });
  }

  function toggleBatchSelection(studentId: StudentId) {
    setSelectedBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  }

  function toggleFilteredBatchSelection() {
    setSelectedBatchIds(prev => {
      const next = new Set(prev);
      if (filteredStudentIds.length && filteredStudentIds.every(id => next.has(id))) {
        filteredStudentIds.forEach(id => next.delete(id));
      } else {
        filteredStudentIds.forEach(id => next.add(id));
      }
      return next;
    });
  }

  function commitBatchState(next: CommentBatchState) {
    const normalized = {
      ...next,
      queue: Array.from(new Set(next.queue)),
      failed: Array.from(new Set(next.failed)),
      updatedAt: new Date().toISOString(),
    };
    setBatchState(normalized);
    saveCommentBatchState(normalized);
  }

  function clearBatchState() {
    commitBatchState(emptyCommentBatchState());
  }

  function buildDraft(comment: CommentState, note?: string): StudentCommentDraft {
    const context = draftContext.current;
    const profile = context.commentProfiles[comment.studentId];
    const summary = profile ? summarizeCommentProfile(context.rubric, profile) : { criteriaSummary: [], customOptions: [] };
    const student = context.students.find(item => item.id === comment.studentId);
    const recoveredNote = student ? readStudentCommentDraft(student).teacherNote : "";
    const draftTeacherNote = note ?? (comment.studentId === context.selectedId ? context.teacherNote : recoveredNote);
    return {
      generatedComment: comment.text,
      teacherNote: draftTeacherNote,
      style: comment.style as "warm" | "formal" | "brief",
      lengthMode: comment.lengthMode as "short" | "standard" | "long" | "custom",
      targetWordCount: resolveCommentWordCount(comment.lengthMode as "short" | "standard" | "long" | "custom", comment.targetWordCount),
      updatedAt: new Date().toISOString(),
      criteriaSummary: summary.criteriaSummary,
      customOptions: summary.customOptions,
    };
  }

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
      if (batchState.failed.includes(selectedId)) {
        commitBatchState({
          ...batchState,
          failed: batchState.failed.filter(id => id !== selectedId),
        });
      }
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

  function saveSelectedComment() {
    if (!selectedStudent || !selectedComment) return;
    if (selectedProfile) {
      const savedProfile = saveStudentCommentProfile(selectedStudent.id, rubric, {
        ...selectedProfile,
        teacherNote,
        style: selectedComment.style as "warm" | "formal" | "brief",
        lengthMode: selectedComment.lengthMode as "short" | "standard" | "long" | "custom",
        generatedComment: selectedComment.text,
        status: selectedComment.text.trim() ? "edited" : "draft",
        updatedAt: new Date().toISOString(),
      });
      setCommentProfiles(prev => ({ ...prev, [selectedStudent.id]: savedProfile }));
    }
    const saved = saveStudentCommentDraft(selectedStudent.id, {
      generatedComment: selectedComment.text,
      teacherNote,
      style: selectedComment.style as "warm" | "formal" | "brief",
      lengthMode: selectedComment.lengthMode as "short" | "standard" | "long" | "custom",
      targetWordCount: resolveCommentWordCount(selectedComment.lengthMode as "short" | "standard" | "long" | "custom", selectedComment.targetWordCount),
      updatedAt: new Date().toISOString(),
    });
    updateComment(selectedStudent.id, { text: saved.generatedComment, generated: Boolean(saved.generatedComment) });
    setAiStatus(`${selectedStudent.name} 的评语已保存。`);
  }

  async function saveUnsavedComments() {
    const drafts = unsavedComments.filter(comment => comment.text.trim());
    if (!drafts.length || !await appDialog.confirm({ title: `保存 ${drafts.length} 人的评语？`, description: "请先核对生成内容。确认后，这些草稿将成为正式保存的评语，并替换对应学生原先保存的正文。", confirmLabel: "确认保存评语", variant: "primary" })) return;
    if (getCurrentWorkspaceScope() !== currentScope) return;
    const nextProfiles = { ...commentProfiles };
    drafts.forEach(comment => {
      const draft = buildDraft(comment);
      const profile = nextProfiles[comment.studentId];
      if (profile) nextProfiles[comment.studentId] = saveStudentCommentProfile(comment.studentId, rubric, { ...profile, generatedComment: draft.generatedComment, teacherNote: draft.teacherNote, style: draft.style, lengthMode: draft.lengthMode, targetWordCount: draft.targetWordCount, updatedAt: draft.updatedAt, status: "edited" });
      saveStudentCommentDraft(comment.studentId, draft);
    });
    setCommentProfiles(nextProfiles);
    setAiStatus(`已保存 ${drafts.length} 人的评语。`);
  }

  function selectStudent(studentId: StudentId) {
    if (isMobile && workbenchMode === "single") setMobilePane("editor");
    setSelectedId(studentId);
    setShowFollowupPanel(false);
  }

  function saveAndGoNext() {
    if (!selectedStudent) return;
    saveSelectedComment();
    const currentIndex = filteredStudentIds.indexOf(selectedStudent.id);
    const wrapped = currentIndex < 0 || currentIndex >= filteredStudentIds.length - 1;
    const nextId = filteredStudentIds[currentIndex + 1] || filteredStudentIds[0];
    if (!nextId) return;
    selectStudent(nextId);
    setAiStatus(wrapped ? "已保存，当前筛选中的学生已处理一轮，已回到第一位。" : "已保存，已进入下一位学生。");
  }

  function toggleCriterionExpanded(criterionId: string) {
    setExpandedCriteria(current => {
      const next = new Set(current);
      if (next.has(criterionId)) next.delete(criterionId);
      else next.add(criterionId);
      return next;
    });
  }

  function clearAllSelectedMaterials() {
    if (!selectedProfile) return;
    updateSelectedProfile(profile => ({
      ...profile,
      criteriaValues: Object.fromEntries(Object.keys(profile.criteriaValues).map(key => [key, []])),
      customOptions: Object.fromEntries(Object.keys(profile.customOptions).map(key => [key, []])),
      status: profile.generatedComment ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    }));
  }

  function saveSelectedTeacherNote() {
    if (!selectedStudent || !selectedComment || !selectedProfile) return;
    const savedProfile = saveStudentCommentProfile(selectedStudent.id, rubric, {
      ...selectedProfile,
      teacherNote,
      style: selectedComment.style as "warm" | "formal" | "brief",
      lengthMode: selectedComment.lengthMode as "short" | "standard" | "long" | "custom",
      status: selectedProfile.generatedComment ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    });
    setCommentProfiles(prev => ({ ...prev, [selectedStudent.id]: savedProfile }));
    updateComment(selectedStudent.id, {
      needsInfo: savedProfile.teacherNote.trim() ? false : selectedStudent.academicTags.length === 0,
    });
    setAiStatus(`已暂存 ${selectedStudent.name} 的补充说明。`);
  }

  function appendFollowupMaterialToTeacherNote(text: string) {
    if (!selectedStudent || !selectedComment || !selectedProfile) return;
    const nextNote = [teacherNote || selectedProfile.teacherNote, text]
      .map(item => item.trim())
      .filter(Boolean)
      .join("\n");
    const savedProfile = saveStudentCommentProfile(selectedStudent.id, rubric, {
      ...selectedProfile,
      teacherNote: nextNote,
      style: selectedComment.style as "warm" | "formal" | "brief",
      lengthMode: selectedComment.lengthMode as "short" | "standard" | "long" | "custom",
      status: selectedProfile.generatedComment ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    });
    setCommentProfiles(prev => ({ ...prev, [selectedStudent.id]: savedProfile }));
    setTeacherNote(savedProfile.teacherNote);
    draftContext.current.teacherNote = savedProfile.teacherNote;
    setShowTeacherNote(true);
    updateComment(selectedStudent.id, { needsInfo: false });
    setAiStatus(`已把 AI 跟进素材加入 ${selectedStudent.name} 的补充说明。`);
  }

  function toggleCriterionOption(criterion: CommentCriterion, optionId: string) {
    updateSelectedProfile(profile => toggleCommentCriterion(profile, criterion, optionId));
  }

  function clearCriterion(criterionId: string) {
    updateSelectedProfile(profile => ({
      ...profile,
      criteriaValues: { ...profile.criteriaValues, [criterionId]: [] },
      customOptions: { ...profile.customOptions, [criterionId]: [] },
      status: profile.generatedComment ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    }));
  }

  function addStudentCustomOption(criterion: CommentCriterion) {
    if (!customMaterialLabel.trim()) return;
    updateSelectedProfile(profile => addCommentCustomOption(profile, criterion, customMaterialLabel));
    setCustomMaterialLabel("");
    setCustomMaterialCriterionId("");
  }

  function removeStudentCustomOption(criterionId: string, optionId: string) {
    updateSelectedProfile(profile => removeCommentCustomOption(profile, criterionId, optionId));
  }

  async function addCriterion() {
    const label = await appDialog.prompt({ title: "新建评语标准", description: "输入标准名称，保存后可继续添加选项。", confirmLabel: "新建" });
    if (!label?.trim()) return;
    const id = makeCommentItemId(label, "criterion");
    persistRubric({
      ...rubric,
      criteria: [
        ...rubric.criteria,
        {
          id,
          label: label.trim(),
          type: "multi",
          syncToTags: false,
          hidden: false,
          builtIn: false,
          options: [],
        },
      ],
    });
  }

  function isRecoverableAuthError(reason: string): boolean {
    return reason === "ai_auth_required" || reason === "ai_unauthorized" || reason === "ai_auth_failed" || reason === "ai_rate_limited";
  }

  async function runBatchQueue(seed: CommentBatchState) {
    if (batchRunning) return;
    const request = batchRequest.start();
    if (commentRevealFrame.current !== null) {
      window.cancelAnimationFrame(commentRevealFrame.current);
      commentRevealFrame.current = null;
    }
    setBatchRunning(true);
    setSingleGenerationPhase("loading");
    setDisplayedCommentText("");
    pauseRequested.current = false;
    const queue = [...seed.queue];
    const failed = [...seed.failed];
    let done = seed.done;
    let skippedEdits = 0;
    const total = seed.total || queue.length;
    commitBatchState({ ...seed, queue, failed, done, total, status: "running" });

    try {
      for (let i = 0; i < queue.length; i += 1) {
        if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
        if (pauseRequested.current) {
          const paused = { queue: queue.slice(i), failed, done, total, status: "paused" as const, updatedAt: "" };
          commitBatchState(paused);
          setAiStatus(`已暂停，剩余 ${paused.queue.length} 人。`);
          return;
        }
        const studentId = queue[i];
        const student = draftContext.current.students.find(s => s.id === studentId);
        if (!student) {
          done += 1;
          continue;
        }
        const comment = commentsRef.current.find(c => c.studentId === studentId);
        if (!comment) {
          done += 1;
          continue;
        }
        setAiStatus(`正在生成 ${done + 1}/${total}：${student.name}`);
        const inputRevision = revision.current.get(studentId) || 0;
        try {
          const result = await generateStudentAiComment(student, buildDraft(comment), {
            accessCode,
            remember: rememberAuth,
            force: true,
            signal: request.signal,
          });
          if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
          done += 1;
          if ((revision.current.get(studentId) || 0) !== inputRevision) {
            skippedEdits += 1;
          } else if (result.comment) {
            updateComment(student.id, {
              text: result.comment,
              generated: true,
              needsInfo: Boolean(result.needsMoreInfo),
              failed: false,
            });
          } else {
            updateComment(student.id, { needsInfo: true, failed: false });
          }
          commitBatchState({
            queue: queue.slice(i + 1),
            failed,
            done,
            total,
            status: "running",
            updatedAt: "",
          });
        } catch (error) {
          if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
          const reason = error instanceof Error ? error.message : "";
          failed.push(student.id);
          updateComment(student.id, { needsInfo: true, failed: true });
          const remainingQueue = queue.slice(i + 1);
          commitBatchState({
            queue: remainingQueue,
            failed,
            done,
            total,
            status: "failed",
            updatedAt: "",
          });
          setAiStatus(`${student.name} 生成失败：${getAiErrorMessage(reason)}`);
          if (isRecoverableAuthError(reason)) {
            return;
          }
        }
      }
      setAccessCode("");
      setHasAuth(true);
      setSelectedBatchIds(new Set());
      const finalState = { queue: [], failed, done: total, total, status: failed.length ? "failed" as const : "complete" as const, updatedAt: "" };
      commitBatchState(finalState);
      if (failed.length) {
        setAiStatus(`批量生成完成，${failed.length} 人失败，可重试失败项。`);
      } else {
        setAiStatus(skippedEdits ? `草稿生成完成；${skippedEdits} 人保留了生成期间的手动修改。请核对后保存。` : "草稿生成完成，请核对后保存。");
      }
    } catch (error) {
      if (!request.isCurrent() || getCurrentWorkspaceScope() !== currentScope) return;
      setAiStatus(getAiErrorMessage(error instanceof Error ? error.message : ""));
      setHasAuth(hasStoredAiAuth());
    } finally {
      if (request.isCurrent() && getCurrentWorkspaceScope() === currentScope) { setBatchRunning(false); setSingleGenerationPhase("idle"); }
    }
  }

  async function startBatch() {
    const failedIds = new Set(batchState.failed);
    const selectedIds = students.filter(student => selectedBatchIds.has(student.id)).map(student => student.id);
    const pending = selectedIds.length
      ? comments.filter(c => selectedIds.includes(c.studentId))
      : comments.filter(c => !c.generated || failedIds.has(c.studentId));
    if (!pending.length) {
      setAiStatus(selectedIds.length ? "请选择要批量生成的学生。" : "没有待生成的学生。");
      clearBatchState();
      return;
    }
    const replacing = pending.filter(comment => comment.text.trim()).length;
    if (replacing && !await appDialog.confirm({ title: `重新生成 ${replacing} 份已有草稿？`, description: "生成结果会替换这些学生当前的草稿；正式保存的评语保持原样，直到你再次确认保存。", confirmLabel: "重新生成", variant: "primary" })) return;
    if (getCurrentWorkspaceScope() !== currentScope) return;
    const next = {
      queue: pending.map(c => c.studentId),
      failed: [],
      done: 0,
      total: pending.length,
      status: "running" as const,
      updatedAt: "",
    };
    if (selectedIds.length) {
      setAiStatus(`准备为已选 ${pending.length} 名学生批量生成评语。`);
    }
    void runBatchQueue(next);
  }

  function resumeBatch() {
    const retryIds = batchState.queue.length ? batchState.queue : batchState.failed;
    if (!retryIds.length) {
      setAiStatus("没有可继续的队列。");
      return;
    }
    const next = {
      queue: retryIds,
      failed: batchState.queue.length ? batchState.failed : [],
      done: batchState.queue.length ? batchState.done : 0,
      total: batchState.queue.length ? batchState.total : retryIds.length,
      status: "running" as const,
      updatedAt: "",
    };
    void runBatchQueue(next);
  }

  function pauseBatch() {
    pauseRequested.current = true;
    setAiStatus("正在暂停，当前学生生成完成后停止。");
  }

  function exportSelectedComments(format: "csv" | "txt") {
    const chosen = students.filter(s => exportSelectedIds.has(s.id));
    if (chosen.length === 0) return;
    if (format === "txt") {
      const text = chosen
        .map(s => {
          const state = comments.find(c => c.studentId === s.id);
          return `【${s.name}】\n${state?.text || ""}`;
        })
        .join("\n\n");
      downloadTextFile(`期末评语-${toLocalDateKey()}.txt`, text, "text/plain;charset=utf-8");
    } else {
      const rows = [
        ["姓名", "字数", "评语"],
        ...chosen.map(s => {
          const state = comments.find(c => c.studentId === s.id);
          return [s.name, state?.text.length || 0, state?.text || ""];
        }),
      ];
      const content = `\ufeff${rows.map(row => row.map(csvEscape).join(",")).join("\n")}`;
      downloadTextFile(`期末评语-${toLocalDateKey()}.csv`, content, "text/csv;charset=utf-8");
    }
    setShowExportModal(false);
  }

  const batchButtonLabel = batchRunning
    ? "暂停"
    : batchState.queue.length
    ? "继续生成"
    : batchState.failed.length
    ? "重试失败"
    : selectedBatchCount
    ? `生成 ${selectedBatchCount} 人`
    : "批量生成";
  const batchButtonAction = batchRunning ? pauseBatch : resumableCount ? resumeBatch : startBatch;
  const headerProgress = Math.max(0, Math.min(100, batchProgress));
  const showHeaderProgress = batchRunning && batchState.total > 0;
  const selectedCount = selectedSummary.criteriaSummary.reduce((total, item) => total + item.values.length, 0) + selectedSummary.customOptions.length;
  const selectedInitial = selectedStudent?.name.slice(0, 1) || "";
  const hasUnsavedTeacherNote = selectedProfile ? teacherNote !== selectedProfile.teacherNote : false;
  const selectedMaterialLabels = selectedSummary.criteriaSummary.flatMap(item => item.values);
  const selectedLengthLabel = LENGTH_MODES.find(mode => mode.value === selectedComment?.lengthMode)?.label || "100～150";
  const selectedStyleLabel = STYLES.find(style => style.value === selectedComment?.style)?.label || "温和鼓励";


  function getCommentStatus(state: CommentState) {
    if (state.failed) {
      return { label: "失败待重试", badge: "bg-status-danger-50 text-status-danger-500 border-status-danger-100", icon: AlertCircle };
    }
    if (state.generated) {
      return { label: "已生成", badge: "bg-status-success-50 text-status-success-600 border-status-success-100", icon: CheckCircle2 };
    }
    if (state.needsInfo) {
      return { label: "需补充", badge: "bg-status-warning-50 text-status-warning-600 border-status-warning-100", icon: AlertCircle };
    }
    return { label: "待生成", badge: "bg-accent-50 text-accent-600 border-accent-100", icon: Clock3 };
  }

  if (!selectedStudent || !selectedComment) {
    return (
      <div role="region" aria-label="评语工作台" className="comment-workbench-shell relative h-full w-full flex flex-col overflow-hidden bg-background-primary-default">
        <div className="comment-workbench-topbar shrink-0 bg-background-primary-default border-b border-separator-border px-6 py-4 flex items-center justify-between">
          <h2 className="text-text-primary">评语工作台</h2>
          <button aria-label="返回上一页面" onClick={onClose} className="p-2 text-text-tertiary hover:text-text-secondary hover:bg-background-tertiary-default rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>
        <div className="comment-workbench-pane comment-workbench-editor flex-1 grid place-items-center text-text-tertiary">暂无学生</div>
      </div>
    );
  }

  return (
    <div role="region" aria-label="评语工作台" tabIndex={-1} onKeyDown={handleWorkbenchKeyDown} className="comment-workbench-shell relative h-full w-full flex flex-col overflow-hidden bg-background-primary-default text-[var(--app-text)] outline-none">
      <header className="comment-workbench-topbar flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--app-border)] bg-background-primary-default px-4">
        <div className="flex min-w-0 items-center gap-3">
          <IconButton label="返回上一页面" onClick={onClose}><ArrowLeft className="h-4 w-4" /></IconButton>
          <h2 className="shrink-0 text-headline-semibold text-text-primary">评语工作台</h2>
          <span className="comment-generated-count whitespace-nowrap text-body-semibold text-text-tertiary">
            <span className="text-status-success-600">{generatedCount}</span> / {students.length} 已生成
          </span>
          <div
            aria-hidden={!showHeaderProgress}
            inert={!showHeaderProgress ? true : undefined}
            className={`overflow-hidden transition-[max-width,opacity,transform,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${showHeaderProgress ? "ml-0 max-w-48 translate-x-0 scale-100 opacity-100" : "pointer-events-none -ml-3 max-w-0 -translate-x-2 scale-95 opacity-0"}`}
          >
            <button
              type="button"
              onClick={() => setWorkbenchMode("batch")}
              className="flex h-7 w-48 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-accent-100 bg-accent-50 px-3 text-accent-700"
              title="查看批量任务"
            >
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-accent-100">
                <span className="block h-full rounded-full bg-accent-600 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${headerProgress}%` }} />
              </span>
              <span className="text-caption-1-semibold tabular-nums">批量 {headerProgress}%</span>
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button className="comment-save-pending" size="sm" variant="secondary" disabled={batchRunning || singleGenerationPhase !== "idle" || !unsavedComments.some(comment => comment.text.trim())} onClick={() => void saveUnsavedComments()}><Save className="h-4 w-4"/>保存待确认评语 {unsavedComments.filter(comment => comment.text.trim()).length || ""}</Button>
          <button
            type="button"
            onClick={() => { setExportSelectedIds(new Set(generatedExportIds)); setShowExportModal(true); }}
            className="flex h-9 items-center gap-1.5 rounded-[var(--app-radius-sm)] border border-border-button-default bg-background-primary-default px-3 text-body-semibold text-text-secondary transition-colors hover:bg-background-secondary-default"
          >
            <Download className="h-4 w-4" />导出
          </button>

        </div>
      </header>

      <MobilePaneTabs value={mobilePane} onChange={setMobilePane} label="评语工作区" options={[{ value: "roster", label: "学生名单" }, { value: "editor", label: "写评语" }, { value: "materials", label: "素材与 AI" }]} />
      <div className="comment-workbench-columns grid min-h-0 flex-1 overflow-hidden">
        <aside hidden={isMobile && mobilePane !== "roster"} data-mobile-pane="roster" className="comment-workbench-pane comment-workbench-roster flex min-h-0 flex-col border-r border-[var(--app-border)] bg-background-primary-default">
          <div className="space-y-3 border-b border-[var(--app-border)] p-3">
            <SegmentedControl value={workbenchMode} onChange={setWorkbenchMode} ariaLabel="评语处理模式" className="w-full" options={[{ value: "single", label: "逐人", icon: <UserRound className="h-3.5 w-3.5" /> }, { value: "batch", label: "批量", icon: <Users className="h-3.5 w-3.5" /> }]}/>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
              <input value={filterSearch} onChange={event => setFilterSearch(event.target.value)} placeholder="搜索姓名" className="h-9 w-full rounded-[var(--app-radius-sm)] border border-border-button-default bg-background-primary-default pl-9 pr-3 text-body-regular outline-none transition-colors focus:border-accent-300" />
            </div>
            <SegmentedControl value={filterMode} onChange={setFilterMode} ariaLabel="学生评语状态筛选" className="w-full" options={([
              { value: "all", label: "全部", count: students.length },
              { value: "pending", label: "待生成", count: pendingCount },
              { value: "needsInfo", label: "需补充", count: needsInfoCount },
            ] as Array<{ value: CommentFilterMode; label: string; count: number }>).map(option => ({ value: option.value, label: `${option.label} ${option.count}` }))}/>
          </div>

          <div aria-hidden={workbenchMode !== "batch"} inert={workbenchMode !== "batch" ? true : undefined} className={`grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${workbenchMode === "batch" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="flex h-10 items-center justify-between border-b border-[var(--app-border)] px-3">
                <button type="button" onClick={toggleFilteredBatchSelection} className="flex items-center gap-2 text-caption-1-semibold text-text-secondary hover:text-accent-700">
                  <input type="checkbox" checked={allFilteredSelected} readOnly className="pointer-events-none accent-accent-600" />
                  全选 {filteredStudents.length}
                </button>
                <button type="button" onClick={() => setSelectedBatchIds(new Set())} className={`text-caption-1-regular text-text-tertiary transition-opacity hover:text-text-primary ${selectedBatchCount > 0 ? "opacity-100" : "pointer-events-none opacity-0"}`}>清空</button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            <MotionList>
            {filteredStudents.map(student => {
              const state = commentByStudentId.get(student.id);
              if (!state) return null;
              const active = student.id === selectedId;
              const batchSelected = selectedBatchIds.has(student.id);
              const status = getCommentStatus(state);
              return (
                <div
                  key={student.id}
                  role="button"
                  aria-label={`${student.name}，${status.label}`}
                  aria-pressed={active}
                  data-comment-student-id={student.id}
                  tabIndex={0}
                  onClick={() => selectStudent(student.id)}
                  onKeyDown={event => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectStudent(student.id);
                    }
                  }}
                  className={`relative mx-1.5 flex min-h-11 cursor-pointer items-center rounded-[var(--app-radius-sm)] px-3 text-left transition-colors duration-200 hover:bg-background-secondary-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus-ring ${active ? "bg-accent-50" : ""}`}
                >
                  <span className={`absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-600 transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
                  <span aria-hidden={workbenchMode !== "batch"} inert={workbenchMode !== "batch" ? true : undefined} className={`grid shrink-0 overflow-hidden transition-[width,margin,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${workbenchMode === "batch" ? "mr-2 w-4 translate-x-0 opacity-100" : "mr-0 w-0 -translate-x-2 opacity-0"}`}>
                    <input type="checkbox" checked={batchSelected} onClick={event => event.stopPropagation()} onChange={() => toggleBatchSelection(student.id)} className="h-4 w-4 accent-accent-600" aria-label={`选择 ${student.name} 用于批量生成`} />
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-body-semibold ${active ? "text-accent-700" : "text-text-primary"}`}>{student.name}</span>
                  <span className={`ml-2 shrink-0 text-caption-1-regular ${state.failed ? "text-status-danger-500" : state.generated ? "text-status-success-600" : "text-text-tertiary"}`}>{state.failed ? "待重试" : status.label}</span>
                </div>
              );
            })}
            {filteredStudents.length === 0 && <div className="px-3 py-10 text-center text-body-regular text-text-tertiary">没有符合条件的学生</div>}
            </MotionList>
          </div>

          <div aria-hidden={workbenchMode !== "batch"} inert={workbenchMode !== "batch" ? true : undefined} className={`grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${workbenchMode === "batch" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="border-t border-[var(--app-border)] bg-background-secondary-default p-3">
                <div className="mb-2 flex items-center justify-between text-caption-1-regular text-text-secondary">
                  <span>已选 {selectedBatchCount} 人</span>
                  {batchState.total > 0 && <span className="font-bold text-accent-700">{batchState.done}/{batchState.total}</span>}
                </div>
                <Button type="button" variant={batchRunning ? "secondary" : "primary"} className="h-10 w-full" onClick={batchButtonAction}>
                  {batchRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{batchButtonLabel}
                </Button>
              </div>
            </div>
          </div>
        </aside>

        <main hidden={isMobile && mobilePane !== "editor"} data-mobile-pane="editor" className="comment-workbench-pane comment-workbench-editor min-h-0 min-w-0 bg-background-primary-default">
          <MotionSwitch transitionKey={selectedId} contentIndex={selectedStudentIndex} fixed className="h-full">
          <section className="flex h-full min-h-0 flex-col bg-background-primary-default">
            <div className="shrink-0 overflow-hidden border-b border-[var(--app-border)] px-4 py-3.5 xl:px-5">
              <div data-motion-shift className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <button type="button" aria-label={`查看 ${selectedStudent.name} 的学生详情`} title="查看学生详情" onClick={() => onSelectStudent(selectedStudent)} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent-100 text-headline-semibold text-accent-700 transition-colors duration-200 hover:bg-accent-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/30 focus-visible:ring-offset-2">{selectedInitial}</button>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-title-3-semibold text-text-primary">{selectedStudent.name} · 学期评语</h3>
                      {selectedStudent.gender && <span className="text-caption-1-semibold text-text-tertiary">{selectedStudent.gender}</span>}
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-caption-1-semibold ${getCommentStatus(selectedComment).badge}`}>{getCommentStatus(selectedComment).label}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-caption-1-regular text-text-secondary">
                      <span>{latestExam?.name || "暂无考试"}</span>
                      <span>总分 <b className="text-text-primary">{latestExam?.total ?? "—"}</b></span>
                      <span>{latestExam?.rank ? `第 ${latestExam.rank} 名` : "暂无排名"}</span>
                      {latestExam && <span>优势 <b className="text-status-success-600">{getBestSubject(latestExam.scores) || "—"}</b> · 待提升 <b className="text-status-warning-600">{getWeakSubject(latestExam.scores) || "—"}</b></span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 xl:px-6 xl:py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-headline-semibold text-text-primary">评语正文 <span className="ml-2 text-caption-1-regular text-text-tertiary">{selectedComment.text !== (selectedProfile?.generatedComment || "") ? "草稿 · 未保存" : selectedComment.text ? "已保存" : "未填写"}</span></h3>
                </div>
                <span className="shrink-0 text-caption-1-regular tabular-nums text-text-tertiary">{selectedComment.text.length} 字</span>
              </div>
              <div data-comment-editor-frame className="relative min-h-[260px] flex-1 overflow-hidden rounded-[var(--app-radius-sm)] border border-border-button-default bg-background-primary-default transition-colors duration-200 focus-within:border-accent-300">
                {refinementPhase === "idle" ? (
                  <textarea
                    data-motion-shift
                    ref={commentTextareaRef}
                    value={displayedCommentText}
                    readOnly={singleGenerationPhase !== "idle"}
                    onSelect={handleCommentSelection}
                    onScroll={event => syncSelectionToolbar(event.currentTarget)}
                    onChange={event => {
                      dismissCommentRefinement();
                      setDisplayedCommentText(event.target.value);
                      updateComment(selectedId, { text: event.target.value });
                    }}
                    placeholder="点击「生成评语」后会在这里显示；也可以选中文字，让 AI 局部优化表达。"
                    aria-label="评语正文编辑器"
                    className={`h-full min-h-[260px] w-full resize-none border-0 bg-transparent px-5 py-4 text-[15px] leading-7 outline-none transition-opacity duration-200 ${singleGenerationPhase === "loading" ? "opacity-0" : "opacity-100"}`}
                  />
                ) : commentSelection ? (
                  <div
                    data-motion-shift
                    ref={commentPreviewScrollRef}
                    role="status"
                    aria-label={refinementPhase === "loading" ? "正在优化选中文字" : "AI 修订预览"}
                    className="h-full min-h-[260px] w-full overflow-auto bg-transparent text-[15px] leading-7 text-text-primary"
                  >
                    <div className="min-h-full whitespace-pre-wrap break-words px-5 py-4">
                      {displayedCommentText.slice(0, commentSelection.start)}
                      {refinementPhase === "loading" ? (
                        <span className="selection-ai-glass-inline" aria-label="正在优化的文字">{commentSelection.text}</span>
                      ) : (
                        <>
                          <span className="selection-ai-inline-old text-text-tertiary">{commentSelection.text}</span>
                          <span className="selection-ai-inline-new ml-1.5 font-medium text-text-primary">{refinementSuggestion}</span>
                        </>
                      )}
                      {displayedCommentText.slice(commentSelection.end)}
                    </div>
                  </div>
                ) : null}
                {refinementPhase === "idle" && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[var(--app-radius-sm)]">
                  {commentSelection && refinementPhase === "idle" && singleGenerationPhase === "idle" && (
                    <div
                      ref={selectionToolbarRef}
                      role="toolbar"
                      aria-label="AI 优化选中文字"
                      className="selection-ai-actions pointer-events-auto absolute z-20 flex items-center gap-1 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-background-primary-default p-1 shadow-[var(--app-shadow-float)]"
                      style={{
                        left: commentSelection.actionLeft - (commentTextareaRef.current?.scrollLeft || 0),
                        top: commentSelection.actionTop - (commentTextareaRef.current?.scrollTop || 0),
                      }}
                    >
                      {COMMENT_REFINEMENT_ACTIONS.map(action => (
                        <button
                          key={action.value}
                          type="button"
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => requestCommentRefinement(action.value)}
                          className="h-8 rounded-[6px] px-2.5 text-caption-1-semibold text-text-secondary transition-colors hover:bg-background-secondary-default hover:text-text-primary"
                        >
                          {action.label}
                        </button>
                      ))}
                      <button type="button" aria-label="关闭 AI 选区操作" onMouseDown={event => event.preventDefault()} onClick={dismissCommentRefinement} className="grid h-8 w-8 place-items-center rounded-[6px] text-text-tertiary transition-colors hover:bg-background-secondary-default hover:text-text-primary">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  </div>
                )}
                {singleGenerationPhase === "loading" && (
                  <div className="absolute inset-0"><AiGenerationPanel compact title={batchRunning ? "正在批量生成评语" : "正在生成评语"} steps={["整理学生素材", "组织评语结构", "生成评语草稿"]} /></div>
                )}
                </div>
              {refinementPhase === "ready" && commentSelection && refinementSuggestion && (
                <div className="mt-3 flex shrink-0 justify-end">
                  <Button type="button" variant="ai" size="sm" onClick={applyCommentRefinement}>应用 AI 修改</Button>
                </div>
              )}
              {aiStatus && <div className="mt-3 shrink-0 rounded-[var(--app-radius-sm)] bg-accent-50/70 px-3 py-2 text-caption-1-regular leading-5 text-accent-700" role="status">{aiStatus}</div>}
            </div>

            <div className="shrink-0 border-t border-[var(--app-border)] bg-background-primary-default px-4 py-3 xl:px-6">
              <div className="flex items-center justify-end gap-2">
                <Button type="button" variant={selectedComment.generated ? "primary" : "ai"} onClick={selectedComment.generated ? saveAndGoNext : generateSingle} disabled={batchRunning || singleGenerationPhase !== "idle"} className="h-10 min-w-[168px]">
                  {selectedComment.generated ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{selectedComment.generated ? "保存并下一位" : "生成评语"}
                </Button>
                {selectedComment.generated && <IconButton label="重新生成" size="lg" onClick={generateSingle} disabled={batchRunning || singleGenerationPhase !== "idle"}><Sparkles className="h-4 w-4" /></IconButton>}
                <IconButton label="保存" size="lg" disabled={batchRunning || singleGenerationPhase !== "idle"} onClick={saveSelectedComment}><Save className="h-4 w-4" /></IconButton>
                <IconButton label="复制" size="lg" onClick={() => { if (selectedComment.text) navigator.clipboard.writeText(selectedComment.text).then(() => setAiStatus("评语已复制。")).catch(() => setAiStatus("复制失败，请选中正文后手动复制。")); }} disabled={!selectedComment.text}><Copy className="h-4 w-4" /></IconButton>
              </div>
            </div>
          </section>
          </MotionSwitch>
        </main>

        <aside hidden={isMobile && mobilePane !== "materials"} data-mobile-pane="materials" className="comment-workbench-pane comment-workbench-materials min-h-0 border-l border-[var(--app-border)] bg-background-primary-default">
          <MotionSwitch transitionKey={selectedId} contentIndex={selectedStudentIndex} fixed className="h-full">
          <section className="flex h-full min-h-0 flex-col bg-background-primary-default">
            <div className="shrink-0 border-b border-[var(--app-border)] px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-headline-semibold text-text-primary">素材与 AI</h3>
                  <p className="mt-0.5 text-caption-1-regular text-text-tertiary">为当前评语补充依据</p>
                </div>
                <button type="button" aria-expanded={showFollowupPanel} onClick={() => setShowFollowupPanel(value => !value)} className={`flex h-8 shrink-0 items-center gap-1 rounded-[var(--app-radius-sm)] px-2.5 text-caption-1-semibold transition-colors ${showFollowupPanel ? "bg-background-tertiary-default text-text-primary" : "border border-border-button-default bg-background-primary-default text-text-secondary hover:bg-background-secondary-default"}`}>
                  <Sparkles className="h-3.5 w-3.5 text-status-ai-500" />AI 补充
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div data-motion-shift>
              <div className="border-b border-[var(--app-border)] px-3 py-2.5">
              <button type="button" aria-expanded={showGenerationSettings} onClick={() => setShowGenerationSettings(value => !value)} className="flex h-10 w-full items-center justify-between rounded-[var(--app-radius-sm)] bg-background-secondary-default px-3 text-left">
                <span className="flex items-center gap-2 text-body-semibold text-text-primary"><Settings2 className="h-4 w-4 text-text-tertiary" />生成设置</span>
                <span className="flex items-center gap-1 text-caption-1-semibold text-text-secondary">{selectedLengthLabel}字 · {selectedStyleLabel}<ChevronDown className={`h-4 w-4 transition-transform ${showGenerationSettings ? "rotate-180" : ""}`} /></span>
              </button>
              <MotionCollapse open={showGenerationSettings}>
                <div className="overflow-hidden">
                  <div className="space-y-3 pt-3">
                    <div>
                      <div className="mb-1.5 text-caption-1-semibold text-text-secondary">字数目标</div>
                      <SegmentedControl value={selectedComment.lengthMode} ariaLabel="评语字数目标" onChange={value => updateComment(selectedId, { lengthMode: value })} options={[...LENGTH_MODES]} className="flex w-full" />
                      {selectedComment.lengthMode === "custom" && <input type="number" aria-label="自定义字数" value={selectedComment.targetWordCount || ""} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) updateComment(selectedId, { targetWordCount: Math.min(999, Math.max(0, Math.round(value))) }); }} onBlur={() => updateComment(selectedId, { targetWordCount: Math.max(10, selectedComment.targetWordCount || 120) })} min={10} max={999} placeholder="自定义字数" className="mt-2 h-9 w-full rounded-[var(--app-radius-sm)] border border-border-button-default px-3 text-body-regular outline-none focus:border-accent-300" />}
                    </div>
                    <div>
                      <div className="mb-1.5 text-caption-1-semibold text-text-secondary">评语风格</div>
                      <SegmentedControl value={selectedComment.style} ariaLabel="评语风格" onChange={value => updateComment(selectedId, { style: value })} options={[...STYLES]} className="flex w-full" />
                    </div>
                  </div>
                </div>
              </MotionCollapse>
            </div>

              {!hasAuth && (
              <div className="shrink-0 border-b border-separator-border bg-background-secondary-default p-3">
                <div className="mb-2 flex items-center gap-1.5 text-caption-1-semibold text-text-secondary"><Sparkles className="h-3.5 w-3.5 text-status-ai-500" />连接 AI 生成评语</div>
                <div className="flex items-center gap-2">
                  <input type="password" value={accessCode} onChange={event => setAccessCode(event.target.value)} placeholder="AI 授权码" className="h-9 min-w-0 flex-1 rounded-[var(--app-radius-sm)] border border-border-button-default bg-background-primary-default px-3 text-body-regular outline-none focus:border-accent-300" />
                  <label className="flex shrink-0 items-center gap-1 text-caption-1-regular text-text-secondary"><input type="checkbox" checked={rememberAuth} onChange={event => setRememberAuth(event.target.checked)} className="accent-accent-600" />记住</label>
                </div>
              </div>
            )}

              <div className="border-b border-[var(--app-border)] px-3 py-2.5">
              <button type="button" aria-expanded={showTeacherNote} onClick={() => setShowTeacherNote(value => !value)} className="flex h-9 w-full items-center justify-between text-left">
                <span className="flex items-center gap-2 text-body-semibold text-text-primary">老师补充说明{selectedComment.needsInfo && <span className="rounded-full bg-status-warning-50 px-2 py-0.5 text-[10px] text-status-warning-700">建议补充</span>}</span>
                <ChevronDown className={`h-4 w-4 text-text-tertiary transition-transform ${showTeacherNote ? "rotate-180" : ""}`} />
              </button>
              <MotionCollapse open={showTeacherNote}>
                <div className="overflow-hidden">
                  <textarea value={teacherNote} onChange={event => { revision.current.set(selectedId, (revision.current.get(selectedId) || 0) + 1); setTeacherNote(event.target.value); cacheSelectedCommentText(selectedComment.text, event.target.value); }} rows={3} placeholder="例如：回答问题积极，作业偶尔拖交，数学进步明显。" className="mt-1 w-full resize-none rounded-[var(--app-radius-sm)] border border-border-button-default bg-background-primary-default px-3 py-2.5 text-body-regular leading-5 outline-none focus:border-accent-300" />
                  <div className="mt-2 flex justify-end"><button type="button" onClick={saveSelectedTeacherNote} disabled={!hasUnsavedTeacherNote} className={`flex h-8 items-center gap-1.5 rounded-[var(--app-radius-sm)] px-3 text-caption-1-semibold ${hasUnsavedTeacherNote ? "bg-accent-50 text-accent-700 hover:bg-accent-100" : "bg-background-secondary-default text-text-tertiary"}`}><Save className="h-3.5 w-3.5" />暂存说明</button></div>
                </div>
              </MotionCollapse>
            </div>

              <MotionCollapse open={showFollowupPanel}>
                <div className="border-b border-separator-border p-3">
                  <AiStudentFollowupPanel compact student={selectedStudent} context={{ scenario: "comment", teacherNote, commentDraft: buildDraft(selectedComment, teacherNote) }} onAppendCommentMaterial={appendFollowupMaterialToTeacherNote} />
                </div>
              </MotionCollapse>

              {selectedProfile && (
                <div className="p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="text-body-semibold text-text-primary">评语素材</h3>
                      <span className="rounded-full bg-accent-50 px-2 py-0.5 text-caption-1-semibold text-accent-700">{selectedCount} 项</span>
                    </div>
                    <button type="button" onClick={addCriterion} className="flex h-8 shrink-0 items-center gap-1 rounded-[var(--app-radius-sm)] border border-border-button-default bg-background-primary-default px-2 text-caption-1-semibold text-text-secondary transition-colors hover:bg-background-secondary-default">
                      <Settings2 className="h-3.5 w-3.5" />新增标准
                    </button>
                  </div>
                  <div className="mb-3 rounded-[var(--app-radius-sm)] bg-background-secondary-default px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-caption-1-semibold text-text-secondary">已选素材</span>
                      {selectedCount > 0 && <button type="button" onClick={clearAllSelectedMaterials} className="text-caption-1-regular text-text-tertiary hover:text-status-danger-600">全部清空</button>}
                    </div>
                    <div className="mt-1.5 flex min-w-0 flex-wrap gap-1.5">
                      {selectedMaterialLabels.length ? selectedMaterialLabels.slice(0, 3).map((label, index) => <span key={`${label}-${index}`} className="rounded-full border border-accent-100 bg-background-primary-default px-2 py-0.5 text-caption-1-semibold text-accent-700">{label}</span>) : <span className="text-caption-1-regular leading-5 text-text-tertiary">选择下方素材，帮助 AI 生成更具体的评语</span>}
                      {selectedMaterialLabels.length > 3 && <span className="text-caption-1-semibold text-text-tertiary">+{selectedMaterialLabels.length - 3}</span>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {rubric.criteria.filter(criterion => !criterion.hidden).map(criterion => {
                      const selected = new Set(selectedProfile.criteriaValues[criterion.id] || []);
                      const customOptions = selectedProfile.customOptions[criterion.id] || [];
                      const open = expandedCriteria.has(criterion.id);
                      const criterionSelectedCount = selected.size + customOptions.length;
                      return (
                        <article key={criterion.id} className={`overflow-hidden rounded-[var(--app-radius-sm)] border transition-[border-color,box-shadow] duration-200 ${open ? "border-accent-100 shadow-sm" : "border-border-button-default"}`}>
                          <button type="button" aria-expanded={open} onClick={() => toggleCriterionExpanded(criterion.id)} className="flex h-10 w-full items-center justify-between gap-2 bg-background-primary-default px-3 text-left transition-colors hover:bg-background-secondary-default">
                            <span className="flex min-w-0 items-center gap-1.5 text-body-semibold text-text-primary">
                              <span className="truncate">{criterion.label}</span>
                              {criterionSelectedCount > 0 && <span className="shrink-0 rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] text-accent-700">{criterionSelectedCount}</span>}
                            </span>
                            <ChevronDown className={`h-4 w-4 shrink-0 text-text-tertiary transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                          </button>
                          <MotionCollapse open={open}>
                            <div className="overflow-hidden">
                              <div className="border-t border-separator-border bg-background-secondary-default/40 px-3 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {criterion.options.map(option => {
                                    const active = selected.has(option.id);
                                    return <button key={option.id} type="button" aria-pressed={active} onClick={() => toggleCriterionOption(criterion, option.id)} className={`h-8 rounded-full border px-2.5 text-caption-1-semibold transition-[background-color,border-color,color,transform] active:scale-95 ${active ? "border-accent-600 bg-accent-600 text-text-white" : "border-border-button-default bg-background-primary-default text-text-secondary hover:border-accent-200 hover:bg-accent-50"}`}>{option.label}</button>;
                                  })}
                                  {customOptions.map(option => <button key={option.id} type="button" onClick={() => removeStudentCustomOption(criterion.id, option.id)} title="点击移除自定义素材" className="h-8 rounded-full border border-status-success-100 bg-status-success-50 px-2.5 text-caption-1-semibold text-status-success-700">{option.label}</button>)}
                                  <button type="button" onClick={() => { setCustomMaterialCriterionId(criterion.id); setCustomMaterialLabel(""); }} className="h-8 rounded-full border border-dashed border-border-button-hover bg-background-primary-default px-2.5 text-caption-1-semibold text-text-tertiary hover:bg-background-secondary-default"><Plus className="mr-1 inline h-3 w-3" />自定义</button>
                                </div>
                                {customMaterialCriterionId === criterion.id && <div className="mt-2 flex gap-2"><input autoFocus value={customMaterialLabel} onChange={event => setCustomMaterialLabel(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addStudentCustomOption(criterion); if (event.key === "Escape") setCustomMaterialCriterionId(""); }} maxLength={30} placeholder={`补充${criterion.label}素材`} className="h-9 min-w-0 flex-1 rounded-[var(--app-radius-sm)] border border-border-button-default bg-background-primary-default px-3 text-body-regular outline-none focus:border-accent-300"/><button type="button" onClick={() => addStudentCustomOption(criterion)} className="h-9 rounded-[var(--app-radius-sm)] bg-accent-600 px-3 text-body-semibold text-text-white hover:bg-accent-700">添加</button></div>}
                                {criterionSelectedCount > 0 && <div className="mt-2 flex justify-end"><button type="button" onClick={() => clearCriterion(criterion.id)} className="text-caption-1-regular text-text-tertiary hover:text-status-danger-600">清空本组</button></div>}
                              </div>
                            </div>
                          </MotionCollapse>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
              </div>
            </div>
          </section>
          </MotionSwitch>
        </aside>
      </div>

      {createPortal(<DialogPresence open={showExportModal}>{showExportModal && (
        <div
          className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-[90] flex items-center justify-center p-4"
          onClick={() => setShowExportModal(false)}
        >
          <div
            ref={exportPanelRef} role="dialog" aria-modal="true" aria-label="导出评语" tabIndex={-1}
            className="modal-panel-enter app-modal-panel flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-separator-border px-5 py-3.5">
              <h3 className="text-headline-semibold text-text-primary">导出评语</h3>
              <button
                aria-label="关闭导出评语"
                onClick={() => setShowExportModal(false)}
                className="grid h-8 w-8 place-items-center rounded-xl text-text-tertiary hover:bg-background-tertiary-default hover:text-text-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-separator-border px-5 py-3">
              <div className="flex min-w-0 items-center gap-4">
                <button
                  onClick={() => setExportSelectedIds(prev => (prev.size === students.length ? new Set() : new Set(students.map(s => s.id))))}
                  className="flex shrink-0 items-center gap-2 text-body-semibold text-text-primary"
                >
                  <span className={`grid h-4 w-4 place-items-center rounded border ${exportSelectedIds.size === students.length ? "border-accent-600 bg-accent-600 text-text-white" : "border-border-button-hover"}`}>
                    {exportSelectedIds.size === students.length && <Check className="h-3 w-3" />}
                  </span>
                  全选
                </button>
                <button
                  onClick={() => setExportSelectedIds(prev => {
                    const next = new Set(prev);
                    if (allGeneratedExportSelected) generatedExportIds.forEach(id => next.delete(id));
                    else generatedExportIds.forEach(id => next.add(id));
                    return next;
                  })}
                  disabled={generatedExportIds.size === 0}
                  className="flex shrink-0 items-center gap-2 text-body-semibold text-text-primary disabled:text-text-tertiary"
                >
                  <span className={`grid h-4 w-4 place-items-center rounded border ${
                    allGeneratedExportSelected ? "border-accent-600 bg-accent-600 text-text-white" : "border-border-button-hover"
                  }`}>
                    {allGeneratedExportSelected && <Check className="h-3 w-3" />}
                  </span>
                  已生成
                </button>
              </div>
              <span className="text-caption-1-regular text-text-tertiary">已选 {exportSelectedIds.size} / {students.length} 人</span>
            </div>

            <div className="max-h-80 flex-1 overflow-y-auto border-b border-separator-border px-2 py-1">
              {students.map(student => {
                const state = comments.find(c => c.studentId === student.id);
                const checked = exportSelectedIds.has(student.id);
                return (
                  <button
                    key={student.id}
                    onClick={() => setExportSelectedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(student.id)) next.delete(student.id);
                      else next.add(student.id);
                      return next;
                    })}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-background-secondary-default"
                  >
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${checked ? "border-accent-600 bg-accent-600 text-text-white" : "border-border-button-hover"}`}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 text-body-regular text-text-primary">{student.name}</span>
                    <span className="text-caption-1-regular text-text-tertiary">{state?.generated ? `${state.text.length} 字` : "未生成"}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex shrink-0 items-center gap-3 px-5 py-3.5">
              <div className="flex rounded-xl border border-border-button-default p-0.5">
                <button
                  onClick={() => setExportFormat("csv")}
                  className={`rounded-lg px-3 py-1.5 text-caption-1-semibold transition-colors ${exportFormat === "csv" ? "bg-accent-600 text-text-white" : "text-text-secondary"}`}
                >
                  CSV
                </button>
                <button
                  onClick={() => setExportFormat("txt")}
                  className={`rounded-lg px-3 py-1.5 text-caption-1-semibold transition-colors ${exportFormat === "txt" ? "bg-accent-600 text-text-white" : "text-text-secondary"}`}
                >
                  纯文本
                </button>
              </div>
              <button
                onClick={() => exportSelectedComments(exportFormat)}
                disabled={exportSelectedIds.size === 0}
                className="flex-1 rounded-xl bg-accent-600 py-2.5 text-body-semibold text-text-white transition-colors hover:bg-accent-700 disabled:bg-background-tertiary-default disabled:text-text-tertiary"
              >
                {exportSelectedIds.size > 0 ? `导出 ${exportSelectedIds.size} 人` : "导出"}
              </button>
            </div>
          </div>
        </div>
      )}</DialogPresence>, document.body)}
      {appDialog.dialog}
    </div>
  );
}
