import assert from "node:assert/strict";
import test from "node:test";
import worker from "../deepseek-ai-worker.js";
import { sha256Hex, signToken, verifyToken } from "../worker-auth.js";
import proxy from "../../netlify/functions/worker-proxy.mjs";

const ORIGIN = "http://localhost:4173";
const LEGACY_KEY = "seat-manager:single-teacher:state";
const MAX_BYTES = 5 * 1024 * 1024;
const data = { students: [{ id: "s1", name: "同步测试" }], seatOrder: ["s1"], settings: { futureField: true } };

function createKv(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    values,
    async get(key, options) { assert.equal(options.type, "json"); return values.get(key) ?? null; },
    async put(key, value) { values.set(key, JSON.parse(value)); },
    async list({ prefix }) { return { keys: [...values.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
  };
}

function request(path, { method = "GET", token, body, raw } = {}) {
  return new Request(`https://worker.example${path}`, {
    method,
    headers: { Origin: ORIGIN, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(method === "GET" ? {} : { body: raw ?? JSON.stringify(body) }),
  });
}

async function token(scope = "seat-sync", secret = "sync-secret", extra = {}) {
  return signToken({ scope, exp: Date.now() + 60_000, ...extra }, secret);
}

async function expectError(response, status, error) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.deepEqual(await response.json(), { error });
}

test("sync methods, authorization, missing storage and unknown routes preserve error precedence", async () => {
  const auth = await token();
  const env = { SYNC_TOKEN_SECRET: "sync-secret", SEAT_MANAGER_KV: createKv() };
  for (const [path, method, credential, status, error] of [
    ["/sync/auth", "GET", null, 405, "method_not_allowed"],
    ["/sync/status", "DELETE", null, 405, "method_not_allowed"],
    ["/sync/status", "POST", null, 401, "unauthorized"],
    ["/sync/status", "POST", auth, 405, "method_not_allowed"],
    ["/sync/save", "GET", auth, 405, "method_not_allowed"],
    ["/sync/load", "POST", auth, 405, "method_not_allowed"],
    ["/sync/unknown", "GET", null, 401, "unauthorized"],
    ["/sync/unknown", "GET", auth, 404, "not_found"],
    ["/sync/load", "GET", auth, 404, "not_found"],
  ]) {
    await expectError(await worker.fetch(request(path, { method, token: credential }), env), status, error);
  }
  await expectError(await worker.fetch(request("/sync/status", { token: auth }), { SYNC_TOKEN_SECRET: "sync-secret" }), 503, "service_unavailable");
  const empty = await worker.fetch(request("/sync/status", { token: auth }), env);
  assert.deepEqual(await empty.json(), { exists: false });
  const options = await worker.fetch(request("/sync/save", { method: "OPTIONS" }), {});
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Origin"), ORIGIN);
});

test("sync authentication preserves hash precedence, session durations and rate limiting", async t => {
  const now = Date.UTC(2026, 8, 26);
  t.mock.method(Date, "now", () => now);
  const env = { SYNC_ACCESS_CODE: "plain", SYNC_ACCESS_CODE_HASH: await sha256Hex("hashed"), SYNC_TOKEN_SECRET: "sync-secret" };
  const login = (body, overrides = {}) => worker.fetch(request("/sync/auth", { method: "POST", body }), { ...env, ...overrides });
  await expectError(await login({ syncCode: "plain" }), 403, "forbidden");
  for (const [rememberDays, ttl] of [[0, 12 * 3600000], [30, 30 * 86400000], [90, 30 * 86400000]]) {
    const response = await login({ syncCode: "hashed", rememberDays });
    assert.equal(response.status, 200);
    const auth = await response.json();
    assert.equal(auth.expiresAt, now + ttl);
    assert.deepEqual(await verifyToken(auth.token, env.SYNC_TOKEN_SECRET), { exp: now + ttl, scope: "seat-sync" });
  }
  assert.equal((await login({ syncCode: "plain" }, { SYNC_ACCESS_CODE_HASH: "" })).status, 200);
  await expectError(await login({}, { AUTH_RATE_LIMITER: { async limit({ key }) { assert.equal(key, "/sync/auth:unknown"); return { success: false }; } } }), 429, "rate_limited");
  await expectError(await login({}, { SYNC_TOKEN_SECRET: "" }), 503, "service_unavailable");
  await expectError(await worker.fetch(request("/sync/auth", { method: "POST", raw: "{" }), env), 400, "bad_request");
  await expectError(await login({ syncCode: "中".repeat(8000) }), 400, "bad_request");
});

test("invalid, expired and wrong-scope tokens never access sync storage", async () => {
  const env = { PRODUCT_TOKEN_SECRET: "product-secret", SYNC_TOKEN_SECRET: "sync-secret", SEAT_MANAGER_KV: { get() { assert.fail("unauthorized storage access"); } } };
  for (const credential of [
    "invalid.token", await token("seat-sync", "wrong-secret"),
    await token("seat-sync", "sync-secret", { exp: Date.now() - 1 }),
    await token("ai-trend"), await token("product-access", "product-secret"),
    await token("product-access", "product-secret", { licenseId: "中文!" }),
    await token("product-access", "product-secret", { licenseId: "teacher", exp: Date.now() - 1 }),
  ]) {
    await expectError(await worker.fetch(request("/sync/status", { token: credential }), env), 401, "unauthorized");
  }
});

test("product accounts and legacy sync keep separate keys and preserve backup metadata", async () => {
  const kv = createKv();
  const env = { SEAT_MANAGER_KV: kv, PRODUCT_TOKEN_SECRET: "product-secret", SYNC_TOKEN_SECRET: "sync-secret" };
  const credentials = [await token(), await token("product-access", "product-secret", { licenseId: "teacher-a", edition: "zhang" }), await token("product-access", "product-secret", { licenseId: "teacher-b", edition: "commercial" })];
  for (const [index, credential] of credentials.entries()) {
    const response = await worker.fetch(request("/sync/save", { method: "POST", token: credential, body: { version: 1, deviceName: `  Mac-${index}  `, data: { ...data, marker: index } } }), env);
    assert.equal(response.status, 200);
    const saved = await response.json();
    assert.equal(saved.ok, true);
    assert.equal(saved.deviceName, `Mac-${index}`);
    const status = await worker.fetch(request("/sync/status", { token: credential }), env);
    const { ok, ...metadata } = saved;
    assert.deepEqual(await status.json(), { exists: true, ...metadata });
    const loaded = await worker.fetch(request("/sync/load", { token: credential }), env);
    const { sizeBytes, ...loadMetadata } = metadata;
    assert.ok(sizeBytes > 0);
    assert.deepEqual(await loaded.json(), { ...loadMetadata, data: { ...data, marker: index } });
  }
  assert.deepEqual([...kv.values.keys()], [LEGACY_KEY, "seat-manager:license:teacher-a:state", "seat-manager:license:teacher-b:state"]);
  const fallback = await token("product-access", "fallback-secret", { licenseId: " teacher-a! " });
  const response = await worker.fetch(request("/sync/load", { token: fallback }), { SEAT_MANAGER_KV: kv, TOKEN_SECRET: "fallback-secret" });
  assert.equal((await response.json()).data.marker, 1);
  const listed = await worker.fetch(request("/admin/licenses/list", { method: "POST", token: "admin", body: {} }), { ...env, LICENSE_ADMIN_TOKEN: "admin" });
  assert.deepEqual((await listed.json()).licenses, []);
});

test("legacy saved records keep their response defaults", async () => {
  const env = { SYNC_TOKEN_SECRET: "sync-secret", SEAT_MANAGER_KV: createKv({ [LEGACY_KEY]: { data } }) };
  const credential = await token();
  assert.deepEqual(await (await worker.fetch(request("/sync/status", { token: credential }), env)).json(), { exists: true, updatedAt: "", deviceName: "", version: 1, sizeBytes: 0 });
  assert.deepEqual(await (await worker.fetch(request("/sync/load", { token: credential }), env)).json(), { updatedAt: "", deviceName: "", version: 1, data });
});

test("sync rejects invalid shapes and counts UTF-8 bytes before replacing a backup", async () => {
  const kv = createKv({ [LEGACY_KEY]: { version: 1, data } });
  const env = { SYNC_TOKEN_SECRET: "sync-secret", SEAT_MANAGER_KV: kv };
  const credential = await token();
  for (const body of [null, {}, { version: 0, data }, { version: 1, data: null }, { version: 1, data: { students: {}, seatOrder: [] } }, { version: 1, data: { students: [] } }, { version: 1, data, extra: "中".repeat(Math.ceil(MAX_BYTES / 3)) }]) {
    await expectError(await worker.fetch(request("/sync/save", { method: "POST", token: credential, body }), env), 400, "bad_request");
  }
  assert.deepEqual(kv.values.get(LEGACY_KEY), { version: 1, data });
  // The request fits, but server timestamps and metadata exceed the persisted limit.
  for (const book of [false, true]) {
    const body = book ? { version: 1, data, workspaceBook: { padding: "" } } : { version: 1, data: { students: [], seatOrder: [], padding: "" } };
    const padded = book ? body.workspaceBook : body.data;
    padded.padding = "x".repeat(MAX_BYTES - new TextEncoder().encode(JSON.stringify(body)).length);
    await expectError(await worker.fetch(request("/sync/save", { method: "POST", token: credential, body }), env), 413, "payload_too_large");
  }
  assert.deepEqual(kv.values.get(LEGACY_KEY), { version: 1, data });
});

test("save waits for storage, and read or write failures keep the public error boundary", async t => {
  t.mock.method(console, "error", () => {});
  const credential = await token();
  const entered = Promise.withResolvers();
  const storage = Promise.withResolvers();
  let completed = false;
  const pending = worker.fetch(request("/sync/save", { method: "POST", token: credential, body: { version: 1, data } }), {
    SYNC_TOKEN_SECRET: "sync-secret", SEAT_MANAGER_KV: { put() { entered.resolve(); return storage.promise; } },
  }).then(response => { completed = true; return response; });
  await entered.promise;
  assert.equal(completed, false);
  storage.reject(new Error("private storage failure"));
  await expectError(await pending, 500, "internal_error");
  for (const path of ["/sync/status", "/sync/load"]) {
    await expectError(await worker.fetch(request(path, { token: credential }), { SYNC_TOKEN_SECRET: "sync-secret", SEAT_MANAGER_KV: { get() { throw new Error("private storage failure"); } } }), 500, "internal_error");
  }
});

test("whole-workspace backups survive save and load alongside the legacy active slice", async () => {
  const createdAt = "2026-09-26T00:00:00.000Z";
  const workspaceBook = {
    version: 1, currentSliceId: "class-a-autumn", futureField: { preserved: true },
    slices: [
      { id: "class-a-autumn", classId: "class-a", season: "autumn", data },
      { id: "class-a-spring", classId: "class-a", season: "spring", data: { students: [], seatOrder: [] } },
      { id: "class-b-autumn", classId: "class-b", season: "autumn", data: { students: [{ id: "s2" }], seatOrder: ["s2"] } },
    ].map(({ season, ...slice }) => ({
      ...slice, className: slice.classId, createdAt, updatedAt: createdAt,
      term: { id: `term-${slice.id}`, year: 2026, season, label: season, createdAt },
    })),
  };
  const kv = createKv();
  const env = { SEAT_MANAGER_KV: kv, PRODUCT_TOKEN_SECRET: "product-secret" };
  const credential = await token("product-access", "product-secret", { licenseId: "whole-book" });
  const response = await worker.fetch(request("/sync/save", { method: "POST", token: credential, body: { version: 1, deviceName: "Mac", data, workspaceBook } }), env);
  assert.equal(response.status, 200);
  const saved = kv.values.get("seat-manager:license:whole-book:state");
  assert.deepEqual(saved.workspaceBook, workspaceBook);
  const { sizeBytes, ...sizedPayload } = saved;
  assert.equal(sizeBytes, new TextEncoder().encode(JSON.stringify(sizedPayload)).length);
  const loaded = await worker.fetch(request("/sync/load", { token: credential }), env);
  const body = await loaded.json();
  assert.deepEqual(body.workspaceBook, workspaceBook);
  assert.deepEqual(body.data, data);
});

test("Commercial proxy passes authorization and complete sync payloads to the Worker", async t => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Netlify");
  Object.defineProperty(globalThis, "Netlify", { configurable: true, value: { env: { get: () => "https://worker.test" } } });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "Netlify", original);
    else delete globalThis.Netlify;
  });
  const env = { PRODUCT_TOKEN_SECRET: "product-secret", SEAT_MANAGER_KV: createKv() };
  const credential = await token("product-access", "product-secret", { licenseId: "proxy-teacher" });
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.origin, "https://worker.test");
    assert.equal(options.headers.get("Authorization"), `Bearer ${credential}`);
    return worker.fetch(new Request(url, options), env);
  });
  const call = (path, options = {}) => proxy(request(`/api${path}`, { token: credential, ...options }), { params: { path: path.slice(1) } });
  const workspaceBook = { version: 1, currentSliceId: "proxy-slice", slices: [{ id: "proxy-slice", data }] };
  assert.equal((await call("/sync/save", { method: "POST", body: { version: 1, data, workspaceBook } })).status, 200);
  assert.equal((await (await call("/sync/status")).json()).exists, true);
  const loaded = await call("/sync/load");
  assert.equal(loaded.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.deepEqual((await loaded.json()).workspaceBook, workspaceBook);
});
