import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, ChevronDown, Copy, FilePlus2, Loader2, RotateCcw, Save, Send, Sparkles, Trash2, X } from "lucide-react";

import {
  buildAiAssistantBaseContext,
  buildAiAssistantContext,
  sendAiAssistantChat,
  type AiComparisonContext,
  type AiContextPack,
  type AiChatMessage,
} from "../state/aiAssistantService";
import { getCurrentSlice, sliceDisplayName } from "../state/workspaces";
import type { AppStudent, Dormitory, FundTransaction, GradeExam, StudentId } from "../state/types";
import { AiGenerationPanel, ConfirmDialog, IconButton, useAppDialog } from "./ui";

const QUICK_PROMPTS = [
  "帮我分析这个班当前最需要关注的学生，并给出跟进建议。",
  "根据最近考试，帮我总结班级整体变化和下一步教学重点。",
  "帮我写一段适合和家长沟通的温和说明，重点讲学习状态和可执行建议。",
  "帮我整理期末评语可以使用的素材方向，不要直接编造事实。",
];

const CHAT_LIMIT = 20;
const STUDENT_SUGGESTION_LIMIT = 6;

type StudentSuggestion = {
  student: AppStudent;
  reason: string;
  score: number;
};

type EvidenceSummary = {
  title: string;
  detail: string;
};

function makeMessage(role: AiChatMessage["role"], content: string, meta: Pick<AiChatMessage, "contextLabels" | "contextEvidence" | "suggestedPrompts"> = {}): AiChatMessage {
  return {
    id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    contextLabels: meta.contextLabels,
    contextEvidence: meta.contextEvidence,
    suggestedPrompts: meta.suggestedPrompts,
  };
}

function formatChatDisplayText(message: AiChatMessage): string {
  if (message.role !== "assistant") {
    return message.content;
  }
  return message.content
    .replace(/\r\n/g, "\n")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function getStorageKey(): string {
  try {
    const slice = getCurrentSlice();
    return `seat-manager-ai-assistant-chat:${slice.id}`;
  } catch {
    return "seat-manager-ai-assistant-chat:default";
  }
}

function getDraftStorageKey(storageKey: string): string {
  return `${storageKey}:draft`;
}

function loadChatHistory(storageKey = getStorageKey()): AiChatMessage[] {
  if (!hasBrowserStorage()) {
    return [];
  }
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKey) || "[]") as Partial<AiChatMessage>[];
    return raw
      .filter(item => (item.role === "user" || item.role === "assistant") && typeof item.content === "string" && item.content.trim())
      .map(item => ({
        id: item.id || makeMessage(item.role as AiChatMessage["role"], item.content || "").id,
        role: item.role as AiChatMessage["role"],
        content: String(item.content || "").slice(0, 4000),
        createdAt: item.createdAt || new Date().toISOString(),
        contextLabels: Array.isArray(item.contextLabels) ? item.contextLabels.map(String).filter(Boolean).slice(0, 6) : undefined,
        contextEvidence: Array.isArray(item.contextEvidence)
          ? item.contextEvidence
            .map(evidence => ({
              title: String(evidence?.title || "").slice(0, 60),
              detail: String(evidence?.detail || "").slice(0, 160),
            }))
            .filter(evidence => evidence.title)
            .slice(0, 4)
          : undefined,
        suggestedPrompts: Array.isArray(item.suggestedPrompts) ? item.suggestedPrompts.map(String).filter(Boolean).slice(0, 4) : undefined,
      }))
      .slice(-CHAT_LIMIT);
  } catch {
    return [];
  }
}

function loadDraftInput(storageKey = getStorageKey()): string {
  if (!hasBrowserStorage()) {
    return "";
  }
  return (window.localStorage.getItem(getDraftStorageKey(storageKey)) || "").slice(0, 1000);
}

function saveChatHistory(messages: AiChatMessage[], storageKey = getStorageKey()): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.setItem(storageKey, JSON.stringify(messages.slice(-CHAT_LIMIT)));
}

function saveDraftInput(value: string, storageKey = getStorageKey()): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.setItem(getDraftStorageKey(storageKey), value.slice(0, 1000));
}

function getAiErrorMessage(reason: string): string {
  return {
    ai_auth_required: "产品授权已失效，请退出后重新登录。",
    ai_unauthorized: "当前授权未开通 AI 或 AI 已到期。",
    ai_auth_failed: "AI 授权暂时不可用，请稍后重试。",
    ai_file_protocol: "当前是本地文件打开方式，请通过网页地址打开后再使用 AI。",
    ai_offline: "当前离线，联网后可使用 AI 助手。",
    ai_payload_too_large: "当前摘要或对话过多，请清空对话后再试。",
    ai_rate_limited: "今日 AI 调用较多，请稍后再试。",
  }[reason] || (reason.startsWith("ai_failed:") ? `AI 助手暂时不可用：${reason.replace("ai_failed:", "")}` : "AI 助手暂时不可用，请稍后重试。");
}

function formatContextPackLabel(pack: AiContextPack): string {
  return `${pack.title}${pack.items.length ? ` ${pack.items.length}项` : ""}`;
}

function formatSignedNumber(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }
  return `${value >= 0 ? "+" : ""}${Math.round(value * 10) / 10}`;
}

function summarizeEvidencePack(pack: AiContextPack): EvidenceSummary {
  const first = pack.items[0];
  if (pack.kind === "student") {
    const trend = formatSignedNumber(first?.trend);
    const parts = [
      typeof first?.latestTotal === "number" ? `总分 ${first.latestTotal}` : "",
      trend ? `趋势 ${trend}` : "",
      first?.tags?.length ? `标签 ${first.tags.length}` : "",
      first?.records?.length ? `记录 ${first.records.length}` : "",
    ].filter(Boolean);
    return { title: pack.title.replace(/明细$/, "档案"), detail: parts.join(" · ") || "学生成绩、标签与记录" };
  }
  if (pack.kind === "candidate_students" || pack.kind === "tag" || pack.kind === "records") {
    return { title: pack.title, detail: `${pack.items.length} 名学生 · ${pack.reason}` };
  }
  if (pack.kind === "dormitory") {
    const detail = first?.summary || `${pack.items.length} 间宿舍`;
    return { title: "宿舍明细", detail };
  }
  if (pack.kind === "fund") {
    return { title: "班费流水", detail: first?.summary || "班费收支与最近流水" };
  }
  if (pack.kind === "exam") {
    return { title: pack.title, detail: first?.summary || `${pack.items.length} 次考试` };
  }
  return { title: pack.title, detail: pack.reason };
}

function buildEvidenceSummaries(packs: AiContextPack[]): EvidenceSummary[] {
  return packs.map(summarizeEvidencePack).slice(0, 4);
}

function buildComparisonEvidence(comparisonContext?: AiComparisonContext): EvidenceSummary[] {
  if (!comparisonContext) {
    return [];
  }
  const scope = comparisonContext.compareScope
    ? `${comparisonContext.currentScope.termLabel} vs ${comparisonContext.compareScope.termLabel}`
    : comparisonContext.currentScope.termLabel;
  const detail = comparisonContext.notice
    || comparisonContext.comparisonPacks[0]?.items[0]?.summary
    || "同一班级跨学期摘要";
  return [{
    title: comparisonContext.compareScope ? `跨学期对比 ${scope}` : "跨学期对比",
    detail,
  }];
}

function buildInitialQuickPrompts(input: { exams: GradeExam[]; dormitories: Dormitory[]; focusCount: number }): string[] {
  const prompts = [
    input.focusCount > 0
      ? "帮我分析这个班当前最需要关注的学生，并给出跟进建议。"
      : "帮我快速梳理这个班目前的整体状态。",
    input.exams.length >= 2
      ? "本次退步较明显的学生有哪些？需要怎样的关注？"
      : "根据最近考试，帮我总结班级整体变化和下一步教学重点。",
    input.dormitories.length > 0
      ? "宿舍情况怎么样？哪些学生或宿舍需要关注？"
      : "帮我写一段适合和家长沟通的温和说明，重点讲学习状态和可执行建议。",
    "帮我整理期末评语可以使用的素材方向，不要直接编造事实。",
  ];
  return prompts.slice(0, 4);
}

function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").replace(/[，。！？、,.!?;；:：()（）【】\[\]{}<>《》"'“”‘’]/g, "");
}

function getActiveStudentQuery(input: string): string {
  const tail = input
    .split(/(?:以及|还有|再看|再问|对比|比较|分析|看看|关于|[\s和与跟同及、，。！？,.!?;；:：()（）【】\[\]{}<>《》"'“”‘’])/)
    .pop() || "";
  return tail.trim().slice(-12);
}

function getAliasInitials(alias: string): string {
  return alias
    .split(/[\s\-_/]+/)
    .map(part => part[0] || "")
    .join("")
    .toLowerCase();
}

function buildStudentSuggestions(input: string, students: AppStudent[]): StudentSuggestion[] {
  const rawQuery = getActiveStudentQuery(input);
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return [];
  }
  const isLatinQuery = /^[a-z]+$/i.test(query);
  if (isLatinQuery && query.length < 1) {
    return [];
  }
  return students
    .map(student => {
      const name = normalizeSearchText(student.name);
      const aliases = student.aliases.map(normalizeSearchText).filter(Boolean);
      const aliasInitials = student.aliases.map(getAliasInitials).filter(Boolean);
      let reason = "";
      let score = 0;
      if (name === query) {
        reason = "姓名完全匹配";
        score = 100;
      } else if (name.startsWith(query)) {
        reason = query.length === 1 ? "首字匹配" : "姓名开头匹配";
        score = 92 - Math.max(0, name.length - query.length);
      } else if (name.includes(query) && query.length >= 2) {
        reason = "姓名包含匹配";
        score = 82 - name.indexOf(query);
      } else {
        const aliasMatch = aliases.find(alias => alias === query || alias.startsWith(query) || (query.length >= 2 && alias.includes(query)));
        const initialsMatch = aliasInitials.find(initials => initials === query || initials.startsWith(query));
        if (aliasMatch) {
          reason = /^[a-z]+$/i.test(aliasMatch) ? "拼音匹配" : "别名匹配";
          score = aliasMatch === query ? 88 : 78 - Math.max(0, aliasMatch.length - query.length);
        } else if (initialsMatch) {
          reason = "拼音首字母匹配";
          score = initialsMatch === query ? 76 : 70 - Math.max(0, initialsMatch.length - query.length);
        }
      }
      return reason ? { student, reason, score } : null;
    })
    .filter((item): item is StudentSuggestion => Boolean(item))
    .sort((a, b) => b.score - a.score || a.student.name.localeCompare(b.student.name, "zh-CN"))
    .slice(0, STUDENT_SUGGESTION_LIMIT);
}

function applyStudentSuggestion(input: string, studentName: string): string {
  const query = getActiveStudentQuery(input);
  if (!query) {
    return input ? `${input}${studentName}` : studentName;
  }
  const index = input.lastIndexOf(query);
  if (index < 0) {
    return `${input}${studentName}`;
  }
  return `${input.slice(0, index)}${studentName}${input.slice(index + query.length)}`;
}

export function AiAssistantCompanion({
  open,
  activeSurfaceLabel,
  students,
  exams,
  dormitories,
  fundTransactions,
  seatOrder,
  onClose,
  onBusyChange,
  onSaveStudentRecord,
  onAppendCommentMaterial,
}: {
  open: boolean;
  activeSurfaceLabel: string;
  students: AppStudent[];
  exams: GradeExam[];
  dormitories: Dormitory[];
  fundTransactions: FundTransaction[];
  seatOrder: Array<StudentId | null>;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
  onSaveStudentRecord?: (student: AppStudent, note: string) => void;
  onAppendCommentMaterial?: (student: AppStudent, text: string) => void;
}) {
  const appDialog = useAppDialog();
  const currentStorageKey = getStorageKey();
  const [sessionStorageKey, setSessionStorageKey] = useState(currentStorageKey);
  const sessionStorageKeyRef = useRef(sessionStorageKey);
  sessionStorageKeyRef.current = sessionStorageKey;
  const [messages, setMessages] = useState<AiChatMessage[]>(() => loadChatHistory(currentStorageKey));
  const [confirmClearMessages, setConfirmClearMessages] = useState(false);
  const confirmClearMessagesRef = useRef(confirmClearMessages);
  confirmClearMessagesRef.current = confirmClearMessages;
  const [input, setInput] = useState(() => loadDraftInput(currentStorageKey));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("AI 只读取当前班级、当前学期的相关摘要，不会自动修改数据。");
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(QUICK_PROMPTS);
  const [copiedMessageId, setCopiedMessageId] = useState("");
  const [savedActionKey, setSavedActionKey] = useState("");
  const [studentSuggestOpen, setStudentSuggestOpen] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [rendered, setRendered] = useState(open);
  const [transitionState, setTransitionState] = useState<"opening" | "open" | "closing">(open ? "opening" : "closing");
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  let slice = null;
  try {
    slice = getCurrentSlice();
  } catch {
    slice = null;
  }
  const className = slice ? sliceDisplayName(slice) : "当前班级";
  const termLabel = slice?.term.label || "当前学期";
  const baseContext = useMemo(() => buildAiAssistantBaseContext({
    className,
    termLabel,
    students,
    exams,
    dormitories,
    fundTransactions,
    seatCount: seatOrder.length,
    occupiedSeatCount: seatOrder.filter(Boolean).length,
  }), [className, dormitories, exams, fundTransactions, seatOrder, students, termLabel]);
  const previewContext = useMemo(() => buildAiAssistantContext({
    prompt: input,
    baseContext,
    students,
    exams,
    dormitories,
    fundTransactions,
  }), [baseContext, dormitories, exams, fundTransactions, input, students]);
  const comparisonLabels = previewContext.comparisonContext?.compareScope
    ? [`跨学期对比 ${previewContext.comparisonContext.currentScope.termLabel} vs ${previewContext.comparisonContext.compareScope.termLabel}`]
    : previewContext.comparisonContext?.notice ? [previewContext.comparisonContext.notice] : [];
  const contextPackLabels = [...previewContext.contextPacks.map(formatContextPackLabel), ...comparisonLabels];
  const previewEvidence = useMemo(() => [
    ...buildComparisonEvidence(previewContext.comparisonContext),
    ...buildEvidenceSummaries(previewContext.contextPacks),
  ], [previewContext.contextPacks, previewContext.comparisonContext]);
  const lastAssistantWithEvidence = useMemo(() => [...messages].reverse().find(message => message.role === "assistant" && (message.contextEvidence?.length || message.contextLabels?.length)), [messages]);
  const lockedEvidence = useMemo<EvidenceSummary[]>(() => (
    lastAssistantWithEvidence?.contextEvidence?.length
      ? lastAssistantWithEvidence.contextEvidence
      : (lastAssistantWithEvidence?.contextLabels?.map(label => ({ title: label, detail: "已用于最近一轮回答" })) || [])
  ), [lastAssistantWithEvidence]);
  const activeEvidence = previewEvidence.length ? previewEvidence : lockedEvidence;
  const evidenceMode = previewEvidence.length ? "将附带" : (lockedEvidence.length ? "本轮已使用" : "当前范围");
  const studentSuggestions = useMemo(() => buildStudentSuggestions(input, students), [input, students]);
  const showStudentSuggestions = studentSuggestOpen && studentSuggestions.length > 0 && !busy;
  const initialQuickPrompts = useMemo(() => buildInitialQuickPrompts({
    exams,
    dormitories,
    focusCount: baseContext.focusStudents.length,
  }), [baseContext.focusStudents.length, dormitories, exams]);

  useEffect(() => {
    if (currentStorageKey === sessionStorageKey) return;
    setSessionStorageKey(currentStorageKey);
    setMessages(loadChatHistory(currentStorageKey));
    setInput(loadDraftInput(currentStorageKey));
    setStatus("已切换到当前班级与学期的 AI 对话。");
    setSavedActionKey("");
    setContextExpanded(false);
  }, [currentStorageKey, sessionStorageKey]);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (open) {
      setRendered(true);
      setTransitionState("opening");
      const timer = window.setTimeout(() => setTransitionState("open"), reducedMotion ? 0 : 280);
      return () => window.clearTimeout(timer);
    }
    setTransitionState("closing");
    const timer = window.setTimeout(() => setRendered(false), reducedMotion ? 0 : 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);

  useEffect(() => {
    saveDraftInput(input, sessionStorageKey);
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "44px";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`;
    }
  }, [input, sessionStorageKey]);

  useEffect(() => {
    if (!messages.length) setSuggestedPrompts(initialQuickPrompts);
  }, [initialQuickPrompts, messages.length]);

  useEffect(() => {
    if (!open) return;
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
      if (messagesScrollRef.current) messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight;
    };
    const focusFrame = window.requestAnimationFrame(() => inputRef.current?.focus());
    const scrollFrame = window.requestAnimationFrame(scrollToBottom);
    const timer = window.setTimeout(scrollToBottom, 80);
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !confirmClearMessagesRef.current) {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.cancelAnimationFrame(scrollFrame);
      window.clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.getElementById("ai-assistant-launcher")?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [busy, messages.length, open]);

  function handleInputChange(value: string) {
    setInput(value.slice(0, 1000));
    setStudentSuggestOpen(true);
  }

  function chooseStudentSuggestion(student: AppStudent) {
    handleInputChange(applyStudentSuggestion(input, student.name));
    setStudentSuggestOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function copyMessage(message: AiChatMessage) {
    navigator.clipboard.writeText(formatChatDisplayText(message)).then(() => {
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(current => current === message.id ? "" : current), 1400);
    }).catch(() => {});
  }

  function findMessageTargetStudent(message: AiChatMessage): AppStudent | null {
    if (message.role !== "assistant") return null;
    const labels = [...(message.contextLabels || []), ...(message.contextEvidence || []).flatMap(item => [item.title, item.detail])].join(" ");
    if (!labels.trim()) return null;
    return students.find(student => labels.includes(student.name)) || null;
  }

  async function saveAssistantRecord(message: AiChatMessage, student: AppStudent) {
    if (!onSaveStudentRecord) return;
    if (!await appDialog.confirm({ title: "保存到学生记录？", description: `将把这条 AI 回复写入 ${student.name} 的学生记录。AI 内容仍应由教师确认后使用。`, confirmLabel: "确认保存", variant: "primary" })) return;
    onSaveStudentRecord(student, formatChatDisplayText(message));
    setSavedActionKey(`${message.id}:record`);
  }

  async function appendAssistantMaterial(message: AiChatMessage, student: AppStudent) {
    if (!onAppendCommentMaterial) return;
    if (!await appDialog.confirm({ title: "加入评语素材？", description: `将把这条 AI 回复加入 ${student.name} 的评语素材，之后仍可继续编辑。`, confirmLabel: "确认加入", variant: "primary" })) return;
    onAppendCommentMaterial(student, formatChatDisplayText(message));
    setSavedActionKey(`${message.id}:material`);
  }

  async function sendPrompt(prompt: string) {
    const text = prompt.trim();
    if (!text || busy) return;
    const requestStorageKey = sessionStorageKey;
    const activeContext = buildAiAssistantContext({ prompt: text, baseContext, students, exams, dormitories, fundTransactions });
    const activeEvidenceSummaries = [...buildComparisonEvidence(activeContext.comparisonContext), ...buildEvidenceSummaries(activeContext.contextPacks)];
    const activeLabels = activeEvidenceSummaries.map(item => item.title).slice(0, 6);
    const userMessage = makeMessage("user", text, { contextLabels: activeLabels, contextEvidence: activeEvidenceSummaries });
    const nextMessages = [...messages, userMessage].slice(-CHAT_LIMIT);
    setMessages(nextMessages);
    saveChatHistory(nextMessages, requestStorageKey);
    setInput("");
    saveDraftInput("", requestStorageKey);
    setBusy(true);
    const activeLabelsText = [
      ...activeContext.contextPacks.map(formatContextPackLabel),
      ...(activeContext.comparisonContext?.compareScope ? [`跨学期对比 ${activeContext.comparisonContext.currentScope.termLabel} vs ${activeContext.comparisonContext.compareScope.termLabel}`] : []),
      ...(activeContext.comparisonContext?.notice ? [activeContext.comparisonContext.notice] : []),
    ];
    setStatus(activeLabelsText.length ? `正在分析，并附带：${activeLabelsText.join("、")}` : "正在分析当前班级摘要…");
    try {
      const result = await sendAiAssistantChat({ messages: nextMessages, context: activeContext });
      const assistantMessage = makeMessage("assistant", result.message, {
        contextLabels: activeLabels,
        contextEvidence: activeEvidenceSummaries,
        suggestedPrompts: result.suggestedPrompts.slice(0, 3),
      });
      const saved = [...nextMessages, assistantMessage].slice(-CHAT_LIMIT);
      saveChatHistory(saved, requestStorageKey);
      if (sessionStorageKeyRef.current === requestStorageKey) {
        setMessages(saved);
        setSuggestedPrompts(result.suggestedPrompts.length ? result.suggestedPrompts : initialQuickPrompts);
        setStatus(result.disclaimer);
      }
    } catch (error) {
      if (sessionStorageKeyRef.current === requestStorageKey) {
        const reason = error instanceof Error ? error.message : "";
        setStatus(getAiErrorMessage(reason));
      }
    } finally {
      setBusy(false);
    }
  }

  function clearMessages() {
    setMessages([]);
    saveChatHistory([], sessionStorageKey);
    setStatus("已开始新的对话。AI 不会自动修改班级数据。");
    setSuggestedPrompts(initialQuickPrompts);
    setConfirmClearMessages(false);
  }

  if (!rendered) return <>{appDialog.dialog}</>;

  return (
    <>
      <aside
        id="ai-assistant-companion"
        data-testid="ai-assistant-companion"
        data-transition-state={transitionState}
        role="dialog"
        aria-modal={false}
        aria-label="AI助手浮窗"
        className="ai-companion-panel fixed inset-x-2 bottom-2 top-16 z-[70] flex min-w-0 flex-col overflow-hidden rounded-[var(--app-radius-lg)] border border-violet-100 bg-white shadow-[var(--app-shadow-float)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-[72px] sm:w-[420px]"
      >
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--app-border)] px-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-sm)] bg-violet-50 text-violet-600">
            <Sparkles className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-[var(--app-text)]">AI 助手</h2>
            <p className="truncate text-xs text-[var(--app-text-muted)]">{className} · {termLabel} · {activeSurfaceLabel}</p>
          </div>
          <IconButton label="新对话" size="sm" disabled={!messages.length || busy} onClick={() => setConfirmClearMessages(true)}>
            <Trash2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="关闭AI助手" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        <div className="shrink-0 border-b border-[var(--app-border)] bg-[var(--app-surface-muted)]/60">
          <button
            type="button"
            aria-expanded={contextExpanded}
            aria-controls="ai-assistant-context"
            onClick={() => setContextExpanded(value => !value)}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-violet-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-300"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold text-gray-700">当前上下文 · {activeSurfaceLabel}</span>
              <span className="mt-0.5 block truncate text-[11px] text-gray-400">
                {contextPackLabels.length ? `将附带：${contextPackLabels.join("、")}` : `学生 ${baseContext.studentCount} 人 · 考试 ${exams.length} 次 · 重点候选 ${baseContext.focusStudents.length} 人`}
              </span>
            </span>
            <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-600">{evidenceMode}</span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 motion-reduce:transition-none ${contextExpanded ? "rotate-180" : ""}`} />
          </button>
          {contextExpanded && (
            <div id="ai-assistant-context" className="surface-enter max-h-48 overflow-y-auto border-t border-violet-100 bg-white px-3 py-3">
              <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="rounded-[var(--app-radius-sm)] bg-gray-50 px-2 py-2"><strong className="block text-sm text-gray-800">{baseContext.studentCount}</strong><span className="text-gray-400">学生</span></div>
                <div className="rounded-[var(--app-radius-sm)] bg-gray-50 px-2 py-2"><strong className="block text-sm text-gray-800">{exams.length}</strong><span className="text-gray-400">考试</span></div>
                <div className="rounded-[var(--app-radius-sm)] bg-gray-50 px-2 py-2"><strong className="block text-sm text-gray-800">{baseContext.focusStudents.length}</strong><span className="text-gray-400">重点候选</span></div>
              </div>
              {activeEvidence.length > 0 && <div className="mt-2 space-y-1.5">{activeEvidence.slice(0, 4).map(item => (
                <div key={`${item.title}-${item.detail}`} className="rounded-[var(--app-radius-sm)] border border-violet-100 bg-violet-50/50 px-2.5 py-2">
                  <div className="truncate text-xs font-bold text-gray-700">{item.title}</div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-gray-400">{item.detail}</div>
                </div>
              ))}</div>}
            </div>
          )}
        </div>

        <section ref={messagesScrollRef} aria-label="AI 对话内容" className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-white p-3.5">
          {messages.length === 0 && (
            <div className="flex min-h-full flex-col justify-center py-4">
              <div className="text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-[var(--app-radius-md)] bg-violet-50 text-violet-600"><Bot className="h-6 w-6" /></span>
                <h3 className="mt-3 text-base font-bold text-gray-900">问问当前班级</h3>
                <p className="mx-auto mt-1 max-w-xs text-xs leading-5 text-gray-400">AI 会按问题附带有限的班级摘要，不会在打开面板时自动请求，也不会自动写入数据。</p>
              </div>
              <div className="mt-4 space-y-2">{suggestedPrompts.slice(0, 4).map(prompt => (
                <button key={prompt} type="button" disabled={busy} onClick={() => void sendPrompt(prompt)} className="w-full rounded-[var(--app-radius-sm)] border border-violet-100 bg-violet-50/70 px-3 py-2.5 text-left text-xs font-semibold leading-5 text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50">{prompt}</button>
              ))}</div>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={message.id} className={`ai-message-enter flex gap-2 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              {message.role === "assistant" && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600"><Bot className="h-3.5 w-3.5" /></span>}
              <div className={`max-w-[88%] rounded-[var(--app-radius-md)] px-3 py-2.5 text-sm leading-6 ${message.role === "user" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-700"}`}>
                <div className="whitespace-pre-wrap">{formatChatDisplayText(message)}</div>
                {message.role === "assistant" && index === messages.length - 1 && message.suggestedPrompts?.length ? (
                  <div className="mt-2.5 space-y-1.5 border-t border-gray-100 pt-2.5">{message.suggestedPrompts.slice(0, 3).map(prompt => (
                    <button key={prompt} type="button" disabled={busy} onClick={() => void sendPrompt(prompt)} className="block w-full rounded-lg border border-violet-100 bg-white px-2.5 py-1.5 text-left text-[11px] leading-4 text-violet-700 transition-colors hover:bg-violet-50 disabled:opacity-50">{prompt}</button>
                  ))}</div>
                ) : null}
                <div className={`mt-2 flex flex-wrap items-center gap-3 text-[11px] ${message.role === "user" ? "text-gray-400" : "text-gray-400"}`}>
                  <button type="button" onClick={() => copyMessage(message)} aria-label={message.role === "user" ? "复制老师发送的问题" : "复制 AI 回复"} className={`inline-flex items-center gap-1 ${message.role === "user" ? "hover:text-white" : "hover:text-gray-600"}`}>
                    {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedMessageId === message.id ? "已复制" : "复制"}
                  </button>
                  {message.role === "assistant" && findMessageTargetStudent(message) && <>
                    <button type="button" onClick={() => { const target = findMessageTargetStudent(message); if (target) void saveAssistantRecord(message, target); }} aria-label="保存为学生跟进记录" className="inline-flex items-center gap-1 hover:text-gray-600">{savedActionKey === `${message.id}:record` ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}{savedActionKey === `${message.id}:record` ? "已存记录" : "存记录"}</button>
                    <button type="button" onClick={() => { const target = findMessageTargetStudent(message); if (target) void appendAssistantMaterial(message, target); }} aria-label="加入评语素材" className="inline-flex items-center gap-1 hover:text-gray-600">{savedActionKey === `${message.id}:material` ? <Check className="h-3.5 w-3.5" /> : <FilePlus2 className="h-3.5 w-3.5" />}{savedActionKey === `${message.id}:material` ? "已加素材" : "加素材"}</button>
                  </>}
                  {message.role === "user" && <button type="button" disabled={busy} onClick={() => void sendPrompt(message.content)} aria-label="重试这条问题" className="inline-flex items-center gap-1 hover:text-white disabled:opacity-50"><RotateCcw className="h-3.5 w-3.5" />重试</button>}
                </div>
              </div>
            </div>
          ))}

          {busy && <div className="ai-message-enter ml-9"><AiGenerationPanel title="AI 正在分析" steps={["整理当前问题", "核对相关班级摘要", "形成教师可用建议"]} compact /></div>}
          <div ref={messagesEndRef} />
        </section>

        <footer className="shrink-0 border-t border-[var(--app-border)] bg-white p-3">
          <p className="mb-2 line-clamp-2 text-[11px] leading-4 text-violet-600" aria-live="polite">{status}</p>
          <form className="relative flex items-end gap-2" onSubmit={event => { event.preventDefault(); void sendPrompt(input); }}>
            {showStudentSuggestions && (
              <div className="ai-suggestion-enter absolute bottom-full left-0 right-0 z-10 mb-2 overflow-hidden rounded-[var(--app-radius-md)] border border-violet-100 bg-white shadow-[var(--app-shadow-float)]">
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2"><span className="text-xs font-bold text-gray-500">可能想问的学生</span><span className="text-[11px] text-violet-500">点击插入姓名</span></div>
                <div className="max-h-48 overflow-y-auto p-1.5">{studentSuggestions.map(item => (
                  <button key={item.student.id} type="button" onMouseDown={event => event.preventDefault()} onClick={() => chooseStudentSuggestion(item.student)} className="flex w-full items-center gap-3 rounded-[var(--app-radius-sm)] px-3 py-2 text-left transition-colors hover:bg-violet-50">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--app-radius-sm)] bg-violet-50 text-sm font-bold text-violet-700">{item.student.name.slice(0, 1)}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-gray-900">{item.student.name}</span><span className="block truncate text-xs text-gray-400">{item.reason}{item.student.aliases.length ? ` · ${item.student.aliases.slice(0, 2).join(" / ")}` : ""}</span></span>
                  </button>
                ))}</div>
              </div>
            )}
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              maxLength={1000}
              onChange={event => handleInputChange(event.target.value)}
              onFocus={() => setStudentSuggestOpen(true)}
              onBlur={() => window.setTimeout(() => setStudentSuggestOpen(false), 140)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendPrompt(input);
                }
              }}
              disabled={busy}
              placeholder="输入问题，Enter 发送，Shift+Enter 换行"
              className="min-h-11 min-w-0 flex-1 resize-none overflow-y-auto rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-6 text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-violet-300 focus:bg-white disabled:opacity-60"
            />
            <IconButton label="发送" size="lg" disabled={busy || !input.trim()} className="ai-companion-primary-action" type="submit">
              {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Send className="h-4 w-4" />}
            </IconButton>
          </form>
        </footer>
      </aside>
      <ConfirmDialog open={confirmClearMessages} title="开始新的 AI 对话？" description="将清空当前工作区缓存的这段对话。已保存到学生记录或评语素材的数据不会受到影响。" confirmLabel="清空并新建" onCancel={() => setConfirmClearMessages(false)} onConfirm={clearMessages} />
      {appDialog.dialog}
    </>
  );
}
