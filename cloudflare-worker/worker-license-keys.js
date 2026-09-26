import { toText } from "./worker-input.js";

export const LICENSE_KEY_PREFIX = "seat-manager:license:";
export const LICENSE_SYNC_STATE_SUFFIX = ":state";

export function getLicenseKey(codeHash) {
  return `${LICENSE_KEY_PREFIX}${codeHash}`;
}

export function getLicensedSyncStateKey(licenseId) {
  return `${LICENSE_KEY_PREFIX}${licenseId}${LICENSE_SYNC_STATE_SUFFIX}`;
}

export function sanitizeLicenseId(value) {
  return toText(value).trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}
