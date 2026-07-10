const USAGE_PREFIX = "seat-manager:ai-usage:";
const USAGE_TTL_SECONDS = 3 * 24 * 60 * 60;

async function hashKey(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export async function allowAuthAttempt(request, env, route) {
  if (!env.AUTH_RATE_LIMITER?.limit) {
    return true;
  }
  const source = request.headers.get("CF-Connecting-IP") || "unknown";
  const { success } = await env.AUTH_RATE_LIMITER.limit({ key: `${route}:${source}` });
  return success;
}

export async function consumeAiUsage(env, context, now = new Date()) {
  const actorHash = await hashKey(context.actorKey);
  if (env.AI_RATE_LIMITER?.limit) {
    const burst = await env.AI_RATE_LIMITER.limit({ key: actorHash });
    if (!burst.success) {
      return { allowed: false, reason: "burst" };
    }
  }

  if (!env.SEAT_MANAGER_KV) {
    return { allowed: true, reason: "untracked" };
  }

  const day = now.toISOString().slice(0, 10);
  const key = `${USAGE_PREFIX}${day}:${actorHash}`;
  try {
    const stored = await env.SEAT_MANAGER_KV.get(key, { type: "json" });
    const count = Number.isFinite(Number(stored?.count)) ? Number(stored.count) : 0;
    if (count >= context.dailyLimit) {
      return { allowed: false, reason: "daily" };
    }
    await env.SEAT_MANAGER_KV.put(key, JSON.stringify({ count: count + 1, updatedAt: now.toISOString() }), {
      expirationTtl: USAGE_TTL_SECONDS,
    });
    return { allowed: true, reason: "counted", count: count + 1 };
  } catch (error) {
    console.warn(JSON.stringify({
      event: "ai_usage_store_failed",
      message: error instanceof Error ? error.message : "unknown_error",
    }));
    return { allowed: true, reason: "store_failed" };
  }
}

export const AI_USAGE_KEY_PREFIX = USAGE_PREFIX;
