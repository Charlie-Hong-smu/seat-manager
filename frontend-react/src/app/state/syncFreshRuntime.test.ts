// @vitest-environment node
/// <reference types="node" />
import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare, Log, LogLevel } from "../../../../cloudflare-worker/node_modules/miniflare/dist/src/index.js";
import { SnapshotSync, SyncProtocolError, type CloudSnapshot } from "./syncProtocol";
import type { WorkspaceBook } from "./types";
import type { SyncJournal } from "./syncJournal";
import { sha256 } from "../../../../shared/sync-content.mjs";

vi.setConfig({ testTimeout: 15_000 });
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanups.splice(0)) await close(); });
async function runtime() {
  const directory = await mkdtemp(join(tmpdir(), "seat-fresh-client-"));
  const code = "SYNTHETIC-FRESH-CLIENT"; const digest = await sha256(code); const space = `tenant-${digest}`;
  const createdAt = new Date(Date.now() - 60_000).toISOString();
  const displayName = "同步合成测试-20261002";
  const grant = { purpose: "synthetic-test", displayName, licenseCreatedAt: createdAt, approvedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() };
  const make = () => new Miniflare({ name: "fresh-client", scriptPath: resolve("../cloudflare-worker/test/fixtures/sync-runtime.js"), modules: true, modulesRoot: resolve(".."), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR), kvNamespaces: ["SEAT_MANAGER_KV"], kvPersist: join(directory, "kv"), durableObjectsPersist: join(directory, "do"), durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } }, bindings: { PRODUCT_TOKEN_SECRET: "synthetic-fresh-client-secret", SYNC_FRESH_INITIALIZATION_ENABLED: "true", SYNC_FRESH_TEST_GRANTS: JSON.stringify({ [space]: grant }), SYNC_AUTOMATIC_ENABLED: "false" } });
  let mf = make(); cleanups.push(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  await (await mf.getKVNamespace("SEAT_MANAGER_KV")).put(`seat-manager:license:${digest}`, JSON.stringify({ licenseId: space, displayName, createdAt, status: "active", allowedEditions: ["zhang"], maxDevices: 3, aiEnabled: false, devices: [] }));
  const call = (path: string, body?: unknown, credential = token) => mf.dispatchFetch(`https://worker.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${credential}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let token = ""; token = (await (await call("/license/auth", { productCode: code, deviceId: "synthetic-first", edition: "zhang" })).json() as { token: string }).token;
  let book: WorkspaceBook = { version: 1, currentSliceId: "a", slices: [{ id: "a", classId: "a", className: "合成测试班", createdAt, updatedAt: createdAt, term: { id: "term-a", year: 2026, season: "autumn", label: "合成学期", createdAt }, data: { students: [], seatOrder: [], marker: "keep-local" } }] };
  const entries = new Map<string, unknown>(); const values = new Map<string, string>(); const attempts: Array<Record<string, unknown>> = []; let lost = false; let quota = false; let gate: Promise<void> | undefined; let applied = 0;
  const journal: SyncJournal = { async get<T>(key: string) { return entries.get(key) as T | undefined; }, async put(key, value) { if (quota) throw new Error("sync_storage_failed"); entries.set(key, structuredClone(value)); }, async remove(key) { entries.delete(key); } };
  const create = () => new SnapshotSync({ book: () => structuredClone(book), token: () => token, device: () => "合成设备", writable: () => true, flush: () => true, editing: () => false, unsaved: () => false, editVersion: () => 0, generation: () => "original-generation", storage: { getItem: key => values.get(key) || null, setItem: (key, value) => { values.set(key, value); } }, journal, apply(remote: CloudSnapshot) { applied++; book = structuredClone(remote.workspaceBook!); return true; },
    async api<T>(path: string, credential: string, raw?: unknown): Promise<T> {
      const input = raw as Record<string, unknown> | undefined;
      if (path === "/sync/migration" && input?.action === "initialize") { attempts.push(structuredClone(input)); if (gate) await gate; }
      const response = await call(path, raw, credential); const value = await response.json() as T & { error?: string };
      if (!response.ok) throw new SyncProtocolError(value.error || "failed", response.status);
      if (input?.action === "initialize" && lost) { lost = false; throw new SyncProtocolError("sync_network_failed"); }
      return value;
    } });
  return { space, create, attempts, book: () => book, applied: () => applied, call, async legacy(value: string) { await (await mf.getKVNamespace("SEAT_MANAGER_KV")).put(`seat-manager:license:${space}:state`, value); }, lose() { lost = true; }, quota() { quota = true; }, auth() { token = "changed-account"; }, wait(value: Promise<void>) { gate = value; }, async restart() { await mf.dispose(); mf = make(); } };
}

it("real empty initialization requires consent, keeps the local book and remains unbound until explicit CAS", async () => {
  const h = await runtime(); const engine = h.create(); const before = structuredClone(h.book());
  await engine.inspect(); await engine.initializeFresh("initialize", false, h.space); expect(h.attempts).toHaveLength(0);
  const initialized = await engine.initializeFresh("initialize", true, h.space);
  expect(initialized.phase).toBe("unbound"); expect(initialized.head).toMatchObject({ strict: true, revision: 0, exists: false, initializationReady: true, automaticAvailable: false });
  expect(h.book()).toEqual(before); expect(h.applied()).toBe(0); expect(initialized.automatic).toBe(false);
  expect((await engine.sync()).choice).toBe("bind"); expect((await engine.choose("local")).phase).toBe("synced");
  expect(h.book()).toEqual(before); expect((await h.call("/sync/load?protocol=2")).status).toBe(200);
});

it("a lost initialization response reopens with the same durable ID and receipt after real SQLite restart", async () => {
  const h = await runtime(); const before = structuredClone(h.book()); h.lose();
  expect((await h.create().initializeFresh("initialize", true, h.space)).phase).toBe("pending"); await h.restart();
  const result = await h.create().initializeFresh("initialize", true, h.space);
  expect(result.phase).toBe("unbound"); expect(h.attempts).toHaveLength(2); expect(h.attempts[0].operationId).toBe(h.attempts[1].operationId);
  expect(result.head?.revision).toBe(0); expect(h.book()).toEqual(before); expect(h.applied()).toBe(0);
});

it("quota failure and wrong expected space prevent any initialization request", async () => {
  const h = await runtime(); h.quota(); expect((await h.create().initializeFresh("initialize", true, h.space)).phase).toBe("paused"); expect(h.attempts).toHaveLength(0);
  expect((await h.create().initializeFresh("initialize", true, "different-space")).phase).toBe("auth"); expect(h.attempts).toHaveLength(0);
  expect((await (await h.call("/sync/status?protocol=2")).json() as { ready: boolean }).ready).toBe(false);
});

it("credential change while an initialization is queued prevents the old response changing client binding", async () => {
  const h = await runtime(); let resolve!: () => void; h.wait(new Promise<void>(done => { resolve = done; })); const engine = h.create(); const before = structuredClone(h.book());
  const request = engine.initializeFresh("initialize", true, h.space); await expect.poll(() => h.attempts.length).toBe(1); h.auth(); engine.pause(); resolve();
  expect((await request).phase).toBe("auth"); expect(h.book()).toEqual(before); expect(h.applied()).toBe(0); expect(engine.getSnapshot().automatic).toBe(false);
});

it("a malformed legacy source keeps the pending cancel action accessible after reopening", async () => {
  const h = await runtime(); const engine = h.create(); const before = structuredClone(h.book());
  await engine.inspect(); await h.legacy("malformed-synthetic-json");
  const refused = await engine.initializeFresh("initialize", true, h.space);
  expect(refused.phase).toBe("conflict"); expect(refused.migration?.freshInitialization?.phase).toBe("checking");
  await h.restart(); const reopened = h.create(); const inspected = await reopened.inspect();
  expect(inspected.migration?.freshInitialization?.phase).toBe("checking"); expect(inspected.head?.ready).not.toBe(true);
  const cancelled = await reopened.initializeFresh("cancel-initialization", true, h.space);
  expect(cancelled.phase).toBe("manual"); expect(cancelled.migration?.freshInitialization?.phase).toBe("cancelled");
  expect(cancelled.message).toContain("冻结已解除"); expect(h.book()).toEqual(before); expect(h.applied()).toBe(0);
  const status = await (await h.call("/sync/migration")).json() as { freshInitialization: { phase: string } };
  expect(status.freshInitialization.phase).toBe("cancelled");
});
