import { useEffect, useMemo, useRef, useState } from "react";
import { X, Play, Pause, RotateCcw, Copy, Download, Search, CheckSquare, Square, ChevronRight, Sparkles, TrendingUp, TrendingDown, Save, Settings2, Plus, Trash2 } from "lucide-react";
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
    const pending = comments.filter(c => !c.generated || failedIds.has(c.studentId));
    if (!pending.length) {
      setAiStatus("没有待生成的学生。");
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
    : "批量生成";
  const batchButtonAction = batchRunning ? pauseBatch : resumableCount ? resumeBatch : startBatch;

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
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs text-gray-400 mb-0.5" style={{ fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>全班评语管理</div>
          <h2 className="text-gray-900">评语工作台</h2>
        </div>

        {/* Progress metrics */}
        <div className="flex items-center gap-5">
          {[
            { label: "学生", value: students.length, color: "text-gray-700" },
            { label: "已生成", value: generatedCount, color: "text-emerald-600" },
            { label: "待生成", value: pendingCount, color: "text-blue-600" },
            { label: "需补充", value: needsInfoCount, color: "text-amber-600" },
          ].map(m => (
            <div key={m.label} className="text-center">
              <div className={`text-lg ${m.color}`} style={{ fontWeight: 800, lineHeight: 1 }}>{m.value}</div>
              <div className="text-xs text-gray-400 mt-0.5">{m.label}</div>
            </div>
          ))}
        </div>

        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors ml-auto">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Toolbar */}
      <div className="shrink-0 bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-3 flex-wrap">
        <button
          onClick={batchButtonAction}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm transition-colors ${batchRunning ? "bg-gray-200 text-gray-700 hover:bg-gray-300" : "bg-blue-600 text-white hover:bg-blue-700"}`}
          style={{ fontWeight: 600 }}
        >
          {batchRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {batchButtonLabel}
        </button>
        <button
          onClick={() => {
            setComments(buildInitialComments(students));
            clearBatchState();
            setAiStatus("已重置工作台状态。");
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm transition-colors"
          style={{ fontWeight: 600 }}
        >
          <RotateCcw className="w-3.5 h-3.5" />重置
        </button>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={filterSearch}
            onChange={e => setFilterSearch(e.target.value)}
            placeholder="搜索学生"
            className="pl-8 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 w-36"
          />
        </div>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterUngenerated} onChange={e => setFilterUngenerated(e.target.checked)} className="accent-blue-600" />
          只看未生成
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={filterNeedsInfo} onChange={e => setFilterNeedsInfo(e.target.checked)} className="accent-blue-600" />
          只看需补充
        </label>

        {!hasAuth && (
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={accessCode}
              onChange={event => setAccessCode(event.target.value)}
              placeholder="AI 授权码"
              className="px-3 py-2 text-sm bg-violet-50 border border-violet-100 rounded-xl outline-none focus:border-violet-300 w-32"
            />
            <label className="flex items-center gap-1 text-xs text-violet-700 cursor-pointer">
              <input type="checkbox" checked={rememberAuth} onChange={event => setRememberAuth(event.target.checked)} className="accent-violet-600" />
              记住
            </label>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button onClick={copyAll} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors" style={{ fontWeight: 600 }}>
            <Copy className="w-3.5 h-3.5" />复制全部
          </button>
          <button onClick={exportCommentsCsv} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors" style={{ fontWeight: 600 }}>
            <Download className="w-3.5 h-3.5" />导出评语
          </button>
        </div>

        <p className="w-full text-xs text-blue-600">{aiStatus}</p>

        {/* Progress bar */}
        {(batchRunning || batchProgress > 0 || resumableCount > 0) && (
          <div className="w-full flex items-center gap-3 pt-1">
            <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${batchProgress}%` }} />
            </div>
            <span className="text-xs text-gray-500 shrink-0">
              {batchProgress}% · 剩余 {batchState.queue.length} · 失败 {batchState.failed.length}
            </span>
          </div>
        )}
      </div>

      {/* Main Layout */}
      <div className="flex-1 min-h-0 flex gap-0">
        {/* Left: Student Table */}
        <div className="w-[55%] flex flex-col min-h-0 border-r border-gray-100">
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white">
            <h3 className="text-gray-700" style={{ fontSize: "0.875rem" }}>学生评语表格</h3>
            <span className="text-xs text-gray-400">{filteredStudents.length} 人</span>
          </div>

          {/* Table header */}
          <div className="shrink-0 grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-xs text-gray-400" style={{ fontWeight: 700 }}>
            <div className="col-span-1">选择</div>
            <div className="col-span-2">学生</div>
            <div className="col-span-2">标签</div>
            <div className="col-span-3">成绩摘要</div>
            <div className="col-span-1">完整度</div>
            <div className="col-span-2">状态</div>
            <div className="col-span-1"></div>
          </div>

          {/* Table rows */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {filteredStudents.map(s => {
              const state = comments.find(c => c.studentId === s.id)!;
              const isSelected = s.id === selectedId;
              const integrity = s.academicTags.length > 0 ? 40 : 20;

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-gray-50 text-left hover:bg-blue-50/40 transition-colors items-center ${isSelected ? "bg-blue-50 border-b-blue-100" : ""}`}
                >
                  <div className="col-span-1">
                    {isSelected ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-300" />}
                  </div>
                  <div className="col-span-2 text-sm text-gray-800 truncate" style={{ fontWeight: 600 }}>{s.name}</div>
                  <div className="col-span-2 text-xs text-gray-500 truncate">{tagSummary(s)}</div>
                  <div className="col-span-3 text-xs text-gray-400 truncate">{scoreSummary(s)}</div>
                  <div className="col-span-1">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${integrity >= 40 ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${integrity}%` }} />
                      </div>
                      <span className="text-xs text-gray-400">{integrity}%</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    {state.failed ? (
                      <span className="text-xs px-2 py-0.5 bg-red-50 border border-red-100 text-red-500 rounded-full" style={{ fontWeight: 600 }}>失败待重试</span>
                    ) : state.needsInfo ? (
                      <span className="text-xs px-2 py-0.5 bg-amber-50 border border-amber-100 text-amber-600 rounded-full" style={{ fontWeight: 600 }}>需补充</span>
                    ) : state.generated ? (
                      <span className="text-xs px-2 py-0.5 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-full" style={{ fontWeight: 600 }}>已生成</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-600 rounded-full" style={{ fontWeight: 600 }}>可生成</span>
                    )}
                  </div>
                  <div className="col-span-1 text-xs text-gray-400">{LENGTH_MODES.find(m => m.value === state.lengthMode)?.label?.split("～")[0]}～字</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="flex-1 flex flex-col min-h-0 bg-white">
          <div className="shrink-0 flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div>
              <div className="text-xs text-gray-400" style={{ fontWeight: 600 }}>当前学生</div>
              <h3 className="text-gray-800" style={{ fontSize: "0.9375rem" }}>
                {selectedStudent.name}
                <span className="text-gray-400 ml-2" style={{ fontWeight: 400, fontSize: "0.8125rem" }}>· 评语资料</span>
              </h3>
              <div className="text-xs mt-0.5">
                {selectedComment.generated
                  ? <span className="text-emerald-600">已生成</span>
                  : selectedComment.needsInfo
                  ? <span className="text-amber-600">需要补充信息</span>
                  : <span className="text-blue-600">可生成 · 尚未生成</span>}
              </div>
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors" style={{ fontWeight: 600 }}>
              查看详情 <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 p-5 space-y-4">
            {/* Score summary */}
            {latestExam && (
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <div className="text-xs text-gray-500 mb-2" style={{ fontWeight: 700 }}>成绩摘要</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400">最近考试</span>
                    <span className="text-gray-700" style={{ fontWeight: 600 }}>{latestExam.name} · {latestExam.date || "未填写日期"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">总分</span>
                    <span className="text-blue-700" style={{ fontWeight: 800 }}>{latestExam.total ?? "—"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400">排名</span>
                    <span style={{ fontWeight: 600 }}>{latestExam.rank ? `第 ${latestExam.rank} 名` : "暂无排名"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-700" style={{ fontWeight: 600 }}>
                      {getBestSubject(latestExam.scores)}
                    </span>
                    <TrendingDown className="w-3.5 h-3.5 text-red-400 ml-1" />
                    <span className="text-red-500" style={{ fontWeight: 600 }}>
                      {getWeakSubject(latestExam.scores)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Tags */}
            <div>
              <div className="text-xs text-gray-500 mb-2" style={{ fontWeight: 700 }}>已有学生标签</div>
              <div className="flex flex-wrap gap-1.5">
                {[...selectedStudent.academicTags, ...selectedStudent.tags].length > 0 ? [...selectedStudent.academicTags, ...selectedStudent.tags].map(tag => {
                  const isStrong = tag.endsWith("强");
                  return (
                    <span key={tag} className={`text-xs px-2.5 py-1 rounded-full border ${isStrong ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-400 border-red-100"}`} style={{ fontWeight: 600 }}>
                      {tag}
                    </span>
                  );
                }) : <span className="text-xs text-gray-400">暂无标签</span>}
              </div>
            </div>

            {/* Comment rubric */}
            {selectedProfile && (
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                  <div>
                    <div className="text-xs text-gray-500" style={{ fontWeight: 700 }}>评语标准选择</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      已选 {selectedSummary.criteriaSummary.reduce((total, item) => total + item.values.length, 0) + selectedSummary.customOptions.length} 项
                    </div>
                  </div>
                  <button
                    onClick={addCriterion}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 border border-blue-100 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
                    style={{ fontWeight: 700 }}
                  >
                    <Plus className="w-3.5 h-3.5" />新增标准
                  </button>
                </div>

                <details className="border-b border-gray-100">
                  <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-xs text-gray-500 hover:bg-gray-50" style={{ fontWeight: 700 }}>
                    <Settings2 className="w-3.5 h-3.5" />标准库管理
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    {rubric.criteria.map(criterion => (
                      <div key={criterion.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            value={criterion.label}
                            disabled={criterion.builtIn}
                            onChange={event => updateCriterion(criterion.id, { label: event.target.value || criterion.label })}
                            className="flex-1 min-w-0 px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl outline-none disabled:text-gray-400"
                          />
                          <label className="flex items-center gap-1.5 text-xs text-gray-500 whitespace-nowrap">
                            <input
                              type="checkbox"
                              checked={criterion.syncToTags}
                              onChange={event => updateCriterion(criterion.id, { syncToTags: event.target.checked })}
                              className="accent-blue-600"
                            />
                            同步标签
                          </label>
                          <button
                            onClick={() => deleteOrHideCriterion(criterion)}
                            className="px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg bg-white hover:bg-gray-100"
                            style={{ fontWeight: 700 }}
                          >
                            {criterion.builtIn ? (criterion.hidden ? "显示" : "隐藏") : "删除"}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {criterion.options.filter(option => !option.builtIn).map(option => (
                            <button
                              key={option.id}
                              onClick={() => removeCriterionOption(criterion, option.id)}
                              className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 border border-red-100 bg-white rounded-full hover:bg-red-50"
                            >
                              <Trash2 className="w-3 h-3" />{option.label}
                            </button>
                          ))}
                          <button
                            onClick={() => addCriterionOption(criterion)}
                            className="px-2 py-1 text-xs text-blue-600 border border-blue-100 bg-white rounded-full hover:bg-blue-50"
                            style={{ fontWeight: 700 }}
                          >
                            + 选项
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

                <div className="p-4 space-y-4">
                  {rubric.criteria.filter(criterion => !criterion.hidden).map(criterion => {
                    const selected = new Set(selectedProfile.criteriaValues[criterion.id] || []);
                    const customOptions = selectedProfile.customOptions[criterion.id] || [];
                    return (
                      <div key={criterion.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500" style={{ fontWeight: 700 }}>{criterion.label}</span>
                          <button onClick={() => clearCriterion(criterion.id)} className="text-xs text-gray-400 hover:text-gray-600">清空</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {criterion.options.map(option => {
                            const active = selected.has(option.id);
                            return (
                              <button
                                key={option.id}
                                onClick={() => toggleCriterionOption(criterion, option.id)}
                                className={`px-2.5 py-1.5 rounded-full text-xs border transition-colors ${active ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"}`}
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
                              className="px-2.5 py-1.5 rounded-full text-xs border bg-emerald-50 border-emerald-100 text-emerald-700"
                              style={{ fontWeight: 700 }}
                            >
                              {option.label}
                            </button>
                          ))}
                          <button
                            onClick={() => addStudentCustomOption(criterion)}
                            className="px-2.5 py-1.5 rounded-full text-xs border border-gray-200 text-gray-500 bg-white hover:bg-gray-50"
                            style={{ fontWeight: 700 }}
                          >
                            + 自定义
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Settings */}
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>字数设置</span>
                <select
                  value={selectedComment.lengthMode}
                  onChange={e => updateComment(selectedId, { lengthMode: e.target.value })}
                  className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none cursor-pointer"
                >
                  {LENGTH_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>评语风格</span>
                <select
                  value={selectedComment.style}
                  onChange={e => updateComment(selectedId, { style: e.target.value })}
                  className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none cursor-pointer"
                >
                  {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
            </div>

            {/* Teacher note */}
            <div>
              <div className="text-xs text-gray-500 mb-1.5" style={{ fontWeight: 700 }}>老师补充评价</div>
              <textarea
                value={teacherNote}
                onChange={e => setTeacherNote(e.target.value)}
                rows={3}
                placeholder="例如：回答问题积极，作业偶尔拖交，数学进步明显。"
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 resize-none"
              />
            </div>

            {/* Generated result */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-xs text-gray-500" style={{ fontWeight: 700 }}>AI 生成结果</div>
                <span className="text-xs text-gray-400">{selectedComment.text.length} 字</span>
              </div>
              <textarea
                value={selectedComment.text}
                onChange={e => updateComment(selectedId, { text: e.target.value })}
                rows={7}
                placeholder="点击「单独生成」后会在这里显示评语，可直接编辑。"
                className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 resize-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pb-2">
              <button
                onClick={generateSingle}
                disabled={batchRunning}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors disabled:opacity-60"
                style={{ fontWeight: 600 }}
              >
                <Sparkles className="w-4 h-4" />
                {selectedComment.generated ? "重新生成" : "单独生成"}
              </button>
              <button
                onClick={saveSelectedComment}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm transition-colors"
                style={{ fontWeight: 600 }}
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  if (selectedComment.text) {
                    navigator.clipboard.writeText(selectedComment.text).catch(() => {});
                  }
                }}
                disabled={!selectedComment.generated}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-sm transition-colors disabled:opacity-40"
                style={{ fontWeight: 600 }}
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
