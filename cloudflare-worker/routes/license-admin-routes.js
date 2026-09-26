import { jsonResponse } from "../worker-response.js";
import { getBearerToken, sha256Hex, timingSafeEqual } from "../worker-auth.js";
import { readJsonBody, toText } from "../worker-input.js";
import { LICENSE_KEY_PREFIX, LICENSE_SYNC_STATE_SUFFIX, sanitizeLicenseId, getLicensedSyncStateKey } from "../worker-license-keys.js";
import { loadLicenseRecordByKey, unbindAllLicenseDevices, getAdminLicenseKey, getAdminLicenseKeyFromExisting, normalizeAdminLicenseInput, normalizeAdminAcquisitionInput, serializeLicenseForStorage, serializeLicenseForAdmin } from "../worker-license-store.js";

export async function handleLicenseAdminRoute(request, env, corsHeaders, pathname) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
  }
  if (!env.SEAT_MANAGER_KV) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }
  if (!await verifyLicenseAdminRequest(request, env)) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }

  if (pathname === "/admin/licenses/list") {
    return handleLicenseAdminList(request, env, corsHeaders);
  }
  if (pathname === "/admin/licenses/upsert") {
    return handleLicenseAdminUpsert(request, env, corsHeaders);
  }
  if (pathname === "/admin/licenses/clear-devices") {
    return handleLicenseAdminClearDevices(request, env, corsHeaders);
  }
  if (pathname === "/admin/licenses/delete") {
    return handleLicenseAdminDelete(request, env, corsHeaders);
  }
  return jsonResponse({ error: "not_found" }, 404, corsHeaders);
}

async function verifyLicenseAdminRequest(request, env) {
  const token = getBearerToken(request);
  if (!token) {
    return false;
  }
  if (env.LICENSE_ADMIN_TOKEN_HASH) {
    return timingSafeEqual(await sha256Hex(token), env.LICENSE_ADMIN_TOKEN_HASH);
  }
  if (env.LICENSE_ADMIN_TOKEN) {
    return timingSafeEqual(token, env.LICENSE_ADMIN_TOKEN);
  }
  return false;
}

async function handleLicenseAdminList(request, env, corsHeaders) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const cursor = toText(body.value?.cursor).trim();
  if (cursor.length > 1000) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const list = await env.SEAT_MANAGER_KV.list({
    prefix: LICENSE_KEY_PREFIX,
    ...(cursor ? { cursor } : {}),
  });
  const licenseKeys = list.keys
    .map((item) => item.name)
    .filter((key) => key.startsWith(LICENSE_KEY_PREFIX) && !key.endsWith(LICENSE_SYNC_STATE_SUFFIX));
  const licenses = await Promise.all(licenseKeys.map(async (key) => {
    const license = await loadLicenseRecordByKey(key, env);
    if (!license) {
      return null;
    }
    return serializeLicenseForAdmin(license);
  }));
  return jsonResponse({
    licenses: licenses.filter(Boolean).sort((a, b) => a.licenseId.localeCompare(b.licenseId)),
    partial: Boolean(list.list_complete === false),
    cursor: list.list_complete === false ? toText(list.cursor) : "",
  }, 200, corsHeaders);
}

async function handleLicenseAdminUpsert(request, env, corsHeaders) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const input = body.value || {};
  const licenseKey = await getAdminLicenseKey(input);
  const licenseId = sanitizeLicenseId(input.licenseId);
  if (!licenseKey || !licenseId) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const existing = await loadLicenseRecordByKey(licenseKey, env);
  const acquisition = normalizeAdminAcquisitionInput(input, existing, licenseId);
  if (!acquisition.ok) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const clearDevices = Boolean(input.clearDevices);
  const now = new Date().toISOString();
  const record = normalizeAdminLicenseInput(input, existing, {
    licenseId,
    acquisitionChannel: acquisition.channel,
    acquisitionDetail: acquisition.detail,
    createdAt: existing?.createdAt || now,
    devices: clearDevices ? [] : existing?.devices || [],
    updatedAt: now,
  });
  if (env.ACCOUNT_COORDINATOR) await env.ACCOUNT_COORDINATOR.getByName(licenseKey).mutateLicense(licenseKey, { type: "upsert", record: serializeLicenseForStorage(record), clearDevices });
  else await env.SEAT_MANAGER_KV.put(licenseKey, JSON.stringify(serializeLicenseForStorage(record)));
  const saved = await loadLicenseRecordByKey(licenseKey, env);
  return jsonResponse({ license: serializeLicenseForAdmin(saved) }, 200, corsHeaders);
}

async function handleLicenseAdminClearDevices(request, env, corsHeaders) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const licenseKey = getAdminLicenseKeyFromExisting(body.value);
  const license = await loadLicenseRecordByKey(licenseKey, env);
  if (!license) {
    return jsonResponse({ error: "not_found" }, 404, corsHeaders);
  }
  await unbindAllLicenseDevices(license, env);
  const saved = await loadLicenseRecordByKey(licenseKey, env);
  return jsonResponse({ license: serializeLicenseForAdmin(saved) }, 200, corsHeaders);
}

async function handleLicenseAdminDelete(request, env, corsHeaders) {
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const licenseKey = getAdminLicenseKeyFromExisting(body.value);
  if (!licenseKey) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  if (env.ACCOUNT_COORDINATOR) {
    await env.ACCOUNT_COORDINATOR.getByName(licenseKey).mutateLicense(licenseKey, { type: "delete" });
  } else {
    await env.SEAT_MANAGER_KV.delete(licenseKey);
  }
  if (body.value?.deleteState) {
    const licenseId = sanitizeLicenseId(body.value.licenseId);
    if (licenseId) {
      await env.SEAT_MANAGER_KV.delete(getLicensedSyncStateKey(licenseId));
    }
  }
  return jsonResponse({ ok: true }, 200, corsHeaders);
}
