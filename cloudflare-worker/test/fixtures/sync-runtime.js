import worker from "../../worker-entry.js";
import { SyncCoordinator } from "../../worker-sync-coordinator.js";
import { canonicalJson, sha256 } from "../../../shared/sync-content.mjs";
export { AccountCoordinator } from "../../worker-account-coordinator.js";
export class FaultSyncCoordinator extends SyncCoordinator {
  fail = false;
  expandOnStrict = false;
  constructor(ctx, env) {
    let broken = false; let stale = false; let oldSource = null;
    const kv = env.SEAT_MANAGER_KV;
    super(ctx, { ...env, SEAT_MANAGER_KV: { get: (...args) => stale ? Promise.resolve(oldSource) : kv.get(...args), put: (...args) => { if (broken) throw new Error("synthetic_mirror_failure"); return kv.put(...args); }, delete: (...args) => { if (broken) throw new Error("synthetic_mirror_failure"); return kv.delete(...args); } } });
    this.toggleMirror = value => { broken = value; };
    this.toggleSource = value => { stale = value.enabled; oldSource = value.snapshot; };
  }
  mirrorFailure(value) { this.toggleMirror(value); }
  staleSource(value) { this.toggleSource(value); }
  withoutCutoverProof() { const head = this.head(); delete head.cutoverId; delete head.sourceIntegrity; this.migrationState.delete(); this.putHead(head); }
  expandBeforeStrict() { this.expandOnStrict = true; }
  async setStrict(key, expected, allowed, actor = null) {
    if (this.expandOnStrict && actor) {
      this.expandOnStrict = false;
      const account = this.env.ACCOUNT_COORDINATOR.getByName(actor.licenseKey);
      const record = await account.readLicense(actor.licenseKey);
      await account.mutateLicense(actor.licenseKey, { type: "upsert", record: { ...record, allowedEditions: ["zhang", "commercial"] } });
    }
    return super.setStrict(key, expected, allowed, actor);
  }
  async bootstrap(key) {
    // Test setup for pre-existing CAS assertions; public migration is tested separately.
    const snapshot = await this.env.SEAT_MANAGER_KV.get(key, { type: "json" });
    const space = "synthetic-fixture-space";
    this.env.SYNC_CUTOVER_MANIFESTS = JSON.stringify({ [space]: { cutoverId: "synthetic-cutover", retiredWorkerVersion: "synthetic-retired", sourceIntegrity: await sha256(canonicalJson(snapshot)), oldWritersRetired: true, backupRetained: true, verifiedAt: new Date().toISOString() } });
    const prepared = await this.migration(key, space, "prepare", { operationId: "synthetic-bootstrap", acknowledgeAllWorkspaces: true });
    if (prepared.error) return prepared;
    return this.migration(key, space, "commit", { operationId: prepared.operationId, backupIntegrity: prepared.backupIntegrity, acknowledgeAllWorkspaces: true, acknowledgeBackup: true });
  }
  retryMirror() { return this.alarm(); }
  failNext() { this.fail = true; }
  putChunks(revision, bytes) {
    super.putChunks(revision, bytes);
    if (this.fail) { this.fail = false; throw new Error("synthetic_chunk_failure"); }
  }
  inspect() {
    return { head: this.head(), chunks: this.ctx.storage.sql.exec("SELECT revision, position, length(value) AS bytes FROM chunks ORDER BY revision, position").toArray(), receipts: this.ctx.storage.sql.exec("SELECT mutation FROM receipts").toArray(), migrationChunks: this.ctx.storage.sql.exec("SELECT slot, position, length(value) AS bytes FROM migration_chunks ORDER BY slot, position").toArray() };
  }
}
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/_test/")) {
      const key = new URL(request.url).searchParams.get("key") || "seat-manager:single-teacher:state";
      const stub = env.SYNC_COORDINATOR.getByName(key);
      if (path === "/_test/fail") { await stub.failNext(); return Response.json({ ok: true }); }
      if (path === "/_test/mirror") { await stub.mirrorFailure((await request.json()).fail); return Response.json({ ok: true }); }
      if (path === "/_test/source") { await stub.staleSource(await request.json()); return Response.json({ ok: true }); }
      if (path === "/_test/alarm") { await stub.retryMirror(); return Response.json({ ok: true }); }
      if (path === "/_test/inspect") return Response.json(await stub.inspect());
      if (path === "/_test/migrate") return Response.json(await stub.bootstrap(key));
      if (path === "/_test/unverified") { await stub.withoutCutoverProof(); return Response.json({ ok: true }); }
      if (path === "/_test/expand-before-strict") { await stub.expandBeforeStrict(); return Response.json({ ok: true }); }
      if (path === "/_test/strict") return Response.json(await stub.setStrict(key, await request.json(), true));
      if (path === "/_test/delete") return Response.json(await stub.deleteState(key));
    }
    return worker.fetch(request, env, ctx);
  }
};
