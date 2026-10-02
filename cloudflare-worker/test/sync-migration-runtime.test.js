import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Log, LogLevel } from "miniflare";
import { sha256Hex } from "../worker-auth.js";
import { makeCutoverManifest } from "../scripts/sync-cutover-manifest.mjs";
import { contentHash, sha256, SYNC_MAX_BYTES } from "../../shared/sync-content.mjs";

const space = "synthetic-migration";
const key = `seat-manager:license:${space}:state`;
const source = marker => ({ version: 1, data: { students: [], seatOrder: [], marker } });
async function harness(t, snapshot = source("sealed"), extra = {}) {
  const directory = await mkdtemp(join(tmpdir(), "seat-migration-"));
  const manifest = await makeCutoverManifest({ space, snapshot, cutoverId: "synthetic-boundary", retiredWorkerVersion: "synthetic-retired-version", verifiedAt: new Date().toISOString(), oldWritersRetired: true, backupRetained: true });
  const vars = { PRODUCT_TOKEN_SECRET: "synthetic-migration-secret", SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "true", SYNC_COMMERCIAL_PROTOCOL_READY: "false", SYNC_CUTOVER_MANIFESTS: JSON.stringify(manifest), ...extra };
  const make = () => new Miniflare({ name: "migration-runtime", scriptPath: fileURLToPath(new URL("./fixtures/sync-runtime.js", import.meta.url)), modules: true,
    modulesRoot: fileURLToPath(new URL("../../", import.meta.url)), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR),
    kvNamespaces: ["SEAT_MANAGER_KV"], kvPersist: join(directory, "kv"), durableObjectsPersist: join(directory, "do"),
    durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } }, bindings: vars });
  let mf = make();
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  const kv = await mf.getKVNamespace("SEAT_MANAGER_KV");
  if (snapshot) await kv.put(key, JSON.stringify(snapshot));
  await kv.put(`seat-manager:license:${await sha256Hex("SYNTHETIC-MIGRATION")}`, JSON.stringify({ licenseId: space, status: "active", allowedEditions: ["zhang"], maxDevices: 3, devices: [] }));
  const call = (path, body, token = auth?.token || "") => mf.dispatchFetch(`https://worker.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let auth = await (await call("/license/auth", { productCode: "SYNTHETIC-MIGRATION", deviceId: "synthetic-device", edition: "zhang" }, "")).json();
  const prepare = (operationId = "synthetic-operation") => call("/sync/migration", { action: "prepare", operationId, acknowledgeAllWorkspaces: true });
  const backup = operation => call(`/sync/migration/backup?operationId=${operation.operationId}`);
  const commit = operation => call("/sync/migration", { action: "commit", operationId: operation.operationId, backupIntegrity: operation.backupIntegrity, acknowledgeBackup: true, acknowledgeAllWorkspaces: true });
  return { call, prepare, backup, commit, kv: () => mf.getKVNamespace("SEAT_MANAGER_KV"), async restart() { await mf.dispose(); mf = make(); } };
}

test("public migration freezes, verifies a retained backup and resumes exactly once after restart", async t => {
  const h = await harness(t);
  assert.equal((await (await h.call("/sync/status?protocol=2")).json()).ready, false, "GET never imports an enabled space");
  const operation = await (await h.prepare()).json(); assert.equal(operation.phase, "prepared");
  assert.equal((await h.call("/sync/save", source("blocked"))).status, 503);
  const backup = await (await h.backup(operation)).json();
  assert.equal(backup.integrity, await sha256(new TextEncoder().encode(JSON.stringify(backup.snapshot))));
  assert.equal(backup.hash, await contentHash(backup.snapshot));
  assert.equal((await h.call("/sync/migration", { action: "commit", operationId: operation.operationId, backupIntegrity: "wrong", acknowledgeBackup: true, acknowledgeAllWorkspaces: true })).status, 409);
  await h.restart(); assert.equal((await (await h.call("/sync/migration")).json()).phase, "prepared");
  // An old version's late direct KV write cannot become the committed source.
  await (await h.kv()).put(key, JSON.stringify(source("late-old-writer")));
  assert.equal((await h.commit(operation)).status, 200); assert.equal((await h.commit(operation)).status, 200);
  const loaded = await (await h.call("/sync/load?protocol=2")).json(); assert.equal(loaded.data.marker, "sealed"); assert.equal(loaded.revision, 1);
  await h.restart(); assert.equal((await (await h.call("/sync/load?protocol=2")).json()).hash, backup.hash);
  assert.equal((await h.call("/sync/migration", { action: "abort", operationId: operation.operationId, acknowledgeAllWorkspaces: true })).status, 409);
});

test("stale KV and unsealed rollout reject migration; abort releases the frozen legacy path", async t => {
  const h = await harness(t);
  await h.call(`/_test/source?key=${encodeURIComponent(key)}`, { enabled: true, snapshot: source("stale") });
  const failed = await h.prepare(); assert.equal(failed.status, 503); assert.equal((await failed.json()).error, "migration_source_not_settled");
  assert.equal((await h.call("/sync/save", source("while-frozen"))).status, 503);
  await h.call(`/_test/source?key=${encodeURIComponent(key)}`, { enabled: false });
  assert.equal((await h.call("/sync/migration", { action: "abort", operationId: "synthetic-operation", acknowledgeAllWorkspaces: true })).status, 200);
  assert.equal((await h.call("/sync/save", source("new-acknowledged"))).status, 200);
  const operation = await (await h.prepare("synthetic-operation-two")).json(); const backup = await (await h.backup(operation)).json();
  assert.equal(backup.snapshot.data.marker, "new-acknowledged", "durable post-boundary witness takes priority over a KV read");
  await h.call(`/_test/source?key=${encodeURIComponent(key)}`, { enabled: true, snapshot: source("stale-again") });
  assert.equal((await h.commit(operation)).status, 200);
  assert.equal((await (await h.call("/sync/load?protocol=2")).json()).data.marker, "new-acknowledged");
  const closed = await harness(t, source("unsealed"), { SYNC_CUTOVER_MANIFESTS: "{}" });
  assert.equal((await closed.prepare()).status, 403);
  assert.equal((await closed.call("/sync/save", source("old-commercial-shape"))).status, 200);
  assert.equal((await (await closed.call("/sync/status?protocol=2")).json()).ready, false);
});

test("public Zhang-only mode enables strict CAS and rejects blind writes without changing edition rights", async t => {
  const h = await harness(t); const operation = await (await h.prepare()).json(); await h.commit(operation);
  const head = await (await h.call("/sync/status?protocol=2")).json(); assert.equal(head.automaticAvailable, true);
  assert.equal((await h.call("/sync/mode", { enable: true, acknowledgeAllWorkspaces: true, epoch: head.epoch, baseRevision: head.revision, hash: head.hash })).status, 200);
  assert.equal((await h.call("/sync/save", source("blind"))).status, 409);
  const snapshot = source("safe"); const input = { ...snapshot, protocol: 2, epoch: head.epoch, baseRevision: head.revision, hash: await contentHash(snapshot), clientMutationId: "synthetic-mutation" };
  assert.equal((await h.call("/sync/save", input)).status, 200);
  await h.restart(); assert.equal((await (await h.call("/sync/status?protocol=2")).json()).strict, true);
});

test("near 5 MiB Chinese migration backup is chunked and failed commit keeps the prepared stage", async t => {
  const snapshot = source("large"); snapshot.padding = "中".repeat(Math.floor((SYNC_MAX_BYTES - 1024) / 3));
  const h = await harness(t, snapshot); const operation = await (await h.prepare()).json(); assert.ok(operation.bytes > SYNC_MAX_BYTES - 2048);
  const backup = await (await h.backup(operation)).json(); assert.equal(backup.snapshot.padding, snapshot.padding);
  const before = await (await h.call(`/_test/inspect?key=${encodeURIComponent(key)}`)).json(); assert.ok(before.migrationChunks.length >= 10); assert.ok(before.migrationChunks.every(row => row.bytes <= 512 * 1024));
  await h.call(`/_test/fail?key=${encodeURIComponent(key)}`);
  assert.equal((await h.commit(operation)).status, 503);
  const state = await (await h.call(`/_test/inspect?key=${encodeURIComponent(key)}`)).json(); assert.equal(state.head, null); assert.equal(state.chunks.length, 0); assert.deepEqual(state.migrationChunks, before.migrationChunks);
  await h.restart(); assert.equal((await (await h.call("/sync/migration")).json()).phase, "prepared");
  assert.equal((await h.commit(operation)).status, 200);
  assert.equal((await (await h.call("/sync/load?protocol=2")).json()).padding, snapshot.padding);
});

test("offline manifest builder requires explicit evidence and never derives retirement from versions alone", async () => {
  await assert.rejects(makeCutoverManifest({ space, snapshot: source("x"), cutoverId: "synthetic-boundary", retiredWorkerVersion: "new-version-known", verifiedAt: new Date().toISOString(), backupRetained: true }), /attestations/);
});

test("public mode rechecks mixed-edition protection after a queued license change", async t => {
  const h = await harness(t); const operation = await (await h.prepare()).json(); await h.commit(operation);
  const head = await (await h.call("/sync/status?protocol=2")).json(); assert.equal(head.automaticAvailable, true);
  await h.call(`/_test/expand-before-strict?key=${encodeURIComponent(key)}`);
  const response = await h.call("/sync/mode", { enable: true, acknowledgeAllWorkspaces: true, epoch: head.epoch, baseRevision: head.revision, hash: head.hash });
  assert.equal(response.status, 403); assert.equal((await response.json()).error, "automatic_disabled");
  assert.equal((await (await h.call("/sync/status?protocol=2")).json()).strict, false);
  assert.equal((await h.call("/sync/save", source("still-manual"))).status, 200);
});


test("deletion clears prepared backups and receipts and an empty tombstone never reimports old KV", async t => {
  const h = await harness(t); const operation = await (await h.prepare()).json(); await h.commit(operation);
  await h.call(`/_test/delete?key=${encodeURIComponent(key)}`, {});
  await (await h.kv()).put(key, JSON.stringify(source("lagging-deleted"))); await h.restart();
  const state = await (await h.call(`/_test/inspect?key=${encodeURIComponent(key)}`)).json();
  assert.equal(state.head.exists, false); assert.equal(state.migrationChunks.length, 0); assert.equal(state.receipts.length, 0); assert.equal(state.chunks.length, 0);
  assert.equal((await h.backup(operation)).status, 409); assert.equal((await h.commit(operation)).status, 409);
  assert.equal((await (await h.prepare()).json()).phase, "complete"); assert.equal((await h.call("/sync/load?protocol=2")).status, 404);
});


test("an older SQLite authority needs verified cutover proof without changing its revision or epoch", async t => {
  for (const snapshot of [source("sealed"), null]) {
    const h = await harness(t, snapshot); const original = await (await h.prepare()).json(); await h.commit(original);
    await h.call(`/_test/unverified?key=${encodeURIComponent(key)}`); await h.restart();
    const before = await (await h.call("/sync/status?protocol=2")).json(); assert.equal(before.automaticAvailable, false); assert.equal(before.migrationReady, false);
    assert.equal((await h.call("/sync/mode", { enable: true, acknowledgeAllWorkspaces: true, epoch: before.epoch, baseRevision: before.revision, hash: before.hash })).status, 403);
    const operation = await (await h.prepare("synthetic-reattest" )).json(); assert.equal(operation.phase, "prepared");
    assert.equal((await h.call("/sync/save", source("frozen-authority"))).status, 503); assert.equal((await h.commit(operation)).status, 200);
    const after = await (await h.call("/sync/status?protocol=2")).json(); assert.equal(after.migrationReady, true); assert.equal(after.epoch, before.epoch); assert.equal(after.revision, before.revision); assert.equal(after.hash, before.hash);
  }
});
