import { IS_COMMERCIAL } from "../config";
import { getProductAuthToken } from "./authStorage";
import { SUBJECT_ORDER, type ScoreMapping } from "./scoreImport";
import { getWorkerBaseUrl } from "./workerEndpoint";

const AI_AUTH_TOKEN_KEY = "seat-manager-ai-auth-token";
const AI_AUTH_EXPIRES_KEY = "seat-manager-ai-auth-expires";
const AI_AUTH_SESSION_TOKEN_KEY = "seat-manager-ai-session-token";
const AI_AUTH_SESSION_EXPIRES_KEY = "seat-manager-ai-session-expires";
const AI_REMEMBER_DAYS = 30;

interface AiAuth {
  token: string;
  expiresAt: number;
}

export interface AiScoreMappingSuggestion {
  mapping: ScoreMapping;
  note: string;
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

export function hasStoredAiScoreMappingAuth(): boolean {
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

function safeIndex(value: unknown, maxIndex: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxIndex ? parsed : -1;
}

function normalizeMapping(headers: string[], result: {
  nameCol?: unknown;
  subjectMappings?: Array<{ subject?: string; scoreCol?: unknown; rankClassCol?: unknown; rankSchoolCol?: unknown }>;
  totalMapping?: { scoreCol?: unknown; rankClassCol?: unknown; rankSchoolCol?: unknown };
}): ScoreMapping {
  const maxIndex = headers.length - 1;
  const knownSubjects = new Set(SUBJECT_ORDER);
  return {
    headers,
    nameCol: safeIndex(result.nameCol, maxIndex),
    subjectMappings: Array.isArray(result.subjectMappings)
      ? result.subjectMappings
          .map(item => ({
            subject: knownSubjects.has(String(item.subject)) ? String(item.subject) : "",
            scoreCol: safeIndex(item.scoreCol, maxIndex),
            rankClassCol: safeIndex(item.rankClassCol, maxIndex),
            rankSchoolCol: safeIndex(item.rankSchoolCol, maxIndex),
          }))
          .filter(item => item.subject && item.scoreCol !== -1)
      : [],
    totalMapping: {
      scoreCol: safeIndex(result.totalMapping?.scoreCol, maxIndex),
      rankClassCol: safeIndex(result.totalMapping?.rankClassCol, maxIndex),
      rankSchoolCol: safeIndex(result.totalMapping?.rankSchoolCol, maxIndex),
    },
    warnings: [],
  };
}

export async function suggestScoreMappingWithAi(
  rows: string[][],
  input?: { accessCode?: string; remember?: boolean },
): Promise<AiScoreMappingSuggestion> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }
  const headers = rows[0]?.map(cell => String(cell || "").trim()) || [];
  if (!headers.length) {
    throw new Error("ai_mapping_empty");
  }
  const auth = await getAuth(input);
  const response = await fetch(`${getWorkerBaseUrl()}/suggest-score-mapping`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify({
      headers,
      sampleRows: rows.slice(1, 8),
      knownSubjects: SUBJECT_ORDER,
    }),
  });
  if (response.status === 401) {
    if (!IS_COMMERCIAL) {
      clearAiAuth();
    }
    throw new Error("ai_unauthorized");
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
  const data = await response.json() as {
    nameCol?: unknown;
    subjectMappings?: Array<{ subject?: string; scoreCol?: unknown; rankClassCol?: unknown; rankSchoolCol?: unknown }>;
    totalMapping?: { scoreCol?: unknown; rankClassCol?: unknown; rankSchoolCol?: unknown };
    note?: string;
  };
  const mapping = normalizeMapping(headers, data);
  if (mapping.nameCol === -1 || mapping.subjectMappings.length === 0) {
    throw new Error("ai_mapping_failed");
  }
  return {
    mapping,
    note: String(data.note || "AI 已生成列识别建议，请确认后应用。"),
  };
}
