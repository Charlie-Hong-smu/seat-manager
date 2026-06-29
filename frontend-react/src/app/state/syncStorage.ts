import { readLegacyRootState, writeLegacyRootState } from "./storage";
import { getProductAuthToken } from "./authStorage";

const AI_WORKER_URL_KEY = "seat-manager-ai-worker-url";
const AI_DEFAULT_WORKER_URL = "https://seat-manager-ai.hongchenglin03.workers.dev";
const SYNC_AUTH_TOKEN_KEY = "seat-manager-sync-token";
const SYNC_AUTH_EXPIRES_KEY = "seat-manager-sync-expires";
const SYNC_AUTH_SESSION_TOKEN_KEY = "seat-manager-sync-session-token";
const SYNC_AUTH_SESSION_EXPIRES_KEY = "seat-manager-sync-session-expires";
const SYNC_LAST_UPLOAD_AT_KEY = "seat-manager-sync-last-upload-at";
const SYNC_LAST_RESTORE_AT_KEY = "seat-manager-sync-last-restore-at";
const SYNC_LAST_CLOUD_UPDATED_AT_KEY = "seat-manager-sync-last-cloud-updated-at";
const SYNC_DEVICE_NAME_KEY = "seat-manager-sync-device-name";
const SYNC_REMEMBER_DAYS = 30;
const SYNC_VERSION = 1;
const SYNC_MAX_CLIENT_BYTES = 5 * 1024 * 1024;

export interface SyncStatus {
  exists: boolean;
  updatedAt?: string;
  deviceName?: string;
  version?: number;
  sizeBytes?: number;
}

interface SyncAuth {
  token: string;
  expiresAt: number;
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

export function getSyncDeviceName(): string {
  if (!hasBrowserStorage()) {
    return "本机";
  }
  return window.localStorage.getItem(SYNC_DEVICE_NAME_KEY) || (navigator.userAgent.includes("Mac") ? "我的 Mac" : "本机");
}

export function setSyncDeviceName(name: string): string {
  const next = name.trim().slice(0, 30) || getSyncDeviceName();
  if (hasBrowserStorage()) {
    window.localStorage.setItem(SYNC_DEVICE_NAME_KEY, next);
  }
  return next;
}

function getStoredSyncAuth(): SyncAuth | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  const now = Date.now();
  const candidates = [
    {
      token: window.localStorage.getItem(SYNC_AUTH_TOKEN_KEY) || "",
      expiresAt: Number.parseInt(window.localStorage.getItem(SYNC_AUTH_EXPIRES_KEY) || "", 10),
    },
    {
      token: window.sessionStorage.getItem(SYNC_AUTH_SESSION_TOKEN_KEY) || "",
      expiresAt: Number.parseInt(window.sessionStorage.getItem(SYNC_AUTH_SESSION_EXPIRES_KEY) || "", 10),
    },
  ];
  return candidates.find(item => item.token && Number.isFinite(item.expiresAt) && item.expiresAt > now) || null;
}

function storeSyncAuth(auth: SyncAuth, remember: boolean): void {
  if (!hasBrowserStorage()) {
    return;
  }
  clearSyncAuth();
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(remember ? SYNC_AUTH_TOKEN_KEY : SYNC_AUTH_SESSION_TOKEN_KEY, auth.token);
  storage.setItem(remember ? SYNC_AUTH_EXPIRES_KEY : SYNC_AUTH_SESSION_EXPIRES_KEY, String(auth.expiresAt));
}

export function clearSyncAuth(): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.removeItem(SYNC_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(SYNC_AUTH_EXPIRES_KEY);
  window.sessionStorage.removeItem(SYNC_AUTH_SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(SYNC_AUTH_SESSION_EXPIRES_KEY);
}

export function usesProductAuthForSync(): boolean {
  return Boolean(getProductAuthToken());
}

export async function requestSyncAuth(syncCode: string, remember: boolean): Promise<void> {
  const response = await fetch(`${getWorkerBaseUrl()}/sync/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ syncCode, rememberDays: remember ? SYNC_REMEMBER_DAYS : 0 }),
  });
  if (response.status === 403) {
    throw new Error("sync_forbidden");
  }
  if (!response.ok) {
    throw new Error("sync_unavailable");
  }
  const data = await response.json() as SyncAuth;
  if (!data.token || !Number.isFinite(data.expiresAt)) {
    throw new Error("sync_unavailable");
  }
  storeSyncAuth(data, remember);
}

async function fetchSyncEndpoint<T>(path: string, options: RequestInit = {}): Promise<T> {
  const productToken = getProductAuthToken();
  const auth = getStoredSyncAuth();
  const token = productToken || auth?.token || "";
  if (!token) {
    throw new Error("sync_auth_required");
  }
  const response = await fetch(`${getWorkerBaseUrl()}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  if (response.status === 401) {
    if (!productToken) {
      clearSyncAuth();
    }
    throw new Error("sync_auth_required");
  }
  if (!response.ok) {
    throw new Error("sync_unavailable");
  }
  return response.json() as Promise<T>;
}

export async function fetchCloudStatus(): Promise<SyncStatus> {
  const status = await fetchSyncEndpoint<SyncStatus>("/sync/status");
  if (hasBrowserStorage() && status.updatedAt) {
    window.localStorage.setItem(SYNC_LAST_CLOUD_UPDATED_AT_KEY, status.updatedAt);
  }
  return status;
}

export async function uploadCurrentStateToCloud(deviceName: string): Promise<SyncStatus> {
  const data = readLegacyRootState();
  const payload = {
    version: SYNC_VERSION,
    updatedAt: new Date().toISOString(),
    deviceName: setSyncDeviceName(deviceName),
    data,
  };
  const sizeBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (sizeBytes > SYNC_MAX_CLIENT_BYTES) {
    throw new Error("sync_payload_too_large");
  }
  const result = await fetchSyncEndpoint<SyncStatus>("/sync/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const uploadedAt = result.updatedAt || new Date().toISOString();
  if (hasBrowserStorage()) {
    window.localStorage.setItem(SYNC_LAST_UPLOAD_AT_KEY, uploadedAt);
    window.localStorage.setItem(SYNC_LAST_CLOUD_UPDATED_AT_KEY, uploadedAt);
  }
  return { ...result, updatedAt: uploadedAt, exists: true };
}

export async function restoreStateFromCloud(): Promise<SyncStatus> {
  const cloud = await fetchSyncEndpoint<{ updatedAt?: string; deviceName?: string; data?: unknown; version?: number }>("/sync/load");
  if (!cloud.data || typeof cloud.data !== "object" || !Array.isArray((cloud.data as { students?: unknown }).students) || !Array.isArray((cloud.data as { seatOrder?: unknown }).seatOrder)) {
    throw new Error("sync_invalid_data");
  }
  writeLegacyRootState(cloud.data);
  const restoredAt = new Date().toISOString();
  if (hasBrowserStorage()) {
    window.localStorage.setItem(SYNC_LAST_RESTORE_AT_KEY, restoredAt);
    window.localStorage.setItem(SYNC_LAST_CLOUD_UPDATED_AT_KEY, cloud.updatedAt || "");
  }
  return {
    exists: true,
    updatedAt: cloud.updatedAt || restoredAt,
    deviceName: cloud.deviceName || "",
    version: cloud.version || SYNC_VERSION,
  };
}
