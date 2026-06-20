import { useEffect, useMemo, useRef, useState } from "react";
import { X, Play, Pause, RotateCcw, Copy, Download, Search, Sparkles, TrendingUp, TrendingDown, Save, Plus, ChevronUp, Clock3, AlertCircle, CheckCircle2 } from "lucide-react";
import { generateStudentAiComment, hasStoredAiAuth } from "../state/aiCommentService";
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
}

const LENGTH_MODES = [
  { value: "short",    label: "80～100 字" },
  { value: "standard", label: "100～150 字" },
  { value: "long",     label: "150～200 字" },
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

export function CommentWorkbench({ students, onClose }: Props) {
  const initialBatchState = useMemo(() => loadCommentBatchState(students), [students]);
  const initialRubric = useMemo(() => readCommentRubric(), []);
  const [comments, setComments] = useState<CommentState[]>(() => buildInitialComments(students, initialBatchState.failed));
  const [rubric, setRubric] = useState<CommentRubric>(() => initialRubric);
  const [commentProfiles, setCommentProfiles] = useState<Record<StudentId, StudentCommentProfile>>(() =>
    Object.fromEntries(students.map(student => [student.id, readStudentCommentProfile(student)]))
  );
  const [selectedId, setSelectedId] = useState<StudentId>(students[0]?.id || "");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterUngenerated, setFilterUngenerated] = useState(false);
  const [filterNeedsInfo, setFilterNeedsInfo] = useState(false);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<StudentId>>(() => new Set());
  const [teacherNote, setTeacherNote] = useState("");
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchState, setBatchState] = useState<CommentBatchState>(() => initialBatchState);
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiAuth());
  const [aiStatus, setAiStatus] = useState("AI 会使用学生成绩、标签和教师补充评价生成。");
  const pauseRequested = useRef(false);
  const batchProgress = batchState.total ? Math.round((batchState.done / batchState.total) * 100) : 0;
  const resumableCount = batchState.queue.length + batchState.failed.length;

  const generatedCount = comments.filter(c => c.generated).length;
  const pendingCount = comments.filter(c => !c.generated).length;
  const needsInfoCount = comments.filter(c => c.needsInfo).length;

  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const state = comments.find(c => c.studentId === s.id)!;
      if (filterSearch && !s.name.includes(filterSearch)) return false;
      if (filterUngenerated && state.generated) return false;
      if (filterNeedsInfo && !state.needsInfo) return false;
      return true;
    });
  }, [comments, filterSearch, filterUngenerated, filterNeedsInfo, students]);
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

  function buildDraft(comment: CommentState, note = teacherNote): StudentCommentDraft {
    const profile = commentProfiles[comment.studentId];
    const summary = profile ? summarizeCommentProfile(rubric, profile) : { criteriaSummary: [], customOptions: [] };
    return {
      generatedComment: comment.text,
      teacherNote: note,
      style: comment.style as "warm" | "formal" | "brief",
      lengthMode: comment.lengthMode as "short" | "standard" | "long" | "custom",
      targetWordCount: 120,
      updatedAt: new Date().toISOString(),
      criteriaSummary: summary.criteriaSummary,
      customOptions: summary.customOptions,
    };
  }

  function getAiErrorMessage(reason: string): string {
    return {
      ai_auth_required: "请输入 AI 授权码后再生成。",
      ai_unauthorized: "AI 授权码不正确，请重新输入。",
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
      targetWordCount: 120,
      updatedAt: new Date().toISOString(),
    });
    updateComment(selectedStudent.id, { text: saved.generatedComment, generated: Boolean(saved.generatedComment) });
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
          const result = await generateStudentAiComment(student, buildDraft(comment, ""), {
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
      ["姓名", "状态", "字数", "评语"],
      ...students.map(student => {
        const state = comments.find(c => c.studentId === student.id);
        const status = state?.failed ? "失败待重试" : state?.generated ? "已生成" : state?.needsInfo ? "需补充" : "待生成";
        return [
          student.name,
          status,
          state?.text.length || 0,
          state?.text || "",
        ];
      }),
    ];
    const content = `\ufeff${rows.map(row => row.map(csvEscape).join(",")).join("\n")}`;
    downloadTextFile(`期末评语-${new Date().toISOString().slice(0, 10)}.csv`, content, "text/csv;charset=utf-8");
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
    ? `生成选中 ${selectedBatchCount}`
    : "批量生成";
  const batchButtonAction = batchRunning ? pauseBatch : resumableCount ? resumeBatch : startBatch;
  const selectedCount = selectedSummary.criteriaSummary.reduce((total, item) => total + item.values.length, 0) + selectedSummary.customOptions.length;
  const selectedTags = selectedStudent ? [...selectedStudent.academicTags, ...selectedStudent.tags] : [];
  const selectedInitial = selectedStudent?.name.slice(0, 1) || "";

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
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#f8fafc] text-gray-900">
      <div className="shrink-0 border-b border-gray-100 bg-white/95 px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base text-gray-900" style={{ fontWeight: 800 }}>评语工作台</h2>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-400" style={{ fontWeight: 700 }}>
              全班评语管理
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-1.5">
            {[
              { label: "共", value: students.length, color: "text-gray-700" },
              { label: "已生成", value: generatedCount, color: "text-emerald-600" },
              { label: "待生成", value: pendingCount, color: "text-blue-600" },
              { label: "需补充", value: needsInfoCount, color: "text-amber-600" },
            ].map(m => (
              <div key={m.label} className="flex min-w-[62px] items-center justify-center gap-1 text-xs">
                <span className={`${m.color} text-sm`} style={{ fontWeight: 800 }}>{m.value}</span>
                <span className="text-gray-400" style={{ fontWeight: 700 }}>{m.label}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={batchButtonAction}
              className={`flex h-9 items-center gap-1.5 rounded-xl px-4 text-sm transition-colors ${batchRunning ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-blue-600 text-white hover:bg-blue-700"}`}
              style={{ fontWeight: 800 }}
            >
              {batchRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {batchButtonLabel}
            </button>
            <button onClick={exportCommentsCsv} className="flex h-9 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-600 hover:bg-gray-50" style={{ fontWeight: 700 }}>
              <Download className="h-3.5 w-3.5" />导出评语
            </button>
            <button
              onClick={() => {
                setComments(buildInitialComments(students));
                clearBatchState();
                setAiStatus("已重置工作台状态。");
              }}
              className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="重置"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {(batchRunning || batchProgress > 0 || resumableCount > 0 || selectedBatchCount > 0) && (
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${batchProgress}%` }} />
            </div>
            <span className="text-xs text-gray-500">
              {selectedBatchCount > 0 ? `已选择 ${selectedBatchCount} 人 · ` : ""}
              {batchProgress}% · 剩余 {batchState.queue.length} · 失败 {batchState.failed.length}
            </span>
            {selectedBatchCount > 0 && (
              <button onClick={() => setSelectedBatchIds(new Set())} className="text-xs text-gray-400 hover:text-gray-600">清空</button>
            )}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-5 p-4">
        <aside className="flex w-[256px] shrink-0 flex-col gap-3">
          <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm shadow-gray-200/40">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                placeholder="搜索学生姓名"
                className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => setFilterUngenerated(value => !value)}
                className={`flex h-9 items-center justify-center gap-1 rounded-xl border text-xs ${filterUngenerated ? "border-blue-100 bg-blue-50 text-blue-600" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
                style={{ fontWeight: 700 }}
              >
                <Clock3 className="h-3.5 w-3.5" />待生成
              </button>
              <button
                onClick={() => setFilterNeedsInfo(value => !value)}
                className={`flex h-9 items-center justify-center gap-1 rounded-xl border text-xs ${filterNeedsInfo ? "border-amber-100 bg-amber-50 text-amber-600" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
                style={{ fontWeight: 700 }}
              >
                <AlertCircle className="h-3.5 w-3.5" />需补充
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-gray-200/40">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-3">
              <button onClick={toggleFilteredBatchSelection} className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-600" style={{ fontWeight: 800 }}>
                <input type="checkbox" checked={allFilteredSelected} readOnly className="pointer-events-none accent-blue-600" />
                学生列表
              </button>
              <span className="text-xs text-gray-400">{filteredStudents.length} 人</span>
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
                    className={`grid cursor-pointer grid-cols-[24px_36px_1fr_auto] items-center gap-2 border-b border-gray-50 px-3 py-2.5 text-left transition-colors hover:bg-blue-50/50 ${isSelected ? "bg-blue-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={isBatchSelected}
                      onClick={event => event.stopPropagation()}
                      onChange={() => toggleBatchSelection(s.id)}
                      className="accent-blue-600"
                      aria-label={`选择 ${s.name} 用于批量生成`}
                    />
                    <div className={`grid h-8 w-8 place-items-center rounded-full text-sm ${isSelected ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500"}`} style={{ fontWeight: 800 }}>
                      {s.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm text-gray-800" style={{ fontWeight: 800 }}>{s.name}</div>
                      <div className="mt-0.5 truncate text-xs text-gray-400">{tags}</div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${status.badge}`} style={{ fontWeight: 800 }}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="space-y-4">
            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-gray-200/40">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-600 text-white" style={{ fontWeight: 900 }}>
                    {selectedInitial}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base text-gray-900" style={{ fontWeight: 900 }}>{selectedStudent.name}</h3>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${getCommentStatus(selectedComment).badge}`} style={{ fontWeight: 800 }}>
                        {getCommentStatus(selectedComment).label}
                      </span>
                      {selectedStudent.gender && <span className="text-xs text-gray-400">{selectedStudent.gender}</span>}
                    </div>
                  </div>
                </div>
                {selectedTags[0] && (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-600" style={{ fontWeight: 800 }}>
                    {selectedTags[0]}
                  </span>
                )}
              </div>

              {latestExam && (
                <div className="mt-5 grid grid-cols-4 gap-3">
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-400" style={{ fontWeight: 700 }}>最近考试</div>
                    <div className="mt-1 text-sm text-gray-800" style={{ fontWeight: 900 }}>{latestExam.name}</div>
                  </div>
                  <div className="rounded-2xl bg-blue-50 px-4 py-3">
                    <div className="text-xs text-blue-400" style={{ fontWeight: 700 }}>总分</div>
                    <div className="mt-1 text-lg text-blue-700" style={{ fontWeight: 900 }}>{latestExam.total ?? "—"}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-400" style={{ fontWeight: 700 }}>班级排名</div>
                    <div className="mt-1 text-lg text-gray-900" style={{ fontWeight: 900 }}>{latestExam.rank ? `第 ${latestExam.rank}` : "—"}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-400" style={{ fontWeight: 700 }}>优势 / 薄弱</div>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-emerald-700" style={{ fontWeight: 800 }}>{getBestSubject(latestExam.scores)}</span>
                      <TrendingDown className="h-3.5 w-3.5 text-red-400" />
                      <span className="text-red-500" style={{ fontWeight: 800 }}>{getWeakSubject(latestExam.scores)}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {selectedProfile && (
              <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm shadow-gray-200/40">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm text-gray-800" style={{ fontWeight: 900 }}>评语标准选择</h3>
                    <span className="text-xs text-gray-400">已选 {selectedCount} 项</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={addCriterion}
                      className="flex h-8 items-center gap-1.5 rounded-xl bg-blue-50 px-3 text-xs text-blue-600 hover:bg-blue-100"
                      style={{ fontWeight: 800 }}
                    >
                      <Plus className="h-3.5 w-3.5" />新增标准
                    </button>
                    <ChevronUp className="h-4 w-4 text-gray-300" />
                  </div>
                </div>

                <div className="divide-y divide-gray-50">
                  {rubric.criteria.filter(criterion => !criterion.hidden).map(criterion => {
                    const selected = new Set(selectedProfile.criteriaValues[criterion.id] || []);
                    const customOptions = selectedProfile.customOptions[criterion.id] || [];
                    return (
                      <div key={criterion.id} className="px-4 py-4">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm text-gray-700" style={{ fontWeight: 900 }}>{criterion.label}</span>
                          {(selected.size > 0 || customOptions.length > 0) && (
                            <button onClick={() => clearCriterion(criterion.id)} className="text-xs text-gray-300 hover:text-gray-500">清空</button>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {criterion.options.map(option => {
                            const active = selected.has(option.id);
                            return (
                              <button
                                key={option.id}
                                onClick={() => toggleCriterionOption(criterion, option.id)}
                                className={`h-9 rounded-full border px-3 text-sm transition-colors ${active ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
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
                              className="h-9 rounded-full border border-emerald-100 bg-emerald-50 px-3 text-sm text-emerald-700"
                              style={{ fontWeight: 800 }}
                            >
                              {option.label}
                            </button>
                          ))}
                          <button
                            onClick={() => addStudentCustomOption(criterion)}
                            className="h-9 rounded-full border border-dashed border-gray-200 bg-white px-4 text-sm text-gray-400 hover:bg-gray-50"
                            style={{ fontWeight: 700 }}
                          >
                            + 自定义
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-gray-200/40">
              <h4 className="text-sm text-gray-800" style={{ fontWeight: 900 }}>生成设置</h4>
              <div className="mt-3 grid grid-cols-2 gap-4">
                <div>
                  <div className="mb-2 text-xs text-gray-500" style={{ fontWeight: 800 }}>字数目标</div>
                  <div className="flex flex-wrap gap-2">
                    {LENGTH_MODES.map(mode => (
                      <button
                        key={mode.value}
                        onClick={() => updateComment(selectedId, { lengthMode: mode.value })}
                        className={`h-9 rounded-full border px-3 text-sm ${selectedComment.lengthMode === mode.value ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                        style={{ fontWeight: 800 }}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs text-gray-500" style={{ fontWeight: 800 }}>评语风格</div>
                  <div className="flex flex-wrap gap-2">
                    {STYLES.map(style => (
                      <button
                        key={style.value}
                        onClick={() => updateComment(selectedId, { style: style.value })}
                        className={`h-9 rounded-full border px-3 text-sm ${selectedComment.style === style.value ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
                        style={{ fontWeight: 800 }}
                      >
                        {style.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {!hasAuth && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-violet-50 p-3">
                  <input
                    type="password"
                    value={accessCode}
                    onChange={event => setAccessCode(event.target.value)}
                    placeholder="AI 授权码"
                    className="h-9 w-44 rounded-xl border border-violet-100 bg-white px-3 text-sm outline-none focus:border-violet-300"
                  />
                  <label className="flex items-center gap-1 text-xs text-violet-700">
                    <input type="checkbox" checked={rememberAuth} onChange={event => setRememberAuth(event.target.checked)} className="accent-violet-600" />
                    记住
                  </label>
                </div>
              )}

              <div className="mt-4">
                <div className="mb-2 text-xs text-gray-500" style={{ fontWeight: 800 }}>老师补充说明（可选）</div>
                <textarea
                  value={teacherNote}
                  onChange={e => setTeacherNote(e.target.value)}
                  rows={3}
                  placeholder="例如：回答问题积极，作业偶尔拖交，数学进步明显。"
                  className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-gray-200/40">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm text-gray-800" style={{ fontWeight: 900 }}>AI 生成评语</h4>
                <span className="text-xs text-gray-400">{selectedComment.text.length} 字</span>
              </div>
              <textarea
                value={selectedComment.text}
                onChange={e => updateComment(selectedId, { text: e.target.value })}
                rows={7}
                placeholder="点击「生成评语」后会在这里显示，可直接编辑修改。"
                className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-3 text-sm outline-none focus:border-blue-300 focus:bg-white"
              />
              <p className="mt-2 text-xs text-blue-600">{aiStatus}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={generateSingle}
                  disabled={batchRunning}
                  className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
                  style={{ fontWeight: 800 }}
                >
                  <Sparkles className="h-4 w-4" />
                  {selectedComment.generated ? "重新生成" : "生成评语"}
                </button>
                <button onClick={saveSelectedComment} className="grid h-10 w-12 place-items-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200">
                  <Save className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    if (selectedComment.text) {
                      navigator.clipboard.writeText(selectedComment.text).catch(() => {});
                    }
                  }}
                  disabled={!selectedComment.generated}
                  className="flex h-10 items-center gap-1.5 rounded-xl bg-gray-100 px-4 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-40"
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
                  className="h-10 rounded-xl bg-gray-100 px-4 text-sm text-gray-600 hover:bg-gray-200"
                  style={{ fontWeight: 800 }}
                >
                  下一位 →
                </button>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
