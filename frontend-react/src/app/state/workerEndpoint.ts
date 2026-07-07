const WORKER_URL_KEY = "seat-manager-ai-worker-url";
const DEFAULT_WORKER_URL = "https://seat-manager-ai.hongchenglin03.workers.dev";

const env = import.meta.env as { VITE_EDITION?: string; VITE_WORKER_URL?: string };

export function getDefaultWorkerUrl(): string {
  return env.VITE_WORKER_URL?.trim() || DEFAULT_WORKER_URL;
}

export function getWorkerBaseUrl(): string {
  const defaultUrl = normalizeWorkerUrl(getDefaultWorkerUrl());
  const isCommercial = env.VITE_EDITION?.trim() === "commercial";
  const hasCommercialWorkerUrl = isCommercial && defaultUrl !== normalizeWorkerUrl(DEFAULT_WORKER_URL);
  if (hasCommercialWorkerUrl && !isSameOriginApiUrl(defaultUrl)) {
    return defaultUrl;
  }
  if (typeof window === "undefined" || !window.localStorage) {
    return isSameOriginApiUrl(defaultUrl) ? normalizeWorkerUrl(DEFAULT_WORKER_URL) : defaultUrl;
  }
  const configuredUrl = normalizeWorkerUrl(window.localStorage.getItem(WORKER_URL_KEY) || "");
  const legacyDefaultUrl = normalizeWorkerUrl(DEFAULT_WORKER_URL);
  if (configuredUrl && !isSameOriginApiUrl(configuredUrl) && !(configuredUrl === legacyDefaultUrl && defaultUrl !== legacyDefaultUrl)) {
    return configuredUrl;
  }
  return isSameOriginApiUrl(defaultUrl) ? legacyDefaultUrl : defaultUrl;
}

function normalizeWorkerUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

function isSameOriginApiUrl(url: string): boolean {
  if (typeof window === "undefined" || !url) {
    return false;
  }
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.origin === window.location.origin && parsed.pathname.replace(/\/+$/, "") === "/api";
  } catch {
    return false;
  }
}
