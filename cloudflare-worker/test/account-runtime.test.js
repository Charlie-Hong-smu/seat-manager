import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Miniflare, Log, LogLevel } from "miniflare";
import { sha256Hex } from "../worker-auth.js";

test("real Worker runtime serializes device and AI limits and removes deleted authorizations", async t => {
  const mf = new Miniflare({
    scriptPath: fileURLToPath(new URL("../worker-entry.js", import.meta.url)),
    modules: true, modulesRules: [{ type: "ESModule", include: ["**/*.js"] }], compatibilityDate: "2026-06-25",
    log: new Log(LogLevel.ERROR),
    kvNamespaces: ["SEAT_MANAGER_KV"],
    durableObjects: { ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } },
    bindings: { PRODUCT_TOKEN_SECRET: "test-only-product-secret", LICENSE_ADMIN_TOKEN: "test-only-admin", DEEPSEEK_API_KEY: "test-only-upstream", PRODUCT_ACCESS_CODE: "RUNTIME-ENV", PRODUCT_LICENSE_ID: "runtime-env" },
    outboundService: request => {
      assert.equal(new URL(request.url).origin, "https://api.deepseek.com");
      return Response.json({ choices: [{ message: { content: JSON.stringify({ overall: "本地测试", changes: "", suggestions: "", disclaimer: "" }) } }] });
    },
  });
  t.after(() => mf.dispose());
  const kv = await mf.getKVNamespace("SEAT_MANAGER_KV");
  const key = `seat-manager:license:${await sha256Hex("RUNTIME-TEST-CODE")}`;
  const stateKey = "seat-manager:license:runtime-teacher:state";
  await kv.put(key, JSON.stringify({ licenseId: "runtime-teacher", status: "active", allowedEditions: ["zhang", "commercial"], maxDevices: 1, aiEnabled: true, aiDailyLimit: 3, devices: [] }));
  const post = (path, body, token) => mf.dispatchFetch(`https://worker.test${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  const login = deviceId => post("/license/auth", { productCode: "RUNTIME-TEST-CODE", deviceId, edition: "zhang" });
  const attempts = await Promise.all([login("device-a"), login("device-b")]);
  assert.deepEqual(attempts.map(response => response.status).sort(), [200, 409]);
  const auth = await attempts.find(response => response.status === 200).json();
  const ai = await Promise.all(Array.from({ length: 5 }, () => post("/analyze-trend", { student: "学生A", recentExams: [{ name: "测试考试" }] }, auth.token)));
  assert.deepEqual(ai.map(response => response.status).sort(), [200, 200, 200, 429, 429]);
  const unbound = await post("/license/unbind-device", {}, auth.token);
  assert.equal(unbound.status, 200);
  assert.equal((await unbound.json()).removed, true);
  const denied = async token => {
    for (const path of ["/sync/status", "/sync/load"]) assert.equal((await mf.dispatchFetch(`https://worker.test${path}`, { headers: { Authorization: `Bearer ${token}` } })).status, 401, path);
    assert.equal((await post("/sync/save", { version: 1, data: { students: [], seatOrder: [] } }, token)).status, 401);
    assert.equal((await post("/analyze-trend", { student: "学生A", recentExams: [{}] }, token)).status, 401);
  };
  await denied(auth.token);
  const rebound = await (await login("device-c")).json();
  await denied(auth.token);
  const cleared = await post("/admin/licenses/clear-devices", { licenseKey: key }, "test-only-admin");
  assert.equal((await cleared.json()).license.deviceCount, 0);
  await denied(rebound.token);
  const fresh = await (await login("device-c")).json();
  await denied(rebound.token);
  for (const status of ["disabled", "active"]) assert.equal((await post("/admin/licenses/upsert", { licenseKey: key, status }, "test-only-admin")).status, 200);
  await denied(fresh.token);
  await kv.put(stateKey, JSON.stringify({ version: 1, data: { students: [], seatOrder: [] } }));
  const deleted = await post("/admin/licenses/delete", { licenseKey: key, licenseId: "runtime-teacher", deleteState: true }, "test-only-admin");
  assert.equal(deleted.status, 200);
  assert.equal(await kv.get(key), null);
  assert.equal(await kv.get(stateKey), null);
  await denied(fresh.token);
  assert.equal((await login("device-d")).status, 403, "the coordinator must not resurrect the deleted license");
  assert.equal((await post("/analyze-trend", { student: "学生A", recentExams: [{ name: "测试考试" }] }, auth.token)).status, 401);
  // Simulate a lagging KV mirror after deletion: the authoritative tombstone wins.
  await kv.put(key, JSON.stringify({ licenseId: "runtime-teacher", status: "active", allowedEditions: ["zhang"], devices: [] }));
  assert.equal((await login("stale-mirror-device")).status, 403);
  const recreated = await post("/admin/licenses/upsert", { licenseKey: key, licenseId: "runtime-teacher", acquisitionChannel: "wechat", allowedEditions: ["zhang"], maxDevices: 1 }, "test-only-admin");
  assert.equal(recreated.status, 200);
  assert.equal((await login("device-e")).status, 200);
  await denied(fresh.token);
  const attemptsByCode = await Promise.all(["RACE-A", "RACE-B", "RACE-C"].map(productCode => post("/admin/licenses/upsert", { productCode, licenseId: "same-label!", displayName: "同一名称", acquisitionChannel: "wechat" }, "test-only-admin")));
  const identities = await Promise.all(attemptsByCode.map(async response => { assert.equal(response.status, 200); return (await response.json()).license.licenseId; }));
  assert.equal(new Set(identities).size, 3);
  const immutable = await post("/admin/licenses/upsert", { licenseKey: key, licenseId: identities[0] }, "test-only-admin");
  assert.equal(immutable.status, 409);
  const renamed = await post("/admin/licenses/upsert", { licenseKey: key, displayName: "客户新名称" }, "test-only-admin");
  assert.equal((await renamed.json()).license.licenseId, "runtime-teacher");
  const legacyKey = `seat-manager:license:${await sha256Hex("LEGACY-ID")}`;
  await kv.put(legacyKey, JSON.stringify({ id: "old-space!", status: "active", devices: [] }));
  assert.equal((await post("/admin/licenses/delete", { licenseKey: legacyKey }, "test-only-admin")).status, 200);
  const legacyRecreated = await post("/admin/licenses/upsert", { licenseKey: legacyKey, acquisitionChannel: "wechat" }, "test-only-admin");
  assert.equal((await legacyRecreated.json()).license.licenseId, "old-space");
  const envAuth = await post("/license/auth", { productCode: "RUNTIME-ENV", deviceId: "env-device", edition: "commercial" });
  assert.equal(envAuth.status, 200);
  const envToken = (await envAuth.json()).token;
  const envKey = `seat-manager:license:${await sha256Hex("RUNTIME-ENV")}`;
  assert.equal((await post("/admin/licenses/delete", { licenseKey: envKey }, "test-only-admin")).status, 200);
  await denied(envToken);
  assert.equal((await post("/license/auth", { productCode: "RUNTIME-ENV", deviceId: "env-device", edition: "commercial" })).status, 403);
  for (const code of ["DUP-A", "DUP-B"]) await kv.put(`seat-manager:license:${await sha256Hex(code)}`, JSON.stringify({ licenseId: "duplicate-space", status: "active", allowedEditions: ["zhang"], devices: [] }));
  assert.equal((await post("/license/auth", { productCode: "DUP-A", deviceId: "dup-device", edition: "zhang" })).status, 409);
});
