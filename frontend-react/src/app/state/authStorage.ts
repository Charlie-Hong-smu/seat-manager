const AUTH_PERSIST_KEY = "seat-manager-authenticated";
const AUTH_SESSION_KEY = "seat-manager-session-authenticated";
const CUSTOM_PASSWORD_HASH_KEY = "seat-manager-password-hash";

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage) && Boolean(window.sessionStorage);
}

async function hashPassword(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function isAuthenticated(): boolean {
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

export function clearAuth(): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.removeItem(AUTH_PERSIST_KEY);
  window.sessionStorage.removeItem(AUTH_SESSION_KEY);
}
