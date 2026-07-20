import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
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
import { readStudentCommentDraft, saveStudentCommentDraft } from "../state/commentStorage";
import {
  readCommentRubric,
  readStudentCommentProfile,
  saveCommentRubric,
  saveStudentCommentProfile,
  summarizeCommentProfile,
} from "../state/commentRubricStorage";
import type { AppStudent, CommentCriterion, CommentRubric, StudentCommentDraft, StudentCommentProfile, StudentId } from "../state/types";
import { AiGenerationPanel, Button, SegmentedControl, useAppDialog } from "./ui";
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

interface CommentState {
  studentId: StudentId;
  text: string;
  generated: boolean;
  needsInfo: boolean;
  failed: boolean;
  lengthMode: string;
  style: string;
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
  selectionRects: Array<{ left: number; top: number; width: number; height: number }>;
}

function measureSelectionPosition(textarea: HTMLTextAreaElement, selectionStart: number, selectionEnd: number) {
  const computed = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${textarea.offsetWidth}px`,
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
  const selectionRects = Array.from(selectedSpan.getClientRects()).map(rect => ({
    left: rect.left - mirrorRect.left - textarea.scrollLeft,
    top: rect.top - mirrorRect.top - textarea.scrollTop,
    width: Math.max(4, rect.width),
    height: rect.height,
  })).filter(rect => rect.top + rect.height > 0 && rect.top < textarea.clientHeight);
  const anchor = selectionRects[selectionRects.length - 1] || { left: 8, top: 8, width: 4, height: 28 };
  const rawLeft = anchor.left;
  const rawTop = anchor.top + anchor.height + 8;
  mirror.remove();
  return {
    left: Math.min(Math.max(8, rawLeft), Math.max(8, textarea.clientWidth - 238)),
    top: Math.min(Math.max(8, rawTop), Math.max(8, textarea.clientHeight - 42)),
    selectionRects,
  };
}

function buildInitialComments(students: AppStudent[], failedIds: StudentId[] = []): CommentState[] {
  const failedSet = new Set(failedIds);
  return students.map(s => {
    const draft = readStudentCommentDraft(s);
    return {
    studentId: s.id,
    text: draft.generatedComment,
    generated: Boolean(draft.generatedComment),
    needsInfo: failedSet.has(s.id) || (s.academicTags.length === 0 && !draft.teacherNote),
    failed: failedSet.has(s.id),
    lengthMode: draft.lengthMode,
    style: draft.style,
  };
  });
}

interface Props {
  students: AppStudent[];
  transitionState: "preparing" | "open" | "closing";
  onClose: () => void;
  onExitComplete: () => void;
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

export function CommentWorkbench({ students, transitionState, onClose, onExitComplete, onSelectStudent }: Props) {
  const appDialog = useAppDialog();
  const initialBatchState = useMemo(() => loadCommentBatchState(students), [students]);
  const initialRubric = useMemo(() => readCommentRubric(), []);
  const [comments, setComments] = useState<CommentState[]>(() => buildInitialComments(students, initialBatchState.failed));
  const [rubric, setRubric] = useState<CommentRubric>(() => initialRubric);
  const [commentProfiles, setCommentProfiles] = useState<Record<StudentId, StudentCommentProfile>>(() =>
    Object.fromEntries(students.map(student => [student.id, readStudentCommentProfile(student)]))
  );
  const [selectedId, setSelectedId] = useState<StudentId>(students[0]?.id || "");
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
  const [showTeacherNote, setShowTeacherNote] = useState(false);
  const [teacherNote, setTeacherNote] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchState, setBatchState] = useState<CommentBatchState>(() => initialBatchState);
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiAuth());
  const [aiStatus, setAiStatus] = useState("AI 会使用学生成绩、标签和教师补充评价生成。");
  const [singleGenerationPhase, setSingleGenerationPhase] = useState<SingleGenerationPhase>("idle");
  const [displayedCommentText, setDisplayedCommentText] = useState(() => comments[0]?.text || "");
  const [commentSelection, setCommentSelection] = useState<CommentTextSelection | null>(null);
  const [refinementPhase, setRefinementPhase] = useState<RefinementPhase>("idle");
  const [refinementSuggestion, setRefinementSuggestion] = useState("");
  const [customWordCount, setCustomWordCount] = useState(120);
  const [customMaterialCriterionId, setCustomMaterialCriterionId] = useState("");
  const [customMaterialLabel, setCustomMaterialLabel] = useState("");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFollowupPanel, setShowFollowupPanel] = useState(false);
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<StudentId>>(() => new Set());
  const [exportFormat, setExportFormat] = useState<"csv" | "txt">("csv");
  const pauseRequested = useRef(false);
  const workbenchRef = useRef<HTMLDivElement>(null);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionGeometryFrame = useRef<number | null>(null);
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

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const state = comments.find(c => c.studentId === s.id)!;
      if (filterSearch && !s.name.includes(filterSearch)) return false;
      if (filterMode === "pending" && state.generated) return false;
      if (filterMode === "needsInfo" && !state.needsInfo) return false;
      return true;
    });
  }, [comments, filterMode, filterSearch, students]);
  const filteredStudentIds = useMemo(() => filteredStudents.map(student => student.id), [filteredStudents]);
  const selectedBatchCount = selectedBatchIds.size;
  const allFilteredSelected = filteredStudentIds.length > 0 && filteredStudentIds.every(id => selectedBatchIds.has(id));

  const selectedStudent = students.find(s => s.id === selectedId) || students[0];
  const selectedComment = comments.find(c => c.studentId === selectedStudent?.id) || comments[0];
  const selectedProfile = selectedStudent ? commentProfiles[selectedStudent.id] || readStudentCommentProfile(selectedStudent) : null;
  const selectedSummary = selectedProfile ? summarizeCommentProfile(rubric, selectedProfile) : { criteriaSummary: [], customOptions: [] };
  const latestExam = selectedStudent?.exams[0];

  useEffect(() => {
    if (selectedProfile) {
      setTeacherNote(selectedProfile.teacherNote);
      setShowTeacherNote(Boolean(selectedProfile.teacherNote || selectedComment?.needsInfo));
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
  }, [selectedComment?.needsInfo, selectedId, selectedProfile]);

  useEffect(() => {
    workbenchRef.current?.focus();
  }, []);

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
      if (selectionGeometryFrame.current !== null) window.cancelAnimationFrame(selectionGeometryFrame.current);
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

  function handleWorkbenchKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (showExportModal) setShowExportModal(false);
      else if (commentSelection || refinementPhase !== "idle") dismissCommentRefinement();
      else onClose();
      return;
    }
    if (event.key !== "Tab" || !workbenchRef.current) return;
    const focusable = Array.from(workbenchRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(element => !element.closest("[inert]") && element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === workbenchRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function updateComment(id: StudentId, patch: Partial<CommentState>) {
    setComments(prev => prev.map(c => c.studentId === id ? { ...c, ...patch } : c));
  }

  function dismissCommentRefinement() {
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
    const position = measureSelectionPosition(textarea, start, end);
    const sameSelection = commentSelection?.start === start && commentSelection.end === end && commentSelection.text === text;
    setCommentSelection({ start, end, text, actionLeft: position.left, actionTop: position.top, selectionRects: position.selectionRects });
    if (!sameSelection) {
      setRefinementPhase("idle");
      setRefinementSuggestion("");
    }
  }

  function refreshCommentSelectionGeometry() {
    const textarea = commentTextareaRef.current;
    if (!textarea || !commentSelection || selectionGeometryFrame.current !== null) return;
    const selection = commentSelection;
    selectionGeometryFrame.current = window.requestAnimationFrame(() => {
      selectionGeometryFrame.current = null;
      const position = measureSelectionPosition(textarea, selection.start, selection.end);
      setCommentSelection(current => {
        if (!current || current.start !== selection.start || current.end !== selection.end || current.text !== selection.text) return current;
        return { ...current, actionLeft: position.left, actionTop: position.top, selectionRects: position.selectionRects };
      });
    });
  }

  async function requestCommentRefinement(action: CommentRefinementAction) {
    if (!selectedStudent || !selectedComment || !commentSelection || refinementPhase === "loading") return;
    if (commentSelection.text.length > 600) {
      setAiStatus("一次最多优化 600 个字，请缩小选中文字范围。");
      return;
    }
    setRefinementPhase("loading");
    setRefinementSuggestion("");
    const actionLabel = COMMENT_REFINEMENT_ACTIONS.find(item => item.value === action)?.label || "优化表达";
    setAiStatus(`正在${actionLabel}选中的文字，原文不会被自动替换。`);
    try {
      const result = await refineCommentSelection({
        studentId: selectedStudent.id,
        action,
        selectedText: commentSelection.text,
        contextBefore: selectedComment.text.slice(0, commentSelection.start),
        contextAfter: selectedComment.text.slice(commentSelection.end),
        accessCode,
        remember: rememberAuth,
      });
      setRefinementSuggestion(result.replacement);
      setRefinementPhase("ready");
      setAiStatus("AI 已给出局部修改建议，请确认后再应用到当前草稿。");
    } catch (error) {
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
    setCommentProfiles(prev => {
      Object.entries(prev).forEach(([studentId, profile]) => {
        saveStudentCommentProfile(studentId, saved, profile);
      });
      return { ...prev };
    });
  }

  function updateSelectedProfile(updater: (profile: StudentCommentProfile) => StudentCommentProfile) {
    if (!selectedStudent || !selectedProfile) {
      return;
    }
    const nextProfile = updater({ ...selectedProfile });
    const saved = saveStudentCommentProfile(selectedStudent.id, rubric, nextProfile);
    setCommentProfiles(prev => ({ ...prev, [selectedStudent.id]: saved }));
    setTeacherNote(saved.teacherNote);
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
    const profile = commentProfiles[comment.studentId];
    const summary = profile ? summarizeCommentProfile(rubric, profile) : { criteriaSummary: [], customOptions: [] };
    const draftTeacherNote = note ?? (comment.studentId === selectedId ? teacherNote : profile?.teacherNote || "");
    return {
      generatedComment: comment.text,
      teacherNote: draftTeacherNote,
      style: comment.style as "warm" | "formal" | "brief",
      lengthMode: comment.lengthMode as "short" | "standard" | "long" | "custom",
      targetWordCount: resolveCommentWordCount(comment.lengthMode as "short" | "standard" | "long" | "custom", customWordCount),
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
    setSingleGenerationPhase("loading");
    setDisplayedCommentText("");
    setAiStatus(`正在生成 ${selectedStudent.name} 的评语...`);
    try {
      const draft = buildDraft(selectedComment);
      const result = await generateStudentAiComment(selectedStudent, draft, { accessCode, remember: rememberAuth, force: true });
      if (!result.comment) {
        setAiStatus(result.missingInfo?.length ? `需要补充：${result.missingInfo.join("、")}` : "信息不足，暂未生成评语。");
        setDisplayedCommentText(selectedComment.text);
        setSingleGenerationPhase("idle");
        return;
      }
      updateComment(selectedId, { text: result.comment, generated: true, needsInfo: Boolean(result.needsMoreInfo), failed: false });
      if (selectedProfile) {
        setCommentProfiles(prev => ({
          ...prev,
          [selectedId]: {
            ...selectedProfile,
            teacherNote,
            generatedComment: result.comment,
            status: "generated",
            updatedAt: new Date().toISOString(),
          },
        }));
      }
      if (batchState.failed.includes(selectedId)) {
        commitBatchState({
          ...batchState,
          failed: batchState.failed.filter(id => id !== selectedId),
        });
      }
      setAccessCode("");
      setHasAuth(true);
      setAiStatus(`已生成 ${selectedStudent.name} 的评语。`);
      revealGeneratedComment(result.comment);
    } catch (error) {
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
      targetWordCount: resolveCommentWordCount(selectedComment.lengthMode as "short" | "standard" | "long" | "custom", customWordCount),
      updatedAt: new Date().toISOString(),
    });
    updateComment(selectedStudent.id, { text: saved.generatedComment, generated: Boolean(saved.generatedComment) });
  }

  function selectStudent(studentId: StudentId) {
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
    let selectedBatchResult: string | null = null;
    const total = seed.total || queue.length;
    commitBatchState({ ...seed, queue, failed, done, total, status: "running" });

    try {
      for (let i = 0; i < queue.length; i += 1) {
        if (pauseRequested.current) {
          const paused = { queue: queue.slice(i), failed, done, total, status: "paused" as const, updatedAt: "" };
          commitBatchState(paused);
          setAiStatus(`已暂停，剩余 ${paused.queue.length} 人。`);
          return;
        }
        const studentId = queue[i];
        const student = students.find(s => s.id === studentId);
        if (!student) {
          done += 1;
          continue;
        }
        const comment = comments.find(c => c.studentId === studentId);
        if (!comment) {
          done += 1;
          continue;
        }
        setAiStatus(`正在生成 ${done + 1}/${total}：${student.name}`);
        try {
          const result = await generateStudentAiComment(student, buildDraft(comment), {
            accessCode,
            remember: rememberAuth,
            force: true,
          });
          done += 1;
          if (result.comment) {
            if (student.id === selectedId) selectedBatchResult = result.comment;
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
        setAiStatus("批量生成完成。");
      }
    } catch (error) {
      setAiStatus(getAiErrorMessage(error instanceof Error ? error.message : ""));
      setHasAuth(hasStoredAiAuth());
    } finally {
      setBatchRunning(false);
      if (selectedBatchResult) {
        revealGeneratedComment(selectedBatchResult);
      } else {
        setDisplayedCommentText(selectedComment?.text || "");
        setSingleGenerationPhase("idle");
      }
    }
  }

  function startBatch() {
    const failedIds = new Set(batchState.failed);
    const selectedIds = Array.from(selectedBatchIds);
    const pending = selectedIds.length
      ? comments.filter(c => selectedIds.includes(c.studentId))
      : comments.filter(c => !c.generated || failedIds.has(c.studentId));
    if (!pending.length) {
      setAiStatus(selectedIds.length ? "请选择要批量生成的学生。" : "没有待生成的学生。");
      clearBatchState();
      return;
    }
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
      downloadTextFile(`期末评语-${new Date().toISOString().slice(0, 10)}.txt`, text, "text/plain;charset=utf-8");
    } else {
      const rows = [
        ["姓名", "字数", "评语"],
        ...chosen.map(s => {
          const state = comments.find(c => c.studentId === s.id);
          return [s.name, state?.text.length || 0, state?.text || ""];
        }),
      ];
      const content = `\ufeff${rows.map(row => row.map(csvEscape).join(",")).join("\n")}`;
      downloadTextFile(`期末评语-${new Date().toISOString().slice(0, 10)}.csv`, content, "text/csv;charset=utf-8");
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
  const filterModeIndex = filterMode === "all" ? 0 : filterMode === "pending" ? 1 : 2;

  function getCommentStatus(state: CommentState) {
    if (state.failed) {
      return { label: "失败待重试", badge: "bg-red-50 text-red-500 border-red-100", icon: AlertCircle };
    }
    if (state.generated) {
      return { label: "已生成", badge: "bg-emerald-50 text-emerald-600 border-emerald-100", icon: CheckCircle2 };
    }
    if (state.needsInfo) {
      return { label: "需补充", badge: "bg-amber-50 text-amber-600 border-amber-100", icon: AlertCircle };
    }
    return { label: "待生成", badge: "bg-blue-50 text-blue-600 border-blue-100", icon: Clock3 };
  }

  if (!selectedStudent || !selectedComment) {
    return (
      <div role="dialog" aria-modal="true" aria-label="评语工作台" data-transition-state={transitionState} onAnimationEnd={event => { if (event.target === event.currentTarget && transitionState === "closing") onExitComplete(); }} className="comment-workbench-shell fixed inset-0 z-[80] flex flex-col overflow-hidden bg-gray-50">
        <div className="comment-workbench-enter-item shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-gray-900">评语工作台</h2>
          <button aria-label="关闭评语工作台" onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="comment-workbench-enter-item flex-1 grid place-items-center text-gray-400">暂无学生</div>
      </div>
    );
  }

  return (
    <div ref={workbenchRef} role="dialog" aria-modal="true" aria-label="评语工作台" tabIndex={-1} data-transition-state={transitionState} onKeyDown={handleWorkbenchKeyDown} onAnimationEnd={event => { if (event.target === event.currentTarget && transitionState === "closing") onExitComplete(); }} className="comment-workbench-shell fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-text)] outline-none">
      <header className="comment-workbench-enter-item flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[var(--app-border)] bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="shrink-0 text-base font-bold text-gray-900">评语工作台</h2>
          <span className="text-sm font-semibold text-gray-400">
            <span className="text-emerald-600">{generatedCount}</span> / {students.length} 已生成
          </span>
          <div
            aria-hidden={!showHeaderProgress}
            inert={!showHeaderProgress ? true : undefined}
            className={`overflow-hidden transition-[max-width,opacity,transform,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${showHeaderProgress ? "ml-0 max-w-48 translate-x-0 scale-100 opacity-100" : "pointer-events-none -ml-3 max-w-0 -translate-x-2 scale-95 opacity-0"}`}
          >
            <button
              type="button"
              onClick={() => setWorkbenchMode("batch")}
              className="flex h-7 w-48 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-blue-100 bg-blue-50 px-3 text-blue-700"
              title="查看批量任务"
            >
              <span className="h-1.5 w-20 overflow-hidden rounded-full bg-blue-100">
                <span className="block h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${headerProgress}%` }} />
              </span>
              <span className="text-xs font-bold tabular-nums">批量 {headerProgress}%</span>
            </button>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { setExportSelectedIds(new Set(generatedExportIds)); setShowExportModal(true); }}
            className="flex h-9 items-center gap-1.5 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />导出
          </button>
          <button type="button" aria-label="关闭评语工作台" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-[var(--app-radius-sm)] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30">
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="comment-workbench-enter-item grid min-h-0 flex-1 grid-cols-[184px_minmax(520px,1fr)_300px] overflow-hidden xl:grid-cols-[216px_minmax(680px,1fr)_340px]">
        <aside className="flex min-h-0 flex-col border-r border-[var(--app-border)] bg-white">
          <div className="space-y-3 border-b border-[var(--app-border)] p-3">
            <div className="relative grid grid-cols-2 gap-1 rounded-[var(--app-radius-sm)] bg-gray-100 p-1" role="group" aria-label="评语处理模式">
              <span aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-lg bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" style={{ width: "calc((100% - 12px) / 2)", transform: workbenchMode === "batch" ? "translateX(calc(100% + 4px))" : "translateX(0)" }} />
              <button type="button" aria-pressed={workbenchMode === "single"} onClick={() => setWorkbenchMode("single")} className={`relative z-10 flex h-8 items-center justify-center gap-1 rounded-lg text-xs font-semibold transition-colors duration-200 ${workbenchMode === "single" ? "text-blue-700" : "text-gray-500"}`}>
                <UserRound className="h-3.5 w-3.5" />逐人
              </button>
              <button type="button" aria-pressed={workbenchMode === "batch"} onClick={() => setWorkbenchMode("batch")} className={`relative z-10 flex h-8 items-center justify-center gap-1 rounded-lg text-xs font-semibold transition-colors duration-200 ${workbenchMode === "batch" ? "text-blue-700" : "text-gray-500"}`}>
                <Users className="h-3.5 w-3.5" />批量
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input value={filterSearch} onChange={event => setFilterSearch(event.target.value)} placeholder="搜索姓名" className="h-9 w-full rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white" />
            </div>
            <div className="relative grid grid-cols-3 gap-1 rounded-[var(--app-radius-sm)] bg-gray-100 p-1" role="group" aria-label="学生评语状态筛选">
              <span aria-hidden="true" className="pointer-events-none absolute bottom-1 left-1 top-1 rounded-lg bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" style={{ width: "calc((100% - 16px) / 3)", transform: `translateX(calc(${filterModeIndex * 100}% + ${filterModeIndex * 4}px))` }} />
              {([
                { value: "all", label: "全部", count: students.length },
                { value: "pending", label: "待生成", count: pendingCount },
                { value: "needsInfo", label: "需补充", count: needsInfoCount },
              ] as Array<{ value: CommentFilterMode; label: string; count: number }>).map(option => (
                <button key={option.value} type="button" aria-pressed={filterMode === option.value} onClick={() => setFilterMode(option.value)} className={`relative z-10 min-w-0 rounded-lg py-1.5 text-[11px] font-semibold transition-colors duration-200 ${filterMode === option.value ? "text-gray-900" : "text-gray-500"}`}>
                  <span className="block truncate">{option.label}</span>
                  <span className="block text-[10px] tabular-nums opacity-70">{option.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div aria-hidden={workbenchMode !== "batch"} inert={workbenchMode !== "batch" ? true : undefined} className={`grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${workbenchMode === "batch" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="flex h-10 items-center justify-between border-b border-[var(--app-border)] px-3">
                <button type="button" onClick={toggleFilteredBatchSelection} className="flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-blue-700">
                  <input type="checkbox" checked={allFilteredSelected} readOnly className="pointer-events-none accent-blue-600" />
                  全选 {filteredStudents.length}
                </button>
                <button type="button" onClick={() => setSelectedBatchIds(new Set())} className={`text-xs text-gray-400 transition-opacity hover:text-gray-700 ${selectedBatchCount > 0 ? "opacity-100" : "pointer-events-none opacity-0"}`}>清空</button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            <div key={filterMode} className="comment-list-enter">
            {filteredStudents.map(student => {
              const state = comments.find(comment => comment.studentId === student.id)!;
              const active = student.id === selectedId;
              const batchSelected = selectedBatchIds.has(student.id);
              const status = getCommentStatus(state);
              return (
                <div
                  key={student.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectStudent(student.id)}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectStudent(student.id);
                    }
                  }}
                  className={`relative mx-1.5 flex min-h-12 cursor-pointer items-center rounded-[var(--app-radius-sm)] px-2 text-left transition-[background-color,transform] duration-200 hover:bg-blue-50/60 ${active ? "bg-blue-50" : ""}`}
                >
                  <span className={`absolute inset-y-2 left-0 w-0.5 rounded-full bg-blue-600 transition-opacity ${active ? "opacity-100" : "opacity-0"}`} />
                  <span aria-hidden={workbenchMode !== "batch"} inert={workbenchMode !== "batch" ? true : undefined} className={`grid shrink-0 overflow-hidden transition-[width,margin,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${workbenchMode === "batch" ? "mr-2 w-4 translate-x-0 opacity-100" : "mr-0 w-0 -translate-x-2 opacity-0"}`}>
                    <input type="checkbox" checked={batchSelected} onClick={event => event.stopPropagation()} onChange={() => toggleBatchSelection(student.id)} className="h-4 w-4 accent-blue-600" aria-label={`选择 ${student.name} 用于批量生成`} />
                  </span>
                  <span className={`mr-2 grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`}>{student.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-800">{student.name}</span>
                    <span className={`mt-0.5 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${status.badge}`}>{status.label}</span>
                  </span>
                </div>
              );
            })}
            {filteredStudents.length === 0 && <div className="px-3 py-10 text-center text-sm text-gray-400">没有符合条件的学生</div>}
            </div>
          </div>

          <div aria-hidden={workbenchMode !== "batch"} inert={workbenchMode !== "batch" ? true : undefined} className={`grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${workbenchMode === "batch" ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
            <div className="overflow-hidden">
              <div className="border-t border-[var(--app-border)] bg-gray-50 p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                  <span>已选 {selectedBatchCount} 人</span>
                  {batchState.total > 0 && <span className="font-bold text-blue-700">{batchState.done}/{batchState.total}</span>}
                </div>
                <button type="button" onClick={batchButtonAction} className={`flex h-10 w-full items-center justify-center gap-2 rounded-[var(--app-radius-sm)] text-sm font-bold transition-colors ${batchRunning ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                  {batchRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{batchButtonLabel}
                </button>
              </div>
            </div>
          </div>
        </aside>

        <main key={`editor-${selectedId}`} className="comment-detail-enter min-h-0 min-w-0 bg-[var(--app-bg)] p-3 xl:p-4">
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white shadow-[var(--app-shadow-card)]">
            <div className="shrink-0 border-b border-[var(--app-border)] px-4 py-3.5 xl:px-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-base font-bold text-white">{selectedInitial}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-gray-900">{selectedStudent.name} · 学期评语</h3>
                      {selectedStudent.gender && <span className="text-xs font-semibold text-gray-400">{selectedStudent.gender}</span>}
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${getCommentStatus(selectedComment).badge}`}>{getCommentStatus(selectedComment).label}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>{latestExam?.name || "暂无考试"}</span>
                      <span>总分 <b className="text-gray-700">{latestExam?.total ?? "—"}</b></span>
                      <span>{latestExam?.rank ? `第 ${latestExam.rank} 名` : "暂无排名"}</span>
                      {latestExam && <span>优势 <b className="text-emerald-600">{getBestSubject(latestExam.scores) || "—"}</b> · 待提升 <b className="text-amber-600">{getWeakSubject(latestExam.scores) || "—"}</b></span>}
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => onSelectStudent(selectedStudent)} className="h-9 shrink-0 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50">查看详情</button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 xl:px-6 xl:py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">评语正文</h3>
                </div>
                <span className="shrink-0 text-xs tabular-nums text-gray-400">{selectedComment.text.length} 字</span>
              </div>
              <div className="relative min-h-[260px] flex-1 overflow-hidden rounded-[var(--app-radius-sm)]">
                <textarea
                  ref={commentTextareaRef}
                  value={displayedCommentText}
                  readOnly={singleGenerationPhase !== "idle"}
                  onSelect={handleCommentSelection}
                  onScroll={refreshCommentSelectionGeometry}
                  onChange={event => {
                    dismissCommentRefinement();
                    setDisplayedCommentText(event.target.value);
                    updateComment(selectedId, { text: event.target.value });
                  }}
                  placeholder="点击「生成评语」后会在这里显示；也可以选中文字，让 AI 局部优化表达。"
                  aria-describedby="comment-selection-ai-hint"
                  className={`h-full min-h-[260px] w-full resize-none rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 px-5 py-4 text-[15px] leading-7 outline-none transition-[background-color,border-color,opacity] duration-200 focus:border-blue-300 focus:bg-white ${singleGenerationPhase === "loading" ? "opacity-0" : "opacity-100"}`}
                />
                {commentSelection && commentSelection.selectionRects.length > 0 && singleGenerationPhase === "idle" && refinementPhase === "idle" && (
                  <div
                    role="toolbar"
                    aria-label="AI 优化选中文字"
                    className="selection-ai-actions absolute z-20 flex items-center gap-1 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white p-1 shadow-[var(--app-shadow-float)]"
                    style={{ left: commentSelection.actionLeft, top: commentSelection.actionTop }}
                  >
                    {COMMENT_REFINEMENT_ACTIONS.map(action => (
                      <button
                        key={action.value}
                        type="button"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => requestCommentRefinement(action.value)}
                        className="h-8 rounded-[6px] px-2.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-violet-50 hover:text-violet-700"
                      >
                        {action.label}
                      </button>
                    ))}
                    <button type="button" aria-label="关闭 AI 选区操作" onMouseDown={event => event.preventDefault()} onClick={dismissCommentRefinement} className="grid h-8 w-8 place-items-center rounded-[6px] text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-700">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {commentSelection && refinementPhase === "loading" && commentSelection.selectionRects.map((rect, index) => (
                  <span
                    key={`${rect.left}-${rect.top}-${index}`}
                    aria-hidden="true"
                    className="selection-ai-glass-bar pointer-events-none absolute z-20 rounded-[5px]"
                    style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
                  />
                ))}
                {commentSelection && commentSelection.selectionRects.length > 0 && refinementPhase === "ready" && refinementSuggestion && (
                  <span
                    aria-hidden="true"
                    className="selection-ai-inline-diff pointer-events-none absolute z-20 inline-flex max-w-[calc(100%-24px)] items-center gap-2 overflow-hidden rounded-[6px] border border-blue-100 bg-white/90 px-1.5 py-0.5 text-[15px] leading-7 shadow-sm backdrop-blur-md"
                    style={{
                      left: commentSelection.selectionRects[0]?.left ?? 8,
                      top: commentSelection.selectionRects[0]?.top ?? 8,
                    }}
                  >
                    <span className="selection-ai-inline-old relative shrink-0 text-gray-400">{commentSelection.text}</span>
                    <span className="selection-ai-inline-new min-w-0 truncate font-medium text-gray-800">{refinementSuggestion}</span>
                  </span>
                )}
                {singleGenerationPhase === "loading" && (
                  <div className="absolute inset-0"><AiGenerationPanel compact title={batchRunning ? "正在批量生成评语" : "正在生成评语"} steps={["整理学生素材", "组织评语结构", "生成评语草稿"]} /></div>
                )}
                {singleGenerationPhase === "revealing" && <span aria-hidden="true" className="ai-comment-reveal-glow pointer-events-none absolute inset-0 rounded-[var(--app-radius-sm)]" />}
              </div>
              <p id="comment-selection-ai-hint" className="mt-2 shrink-0 text-xs text-gray-400">选中文字后可使用“优化表达 / 更具体 / 缩短”；AI 只生成建议，不会自动覆盖或保存。</p>
              {refinementPhase === "ready" && commentSelection && refinementSuggestion && (
                <section aria-label="AI 局部修改建议" aria-live="polite" className="mt-3 shrink-0 rounded-[var(--app-radius-sm)] border border-violet-200 bg-violet-50/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-violet-700"><Sparkles className="h-3.5 w-3.5" />AI 局部修改建议</div>
                    <span className="text-[11px] font-semibold text-violet-400">应用前由教师确认</span>
                  </div>
                  <div className="mt-2 grid gap-2 text-sm leading-6 lg:grid-cols-2">
                    <div className="rounded-[var(--app-radius-sm)] bg-white/80 px-3 py-2 text-gray-500"><span className="mb-1 block text-[11px] font-bold text-gray-400">原文</span>{commentSelection.text}</div>
                    <div className="rounded-[var(--app-radius-sm)] bg-white px-3 py-2 text-gray-800 shadow-sm"><span className="mb-1 block text-[11px] font-bold text-violet-600">建议</span>{refinementSuggestion}</div>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={dismissCommentRefinement}>保留原文</Button>
                    <Button type="button" size="sm" onClick={applyCommentRefinement} className="bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300">应用替换</Button>
                  </div>
                </section>
              )}
              <div className="mt-3 shrink-0 rounded-[var(--app-radius-sm)] bg-blue-50/70 px-3 py-2 text-xs leading-5 text-blue-700" role="status">{aiStatus}</div>
            </div>

            <div className="shrink-0 border-t border-[var(--app-border)] bg-white px-4 py-3 xl:px-6">
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={selectedComment.generated ? saveAndGoNext : generateSingle} disabled={batchRunning || singleGenerationPhase !== "idle"} className="flex h-10 min-w-[168px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[var(--app-radius-sm)] bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:opacity-60">
                  {selectedComment.generated ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{selectedComment.generated ? "保存并下一位" : "生成评语"}
                </button>
                {selectedComment.generated && <button type="button" aria-label="重新生成" title="重新生成" onClick={generateSingle} disabled={batchRunning || singleGenerationPhase !== "idle"} className="grid h-10 w-10 place-items-center rounded-[var(--app-radius-sm)] bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50"><Sparkles className="h-4 w-4" /></button>}
                <button type="button" onClick={saveSelectedComment} className="grid h-10 w-10 place-items-center rounded-[var(--app-radius-sm)] bg-gray-100 text-gray-600 hover:bg-gray-200" title="保存"><Save className="h-4 w-4" /></button>
                <button type="button" onClick={() => { if (selectedComment.text) navigator.clipboard.writeText(selectedComment.text).catch(() => {}); }} disabled={!selectedComment.text} className="grid h-10 w-10 place-items-center rounded-[var(--app-radius-sm)] bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40" title="复制"><Copy className="h-4 w-4" /></button>
              </div>
            </div>
          </section>
        </main>

        <aside key={`tools-${selectedId}`} className="comment-detail-enter min-h-0 border-l border-[var(--app-border)] bg-gray-50 p-3">
          <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white shadow-[var(--app-shadow-card)]">
            <div className="shrink-0 border-b border-[var(--app-border)] px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-gray-900">素材与 AI</h3>
                  <p className="mt-0.5 text-xs text-gray-400">为当前评语补充依据</p>
                </div>
                <button type="button" aria-expanded={showFollowupPanel} onClick={() => setShowFollowupPanel(value => !value)} className={`flex h-8 shrink-0 items-center gap-1 rounded-[var(--app-radius-sm)] px-2.5 text-xs font-semibold transition-colors ${showFollowupPanel ? "bg-violet-600 text-white" : "border border-violet-100 bg-violet-50 text-violet-700 hover:bg-violet-100"}`}>
                  <Sparkles className="h-3.5 w-3.5" />AI 补充
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="border-b border-[var(--app-border)] px-3 py-2.5">
              <button type="button" aria-expanded={showGenerationSettings} onClick={() => setShowGenerationSettings(value => !value)} className="flex h-10 w-full items-center justify-between rounded-[var(--app-radius-sm)] bg-gray-50 px-3 text-left">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-700"><Settings2 className="h-4 w-4 text-gray-400" />生成设置</span>
                <span className="flex items-center gap-1 text-xs font-semibold text-gray-500">{selectedLengthLabel}字 · {selectedStyleLabel}<ChevronDown className={`h-4 w-4 transition-transform ${showGenerationSettings ? "rotate-180" : ""}`} /></span>
              </button>
              <div aria-hidden={!showGenerationSettings} inert={!showGenerationSettings ? true : undefined} className={`grid transition-[grid-template-rows,opacity] duration-200 ${showGenerationSettings ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="space-y-3 pt-3">
                    <div>
                      <div className="mb-1.5 text-xs font-semibold text-gray-500">字数目标</div>
                      <SegmentedControl value={selectedComment.lengthMode} ariaLabel="评语字数目标" onChange={value => updateComment(selectedId, { lengthMode: value })} options={[...LENGTH_MODES]} className="flex w-full" />
                      {selectedComment.lengthMode === "custom" && <input type="number" value={customWordCount} onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) setCustomWordCount(value); }} min={10} max={999} placeholder="自定义字数" className="mt-2 h-9 w-full rounded-[var(--app-radius-sm)] border border-gray-200 px-3 text-sm outline-none focus:border-blue-300" />}
                    </div>
                    <div>
                      <div className="mb-1.5 text-xs font-semibold text-gray-500">评语风格</div>
                      <SegmentedControl value={selectedComment.style} ariaLabel="评语风格" onChange={value => updateComment(selectedId, { style: value })} options={[...STYLES]} className="flex w-full" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

              {!hasAuth && (
              <div className="shrink-0 border-b border-violet-100 bg-violet-50 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-violet-700"><Sparkles className="h-3.5 w-3.5" />连接 AI 生成评语</div>
                <div className="flex items-center gap-2">
                  <input type="password" value={accessCode} onChange={event => setAccessCode(event.target.value)} placeholder="AI 授权码" className="h-9 min-w-0 flex-1 rounded-[var(--app-radius-sm)] border border-violet-100 bg-white px-3 text-sm outline-none focus:border-violet-300" />
                  <label className="flex shrink-0 items-center gap-1 text-xs text-violet-700"><input type="checkbox" checked={rememberAuth} onChange={event => setRememberAuth(event.target.checked)} className="accent-violet-600" />记住</label>
                </div>
              </div>
            )}

              <div className="border-b border-[var(--app-border)] px-3 py-2.5">
              <button type="button" aria-expanded={showTeacherNote} onClick={() => setShowTeacherNote(value => !value)} className="flex h-9 w-full items-center justify-between text-left">
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">老师补充说明{selectedComment.needsInfo && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">建议补充</span>}</span>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showTeacherNote ? "rotate-180" : ""}`} />
              </button>
              <div aria-hidden={!showTeacherNote} inert={!showTeacherNote ? true : undefined} className={`grid transition-[grid-template-rows,opacity] duration-200 ${showTeacherNote ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <textarea value={teacherNote} onChange={event => setTeacherNote(event.target.value)} rows={3} placeholder="例如：回答问题积极，作业偶尔拖交，数学进步明显。" className="mt-1 w-full resize-none rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-5 outline-none focus:border-blue-300 focus:bg-white" />
                  <div className="mt-2 flex justify-end"><button type="button" onClick={saveSelectedTeacherNote} disabled={!hasUnsavedTeacherNote} className={`flex h-8 items-center gap-1.5 rounded-[var(--app-radius-sm)] px-3 text-xs font-semibold ${hasUnsavedTeacherNote ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "bg-gray-50 text-gray-300"}`}><Save className="h-3.5 w-3.5" />暂存说明</button></div>
                </div>
              </div>
            </div>

              {showFollowupPanel && (
                <div className="border-b border-violet-100 bg-violet-50/40 p-3">
                  <AiStudentFollowupPanel compact student={selectedStudent} context={{ scenario: "comment", teacherNote, commentDraft: buildDraft(selectedComment, teacherNote) }} onAppendCommentMaterial={appendFollowupMaterialToTeacherNote} />
                </div>
              )}

              {selectedProfile && (
                <div className="p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <h3 className="text-sm font-bold text-gray-900">评语素材</h3>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{selectedCount} 项</span>
                    </div>
                    <button type="button" onClick={addCriterion} className="flex h-8 shrink-0 items-center gap-1 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50">
                      <Settings2 className="h-3.5 w-3.5" />新增标准
                    </button>
                  </div>
                  <div className="mb-3 rounded-[var(--app-radius-sm)] bg-gray-50 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-500">已选素材</span>
                      {selectedCount > 0 && <button type="button" onClick={clearAllSelectedMaterials} className="text-xs text-gray-400 hover:text-red-600">全部清空</button>}
                    </div>
                    <div className="mt-1.5 flex min-w-0 flex-wrap gap-1.5">
                      {selectedMaterialLabels.length ? selectedMaterialLabels.slice(0, 3).map((label, index) => <span key={`${label}-${index}`} className="rounded-full border border-blue-100 bg-white px-2 py-0.5 text-xs font-semibold text-blue-700">{label}</span>) : <span className="text-xs leading-5 text-gray-400">选择下方素材，帮助 AI 生成更具体的评语</span>}
                      {selectedMaterialLabels.length > 3 && <span className="text-xs font-semibold text-gray-400">+{selectedMaterialLabels.length - 3}</span>}
                    </div>
                  </div>
                  <div className="space-y-2">
                    {rubric.criteria.filter(criterion => !criterion.hidden).map(criterion => {
                      const selected = new Set(selectedProfile.criteriaValues[criterion.id] || []);
                      const customOptions = selectedProfile.customOptions[criterion.id] || [];
                      const open = expandedCriteria.has(criterion.id);
                      const criterionSelectedCount = selected.size + customOptions.length;
                      return (
                        <article key={criterion.id} className={`overflow-hidden rounded-[var(--app-radius-sm)] border transition-[border-color,box-shadow] duration-200 ${open ? "border-blue-100 shadow-sm" : "border-gray-200"}`}>
                          <button type="button" aria-expanded={open} onClick={() => toggleCriterionExpanded(criterion.id)} className="flex h-10 w-full items-center justify-between gap-2 bg-white px-3 text-left transition-colors hover:bg-gray-50">
                            <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-gray-800">
                              <span className="truncate">{criterion.label}</span>
                              {criterionSelectedCount > 0 && <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">{criterionSelectedCount}</span>}
                            </span>
                            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
                          </button>
                          <div aria-hidden={!open} inert={!open ? true : undefined} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                            <div className="overflow-hidden">
                              <div className="border-t border-gray-100 bg-gray-50/40 px-3 py-3">
                                <div className="flex flex-wrap gap-1.5">
                                  {criterion.options.map(option => {
                                    const active = selected.has(option.id);
                                    return <button key={option.id} type="button" aria-pressed={active} onClick={() => toggleCriterionOption(criterion, option.id)} className={`h-8 rounded-full border px-2.5 text-xs font-semibold transition-[background-color,border-color,color,transform] active:scale-95 ${active ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50"}`}>{option.label}</button>;
                                  })}
                                  {customOptions.map(option => <button key={option.id} type="button" onClick={() => removeStudentCustomOption(criterion.id, option.id)} title="点击移除自定义素材" className="h-8 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700">{option.label}</button>)}
                                  <button type="button" onClick={() => { setCustomMaterialCriterionId(criterion.id); setCustomMaterialLabel(""); }} className="h-8 rounded-full border border-dashed border-gray-300 bg-white px-2.5 text-xs font-semibold text-gray-400 hover:bg-gray-50"><Plus className="mr-1 inline h-3 w-3" />自定义</button>
                                </div>
                                {customMaterialCriterionId === criterion.id && <div className="mt-2 flex gap-2"><input autoFocus value={customMaterialLabel} onChange={event => setCustomMaterialLabel(event.target.value)} onKeyDown={event => { if (event.key === "Enter") addStudentCustomOption(criterion); if (event.key === "Escape") setCustomMaterialCriterionId(""); }} maxLength={30} placeholder={`补充${criterion.label}素材`} className="h-9 min-w-0 flex-1 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-300"/><button type="button" onClick={() => addStudentCustomOption(criterion)} className="h-9 rounded-[var(--app-radius-sm)] bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700">添加</button></div>}
                                {criterionSelectedCount > 0 && <div className="mt-2 flex justify-end"><button type="button" onClick={() => clearCriterion(criterion.id)} className="text-xs text-gray-400 hover:text-red-600">清空本组</button></div>}
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>

      {showExportModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowExportModal(false)}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3.5">
              <h3 className="text-base text-gray-900" style={{ fontWeight: 800 }}>导出评语</h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="grid h-8 w-8 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
              <div className="flex min-w-0 items-center gap-4">
                <button
                  onClick={() => setExportSelectedIds(prev => (prev.size === students.length ? new Set() : new Set(students.map(s => s.id))))}
                  className="flex shrink-0 items-center gap-2 text-sm text-gray-700"
                  style={{ fontWeight: 800 }}
                >
                  <span className={`grid h-4 w-4 place-items-center rounded border ${exportSelectedIds.size === students.length ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"}`}>
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
                  className="flex shrink-0 items-center gap-2 text-sm text-gray-700 disabled:text-gray-300"
                  style={{ fontWeight: 800 }}
                >
                  <span className={`grid h-4 w-4 place-items-center rounded border ${
                    allGeneratedExportSelected ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"
                  }`}>
                    {allGeneratedExportSelected && <Check className="h-3 w-3" />}
                  </span>
                  已生成
                </button>
              </div>
              <span className="text-xs text-gray-400">已选 {exportSelectedIds.size} / {students.length} 人</span>
            </div>

            <div className="max-h-80 flex-1 overflow-y-auto border-b border-gray-100 px-2 py-1">
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
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                  >
                    <span className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${checked ? "border-blue-600 bg-blue-600 text-white" : "border-gray-300"}`}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <span className="flex-1 text-sm text-gray-800">{student.name}</span>
                    <span className="text-xs text-gray-400">{state?.generated ? `${state.text.length} 字` : "未生成"}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex shrink-0 items-center gap-3 px-5 py-3.5">
              <div className="flex rounded-xl border border-gray-200 p-0.5">
                <button
                  onClick={() => setExportFormat("csv")}
                  className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${exportFormat === "csv" ? "bg-blue-600 text-white" : "text-gray-500"}`}
                  style={{ fontWeight: 800 }}
                >
                  CSV
                </button>
                <button
                  onClick={() => setExportFormat("txt")}
                  className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${exportFormat === "txt" ? "bg-blue-600 text-white" : "text-gray-500"}`}
                  style={{ fontWeight: 800 }}
                >
                  纯文本
                </button>
              </div>
              <button
                onClick={() => exportSelectedComments(exportFormat)}
                disabled={exportSelectedIds.size === 0}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm text-white transition-colors hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"
                style={{ fontWeight: 800 }}
              >
                {exportSelectedIds.size > 0 ? `导出 ${exportSelectedIds.size} 人` : "导出"}
              </button>
            </div>
          </div>
        </div>
      )}
      {appDialog.dialog}
    </div>
  );
}
