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
