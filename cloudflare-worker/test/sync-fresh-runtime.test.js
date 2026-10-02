import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Miniflare, Log, LogLevel } from "miniflare";
import { sha256Hex } from "../worker-auth.js";
import { freshTestGrant } from "../worker-sync-fresh.js";
import { canonicalJson, contentHash } from "../../shared/sync-content.mjs";

const code = "SYNTHETIC-FRESH-ONLY";
const codeB = "SYNTHETIC-UNLISTED-FRESH";
const space = `tenant-${await sha256Hex(code)}`;
const key = `seat-manager:license:${space}:state`;
const licenseKey = `seat-manager:license:${await sha256Hex(code)}`;
const source = marker => ({ version: 1, data: { students: [{ id: "synthetic-pupil", name: "虚构学生", gender: "男" }], seatOrder: ["synthetic-pupil"], marker } });
const now = Date.now(); const createdAt = new Date(now - 60_000).toISOString();
const grant = { purpose: "synthetic-test", displayName: "同步合成测试-20261002", licenseCreatedAt: createdAt, approvedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString() };
const record = { licenseId: space, displayName: grant.displayName, status: "active", allowedEditions: ["zhang"], maxDevices: 3, aiEnabled: false, devices: [], createdAt };

async function harness(t, extra = {}) {
  const directory = await mkdtemp(join(tmpdir(), "seat-fresh-runtime-"));
  let vars = { PRODUCT_TOKEN_SECRET: "synthetic-fresh-runtime-secret", SYNC_FRESH_INITIALIZATION_ENABLED: "true", SYNC_FRESH_TEST_GRANTS: JSON.stringify({ [space]: grant }), SYNC_MIGRATION_ENABLED: "false", SYNC_CUTOVER_MANIFESTS: "{}", SYNC_AUTOMATIC_ENABLED: "false", SYNC_AUTOMATIC_SPACES: "[]", SYNC_COMMERCIAL_PROTOCOL_READY: "false", ...extra };
  const make = () => new Miniflare({ name: "fresh-runtime", scriptPath: fileURLToPath(new URL("./fixtures/sync-runtime.js", import.meta.url)), modules: true, modulesRoot: fileURLToPath(new URL("../../", import.meta.url)), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR), kvNamespaces: ["SEAT_MANAGER_KV"], kvPersist: join(directory, "kv"), durableObjectsPersist: join(directory, "do"), durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } }, bindings: vars });
  let mf = make();
  t.after(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  const kv = await mf.getKVNamespace("SEAT_MANAGER_KV");
  await kv.put(licenseKey, JSON.stringify(record));
  await kv.put(`seat-manager:license:${await sha256Hex(codeB)}`, JSON.stringify({ ...record, licenseId: `tenant-${await sha256Hex(codeB)}` }));
  const call = (path, body, token = auth?.token || "") => mf.dispatchFetch(`https://worker.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const login = (productCode = code, deviceId = "synthetic-first") => call("/license/auth", { productCode, deviceId, edition: "zhang" }, "").then(response => response.json());
  let auth = await login();
  const initialize = (id = "synthetic-init-first", token = auth.token, overrides = {}) => call("/sync/migration", { action: "initialize", operationId: id, acknowledgeAllWorkspaces: true, acknowledgeSyntheticTestOnly: true, acknowledgeIgnoreLateLegacy: true, ...overrides }, token);
  const inspect = () => call(`/_test/inspect?key=${encodeURIComponent(key)}`).then(response => response.json());
  return { call, login, initialize, inspect, fault: stage => call(`/_test/fresh-fault?key=${encodeURIComponent(key)}`, { stage }), kv: () => mf.getKVNamespace("SEAT_MANAGER_KV"), async restart(extraVars = {}) { await mf.dispose(); vars = { ...vars, ...extraVars }; mf = make(); } };
}

test("fresh grants require one exact new synthetic license and complete matching operator metadata", () => {
  const env = { SYNC_FRESH_INITIALIZATION_ENABLED: "true", SYNC_FRESH_TEST_GRANTS: JSON.stringify({ [space]: grant }) };
  assert.ok(freshTestGrant(env, space, record, now));
  for (const grants of ["{}", "[]", "invalid", JSON.stringify({ [space]: { ...grant, purpose: undefined } }), JSON.stringify({ [space]: { ...grant, licenseCreatedAt: undefined } }), JSON.stringify({ [space]: grant, wildcard: grant })]) assert.equal(freshTestGrant({ ...env, SYNC_FRESH_TEST_GRANTS: grants }, space, record, now), null);
  for (const change of [{ aiEnabled: true }, { maxDevices: 4 }, { allowedEditions: ["zhang", "commercial"] }, { displayName: "真实教师" }, { createdAt: new Date(now - 49 * 3_600_000).toISOString() }]) assert.equal(freshTestGrant(env, space, { ...record, ...change }, now), null);
  assert.equal(freshTestGrant({ ...env, SYNC_FRESH_INITIALIZATION_ENABLED: "false" }, space, record, now), null);
});

test("two authorized clients racing different initialization IDs create exactly one strict empty authority", async t => {
  const h = await harness(t); const second = await h.login(code, "synthetic-second");
  const responses = await Promise.all([h.initialize("synthetic-first-id"), h.initialize("synthetic-second-id", second.token)]);
  assert.deepEqual(responses.map(item => item.status).sort(), [200, 409]);
  const state = await h.inspect(); assert.equal(state.head.strict, true); assert.equal(state.head.revision, 0); assert.equal(state.head.exists, false); assert.equal(state.chunks.length, 0);
  assert.equal(state.head.cutoverId, undefined); assert.equal(state.freshInitialization.phase, "complete"); assert.equal(await (await h.kv()).get(key), null);
  assert.equal((await h.call("/sync/save", source("blind"))).status, 409);
});

test("duplicate clicks and a lost response replay the same receipt after SQLite restart", async t => {
  const h = await harness(t);
  const replies = await Promise.all([h.initialize(), h.initialize()]);
  assert.deepEqual(replies.map(item => item.status), [200, 200]);
  const first = (await replies[0].json()).initializationReceipt;
  assert.deepEqual((await replies[1].json()).initializationReceipt, first);
  await h.restart(); const replay = await h.initialize(); assert.equal(replay.status, 200); assert.deepEqual((await replay.json()).initializationReceipt, first);
  assert.equal((await h.inspect()).head.epoch, first.epoch);
});

test("read interruption and transaction failure keep a persistent fence and recover once after restart", async t => {
  for (const stage of ["read", "commit"]) {
    const h = await harness(t); await h.fault(stage);
    assert.equal((await h.initialize()).status, 503);
    const interrupted = await h.inspect(); assert.equal(interrupted.head, null); assert.equal(interrupted.freshInitialization.phase, "checking");
    assert.equal((await h.call("/sync/save", source("during-interruption"))).status, 503);
    await h.restart(); assert.equal((await h.initialize("synthetic-other-id")).status, 409); assert.equal((await h.initialize()).status, 200);
    assert.equal((await h.inspect()).head.revision, 0);
  }
});

test("visible old values are never imported and explicit cancellation releases an unfinished fence", async t => {
  for (const raw of [JSON.stringify(source("existing")), "null", "", "invalid-json"]) {
    const h = await harness(t); await (await h.kv()).put(key, raw);
    assert.equal((await h.initialize()).status, 409); assert.equal((await h.inspect()).head, null); assert.equal(await (await h.kv()).get(key), raw);
    await h.restart(); const cancelled = await h.call("/sync/migration", { action: "cancel-initialization", operationId: "synthetic-init-first", acknowledgeAllWorkspaces: true });
    assert.equal(cancelled.status, 200); assert.equal((await h.call("/sync/save", source("manual-after-cancel"))).status, 200);
  }
});

test("existing migrated heads and deletion tombstones cannot be reinitialized", async t => {
  for (const setup of ["migrate", "delete"]) {
    const h = await harness(t, { SYNC_MIGRATION_ENABLED: "true" });
    await h.call(`/_test/${setup}?key=${encodeURIComponent(key)}`, {}); const before = (await h.inspect()).head;
    assert.ok(before); assert.equal((await h.initialize()).status, 409); assert.deepEqual((await h.inspect()).head, before);
  }
});

test("an aborted migration retains its nonempty SQLite source and refuses fresh initialization when KV becomes invisible", async t => {
  const snapshot = source("retained-aborted-source");
  const manifest = { [space]: { cutoverId: "synthetic-abort-cutover", retiredWorkerVersion: "synthetic-retired", sourceIntegrity: await sha256Hex(canonicalJson(snapshot)), oldWritersRetired: true, backupRetained: true, verifiedAt: new Date().toISOString() } };
  const h = await harness(t, { SYNC_MIGRATION_ENABLED: "true", SYNC_CUTOVER_MANIFESTS: JSON.stringify(manifest) });
  await (await h.kv()).put(key, JSON.stringify(snapshot));
  const prepared = await h.call("/sync/migration", { action: "prepare", operationId: "synthetic-aborted-migration", acknowledgeAllWorkspaces: true });
  assert.equal(prepared.status, 200); assert.equal((await prepared.json()).phase, "prepared");
  const aborted = await h.call("/sync/migration", { action: "abort", operationId: "synthetic-aborted-migration", acknowledgeAllWorkspaces: true });
  assert.equal(aborted.status, 200); assert.equal((await aborted.json()).phase, "aborted");
  const retained = await (await h.call(`/_test/migration-source?key=${encodeURIComponent(key)}`)).json();
  assert.deepEqual(retained.snapshot, snapshot); assert.equal(retained.operation.phase, "aborted");
  const before = await h.inspect(); assert.equal(before.head, null); assert.ok(before.migrationChunks.length > 0);
  await h.restart(); await h.call(`/_test/source?key=${encodeURIComponent(key)}`, { enabled: true, snapshot: null });
  const status = await (await h.call("/sync/migration")).json(); assert.equal(status.freshInitialization.available, false);
  const refused = await h.initialize(); assert.equal(refused.status, 409); assert.equal((await refused.json()).error, "initialization_existing_source");
  const after = await h.inspect(); assert.equal(after.head, null); assert.equal(after.freshInitialization, null); assert.deepEqual(after.migrationChunks, before.migrationChunks);
  assert.deepEqual(await (await h.call(`/_test/migration-source?key=${encodeURIComponent(key)}`)).json(), retained);
});

test("late and invisible legacy KV writes are isolated, never claimed as migration or loaded into authority", async t => {
  const h = await harness(t); const operation = await (await h.initialize()).json();
  await (await h.kv()).put(key, JSON.stringify(source("late-old-writer"))); await h.restart();
  const head = await (await h.call("/sync/status?protocol=2")).json(); assert.equal(head.ready, true); assert.equal(head.exists, false); assert.equal(head.initializationReady, true); assert.equal(head.migrationReady, false); assert.equal(head.authoritySource, "fresh-test-initialization"); assert.equal(head.automaticAvailable, false);
  assert.equal((await h.call("/sync/load")).status, 404); assert.equal((await h.call("/sync/load?protocol=2")).status, 404);
  const snapshot = source("explicit-local-cas"); assert.equal((await h.call("/sync/save", { ...snapshot, protocol: 2, epoch: operation.initializationReceipt.epoch, baseRevision: 0, clientMutationId: "synthetic-first-cas", hash: await contentHash(snapshot) })).status, 200);
  await (await h.kv()).put(key, JSON.stringify(source("another-late-write"))); await h.restart(); assert.equal((await (await h.call("/sync/load?protocol=2")).json()).data.marker, "explicit-local-cas");
  await h.call(`/_test/delete?key=${encodeURIComponent(key)}`, {}); assert.equal((await h.initialize()).status, 409); assert.equal((await h.inspect()).head.strict, true);
  const stale = await harness(t); await (await stale.kv()).put(key, JSON.stringify(source("hidden-earlier-write")));
  await stale.call(`/_test/source?key=${encodeURIComponent(key)}`, { enabled: true, snapshot: null });
  assert.equal((await stale.initialize()).status, 200, "explicit synthetic initialization is not a historical no-writes attestation");
  await stale.call(`/_test/source?key=${encodeURIComponent(key)}`, { enabled: false });
  assert.ok(await (await stale.kv()).get(key), "initialization does not delete or import the invisible source");
  assert.equal((await stale.call("/sync/load?protocol=2")).status, 404);
});

test("a deleted and reissued license cannot masquerade as a newly issued test, even without a snapshot", async t => {
  const h = await harness(t); await h.call(`/_test/recreate-license?key=${encodeURIComponent(licenseKey)}`, {});
  const rebound = await h.login(code, "synthetic-reissued-device");
  assert.equal((await h.initialize("synthetic-reissued-attempt", rebound.token)).status, 403); assert.equal((await h.inspect()).head, null);
});

test("deleting during an interrupted initialization leaves a tombstone and does not strand the pending fence", async t => {
  const h = await harness(t); await h.fault("read"); await h.initialize(); await h.call(`/_test/delete?key=${encodeURIComponent(key)}`, {});
  assert.equal((await h.inspect()).freshInitialization.phase, "cancelled"); assert.equal((await h.initialize()).status, 409);
  assert.equal((await h.call("/sync/save", source("after-explicit-delete"))).status, 200);
});

test("a missing committed head never falls back to KV or creates a second initialization", async t => {
  const h = await harness(t); await h.initialize(); await h.call(`/_test/lose-fresh-head?key=${encodeURIComponent(key)}`, {});
  await (await h.kv()).put(key, JSON.stringify(source("mirror-must-not-be-authority")));
  const retained = (await h.inspect()).freshInitialization;
  const cancelled = await h.call("/sync/migration", { action: "cancel-initialization", operationId: retained.operationId, acknowledgeAllWorkspaces: true });
  assert.equal(cancelled.status, 409); assert.deepEqual((await h.inspect()).freshInitialization, retained);
  assert.equal((await h.call("/sync/status?protocol=2")).status, 503); assert.equal((await h.call("/sync/load")).status, 503);
  assert.equal((await h.call("/sync/save", source("blind-fallback"))).status, 503); assert.equal((await h.initialize()).status, 409);
  await h.restart(); assert.deepEqual((await h.inspect()).freshInitialization, retained);
  assert.equal((await h.call("/sync/status?protocol=2")).status, 503); assert.equal((await h.call("/sync/load?protocol=2")).status, 503);
  assert.equal((await h.call("/sync/save", source("blind-fallback-after-restart"))).status, 503); assert.equal((await h.initialize()).status, 409);
  await h.call(`/_test/delete?key=${encodeURIComponent(key)}`, {}); assert.equal((await h.inspect()).head.strict, true);
});

test("disabled or revoked grants reject creation and retries; cancellation remains available", async t => {
  const closed = await harness(t, { SYNC_FRESH_INITIALIZATION_ENABLED: "false" }); assert.equal((await closed.initialize()).status, 403); assert.equal((await closed.inspect()).freshInitialization, null);
  const h = await harness(t); await h.fault("close"); assert.equal((await h.initialize()).status, 403); assert.equal((await h.inspect()).head, null);
  await h.restart({ SYNC_FRESH_INITIALIZATION_ENABLED: "false" }); assert.equal((await h.initialize()).status, 403);
  assert.equal((await h.call("/sync/migration", { action: "cancel-initialization", operationId: "synthetic-init-first", acknowledgeAllWorkspaces: true })).status, 200);
  const completed = await harness(t); await completed.initialize(); await completed.restart({ SYNC_FRESH_INITIALIZATION_ENABLED: "false" }); assert.equal((await completed.initialize()).status, 403); assert.equal((await completed.inspect()).head.strict, true);
});

test("a completed fresh authority keeps independent automatic gates and live Commercial checks after the fresh grant closes", async t => {
  const h = await harness(t); const receipt = (await (await h.initialize()).json()).initializationReceipt;
  const mode = { enable: true, acknowledgeAllWorkspaces: true, epoch: receipt.epoch, baseRevision: 0, hash: "" };
  assert.equal((await h.call("/sync/mode", mode)).status, 403);
  await h.restart({ SYNC_FRESH_INITIALIZATION_ENABLED: "false", SYNC_FRESH_TEST_GRANTS: "{}", SYNC_AUTOMATIC_ENABLED: "true", SYNC_AUTOMATIC_SPACES: JSON.stringify([space]) });
  const head = await (await h.call("/sync/status?protocol=2")).json();
  assert.equal(head.initializationReady, true); assert.equal(head.migrationReady, false); assert.equal(head.automaticAvailable, true);
  assert.equal((await h.call("/sync/mode", { ...mode, acknowledgeAllWorkspaces: false })).status, 400);
  assert.equal((await h.call("/sync/mode", { ...mode, baseRevision: 1 })).status, 409);
  assert.equal((await h.call("/sync/mode", mode)).status, 200);
  const other = await h.login(codeB, "synthetic-unlisted-mode"); assert.equal((await h.call("/sync/mode", mode, other.token)).status, 403);
  await h.call(`/_test/expand-before-strict?key=${encodeURIComponent(key)}`, {});
  assert.equal((await h.call("/sync/mode", mode)).status, 403);
  assert.equal((await (await h.call("/sync/status?protocol=2")).json()).automaticAvailable, false);
  await h.restart({ SYNC_AUTOMATIC_ENABLED: "false" });
  assert.equal((await h.inspect()).head.strict, true); assert.equal((await h.call("/sync/save", source("still-no-blind-writes"))).status, 409);
});

test("authorization, confirmation and cross-space forgery cannot grant initialization or change unlisted manual behavior", async t => {
  const h = await harness(t); const other = await h.login(codeB, "synthetic-other-device");
  assert.equal((await h.initialize("synthetic-forged-space", other.token, { space, licenseId: space })).status, 403);
  assert.equal((await h.call("/sync/save", source("unlisted-manual"), other.token)).status, 200);
  assert.equal((await h.initialize("synthetic-no-token", "")).status, 401);
  for (const field of ["acknowledgeAllWorkspaces", "acknowledgeSyntheticTestOnly", "acknowledgeIgnoreLateLegacy"]) assert.equal((await h.initialize("synthetic-no-consent", undefined, { [field]: false })).status, 400);
  assert.equal((await h.inspect()).head, null);
});
