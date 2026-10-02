import { SESSION_TOKEN_TTL_MS, getBearerToken, sha256Hex, signToken, timingSafeEqual, verifyToken } from "../worker-auth.js";
import { readJsonBody, toText } from "../worker-input.js";
import { getLicensedSyncStateKey } from "../worker-license-keys.js";
import { jsonResponse } from "../worker-response.js";
import { allowAuthAttempt } from "../worker-usage.js";
import { verifyProductRequest } from "../worker-license-access.js";
import { validSyncBook } from "../../shared/sync-content.mjs";

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

  if (env.SYNC_RATE_LIMITER && !(await env.SYNC_RATE_LIMITER.limit({ key: syncContext.key })).success) {
    return jsonResponse({ error: "rate_limited" }, 429, { ...corsHeaders, "Retry-After": "60" });
  }
  if (env.SYNC_COORDINATOR) {
    try { return await handleCoordinatedSync(request, env, corsHeaders, pathname, syncContext); }
    catch { return jsonResponse({ error: "sync_coordinator_unavailable" }, 503, corsHeaders); }
  }
  if (pathname === "/sync/migration" || pathname === "/sync/migration/backup") return jsonResponse({ error: "migration_unavailable" }, 503, corsHeaders);
  // New protocol never pretends that an uncoordinated deployment offers CAS.
  if (pathname === "/sync/mode") return jsonResponse({ error: request.method === "POST" ? "automatic_disabled" : "method_not_allowed" }, request.method === "POST" ? 403 : 405, corsHeaders);
  if (new URL(request.url).searchParams.get("protocol") === "2" && ["/sync/status", "/sync/load"].includes(pathname)) {
    if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    return jsonResponse({ ready: false, automaticAvailable: false, licenseId: syncContext.licenseId || undefined }, 200, corsHeaders);
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
    const verified = await verifyProductRequest(token, env);
    if (verified) {
      const licenseId = verified.license.licenseId;
        return {
          ok: true,
          key: getLicensedSyncStateKey(licenseId),
          licenseId,
          actor: { licenseKey: verified.payload.licenseKey, deviceId: verified.payload.deviceId, sessionId: verified.payload.deviceSessionId || "", edition: verified.payload.edition || "commercial", expiresAt: verified.payload.exp },
          strictAllowed: !verified.license.allowedEditions.includes("commercial") || env.SYNC_COMMERCIAL_PROTOCOL_READY === "true",
        };
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

async function handleCoordinatedSync(request, env, corsHeaders, pathname, syncContext) {
  const coordinator = env.SYNC_COORDINATOR.getByName(syncContext.key);
  const protocol = new URL(request.url).searchParams.get("protocol") === "2";
  const licenseId = syncContext.licenseId || undefined;
  if (pathname === "/sync/migration" || pathname === "/sync/migration/backup") {
    if (!licenseId || !syncContext.actor) return jsonResponse({ error: "forbidden" }, 403, corsHeaders);
    let action = pathname.endsWith("/backup") ? "backup" : "status"; let body = {};
    if (request.method === "POST" && pathname === "/sync/migration") {
      const parsed = await readJsonBody(request);
      if (!parsed.ok) return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
      body = parsed.value; action = body.action;
      if (!["prepare", "commit", "abort"].includes(action)) return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
    } else if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    if (action === "backup") body.operationId = new URL(request.url).searchParams.get("operationId") || "";
    const result = await coordinator.migration(syncContext.key, licenseId, action, body, syncContext.actor);
    return jsonResponse(result, result.status || 200, corsHeaders);
  }
  if (pathname === "/sync/mode") {
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    const body = await readJsonBody(request);
    if (!body.ok || body.value?.enable !== true || body.value?.acknowledgeAllWorkspaces !== true) return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
    const result = await coordinator.setStrict(syncContext.key, body.value, Boolean(syncContext.licenseId && syncContext.strictAllowed), syncContext.actor || null);
    return jsonResponse({ ...result, licenseId }, result.status || 200, corsHeaders);
  }
  if (pathname === "/sync/save") {
    if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    const body = await readBoundedSyncBody(request);
    if (!body.ok) return jsonResponse({ error: body.large ? "payload_too_large" : "bad_request" }, body.large ? 413 : 400, corsHeaders);
    if (!isValidSyncSavePayload(body.value)) return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
    const input = body.value;
    const v2 = input.protocol === 2;
    // Existing un-migrated legacy clients retain their historical validation.
    if (v2 && input.workspaceBook !== undefined && !validSyncBook(input.workspaceBook)) return jsonResponse({ error: "invalid_snapshot" }, 400, corsHeaders);
    const payload = { version: Number(input.version) || 1, updatedAt: new Date().toISOString(), deviceName: toText(input.deviceName || "").slice(0, 60) || "未知设备", data: input.data,
      ...(input.workspaceBook !== undefined ? { workspaceBook: input.workspaceBook } : {}) };
    payload.sizeBytes = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (payload.sizeBytes > SYNC_MAX_BODY_BYTES) return jsonResponse({ error: "payload_too_large" }, 413, corsHeaders);
    const result = await coordinator.save(syncContext.key, payload, v2 ? { baseRevision: input.baseRevision, epoch: input.epoch, clientMutationId: input.clientMutationId, hash: input.hash } : null, syncContext.actor || null, licenseId || "");
    if (result.error) return jsonResponse(result, result.status, corsHeaders);
    const meta = { ok: true, licenseId, updatedAt: payload.updatedAt, deviceName: payload.deviceName, version: payload.version, sizeBytes: payload.sizeBytes };
    return jsonResponse(v2 ? { ...result, licenseId, automaticAvailable: Boolean(result.automaticAvailable && syncContext.strictAllowed) } : meta, 200, corsHeaders);
  }
  if (!["/sync/status", "/sync/load"].includes(pathname)) return jsonResponse({ error: "not_found" }, 404, corsHeaders);
  if (request.method !== "GET") return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
  const result = await coordinator.read(syncContext.key, pathname === "/sync/load" || !protocol);
  if (protocol) {
    if (!result.ready) return jsonResponse({ ready: false, exists: Boolean(result.saved), licenseId, automaticAvailable: false }, 200, corsHeaders);
    const { saved, ...metadata } = result;
    if (pathname === "/sync/load" && !result.exists) return jsonResponse({ error: "not_found", ...metadata, licenseId }, 404, corsHeaders);
    return jsonResponse({ ...(saved || {}), ...metadata, licenseId, automaticAvailable: Boolean(result.automaticAvailable && syncContext.strictAllowed) }, 200, corsHeaders);
  }
  const saved = result.saved;
  if (!saved) return jsonResponse(pathname === "/sync/status" ? { exists: false, licenseId } : { error: "not_found" }, pathname === "/sync/status" ? 200 : 404, corsHeaders);
  const meta = { licenseId, updatedAt: saved.updatedAt || "", deviceName: toText(saved.deviceName || "").slice(0, 60), version: Number(saved.version) || 1 };
  return jsonResponse(pathname === "/sync/status" ? { exists: true, ...meta, sizeBytes: Number(saved.sizeBytes) || 0 } : { ...meta, data: saved.data, ...(saved.workspaceBook !== undefined ? { workspaceBook: saved.workspaceBook } : {}) }, 200, corsHeaders);
}

// Bound bytes while reading rather than allocating an unbounded request string.
async function readBoundedSyncBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return { ok: false };
  const decoder = new TextDecoder("utf-8", { fatal: true }); let text = ""; let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > SYNC_MAX_BODY_BYTES) { await reader.cancel(); return { ok: false, large: true }; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return { ok: true, value: JSON.parse(text) };
  } catch { return { ok: false }; }
  finally { reader.releaseLock(); }
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
  if (body.value.protocol === 2) return jsonResponse({ error: "sync_coordinator_unavailable" }, 503, corsHeaders);
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
