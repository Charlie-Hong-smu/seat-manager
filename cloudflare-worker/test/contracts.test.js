import assert from "node:assert/strict";
import test from "node:test";

import worker from "../deepseek-ai-worker.js";

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function createKv(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    values,
    async get(key) { const value = values.get(key); return value ? JSON.parse(value) : null; },
    async put(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
    async list({ prefix }) { return { keys: [...values.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
  };
}

function post(path, body, token) {
  return new Request(`https://worker.example${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

test("license auth rejects expiry and enforces sequential device limits", async () => {
  const codeHash = await sha256("PRODUCT-CODE");
  const key = `seat-manager:license:${codeHash}`;
  const base = { licenseId: "teacher-a", status: "active", expiresAt: "", maxDevices: 1, aiEnabled: true, aiDailyLimit: 30, devices: [] };
  const kv = createKv({ [key]: base });
  const env = { SEAT_MANAGER_KV: kv, PRODUCT_TOKEN_SECRET: "product-secret" };

  const first = await worker.fetch(post("/license/auth", { productCode: "PRODUCT-CODE", deviceId: "device-1", deviceName: "Mac" }), env);
  assert.equal(first.status, 200);
  const second = await worker.fetch(post("/license/auth", { productCode: "PRODUCT-CODE", deviceId: "device-2", deviceName: "PC" }), env);
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, "device_limit");

  await kv.put(key, JSON.stringify({ ...base, expiresAt: "2020-01-01T00:00:00.000Z" }));
  const expired = await worker.fetch(post("/license/auth", { productCode: "PRODUCT-CODE", deviceId: "device-1" }), env);
  assert.equal(expired.status, 403);
  assert.equal((await expired.json()).error, "license_expired");
});

test("license auth enforces edition scopes while preserving legacy commercial records", async () => {
  const zhangHash = await sha256("ZHANG-CODE");
  const bothHash = await sha256("BOTH-CODE");
  const legacyHash = await sha256("LEGACY-CODE");
  const kv = createKv({
    [`seat-manager:license:${zhangHash}`]: { licenseId: "zhang-user", allowedEditions: ["zhang"], status: "active", maxDevices: 3, devices: [] },
    [`seat-manager:license:${bothHash}`]: { licenseId: "both-user", allowedEditions: ["zhang", "commercial"], status: "active", maxDevices: 3, devices: [] },
    [`seat-manager:license:${legacyHash}`]: { licenseId: "legacy-user", status: "active", maxDevices: 3, devices: [] },
  });
  const env = { SEAT_MANAGER_KV: kv, PRODUCT_TOKEN_SECRET: "product-secret" };

  const zhang = await worker.fetch(post("/license/auth", { productCode: "ZHANG-CODE", edition: "zhang", deviceId: "z1" }), env);
  assert.equal(zhang.status, 200);
  assert.equal((await zhang.json()).edition, "zhang");
  const wrongEdition = await worker.fetch(post("/license/auth", { productCode: "ZHANG-CODE", edition: "commercial", deviceId: "z2" }), env);
  assert.equal(wrongEdition.status, 403);
  assert.equal((await wrongEdition.json()).error, "edition_forbidden");

  assert.equal((await worker.fetch(post("/license/auth", { productCode: "BOTH-CODE", edition: "zhang", deviceId: "b1" }), env)).status, 200);
  assert.equal((await worker.fetch(post("/license/auth", { productCode: "BOTH-CODE", edition: "commercial", deviceId: "b2" }), env)).status, 200);
  assert.equal((await worker.fetch(post("/license/auth", { productCode: "LEGACY-CODE", deviceId: "l1" }), env)).status, 200);
  assert.equal((await worker.fetch(post("/license/auth", { productCode: "LEGACY-CODE", edition: "zhang", deviceId: "l2" }), env)).status, 403);
});

test("admin routes reject missing credentials", async () => {
  const response = await worker.fetch(post("/admin/licenses/list", {}), { SEAT_MANAGER_KV: createKv(), LICENSE_ADMIN_TOKEN: "admin" });
  assert.equal(response.status, 401);
});

test("admin upsert persists and returns edition scopes", async () => {
  const kv = createKv();
  const env = { SEAT_MANAGER_KV: kv, LICENSE_ADMIN_TOKEN: "admin" };
  const response = await worker.fetch(post("/admin/licenses/upsert", {
    productCode: "NEW-ZHANG-CODE",
    licenseId: "zhang-admin",
    allowedEditions: ["zhang"],
    status: "active",
    maxDevices: 2,
  }, "admin"), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).license.allowedEditions, ["zhang"]);

  const list = await worker.fetch(post("/admin/licenses/list", {}, "admin"), env);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).licenses[0].allowedEditions, ["zhang"]);
});

test("sync auth, save and load preserve the public payload", async () => {
  const kv = createKv();
  const env = { SEAT_MANAGER_KV: kv, SYNC_ACCESS_CODE: "sync-code", SYNC_TOKEN_SECRET: "sync-secret" };
  const auth = await worker.fetch(post("/sync/auth", { syncCode: "sync-code", rememberDays: 0 }), env);
  assert.equal(auth.status, 200);
  const { token } = await auth.json();
  const data = { students: [{ id: "s1", name: "张三" }], seatOrder: ["s1"] };
  const saved = await worker.fetch(post("/sync/save", { version: 1, deviceName: "Mac", data }, token), env);
  assert.equal(saved.status, 200);
  const loaded = await worker.fetch(new Request("https://worker.example/sync/load", { headers: { Authorization: `Bearer ${token}` } }), env);
  assert.equal(loaded.status, 200);
  assert.deepEqual((await loaded.json()).data, data);
});

test("AI upstream failures keep the stable error mapping", async () => {
  const codeHash = await sha256("AI-CODE");
  const key = `seat-manager:license:${codeHash}`;
  const kv = createKv({
    [key]: { licenseId: "teacher-ai", status: "active", expiresAt: "", maxDevices: 3, aiEnabled: true, aiDailyLimit: 30, devices: [] },
  });
  const env = { SEAT_MANAGER_KV: kv, PRODUCT_TOKEN_SECRET: "product-secret", DEEPSEEK_API_KEY: "test-key" };
  const auth = await worker.fetch(post("/license/auth", { productCode: "AI-CODE", deviceId: "device-1" }), env);
  const { token } = await auth.json();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("down", { status: 503 });
  try {
    const response = await worker.fetch(post("/analyze-trend", { student: "学生A", recentExams: [{ name: "期中" }] }, token), env);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).error, "ai_unavailable");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
