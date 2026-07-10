import { IS_COMMERCIAL } from "../config";
import { getProductAuthToken } from "./authStorage";
import { buildStudentAiContext, compactStudentContextForToken } from "./aiStudentContext";
import { getDirectWorkerUrl, getWorkerBaseUrl } from "./workerEndpoint";
import type { AppStudent, Dormitory, StudentCommentDraft } from "./types";

const AI_AUTH_TOKEN_KEY = "seat-manager-ai-auth-token";
const AI_AUTH_EXPIRES_KEY = "seat-manager-ai-auth-expires";
const AI_AUTH_SESSION_TOKEN_KEY = "seat-manager-ai-session-token";
const AI_AUTH_SESSION_EXPIRES_KEY = "seat-manager-ai-session-expires";
const AI_RESULT_CACHE_KEY = "seat-manager-ai-result-cache-v1";
const AI_STUDENT_FOLLOWUP_LAST_KEY = "seat-manager-ai-student-followup-last-v1";
const AI_FOLLOWUP_CACHE_SCOPE = "student-followup";
const AI_REMEMBER_DAYS = 30;
const AI_REQUEST_LIMIT_BYTES = 24 * 1024;

interface AiAuth {
  token: string;
  expiresAt: number;
}

export interface AiStudentFollowupResult {
  summary: string;
  riskSignals: string[];
  strengths: string[];
  actions: string[];
  parentMessageDraft: string;
  commentMaterials: string[];
  disclaimer: string;
}

export interface AiStudentFollowupContext {
  dormitories?: Dormitory[];
  seatIndex?: number | null;
  seatLabel?: string;
  deskMateName?: string;
  nearbyNames?: string[];
  teacherNote?: string;
  commentDraft?: Partial<StudentCommentDraft>;
  scenario?: "detail" | "grade" | "seat" | "comment";
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

export function hasStoredAiFollowupAuth(): boolean {
  return Boolean(IS_COMMERCIAL && getProductAuthToken()) || Boolean(getStoredAiAuth());
}

async function requestAiAuth(accessCode: string, remember: boolean): Promise<AiAuth> {
  const requestBody = JSON.stringify({ accessCode, rememberDays: remember ? AI_REMEMBER_DAYS : 0 });
  const send = (baseUrl: string) => fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });
  let response: Response;
  try {
    response = await send(getWorkerBaseUrl());
  } catch {
    response = await send(getDirectWorkerUrl());
  }
  if (response.status === 404 || response.status === 405) {
    response = await send(getDirectWorkerUrl());
  }
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
  return `${AI_FOLLOWUP_CACHE_SCOPE}:${stableStringify(payload)}`;
}

function getCachedFollowup(signature: string): AiStudentFollowupResult | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, AiStudentFollowupResult>;
    return cache[signature] || null;
  } catch {
    return null;
  }
}

function storeCachedFollowup(signature: string, result: AiStudentFollowupResult): void {
  if (!hasBrowserStorage()) {
    return;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, AiStudentFollowupResult>;
    const next = Object.fromEntries(Object.entries({ ...cache, [signature]: result }).slice(-50));
    window.localStorage.setItem(AI_RESULT_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore cache write failures.
  }
}

function hasUsefulFollowup(result: AiStudentFollowupResult | null): result is AiStudentFollowupResult {
  return Boolean(result && (result.summary || result.actions.length || result.parentMessageDraft));
}

export function readLastStudentFollowup(studentId: string): AiStudentFollowupResult | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_STUDENT_FOLLOWUP_LAST_KEY) || "{}") as Record<string, AiStudentFollowupResult>;
    const cached = cache[studentId] ? normalizeResult(cache[studentId]) : null;
    return hasUsefulFollowup(cached) ? cached : null;
  } catch {
    return null;
  }
}

function storeLastStudentFollowup(studentId: string, result: AiStudentFollowupResult): void {
  if (!hasBrowserStorage()) {
    return;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_STUDENT_FOLLOWUP_LAST_KEY) || "{}") as Record<string, AiStudentFollowupResult>;
    const next = Object.fromEntries(Object.entries({ ...cache, [studentId]: result }).slice(-120));
    window.localStorage.setItem(AI_STUDENT_FOLLOWUP_LAST_KEY, JSON.stringify(next));
  } catch {
    // Ignore page-cache write failures.
  }
}

function normalizeResult(data: Partial<AiStudentFollowupResult>): AiStudentFollowupResult {
  const toList = (value: unknown, limit: number) => (
    Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n|；|;/) : []
  )
    .map(item => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);

  return {
    summary: String(data.summary || "").trim(),
    riskSignals: toList(data.riskSignals, 5),
    strengths: toList(data.strengths, 5),
    actions: toList(data.actions, 3),
    parentMessageDraft: String(data.parentMessageDraft || "").trim(),
    commentMaterials: toList(data.commentMaterials, 6),
    disclaimer: String(data.disclaimer || "AI 跟进建议仅供教师参考，请结合课堂观察判断。").trim(),
  };
}

function buildPayload(student: AppStudent, context: AiStudentFollowupContext = {}) {
  const draft: StudentCommentDraft | undefined = context.commentDraft ? {
    generatedComment: String(context.commentDraft.generatedComment || ""),
    teacherNote: String(context.teacherNote || context.commentDraft.teacherNote || ""),
    style: context.commentDraft.style || "warm",
    lengthMode: context.commentDraft.lengthMode || "standard",
    targetWordCount: context.commentDraft.targetWordCount || 120,
    updatedAt: context.commentDraft.updatedAt || new Date().toISOString(),
    criteriaSummary: context.commentDraft.criteriaSummary || [],
    customOptions: context.commentDraft.customOptions || [],
  } : undefined;
  const studentContext = compactStudentContextForToken(buildStudentAiContext({
    student,
    dormitories: context.dormitories,
    draft,
    maxRecords: 10,
    maxTags: 14,
  }), 10);

  return {
    studentId: student.id,
    studentName: student.name,
    scenario: context.scenario || "detail",
    context: studentContext,
    seatContext: {
      seatIndex: typeof context.seatIndex === "number" ? context.seatIndex : null,
      seatLabel: context.seatLabel || "",
      deskMateName: context.deskMateName || "",
      nearbyNames: (context.nearbyNames || []).filter(Boolean).slice(0, 6),
    },
    teacherNote: String(context.teacherNote || "").trim(),
    requirements: {
      useOnlyProvidedFacts: true,
      noFabrication: true,
      parentMessageTone: "温和、具体、可执行",
      actionCount: 3,
    },
  };
}

function validatePayloadSize(payload: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(payload)).length <= AI_REQUEST_LIMIT_BYTES;
}

export async function generateStudentFollowup(
  student: AppStudent,
  context: AiStudentFollowupContext = {},
  input?: { accessCode?: string; remember?: boolean; force?: boolean },
): Promise<AiStudentFollowupResult> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }

  const payload = buildPayload(student, context);
  if (!validatePayloadSize(payload)) {
    throw new Error("ai_payload_too_large");
  }
  const signature = getCacheSignature({ studentId: student.id, payload });
  if (!input?.force) {
    const cached = getCachedFollowup(signature);
    if (hasUsefulFollowup(cached)) {
      storeLastStudentFollowup(student.id, cached);
      return cached;
    }
  }

  const send = async (baseUrl: string, token: string) => fetch(`${baseUrl}/student-followup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let auth = await getAuth(input);
  let response = await send(getWorkerBaseUrl(), auth.token);
  if (response.status === 404 || response.status === 405) {
    response = await send(getDirectWorkerUrl(), auth.token);
  }
  if (response.status === 401) {
    if (IS_COMMERCIAL && getProductAuthToken()) {
      throw new Error("ai_unauthorized");
    }
    clearAiAuth();
    auth = await getAuth(input);
    response = await send(getWorkerBaseUrl(), auth.token);
    if (response.status === 404 || response.status === 405) {
      response = await send(getDirectWorkerUrl(), auth.token);
    }
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

  const normalized = normalizeResult(await response.json() as Partial<AiStudentFollowupResult>);
  if (!normalized.summary && !normalized.actions.length && !normalized.parentMessageDraft) {
    throw new Error("ai_failed");
  }
  storeCachedFollowup(signature, normalized);
  storeLastStudentFollowup(student.id, normalized);
  return normalized;
}
