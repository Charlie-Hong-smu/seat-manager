import { useEffect, useMemo, useRef, useState } from "react";
import { X, Play, Pause, Copy, Search, Sparkles, Save, Plus, Clock3, AlertCircle, CheckCircle2, Download, Check } from "lucide-react";
import { generateStudentAiComment, hasStoredAiAuth } from "../state/aiCommentService";
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

interface CommentState {
  studentId: StudentId;
  text: string;
  generated: boolean;
  needsInfo: boolean;
  failed: boolean;
  lengthMode: string;
  style: string;
}

interface CommentBatchState {
  queue: StudentId[];
  failed: StudentId[];
  done: number;
  total: number;
  status: "idle" | "running" | "paused" | "failed" | "complete";
  updatedAt: string;
}

const COMMENT_BATCH_STATE_KEY = "seat-manager-ai-comment-batch-state-v1";
type CommentFilterMode = "all" | "pending" | "needsInfo";

function emptyBatchState(): CommentBatchState {
  return {
    queue: [],
    failed: [],
    done: 0,
    total: 0,
    status: "idle",
    updatedAt: "",
  };
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function loadCommentBatchState(students: AppStudent[]): CommentBatchState {
  if (!hasBrowserStorage()) {
    return emptyBatchState();
  }
  try {
    const validIds = new Set(students.map(student => student.id));
    const raw = JSON.parse(window.localStorage.getItem(COMMENT_BATCH_STATE_KEY) || "null") as Partial<CommentBatchState> | null;
    if (!raw || typeof raw !== "object") {
      return emptyBatchState();
    }
    return {
      queue: Array.isArray(raw.queue) ? raw.queue.filter(id => validIds.has(id)) : [],
      failed: Array.isArray(raw.failed) ? raw.failed.filter(id => validIds.has(id)) : [],
      done: Number.isFinite(raw.done) ? Math.max(0, Number(raw.done)) : 0,
      total: Number.isFinite(raw.total) ? Math.max(0, Number(raw.total)) : 0,
      status: raw.status === "running" || raw.status === "paused" || raw.status === "failed" || raw.status === "complete" ? raw.status : "idle",
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "",
    };
  } catch {
    return emptyBatchState();
  }
}

function saveCommentBatchState(state: CommentBatchState): void {
  if (!hasBrowserStorage()) {
    return;
  }
  if (!state.queue.length && !state.failed.length && (state.status === "idle" || state.status === "complete")) {
    window.localStorage.removeItem(COMMENT_BATCH_STATE_KEY);
    return;
  }
  window.localStorage.setItem(COMMENT_BATCH_STATE_KEY, JSON.stringify(state));
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
  onClose: () => void;
  onSelectStudent: (student: AppStudent) => void;
}

const LENGTH_MODES = [
  { value: "short",    label: "80～100" },
  { value: "standard", label: "100～150" },
  { value: "long",     label: "150～200" },
  { value: "custom",   label: "自选" },
];

const STYLES = [
  { value: "warm",   label: "温和鼓励" },
  { value: "formal", label: "客观正式" },
  { value: "brief",  label: "简洁家长会" },
];

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

function makeSafeId(value: string, fallback = "item"): string {
  const safe = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\u4e00-\u9fa5]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  return safe || `${fallback}_${Date.now().toString(36)}`;
}

export function CommentWorkbench({ students, onClose, onSelectStudent }: Props) {
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
  const [teacherNote, setTeacherNote] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchState, setBatchState] = useState<CommentBatchState>(() => initialBatchState);
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiAuth());
  const [aiStatus, setAiStatus] = useState("AI 会使用学生成绩、标签和教师补充评价生成。");
  const [customWordCount, setCustomWordCount] = useState(120);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFollowupPanel, setShowFollowupPanel] = useState(false);
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<StudentId>>(() => new Set());
  const [exportFormat, setExportFormat] = useState<"csv" | "txt">("csv");
  const pauseRequested = useRef(false);
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
    exportSelectedIds.size === generatedExportIds.size &&
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
    }
  }, [selectedId, selectedProfile?.updatedAt]);

  function updateComment(id: StudentId, patch: Partial<CommentState>) {
    setComments(prev => prev.map(c => c.studentId === id ? { ...c, ...patch } : c));
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
    commitBatchState(emptyBatchState());
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
      targetWordCount: comment.lengthMode === "custom" ? customWordCount : comment.lengthMode === "long" ? 175 : comment.lengthMode === "standard" ? 125 : 90,
      updatedAt: new Date().toISOString(),
      criteriaSummary: summary.criteriaSummary,
      customOptions: summary.customOptions,
    };
  }

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

  async function generateSingle() {
    if (!selectedStudent || !selectedComment) return;
    setAiStatus(`正在生成 ${selectedStudent.name} 的评语...`);
    try {
      const draft = buildDraft(selectedComment);
      const result = await generateStudentAiComment(selectedStudent, draft, { accessCode, remember: rememberAuth, force: true });
      if (!result.comment) {
        setAiStatus(result.missingInfo?.length ? `需要补充：${result.missingInfo.join("、")}` : "信息不足，暂未生成评语。");
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
    } catch (error) {
      setAiStatus(getAiErrorMessage(error instanceof Error ? error.message : ""));
      setHasAuth(hasStoredAiAuth());
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
      targetWordCount: selectedComment.lengthMode === "custom" ? customWordCount : selectedComment.lengthMode === "long" ? 175 : selectedComment.lengthMode === "standard" ? 125 : 90,
      updatedAt: new Date().toISOString(),
    });
    updateComment(selectedStudent.id, { text: saved.generatedComment, generated: Boolean(saved.generatedComment) });
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
    updateComment(selectedStudent.id, { needsInfo: false });
    setAiStatus(`已把 AI 跟进素材加入 ${selectedStudent.name} 的补充说明。`);
  }

  function toggleCriterionOption(criterion: CommentCriterion, optionId: string) {
    updateSelectedProfile(profile => {
      const current = new Set(profile.criteriaValues[criterion.id] || []);
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        if (criterion.type === "single") {
          current.clear();
        }
        current.add(optionId);
      }
      return {
        ...profile,
        criteriaValues: { ...profile.criteriaValues, [criterion.id]: [...current] },
        status: profile.generatedComment ? "edited" : "draft",
        updatedAt: new Date().toISOString(),
      };
    });
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
    const label = window.prompt(`为「${criterion.label}」添加自定义素材`);
    if (!label?.trim()) return;
    const id = makeSafeId(label, "custom");
    const item = {
      id,
      label: label.trim(),
      linkedTagId: criterion.syncToTags && label.trim().length <= 6 ? `comment_${criterion.id}_custom_${id}` : "",
      builtIn: false,
    };
    updateSelectedProfile(profile => ({
      ...profile,
      customOptions: {
        ...profile.customOptions,
        [criterion.id]: [...(profile.customOptions[criterion.id] || []), item],
      },
      status: profile.generatedComment ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    }));
  }

  function removeStudentCustomOption(criterionId: string, optionId: string) {
    updateSelectedProfile(profile => ({
      ...profile,
      customOptions: {
        ...profile.customOptions,
        [criterionId]: (profile.customOptions[criterionId] || []).filter(option => option.id !== optionId),
      },
      status: profile.generatedComment ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateCriterion(criterionId: string, patch: Partial<CommentCriterion>) {
    persistRubric({
      ...rubric,
      criteria: rubric.criteria.map(criterion => criterion.id === criterionId ? { ...criterion, ...patch } : criterion),
    });
  }

  function deleteOrHideCriterion(criterion: CommentCriterion) {
    if (criterion.builtIn) {
      updateCriterion(criterion.id, { hidden: !criterion.hidden });
      return;
    }
    persistRubric({
      ...rubric,
      criteria: rubric.criteria.filter(item => item.id !== criterion.id),
    });
  }

  function addCriterion() {
    const label = window.prompt("请输入新标准名称");
    if (!label?.trim()) return;
    const id = makeSafeId(label, "criterion");
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

  function addCriterionOption(criterion: CommentCriterion) {
    const label = window.prompt(`给「${criterion.label}」新增预设选项`);
    if (!label?.trim()) return;
    const id = makeSafeId(label, "option");
    updateCriterion(criterion.id, {
      options: [
        ...criterion.options,
        {
          id,
          label: label.trim(),
          linkedTagId: criterion.syncToTags && label.trim().length <= 6 ? `comment_${criterion.id}_${id}` : "",
          builtIn: false,
        },
      ],
    });
  }

  function removeCriterionOption(criterion: CommentCriterion, optionId: string) {
    updateCriterion(criterion.id, {
      options: criterion.options.filter(option => option.id !== optionId),
    });
    setCommentProfiles(prev => {
      const next: Record<StudentId, StudentCommentProfile> = {};
      Object.entries(prev).forEach(([studentId, profile]) => {
        const cleaned = {
          ...profile,
          criteriaValues: {
            ...profile.criteriaValues,
            [criterion.id]: (profile.criteriaValues[criterion.id] || []).filter(id => id !== optionId),
          },
        };
        next[studentId] = saveStudentCommentProfile(studentId, rubric, cleaned);
      });
      return next;
    });
  }

  function isRecoverableAuthError(reason: string): boolean {
    return reason === "ai_auth_required" || reason === "ai_unauthorized" || reason === "ai_auth_failed" || reason === "ai_rate_limited";
  }

  async function runBatchQueue(seed: CommentBatchState) {
    if (batchRunning) return;
    setBatchRunning(true);
    pauseRequested.current = false;
    const queue = [...seed.queue];
    const failed = [...seed.failed];
    let done = seed.done;
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

  function copyAll() {
    const text = comments
      .filter(c => c.generated)
      .map(c => {
        const s = students.find(st => st.id === c.studentId)!;
        return `【${s.name}】\n${c.text}`;
      })
      .join("\n\n");
    navigator.clipboard.writeText(text).catch(() => {});
  }

  function exportCommentsCsv() {
    const rows = [
      ["姓名", "字数", "评语"],
      ...students.map(student => {
        const state = comments.find(c => c.studentId === student.id);
        return [
          student.name,
          state?.text.length || 0,
          state?.text || "",
        ];
      }),
    ];
    const content = `\ufeff${rows.map(row => row.map(csvEscape).join(",")).join("\n")}`;
    downloadTextFile(`期末评语-${new Date().toISOString().slice(0, 10)}.csv`, content, "text/csv;charset=utf-8");
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

  const tagSummary = (s: AppStudent) =>
    s.academicTags.length > 0 ? s.academicTags.slice(0, 2).join("、") : "暂无标签";

  const scoreSummary = (student: AppStudent) => {
    const exam = student.exams[0];
    if (!exam) return "暂无成绩";
    return `${exam.name} · 总分 ${exam.total ?? "—"}`;
  };
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
  const batchActive = batchRunning || resumableCount > 0 || batchProgress > 0;
  const headerProgress = Math.max(0, Math.min(100, batchProgress));
  const showHeaderProgress = batchActive && batchState.total > 0;
  const selectedCount = selectedSummary.criteriaSummary.reduce((total, item) => total + item.values.length, 0) + selectedSummary.customOptions.length;
  const selectedTags = selectedStudent ? [...selectedStudent.academicTags, ...selectedStudent.tags].filter(tag => !tag.startsWith("comment_")) : [];
  const selectedInitial = selectedStudent?.name.slice(0, 1) || "";
  const hasUnsavedTeacherNote = selectedProfile ? teacherNote !== selectedProfile.teacherNote : false;

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
      <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col overflow-hidden">
        <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h2 className="text-gray-900">评语工作台</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 grid place-items-center text-gray-400">暂无学生</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gray-50 text-gray-900">
      <div className="shrink-0 border-b border-gray-100 bg-white/95 px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="text-base text-gray-900" style={{ fontWeight: 800 }}>评语工作台</h2>
            <span className="text-sm text-gray-400" style={{ fontWeight: 700 }}>
              <span className="text-emerald-600">{generatedCount}</span> / {students.length} 已生成
            </span>
            <button
              onClick={() => setSelectedBatchIds(new Set())}
              className={`h-7 overflow-hidden whitespace-nowrap rounded-full border bg-blue-50 text-xs text-blue-600 transition-all duration-300 ${selectedBatchCount > 0 ? "max-w-28 scale-100 border-blue-100 px-3.5 opacity-100" : "pointer-events-none max-w-0 scale-95 border-transparent px-0 opacity-0"}`}
              style={{ fontWeight: 800 }}
              title="清空已选"
            >
              已选 {selectedBatchCount} 人
            </button>
            {showHeaderProgress && (
              <div className="flex h-7 items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 text-blue-600">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-out"
                    style={{ width: `${headerProgress}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums" style={{ fontWeight: 800 }}>{headerProgress}%</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={batchButtonAction}
              className={`flex h-10 min-w-[112px] items-center justify-center gap-2 rounded-xl px-5 text-sm transition-colors ${batchRunning ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-blue-600 text-white hover:bg-blue-700"}`}
              style={{ fontWeight: 800 }}
            >
              {batchRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {batchButtonLabel}
            </button>
            <button
              onClick={() => { setExportSelectedIds(new Set(generatedExportIds)); setShowExportModal(true); }}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
              style={{ fontWeight: 800 }}
            >
              <Download className="h-4 w-4" />导出
            </button>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[176px_minmax(460px,1fr)_320px] overflow-hidden bg-white">
        <aside className="flex min-h-0 flex-col border-r border-gray-100 bg-white">
          <div className="space-y-2 border-b border-gray-100 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                placeholder="搜索姓名"
                className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
              />
            </div>
            <div className="grid grid-cols-3 rounded-xl bg-gray-100 p-1">
              <button
                onClick={() => setFilterMode("all")}
                className={`h-7 rounded-lg text-xs transition-colors ${filterMode === "all" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}
                style={{ fontWeight: 800 }}
              >
                全部
              </button>
              <button
                onClick={() => setFilterMode("pending")}
                className={`h-7 rounded-lg text-xs transition-colors ${filterMode === "pending" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"}`}
                style={{ fontWeight: 700 }}
              >
                待生成
              </button>
              <button
                onClick={() => setFilterMode("needsInfo")}
                className={`h-7 rounded-lg text-xs transition-colors ${filterMode === "needsInfo" ? "bg-white text-amber-600 shadow-sm" : "text-gray-500"}`}
                style={{ fontWeight: 700 }}
              >
                需补充
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <button onClick={toggleFilteredBatchSelection} className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-600" style={{ fontWeight: 800 }}>
                <input type="checkbox" checked={allFilteredSelected} readOnly className="pointer-events-none accent-blue-600" />
                {filteredStudents.length} 人
              </button>
              <button onClick={copyAll} className="text-xs text-gray-400 hover:text-gray-600" title="复制已生成评语">复制</button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredStudents.map(s => {
                const state = comments.find(c => c.studentId === s.id)!;
                const isSelected = s.id === selectedId;
                const isBatchSelected = selectedBatchIds.has(s.id);
                const status = getCommentStatus(state);
                const StatusIcon = status.icon;
                const tags = tagSummary(s);

                return (
                  <div
                    key={s.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedId(s.id)}
                    onKeyDown={event => {
                      if (event.key === "Enter" || event.key === " ") {
                        setSelectedId(s.id);
                      }
                    }}
                    className={`grid cursor-pointer grid-cols-[18px_28px_1fr] items-center gap-2 border-b border-gray-50 px-2.5 py-2 text-left transition-[background,transform] duration-200 hover:translate-x-px hover:bg-blue-50/50 ${isSelected ? "bg-blue-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isBatchSelected}
                      onClick={event => event.stopPropagation()}
                      onChange={() => toggleBatchSelection(s.id)}
                      className="accent-blue-600"
                      aria-label={`选择 ${s.name} 用于批量生成`}
                    />
                    <div className={`grid h-7 w-7 place-items-center rounded-full text-sm ${isSelected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`} style={{ fontWeight: 800 }}>
                      {s.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm text-gray-800" style={{ fontWeight: 800 }}>{s.name}</div>
                      <div className={`mt-0.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] ${status.badge}`} style={{ fontWeight: 800 }}>
                        {status.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main key={`detail-${selectedId}`} className="comment-detail-enter flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-gray-100 bg-white">
          <section className="shrink-0 border-b border-gray-100 px-4 py-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-600 text-white" style={{ fontWeight: 900 }}>
                  {selectedInitial}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base text-gray-900" style={{ fontWeight: 900 }}>{selectedStudent.name}</h3>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${getCommentStatus(selectedComment).badge}`} style={{ fontWeight: 800 }}>
                      {getCommentStatus(selectedComment).label}
                    </span>
                    {selectedStudent.gender && <span className="shrink-0 text-xs text-gray-400">{selectedStudent.gender}</span>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-gray-400">
                    {latestExam ? `${latestExam.name} · 总分 ${latestExam.total ?? "—"} · ${latestExam.rank ? `第 ${latestExam.rank} 名` : "暂无排名"} · ${getBestSubject(latestExam.scores)} ↑ ${getWeakSubject(latestExam.scores)} ↓` : scoreSummary(selectedStudent)}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <button
                  onClick={() => onSelectStudent(selectedStudent)}
                  className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                  style={{ fontWeight: 800 }}
                >
                  查看详情
                </button>
                <button
                  onClick={() => setShowFollowupPanel(value => !value)}
                  className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm transition-colors ${showFollowupPanel ? "bg-violet-600 text-white" : "border border-violet-100 bg-violet-50 text-violet-600 hover:bg-violet-100"}`}
                  style={{ fontWeight: 800 }}
                >
                  <Sparkles className="h-4 w-4" />AI素材
                </button>
                {selectedTags[0] && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-600" style={{ fontWeight: 800 }}>
                    {selectedTags[0]}
                  </span>
                )}
              </div>
            </div>
          </section>

          {selectedProfile && (
            <section className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm text-gray-800" style={{ fontWeight: 900 }}>评语素材</h3>
                  <span className="text-xs text-gray-400">{selectedCount} 项</span>
                </div>
                <button
                  onClick={addCriterion}
                  className="flex h-8 items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-xs text-blue-600 transition-colors hover:bg-blue-100"
                  style={{ fontWeight: 800 }}
                >
                  <Plus className="h-3.5 w-3.5" />新增
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-gray-50">
                {showFollowupPanel && (
                  <div className="p-4">
                    <AiStudentFollowupPanel
                      compact
                      student={selectedStudent}
                      context={{
                        scenario: "comment",
                        teacherNote,
                        commentDraft: buildDraft(selectedComment, teacherNote),
                      }}
                      onAppendCommentMaterial={appendFollowupMaterialToTeacherNote}
                    />
                  </div>
                )}
                {rubric.criteria.filter(criterion => !criterion.hidden).map(criterion => {
                  const selected = new Set(selectedProfile.criteriaValues[criterion.id] || []);
                  const customOptions = selectedProfile.customOptions[criterion.id] || [];
                  return (
                    <div key={criterion.id} className="px-4 py-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm text-gray-700" style={{ fontWeight: 900 }}>{criterion.label}</span>
                        {(selected.size > 0 || customOptions.length > 0) && (
                          <button onClick={() => clearCriterion(criterion.id)} className="text-xs text-gray-300 transition-colors hover:text-gray-500">清空</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {criterion.options.map(option => {
                          const active = selected.has(option.id);
                          return (
                            <button
                              key={option.id}
                              onClick={() => toggleCriterionOption(criterion, option.id)}
                              className={`h-8 rounded-full border px-3 text-sm transition-[background,border-color,color,transform] active:scale-95 ${active ? "border-blue-600 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-600 hover:border-blue-200 hover:bg-blue-50/40"}`}
                              style={{ fontWeight: 700 }}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                        {customOptions.map(option => (
                          <button
                            key={option.id}
                            onClick={() => removeStudentCustomOption(criterion.id, option.id)}
                            className="h-8 rounded-full border border-emerald-100 bg-emerald-50 px-3 text-sm text-emerald-700"
                            style={{ fontWeight: 800 }}
                          >
                            {option.label}
                          </button>
                        ))}
                        <button
                          onClick={() => addStudentCustomOption(criterion)}
                          className="h-8 rounded-full border border-dashed border-gray-200 bg-white px-3.5 text-sm text-gray-400 transition-colors hover:bg-gray-50"
                          style={{ fontWeight: 700 }}
                        >
                          自定义...
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>

        <aside key={`generate-${selectedId}`} className="comment-detail-enter flex min-h-0 flex-col bg-white">
          <section className="shrink-0 border-b border-gray-100 p-4">
            <h4 className="text-sm text-gray-800" style={{ fontWeight: 900 }}>生成评语</h4>
            <div className="mt-4">
              <div className="mb-2 text-xs text-gray-500" style={{ fontWeight: 800 }}>字数目标</div>
              <div className="grid grid-cols-4 gap-1.5 rounded-2xl bg-gray-100 p-1">
                {LENGTH_MODES.map(mode => (
                  <button
                    key={mode.value}
                    onClick={() => updateComment(selectedId, { lengthMode: mode.value })}
                    className={`h-8 rounded-xl text-xs transition-colors ${selectedComment.lengthMode === mode.value ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    style={{ fontWeight: 800 }}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {selectedComment.lengthMode === "custom" && (
                <div className="mt-2">
                  <input
                    type="number"
                    value={customWordCount}
                    onChange={e => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v > 0) setCustomWordCount(v);
                    }}
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium outline-none focus:border-blue-300 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="自定义字数"
                    min={10}
                    max={999}
                  />
                </div>
              )}
            </div>
            <div className="mt-4">
              <div className="mb-2 text-xs text-gray-500" style={{ fontWeight: 800 }}>评语风格</div>
              <div className="grid grid-cols-3 gap-2 rounded-2xl bg-gray-100 p-1">
                {STYLES.map(style => (
                  <button
                    key={style.value}
                    onClick={() => updateComment(selectedId, { style: style.value })}
                    className={`h-8 rounded-xl text-xs transition-colors ${selectedComment.style === style.value ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                    style={{ fontWeight: 800 }}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            {!hasAuth && (
              <div className="mt-4 flex items-center gap-2 rounded-2xl bg-violet-50 p-3">
                <input
                  type="password"
                  value={accessCode}
                  onChange={event => setAccessCode(event.target.value)}
                  placeholder="AI 授权码"
                  className="h-9 min-w-0 flex-1 rounded-xl border border-violet-100 bg-white px-3 text-sm outline-none focus:border-violet-300"
                />
                <label className="flex items-center gap-1 text-xs text-violet-700">
                  <input type="checkbox" checked={rememberAuth} onChange={event => setRememberAuth(event.target.checked)} className="accent-violet-600" />
                  记住
                </label>
              </div>
            )}

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500" style={{ fontWeight: 800 }}>老师补充说明（可选）</div>
                <button
                  onClick={saveSelectedTeacherNote}
                  disabled={!hasUnsavedTeacherNote}
                  className={`flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs transition-colors ${hasUnsavedTeacherNote ? "bg-blue-50 text-blue-600 hover:bg-blue-100" : "bg-gray-50 text-gray-300"}`}
                  style={{ fontWeight: 800 }}
                >
                  <Save className="h-3.5 w-3.5" />
                  暂存
                </button>
              </div>
              <textarea
                value={teacherNote}
                onChange={e => setTeacherNote(e.target.value)}
                rows={3}
                placeholder="例如：回答问题积极，作业偶尔拖交，数学进步明显。"
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
              />
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col p-4">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm text-gray-800" style={{ fontWeight: 900 }}>AI 生成评语</h4>
              <span className="text-xs text-gray-400">{selectedComment.text.length} 字</span>
            </div>
            <textarea
              value={selectedComment.text}
              onChange={e => updateComment(selectedId, { text: e.target.value })}
              placeholder="点击「生成评语」后会在这里显示，可直接编辑修改。"
              className="min-h-0 flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm leading-6 outline-none transition-colors focus:border-blue-300 focus:bg-white"
            />
            <p className="mt-2 text-xs text-blue-600">{aiStatus}</p>
            <div className="mt-3 grid grid-cols-[1fr_40px_64px_72px] items-center gap-2">
              <button
                onClick={generateSingle}
                disabled={batchRunning}
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                style={{ fontWeight: 800 }}
              >
                <Sparkles className="h-4 w-4" />
                {selectedComment.generated ? "重新生成" : "生成评语"}
              </button>
              <button onClick={saveSelectedComment} className="grid h-10 place-items-center rounded-xl bg-gray-100 text-gray-600 transition-colors hover:bg-gray-200" title="保存">
                <Save className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  if (selectedComment.text) {
                    navigator.clipboard.writeText(selectedComment.text).catch(() => {});
                  }
                }}
                disabled={!selectedComment.generated}
                className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-gray-100 text-sm text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-40"
                style={{ fontWeight: 800 }}
              >
                <Copy className="h-4 w-4" />复制
              </button>
              <button
                onClick={() => {
                  const currentIndex = filteredStudentIds.indexOf(selectedId);
                  const nextId = filteredStudentIds[currentIndex + 1] || filteredStudentIds[0];
                  if (nextId) setSelectedId(nextId);
                }}
                className="h-10 rounded-xl bg-gray-100 text-sm text-gray-600 transition-colors hover:bg-gray-200"
                style={{ fontWeight: 800 }}
              >
                下一位
              </button>
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
                  onClick={() => setExportSelectedIds(new Set(generatedExportIds))}
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
    </div>
  );
}
