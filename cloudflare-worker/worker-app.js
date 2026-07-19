const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 20 * 1024;
const ASSISTANT_MAX_BODY_BYTES = 96 * 1024;
const SCORE_MAPPING_MAX_BODY_BYTES = 120 * 1024;
const SYNC_MAX_BODY_BYTES = 5 * 1024 * 1024;
const MODEL = "deepseek-v4-flash";
const SYNC_STATE_KEY = "seat-manager:single-teacher:state";
const LICENSE_KEY_PREFIX = "seat-manager:license:";
const LICENSE_SYNC_STATE_SUFFIX = ":state";
const DEFAULT_MAX_DEVICES = 3;
const DEFAULT_AI_DAILY_LIMIT = 30;
const DEFAULT_ALLOWED_EDITIONS = Object.freeze(["commercial"]);

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = getCorsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      return await dispatchWorkerRequest(request, env, corsHeaders, {
        licenseAdmin: handleLicenseAdminRoute,
        sync: createSyncRouteHandler(handleSyncRoute),
        post: {
          ...createLicensePostRoutes({ auth: handleLicenseAuth, unbindDevice: handleLicenseUnbindDevice }),
          ...createAiPostRoutes({
            auth: handleAuth,
            analyzeTrend: handleAnalyzeTrend,
            analyzeClass: handleAnalyzeClass,
            chatAssistant: handleChatAssistant,
            studentFollowup: handleStudentFollowup,
            generateComment: handleGenerateStudentComment,
            refineComment: handleRefineStudentComment,
            suggestScoreMapping: handleSuggestScoreMapping,
            suggestRosterMapping: handleSuggestRosterMapping,
            generateWeeklyDraft: handleGenerateWeeklyDraft,
            analyzeScoreItems: handleAnalyzeScoreItems,
          }),
        },
      });
    } catch (error) {
      console.error(JSON.stringify({ event: "worker_request_failed", message: error instanceof Error ? error.message : "unknown_error" }));
      return jsonResponse({ error: "internal_error" }, 500, corsHeaders);
    }
  }
};

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
  const bound = await bindLicenseDevice(license, deviceId, deviceName, env);
  if (!bound.ok) {
    return jsonResponse({ error: "device_limit", maxDevices: bound.maxDevices }, 409, corsHeaders);
  }

  const rememberDays = Number(body.value.rememberDays);
  const ttl = rememberDays > 0 ? Math.min(rememberDays, 30) * 24 * 60 * 60 * 1000 : SESSION_TOKEN_TTL_MS;
  const expiresAt = Date.now() + ttl;
  const token = await signToken({
    exp: expiresAt,
    scope: "product-access",
    licenseId: license.licenseId,
    licenseKey: license.storageKey,
    deviceId,
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

async function handleLicenseAdminRoute(request, env, corsHeaders, pathname) {
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
  await env.SEAT_MANAGER_KV.put(licenseKey, JSON.stringify(serializeLicenseForStorage(record)));
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
  await env.SEAT_MANAGER_KV.delete(licenseKey);
  if (body.value?.deleteState) {
    const licenseId = sanitizeLicenseId(body.value.licenseId);
    if (licenseId) {
      await env.SEAT_MANAGER_KV.delete(getLicensedSyncStateKey(licenseId));
    }
  }
  return jsonResponse({ ok: true }, 200, corsHeaders);
}

async function handleLicenseUnbindDevice(request, env, corsHeaders) {
  const tokenSecret = env.PRODUCT_TOKEN_SECRET || env.TOKEN_SECRET;
  if (!tokenSecret || !env.SEAT_MANAGER_KV) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = token ? await verifyToken(token, tokenSecret) : null;
  if (
    !verified ||
    verified.exp <= Date.now() ||
    verified.scope !== "product-access" ||
    !verified.licenseKey ||
    !verified.deviceId
  ) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }

  const license = await loadLicenseRecordByKey(verified.licenseKey, env);
  if (!license || license.status !== "active") {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }

  const removed = await unbindLicenseDevice(license, verified.deviceId, env);
  return jsonResponse({
    ok: true,
    removed,
    licenseId: license.licenseId,
    maxDevices: license.maxDevices || DEFAULT_MAX_DEVICES,
  }, 200, corsHeaders);
}

async function handleSyncRoute(request, env, corsHeaders, pathname) {
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

async function verifyAiRequest(token, env) {
  if (!token) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT, actorKey: "" };
  }

  if (env.TOKEN_SECRET) {
    const aiToken = await verifyToken(token, env.TOKEN_SECRET);
    if (aiToken && aiToken.exp > Date.now() && aiToken.scope === "ai-trend") {
      return { ok: true, dailyLimit: DEFAULT_AI_DAILY_LIMIT, actorKey: `ai:${await sha256Hex(token)}` };
    }
  }

  const productSecret = env.PRODUCT_TOKEN_SECRET || env.TOKEN_SECRET;
  if (!productSecret || !env.SEAT_MANAGER_KV) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT, actorKey: "" };
  }
  const productToken = await verifyToken(token, productSecret);
  if (
    !productToken ||
    productToken.exp <= Date.now() ||
    productToken.scope !== "product-access" ||
    !productToken.licenseKey
  ) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT, actorKey: "" };
  }

  const license = await loadLicenseRecordByKey(productToken.licenseKey, env);
  if (!license || license.status !== "active") {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT, actorKey: "" };
  }
  if (license.expiresAt && Date.parse(license.expiresAt) <= Date.now()) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT, actorKey: "" };
  }
  if (!license.aiEnabled) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT, actorKey: "" };
  }
  if (license.aiExpiresAt && Date.parse(license.aiExpiresAt) <= Date.now()) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT, actorKey: "" };
  }
  return {
    ok: true,
    dailyLimit: license.aiDailyLimit || DEFAULT_AI_DAILY_LIMIT,
    actorKey: `license:${license.licenseId}`,
  };
}

async function getAiLimitResponse(env, verified, corsHeaders) {
  const usage = await consumeAiUsage(env, verified);
  return usage.allowed ? null : jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
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
    data: body.value.data
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
    data: saved.data
  }, 200, corsHeaders);
}

async function handleAuth(request, env, corsHeaders) {
  if (!await allowAuthAttempt(request, env, "/auth")) {
    return jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
  }
  if (!env.AI_ACCESS_CODE_HASH || !env.TOKEN_SECRET) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }

  const accessCode = String(body.value.accessCode || "");
  const accessHash = await sha256Hex(accessCode);
  if (!timingSafeEqual(accessHash, env.AI_ACCESS_CODE_HASH)) {
    return jsonResponse({ error: "forbidden" }, 403, corsHeaders);
  }

  const rememberDays = Number(body.value.rememberDays);
  const ttl = rememberDays > 0 ? TOKEN_TTL_MS : SESSION_TOKEN_TTL_MS;
  const expiresAt = Date.now() + ttl;
  const token = await signToken({ exp: expiresAt, scope: "ai-trend" }, env.TOKEN_SECRET);
  return jsonResponse({ token, expiresAt }, 200, corsHeaders);
}

async function handleAnalyzeTrend(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }

  const body = await readJsonBody(request);
  if (!body.ok || !isValidTrendPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是谨慎的教师助手。只根据提供的匿名成绩摘要生成温和、可参考的趋势建议，不做绝对判断。recentExams 包含当前学期该学生全部考试，按考试先后从早到晚排列，最后一项是最新考试；所有升降必须用最新考试减最早考试判断，不要把顺序反过来。必须返回 JSON，字段为 overall、changes、suggestions、disclaimer。所有字段值必须使用面向中国教师的自然中文，禁止在字段值中输出 totalScore、classRank、subjects、score 等 JSON 输入字段名或其他英文指标名；变化应写成“总分下降51分、班级排名退步29名、物理下降35分”这类中文句子。"
          },
          {
            role: "user",
            content: JSON.stringify(body.value)
          }
        ]
      })
    });

    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = parseModelJson(content);
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeAiResult(parsed), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleAnalyzeClass(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }

  const body = await readJsonBody(request);
  if (!body.ok || !isValidClassPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是谨慎的班主任成绩分析助手。只根据提供的全班成绩变化摘要、考试统计和重点候选学生序列，概括班级趋势，并指出需要教师重点关注的学生。不要声称看到了完整全班逐科明细。必须返回 JSON，字段为 overall、classChanges、focusStudents、suggestions、disclaimer。所有字段值必须使用面向中国教师的自然中文，禁止输出 totalScore、classRank、subjects、score 等 JSON 输入字段名或其他英文指标名。focusStudents 必须逐行列出，格式为“姓名（简短原因）”，原因控制在 12 个字以内，例如“化学下降26分”或“排名退步35名”。"
          },
          {
            role: "user",
            content: JSON.stringify(body.value)
          }
        ]
      })
    });

    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content || "";
    const parsed = parseModelJson(content);
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeClassAiResult(parsed), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleChatAssistant(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request, ASSISTANT_MAX_BODY_BYTES);
  if (!body.ok || !isValidAssistantPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是谨慎、务实的班主任 AI 助手。默认只能根据用户提供的当前班级、当前学期摘要回答；若提供 comparisonContext，可基于其中显式选择的同一班级对比学期做跨学期回答。不能声称看到了未提供的其他班级、其他学期或完整本地数据库。不要编造学生事实、成绩、家庭情况、心理/医学判断。不要输出会自动修改系统数据的指令。baseContext 是全班基础摘要；contextPacks 是本次问题自动附带的相关学生、考试、宿舍、标签、记录或班费明细；comparisonContext 是同班级跨学期摘要或不支持提示。若用户询问具体对象，优先使用 contextPacks 和 comparisonContext；只有确实没有相关明细时才说明信息不足。可以给老师提供班级分析、跨学期变化、重点学生跟进、沟通话术、评语素材方向、班费收支概览和下一步行动建议。必须返回 JSON，字段为 message、disclaimer、suggestedPrompts。message 用中文，结构清晰但不要太长；不要使用 Markdown 标记，不要输出 **粗体**、# 标题、代码块、反引号或表格，用普通中文、编号和自然换行即可；suggestedPrompts 给 2 到 4 个后续可问的问题。"
          },
          {
            role: "user",
            content: JSON.stringify({
              context: trimAssistantContext(body.value.context),
              messages: body.value.messages.map((message) => ({
                role: message.role,
                content: toAssistantText(message.content, 1200)
              }))
            })
          }
        ]
      })
    });
    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeAssistantResult(parsed), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleSuggestScoreMapping(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request, SCORE_MAPPING_MAX_BODY_BYTES);
  if (!body.ok || !isValidScoreMappingPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是成绩表列映射助手。根据表头和少量样例，返回 JSON。列索引必须使用用户提供的 index，无法判断填 -1。字段：nameCol、subjectMappings、totalMapping、note。subjectMappings 数组元素字段：subject、scoreCol、rankClassCol、rankSchoolCol。只使用 knownSubjects 中的科目。不要编造不存在的列。"
          },
          { role: "user", content: JSON.stringify(body.value) }
        ]
      })
    });
    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeScoreMappingResult(parsed, body.value), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleSuggestRosterMapping(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request, SCORE_MAPPING_MAX_BODY_BYTES);
  if (!body.ok || !isValidRosterMappingPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是班级名单表列映射助手。根据表头和少量样例，返回 JSON。列索引必须使用用户提供的 index，无法判断填 -1。字段：nameCol、studentNoCol、genderCol、rowCol、colCol、hasHeader、note。姓名列必须尽量识别；座位行列可选。不要编造不存在的列。"
          },
          { role: "user", content: JSON.stringify(body.value) }
        ]
      })
    });
    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeRosterMappingResult(parsed, body.value), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleStudentFollowup(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request, MAX_BODY_BYTES + 8 * 1024);
  if (!body.ok || !isValidStudentFollowupPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "你是谨慎、务实的班主任学生跟进助手。只能根据用户提供的单个学生成绩、标签、日常记录、宿舍、座位和评语素材生成建议，不能编造家庭情况、心理/医学判断或未提供事实。输出要帮助老师马上行动：近期变化、风险信号、可表扬点、3条跟进动作、家校沟通草稿、可放入期末评语的素材。语言温和具体。必须返回 JSON，字段为 summary、riskSignals、strengths、actions、parentMessageDraft、commentMaterials、disclaimer。riskSignals、strengths、actions、commentMaterials 都必须是字符串数组；actions 恰好 3 条；如果资料不足，要在 riskSignals 或 actions 中提示需要补充的信息，而不是编造。"
          },
          {
            role: "user",
            content: JSON.stringify(trimStudentFollowupPayload(body.value))
          }
        ]
      })
    });

    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeStudentFollowupResult(parsed), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleGenerateWeeklyDraft(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }
  const verified = await verifyAiRequest(getBearerToken(request), env);
  if (!verified.ok) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  const body = await readJsonBody(request, MAX_BODY_BYTES + 8 * 1024);
  if (!body.ok || !isValidWeeklyDraftPayload(body.value)) return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: MODEL, response_format: { type: "json_object" }, stream: false, messages: [
        { role: "system", content: "你是谨慎的班主任周报与家校沟通助手。只能使用输入 facts 和 localDraft 中已有事实，不能推断家庭、心理或医学情况。班级周报要简洁可执行；个人沟通稿要客观、温和，不贴标签。必须返回 JSON：title、content、highlights、cautions、disclaimer，其中 highlights 和 cautions 是字符串数组。" },
        { role: "user", content: JSON.stringify(body.value) },
      ] }),
    });
    if (!response.ok) return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    return parsed ? jsonResponse(sanitizeWeeklyDraftResult(parsed), 200, corsHeaders) : jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleAnalyzeScoreItems(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }
  const verified = await verifyAiRequest(getBearerToken(request), env);
  if (!verified.ok) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  const body = await readJsonBody(request, MAX_BODY_BYTES + 12 * 1024);
  if (!body.ok || !isValidScoreItemPayload(body.value)) return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({ model: MODEL, response_format: { type: "json_object" }, stream: false, messages: [
        { role: "system", content: "你是中小学考试题目分析助手。只根据已计算的题目得分率、知识点和匿名学生 ID 提供教学判断，不编造题干或知识点。必须返回 JSON：overview、weakPoints、teachingSuggestions、followupCandidates、disclaimer。followupCandidates 每项只含 studentId 和 reason，最多 12 人。" },
        { role: "user", content: JSON.stringify(body.value) },
      ] }),
    });
    if (!response.ok) return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    return parsed ? jsonResponse(sanitizeScoreItemResult(parsed, body.value), 200, corsHeaders) : jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleGenerateStudentComment(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  const body = await readJsonBody(request);
  if (!body.ok || !isValidStudentCommentPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }

  const missingInfo = getStudentCommentMissingInfo(body.value.context);
  if (missingInfo.length >= 3 && !toText(body.value.context.teacherNote)) {
    return jsonResponse({ comment: "", needsMoreInfo: true, missingInfo }, 200, corsHeaders);
  }
  const commentLength = getStudentCommentLengthSettings(body.value);
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content:
              `你是谨慎的班主任评语助手。只根据用户提供的单个学生信息、当前学期全部成绩序列、标签、日常记录、评语工作台素材 commentProfile 和教师补充评价写期末评语。禁止编造未提供事实，禁止夸大或做医学/心理诊断。语言自然，不模板化，适合作为期末评语，兼具鼓励和建设性提醒。优先使用老师选择的评语素材和教师补充评价；成绩事实只能来自上下文。可以综合标准选择和自定义素材，但不要机械罗列所有选项。必须返回 JSON，字段为 comment、needsMoreInfo、missingInfo。comment 必须是中文，目标长度为${commentLength.instruction}。若信息不足，needsMoreInfo 为 true，missingInfo 说明需要补充哪些信息，comment 可以为空。`
          },
          {
            role: "user",
            content: JSON.stringify(body.value)
          }
        ]
      })
    });

    if (!response.ok) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    if (!parsed) {
      return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    }
    return jsonResponse(sanitizeStudentCommentResult(parsed, missingInfo, commentLength), 200, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function handleRefineStudentComment(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const verified = await verifyAiRequest(getBearerToken(request), env);
  if (!verified.ok) return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  const body = await readJsonBody(request, 8 * 1024);
  if (!body.ok || !isValidCommentRefinementPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }
  const limitResponse = await getAiLimitResponse(env, verified, corsHeaders);
  if (limitResponse) return limitResponse;

  const instructions = {
    polish: "让表达更自然、准确、温和，保持原意和事实不变。",
    specific: "只依据原文和相邻语境把动作或表现说得更清楚；没有事实支撑时不得新增例子、成绩或判断。",
    shorten: "删除重复和空泛表达，用更短的文字保留全部事实与原意。",
  };

  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        stream: false,
        messages: [
          {
            role: "system",
            content: `你是谨慎的班主任评语文字编辑。只改写 selectedText，不改写相邻语境，不添加输入中没有的学生事实，不做心理或医学判断。${instructions[body.value.action]}返回 JSON，唯一字段为 replacement；replacement 只放替换文字，不加引号、说明或 Markdown。`,
          },
          { role: "user", content: JSON.stringify(body.value) },
        ],
      }),
    });
    if (!response.ok) return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
    const data = await response.json();
    const parsed = parseModelJson(data?.choices?.[0]?.message?.content || "");
    const replacement = sanitizeCommentRefinementResult(parsed);
    return replacement ? jsonResponse({ replacement }, 200, corsHeaders) : jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  } catch (error) {
    return jsonResponse({ error: "ai_unavailable" }, 502, corsHeaders);
  }
}

async function readJsonBody(request, maxBytes = MAX_BODY_BYTES) {
  const clone = request.clone();
  const text = await clone.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false };
  }
}

async function loadLicenseRecord(codeHash, env) {
  if (env.SEAT_MANAGER_KV) {
    const key = getLicenseKey(codeHash);
    const license = await loadLicenseRecordByKey(key, env);
    if (license) {
      return license;
    }
  }

  let allowed = false;
  if (env.PRODUCT_ACCESS_CODE_HASH) {
    allowed = timingSafeEqual(codeHash, env.PRODUCT_ACCESS_CODE_HASH);
  } else if (env.PRODUCT_ACCESS_CODE) {
    allowed = timingSafeEqual(codeHash, await sha256Hex(env.PRODUCT_ACCESS_CODE));
  }
  if (!allowed) {
    return null;
  }

  return {
    storageKey: getLicenseKey(codeHash),
    legacyEnv: true,
    licenseId: sanitizeLicenseId(env.PRODUCT_LICENSE_ID || "single"),
    allowedEditions: DEFAULT_ALLOWED_EDITIONS,
    status: "active",
    expiresAt: "",
    maxDevices: normalizeMaxDevices(env.PRODUCT_MAX_DEVICES),
    aiEnabled: parseBoolean(env.PRODUCT_AI_ENABLED, false),
    aiExpiresAt: toText(env.PRODUCT_AI_EXPIRES_AT || ""),
    aiDailyLimit: normalizeAiDailyLimit(env.PRODUCT_AI_DAILY_LIMIT),
    productCodeSecret: "",
    devices: [],
  };
}

async function loadLicenseRecordByKey(key, env) {
  if (!env.SEAT_MANAGER_KV || !toText(key).startsWith(LICENSE_KEY_PREFIX)) {
    return null;
  }
  const record = await env.SEAT_MANAGER_KV.get(key, { type: "json" });
  if (!record) {
    return null;
  }
  const licenseId = sanitizeLicenseId(record.licenseId || record.id);
  if (!licenseId) {
    return null;
  }
  return {
    storageKey: key,
    legacyEnv: false,
    licenseId,
    acquisitionChannel: normalizeAcquisitionChannel(record.acquisitionChannel, licenseId),
    acquisitionDetail: normalizeAcquisitionDetail(record.acquisitionDetail),
    allowedEditions: normalizeAllowedEditions(record.allowedEditions),
    status: toText(record.status || "active") || "active",
    expiresAt: toText(record.expiresAt || ""),
    maxDevices: normalizeMaxDevices(record.maxDevices),
    aiEnabled: parseBoolean(record.aiEnabled, false),
    aiExpiresAt: toText(record.aiExpiresAt || ""),
    aiDailyLimit: normalizeAiDailyLimit(record.aiDailyLimit),
    productCodeSecret: normalizeProductCodeSecret(record.productCodeSecret),
    devices: normalizeLicenseDevices(record.devices),
    createdAt: normalizeIsoTimestamp(record.createdAt),
    updatedAt: normalizeIsoTimestamp(record.updatedAt),
  };
}

async function bindLicenseDevice(license, deviceId, deviceName, env) {
  const maxDevices = license.maxDevices || DEFAULT_MAX_DEVICES;
  const now = new Date().toISOString();
  const devices = [...license.devices];
  const existingIndex = devices.findIndex((device) => device.id === deviceId);
  if (existingIndex >= 0) {
    devices[existingIndex] = {
      ...devices[existingIndex],
      name: deviceName,
      lastSeenAt: now,
    };
  } else {
    if (devices.length >= maxDevices) {
      return { ok: false, maxDevices };
    }
    devices.push({ id: deviceId, name: deviceName, firstSeenAt: now, lastSeenAt: now });
  }

  if (env.SEAT_MANAGER_KV && license.storageKey) {
    await persistLicenseRecord(license, env, { maxDevices, devices, updatedAt: now });
  }
  return { ok: true, maxDevices };
}

async function unbindLicenseDevice(license, deviceId, env) {
  const now = new Date().toISOString();
  const devices = license.devices.filter((device) => device.id !== deviceId);
  const removed = devices.length !== license.devices.length;
  if (env.SEAT_MANAGER_KV && license.storageKey) {
    await persistLicenseRecord(license, env, { devices, updatedAt: now });
  }
  return removed;
}

async function unbindAllLicenseDevices(license, env) {
  const now = new Date().toISOString();
  if (env.SEAT_MANAGER_KV && license.storageKey) {
    await persistLicenseRecord(license, env, { devices: [], updatedAt: now });
  }
}

async function getAdminLicenseKey(input) {
  const existingKey = getAdminLicenseKeyFromExisting(input);
  if (existingKey) {
    return existingKey;
  }
  const productCode = toText(input?.productCode).trim();
  if (!productCode) {
    return "";
  }
  return getLicenseKey(await sha256Hex(productCode));
}

function getAdminLicenseKeyFromExisting(input) {
  const key = toText(input?.licenseKey).trim();
  return key.startsWith(LICENSE_KEY_PREFIX) && !key.endsWith(LICENSE_SYNC_STATE_SUFFIX) ? key : "";
}

function normalizeAdminLicenseInput(input, existing, fallback) {
  return {
    licenseId: fallback.licenseId,
    acquisitionChannel: fallback.acquisitionChannel,
    acquisitionDetail: fallback.acquisitionDetail,
    allowedEditions: normalizeAllowedEditions(input.allowedEditions ?? existing?.allowedEditions),
    status: ["active", "disabled"].includes(input.status) ? input.status : existing?.status || "active",
    expiresAt: normalizeIsoDateInput(input.expiresAt),
    maxDevices: normalizeMaxDevices(input.maxDevices ?? existing?.maxDevices),
    aiEnabled: parseBoolean(input.aiEnabled, Boolean(existing?.aiEnabled)),
    aiExpiresAt: normalizeIsoDateInput(input.aiExpiresAt),
    aiDailyLimit: normalizeAiDailyLimit(input.aiDailyLimit ?? existing?.aiDailyLimit),
    productCodeSecret: normalizeProductCodeSecret(input.productCodeSecret) || existing?.productCodeSecret || "",
    devices: fallback.devices,
    createdAt: fallback.createdAt,
    updatedAt: fallback.updatedAt,
  };
}

const ACQUISITION_CHANNELS = new Set([
  "xiaohongshu",
  "wechat",
  "douyin",
  "referral",
  "offline",
  "other",
  "unknown",
]);

function normalizeAdminAcquisitionInput(input, existing, licenseId) {
  const hasChannel = Object.prototype.hasOwnProperty.call(input, "acquisitionChannel");
  const requested = toText(input.acquisitionChannel).trim();
  const channel = hasChannel
    ? requested
    : existing?.acquisitionChannel || normalizeAcquisitionChannel("", licenseId);
  const detail = Object.prototype.hasOwnProperty.call(input, "acquisitionDetail")
    ? normalizeAcquisitionDetail(input.acquisitionDetail)
    : existing?.acquisitionDetail || "";
  const isNewUnknown = !existing && channel === "unknown";
  const invalidDetail = toText(input.acquisitionDetail).trim().length > 120;
  if (!ACQUISITION_CHANNELS.has(channel) || isNewUnknown || invalidDetail || (channel === "other" && !detail)) {
    return { ok: false, channel: "unknown", detail: "" };
  }
  return { ok: true, channel, detail };
}

function normalizeAcquisitionChannel(value, licenseId = "") {
  const channel = toText(value).trim();
  if (ACQUISITION_CHANNELS.has(channel)) {
    return channel;
  }
  return /^xhs-/i.test(toText(licenseId).trim()) ? "xiaohongshu" : "unknown";
}

function normalizeAcquisitionDetail(value) {
  return toText(value).trim().slice(0, 120);
}

function normalizeIsoTimestamp(value) {
  const text = toText(value).trim();
  return text && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : "";
}

function serializeLicenseForStorage(license, overrides = {}) {
  const value = { ...license, ...overrides };
  return {
    licenseId: value.licenseId,
    acquisitionChannel: normalizeAcquisitionChannel(value.acquisitionChannel, value.licenseId),
    acquisitionDetail: normalizeAcquisitionDetail(value.acquisitionDetail),
    allowedEditions: normalizeAllowedEditions(value.allowedEditions),
    status: value.status,
    expiresAt: value.expiresAt || "",
    maxDevices: value.maxDevices || DEFAULT_MAX_DEVICES,
    aiEnabled: Boolean(value.aiEnabled),
    aiExpiresAt: value.aiExpiresAt || "",
    aiDailyLimit: value.aiDailyLimit || DEFAULT_AI_DAILY_LIMIT,
    productCodeSecret: value.productCodeSecret || "",
    devices: normalizeLicenseDevices(value.devices),
    createdAt: normalizeIsoTimestamp(value.createdAt),
    updatedAt: normalizeIsoTimestamp(value.updatedAt),
  };
}

async function persistLicenseRecord(license, env, overrides = {}) {
  await env.SEAT_MANAGER_KV.put(
    license.storageKey,
    JSON.stringify(serializeLicenseForStorage(license, overrides)),
  );
}

function serializeLicenseForAdmin(license) {
  if (!license) {
    return null;
  }
  return {
    licenseKey: license.storageKey,
    codeHash: license.storageKey.replace(LICENSE_KEY_PREFIX, ""),
    licenseId: license.licenseId,
    acquisitionChannel: license.acquisitionChannel,
    acquisitionDetail: license.acquisitionDetail,
    allowedEditions: license.allowedEditions,
    status: license.status,
    expiresAt: license.expiresAt || "",
    maxDevices: license.maxDevices || DEFAULT_MAX_DEVICES,
    aiEnabled: Boolean(license.aiEnabled),
    aiExpiresAt: license.aiExpiresAt || "",
    aiDailyLimit: license.aiDailyLimit || DEFAULT_AI_DAILY_LIMIT,
    productCodeSecret: license.productCodeSecret || "",
    deviceCount: license.devices.length,
    devices: license.devices,
    createdAt: license.createdAt || "",
    updatedAt: license.updatedAt || "",
  };
}

function normalizeProductCodeSecret(value) {
  const secret = toText(value).trim();
  if (!secret || secret.length > 1000) {
    return "";
  }
  return secret;
}

function normalizeEdition(value) {
  const edition = toText(value).trim();
  return edition === "zhang" || edition === "commercial" ? edition : "";
}

function normalizeAllowedEditions(value) {
  const values = Array.isArray(value) ? value : DEFAULT_ALLOWED_EDITIONS;
  const normalized = [...new Set(values.map(normalizeEdition).filter(Boolean))];
  return normalized.length ? normalized : [...DEFAULT_ALLOWED_EDITIONS];
}

function normalizeIsoDateInput(value) {
  const text = toText(value).trim();
  if (!text) {
    return "";
  }
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  return new Date(timestamp).toISOString();
}

function getLicenseKey(codeHash) {
  return `${LICENSE_KEY_PREFIX}${codeHash}`;
}

function getLicensedSyncStateKey(licenseId) {
  return `${LICENSE_KEY_PREFIX}${licenseId}${LICENSE_SYNC_STATE_SUFFIX}`;
}

function sanitizeLicenseId(value) {
  return toText(value).trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
}

function normalizeMaxDevices(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_MAX_DEVICES;
  }
  return Math.max(1, Math.min(10, Math.trunc(number)));
}

function normalizeAiDailyLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return DEFAULT_AI_DAILY_LIMIT;
  }
  return Math.max(1, Math.min(500, Math.trunc(number)));
}

function parseBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  const text = toText(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(text)) {
    return false;
  }
  return fallback;
}

function normalizeLicenseDevices(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((device) => {
      if (!device || typeof device !== "object") {
        return null;
      }
      const id = toText(device.id).slice(0, 120);
      if (!id) {
        return null;
      }
      return {
        id,
        name: toText(device.name || "").slice(0, 80) || "未知设备",
        firstSeenAt: toText(device.firstSeenAt || ""),
        lastSeenAt: toText(device.lastSeenAt || ""),
      };
    })
    .filter(Boolean);
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

function isValidTrendPayload(payload) {
  return (
    payload &&
    payload.student === "学生A" &&
    Array.isArray(payload.recentExams) &&
    payload.recentExams.length > 0 &&
    payload.recentExams.length <= 40
  );
}

function isValidClassPayload(payload) {
  return (
    payload &&
    payload.className === "本班" &&
    Number.isInteger(payload.studentCount) &&
    Number.isInteger(payload.comparedStudentCount) &&
    Array.isArray(payload.focusCandidates) &&
    payload.focusCandidates.length > 0 &&
    payload.focusCandidates.length <= 30
  );
}

function isValidAssistantPayload(payload) {
  const context = payload?.context;
  const baseContext = context?.baseContext && typeof context.baseContext === "object" ? context.baseContext : context;
  return (
    payload &&
    typeof payload === "object" &&
    Array.isArray(payload.messages) &&
    payload.messages.length > 0 &&
    payload.messages.length <= 20 &&
    payload.messages.every((message) => (
      message &&
      (message.role === "user" || message.role === "assistant") &&
      typeof message.content === "string" &&
      message.content.trim().length > 0 &&
      message.content.length <= 2000
    )) &&
    context &&
    typeof context === "object" &&
    Number.isInteger(baseContext?.studentCount) &&
    baseContext.studentCount >= 0
  );
}

function isValidScoreMappingPayload(payload) {
  return (
    payload &&
    Array.isArray(payload.headers) &&
    payload.headers.length > 0 &&
    payload.headers.length <= 80 &&
    Array.isArray(payload.sampleRows) &&
    payload.sampleRows.length <= 80 &&
    Array.isArray(payload.knownSubjects)
  );
}

function isValidRosterMappingPayload(payload) {
  return (
    payload &&
    Array.isArray(payload.headers) &&
    payload.headers.length > 0 &&
    payload.headers.length <= 80 &&
    Array.isArray(payload.sampleRows) &&
    payload.sampleRows.length <= 80
  );
}

function isValidStudentCommentPayload(payload) {
  const context = payload?.context;
  const student = context?.student;
  const length = getStudentCommentLengthSettings(payload);
  return (
    payload &&
    typeof payload === "object" &&
    Boolean(toText(payload.studentId)) &&
    ["warm", "formal", "brief"].includes(payload.style) &&
    Boolean(length) &&
    context &&
    typeof context === "object" &&
    student &&
    typeof student === "object" &&
    Boolean(toText(student.name)) &&
    Array.isArray(context.tags) &&
    context.tags.length <= 20 &&
    Array.isArray(context.strengths) &&
    Array.isArray(context.weaknesses)
  );
}

function isValidCommentRefinementPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    toText(payload.studentId) &&
    ["polish", "specific", "shorten"].includes(payload.action) &&
    typeof payload.selectedText === "string" &&
    payload.selectedText.trim().length > 0 &&
    payload.selectedText.length <= 600 &&
    typeof payload.contextBefore === "string" &&
    payload.contextBefore.length <= 600 &&
    typeof payload.contextAfter === "string" &&
    payload.contextAfter.length <= 600
  );
}

function isValidStudentFollowupPayload(payload) {
  const context = payload?.context;
  const student = context?.student;
  return (
    payload &&
    typeof payload === "object" &&
    Boolean(toText(payload.studentId)) &&
    context &&
    typeof context === "object" &&
    student &&
    typeof student === "object" &&
    Boolean(toText(student.name)) &&
    Array.isArray(context.exams) &&
    context.exams.length <= 40 &&
    Array.isArray(context.tags) &&
    context.tags.length <= 20 &&
    (!payload.seatContext || typeof payload.seatContext === "object")
  );
}

function isValidWeeklyDraftPayload(payload) {
  return Boolean(payload && typeof payload === "object" && ["class", "student"].includes(payload.scope) && toText(payload.subjectName) && toText(payload.startDate) && toText(payload.endDate) && Array.isArray(payload.facts) && payload.facts.length > 0 && payload.facts.length <= 20 && payload.facts.every(item => typeof item === "string" && item.length <= 300) && typeof payload.localDraft === "string" && payload.localDraft.length <= 6000);
}

function isValidScoreItemPayload(payload) {
  return Boolean(payload && typeof payload === "object" && payload.exam && typeof payload.exam === "object" && toText(payload.exam.id) && Array.isArray(payload.questions) && payload.questions.length > 0 && payload.questions.length <= 100 && payload.questions.every(item => item && typeof item === "object" && toText(item.id) && Number.isFinite(Number(item.rate)) && Number(item.rate) >= 0 && Number(item.rate) <= 100 && Array.isArray(item.weakStudentIds) && item.weakStudentIds.length <= 12));
}

function getStudentCommentLengthSettings(payload) {
  const mode = toText(payload?.commentLengthMode || "standard");
  const customTarget = Math.round(Number(payload?.targetWordCount));
  if (mode === "short") {
    return { mode, instruction: "80 到 100 字", maxChars: 130 };
  }
  if (mode === "standard") {
    return { mode, instruction: "100 到 150 字", maxChars: 180 };
  }
  if (mode === "long") {
    return { mode, instruction: "150 到 200 字", maxChars: 230 };
  }
  if (mode === "custom" && Number.isFinite(customTarget) && customTarget >= 50 && customTarget <= 300) {
    return { mode, instruction: `约 ${customTarget} 字，允许上下浮动 15 字`, maxChars: Math.min(330, customTarget + 35) };
  }
  return null;
}

function getStudentCommentMissingInfo(context) {
  const missing = [];
  if (!context?.latestExam) {
    missing.push("最近考试成绩");
  }
  if (!context?.trend || Number(context.trend.examCount) < 2) {
    missing.push("多次考试趋势");
  }
  if (!Array.isArray(context?.tags) || !context.tags.length) {
    missing.push("学生标签");
  }
  if (!toText(context?.teacherNote)) {
    missing.push("教师补充评价");
  }
  return missing;
}

function parseModelJson(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch (nestedError) {
      return null;
    }
  }
}

function sanitizeAiResult(result) {
  return {
    overall: toText(result.overall),
    changes: toText(result.changes),
    suggestions: toText(result.suggestions),
    disclaimer: toText(result.disclaimer) || "AI 内容仅供参考，请结合实际课堂观察判断。"
  };
}

function sanitizeClassAiResult(result) {
  return {
    overall: toText(result.overall),
    classChanges: toText(result.classChanges || result.changes),
    focusStudents: toText(result.focusStudents),
    suggestions: toText(result.suggestions),
    disclaimer: toText(result.disclaimer) || "AI 内容仅供参考，请结合实际课堂观察判断。"
  };
}

function sanitizeAssistantResult(result) {
  const prompts = Array.isArray(result.suggestedPrompts)
    ? result.suggestedPrompts.map((item) => toAssistantPlainText(item, 120)).filter(Boolean).slice(0, 4)
    : [];
  return {
    message: toAssistantPlainText(result.message || result.answer || result.content, 2400),
    disclaimer: toAssistantPlainText(result.disclaimer, 200) || "AI 内容仅供教师参考，请结合实际课堂观察判断。",
    suggestedPrompts: prompts
  };
}

function sanitizeStudentFollowupResult(result) {
  const toList = (value, limit) => {
    const raw = Array.isArray(value)
      ? value
      : typeof value === "string"
        ? value.split(/\n|；|;/)
        : [];
    return raw
      .map((item) => toAssistantPlainText(item, 180))
      .filter(Boolean)
      .slice(0, limit);
  };
  const actions = toList(result.actions, 3);
  return {
    summary: toAssistantPlainText(result.summary || result.overall, 360),
    riskSignals: toList(result.riskSignals || result.risks, 5),
    strengths: toList(result.strengths, 5),
    actions,
    parentMessageDraft: toAssistantPlainText(result.parentMessageDraft || result.parentMessage, 700),
    commentMaterials: toList(result.commentMaterials || result.materials, 6),
    disclaimer: toAssistantPlainText(result.disclaimer, 200) || "AI 跟进建议仅供教师参考，请结合课堂观察判断。"
  };
}

function sanitizeWeeklyDraftResult(result) {
  const list = (value, max = 6) => Array.isArray(value) ? value.map(toText).filter(Boolean).slice(0, max) : [];
  return { title: toText(result.title).slice(0, 80) || "周报", content: toText(result.content).slice(0, 6000), highlights: list(result.highlights), cautions: list(result.cautions), disclaimer: toText(result.disclaimer).slice(0, 300) || "AI 内容仅供教师确认后使用。" };
}

function sanitizeScoreItemResult(result, payload) {
  const list = (value, max = 8) => Array.isArray(value) ? value.map(toText).filter(Boolean).slice(0, max) : [];
  const allowedIds = new Set(payload.questions.flatMap(item => Array.isArray(item.weakStudentIds) ? item.weakStudentIds.map(toText) : []));
  const followupCandidates = Array.isArray(result.followupCandidates) ? result.followupCandidates.flatMap(item => {
    const studentId = toText(item?.studentId);
    return studentId && allowedIds.has(studentId) ? [{ studentId, reason: toText(item?.reason).slice(0, 240) || "题目分析建议跟进" }] : [];
  }).slice(0, 12) : [];
  return { overview: toText(result.overview).slice(0, 1600), weakPoints: list(result.weakPoints), teachingSuggestions: list(result.teachingSuggestions), followupCandidates, disclaimer: toText(result.disclaimer).slice(0, 300) || "AI 分析仅供教师参考。" };
}

function sanitizeScoreMappingResult(result, payload) {
  const maxIndex = payload.headers.length - 1;
  const safeIndex = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxIndex ? parsed : -1;
  };
  const knownSubjects = new Set(payload.knownSubjects || []);
  const subjectMappings = Array.isArray(result.subjectMappings)
    ? result.subjectMappings
        .map((item) => ({
          subject: knownSubjects.has(item?.subject) ? item.subject : "",
          scoreCol: safeIndex(item?.scoreCol),
          rankClassCol: safeIndex(item?.rankClassCol),
          rankSchoolCol: safeIndex(item?.rankSchoolCol)
        }))
        .filter((item) => item.subject && item.scoreCol !== -1)
        .slice(0, 12)
    : [];
  return {
    nameCol: safeIndex(result.nameCol),
    subjectMappings,
    totalMapping: {
      scoreCol: safeIndex(result.totalMapping?.scoreCol),
      rankClassCol: safeIndex(result.totalMapping?.rankClassCol),
      rankSchoolCol: safeIndex(result.totalMapping?.rankSchoolCol)
    },
    note: toText(result.note || result.reason || "AI 已生成映射建议")
  };
}

function sanitizeRosterMappingResult(result, payload) {
  const maxIndex = payload.headers.length - 1;
  const safeIndex = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxIndex ? parsed : -1;
  };
  return {
    nameCol: safeIndex(result.nameCol),
    studentNoCol: safeIndex(result.studentNoCol),
    genderCol: safeIndex(result.genderCol),
    rowCol: safeIndex(result.rowCol),
    colCol: safeIndex(result.colCol),
    hasHeader: result.hasHeader !== false,
    note: toText(result.note || result.reason || "AI 已生成名单映射建议")
  };
}

function sanitizeStudentCommentResult(result, fallbackMissingInfo = [], lengthSettings = null) {
  const rawComment = String(toText(result.comment) || "").replace(/\s+/g, "");
  const comment = rawComment.slice(0, lengthSettings?.maxChars || 180);
  const missingInfo = Array.isArray(result.missingInfo)
    ? result.missingInfo.map((item) => toText(item)).filter(Boolean).slice(0, 6)
    : fallbackMissingInfo;
  return {
    comment,
    needsMoreInfo: Boolean(result.needsMoreInfo) || !comment,
    missingInfo
  };
}

function sanitizeCommentRefinementResult(result) {
  return String(result?.replacement || "")
    .replace(/^\s*[“\"']|[”\"']\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 800);
}

function toText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).slice(0, 8);
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .map(([key, item]) => {
        const text = toText(item);
        return text ? `${key}：${Array.isArray(text) ? text.join("；") : text}` : "";
      })
      .filter(Boolean)
      .slice(0, 8);
  }
  return String(value || "").trim().slice(0, 800);
}

function toAssistantText(value, limit = 800) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, limit);
}

function toAssistantPlainText(value, limit = 800) {
  return toAssistantText(value, limit)
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function trimAssistantComparisonContext(context) {
  if (!context || typeof context !== "object") {
    return null;
  }
  const packs = Array.isArray(context.comparisonPacks)
    ? context.comparisonPacks.map((pack) => ({
        kind: ["class_term", "subject_term", "student_term", "candidate_students", "notice"].includes(pack?.kind) ? pack.kind : "notice",
        title: toAssistantText(pack?.title, 80),
        reason: toAssistantText(pack?.reason, 160),
        items: Array.isArray(pack?.items)
          ? pack.items.map((item) => ({
              name: toAssistantText(item?.name, 40),
              summary: toAssistantText(item?.summary, 220),
              current: toAssistantText(item?.current, 220),
              compare: toAssistantText(item?.compare, 220),
              trend: Number.isFinite(Number(item?.trend)) ? Number(item.trend) : null,
              subjects: Array.isArray(item?.subjects) ? item.subjects.map((value) => toAssistantText(value, 60)).filter(Boolean).slice(0, 10) : [],
              exams: Array.isArray(item?.exams) ? item.exams.map((value) => toAssistantText(value, 160)).filter(Boolean).slice(0, 12) : []
            })).slice(0, pack?.kind === "candidate_students" ? 30 : 8)
          : []
      })).filter((pack) => pack.title && pack.items.length).slice(0, 4)
    : [];
  return {
    currentScope: {
      className: toAssistantText(context.currentScope?.className, 80),
      termLabel: toAssistantText(context.currentScope?.termLabel, 80)
    },
    compareScope: context.compareScope && typeof context.compareScope === "object" ? {
      className: toAssistantText(context.compareScope.className, 80),
      termLabel: toAssistantText(context.compareScope.termLabel, 80)
    } : null,
    notice: toAssistantText(context.notice, 180),
    comparisonPacks: packs
  };
}

function trimStudentFollowupPayload(payload) {
  const context = payload.context || {};
  const trimExam = (exam) => ({
    name: toAssistantText(exam?.name, 80),
    date: toAssistantText(exam?.date, 40),
    period: ["oldest", "middle", "latest"].includes(exam?.period) ? exam.period : "",
    totalScore: Number.isFinite(Number(exam?.totalScore)) ? Number(exam.totalScore) : null,
    classRank: Number.isFinite(Number(exam?.classRank)) ? Number(exam.classRank) : null,
    subjects: Array.isArray(exam?.subjects)
      ? exam.subjects.map((item) => ({
          subject: toAssistantText(item?.subject, 30),
          score: Number.isFinite(Number(item?.score)) ? Number(item.score) : null
        })).filter((item) => item.subject).slice(0, 12)
      : [],
    zeroSubjects: Array.isArray(exam?.zeroSubjects) ? exam.zeroSubjects.map((item) => toAssistantText(item, 30)).filter(Boolean).slice(0, 8) : []
  });
  return {
    student: {
      name: toAssistantText(payload.studentName || context.student?.name || "学生", 40)
    },
    scenario: ["detail", "grade", "seat", "comment"].includes(payload.scenario) ? payload.scenario : "detail",
    context: {
      latestExam: context.latestExam ? trimExam(context.latestExam) : null,
      exams: Array.isArray(context.exams) ? context.exams.map(trimExam).slice(-12) : [],
      trend: {
        examCount: Number(context.trend?.examCount) || 0,
        totalScoreChange: Number.isFinite(Number(context.trend?.totalScoreChange)) ? Number(context.trend.totalScoreChange) : null,
        classRankChange: Number.isFinite(Number(context.trend?.classRankChange)) ? Number(context.trend.classRankChange) : null,
        changedSubjects: Array.isArray(context.trend?.changedSubjects)
          ? context.trend.changedSubjects.map((item) => ({
              subject: toAssistantText(item?.subject, 30),
              diff: Number.isFinite(Number(item?.diff)) ? Number(item.diff) : null
            })).filter((item) => item.subject).slice(0, 8)
          : [],
        summary: toAssistantText(context.trend?.summary, 260)
      },
      strengths: Array.isArray(context.strengths) ? context.strengths.map((item) => toAssistantText(item, 40)).filter(Boolean).slice(0, 6) : [],
      weaknesses: Array.isArray(context.weaknesses) ? context.weaknesses.map((item) => toAssistantText(item, 40)).filter(Boolean).slice(0, 6) : [],
      tags: Array.isArray(context.tags) ? context.tags.map((item) => toAssistantText(item, 60)).filter(Boolean).slice(0, 16) : [],
      records: Array.isArray(context.records) ? context.records.map((item) => toAssistantText(item, 160)).filter(Boolean).slice(0, 10) : [],
      dormitory: toAssistantText(context.dormitory, 160),
      commentProfile: {
        criteriaSummary: Array.isArray(context.commentProfile?.criteriaSummary) ? context.commentProfile.criteriaSummary.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 8) : [],
        customOptions: Array.isArray(context.commentProfile?.customOptions) ? context.commentProfile.customOptions.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 8) : [],
        teacherNote: toAssistantText(context.commentProfile?.teacherNote || payload.teacherNote, 240)
      }
    },
    seatContext: {
      seatLabel: toAssistantText(payload.seatContext?.seatLabel, 40),
      deskMateName: toAssistantText(payload.seatContext?.deskMateName, 40),
      nearbyNames: Array.isArray(payload.seatContext?.nearbyNames) ? payload.seatContext.nearbyNames.map((item) => toAssistantText(item, 40)).filter(Boolean).slice(0, 6) : []
    },
    requirements: payload.requirements || {}
  };
}

function trimAssistantContext(context) {
  const base = context?.baseContext && typeof context.baseContext === "object" ? context.baseContext : context;
  return {
    baseContext: {
      className: toAssistantText(base.className, 80),
      termLabel: toAssistantText(base.termLabel, 80),
      studentCount: Number(base.studentCount) || 0,
      seatCount: Number(base.seatCount) || 0,
      latestExam: base.latestExam && typeof base.latestExam === "object" ? {
        name: toAssistantText(base.latestExam.name, 80),
        date: toAssistantText(base.latestExam.date, 40),
        studentCount: Number(base.latestExam.studentCount) || 0,
        subjectCount: Number(base.latestExam.subjectCount) || 0,
        averageTotal: Number.isFinite(Number(base.latestExam.averageTotal)) ? Number(base.latestExam.averageTotal) : null
      } : null,
      examInsights: Array.isArray(base.examInsights) ? base.examInsights.map((item) => toAssistantText(item, 180)).filter(Boolean).slice(0, 8) : [],
      gradeTrend: Array.isArray(base.gradeTrend) ? base.gradeTrend.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 8) : [],
      focusStudents: Array.isArray(base.focusStudents)
        ? base.focusStudents.map((student) => ({
            name: toAssistantText(student?.name, 40),
            category: toAssistantText(student?.category, 40),
            latestTotal: Number.isFinite(Number(student?.latestTotal)) ? Number(student.latestTotal) : null,
            reasons: Array.isArray(student?.reasons) ? student.reasons.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 3) : [],
            tags: Array.isArray(student?.tags) ? student.tags.map((item) => toAssistantText(item, 40)).filter(Boolean).slice(0, 6) : []
          })).filter((student) => student.name).slice(0, 14)
        : [],
      tagSummary: Array.isArray(base.tagSummary) ? base.tagSummary.map((item) => toAssistantText(item, 80)).filter(Boolean).slice(0, 10) : [],
      recordSummary: Array.isArray(base.recordSummary) ? base.recordSummary.map((item) => toAssistantText(item, 140)).filter(Boolean).slice(0, 8) : [],
      seatSummary: toAssistantText(base.seatSummary, 120),
      dormitorySummary: Array.isArray(base.dormitorySummary) ? base.dormitorySummary.map((item) => toAssistantText(item, 120)).filter(Boolean).slice(0, 8) : [],
      fundSummary: toAssistantText(base.fundSummary, 160)
    },
    contextPacks: Array.isArray(context?.contextPacks)
      ? context.contextPacks.map((pack) => ({
          kind: ["student", "candidate_students", "exam", "dormitory", "tag", "records", "fund"].includes(pack?.kind) ? pack.kind : "records",
          title: toAssistantText(pack?.title, 80),
          reason: toAssistantText(pack?.reason, 160),
          items: Array.isArray(pack?.items)
            ? pack.items.map((item) => ({
                name: toAssistantText(item?.name, 40),
                category: toAssistantText(item?.category, 40),
                summary: toAssistantText(item?.summary, 180),
                latestExam: toAssistantText(item?.latestExam, 80),
                latestTotal: Number.isFinite(Number(item?.latestTotal)) ? Number(item.latestTotal) : null,
                previousTotal: Number.isFinite(Number(item?.previousTotal)) ? Number(item.previousTotal) : null,
                trend: Number.isFinite(Number(item?.trend)) ? Number(item.trend) : null,
                latestScores: Array.isArray(item?.latestScores) ? item.latestScores.map((value) => toAssistantText(value, 40)).filter(Boolean).slice(0, 10) : [],
                weakSubjects: Array.isArray(item?.weakSubjects) ? item.weakSubjects.map((value) => toAssistantText(value, 60)).filter(Boolean).slice(0, 3) : [],
                exams: Array.isArray(item?.exams) ? item.exams.map((value) => toAssistantText(value, 180)).filter(Boolean).slice(0, 40) : [],
                records: Array.isArray(item?.records) ? item.records.map((value) => toAssistantText(value, 140)).filter(Boolean).slice(0, 8) : [],
                tags: Array.isArray(item?.tags) ? item.tags.map((value) => toAssistantText(value, 40)).filter(Boolean).slice(0, 8) : [],
                dormitory: toAssistantText(item?.dormitory, 80),
                members: Array.isArray(item?.members) ? item.members.map((value) => toAssistantText(value, 40)).filter(Boolean).slice(0, 12) : [],
                events: Array.isArray(item?.events) ? item.events.map((value) => toAssistantText(value, 140)).filter(Boolean).slice(0, 8) : []
              })).slice(0, 20)
            : []
        })).filter((pack) => pack.title && pack.items.length).slice(0, 6)
      : [],
    comparisonContext: trimAssistantComparisonContext(context?.comparisonContext)
  };
}
import { dispatchWorkerRequest } from "./worker-router.js";
import { getCorsHeaders, jsonResponse } from "./worker-response.js";
import { allowAuthAttempt, consumeAiUsage } from "./worker-usage.js";
import { getBearerToken, sha256Hex, signToken, timingSafeEqual, verifyToken } from "./worker-auth.js";
import { createAiPostRoutes } from "./routes/ai-routes.js";
import { createLicensePostRoutes } from "./routes/license-routes.js";
import { createSyncRouteHandler } from "./routes/sync-routes.js";
