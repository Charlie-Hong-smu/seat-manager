import { useMemo, useState } from "react";
import { Bot, Copy, Loader2, Send, Sparkles, Trash2, UserRound } from "lucide-react";

import {
  buildAiAssistantContext,
  hasStoredAiAssistantAuth,
  sendAiAssistantChat,
  type AiChatMessage,
} from "../state/aiAssistantService";
import { getCurrentSlice, sliceDisplayName } from "../state/workspaces";
import type { AppStudent, Dormitory, FundTransaction, GradeExam, StudentId } from "../state/types";

const QUICK_PROMPTS = [
  "帮我分析这个班当前最需要关注的学生，并给出跟进建议。",
  "根据最近考试，帮我总结班级整体变化和下一步教学重点。",
  "帮我写一段适合和家长沟通的温和说明，重点讲学习状态和可执行建议。",
  "帮我整理期末评语可以使用的素材方向，不要直接编造事实。",
];

const CHAT_LIMIT = 20;

function makeMessage(role: AiChatMessage["role"], content: string): AiChatMessage {
  return {
    id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
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
      }))
      .slice(-CHAT_LIMIT);
  } catch {
    return [];
  }
}

function saveChatHistory(messages: AiChatMessage[]): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.setItem(getStorageKey(), JSON.stringify(messages.slice(-CHAT_LIMIT)));
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

export function AiAssistantWorkspace({
  students,
  exams,
  dormitories,
  fundTransactions,
  seatOrder,
}: {
  students: AppStudent[];
  exams: GradeExam[];
  dormitories: Dormitory[];
  fundTransactions: FundTransaction[];
  seatOrder: Array<StudentId | null>;
}) {
  const [messages, setMessages] = useState<AiChatMessage[]>(() => loadChatHistory());
  const [input, setInput] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [rememberAuth, setRememberAuth] = useState(true);
  const [hasAuth, setHasAuth] = useState(() => hasStoredAiAssistantAuth());
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("AI 只会读取当前班级、当前学期的摘要，不会自动修改数据。");
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>(QUICK_PROMPTS);

  const slice = useMemo(() => {
    try {
      return getCurrentSlice();
    } catch {
      return null;
    }
  }, []);
  const context = useMemo(() => buildAiAssistantContext({
    className: slice ? sliceDisplayName(slice) : "当前班级",
    termLabel: slice?.term.label || "当前学期",
    students,
    exams,
    dormitories,
    fundTransactions,
    seatCount: seatOrder.length,
  }), [dormitories, exams, fundTransactions, seatOrder.length, slice, students]);

  async function sendPrompt(prompt: string) {
    const text = prompt.trim();
    if (!text || busy) {
      return;
    }
    const userMessage = makeMessage("user", text);
    const nextMessages = [...messages, userMessage].slice(-CHAT_LIMIT);
    setMessages(nextMessages);
    saveChatHistory(nextMessages);
    setInput("");
    setBusy(true);
    setStatus("AI 正在分析当前班级摘要...");
    try {
      const result = await sendAiAssistantChat({
        messages: nextMessages,
        context,
        accessCode,
        remember: rememberAuth,
      });
      const assistantMessage = makeMessage("assistant", result.message);
      const saved = [...nextMessages, assistantMessage].slice(-CHAT_LIMIT);
      setMessages(saved);
      saveChatHistory(saved);
      setAccessCode("");
      setHasAuth(true);
      setSuggestedPrompts(result.suggestedPrompts.length ? result.suggestedPrompts : QUICK_PROMPTS);
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
                <p className="mt-0.5 text-sm text-gray-400">{context.className} · {context.termLabel}</p>
              </div>
            </div>
          </div>
          <button
            onClick={clearMessages}
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
            <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>可分析内容</div>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <div className="rounded-xl bg-gray-50 px-3 py-2">学生 {context.studentCount} 人 · 座位 {context.seatCount} 个</div>
              <div className="rounded-xl bg-gray-50 px-3 py-2">{context.latestExam ? `最近考试：${context.latestExam.name}` : "暂无考试数据"}</div>
              <div className="rounded-xl bg-gray-50 px-3 py-2">重点候选 {context.focusStudents.length} 人</div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>快捷分析</div>
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
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
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
            {messages.map(message => (
              <div key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                {message.role === "assistant" && (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                    <Bot className="h-4 w-4" />
                  </span>
                )}
                <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-700"}`}>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                  {message.role === "assistant" && (
                    <button
                      onClick={() => navigator.clipboard.writeText(message.content).catch(() => {})}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
                    >
                      <Copy className="h-3.5 w-3.5" />复制
                    </button>
                  )}
                </div>
                {message.role === "user" && (
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gray-900 text-white">
                    <UserRound className="h-4 w-4" />
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-gray-100 p-4">
            <p className="mb-3 text-xs text-violet-600">{status}</p>
            <form
              className="flex gap-2"
              onSubmit={event => {
                event.preventDefault();
                void sendPrompt(input);
              }}
            >
              <input
                value={input}
                onChange={event => setInput(event.target.value)}
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
    </div>
  );
}
