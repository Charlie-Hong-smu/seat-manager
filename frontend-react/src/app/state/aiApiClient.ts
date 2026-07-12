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

export function clearAiApiAuth(): void {
  if (!hasBrowserStorage()) return;
  window.localStorage.removeItem(AI_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AI_AUTH_EXPIRES_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_EXPIRES_KEY);
}

export function hasStoredAiApiAuth(): boolean {
  // 两版应用只有产品授权登录；AI 面板不再暴露第二套授权输入。
  return true;
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

export async function getAiAuth(_input?: AiAuthInput): Promise<AiAuth> {
  const productToken = getProductAuthToken();
  if (productToken) {
    return { token: productToken, expiresAt: Date.now() + AI_REMEMBER_DAYS * 24 * 60 * 60 * 1000 };
  }
  throw new Error("ai_auth_required");
}
