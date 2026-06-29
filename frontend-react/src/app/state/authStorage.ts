import { IS_COMMERCIAL } from "../config";

// ── 小张版:本地密码登录(离线、密码只存在本机) ─────────────────────────
const AUTH_PERSIST_KEY = "seat-manager-authenticated";
const AUTH_SESSION_KEY = "seat-manager-session-authenticated";
const CUSTOM_PASSWORD_HASH_KEY = "seat-manager-password-hash";

// ── 商用版:产品授权码登录(服务端校验、按授权码绑定设备/空间) ──────────
const WORKER_URL_KEY = "seat-manager-ai-worker-url";
const DEFAULT_WORKER_URL = "https://seat-manager-ai.hongchenglin03.workers.dev";
const PRODUCT_AUTH_TOKEN_KEY = "seat-manager-product-auth-token";
const PRODUCT_AUTH_EXPIRES_KEY = "seat-manager-product-auth-expires";
const PRODUCT_AUTH_SESSION_TOKEN_KEY = "seat-manager-product-session-token";
const PRODUCT_AUTH_SESSION_EXPIRES_KEY = "seat-manager-product-session-expires";
const PRODUCT_DEVICE_ID_KEY = "seat-manager-product-device-id";
const PRODUCT_REMEMBER_DAYS = 30;

interface ProductAuth {
  token: string;
  expiresAt: number;
  licenseId?: string;
  maxDevices?: number;
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage) && Boolean(window.sessionStorage);
}

// ── 统一入口:登录状态 / 退出 ─────────────────────────────────────────────

export function isAuthenticated(): boolean {
  return IS_COMMERCIAL ? Boolean(getStoredProductAuth()) : isLocallyAuthenticated();
}

/** 退出登录:两种模式的凭据都清掉,保持幂等、互不影响。 */
export function clearAuth(): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.removeItem(AUTH_PERSIST_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  window.localStorage.removeItem(PRODUCT_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(PRODUCT_AUTH_EXPIRES_KEY);
  window.sessionStorage.removeItem(PRODUCT_AUTH_SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(PRODUCT_AUTH_SESSION_EXPIRES_KEY);
}

// ── 本地密码(小张版) ────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isLocallyAuthenticated(): boolean {
  if (!hasBrowserStorage()) {
    return false;
  }
  return window.localStorage.getItem(AUTH_PERSIST_KEY) === "true" || window.sessionStorage.getItem(AUTH_SESSION_KEY) === "true";
}

export function hasLoginPassword(): boolean {
  return hasBrowserStorage() && Boolean(window.localStorage.getItem(CUSTOM_PASSWORD_HASH_KEY));
}

export async function verifyPassword(password: string): Promise<boolean> {
  if (!hasBrowserStorage()) {
    return false;
  }
  const customHash = window.localStorage.getItem(CUSTOM_PASSWORD_HASH_KEY);
  return Boolean(customHash) && await hashPassword(password) === customHash;
}

export async function setupPassword(password: string): Promise<void> {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.setItem(CUSTOM_PASSWORD_HASH_KEY, await hashPassword(password));
}

export async function changePassword(currentPassword: string, nextPassword: string): Promise<"ok" | "invalid_current" | "too_short"> {
  if (nextPassword.length < 4) {
    return "too_short";
  }
  if (hasLoginPassword() && !await verifyPassword(currentPassword)) {
    return "invalid_current";
  }
  await setupPassword(nextPassword);
  clearAuth();
  return "ok";
}

export function setAuthenticated(remember: boolean): void {
  if (!hasBrowserStorage()) {
    return;
  }
  if (remember) {
    window.localStorage.setItem(AUTH_PERSIST_KEY, "true");
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  } else {
    window.sessionStorage.setItem(AUTH_SESSION_KEY, "true");
    window.localStorage.removeItem(AUTH_PERSIST_KEY);
  }
}

// ── 产品授权码(商用版) ──────────────────────────────────────────────────

function getWorkerBaseUrl(): string {
  if (!hasBrowserStorage()) {
    return DEFAULT_WORKER_URL;
  }
  const configuredUrl = window.localStorage.getItem(WORKER_URL_KEY)?.trim() || DEFAULT_WORKER_URL;
  return configuredUrl.replace(/\/+$/, "");
}

function getStoredProductAuth(): ProductAuth | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  const now = Date.now();
  const candidates = [
    {
      token: window.localStorage.getItem(PRODUCT_AUTH_TOKEN_KEY) || "",
      expiresAt: Number.parseInt(window.localStorage.getItem(PRODUCT_AUTH_EXPIRES_KEY) || "", 10),
    },
    {
      token: window.sessionStorage.getItem(PRODUCT_AUTH_SESSION_TOKEN_KEY) || "",
      expiresAt: Number.parseInt(window.sessionStorage.getItem(PRODUCT_AUTH_SESSION_EXPIRES_KEY) || "", 10),
    },
  ];
  return candidates.find(item => item.token && Number.isFinite(item.expiresAt) && item.expiresAt > now) || null;
}

function getProductDeviceId(): string {
  if (!hasBrowserStorage()) {
    return "browser-session";
  }
  const existing = window.localStorage.getItem(PRODUCT_DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const next = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(PRODUCT_DEVICE_ID_KEY, next);
  return next;
}

function getDeviceName(): string {
  if (typeof navigator === "undefined") {
    return "本机";
  }
  if (navigator.userAgent.includes("Mac")) {
    return "我的 Mac";
  }
  if (navigator.userAgent.includes("Windows")) {
    return "我的 Windows 电脑";
  }
  return "本机浏览器";
}

function storeProductAuth(auth: ProductAuth, remember: boolean): void {
  if (!hasBrowserStorage()) {
    return;
  }
  clearAuth();
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(remember ? PRODUCT_AUTH_TOKEN_KEY : PRODUCT_AUTH_SESSION_TOKEN_KEY, auth.token);
  storage.setItem(remember ? PRODUCT_AUTH_EXPIRES_KEY : PRODUCT_AUTH_SESSION_EXPIRES_KEY, String(auth.expiresAt));
}

export function getProductAuthToken(): string {
  return getStoredProductAuth()?.token || "";
}

export async function authorizeProduct(productCode: string, remember: boolean): Promise<void> {
  const code = productCode.trim();
  if (!code) {
    throw new Error("license_required");
  }

  const response = await fetch(`${getWorkerBaseUrl()}/license/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productCode: code,
      rememberDays: remember ? PRODUCT_REMEMBER_DAYS : 0,
      deviceId: getProductDeviceId(),
      deviceName: getDeviceName(),
    }),
  });
  if (response.status === 403) {
    throw new Error("license_unauthorized");
  }
  if (response.status === 409) {
    throw new Error("license_device_limit");
  }
  if (!response.ok) {
    throw new Error("license_auth_failed");
  }

  const data = await response.json() as ProductAuth;
  if (!data.token || !Number.isFinite(data.expiresAt)) {
    throw new Error("license_auth_failed");
  }
  storeProductAuth(data, remember);
}
