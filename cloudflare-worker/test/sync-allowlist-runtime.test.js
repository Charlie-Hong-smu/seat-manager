import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Miniflare, Log, LogLevel } from "miniflare";
import { sha256Hex } from "../worker-auth.js";
import { makeCutoverManifest } from "../scripts/sync-cutover-manifest.mjs";
import { contentHash } from "../../shared/sync-content.mjs";

const A = "synthetic-allowed"; const B = "synthetic-excluded"; const C = "synthetic-legacy";
const source = marker => ({ version: 1, data: { students: [], seatOrder: [], marker } });
async function harness(t) {
  const directory = await mkdtemp(join(tmpdir(), "seat-allowlist-runtime-"));
  const manifest = {};
  for (const space of [A, B]) Object.assign(manifest, await makeCutoverManifest({ space, snapshot: source(space), cutoverId: `synthetic-cutover-${space}`, retiredWorkerVersion: "synthetic-retired", verifiedAt: new Date().toISOString(), oldWritersRetired: true, backupRetained: true }));
  const vars = { PRODUCT_TOKEN_SECRET: "synthetic-allowlist-secret", SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "true", SYNC_AUTOMATIC_SPACES: JSON.stringify([A]), SYNC_COMMERCIAL_PROTOCOL_READY: "false", SYNC_CUTOVER_MANIFESTS: JSON.stringify(manifest) };
  const make = () => new Miniflare({ name: "allowlist-runtime", scriptPath: fileURLToPath(new URL("./fixtures/sync-runtime.js", import.meta.url)), modules: true, modulesRoot: fileURLToPath(new URL("../../", import.meta.url)), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR), kvNamespaces: ["SEAT_MANAGER_KV"], kvPersist: join(directory, "kv"), durableObjectsPersist: join(directory, "do"), durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } }, bindings: vars });
  let mf = make(); const tokens = {};
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  const call = (space, path, body) => mf.dispatchFetch(`https://worker.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${tokens[space] || ""}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const kv = await mf.getKVNamespace("SEAT_MANAGER_KV");
  for (const space of [A, B, C]) {
    await kv.put(`seat-manager:license:${space}:state`, JSON.stringify(source(space)));
    const productCode = `SYNTHETIC-${space}`;
    await kv.put(`seat-manager:license:${await sha256Hex(productCode)}`, JSON.stringify({ licenseId: space, status: "active", allowedEditions: [space === C ? "commercial" : "zhang"], maxDevices: 3, devices: [] }));
    tokens[space] = (await (await call(space, "/license/auth", { productCode, deviceId: `device-${space}`, edition: space === C ? "commercial" : "zhang" })).json()).token;
  }
  for (const space of [A, B]) {
    const operation = await (await call(space, "/sync/migration", { action: "prepare", operationId: `operation-${space}`, acknowledgeAllWorkspaces: true })).json();
    assert.equal(operation.phase, "prepared");
    assert.equal((await call(space, "/sync/migration", { action: "commit", operationId: operation.operationId, backupIntegrity: operation.backupIntegrity, acknowledgeBackup: true, acknowledgeAllWorkspaces: true })).status, 200);
  }
  return { call, async restart(changes) { Object.assign(vars, changes); await mf.dispose(); mf = make(); }, async head(space) { return (await call(space, "/sync/status?protocol=2")).json(); }, async mode(space, extra = {}) { const head = await this.head(space); return call(space, "/sync/mode", { enable: true, acknowledgeAllWorkspaces: true, epoch: head.epoch, baseRevision: head.revision, hash: head.hash, ...extra }); } };
}
async function input(head, marker) { const snapshot = source(marker); return { ...snapshot, protocol: 2, epoch: head.epoch, baseRevision: head.revision, clientMutationId: crypto.randomUUID(), hash: await contentHash(snapshot) }; }

test("public allowlist isolates two migrated spaces and preserves excluded manual and legacy paths", async t => {
  const h = await harness(t);
  assert.equal((await h.head(A)).automaticAvailable, true); assert.equal((await h.head(B)).automaticAvailable, false);
  assert.equal((await h.call(B, "/sync/migration").then(r => r.json())).phase, "complete", "migration alone cannot grant automatic eligibility");
  assert.equal((await h.mode(B, { licenseId: A, space: A, automaticAvailable: true })).status, 403);
  assert.equal((await h.head(B)).strict, false); assert.equal((await h.mode(A)).status, 200);
  assert.equal((await h.call(A, "/sync/save", source("blocked-blind"))).status, 409);
  const saved = await h.call(B, "/sync/save", await input(await h.head(B), "manual-cas")); assert.equal(saved.status, 200); assert.equal((await saved.json()).automaticAvailable, false);
  assert.equal((await (await h.call(B, "/sync/load?protocol=2")).json()).automaticAvailable, false);
  assert.equal((await h.call(B, "/sync/save", source("manual-legacy"))).status, 200); assert.equal((await (await h.call(B, "/sync/load")).json()).data.marker, "manual-legacy");
  assert.equal((await h.call(C, "/sync/save", source("old-commercial"))).status, 200); assert.equal((await (await h.call(C, "/sync/load")).json()).data.marker, "old-commercial"); assert.equal((await h.head(C)).ready, false);
  assert.equal((await h.call(C, "/sync/migration", { action: "prepare", operationId: "unlisted-migration", acknowledgeAllWorkspaces: true })).status, 403);
});

test("removal, malformed lists and master closure refresh receipts without undoing strict or CAS", async t => {
  const h = await harness(t); assert.equal((await h.mode(A)).status, 200);
  const payload = await input(await h.head(A), "lost-response"); const receipt = await (await h.call(A, "/sync/save", payload)).json(); assert.equal(receipt.automaticAvailable, true);
  await h.restart({ SYNC_AUTOMATIC_SPACES: JSON.stringify([B]) });
  assert.equal((await h.head(A)).automaticAvailable, false); assert.equal((await h.head(A)).strict, true); assert.equal((await h.mode(A)).status, 403);
  const replay = await (await h.call(A, "/sync/save", payload)).json(); assert.equal(replay.revision, receipt.revision); assert.equal(replay.hash, receipt.hash); assert.equal(replay.updatedAt, receipt.updatedAt); assert.equal(replay.automaticAvailable, false);
  assert.equal((await h.call(A, "/sync/save", source("no-blind-rollback"))).status, 409);
  const manual = await (await h.call(A, "/sync/save", await input(await h.head(A), "still-manual"))).json(); assert.equal(manual.ok, true); assert.equal(manual.automaticAvailable, false);
  for (const list of ["[]", "malformed", JSON.stringify([A, "*"])]) {
    await h.restart({ SYNC_AUTOMATIC_SPACES: list });
    for (const space of [A, B]) { assert.equal((await h.head(space)).automaticAvailable, false); assert.equal((await h.mode(space)).status, 403); }
  }
  await h.restart({ SYNC_AUTOMATIC_SPACES: JSON.stringify([A]), SYNC_AUTOMATIC_ENABLED: "false" });
  assert.equal((await h.head(A)).automaticAvailable, false); assert.equal((await h.mode(A)).status, 403);
});

test("public mode rechecks the allowlist at the coordinator rather than trusting the earlier head", async t => {
  const h = await harness(t); const head = await h.head(A); assert.equal(head.automaticAvailable, true);
  await h.call(A, `/_test/exclude-before-strict?key=${encodeURIComponent(`seat-manager:license:${A}:state`)}`, {});
  const response = await h.call(A, "/sync/mode", { enable: true, acknowledgeAllWorkspaces: true, epoch: head.epoch, baseRevision: head.revision, hash: head.hash });
  assert.equal(response.status, 403); assert.equal((await response.json()).error, "automatic_disabled"); assert.equal((await h.head(A)).strict, false);
});
