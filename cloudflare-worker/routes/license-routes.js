import { jsonResponse } from "../worker-response.js";
import { allowAuthAttempt } from "../worker-usage.js";
import { SESSION_TOKEN_TTL_MS, getBearerToken, sha256Hex, signToken } from "../worker-auth.js";
import { readJsonBody, toText } from "../worker-input.js";
import { DEFAULT_MAX_DEVICES, DEFAULT_AI_DAILY_LIMIT, loadLicenseRecord, bindLicenseDevice, unbindLicenseDevice, normalizeEdition } from "../worker-license-store.js";
import { verifyProductRequest } from "../worker-license-access.js";
import { claimLicenseIdentity } from "../worker-license-identity.js";

const PRODUCT_REMEMBER_MAX_DAYS = 90;

async function handleLicenseAuth(request, env, corsHeaders) {
  if (!await allowAuthAttempt(request, env, "/license/auth")) {
    return jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
  }
  const tokenSecret = env.PRODUCT_TOKEN_SECRET || env.TOKEN_SECRET;
  if (!tokenSecret) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }

  const productCode = String(body.value.productCode || "");
  const codeHash = await sha256Hex(productCode);
  const license = await loadLicenseRecord(codeHash, env);
  if (!license) {
    return jsonResponse({ error: "forbidden" }, 403, corsHeaders);
  }
  if (!env.SEAT_MANAGER_KV && !license.legacyEnv) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }
  if (license.status !== "active") {
    return jsonResponse({ error: "license_inactive" }, 403, corsHeaders);
  }
  if (license.expiresAt && Date.parse(license.expiresAt) <= Date.now()) {
    return jsonResponse({ error: "license_expired" }, 403, corsHeaders);
  }

  // Missing edition is the legacy Commercial client contract. Existing records
  // without allowedEditions also remain Commercial-only by default.
  const edition = normalizeEdition(body.value.edition) || "commercial";
  if (!license.allowedEditions.includes(edition)) {
    return jsonResponse({ error: "edition_forbidden" }, 403, corsHeaders);
  }

  const deviceId = toText(body.value.deviceId || "").slice(0, 120);
  if (!deviceId) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const deviceName = toText(body.value.deviceName || "").slice(0, 80) || "未知设备";
  if (!env.SEAT_MANAGER_KV) return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  if (!await claimLicenseIdentity(license, env)) return jsonResponse({ error: "license_id_conflict" }, 409, corsHeaders);
  const bound = await bindLicenseDevice(license, deviceId, deviceName, env, edition);
  if (!bound.ok) {
    return jsonResponse({ error: bound.error || "device_limit", maxDevices: bound.maxDevices }, bound.error ? 403 : 409, corsHeaders);
  }

  const rememberDays = Number(body.value.rememberDays);
  const ttl = rememberDays > 0 ? Math.min(rememberDays, PRODUCT_REMEMBER_MAX_DAYS) * 24 * 60 * 60 * 1000 : SESSION_TOKEN_TTL_MS;
  const expiresAt = Math.min(Date.now() + ttl, license.expiresAt ? Date.parse(license.expiresAt) : Infinity);
  const token = await signToken({
    exp: expiresAt,
    scope: "product-access",
    licenseId: license.licenseId,
    licenseKey: license.storageKey,
    deviceId,
    deviceSessionId: license.devices.find(device => device.id === deviceId)?.sessionId,
    edition,
  }, tokenSecret);
  return jsonResponse({
    token,
    expiresAt,
    licenseId: license.licenseId,
    edition,
    allowedEditions: license.allowedEditions,
    maxDevices: bound.maxDevices,
    aiEnabled: Boolean(license.aiEnabled),
    aiExpiresAt: license.aiExpiresAt || "",
    aiDailyLimit: license.aiDailyLimit || DEFAULT_AI_DAILY_LIMIT,
  }, 200, corsHeaders);
}

async function handleLicenseUnbindDevice(request, env, corsHeaders) {
  const tokenSecret = env.PRODUCT_TOKEN_SECRET || env.TOKEN_SECRET;
  if (!tokenSecret || !env.SEAT_MANAGER_KV) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const verified = await verifyProductRequest(getBearerToken(request), env);
  if (!verified) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }

  const { license, payload } = verified;
  const removed = await unbindLicenseDevice(license, payload.deviceId, env, payload.deviceSessionId || "");
  return jsonResponse({
    ok: true,
    removed,
    licenseId: license.licenseId,
    maxDevices: license.maxDevices || DEFAULT_MAX_DEVICES,
  }, 200, corsHeaders);
}

export const licensePostRoutes = {
  "/license/auth": handleLicenseAuth,
  "/license/unbind-device": handleLicenseUnbindDevice,
};
