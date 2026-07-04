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
  if (hasCommercialWorkerUrl) {
    return defaultUrl;
  }
  if (typeof window === "undefined" || !window.localStorage) {
    return defaultUrl;
  }
  const configuredUrl = normalizeWorkerUrl(window.localStorage.getItem(WORKER_URL_KEY) || "");
  const legacyDefaultUrl = normalizeWorkerUrl(DEFAULT_WORKER_URL);
  if (configuredUrl && !(configuredUrl === legacyDefaultUrl && defaultUrl !== legacyDefaultUrl)) {
    return configuredUrl;
  }
  return defaultUrl;
}

function normalizeWorkerUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
