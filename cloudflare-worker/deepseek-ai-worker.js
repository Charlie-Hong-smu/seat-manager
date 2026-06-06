const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 20 * 1024;
const DAILY_LIMIT = 100;
const MODEL = "deepseek-v4-flash";

const dailyUsage = new Map();

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const corsHeaders = getCorsHeaders(origin, env);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
    }

    const url = new URL(request.url);
    if (url.pathname === "/auth") {
      return handleAuth(request, env, corsHeaders);
    }
    if (url.pathname === "/analyze-trend") {
      return handleAnalyzeTrend(request, env, corsHeaders);
    }
    return jsonResponse({ error: "not_found" }, 404, corsHeaders);
  }
};

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
  if (!env.DEEPSEEK_API_KEY || !env.TOKEN_SECRET) {
    return jsonResponse({ error: "service_unavailable" }, 503, corsHeaders);
  }

  const token = getBearerToken(request);
  const verified = token ? await verifyToken(token, env.TOKEN_SECRET) : null;
  if (!verified || verified.exp <= Date.now() || verified.scope !== "ai-trend") {
    return jsonResponse({ error: "unauthorized" }, 401, corsHeaders);
  }

  if (isOverDailyLimit(token)) {
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
              "你是谨慎的教师助手。只根据提供的匿名成绩摘要生成温和、可参考的趋势建议，不做绝对判断。必须返回 JSON，字段为 overall、changes、suggestions、disclaimer。"
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

async function readJsonBody(request) {
  const clone = request.clone();
  const text = await clone.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return { ok: false };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false };
  }
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

function getCorsHeaders(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || "*";
  const allowOrigin = allowed === "*" || allowed === origin ? origin || "*" : allowed;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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

function isOverDailyLimit(token) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}:${token.slice(-18)}`;
  const used = dailyUsage.get(key) || 0;
  dailyUsage.set(key, used + 1);
  return used >= DAILY_LIMIT;
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

function toText(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 6);
  }
  return String(value || "").trim().slice(0, 800);
}
