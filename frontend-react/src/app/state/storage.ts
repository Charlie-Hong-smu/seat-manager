export const LEGACY_STORAGE_KEY = "homeroom-seat-manager-v1";

export function readLegacyRootState(): unknown {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("无法读取旧版本地数据", error);
    return null;
  }
}

export function writeLegacyRootState(nextState: unknown): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }

  try {
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(nextState));
    return true;
  } catch (error) {
    console.warn("无法保存旧版本地数据", error);
    return false;
  }
}
