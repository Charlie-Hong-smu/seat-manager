import { saveStudentCommentDraft } from "./commentStorage";
import { IS_COMMERCIAL } from "../config";
import { getProductAuthToken } from "./authStorage";
import type { AppStudent, StudentCommentDraft } from "./types";

const AI_WORKER_URL_KEY = "seat-manager-ai-worker-url";
const AI_DEFAULT_WORKER_URL = "https://seat-manager-ai.hongchenglin03.workers.dev";
const AI_AUTH_TOKEN_KEY = "seat-manager-ai-auth-token";
const AI_AUTH_EXPIRES_KEY = "seat-manager-ai-auth-expires";
const AI_AUTH_SESSION_TOKEN_KEY = "seat-manager-ai-session-token";
const AI_AUTH_SESSION_EXPIRES_KEY = "seat-manager-ai-session-expires";
const AI_RESULT_CACHE_KEY = "seat-manager-ai-result-cache-v1";
const AI_COMMENT_CACHE_SCOPE = "student-comment";
const AI_REMEMBER_DAYS = 30;
const AI_REQUEST_LIMIT_BYTES = 20 * 1024;

interface AiAuth {
  token: string;
  expiresAt: number;
}

interface AiResult {
  comment: string;
  needsMoreInfo?: boolean;
  missingInfo?: string[];
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

function storeAiAuth(auth: AiAuth, remember: boolean): void {
  if (!hasBrowserStorage()) {
    return;
  }
  clearAiAuth();
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(remember ? AI_AUTH_TOKEN_KEY : AI_AUTH_SESSION_TOKEN_KEY, auth.token);
  storage.setItem(remember ? AI_AUTH_EXPIRES_KEY : AI_AUTH_SESSION_EXPIRES_KEY, String(auth.expiresAt));
}

export function hasStoredAiAuth(): boolean {
  return Boolean(IS_COMMERCIAL && getProductAuthToken()) || Boolean(getStoredAiAuth());
}

export function clearAiAuth(): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.removeItem(AI_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AI_AUTH_EXPIRES_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_EXPIRES_KEY);
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
  return `${AI_COMMENT_CACHE_SCOPE}:${stableStringify(payload)}`;
}

function getCachedComment(signature: string): AiResult | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, AiResult>;
    return cache[signature] || null;
  } catch {
    return null;
  }
}

function storeCachedComment(signature: string, result: AiResult): void {
  if (!hasBrowserStorage()) {
    return;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, AiResult>;
    const next = Object.fromEntries(Object.entries({ ...cache, [signature]: result }).slice(-50));
    window.localStorage.setItem(AI_RESULT_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore cache write failures.
  }
}

function lengthInstruction(draft: StudentCommentDraft): string {
  if (draft.lengthMode === "short") return "80 到 100 字";
  if (draft.lengthMode === "long") return "150 到 200 字";
  if (draft.lengthMode === "custom") return `约 ${draft.targetWordCount} 字，允许上下浮动 15 字`;
  return "100 到 150 字";
}

function getScoreEntries(student: AppStudent): Array<{ subject: string; score: number }> {
  const latest = student.exams[0];
  if (!latest) {
    return [];
  }
  return Object.entries(latest.scores)
    .map(([subject, score]) => ({ subject, score }))
    .filter(item => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score);
}

function buildPayload(student: AppStudent, draft: StudentCommentDraft) {
  const latest = student.exams[0];
  const first = student.exams[student.exams.length - 1];
  const scores = getScoreEntries(student);
  const totalChange = latest && first && typeof latest.total === "number" && typeof first.total === "number"
    ? Math.round((latest.total - first.total) * 10) / 10
    : null;
  const tags = [...student.academicTags, ...student.tags].slice(0, 20);

  return {
    studentId: student.id,
    studentName: student.name,
    style: draft.style,
    commentLengthMode: draft.lengthMode,
    targetWordCount: draft.targetWordCount,
    lengthRange: draft.lengthMode === "custom" ? `${draft.targetWordCount} 字左右` : undefined,
    lengthInstruction: lengthInstruction(draft),
    context: {
      student: {
        id: student.id,
        name: student.name,
        className: "",
        seat: "",
      },
      latestExam: latest ? {
        name: latest.name,
        date: latest.date,
        totalScore: latest.total ?? null,
        scoreRate: null,
        classRank: latest.rank ? Number.parseInt(latest.rank, 10) || null : null,
        schoolRank: null,
        subjects: scores.map(item => ({ subject: item.subject, score: item.score, rankClass: null })),
      } : null,
      trend: {
        examCount: student.exams.length,
        totalScoreChange: totalChange,
        scoreRateChange: null,
        classRankChange: null,
        schoolRankChange: null,
        changedSubjects: [],
      },
      strengths: scores.slice(0, 2).map(item => item.subject),
      weaknesses: scores.slice(-2).reverse().map(item => item.subject),
      tags,
      commentProfile: {
        criteriaSummary: draft.criteriaSummary || [],
        customOptions: draft.customOptions || [],
        teacherNote: draft.teacherNote,
      },
      teacherNote: draft.teacherNote,
    },
    commentProfile: {
      criteriaSummary: draft.criteriaSummary || [],
      customOptions: draft.customOptions || [],
      teacherNote: draft.teacherNote,
    },
    requirements: {
      length: lengthInstruction(draft),
      useOnlyProvidedFacts: true,
      noFabrication: true,
      naturalLanguage: true,
      constructive: true,
      tone: {
        warm: "温和鼓励",
        formal: "客观正式",
        brief: "简洁家长会风格",
      }[draft.style],
    },
  };
}

function validatePayloadSize(payload: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(payload)).length <= AI_REQUEST_LIMIT_BYTES;
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

export async function generateStudentAiComment(
  student: AppStudent,
  draft: StudentCommentDraft,
  input?: { accessCode?: string; remember?: boolean; force?: boolean },
): Promise<AiResult> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }

  const payload = buildPayload(student, draft);
  if (!validatePayloadSize(payload)) {
    throw new Error("ai_payload_too_large");
  }
  const signature = getCacheSignature({ studentId: student.id, payload });
  if (!input?.force) {
    const cached = getCachedComment(signature);
    if (cached?.comment) {
      saveStudentCommentDraft(student.id, { ...draft, generatedComment: cached.comment });
      return cached;
    }
  }

  const send = async (token: string) => fetch(`${getWorkerBaseUrl()}/generate-comment`, {
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
    if (IS_COMMERCIAL && getProductAuthToken()) {
      throw new Error("ai_unauthorized");
    }
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

  const data = await response.json() as AiResult;
  const comment = String(data.comment || "").trim();
  if (!comment) {
    return {
      comment: "",
      needsMoreInfo: true,
      missingInfo: Array.isArray(data.missingInfo) ? data.missingInfo : [],
    };
  }
  const result = {
    comment,
    needsMoreInfo: Boolean(data.needsMoreInfo),
    missingInfo: Array.isArray(data.missingInfo) ? data.missingInfo : [],
  };
  storeCachedComment(signature, result);
  saveStudentCommentDraft(student.id, { ...draft, generatedComment: comment });
  return result;
}
