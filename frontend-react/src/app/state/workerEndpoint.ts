const WORKER_URL_KEY = "seat-manager-ai-worker-url";
const DEFAULT_WORKER_URL = "https://seat-manager-ai.hongchenglin03.workers.dev";

const env = import.meta.env as { VITE_WORKER_URL?: string };

export function getDefaultWorkerUrl(): string {
  return env.VITE_WORKER_URL?.trim() || DEFAULT_WORKER_URL;
}

export function getWorkerBaseUrl(): string {
  if (typeof window === "undefined" || !window.localStorage) {
    return getDefaultWorkerUrl().replace(/\/+$/, "");
  }
  const configuredUrl = window.localStorage.getItem(WORKER_URL_KEY)?.trim() || getDefaultWorkerUrl();
  return configuredUrl.replace(/\/+$/, "");
}
