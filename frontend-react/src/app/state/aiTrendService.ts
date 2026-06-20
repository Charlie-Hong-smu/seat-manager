import type { AppStudent, StudentExamSummary } from "./types";

const AI_WORKER_URL_KEY = "seat-manager-ai-worker-url";
const AI_DEFAULT_WORKER_URL = "https://seat-manager-ai.hongchenglin03.workers.dev";
const AI_AUTH_TOKEN_KEY = "seat-manager-ai-auth-token";
const AI_AUTH_EXPIRES_KEY = "seat-manager-ai-auth-expires";
const AI_AUTH_SESSION_TOKEN_KEY = "seat-manager-ai-session-token";
const AI_AUTH_SESSION_EXPIRES_KEY = "seat-manager-ai-session-expires";
const AI_RESULT_CACHE_KEY = "seat-manager-ai-result-cache-v1";
const AI_TREND_CACHE_SCOPE = "student-trend";
const AI_REMEMBER_DAYS = 30;
const AI_REQUEST_LIMIT_BYTES = 20 * 1024;

interface AiAuth {
  token: string;
  expiresAt: number;
}

export interface AiTrendResult {
  overall: string;
  changes: string;
  suggestions: string;
  disclaimer: string;
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage) && Boolean(window.sessionStorage);
}

function getWorkerBaseUrl(): string {
  if (!hasBrowserStorage()) {
    return AI_DEFAULT_WORKER_URL;
  }
  const configuredUrl = window.localStorage.getItem(AI_WORKER_URL_KEY)?.trim() || AI_DEFAULT_WORKER_URL;
  return configuredUrl.replace(/\/+$/, "");
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

export function hasStoredAiTrendAuth(): boolean {
  return Boolean(getStoredAiAuth());
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function getCacheSignature(payload: unknown): string {
  return `${AI_TREND_CACHE_SCOPE}:${stableStringify(payload)}`;
}

function getCachedTrend(signature: string): AiTrendResult | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, AiTrendResult>;
    return cache[signature] || null;
  } catch {
    return null;
  }
}

function storeCachedTrend(signature: string, result: AiTrendResult): void {
  if (!hasBrowserStorage()) {
    return;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, AiTrendResult>;
    const next = Object.fromEntries(Object.entries({ ...cache, [signature]: result }).slice(-50));
    window.localStorage.setItem(AI_RESULT_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore cache write failures.
  }
}

function getExamSortValue(exam: StudentExamSummary): string {
  return `${exam.date || "9999-12-31"}-${exam.name}-${exam.id}`;
}

function getScoreEntries(exam: StudentExamSummary): Array<[string, number]> {
  return Object.entries(exam.scores).filter(([, score]) => Number.isFinite(score));
}

function getExamTotal(exam: StudentExamSummary): number | null {
  if (typeof exam.total === "number" && Number.isFinite(exam.total)) {
    return Math.round(exam.total * 10) / 10;
  }
  const entries = getScoreEntries(exam);
  if (!entries.length) {
    return null;
  }
  return Math.round(entries.reduce((sum, [, score]) => sum + score, 0) * 10) / 10;
}

export function buildLocalTrendSummary(exams: StudentExamSummary[]): string {
  const chronological = [...exams].sort((a, b) => getExamSortValue(a).localeCompare(getExamSortValue(b)));
  const totals = chronological.map(getExamTotal).filter((value): value is number => typeof value === "number");
  const summary: string[] = [];
  if (totals.length >= 2) {
    const diff = Math.round((totals[totals.length - 1] - totals[0]) * 10) / 10;
    summary.push(`总分较最早一次${diff >= 0 ? "上升" : "下降"} ${Math.abs(diff)} 分。`);
  }
  const subjects = new Set<string>();
  chronological.forEach(exam => Object.keys(exam.scores).forEach(subject => subjects.add(subject)));
  subjects.forEach(subject => {
    const values = chronological
      .map(exam => exam.scores[subject])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    if (values.length >= 2) {
      const diff = Math.round((values[values.length - 1] - values[0]) * 10) / 10;
      if (Math.abs(diff) >= 5) {
        summary.push(`${subject}${diff >= 0 ? "上升" : "下降"} ${Math.abs(diff)} 分。`);
      }
    }
  });
  return summary.length ? summary.join(" ") : "可用考试次数或有效分数较少，主要参考单次成绩和排名。";
}

function buildPayload(student: AppStudent) {
  const chronological = [...student.exams].sort((a, b) => getExamSortValue(a).localeCompare(getExamSortValue(b)));
  const recentSource = chronological.slice(-6);
  const recentExams = recentSource.map((exam, index) => {
    const subjects: Record<string, { score: number; rankClass: null; rankSchool: null }> = {};
    getScoreEntries(exam).forEach(([subject, score]) => {
      subjects[subject] = { score, rankClass: null, rankSchool: null };
    });
    return {
      order: index + 1,
      name: exam.name || "考试",
      date: exam.date || "",
      period: index === 0 ? "oldest" : index === recentSource.length - 1 ? "latest" : "middle",
      totalScore: getExamTotal(exam),
      classRank: exam.rank ? Number.parseInt(exam.rank, 10) || null : null,
      schoolRank: null,
      subjects,
    };
  });
  return {
    student: "学生A",
    orderInstruction: "recentExams 已按考试先后从早到晚排列；最后一项是最新考试。所有升降变化都必须用最新考试减最早考试来判断。",
    recentExams,
    localAnalysis: {
      summary: buildLocalTrendSummary(student.exams),
    },
  };
}

function validatePayloadSize(payload: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(payload)).length <= AI_REQUEST_LIMIT_BYTES;
}

function normalizeResult(data: Partial<AiTrendResult>): AiTrendResult {
  return {
    overall: String(data.overall || "").trim(),
    changes: String(data.changes || "").trim(),
    suggestions: String(data.suggestions || "").trim(),
    disclaimer: String(data.disclaimer || "AI 分析仅供教师参考，请结合课堂观察判断。").trim(),
  };
}

export async function generateStudentAiTrend(
  student: AppStudent,
  input?: { accessCode?: string; remember?: boolean; force?: boolean },
): Promise<AiTrendResult> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }
  if (student.exams.length < 2) {
    throw new Error("ai_insufficient_trend");
  }

  const payload = buildPayload(student);
  if (!validatePayloadSize(payload)) {
    throw new Error("ai_payload_too_large");
  }
  const signature = getCacheSignature({ studentId: student.id, payload });
  if (!input?.force) {
    const cached = getCachedTrend(signature);
    if (cached?.overall || cached?.changes || cached?.suggestions) {
      return cached;
    }
  }

  const send = async (token: string) => fetch(`${getWorkerBaseUrl()}/analyze-trend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let auth = await getAuth(input);
  let response = await send(auth.token);
  if (response.status === 401) {
    clearAiAuth();
    auth = await getAuth(input);
    response = await send(auth.token);
  }
  if (response.status === 403) {
    throw new Error("ai_unauthorized");
  }
  if (response.status === 429) {
    throw new Error("ai_rate_limited");
  }
  if (!response.ok) {
    throw new Error("ai_failed");
  }

  const result = normalizeResult(await response.json() as Partial<AiTrendResult>);
  if (!result.overall && !result.changes && !result.suggestions) {
    throw new Error("ai_failed");
  }
  storeCachedTrend(signature, result);
  return result;
}
