import assert from "node:assert/strict";
import test from "node:test";
import worker from "../deepseek-ai-worker.js";
import { sha256Hex, signToken, verifyToken } from "../worker-auth.js";

function kvStore(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { values,
    async get(key) { return values.get(key) ?? null; },
    async put(key, value) { values.set(key, JSON.parse(value)); },
    async delete(key) { values.delete(key); },
    async list({ prefix }) { return { keys: [...values.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })), list_complete: true }; },
  };
}
function req(path, body, token) {
  return new Request(`https://worker.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function setup() {
  const key = `seat-manager:license:${await sha256Hex("SECURITY-CODE")}`;
  const kv = kvStore({ [key]: { licenseId: "legacy-space", status: "active", allowedEditions: ["zhang"], aiEnabled: true, maxDevices: 3, devices: [] } });
  const env = { SEAT_MANAGER_KV: kv, PRODUCT_TOKEN_SECRET: "test-product", LICENSE_ADMIN_TOKEN: "test-admin", DEEPSEEK_API_KEY: "test-ai" };
  const call = (path, body, token) => worker.fetch(req(path, body, token), env);
  const login = async () => { const response = await call("/license/auth", { productCode: "SECURITY-CODE", deviceId: "device", edition: "zhang", rememberDays: 90 }); assert.equal(response.status, 200); return response.json(); };
  return { key, kv, env, call, login };
}
async function denied(call, token) {
  for (const [path, body] of [["/sync/status", undefined], ["/sync/load", undefined], ["/sync/save", { version: 1, data: { students: [], seatOrder: [] } }], ["/analyze-trend", { student: "学生A", recentExams: [{}] }]]) {
    assert.equal((await call(path, body, token)).status, 401, path);
  }
}

test("old product credentials cannot use sync or AI after disable, deletion, expiry, edition or tenant changes", async t => {
  t.mock.method(globalThis, "fetch", () => { assert.fail("revoked credentials must never reach paid AI"); });
  for (const change of [record => ({ ...record, status: "disabled" }), () => null, record => ({ ...record, expiresAt: "2020-01-01" }), record => ({ ...record, allowedEditions: ["commercial"] }), record => ({ ...record, licenseId: "other-space" })]) {
    const { key, kv, call, login } = await setup();
    const auth = await login();
    assert.equal((await call("/sync/status", undefined, auth.token)).status, 200);
    kv.values.set(key, change(kv.values.get(key)));
    await denied(call, auth.token);
  }
});

test("unbind, clear and upsert-clear reject old sessions even after the same device rebinds", async () => {
  for (const path of ["/license/unbind-device", "/admin/licenses/clear-devices", "/admin/licenses/upsert"]) {
    const { key, call, login } = await setup();
    const old = await login();
    const response = await call(path, { licenseKey: key, clearDevices: true }, path.startsWith("/admin") ? "test-admin" : old.token);
    assert.equal(response.status, 200);
    await denied(call, old.token);
    const fresh = await login();
    assert.equal((await call("/sync/status", undefined, fresh.token)).status, 200);
    await denied(call, old.token);
    assert.equal((await call("/license/unbind-device", {}, old.token)).status, 401);
  }
});

test("legacy sessions remain valid only for untouched bindings and expiry caps the signed session", async () => {
  const { key, kv, call, env, login } = await setup();
  kv.values.get(key).devices = [{ id: "device", name: "Old" }];
  const token = await signToken({ scope: "product-access", exp: Date.now() + 60_000, licenseKey: key, licenseId: "legacy-space", deviceId: "device", edition: "zhang" }, env.PRODUCT_TOKEN_SECRET);
  assert.equal((await call("/sync/status", undefined, token)).status, 200);
  const expiresAt = Date.now() + 30_000;
  kv.values.get(key).expiresAt = new Date(expiresAt).toISOString();
  const auth = await login();
  assert.equal(auth.expiresAt, expiresAt);
  assert.equal((await verifyToken(auth.token, env.PRODUCT_TOKEN_SECRET)).exp, expiresAt);
  await denied(call, token);
});

test("new customer labels cannot select a cloud space; legacy IDs stay immutable and conflicts fail closed", async () => {
  const { key, kv, call, login } = await setup();
  const created = [];
  for (const [productCode, licenseId] of [["NEW-A", "same!"], ["NEW-B", "same"], ["NEW-C", "same!"]]) {
    const response = await call("/admin/licenses/upsert", { productCode, licenseId, acquisitionChannel: "wechat" }, "test-admin");
    assert.equal(response.status, 200);
    const license = (await response.json()).license;
    assert.match(license.licenseId, /^tenant-[a-f0-9]{64}$/);
    created.push(license.licenseId);
  }
  assert.equal(new Set(created).size, 3);
  const auth = await login();
  for (const licenseId of ["other", "legacy-space!"]) {
    const response = await call("/admin/licenses/upsert", { licenseKey: key, licenseId }, "test-admin");
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "license_id_immutable");
  }
  assert.equal((await call("/admin/licenses/upsert", { licenseKey: key, displayName: "改名客户" }, "test-admin")).status, 200);
  assert.equal(kv.values.get(key).licenseId, "legacy-space");
  assert.equal(kv.values.get(key).displayName, "改名客户");
  assert.equal((await call("/sync/status", undefined, auth.token)).status, 200);
  kv.values.set("seat-manager:license:duplicate", { licenseId: "legacy-space!", devices: [] });
  await denied(call, auth.token);
  assert.equal((await call("/admin/licenses/upsert", { licenseKey: key }, "test-admin")).status, 409);
});

test("disable/re-enable and delete/recreate never revive an old device session or change its space", async () => {
  const { key, kv, env, call, login } = await setup();
  env.PRODUCT_ACCESS_CODE = "SECURITY-CODE";
  env.PRODUCT_LICENSE_ID = "legacy-space";
  const old = await login();
  kv.values.get(key).expiresAt = "2027-01-01T00:00:00.000Z";
  kv.values.get(key).aiExpiresAt = "2027-01-01T00:00:00.000Z";
  assert.equal((await call("/admin/licenses/upsert", { licenseKey: key, status: "disabled" }, "test-admin")).status, 200);
  assert.equal((await call("/admin/licenses/upsert", { licenseKey: key, status: "active" }, "test-admin")).status, 200);
  assert.equal(kv.values.get(key).expiresAt, "2027-01-01T00:00:00.000Z");
  assert.equal(kv.values.get(key).aiExpiresAt, "2027-01-01T00:00:00.000Z");
  await denied(call, old.token);
  const fresh = await login();
  assert.equal((await call("/admin/licenses/delete", { licenseKey: key }, "test-admin")).status, 200);
  await denied(call, fresh.token);
  assert.equal((await call("/license/auth", { productCode: "SECURITY-CODE", deviceId: "device", edition: "commercial" })).status, 403, "environment fallback must not revive deletion");
  const list = await (await call("/admin/licenses/list", {}, "test-admin")).json();
  assert.equal(list.licenses.length, 0);
  assert.equal((await call("/admin/licenses/upsert", { licenseKey: key, licenseId: "other", acquisitionChannel: "wechat" }, "test-admin")).status, 409);
  const recreated = await call("/admin/licenses/upsert", { licenseKey: key, acquisitionChannel: "wechat", allowedEditions: ["zhang"] }, "test-admin");
  assert.equal(recreated.status, 200);
  assert.equal((await recreated.json()).license.licenseId, "legacy-space");
  await login();
  await denied(call, fresh.token);
});

test("environment-only product code acquires persistent device sessions on its first login", async () => {
  const kv = kvStore();
  const env = { SEAT_MANAGER_KV: kv, PRODUCT_ACCESS_CODE: "ENV-TEST", PRODUCT_LICENSE_ID: "env-space", PRODUCT_TOKEN_SECRET: "test-product" };
  const response = await worker.fetch(req("/license/auth", { productCode: "ENV-TEST", deviceId: "env-device", edition: "commercial" }), env);
  assert.equal(response.status, 200);
  const { token } = await response.json();
  assert.equal((await worker.fetch(req("/sync/status", undefined, token), env)).status, 200);
  assert.ok([...kv.values.values()][0].devices[0].sessionId);
});
