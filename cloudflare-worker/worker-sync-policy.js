import { getLicensedSyncStateKey } from "./worker-license-keys.js";

/** Trusted deployment setting only; missing or malformed lists deny every space. */
export function automaticSpaceAllowed(env, stateKey) {
  if (env.SYNC_AUTOMATIC_ENABLED !== "true") return false;
  try {
    const spaces = JSON.parse(env.SYNC_AUTOMATIC_SPACES);
    if (!Array.isArray(spaces) || !spaces.every(space => typeof space === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(space))) return false;
    return spaces.some(space => getLicensedSyncStateKey(space) === stateKey);
  } catch { return false; }
}
