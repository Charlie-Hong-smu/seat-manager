import assert from "node:assert/strict";
import test from "node:test";

import worker from "../deepseek-ai-worker.js";

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function createKv(seed = {}, options = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    values,
    async get(key) { const value = values.get(key); return value ? JSON.parse(value) : null; },
    async put(key, value) { values.set(key, value); },
    async delete(key) { values.delete(key); },
    async list({ prefix, cursor = "" }) {
      const names = [...values.keys()].filter(key => key.startsWith(prefix)).sort();
      const start = Number(cursor || 0);
      const pageSize = options.pageSize || names.length || 1;
      const page = names.slice(start, start + pageSize);
      const next = start + page.length;
      return {
        keys: page.map(name => ({ name })),
        list_complete: next >= names.length,
        cursor: next < names.length ? String(next) : "",
      };
    },
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
    acquisitionChannel: "wechat",
    acquisitionDetail: "教师社群",
    allowedEditions: ["zhang"],
    status: "active",
    maxDevices: 2,
  }, "admin"), env);
  assert.equal(response.status, 200);
  const saved = (await response.json()).license;
  assert.deepEqual(saved.allowedEditions, ["zhang"]);
  assert.equal(saved.acquisitionChannel, "wechat");
  assert.equal(saved.acquisitionDetail, "教师社群");
  assert.ok(saved.createdAt);
  assert.ok(saved.updatedAt);

  const list = await worker.fetch(post("/admin/licenses/list", {}, "admin"), env);
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).licenses[0].allowedEditions, ["zhang"]);
});

test("admin list infers legacy acquisition channels without inventing creation dates", async () => {
  const xhsHash = await sha256("XHS-CODE");
  const legacyHash = await sha256("LEGACY-ADMIN-CODE");
  const kv = createKv({
    [`seat-manager:license:${xhsHash}`]: { licenseId: "xhs-123-20260713", status: "active", devices: [] },
    [`seat-manager:license:${legacyHash}`]: { licenseId: "teacher-legacy", status: "active", devices: [] },
  });
  const response = await worker.fetch(post("/admin/licenses/list", {}, "admin"), { SEAT_MANAGER_KV: kv, LICENSE_ADMIN_TOKEN: "admin" });
  const licenses = (await response.json()).licenses;
  assert.equal(licenses.find(item => item.licenseId.startsWith("xhs-")).acquisitionChannel, "xiaohongshu");
  assert.equal(licenses.find(item => item.licenseId === "teacher-legacy").acquisitionChannel, "unknown");
  assert.equal(licenses.find(item => item.licenseId === "teacher-legacy").createdAt, "");
});

test("license device writes preserve acquisition metadata and creation time", async () => {
  const codeHash = await sha256("PRESERVE-CODE");
  const key = `seat-manager:license:${codeHash}`;
  const createdAt = "2026-07-01T00:00:00.000Z";
  const kv = createKv({
    [key]: {
      licenseId: "customer-preserve",
      acquisitionChannel: "referral",
      acquisitionDetail: "王老师介绍",
      createdAt,
      status: "active",
      maxDevices: 3,
      devices: [],
    },
  });
  const env = { SEAT_MANAGER_KV: kv, PRODUCT_TOKEN_SECRET: "product-secret", LICENSE_ADMIN_TOKEN: "admin" };
  assert.equal((await worker.fetch(post("/license/auth", { productCode: "PRESERVE-CODE", deviceId: "device-1" }), env)).status, 200);
  let stored = JSON.parse(kv.values.get(key));
  assert.equal(stored.acquisitionChannel, "referral");
  assert.equal(stored.acquisitionDetail, "王老师介绍");
  assert.equal(stored.createdAt, createdAt);

  assert.equal((await worker.fetch(post("/admin/licenses/clear-devices", { licenseKey: key }, "admin"), env)).status, 200);
  stored = JSON.parse(kv.values.get(key));
  assert.equal(stored.acquisitionChannel, "referral");
  assert.equal(stored.createdAt, createdAt);
  assert.deepEqual(stored.devices, []);
});

test("admin list exposes cursor pages without duplicate records", async () => {
  const firstHash = await sha256("PAGE-A");
  const secondHash = await sha256("PAGE-B");
  const kv = createKv({
    [`seat-manager:license:${firstHash}`]: { licenseId: "page-a", status: "active", devices: [] },
    [`seat-manager:license:${secondHash}`]: { licenseId: "page-b", status: "active", devices: [] },
  }, { pageSize: 1 });
  const env = { SEAT_MANAGER_KV: kv, LICENSE_ADMIN_TOKEN: "admin" };
  const first = await worker.fetch(post("/admin/licenses/list", {}, "admin"), env);
  const firstBody = await first.json();
  assert.equal(firstBody.partial, true);
  assert.ok(firstBody.cursor);
  const second = await worker.fetch(post("/admin/licenses/list", { cursor: firstBody.cursor }, "admin"), env);
  const secondBody = await second.json();
  assert.equal(secondBody.partial, false);
  assert.notEqual(firstBody.licenses[0].licenseId, secondBody.licenses[0].licenseId);
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

test("weekly and item analysis routes validate and sanitize structured AI output", async () => {
  const codeHash = await sha256("WORKBENCH-AI");
  const key = `seat-manager:license:${codeHash}`;
  const kv = createKv({ [key]: { licenseId: "teacher-workbench", status: "active", maxDevices: 3, aiEnabled: true, aiDailyLimit: 30, devices: [] } });
  const env = { SEAT_MANAGER_KV: kv, PRODUCT_TOKEN_SECRET: "product-secret", DEEPSEEK_API_KEY: "test-key" };
  const auth = await worker.fetch(post("/license/auth", { productCode: "WORKBENCH-AI", deviceId: "device-1" }), env);
  const { token } = await auth.json();
  assert.equal((await worker.fetch(post("/generate-weekly-draft", { scope: "class", facts: [] }, token), env)).status, 400);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const isWeekly = body.messages[0].content.includes("周报");
    const content = isWeekly
      ? { title: "本周简报", content: "本周整体平稳。", highlights: ["按时完成"], cautions: [], disclaimer: "请确认" }
      : { overview: "第1题需要关注。", weakPoints: ["计算"], teachingSuggestions: ["讲评"], followupCandidates: [{ studentId: "s1", reason: "得分率较低" }, { studentId: "invented", reason: "不应保留" }], disclaimer: "请确认" };
    return Response.json({ choices: [{ message: { content: JSON.stringify(content) } }] });
  };
  try {
    const weekly = await worker.fetch(post("/generate-weekly-draft", { scope: "class", subjectName: "本班", startDate: "2026-07-13", endDate: "2026-07-19", facts: ["出勤异常 0 次"], localDraft: "本地草稿" }, token), env);
    assert.equal(weekly.status, 200);
    assert.equal((await weekly.json()).title, "本周简报");
    const items = await worker.fetch(post("/analyze-score-items", { exam: { id: "e1", name: "考试" }, questions: [{ id: "q1", rate: 45, weakStudentIds: ["s1"] }] }, token), env);
    assert.equal(items.status, 200);
    assert.deepEqual((await items.json()).followupCandidates.map(item => item.studentId), ["s1"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
