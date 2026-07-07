import { IS_COMMERCIAL } from "../config";
import { getProductAuthToken } from "./authStorage";
import { getDirectWorkerUrl, getWorkerBaseUrl } from "./workerEndpoint";
import type { AppStudent, Dormitory, FundTransaction, GradeExam } from "./types";

const AI_AUTH_TOKEN_KEY = "seat-manager-ai-auth-token";
const AI_AUTH_EXPIRES_KEY = "seat-manager-ai-auth-expires";
const AI_AUTH_SESSION_TOKEN_KEY = "seat-manager-ai-session-token";
const AI_AUTH_SESSION_EXPIRES_KEY = "seat-manager-ai-session-expires";
const AI_REMEMBER_DAYS = 30;
const AI_CHAT_LIMIT = 20;

interface AiAuth {
  token: string;
  expiresAt: number;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AiAssistantContext {
  className: string;
  termLabel: string;
  studentCount: number;
  seatCount: number;
  latestExam?: {
    name: string;
    date: string;
    studentCount: number;
    subjectCount: number;
    averageTotal: number | null;
  };
  gradeTrend: string[];
  focusStudents: Array<{
    name: string;
    reasons: string[];
    tags: string[];
  }>;
  dormitorySummary: string[];
  fundSummary: string;
}

export interface AiAssistantResponse {
  message: string;
  disclaimer: string;
  suggestedPrompts: string[];
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage) && Boolean(window.sessionStorage);
}

function getStoredAiAuth(): AiAuth | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  const now = Date.now();
  const candidates = [
    {
      token: window.localStorage.getItem(AI_AUTH_TOKEN_KEY) || "",
      expiresAt: Number.parseInt(window.localStorage.getItem(AI_AUTH_EXPIRES_KEY) || "", 10),
    },
    {
      token: window.sessionStorage.getItem(AI_AUTH_SESSION_TOKEN_KEY) || "",
      expiresAt: Number.parseInt(window.sessionStorage.getItem(AI_AUTH_SESSION_EXPIRES_KEY) || "", 10),
    },
  ];
  return candidates.find(item => item.token && Number.isFinite(item.expiresAt) && item.expiresAt > now) || null;
}

function clearAiAuth(): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.removeItem(AI_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AI_AUTH_EXPIRES_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_EXPIRES_KEY);
}

function storeAiAuth(auth: AiAuth, remember: boolean): void {
  if (!hasBrowserStorage()) {
    return;
  }
  clearAiAuth();
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(remember ? AI_AUTH_TOKEN_KEY : AI_AUTH_SESSION_TOKEN_KEY, auth.token);
  storage.setItem(remember ? AI_AUTH_EXPIRES_KEY : AI_AUTH_SESSION_EXPIRES_KEY, String(auth.expiresAt));
}

export function hasStoredAiAssistantAuth(): boolean {
  return Boolean(IS_COMMERCIAL && getProductAuthToken()) || Boolean(getStoredAiAuth());
}

async function requestAiAuth(accessCode: string, remember: boolean): Promise<AiAuth> {
  const response = await fetch(`${getWorkerBaseUrl()}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode, rememberDays: remember ? AI_REMEMBER_DAYS : 0 }),
  });
  if (response.status === 403) {
    throw new Error("ai_unauthorized");
  }
  if (!response.ok) {
    throw new Error("ai_auth_failed");
  }
  const data = await response.json() as AiAuth;
  if (!data.token || !Number.isFinite(data.expiresAt)) {
    throw new Error("ai_auth_failed");
  }
  storeAiAuth(data, remember);
  return data;
}

async function getAuth(input?: { accessCode?: string; remember?: boolean }): Promise<AiAuth> {
  const productToken = IS_COMMERCIAL ? getProductAuthToken() : "";
  if (productToken) {
    return { token: productToken, expiresAt: Date.now() + AI_REMEMBER_DAYS * 24 * 60 * 60 * 1000 };
  }
  const stored = getStoredAiAuth();
  if (stored) {
    return stored;
  }
  const accessCode = input?.accessCode?.trim();
  if (!accessCode) {
    throw new Error("ai_auth_required");
  }
  return requestAiAuth(accessCode, Boolean(input?.remember));
}

function getExamTotalAverage(exam: GradeExam): number | null {
  const totals = exam.rows
    .map(row => {
      if (typeof row.total === "number" && Number.isFinite(row.total)) {
        return row.total;
      }
      const scores = Object.values(row.scores)
        .map(cell => cell.score)
        .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
      return scores.length ? scores.reduce((sum, score) => sum + score, 0) : null;
    })
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return totals.length ? Math.round((totals.reduce((sum, value) => sum + value, 0) / totals.length) * 10) / 10 : null;
}

function getStudentLatestTotal(student: AppStudent): number | null {
  const exam = student.exams[0];
  if (!exam) {
    return null;
  }
  if (typeof exam.total === "number" && Number.isFinite(exam.total)) {
    return Math.round(exam.total * 10) / 10;
  }
  const scores = Object.values(exam.scores).filter((score): score is number => Number.isFinite(score));
  return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) * 10) / 10 : null;
}

function buildStudentReasons(student: AppStudent): string[] {
  const reasons: string[] = [];
  const chronological = [...student.exams].sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`));
  if (chronological.length >= 2) {
    const first = chronological[0];
    const latest = chronological[chronological.length - 1];
    const firstTotal = typeof first.total === "number" ? first.total : null;
    const latestTotal = typeof latest.total === "number" ? latest.total : null;
    if (firstTotal !== null && latestTotal !== null) {
      const diff = Math.round((latestTotal - firstTotal) * 10) / 10;
      if (diff < 0) {
        reasons.push(`总分下降 ${Math.abs(diff)}`);
      } else if (diff > 0) {
        reasons.push(`总分提升 ${diff}`);
      }
    }
  }
  if (student.records.length) {
    reasons.push(`近期记录 ${student.records.slice(0, 3).map(record => record.note).filter(Boolean).join("；")}`);
  }
  if (!reasons.length && (student.academicTags.length || student.tags.length)) {
    reasons.push("有标签可参考");
  }
  return reasons.slice(0, 3);
}

export function buildAiAssistantContext(input: {
  className: string;
  termLabel: string;
  students: AppStudent[];
  exams: GradeExam[];
  dormitories: Dormitory[];
  fundTransactions: FundTransaction[];
  seatCount: number;
}): AiAssistantContext {
  const exams = [...input.exams].sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`));
  const latestExam = exams[exams.length - 1];
  const previousExam = exams[exams.length - 2];
  const gradeTrend: string[] = [];
  if (previousExam && latestExam) {
    const previousAvg = getExamTotalAverage(previousExam);
    const latestAvg = getExamTotalAverage(latestExam);
    if (previousAvg !== null && latestAvg !== null) {
      const diff = Math.round((latestAvg - previousAvg) * 10) / 10;
      gradeTrend.push(`班级均分较上次${diff >= 0 ? "上升" : "下降"} ${Math.abs(diff)} 分`);
    }
  }
  const focusStudents = input.students
    .map(student => ({
      student,
      latestTotal: getStudentLatestTotal(student),
      reasons: buildStudentReasons(student),
    }))
    .filter(item => item.reasons.length)
    .sort((a, b) => (a.latestTotal ?? Number.NEGATIVE_INFINITY) - (b.latestTotal ?? Number.NEGATIVE_INFINITY))
    .slice(0, 12)
    .map(item => ({
      name: item.student.name,
      reasons: item.reasons,
      tags: [...item.student.academicTags, ...item.student.tags].slice(0, 6),
    }));
  const dormitorySummary = input.dormitories
    .map(dorm => `${dorm.name} 当前 ${dorm.currentScore} 分，成员 ${dorm.memberIds.length} 人`)
    .slice(0, 8);
  const income = input.fundTransactions.filter(tx => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expense = input.fundTransactions.filter(tx => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  return {
    className: input.className,
    termLabel: input.termLabel,
    studentCount: input.students.length,
    seatCount: input.seatCount,
    latestExam: latestExam ? {
      name: latestExam.name,
      date: latestExam.date,
      studentCount: latestExam.rows.length,
      subjectCount: latestExam.subjects.length,
      averageTotal: getExamTotalAverage(latestExam),
    } : undefined,
    gradeTrend,
    focusStudents,
    dormitorySummary,
    fundSummary: `收入 ${Math.round(income * 100) / 100}，支出 ${Math.round(expense * 100) / 100}，余额 ${Math.round((income - expense) * 100) / 100}`,
  };
}

export async function sendAiAssistantChat(input: {
  messages: AiChatMessage[];
  context: AiAssistantContext;
  accessCode?: string;
  remember?: boolean;
}): Promise<AiAssistantResponse> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }
  const auth = await getAuth({ accessCode: input.accessCode, remember: input.remember });
  const requestBody = JSON.stringify({
    messages: input.messages.slice(-AI_CHAT_LIMIT).map(message => ({
      role: message.role,
      content: message.content,
    })),
    context: input.context,
  });
  const send = (baseUrl: string) => fetch(`${baseUrl}/chat-assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
    },
    body: requestBody,
  });
  let response = await send(getWorkerBaseUrl());
  if (response.status === 404 || response.status === 405) {
    response = await send(getDirectWorkerUrl());
  }
  if (response.status === 401) {
    if (!IS_COMMERCIAL) {
      clearAiAuth();
    }
    throw new Error("ai_unauthorized");
  }
  if (response.status === 403) {
    throw new Error("ai_unauthorized");
  }
  if (response.status === 413) {
    throw new Error("ai_payload_too_large");
  }
  if (response.status === 429) {
    throw new Error("ai_rate_limited");
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error ? `ai_failed:${errorData.error}` : "ai_failed");
  }
  const data = await response.json() as Partial<AiAssistantResponse>;
  const message = String(data.message || "").trim();
  if (!message) {
    throw new Error("ai_failed");
  }
  return {
    message,
    disclaimer: String(data.disclaimer || "AI 内容仅供教师参考，请结合实际课堂观察判断。").trim(),
    suggestedPrompts: Array.isArray(data.suggestedPrompts) ? data.suggestedPrompts.map(String).filter(Boolean).slice(0, 4) : [],
  };
}
