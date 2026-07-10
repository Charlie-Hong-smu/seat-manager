import assert from "node:assert/strict";
import test from "node:test";

import { AI_USAGE_KEY_PREFIX, allowAuthAttempt, consumeAiUsage } from "../worker-usage.js";

function createKv(initial = new Map()) {
  return {
    values: initial,
    async get(key) {
      const value = initial.get(key);
      return value ? JSON.parse(value) : null;
    },
    async put(key, value, options) {
      initial.set(key, value);
      this.lastPut = { key, value: JSON.parse(value), options };
    },
  };
}

test("auth limiter keys attempts by route and source", async () => {
  let receivedKey = "";
  const allowed = await allowAuthAttempt(new Request("https://worker.example/auth", {
    headers: { "CF-Connecting-IP": "203.0.113.4" },
  }), {
    AUTH_RATE_LIMITER: { async limit({ key }) { receivedKey = key; return { success: true }; } },
  }, "/auth");
  assert.equal(allowed, true);
  assert.equal(receivedKey, "/auth:203.0.113.4");
});

test("AI usage counts in KV and enforces the configured daily limit", async () => {
  const kv = createKv();
  const env = {
    SEAT_MANAGER_KV: kv,
    AI_RATE_LIMITER: { async limit() { return { success: true }; } },
  };
  const context = { actorKey: "license:teacher-a", dailyLimit: 1 };
  const now = new Date("2026-07-10T10:00:00.000Z");
  const first = await consumeAiUsage(env, context, now);
  assert.equal(first.allowed, true);
  assert.equal(kv.lastPut.key.startsWith(`${AI_USAGE_KEY_PREFIX}2026-07-10:`), true);
  assert.equal(kv.lastPut.options.expirationTtl, 259200);
  const second = await consumeAiUsage(env, context, now);
  assert.deepEqual(second, { allowed: false, reason: "daily" });
});

test("AI usage rejects bursts but fails open when KV is unavailable", async () => {
  const burst = await consumeAiUsage({
    AI_RATE_LIMITER: { async limit() { return { success: false }; } },
  }, { actorKey: "ai:test", dailyLimit: 30 });
  assert.deepEqual(burst, { allowed: false, reason: "burst" });

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const fallback = await consumeAiUsage({
      AI_RATE_LIMITER: { async limit() { return { success: true }; } },
      SEAT_MANAGER_KV: { async get() { throw new Error("kv down"); } },
    }, { actorKey: "ai:test", dailyLimit: 30 });
    assert.deepEqual(fallback, { allowed: true, reason: "store_failed" });
  } finally {
    console.warn = originalWarn;
  }
});
