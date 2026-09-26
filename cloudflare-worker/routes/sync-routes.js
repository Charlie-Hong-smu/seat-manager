import { SESSION_TOKEN_TTL_MS, getBearerToken, sha256Hex, signToken, timingSafeEqual, verifyToken } from "../worker-auth.js";
import { readJsonBody, toText } from "../worker-input.js";
import { getLicensedSyncStateKey, sanitizeLicenseId } from "../worker-license-keys.js";
import { jsonResponse } from "../worker-response.js";
import { allowAuthAttempt } from "../worker-usage.js";

const SYNC_MAX_BODY_BYTES = 5 * 1024 * 1024;
const SYNC_STATE_KEY = "seat-manager:single-teacher:state";

export async function handleSyncRoute(request, env, corsHeaders, pathname) {
  if (pathname === "/sync/auth") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    }
    return handleSyncAuth(request, env, corsHeaders);
  }

  if (!["GET", "POST"].includes(request.method)) {
    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
  }
  const syncContext = await verifySyncRequest(request, env);
  if (!syncContext.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  if (!env.SEAT_MANAGER_KV) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  if (pathname === "/sync/status") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    }
    return handleSyncStatus(env, corsHeaders, syncContext);
  }
  if (pathname === "/sync/save") {
    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    }
    return handleSyncSave(request, env, corsHeaders, syncContext);
  }
  if (pathname === "/sync/load") {
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    }
    return handleSyncLoad(env, corsHeaders, syncContext);
  }
  return jsonResponse({ error: "not_found" }, 404, corsHeaders);
}

async function handleSyncAuth(request, env, corsHeaders) {
  if (!await allowAuthAttempt(request, env, "/sync/auth")) {
    return jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
  }
  if ((!env.SYNC_ACCESS_CODE && !env.SYNC_ACCESS_CODE_HASH) || !env.SYNC_TOKEN_SECRET) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const syncCode = String(body.value.syncCode || "");
  let allowed = false;
  if (env.SYNC_ACCESS_CODE_HASH) {
    allowed = timingSafeEqual(await sha256Hex(syncCode), env.SYNC_ACCESS_CODE_HASH);
  } else {
    allowed = timingSafeEqual(syncCode, env.SYNC_ACCESS_CODE);
  }
  if (!allowed) {
    return jsonResponse({ error: "forbidden" }, 403, corsHeaders);
  }
  const rememberDays = Number(body.value.rememberDays);
  const ttl = rememberDays > 0 ? Math.min(rememberDays, 30) * 24 * 60 * 60 * 1000 : SESSION_TOKEN_TTL_MS;
  const expiresAt = Date.now() + ttl;
  const token = await signToken({ exp: expiresAt, scope: "seat-sync" }, env.SYNC_TOKEN_SECRET);
  return jsonResponse({ token, expiresAt }, 200, corsHeaders);
}

async function verifySyncRequest(request, env) {
  const token = getBearerToken(request);
  const productSecret = env.PRODUCT_TOKEN_SECRET || env.TOKEN_SECRET;
  if (productSecret) {
    const productToken = token ? await verifyToken(token, productSecret) : null;
    if (
      productToken &&
      productToken.exp > Date.now() &&
      productToken.scope === "product-access" &&
      productToken.licenseId
    ) {
      const licenseId = sanitizeLicenseId(productToken.licenseId);
      if (licenseId) {
        return {
          ok: true,
          key: getLicensedSyncStateKey(licenseId),
          licenseId,
        };
      }
    }
  }
  if (env.SYNC_TOKEN_SECRET) {
    const verified = token ? await verifyToken(token, env.SYNC_TOKEN_SECRET) : null;
    if (verified && verified.exp > Date.now() && verified.scope === "seat-sync") {
      return { ok: true, key: SYNC_STATE_KEY, licenseId: "" };
    }
  }
  return { ok: false, key: "", licenseId: "" };
}

async function handleSyncStatus(env, corsHeaders, syncContext) {
  const saved = await env.SEAT_MANAGER_KV.get(syncContext.key, { type: "json" });
  if (!saved) {
    return jsonResponse({ exists: false, licenseId: syncContext.licenseId || undefined }, 200, corsHeaders);
  }
  return jsonResponse({
    exists: true,
    licenseId: syncContext.licenseId || undefined,
    updatedAt: saved.updatedAt || "",
    deviceName: toText(saved.deviceName || "").slice(0, 60),
    version: Number(saved.version) || 1,
    sizeBytes: Number(saved.sizeBytes) || 0
  }, 200, corsHeaders);
}

async function handleSyncSave(request, env, corsHeaders, syncContext) {
  const body = await readJsonBody(request, SYNC_MAX_BODY_BYTES);
  if (!body.ok || !isValidSyncSavePayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const updatedAt = new Date().toISOString();
  const payload = {
    version: Number(body.value.version) || 1,
    updatedAt,
    deviceName: toText(body.value.deviceName || "").slice(0, 60) || "未知设备",
    data: body.value.data,
    // Keep the whole book alongside the active slice required by older clients.
    ...(body.value.workspaceBook !== undefined ? { workspaceBook: body.value.workspaceBook } : {})
  };
  payload.sizeBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
  if (payload.sizeBytes > SYNC_MAX_BODY_BYTES) {
    return jsonResponse({ error: "payload_too_large" }, 413, corsHeaders);
  }
  await env.SEAT_MANAGER_KV.put(syncContext.key, JSON.stringify(payload));
  return jsonResponse({
    ok: true,
    licenseId: syncContext.licenseId || undefined,
    updatedAt,
    deviceName: payload.deviceName,
    version: payload.version,
    sizeBytes: payload.sizeBytes
  }, 200, corsHeaders);
}

async function handleSyncLoad(env, corsHeaders, syncContext) {
  const saved = await env.SEAT_MANAGER_KV.get(syncContext.key, { type: "json" });
  if (!saved) {
    return jsonResponse({ error: "not_found" }, 404, corsHeaders);
  }
  return jsonResponse({
    licenseId: syncContext.licenseId || undefined,
    version: Number(saved.version) || 1,
    updatedAt: saved.updatedAt || "",
    deviceName: toText(saved.deviceName || "").slice(0, 60),
    data: saved.data,
    ...(saved.workspaceBook !== undefined ? { workspaceBook: saved.workspaceBook } : {})
  }, 200, corsHeaders);
}

function isValidSyncSavePayload(payload) {
  return (
    payload &&
    typeof payload === "object" &&
    Number(payload.version) >= 1 &&
    typeof payload.data === "object" &&
    payload.data !== null &&
    Array.isArray(payload.data.students) &&
    Array.isArray(payload.data.seatOrder)
  );
}
