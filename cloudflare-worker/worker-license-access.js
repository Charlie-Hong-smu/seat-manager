import { verifyToken } from "./worker-auth.js";
import { loadLicenseRecordByKey, normalizeEdition } from "./worker-license-store.js";
import { claimLicenseIdentity } from "./worker-license-identity.js";

export async function verifyProductRequest(token, env) {
  const secret = env.PRODUCT_TOKEN_SECRET || env.TOKEN_SECRET;
  if (!token || !secret || !env.SEAT_MANAGER_KV) return null;
  const payload = await verifyToken(token, secret);
  if (!payload || !Number.isFinite(payload.exp) || payload.exp <= Date.now()
    || payload.scope !== "product-access" || !payload.licenseKey || !payload.licenseId || !payload.deviceId) return null;
  const license = await loadLicenseRecordByKey(payload.licenseKey, env);
  if (!license || license.licenseId !== payload.licenseId || license.status !== "active"
    || (license.expiresAt && (!Number.isFinite(Date.parse(license.expiresAt)) || Date.parse(license.expiresAt) <= Date.now()))) return null;
  const edition = normalizeEdition(payload.edition) || (!payload.edition ? "commercial" : "");
  if (!edition || !license.allowedEditions.includes(edition)) return null;
  const device = license.devices.find(item => item.id === payload.deviceId);
  if (!device) return null;
  // Only untouched legacy bindings accept legacy tokens. A new binding always
  // has a UUID, so unbind/rebind can never revive an earlier signed token.
  if ((device.sessionId || "") !== (payload.deviceSessionId || "")) return null;
  if (!await claimLicenseIdentity(license, env)) return null;
  return { license, payload };
}
