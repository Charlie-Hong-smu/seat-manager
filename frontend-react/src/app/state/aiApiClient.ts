import { IS_COMMERCIAL } from "../config";
import { getProductAuthToken } from "./authStorage";
import { getDirectWorkerUrl, getWorkerBaseUrl } from "./workerEndpoint";

const AI_AUTH_TOKEN_KEY = "seat-manager-ai-auth-token";
const AI_AUTH_EXPIRES_KEY = "seat-manager-ai-auth-expires";
const AI_AUTH_SESSION_TOKEN_KEY = "seat-manager-ai-session-token";
const AI_AUTH_SESSION_EXPIRES_KEY = "seat-manager-ai-session-expires";
const AI_REMEMBER_DAYS = 30;

export interface AiAuth {
  token: string;
  expiresAt: number;
}

export interface AiAuthInput {
  accessCode?: string;
  remember?: boolean;
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage) && Boolean(window.sessionStorage);
}

function getStoredAiAuth(): AiAuth | null {
  if (!hasBrowserStorage()) return null;
  const now = Date.now();
  const candidates = [
    { token: window.localStorage.getItem(AI_AUTH_TOKEN_KEY) || "", expiresAt: Number.parseInt(window.localStorage.getItem(AI_AUTH_EXPIRES_KEY) || "", 10) },
    { token: window.sessionStorage.getItem(AI_AUTH_SESSION_TOKEN_KEY) || "", expiresAt: Number.parseInt(window.sessionStorage.getItem(AI_AUTH_SESSION_EXPIRES_KEY) || "", 10) },
  ];
  return candidates.find(item => item.token && Number.isFinite(item.expiresAt) && item.expiresAt > now) || null;
}

export function clearAiApiAuth(): void {
  if (!hasBrowserStorage()) return;
  window.localStorage.removeItem(AI_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AI_AUTH_EXPIRES_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_EXPIRES_KEY);
}

function storeAiAuth(auth: AiAuth, remember: boolean): void {
  if (!hasBrowserStorage()) return;
  clearAiApiAuth();
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(remember ? AI_AUTH_TOKEN_KEY : AI_AUTH_SESSION_TOKEN_KEY, auth.token);
  storage.setItem(remember ? AI_AUTH_EXPIRES_KEY : AI_AUTH_SESSION_EXPIRES_KEY, String(auth.expiresAt));
}

export function hasStoredAiApiAuth(): boolean {
  return Boolean(IS_COMMERCIAL && getProductAuthToken()) || Boolean(getStoredAiAuth());
}

export async function fetchAiRoute(path: string, init: RequestInit): Promise<Response> {
  const send = (baseUrl: string) => fetch(`${baseUrl}${path}`, init);
  let response: Response;
  try {
    response = await send(getWorkerBaseUrl());
  } catch {
    return send(getDirectWorkerUrl());
  }
  return response.status === 404 || response.status === 405 ? send(getDirectWorkerUrl()) : response;
}

async function requestAiAuth(accessCode: string, remember: boolean): Promise<AiAuth> {
  const response = await fetchAiRoute("/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessCode, rememberDays: remember ? AI_REMEMBER_DAYS : 0 }),
  });
  if (response.status === 403) throw new Error("ai_unauthorized");
  if (!response.ok) throw new Error("ai_auth_failed");
  const data = await response.json() as AiAuth;
  if (!data.token || !Number.isFinite(data.expiresAt)) throw new Error("ai_auth_failed");
  storeAiAuth(data, remember);
  return data;
}

export async function getAiAuth(input?: AiAuthInput): Promise<AiAuth> {
  const productToken = IS_COMMERCIAL ? getProductAuthToken() : "";
  if (productToken) {
    return { token: productToken, expiresAt: Date.now() + AI_REMEMBER_DAYS * 24 * 60 * 60 * 1000 };
  }
  const stored = getStoredAiAuth();
  if (stored) return stored;
  const accessCode = input?.accessCode?.trim();
  if (!accessCode) throw new Error("ai_auth_required");
  return requestAiAuth(accessCode, Boolean(input?.remember));
}
