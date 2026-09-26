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
    bindings: { PRODUCT_TOKEN_SECRET: "test-only-product-secret", LICENSE_ADMIN_TOKEN: "test-only-admin", DEEPSEEK_API_KEY: "test-only-upstream" },
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
  assert.equal((await login("device-c")).status, 200);
  const cleared = await post("/admin/licenses/clear-devices", { licenseKey: key }, "test-only-admin");
  assert.equal((await cleared.json()).license.deviceCount, 0);
  await kv.put(stateKey, JSON.stringify({ version: 1, data: { students: [], seatOrder: [] } }));
  const deleted = await post("/admin/licenses/delete", { licenseKey: key, licenseId: "runtime-teacher", deleteState: true }, "test-only-admin");
  assert.equal(deleted.status, 200);
  assert.equal(await kv.get(key), null);
  assert.equal(await kv.get(stateKey), null);
  assert.equal((await login("device-d")).status, 403, "the coordinator must not resurrect the deleted license");
  assert.equal((await post("/analyze-trend", { student: "学生A", recentExams: [{ name: "测试考试" }] }, auth.token)).status, 401);
  // Simulate a lagging KV mirror after deletion: the authoritative tombstone wins.
  await kv.put(key, JSON.stringify({ licenseId: "runtime-teacher", status: "active", allowedEditions: ["zhang"], devices: [] }));
  assert.equal((await login("stale-mirror-device")).status, 403);
  const recreated = await post("/admin/licenses/upsert", { licenseKey: key, licenseId: "runtime-teacher", acquisitionChannel: "wechat", allowedEditions: ["zhang"], maxDevices: 1 }, "test-only-admin");
  assert.equal(recreated.status, 200);
  assert.equal((await login("device-e")).status, 200);
});
