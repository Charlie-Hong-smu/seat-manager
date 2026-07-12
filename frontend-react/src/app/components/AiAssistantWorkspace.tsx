import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Copy, FilePlus2, Loader2, RotateCcw, Save, Send, Sparkles, Trash2, UserRound } from "lucide-react";

import {
  buildAiAssistantBaseContext,
  buildAiAssistantContext,
  hasStoredAiAssistantAuth,
  sendAiAssistantChat,
  type AiComparisonContext,
  type AiContextPack,
  type AiChatMessage,
} from "../state/aiAssistantService";
import { getCurrentSlice, sliceDisplayName } from "../state/workspaces";
import type { AppStudent, Dormitory, FundTransaction, GradeExam, StudentId } from "../state/types";
import { ConfirmDialog, useAppDialog } from "./ui";

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

function getDraftStorageKey(): string {
  return `${getStorageKey()}:draft`;
}

function loadChatHistory(): AiChatMessage[] {
  if (!hasBrowserStorage()) {
    return [];
  }
  try {
    const raw = JSON.parse(window.localStorage.getItem(getStorageKey()) || "[]") as Partial<AiChatMessage>[];
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

function loadDraftInput(): string {
  if (!hasBrowserStorage()) {
    return "";
  }
  return (window.localStorage.getItem(getDraftStorageKey()) || "").slice(0, 1000);
}

function saveChatHistory(messages: AiChatMessage[]): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.setItem(getStorageKey(), JSON.stringify(messages.slice(-CHAT_LIMIT)));
}

function saveDraftInput(value: string): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.setItem(getDraftStorageKey(), value.slice(0, 1000));
}

function getAiErrorMessage(reason: string): string {
  return {
    ai_auth_required: "请输入 AI 授权码后再发送。",
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

export function AiAssistantWorkspace({
  active,
  students,
  exams,
  dormitories,
  fundTransactions,
  seatOrder,
  onSaveStudentRecord,
  onAppendCommentMaterial,
}: {
  active: boolean;
  students: AppStudent[];
  exams: GradeExam[];
  dormitories: Dormitory[];
  fundTransactions: FundTransaction[];
  seatOrder: Array<StudentId | null>;
  onSaveStudentRecord?: (student: AppStudent, note: string) => void;
  onAppendCommentMaterial?: (student: AppStudent, text: string) => void;
}) {
  const appDialog = useAppDialog();
  const [messages, setMessages] = useState<AiChatMessage[]>(() => loadChatHistory());
  const [confirmClearMessages, setConfirmClearMessages] = useState(false);
  const [input, setInput] = useState(() => loadDraftInput());
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiAssistantAuth());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("AI 只会读取当前班级、当前学期的摘要，不会自动修改数据。");
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(QUICK_PROMPTS);
  const [copiedMessageId, setCopiedMessageId] = useState<string>("");
  const [savedActionKey, setSavedActionKey] = useState("");
  const [studentSuggestOpen, setStudentSuggestOpen] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const slice = useMemo(() => {
    try {
      return getCurrentSlice();
    } catch {
      return null;
    }
  }, []);
  const baseContext = useMemo(() => buildAiAssistantBaseContext({
    className: slice ? sliceDisplayName(slice) : "当前班级",
    termLabel: slice?.term.label || "当前学期",
    students,
    exams,
    dormitories,
    fundTransactions,
    seatCount: seatOrder.length,
    occupiedSeatCount: seatOrder.filter(Boolean).length,
  }), [dormitories, exams, fundTransactions, seatOrder, slice, students]);
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
  const evidenceMode = previewEvidence.length ? "将附带" : (lockedEvidence.length ? "本轮已使用" : "");
  const studentSuggestions = useMemo(() => buildStudentSuggestions(input, students), [input, students]);
  const showStudentSuggestions = studentSuggestOpen && studentSuggestions.length > 0 && !busy;
  const initialQuickPrompts = useMemo(() => buildInitialQuickPrompts({
    exams,
    dormitories,
    focusCount: baseContext.focusStudents.length,
  }), [baseContext.focusStudents.length, dormitories, exams]);

  useEffect(() => {
    saveDraftInput(input);
  }, [input]);

  useEffect(() => {
    if (!messages.length) {
      setSuggestedPrompts(initialQuickPrompts);
    }
  }, [initialQuickPrompts, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const scrollToBottom = () => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
      if (messagesScrollRef.current) {
        messagesScrollRef.current.scrollTop = messagesScrollRef.current.scrollHeight;
      }
    };
    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);
    const timer = window.setTimeout(scrollToBottom, 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [active, messages.length]);

  function handleInputChange(value: string) {
    setInput(value);
    saveDraftInput(value);
    setStudentSuggestOpen(true);
  }

  function chooseStudentSuggestion(student: AppStudent) {
    const nextInput = applyStudentSuggestion(input, student.name);
    handleInputChange(nextInput);
    setStudentSuggestOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function copyMessage(message: AiChatMessage) {
    navigator.clipboard.writeText(formatChatDisplayText(message)).then(() => {
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId(current => (current === message.id ? "" : current));
      }, 1400);
    }).catch(() => {});
  }

  function findMessageTargetStudent(message: AiChatMessage): AppStudent | null {
    if (message.role !== "assistant") {
      return null;
    }
    const labels = [
      ...(message.contextLabels || []),
      ...(message.contextEvidence || []).flatMap(item => [item.title, item.detail]),
    ].join(" ");
    if (!labels.trim()) {
      return null;
    }
    return students.find(student => labels.includes(student.name)) || null;
  }

  async function saveAssistantRecord(message: AiChatMessage, student: AppStudent) {
    if (!onSaveStudentRecord) {
      return;
    }
    if (!await appDialog.confirm({ title: "保存到学生记录？", description: `将把这条 AI 回复写入 ${student.name} 的学生记录。AI 内容仍应由教师确认后使用。`, confirmLabel: "确认保存", variant: "primary" })) {
      return;
    }
    onSaveStudentRecord(student, formatChatDisplayText(message));
    setSavedActionKey(`${message.id}:record`);
  }

  async function appendAssistantMaterial(message: AiChatMessage, student: AppStudent) {
    if (!onAppendCommentMaterial) {
      return;
    }
    if (!await appDialog.confirm({ title: "加入评语素材？", description: `将把这条 AI 回复加入 ${student.name} 的评语素材，之后仍可继续编辑。`, confirmLabel: "确认加入", variant: "primary" })) {
      return;
    }
    onAppendCommentMaterial(student, formatChatDisplayText(message));
    setSavedActionKey(`${message.id}:material`);
  }

  async function sendPrompt(prompt: string) {
    const text = prompt.trim();
    if (!text || busy) {
      return;
    }
    const activeContext = buildAiAssistantContext({
      prompt: text,
      baseContext,
      students,
      exams,
      dormitories,
      fundTransactions,
    });
    const activeEvidenceSummaries = [
      ...buildComparisonEvidence(activeContext.comparisonContext),
      ...buildEvidenceSummaries(activeContext.contextPacks),
    ];
    const activeLabels = activeEvidenceSummaries.map(item => item.title).slice(0, 6);
    const userMessage = makeMessage("user", text, { contextLabels: activeLabels, contextEvidence: activeEvidenceSummaries });
    const nextMessages = [...messages, userMessage].slice(-CHAT_LIMIT);
    setMessages(nextMessages);
    saveChatHistory(nextMessages);
    setInput("");
    saveDraftInput("");
    setBusy(true);
    const activeLabelsText = [
      ...activeContext.contextPacks.map(formatContextPackLabel),
      ...(activeContext.comparisonContext?.compareScope ? [`跨学期对比 ${activeContext.comparisonContext.currentScope.termLabel} vs ${activeContext.comparisonContext.compareScope.termLabel}`] : []),
      ...(activeContext.comparisonContext?.notice ? [activeContext.comparisonContext.notice] : []),
    ];
    setStatus(activeLabelsText.length ? `AI 正在分析当前班级摘要，并附带：${activeLabelsText.join("、")}` : "AI 正在分析当前班级摘要...");
    try {
      const result = await sendAiAssistantChat({
        messages: nextMessages,
        context: activeContext,
        accessCode,
        remember: rememberAuth,
      });
      const assistantMessage = makeMessage("assistant", result.message, {
        contextLabels: activeLabels,
        contextEvidence: activeEvidenceSummaries,
        suggestedPrompts: result.suggestedPrompts.slice(0, 3),
      });
      const saved = [...nextMessages, assistantMessage].slice(-CHAT_LIMIT);
      setMessages(saved);
      saveChatHistory(saved);
      setAccessCode("");
      setHasAuth(true);
      setSuggestedPrompts(result.suggestedPrompts.length ? result.suggestedPrompts : initialQuickPrompts);
      setStatus(result.disclaimer);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setStatus(getAiErrorMessage(reason));
      setHasAuth(hasStoredAiAssistantAuth());
    } finally {
      setBusy(false);
    }
  }

  function clearMessages() {
    setMessages([]);
    saveChatHistory([]);
    setStatus("对话已清空。");
    setConfirmClearMessages(false);
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="shrink-0 border-b border-gray-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-violet-50 text-violet-600">
                <Sparkles className="h-4.5 w-4.5" />
              </span>
              <div>
                <h1 className="text-xl text-gray-900" style={{ fontWeight: 900 }}>AI助手</h1>
                <p className="mt-0.5 text-sm text-gray-400">{baseContext.className} · {baseContext.termLabel}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setConfirmClearMessages(true)}
            disabled={!messages.length || busy}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            style={{ fontWeight: 800 }}
          >
            <Trash2 className="h-4 w-4" />清空
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[18rem_minmax(0,1fr)] gap-4 p-4">
        <aside className="min-h-0 space-y-4 overflow-y-auto">
          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>当前范围</div>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <div className="rounded-xl bg-gray-50 px-3 py-2">学生 {baseContext.studentCount} 人 · 座位 {baseContext.seatCount} 个</div>
              <div className="rounded-xl bg-gray-50 px-3 py-2">考试 {exams.length} 次{baseContext.latestExam ? ` · 最近：${baseContext.latestExam.name}` : ""}</div>
              <div className="rounded-xl bg-gray-50 px-3 py-2">重点候选 {baseContext.focusStudents.length} 人</div>
            </div>
          </section>

          {activeEvidence.length > 0 && (
            <section className="surface-enter rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>本次依据</div>
                <span className="rounded-full bg-violet-50 px-2 py-1 text-xs text-violet-600" style={{ fontWeight: 800 }}>{evidenceMode}</span>
              </div>
              <div className="mt-3 space-y-2">
                {activeEvidence.slice(0, 3).map(item => (
                  <div key={`${item.title}-${item.detail}`} className="rounded-xl bg-gray-50 px-3 py-2">
                    <div className="truncate text-sm text-gray-800" style={{ fontWeight: 800 }}>{item.title}</div>
                    <div className="mt-0.5 line-clamp-2 text-xs leading-5 text-gray-400">{item.detail}</div>
                  </div>
                ))}
                {activeEvidence.length > 3 && (
                  <div className="px-1 text-xs text-gray-400">另有 {activeEvidence.length - 3} 项依据</div>
                )}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>快捷问题</div>
            <div className="mt-3 space-y-2">
              {suggestedPrompts.slice(0, 4).map(prompt => (
                <button
                  key={prompt}
                  onClick={() => void sendPrompt(prompt)}
                  disabled={busy}
                  className="w-full rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-left text-sm leading-relaxed text-violet-700 hover:bg-violet-100 disabled:opacity-50"
                  style={{ fontWeight: 700 }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </section>

          {!hasAuth && (
            <section className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
              <div className="text-sm text-violet-700" style={{ fontWeight: 900 }}>AI 授权</div>
              <input
                value={accessCode}
                onChange={event => setAccessCode(event.target.value)}
                type="password"
                placeholder="输入 AI 授权码"
                className="mt-3 h-10 w-full rounded-xl border border-violet-100 bg-white px-3 text-sm outline-none focus:border-violet-300"
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-violet-700">
                <input type="checkbox" checked={rememberAuth} onChange={event => setRememberAuth(event.target.checked)} className="accent-violet-600" />
                记住授权 30 天
              </label>
            </section>
          )}
        </aside>

        <main className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div ref={messagesScrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {messages.length === 0 && (
              <div className="grid h-full place-items-center text-center">
                <div className="max-w-md">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-violet-50 text-violet-600">
                    <Bot className="h-7 w-7" />
                  </div>
                  <h2 className="mt-4 text-lg text-gray-900" style={{ fontWeight: 900 }}>问问当前班级</h2>
                  <p className="mt-2 text-sm leading-6 text-gray-400">可以直接问班级状态、重点学生、成绩变化、沟通建议或评语素材方向。</p>
                </div>
              </div>
            )}
            {messages.map((message, index) => (
              <div key={message.id} className={`ai-message-enter flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-700"}`}>
                  <div className="whitespace-pre-wrap">{formatChatDisplayText(message)}</div>
                  {message.role === "assistant" && index === messages.length - 1 && message.suggestedPrompts?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
                      {message.suggestedPrompts.slice(0, 3).map(prompt => (
                        <button
                          key={prompt}
                          type="button"
                          disabled={busy}
                          onClick={() => void sendPrompt(prompt)}
                          className="rounded-full border border-violet-100 bg-white px-3 py-1.5 text-left text-xs leading-5 text-violet-700 transition-colors hover:bg-violet-50 disabled:opacity-50"
                          style={{ fontWeight: 750 }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className={`mt-2 flex flex-wrap items-center gap-3 text-xs ${message.role === "user" ? "text-gray-400" : "text-gray-400"}`}>
                    <button
                      type="button"
                      onClick={() => copyMessage(message)}
                      title={message.role === "user" ? "复制老师发送的问题" : "复制 AI 回复"}
                      aria-label={message.role === "user" ? "复制老师发送的问题" : "复制 AI 回复"}
                      className={`inline-flex items-center gap-1 ${message.role === "user" ? "hover:text-white" : "hover:text-gray-600"}`}
                    >
                      {copiedMessageId === message.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedMessageId === message.id ? "已复制" : "复制"}
                    </button>
                    {message.role === "assistant" && findMessageTargetStudent(message) && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const target = findMessageTargetStudent(message);
                            if (target) saveAssistantRecord(message, target);
                          }}
                          title="保存为学生跟进记录"
                          aria-label="保存为学生跟进记录"
                          className="inline-flex items-center gap-1 hover:text-gray-600"
                        >
                          {savedActionKey === `${message.id}:record` ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
                          {savedActionKey === `${message.id}:record` ? "已存记录" : "存记录"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const target = findMessageTargetStudent(message);
                            if (target) appendAssistantMaterial(message, target);
                          }}
                          title="加入评语素材"
                          aria-label="加入评语素材"
                          className="inline-flex items-center gap-1 hover:text-gray-600"
                        >
                          {savedActionKey === `${message.id}:material` ? <Check className="h-3.5 w-3.5" /> : <FilePlus2 className="h-3.5 w-3.5" />}
                          {savedActionKey === `${message.id}:material` ? "已加素材" : "加素材"}
                        </button>
                      </>
                    )}
                    {message.role === "user" && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void sendPrompt(message.content)}
                        title="重试这条问题"
                        aria-label="重试这条问题"
                        className="inline-flex items-center gap-1 hover:text-white disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />重试
                      </button>
                    )}
                  </div>
                </div>
                {message.role === "user" && (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gray-900 text-white">
                    <UserRound className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))}
            {busy && (
              <div className="ai-message-enter flex gap-3 justify-start" aria-live="polite" aria-label="AI 正在思考">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                  <Bot className="h-4 w-4" />
                </span>
                <div className="rounded-2xl bg-gray-50 px-4 py-3">
                  <div className="flex h-6 items-center gap-1.5">
                    <span className="ai-thinking-dot h-2 w-2 rounded-full bg-violet-300" />
                    <span className="ai-thinking-dot h-2 w-2 rounded-full bg-violet-300 [animation-delay:120ms]" />
                    <span className="ai-thinking-dot h-2 w-2 rounded-full bg-violet-300 [animation-delay:240ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="shrink-0 border-t border-gray-100 p-4">
            <p className="mb-3 text-xs text-violet-600">{status}</p>
            {contextPackLabels.length > 0 && (
              <p className="mb-3 rounded-xl bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-700">
                本次将附带：{contextPackLabels.join("、")}
              </p>
            )}
            <form
              className="relative flex gap-2"
              onSubmit={event => {
                event.preventDefault();
                void sendPrompt(input);
              }}
            >
              {showStudentSuggestions && (
                <div className="ai-suggestion-enter absolute bottom-full left-0 right-20 z-10 mb-2 overflow-hidden rounded-2xl border border-violet-100 bg-white shadow-xl shadow-violet-100/60">
                  <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                    <span className="text-xs text-gray-500" style={{ fontWeight: 800 }}>可能想问的学生</span>
                    <span className="text-xs text-violet-500">点击插入姓名</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1.5">
                    {studentSuggestions.map(item => (
                      <button
                        key={item.student.id}
                        type="button"
                        onMouseDown={event => event.preventDefault()}
                        onClick={() => chooseStudentSuggestion(item.student)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-violet-50"
                      >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-violet-50 text-sm text-violet-700" style={{ fontWeight: 900 }}>
                          {item.student.name.slice(0, 1)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-gray-900" style={{ fontWeight: 850 }}>{item.student.name}</span>
                          <span className="block truncate text-xs text-gray-400">
                            {item.reason}{item.student.aliases.length ? ` · ${item.student.aliases.slice(0, 2).join(" / ")}` : ""}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <input
                ref={inputRef}
                value={input}
                onChange={event => handleInputChange(event.target.value)}
                onFocus={() => setStudentSuggestOpen(true)}
                onBlur={() => window.setTimeout(() => setStudentSuggestOpen(false), 140)}
                disabled={busy}
                placeholder="输入你想问 AI 的问题..."
                className="h-11 min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none transition-colors focus:border-violet-300 focus:bg-white disabled:opacity-60"
              />
              <button
                disabled={busy || !input.trim()}
                className="flex h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm text-white hover:bg-violet-700 disabled:opacity-50"
                style={{ fontWeight: 800 }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                发送
              </button>
            </form>
          </div>
        </main>
      </div>
      <ConfirmDialog open={confirmClearMessages} title="清空当前 AI 对话？" description="将删除当前工作区缓存的全部 AI 对话内容。已保存到学生记录或评语素材的数据不会受到影响。" confirmLabel="确认清空对话" onCancel={() => setConfirmClearMessages(false)} onConfirm={clearMessages} />
      {appDialog.dialog}
    </div>
  );
}
