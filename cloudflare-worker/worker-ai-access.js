import { jsonResponse } from "./worker-response.js";
import { allowAuthAttempt, consumeAiUsage } from "./worker-usage.js";
import { SESSION_TOKEN_TTL_MS, sha256Hex, signToken, timingSafeEqual, verifyToken } from "./worker-auth.js";
import { readJsonBody } from "./worker-input.js";
import { DEFAULT_AI_DAILY_LIMIT, loadLicenseRecordByKey } from "./worker-license-store.js";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function verifyAiRequest(token, env) {
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

export async function getAiLimitResponse(env, verified, corsHeaders) {
  const usage = await consumeAiUsage(env, verified);
  return usage.allowed ? null : usage.reason === "store_failed" ? jsonResponse({ error: "service_unavailable" }, 503, corsHeaders) : jsonResponse({ error: "rate_limited" }, 429, corsHeaders);
}

export async function handleAuth(request, env, corsHeaders) {
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
