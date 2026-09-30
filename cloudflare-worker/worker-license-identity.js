import { LICENSE_KEY_PREFIX, LICENSE_SYNC_STATE_SUFFIX, sanitizeLicenseId } from "./worker-license-keys.js";

// New spaces are derived from the full product-code hash, never customer input.
export function generateLicenseId(key) {
  const hash = key.slice(LICENSE_KEY_PREFIX.length);
  return /^[a-f0-9]{64}$/.test(hash) ? `tenant-${hash}` : "";
}

export async function hasConflictingLicenseId(licenseId, licenseKey, kv) {
  let cursor;
  do {
    const page = await kv.list({ prefix: LICENSE_KEY_PREFIX, ...(cursor ? { cursor } : {}) });
    for (const { name } of page.keys) {
      if (name === licenseKey || name.endsWith(LICENSE_SYNC_STATE_SUFFIX)) continue;
      const record = await kv.get(name, { type: "json" });
      if (record && sanitizeLicenseId(record.licenseId || record.id) === licenseId) return true;
    }
    if (page.list_complete !== false) return false;
    if (!page.cursor || page.cursor === cursor) throw new Error("invalid_license_cursor");
    cursor = page.cursor;
  } while (true);
}

export async function claimLicenseIdentity(license, env) {
  if (env.ACCOUNT_COORDINATOR) {
    return env.ACCOUNT_COORDINATOR.getByName(`license-identity:${license.licenseId}`)
      .claimLicenseId(license.licenseId, license.storageKey);
  }
  // Legacy deployments cannot allocate caller-chosen IDs. Full-hash new IDs
  // remain unique across keys; check old records before using any space.
  return !await hasConflictingLicenseId(license.licenseId, license.storageKey, env.SEAT_MANAGER_KV);
}
