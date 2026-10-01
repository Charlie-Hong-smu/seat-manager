// @vitest-environment node
/// <reference types="node" />
import { afterEach, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare, Log, LogLevel } from "../../../../cloudflare-worker/node_modules/miniflare/dist/src/index.js";
import { SnapshotSync, SyncProtocolError, type CloudHead, type CloudSnapshot, type PendingSnapshot } from "./syncProtocol";
import type { WorkspaceBook } from "./types";
import type { SyncJournal } from "./syncJournal";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0)) await close(); });
const seed = (): WorkspaceBook => ({ version: 1, currentSliceId: "a", slices: ["a", "b"].map(id => ({ id, classId: id, className: `合成${id}`, createdAt: "2026-10-01", updatedAt: "2026-10-01", term: { id: `term-${id}`, year: 2026, season: "autumn", label: "秋", createdAt: "2026-10-01" }, data: { students: [], seatOrder: [], marker: "base" } })) });
function gate() { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; }
async function runtime() {
  const directory = await mkdtemp(join(tmpdir(), "seat-sync-client-runtime-"));
  const make = () => new Miniflare({ name: "client-sync-runtime", scriptPath: resolve("../cloudflare-worker/test/fixtures/sync-runtime.js"), modules: true,
    modulesRoot: resolve(".."), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR),
    kvNamespaces: ["SEAT_MANAGER_KV"], kvPersist: join(directory, "kv"), durableObjectsPersist: join(directory, "do"),
    durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } },
    bindings: { PRODUCT_TOKEN_SECRET: "synthetic-client-secret", SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "false" },
  });
  let mf = make(); cleanup.push(async () => { await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  // A synthetic license key is derived locally; no production credential is used.
  const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("SYNTHETIC-CLIENT")))].map(byte => byte.toString(16).padStart(2, "0")).join("");
  await (await mf.getKVNamespace("SEAT_MANAGER_KV")).put(`seat-manager:license:${digest}`, JSON.stringify({ licenseId: "synthetic-client-space", status: "active", allowedEditions: ["zhang", "commercial"], maxDevices: 3, devices: [] }));
  async function call(path: string, token: string, body?: unknown) {
    return mf.dispatchFetch(`https://worker.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  const auth = await (await call("/license/auth", "", { productCode: "SYNTHETIC-CLIENT", deviceId: "synthetic-device", edition: "zhang" })).json() as { token: string };
  function client() {
    let book = seed(); let token = auth.token; let editVersion = 0; let generation = "one"; let draft = false; let lose = false; let quota = false; let failApply = false;
    let uploadGate: ReturnType<typeof gate> | undefined; let loadGate: ReturnType<typeof gate> | undefined;
    const entries = new Map<string, unknown>(); const values = new Map<string, string>(); const attempts: PendingSnapshot[] = []; const paths: string[] = []; let applied = 0;
    const journal: SyncJournal = { async get<T>(key: string) { return structuredClone(entries.get(key)) as T | undefined; }, async put(key, value) { if (quota) throw new Error("sync_storage_failed"); entries.set(key, structuredClone(value)); }, async remove(key) { entries.delete(key); } };
    const create = () => new SnapshotSync({ book: () => structuredClone(book), token: () => token, device: () => "合成设备", flush: () => true, writable: () => true, editing: () => draft, unsaved: () => false, editVersion: () => editVersion, generation: () => generation,
      storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } }, journal,
      apply(remote: CloudSnapshot, preserve) { if (failApply) return false; const selected = book.currentSliceId; book = structuredClone(remote.workspaceBook!); if (preserve) book.currentSliceId = selected; generation = crypto.randomUUID(); applied++; return true; },
      async api<T>(path: string, credential: string, body?: unknown): Promise<T> {
        paths.push(path);
        if (path === "/sync/save") { attempts.push(structuredClone(body as PendingSnapshot)); if (uploadGate) await uploadGate.promise; }
        const response = await call(path, credential, body); const value = await response.json() as T & { error?: string };
        if (!response.ok) throw new SyncProtocolError(value.error || "failed", response.status);
        if (path.includes("/sync/load") && loadGate) await loadGate.promise;
        if (path === "/sync/save" && lose) { lose = false; throw new SyncProtocolError("sync_network_failed"); }
        return value;
      },
    });
    const engine = create();
    return { engine, reopen: create, attempts, paths, entries, values, applied: () => applied, book: () => book,
      edit(marker: string) { book.slices[0].data.marker = marker; editVersion++; }, select() { book.currentSliceId = "b"; },
      draft(value: boolean) { draft = value; }, lose() { lose = true; }, quota(value: boolean) { quota = value; }, failApply() { failApply = true; }, auth(value: string) { token = value; },
      uploadWait() { uploadGate = gate(); return uploadGate; }, loadWait() { loadGate = gate(); return loadGate; },
      async bind(direction: "local" | "cloud" = "local") { expect((await engine.sync()).choice).toBe("bind"); expect((await engine.choose(direction)).phase).toBe("synced"); },
    };
  }
  return { client, async restart() { await mf.dispose(); mf = make(); }, async head() { return await (await call("/sync/status?protocol=2", auth.token)).json() as CloudHead; }, async remove() { await call("/_test/delete?key=seat-manager%3Alicense%3Asynthetic-client-space%3Astate", auth.token, {}); } };
}

it("real SQLite authority resolves two client edits, restart receipts and editing during upload", async () => {
  const h = await runtime(); const a = h.client(); const b = h.client(); await a.bind(); await b.bind("cloud");
  a.edit("device-a"); b.edit("offline-device-b");
  const results = await Promise.all([a.engine.sync(), b.engine.sync()]);
  expect(results.map(result => result.phase).sort()).toEqual(["conflict", "synced"]); expect((await h.head()).revision).toBe(2);
  const winner = results[0].phase === "synced" ? a : b; const loser = winner === a ? b : a;
  expect(loser.entries.get("conflict:synthetic-client-space")).toMatchObject({ local: { workspaceBook: loser.book() }, remote: { exists: true } });
  expect((await loser.engine.choose("cloud")).phase).toBe("synced"); expect(loser.entries.has("pending:synthetic-client-space")).toBe(false);
  winner.edit("lost-response"); winner.lose(); expect((await winner.engine.sync()).phase).toBe("pending"); const revision = (await h.head()).revision;
  await h.restart(); const reopened = winner.reopen(); expect((await reopened.sync()).phase).toBe("synced"); expect((await h.head()).revision).toBe(revision);
  expect(winner.attempts[winner.attempts.length - 1].clientMutationId).toBe(winner.attempts[winner.attempts.length - 2].clientMutationId);
  winner.edit("captured"); const wait = winner.uploadWait(); const request = reopened.sync(); await expect.poll(() => winner.attempts[winner.attempts.length - 1].data.marker).toBe("captured");
  winner.edit("later-edit"); wait.resolve(); expect((await request).phase).toBe("pending"); expect((await reopened.sync()).phase).toBe("synced");
});

it("real clean pull refuses new drafts, keeps selection and never loops or revives deleted data", async () => {
  const h = await runtime(); const a = h.client(); const b = h.client(); await a.bind(); await b.bind("cloud"); b.select(); a.edit("cloud-update"); await a.engine.sync();
  const wait = b.loadWait(); const request = b.engine.sync(); await expect.poll(() => b.paths.filter(path => path.includes("/sync/load")).length).toBe(2); b.draft(true); wait.resolve();
  expect((await request).phase).toBe("draft"); expect(b.book().slices[0].data.marker).toBe("base");
  b.draft(false); expect((await b.engine.sync()).phase).toBe("synced"); expect(b.book().currentSliceId).toBe("b"); expect(b.attempts).toHaveLength(0);
  expect((await b.engine.sync()).phase).toBe("synced"); expect(b.attempts).toHaveLength(0);
  await h.remove(); await h.restart(); expect((await b.engine.sync()).phase).toBe("conflict"); expect(b.attempts).toHaveLength(0); expect((await h.head()).exists).toBe(false);
});

it("real commits keep quota recovery and changed credentials isolated", async () => {
  const h = await runtime(); const a = h.client(); const b = h.client(); await a.bind(); await b.bind("cloud"); a.edit("quota-local"); a.quota(true);
  expect((await a.engine.sync()).phase).toBe("paused"); expect((await h.head()).revision).toBe(1); a.quota(false);
  const wait = a.uploadWait(); const request = a.engine.sync(); await expect.poll(() => a.attempts.length).toBe(2); a.auth("different-account-token"); a.engine.pause(); wait.resolve();
  expect((await request).phase).toBe("auth"); expect(a.entries.has("pending:synthetic-client-space")).toBe(true);
  b.failApply(); expect((await b.engine.sync()).phase).toBe("paused"); expect(b.applied()).toBe(1); expect(b.book().slices[0].data.marker).toBe("base");
});
