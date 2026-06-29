const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 20 * 1024;
const SYNC_MAX_BODY_BYTES = 5 * 1024 * 1024;
const DAILY_LIMIT = 100;
const MODEL = "deepseek-v4-flash";
const SYNC_STATE_KEY = "seat-manager:single-teacher:state";
const LICENSE_KEY_PREFIX = "seat-manager:license:";
const LICENSE_SYNC_STATE_SUFFIX = ":state";
const DEFAULT_MAX_DEVICES = 3;
const DEFAULT_AI_DAILY_LIMIT = 30;

const dailyUsage = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = getCorsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    if (url.pathname.startsWith("/sync/")) {
      return handleSyncRoute(request, env, corsHeaders, url.pathname);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    }

    if (url.pathname === "/license/auth") {
      return handleLicenseAuth(request, env, corsHeaders);
    }
    if (url.pathname === "/license/unbind-device") {
      return handleLicenseUnbindDevice(request, env, corsHeaders);
    }
    if (url.pathname === "/auth") {
      return handleAuth(request, env, corsHeaders);
    }
    if (url.pathname === "/analyze-trend") {
      return handleAnalyzeTrend(request, env, corsHeaders);
    }
    if (url.pathname === "/analyze-class") {
      return handleAnalyzeClass(request, env, corsHeaders);
    }
    if (url.pathname === "/generate-comment") {
      return handleGenerateStudentComment(request, env, corsHeaders);
    }
    if (url.pathname === "/suggest-score-mapping") {
      return handleSuggestScoreMapping(request, env, corsHeaders);
    }
    return jsonResponse({ error: "not_found" }, 404, corsHeaders);
  }
};

async function handleLicenseAuth(request, env, corsHeaders) {
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
  }, tokenSecret);
  return jsonResponse({
    token,
    expiresAt,
    licenseId: license.licenseId,
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
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT };
  }

  if (env.TOKEN_SECRET) {
    const aiToken = await verifyToken(token, env.TOKEN_SECRET);
    if (aiToken && aiToken.exp > Date.now() && aiToken.scope === "ai-trend") {
      return { ok: true, dailyLimit: DEFAULT_AI_DAILY_LIMIT };
    }
  }

  const productSecret = env.PRODUCT_TOKEN_SECRET || env.TOKEN_SECRET;
  if (!productSecret || !env.SEAT_MANAGER_KV) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT };
  }
  const productToken = await verifyToken(token, productSecret);
  if (
    !productToken ||
    productToken.exp <= Date.now() ||
    productToken.scope !== "product-access" ||
    !productToken.licenseKey
  ) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT };
  }

  const license = await loadLicenseRecordByKey(productToken.licenseKey, env);
  if (!license || license.status !== "active") {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT };
  }
  if (license.expiresAt && Date.parse(license.expiresAt) <= Date.now()) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT };
  }
  if (!license.aiEnabled) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT };
  }
  if (license.aiExpiresAt && Date.parse(license.aiExpiresAt) <= Date.now()) {
    return { ok: false, dailyLimit: DEFAULT_AI_DAILY_LIMIT };
  }
  return { ok: true, dailyLimit: license.aiDailyLimit || DEFAULT_AI_DAILY_LIMIT };
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

  if (isOverDailyLimit(token, verified.dailyLimit)) {
    return jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
  }

  const body = await readJsonBody(request);
  if (!body.ok || !isValidTrendPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }

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
              "你是谨慎的教师助手。只根据提供的匿名成绩摘要生成温和、可参考的趋势建议，不做绝对判断。recentExams 按考试先后从早到晚排列，最后一项是最新考试；所有升降必须用最新考试减最早考试判断，不要把顺序反过来。必须返回 JSON，字段为 overall、changes、suggestions、disclaimer。"
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

  if (isOverDailyLimit(token, verified.dailyLimit)) {
    return jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
  }

  const body = await readJsonBody(request);
  if (!body.ok || !isValidClassPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }

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
              "你是谨慎的班主任成绩分析助手。只根据提供的全班成绩变化摘要，概括班级趋势，并指出需要教师重点关注的学生。必须返回 JSON，字段为 overall、classChanges、focusStudents、suggestions、disclaimer。focusStudents 必须逐行列出，格式为“姓名（简短原因）”，原因控制在 12 个字以内，例如“化学下降26”或“排名退步35”。"
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

async function handleSuggestScoreMapping(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  if (isOverDailyLimit(token, verified.dailyLimit)) {
    return jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
  }

  const body = await readJsonBody(request);
  if (!body.ok || !isValidScoreMappingPayload(body.value)) {
    return jsonResponse({ error: "bad_request" }, 400, corsHeaders);
  }

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

async function handleGenerateStudentComment(request, env, corsHeaders) {
  if (!env.DEEPSEEK_API_KEY || (!env.TOKEN_SECRET && !env.PRODUCT_TOKEN_SECRET)) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = await verifyAiRequest(token, env);
  if (!verified.ok) {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }
  if (isOverDailyLimit(token, verified.dailyLimit)) {
    return jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
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
              `你是谨慎的班主任评语助手。只根据用户提供的单个学生信息、成绩摘要、标签、评语工作台素材 commentProfile 和教师补充评价写期末评语。禁止编造未提供事实，禁止夸大或做医学/心理诊断。语言自然，不模板化，适合作为期末评语，兼具鼓励和建设性提醒。可以综合标准选择和自定义素材，但不要机械罗列所有选项。必须返回 JSON，字段为 comment、needsMoreInfo、missingInfo。comment 必须是中文，目标长度为${commentLength.instruction}。若信息不足，needsMoreInfo 为 true，missingInfo 说明需要补充哪些信息，comment 可以为空。`
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
    status: "active",
    expiresAt: "",
    maxDevices: normalizeMaxDevices(env.PRODUCT_MAX_DEVICES),
    aiEnabled: parseBoolean(env.PRODUCT_AI_ENABLED, false),
    aiExpiresAt: toText(env.PRODUCT_AI_EXPIRES_AT || ""),
    aiDailyLimit: normalizeAiDailyLimit(env.PRODUCT_AI_DAILY_LIMIT),
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
    status: toText(record.status || "active") || "active",
    expiresAt: toText(record.expiresAt || ""),
    maxDevices: normalizeMaxDevices(record.maxDevices),
    aiEnabled: parseBoolean(record.aiEnabled, false),
    aiExpiresAt: toText(record.aiExpiresAt || ""),
    aiDailyLimit: normalizeAiDailyLimit(record.aiDailyLimit),
    devices: normalizeLicenseDevices(record.devices),
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
    await env.SEAT_MANAGER_KV.put(license.storageKey, JSON.stringify({
      licenseId: license.licenseId,
      status: license.status,
      expiresAt: license.expiresAt || "",
      maxDevices,
      aiEnabled: Boolean(license.aiEnabled),
      aiExpiresAt: license.aiExpiresAt || "",
      aiDailyLimit: license.aiDailyLimit || DEFAULT_AI_DAILY_LIMIT,
      devices,
      updatedAt: now,
    }));
  }
  return { ok: true, maxDevices };
}

async function unbindLicenseDevice(license, deviceId, env) {
  const now = new Date().toISOString();
  const devices = license.devices.filter((device) => device.id !== deviceId);
  const removed = devices.length !== license.devices.length;
  if (env.SEAT_MANAGER_KV && license.storageKey) {
    await env.SEAT_MANAGER_KV.put(license.storageKey, JSON.stringify({
      licenseId: license.licenseId,
      status: license.status,
      expiresAt: license.expiresAt || "",
      maxDevices: license.maxDevices || DEFAULT_MAX_DEVICES,
      aiEnabled: Boolean(license.aiEnabled),
      aiExpiresAt: license.aiExpiresAt || "",
      aiDailyLimit: license.aiDailyLimit || DEFAULT_AI_DAILY_LIMIT,
      devices,
      updatedAt: now,
    }));
  }
  return removed;
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
    payload.recentExams.length <= 6
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

function isValidScoreMappingPayload(payload) {
  return (
    payload &&
    Array.isArray(payload.headers) &&
    payload.headers.length > 0 &&
    payload.headers.length <= 80 &&
    Array.isArray(payload.sampleRows) &&
    payload.sampleRows.length <= 10 &&
    Array.isArray(payload.knownSubjects)
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

function getCorsHeaders(origin, env) {
  const defaultAllowed = "https://charlie-hong-smu.github.io";
  const allowedList = String(env.ALLOWED_ORIGIN || defaultAllowed)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const localhostAllowed = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const allowOrigin = allowedList.includes("*")
    ? origin || "*"
    : allowedList.includes(origin) || localhostAllowed
      ? origin
      : defaultAllowed;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json"
  };
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

function getBearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function signToken(payload, secret) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

async function verifyToken(token, secret) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }
  const expected = await hmacSha256(encodedPayload, secret);
  if (!timingSafeEqual(signature, expected)) {
    return null;
  }
  try {
    return JSON.parse(base64UrlDecode(encodedPayload));
  } catch (error) {
    return null;
  }
}

async function hmacSha256(message, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function timingSafeEqual(a, b) {
  if (!a || !b || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isOverDailyLimit(token, limit = DAILY_LIMIT) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${token.slice(-18)}`;
  const used = dailyUsage.get(key) || 0;
  dailyUsage.set(key, used + 1);
  return used >= limit;
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
