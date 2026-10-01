import { describe, expect, it, vi } from "vitest";
import { SnapshotSync, contentHash, snapshotOf, SyncProtocolError, AUTOMATIC_SYNC_RELEASE_ENABLED, type CloudHead, type CloudSnapshot, type PendingSnapshot } from "./syncProtocol";
import type { WorkspaceBook } from "./types";
import type { SyncJournal } from "./syncJournal";

function book(marker = "base"): WorkspaceBook {
  return { version: 1, currentSliceId: "a", slices: ["a", "b"].map(id => ({ id, classId: id, className: id, createdAt: "2026-10-01", updatedAt: "2026-10-01", term: { id: `term-${id}`, year: 2026, season: "autumn", label: "秋", createdAt: "2026-10-01" }, data: { students: [], seatOrder: [], marker } })) };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
async function setup() {
  let local = book(); let remoteBook = book(); let revision = 1; let epoch = "epoch-one"; let token = "token-a";
  let editVersion = 0; let unsaved = false; let editing = false; let ready = true; let exists = true; let writable = true;
  let loseResponse = false; let rejectSave = false; let networkError: SyncProtocolError | null = null; let saveGate: Promise<void> | undefined; let loadGate: Promise<void> | undefined;
  let space = "space-a"; let applyCount = 0; let failJournal = false; let failApply = false;
  const values = new Map<string, unknown>(); const receipts = new Map<string, CloudHead>(); const saves: PendingSnapshot[] = []; const paths: string[] = [];
  const head = async (): Promise<CloudHead> => ({ ready, exists, licenseId: space, revision, epoch, hash: exists ? await contentHash(snapshotOf(remoteBook, "remote")) : "", strict: false, automaticAvailable: false });
  const journal: SyncJournal = {
    async get<T>(key: string) { return structuredClone(values.get(key)) as T | undefined; },
    async put(key, value) { if (failJournal) throw new Error("sync_storage_failed"); values.set(key, structuredClone(value)); },
    async remove(key) { values.delete(key); },
  };
  const create = () => new SnapshotSync({
    token: () => token, book: () => structuredClone(local), device: () => "test", storage: localStorage, journal,
    flush: () => writable, writable: () => writable, editing: () => editing, unsaved: () => unsaved,
    editVersion: () => editVersion, generation: () => "generation-one",
    apply(snapshot, preserve) { if (failApply) return false; applyCount++; const selection = local.currentSliceId; local = structuredClone(snapshot.workspaceBook!); if (preserve && local.slices.some(s => s.id === selection)) local.currentSliceId = selection; return true; },
    async api<T>(path: string, _token: string, raw?: unknown): Promise<T> {
      paths.push(path); if (networkError) throw networkError;
      if (path.startsWith("/sync/status")) return await head() as T;
      if (path.startsWith("/sync/load")) { const snapshot: CloudSnapshot = { ...await head(), workspaceBook: structuredClone(remoteBook), data: structuredClone(remoteBook.slices[0].data) }; if (loadGate) await loadGate; return snapshot as T; }
      const payload = raw as PendingSnapshot; saves.push(structuredClone(payload)); if (saveGate) await saveGate;
      if (rejectSave) { rejectSave = false; throw new SyncProtocolError("sync_network_failed"); }
      const receipt = receipts.get(payload.clientMutationId); if (receipt) return receipt as T;
      if (payload.epoch !== epoch || payload.baseRevision !== revision) throw new SyncProtocolError("conflict", 409);
      remoteBook = structuredClone(payload.workspaceBook); revision++; exists = true;
      const result = await head(); receipts.set(payload.clientMutationId, result);
      if (loseResponse) { loseResponse = false; throw new SyncProtocolError("sync_network_failed"); }
      return result as T;
    },
  });
  const engine = create();
  const bind = async () => { expect((await engine.sync()).choice).toBe("bind"); expect((await engine.choose("local")).phase).toBe("synced"); };
  return {
    engine, create, bind, saves, paths, values, head,
    local: () => local, remote: () => remoteBook, applyCount: () => applyCount,
    edit(marker: string, pending = false) { local.slices[0].data.marker = marker; editVersion++; unsaved = pending; },
    async cloudEdit(marker: string) { remoteBook.slices[0].data.marker = marker; revision++; },
    select(id: string) { local.currentSliceId = id; local.slices[0].updatedAt = "new-save-time"; },
    loadWait(promise: Promise<void>) { loadGate = promise; }, saveWait(promise: Promise<void>) { saveGate = promise; },
    offline(error: SyncProtocolError | null) { networkError = error; }, lose() { loseResponse = true; }, rejectSave() { rejectSave = true; }, draft(value: boolean) { editing = value; },
    auth(value: string, id = space) { token = value; space = id; }, migration(value: boolean) { ready = value; },
    deletion() { exists = false; revision++; epoch = "epoch-after-delete"; }, failJournal() { failJournal = true; }, failApply() { failApply = true; }, readonly() { writable = false; },
  };
}

describe("local-first snapshot synchronization", () => {
  it("requires explicit space binding and keeps release auto gates closed", async () => {
    const h = await setup(); expect(AUTOMATIC_SYNC_RELEASE_ENABLED).toBe(false);
    expect((await h.engine.sync()).choice).toBe("bind"); expect(h.saves).toHaveLength(0);
    expect((await h.engine.enableAutomatic(true)).phase).toBe("manual"); expect(h.saves).toHaveLength(0);
    h.migration(false); expect((await h.engine.sync()).phase).toBe("manual"); expect(h.saves).toHaveLength(0);
    const before = h.paths.length; h.engine.checkAutomatic(); h.engine.onSaved(); expect(h.paths).toHaveLength(before);
  });
  it("explicit cloud choice retires conflicting pending requests and exports both versions", async () => {
    const h = await setup(); await h.bind(); h.edit("lost-local"); h.rejectSave(); await h.engine.sync();
    await h.cloudEdit("cloud-winner"); expect((await h.engine.sync()).phase).toBe("conflict");
    expect((await h.engine.choose("cloud")).phase).toBe("synced");
    expect(h.values.has("pending:space-a")).toBe(false); expect(h.values.has("discarded-pending:space-a")).toBe(true);
    expect((await h.engine.sync()).phase).toBe("synced");
    expect(await h.engine.recovery()).toMatchObject({ space: "space-a", recovery: { local: { data: { marker: "lost-local" } }, remote: { workspaceBook: h.remote() } } });
  });
  it("keeps editing during upload pending and captures book/data together", async () => {
    const h = await setup(); await h.bind(); h.edit("captured");
    const gate = deferred<void>(); h.saveWait(gate.promise);
    const pending = h.engine.sync();
    await expect.poll(() => h.saves.length).toBe(1);
    h.edit("later"); gate.resolve();
    expect((await pending).phase).toBe("pending");
    expect(h.saves[0].data.marker).toBe("captured"); expect(h.saves[0].workspaceBook.slices[0].data.marker).toBe("captured"); expect(h.local().slices[0].data.marker).toBe("later");
  });
  it("reopens and retries a lost response with the same durable mutation ID", async () => {
    const h = await setup(); await h.bind(); h.edit("new"); h.lose();
    expect((await h.engine.sync()).phase).toBe("pending"); const afterCommit = (await h.head()).revision;
    expect((await h.create().sync()).phase).toBe("synced");
    expect(h.saves).toHaveLength(2); expect(h.saves[0].clientMutationId).toBe(h.saves[1].clientMutationId); expect((await h.head()).revision).toBe(afterCommit);
  });
  it("retains offline double edits on reopen and requires a CAS conflict choice", async () => {
    const h = await setup(); await h.bind(); h.edit("offline-local"); h.offline(new SyncProtocolError("sync_network_failed"));
    await h.engine.sync(); h.offline(null); await h.cloudEdit("other-device");
    const reopened = h.create(); const conflict = await reopened.sync(); expect(conflict.phase).toBe("conflict"); expect(conflict.choice).toBe("conflict");
    expect(h.saves).toHaveLength(0); expect(h.values.get("conflict:space-a")).toMatchObject({ local: { workspaceBook: h.local() }, remote: { workspaceBook: h.remote() } });
    expect((await reopened.choose("local")).phase).toBe("synced"); expect(h.saves[0].baseRevision).toBe(2); expect(h.values.has("recovery:space-a")).toBe(true);
  });
  it("stops remote application when editing starts during load", async () => {
    const h = await setup(); await h.bind(); await h.cloudEdit("remote"); const gate = deferred<void>(); h.loadWait(gate.promise);
    const pending = h.engine.sync(); await expect.poll(() => h.paths.filter(p => p.includes("/load")).length).toBe(2);
    h.edit("user-started-edit", true); gate.resolve(); expect((await pending).phase).toBe("draft"); expect(h.applyCount()).toBe(0); expect(h.local().slices[0].data.marker).toBe("user-started-edit");
  });
  it("rechecks drafts created while a clean pull is in flight", async () => {
    const h = await setup(); await h.bind(); await h.cloudEdit("remote"); const gate = deferred<void>(); h.loadWait(gate.promise);
    const pending = h.engine.sync(); await expect.poll(() => h.paths.filter(p => p.includes("/load")).length).toBe(2);
    h.draft(true); gate.resolve(); expect((await pending).phase).toBe("draft"); expect(h.applyCount()).toBe(0);
  });
  it("blocks cached/active drafts and preserves local selection on a clean pull", async () => {
    const h = await setup(); await h.bind(); h.select("b"); await h.cloudEdit("remote"); h.draft(true);
    expect((await h.engine.sync()).phase).toBe("draft"); expect(h.applyCount()).toBe(0);
    h.draft(false); expect((await h.engine.sync()).phase).toBe("synced"); expect(h.applyCount()).toBe(1); expect(h.local().currentSliceId).toBe("b"); expect(h.saves).toHaveLength(0);
  });
  it("does not upload for switching class and excludes only designated metadata", async () => {
    const h = await setup(); await h.bind(); h.select("b");
    expect((await h.engine.sync()).phase).toBe("synced"); expect(h.saves).toHaveLength(0);
    const before = await contentHash(snapshotOf(h.local(), "a")); h.local().slices[0].data.dueDate = "2026-10-02";
    expect(await contentHash(snapshotOf(h.local(), "b"))).not.toBe(before);
  });
  it("isolates changed auth and ignores a late receipt", async () => {
    const h = await setup(); await h.bind(); h.edit("old-account"); const gate = deferred<void>(); h.saveWait(gate.promise);
    const pending = h.engine.sync(); await expect.poll(() => h.saves.length).toBe(1);
    h.auth("token-b", "space-b"); h.engine.pause(); gate.resolve(); expect((await pending).phase).toBe("auth");
    expect(localStorage.getItem("seat-manager-sync-checkpoint-v2:space-b")).toBeNull();
    expect((await h.engine.sync()).choice).toBe("bind"); expect(h.values.has("pending:space-a")).toBe(true);
  });
  it("pauses when durable recovery or local replacement fails", async () => {
    for (const fail of ["journal", "main"] as const) {
      const h = await setup(); await h.bind(); await h.cloudEdit("cloud");
      if (fail === "journal") h.failJournal(); else h.failApply();
      expect((await h.engine.sync()).phase).toBe("paused"); expect(h.local().slices[0].data.marker).toBe("base"); expect(h.applyCount()).toBe(0);
      localStorage.clear();
    }
  });
  it("does not mark a committed upload synced when checkpoint storage fails", async () => {
    const h = await setup(); await h.bind(); h.edit("upload");
    const original = Storage.prototype.setItem;
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key, value) { if (key.includes("sync-checkpoint")) throw new DOMException("quota", "QuotaExceededError"); original.call(this, key, value); });
    expect((await h.engine.sync()).phase).toBe("paused"); expect(h.values.has("pending:space-a")).toBe(true); spy.mockRestore();
    expect((await h.create().sync()).phase).toBe("synced"); expect(h.saves[0].clientMutationId).toBe(h.saves[1].clientMutationId);
  });
  it("deletion changes epoch and never automatically republishes an old snapshot", async () => {
    const h = await setup(); await h.bind(); h.deletion();
    expect((await h.engine.sync()).phase).toBe("conflict"); expect(h.saves).toHaveLength(0); expect(h.local().slices).toHaveLength(2);
    expect((await h.engine.choose("local")).phase).toBe("synced"); expect(h.saves[0].epoch).toBe("epoch-after-delete");
  });
  it("refuses a choice if the remote changes again or the local window is readonly", async () => {
    const h = await setup(); h.edit("local"); expect((await h.engine.sync()).choice).toBe("bind"); await h.cloudEdit("changed-again");
    expect((await h.engine.choose("local")).phase).toBe("conflict"); expect(h.saves).toHaveLength(0);
    h.readonly(); expect((await h.engine.sync()).phase).toBe("paused");
  });
  it.each([[401, "unauthorized", "auth"], [403, "forbidden", "auth"], [413, "payload_too_large", "paused"], [429, "rate_limited", "pending"], [503, "sync_coordinator_unavailable", "pending"], [400, "sync_invalid_data", "paused"]])("handles %s without unsafe writes", async (status, code, phase) => {
    const h = await setup(); await h.bind(); h.edit("new"); h.offline(new SyncProtocolError(String(code), Number(status)));
    expect((await h.engine.sync()).phase).toBe(phase); expect(h.local().slices[0].data.marker).toBe("new"); expect(h.saves).toHaveLength(0);
  });
});
