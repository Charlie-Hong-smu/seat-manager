import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Log, LogLevel } from "miniflare";
import { sha256Hex, signToken } from "../worker-auth.js";
import { contentHash, SYNC_MAX_BYTES } from "../../shared/sync-content.mjs";

const key = "seat-manager:single-teacher:state";
const data = marker => ({ students: [{ id: "synthetic", name: "合成学生" }], seatOrder: ["synthetic"], marker });
const book = marker => ({ version: 1, currentSliceId: "slice-a", unknown: { retained: true }, slices: [{ id: "slice-a", classId: "class-a", className: "合成班级", createdAt: "2026-10-01", updatedAt: "2026-10-01", term: { id: "term-a", year: 2026, season: "autumn", label: "秋", createdAt: "2026-10-01" }, data: data(marker) }] });
function runtime(directory, vars = {}) {
  return new Miniflare({ name: "sync-runtime", scriptPath: fileURLToPath(new URL("./fixtures/sync-runtime.js", import.meta.url)), modules: true,
    modulesRoot: fileURLToPath(new URL("../../", import.meta.url)), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR),
    kvNamespaces: ["SEAT_MANAGER_KV"], kvPersist: join(directory, "kv"), durableObjectsPersist: join(directory, "do"),
    durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } },
    bindings: { SYNC_TOKEN_SECRET: "synthetic-sync-secret", PRODUCT_TOKEN_SECRET: "synthetic-product-secret", LICENSE_ADMIN_TOKEN: "synthetic-admin", SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "false", ...vars },
  });
}
async function harness(t, vars) {
  const directory = await mkdtemp(join(tmpdir(), "seat-sync-runtime-"));
  let mf = runtime(directory, vars);
  const token = await signToken({ scope: "seat-sync", exp: Date.now() + 3600000 }, "synthetic-sync-secret");
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  return {
    kv: () => mf.getKVNamespace("SEAT_MANAGER_KV"),
    call: (path, body, auth = token) => mf.dispatchFetch(`https://worker.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    async restart(nextVars = vars) { await mf.dispose(); mf = runtime(directory, nextVars); },
  };
}
async function payload(head, marker, mutation = crypto.randomUUID()) {
  const snapshot = { version: 1, deviceName: "合成手机", data: data(marker), workspaceBook: book(marker) };
  return { ...snapshot, protocol: 2, baseRevision: head.revision, epoch: head.epoch, clientMutationId: mutation, hash: await contentHash(snapshot) };
}

test("SQLite CAS, lost response receipts and restart preserve one authoritative commit", async t => {
  const h = await harness(t);
  const kv = await h.kv();
  await kv.put(key, JSON.stringify({ version: 1, updatedAt: "old", deviceName: "旧设备", data: data("old"), workspaceBook: book("old") }));
  await h.call("/_test/migrate");
  const initial = await Promise.all([h.call("/sync/status?protocol=2"), h.call("/sync/status?protocol=2")]);
  const [a, b] = await Promise.all(initial.map(r => r.json()));
  assert.equal(a.revision, 1); assert.deepEqual(a, b);
  const attempts = await Promise.all([payload(a, "new-a"), payload(a, "new-b")]);
  const responses = await Promise.all(attempts.map(body => h.call("/sync/save", body)));
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const winning = attempts[responses.findIndex(r => r.status === 200)];
  const receipt = await responses.find(r => r.status === 200).json();
  await h.restart();
  const retried = await h.call("/sync/save", winning); assert.equal(retried.status, 200);
  const retriedReceipt = await retried.json();
  assert.equal(retriedReceipt.revision, receipt.revision); assert.equal(retriedReceipt.hash, receipt.hash); assert.equal(retriedReceipt.updatedAt, receipt.updatedAt);
  const wrongId = await payload(a, "different", winning.clientMutationId);
  assert.equal((await h.call("/sync/save", wrongId)).status, 409);
  const loaded = await (await h.call("/sync/load?protocol=2")).json();
  assert.deepEqual(loaded.workspaceBook, winning.workspaceBook);
  assert.equal(loaded.revision, 2);
  await (await h.kv()).put(key, JSON.stringify({ version: 1, data: data("lagging") }));
  assert.equal((await (await h.call("/sync/load?protocol=2")).json()).hash, receipt.hash, "never re-import a stale KV mirror");
  const legacy = await h.call("/sync/save", { version: 1, data: data("legacy") }); assert.equal(legacy.status, 200);
  const legacyStatus = await (await h.call("/sync/status")).json();
  const { ok, ...legacySaved } = await legacy.json(); assert.equal(ok, true); assert.deepEqual(legacyStatus, { exists: true, ...legacySaved });
  assert.equal((await (await h.call("/sync/status?protocol=2")).json()).revision, 3);
  assert.equal((await h.call("/sync/save", await payload(receipt, "stale"))).status, 409);
});

test("5 MiB multibyte chunks, rollback and deletion survive real runtime restart", async t => {
  const h = await harness(t);
  await h.call("/_test/migrate");
  const head = await (await h.call("/sync/status?protocol=2")).json();
  const input = await payload(head, "large");
  input.workspaceBook.padding = "中".repeat(Math.floor((SYNC_MAX_BYTES - new TextEncoder().encode(JSON.stringify(input)).length - 1024) / 3));
  input.hash = await contentHash(input);
  assert.ok(new TextEncoder().encode(JSON.stringify(input)).length > SYNC_MAX_BYTES - 2048);
  assert.equal((await h.call("/sync/save", input)).status, 200);
  const inspect = await (await h.call("/_test/inspect")).json();
  assert.ok(inspect.chunks.length >= 10); assert.ok(inspect.chunks.every(c => c.bytes <= 512 * 1024));
  await h.restart();
  const loaded = await (await h.call("/sync/load?protocol=2")).json();
  assert.equal(loaded.workspaceBook.padding, input.workspaceBook.padding);
  await h.call("/_test/fail");
  const next = await payload(loaded, "failed");
  assert.equal((await h.call("/sync/save", next)).status, 503);
  const after = await (await h.call("/_test/inspect")).json();
  assert.equal(after.head.revision, loaded.revision); assert.deepEqual(after.chunks, inspect.chunks); assert.deepEqual(after.receipts, inspect.receipts);
  const tooLarge = { ...input, workspaceBook: { ...input.workspaceBook, padding: input.workspaceBook.padding + "中".repeat(2000) } };
  assert.equal((await h.call("/sync/save", tooLarge)).status, 413);
  const removed = await (await h.call("/_test/delete", {})).json();
  assert.notEqual(removed.epoch, loaded.epoch);
  await (await h.kv()).put(key, JSON.stringify({ version: 1, data: data("stale-deleted") }));
  await h.restart();
  assert.equal((await (await h.call("/sync/status?protocol=2")).json()).exists, false);
  assert.equal((await h.call("/sync/load")).status, 404);
  assert.equal((await h.call("/sync/save", input)).status, 409);
  const empty = await (await h.call("/_test/inspect")).json(); assert.equal(empty.chunks.length, 0); assert.equal(empty.receipts.length, 0);
});

test("migration and automatic release gates preserve old clients and protect strict spaces", async t => {
  const h = await harness(t, { SYNC_MIGRATION_ENABLED: "false" });
  assert.equal((await h.call("/sync/save", { version: 1, data: data("old-commercial") })).status, 200);
  assert.equal((await (await h.call("/sync/load")).json()).data.marker, "old-commercial");
  const cold = await (await h.call("/sync/status?protocol=2")).json(); assert.equal(cold.ready, false);
  assert.equal((await h.call("/sync/save", { ...await payload({ epoch: "pending", revision: 0 }, "new"), epoch: "pending" })).status, 503);
  assert.equal((await (await h.call("/_test/inspect")).json()).head, null);
  await h.restart({ SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "true" });
  await h.call("/_test/migrate");
  const head = await (await h.call("/sync/status?protocol=2")).json();
  const strict = await (await h.call("/_test/strict", { baseRevision: head.revision, epoch: head.epoch, hash: head.hash })).json(); assert.equal(strict.strict, true);
  const rejected = await h.call("/sync/save", { version: 1, data: data("blind") }); assert.equal(rejected.status, 409); assert.equal((await rejected.json()).error, "upgrade_required");
  assert.equal((await h.call("/sync/save", await payload(head, "safe"))).status, 200);
  await h.restart({ SYNC_MIGRATION_ENABLED: "false", SYNC_AUTOMATIC_ENABLED: "false" });
  const still = await (await h.call("/sync/status?protocol=2")).json(); assert.equal(still.ready, true); assert.equal(still.strict, true); assert.equal(still.automaticAvailable, false);
  assert.equal((await h.call("/sync/save", { version: 1, data: data("rollback-blind") })).status, 409);
  assert.equal((await (await h.call("/_test/strict", { baseRevision: still.revision, epoch: still.epoch, hash: still.hash })).json()).error, "automatic_disabled");
});

test("mirror failure commits authority and retries only the latest snapshot", async t => {
  const h = await harness(t); await h.call("/_test/migrate"); const head = await (await h.call("/sync/status?protocol=2")).json();
  await h.call("/_test/mirror", { fail: true });
  const saved = await h.call("/sync/save", await payload(head, "mirror-pending")); assert.equal(saved.status, 200);
  const receipt = await saved.json(); assert.equal(receipt.mirrorPending, true);
  assert.equal((await (await h.call("/sync/load?protocol=2")).json()).data.marker, "mirror-pending");
  await h.restart(); await h.call("/_test/alarm", {});
  assert.equal(JSON.parse(await (await h.kv()).get(key)).data.marker, "mirror-pending");
  assert.equal((await (await h.call("/sync/status?protocol=2")).json()).mirrorPending, false);
});

test("mixed Commercial/Zhang licenses cannot enable strict mode and admin deletion closes every store", async t => {
  const h = await harness(t, { SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "true", SYNC_COMMERCIAL_PROTOCOL_READY: "false" });
  const licenseKey = `seat-manager:license:${await sha256Hex("SYNTHETIC-MIXED")}`;
  const stateKey = "seat-manager:license:synthetic-mixed:state";
  await (await h.kv()).put(licenseKey, JSON.stringify({ licenseId: "synthetic-mixed", status: "active", allowedEditions: ["zhang", "commercial"], maxDevices: 3, devices: [] }));
  const auth = await (await h.call("/license/auth", { productCode: "SYNTHETIC-MIXED", deviceId: "synthetic-device", edition: "zhang" }, "")).json();
  const old = await h.call("/sync/save", { version: 1, data: data("commercial-manual") }, auth.token); assert.equal(old.status, 200);
  await h.call(`/_test/migrate?key=${encodeURIComponent(stateKey)}`);
  const head = await (await h.call("/sync/status?protocol=2", undefined, auth.token)).json(); assert.equal(head.automaticAvailable, false);
  assert.equal((await h.call("/sync/mode", { enable: true, acknowledgeAllWorkspaces: true, epoch: head.epoch, baseRevision: head.revision, hash: head.hash }, auth.token)).status, 403);
  const cas = await payload(head, "safe-mixed"); assert.equal((await h.call("/sync/save", cas, auth.token)).status, 200);
  assert.equal((await h.call("/admin/licenses/delete", { licenseKey, deleteState: true }, "synthetic-admin")).status, 200);
  assert.equal((await h.call("/sync/save", cas, auth.token)).status, 401);
  await (await h.kv()).put(stateKey, JSON.stringify({ version: 1, data: data("lagging-after-delete") }));
  await h.restart({ SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "true", SYNC_COMMERCIAL_PROTOCOL_READY: "false" });
  const debug = await (await h.call(`/_test/inspect?key=${encodeURIComponent(stateKey)}`)).json();
  assert.equal(debug.head.exists, false); assert.notEqual(debug.head.epoch, head.epoch); assert.equal(debug.chunks.length, 0); assert.equal(debug.receipts.length, 0);
  assert.equal((await h.call("/admin/licenses/upsert", { licenseKey, allowedEditions: ["zhang", "commercial"], acquisitionChannel: "wechat" }, "synthetic-admin")).status, 200);
  const fresh = await (await h.call("/license/auth", { productCode: "SYNTHETIC-MIXED", deviceId: "synthetic-device", edition: "commercial" }, "")).json();
  assert.equal((await h.call("/sync/load", undefined, fresh.token)).status, 404);
  assert.equal((await h.call("/sync/save", { version: 1, data: data("explicit-new-manual") }, fresh.token)).status, 200);
  assert.equal((await h.call("/sync/save", cas, auth.token)).status, 401);
});
