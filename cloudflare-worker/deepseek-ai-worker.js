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
    if (url.pathname === "/analyze-class") {
      return handleAnalyzeClass(request, env, corsHeaders);
    }
    if (url.pathname === "/suggest-score-mapping") {
      return handleSuggestScoreMapping(request, env, corsHeaders);
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

async function handleAnalyzeClass(request, env, corsHeaders) {
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
