import worker from "../../worker-entry.js";
import { SyncCoordinator } from "../../worker-sync-coordinator.js";
export { AccountCoordinator } from "../../worker-account-coordinator.js";
export class FaultSyncCoordinator extends SyncCoordinator {
  fail = false;
  constructor(ctx, env) {
    let broken = false;
    const kv = env.SEAT_MANAGER_KV;
    super(ctx, { ...env, SEAT_MANAGER_KV: { get: (...args) => kv.get(...args), put: (...args) => { if (broken) throw new Error("synthetic_mirror_failure"); return kv.put(...args); }, delete: (...args) => { if (broken) throw new Error("synthetic_mirror_failure"); return kv.delete(...args); } } });
    this.toggleMirror = value => { broken = value; };
  }
  mirrorFailure(value) { this.toggleMirror(value); }
  retryMirror() { return this.alarm(); }
  failNext() { this.fail = true; }
  putChunks(revision, bytes) {
    super.putChunks(revision, bytes);
    if (this.fail) { this.fail = false; throw new Error("synthetic_chunk_failure"); }
  }
  inspect() {
    return { head: this.head(), chunks: this.ctx.storage.sql.exec("SELECT revision, position, length(value) AS bytes FROM chunks ORDER BY revision, position").toArray(), receipts: this.ctx.storage.sql.exec("SELECT mutation FROM receipts").toArray() };
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
      if (path === "/_test/alarm") { await stub.retryMirror(); return Response.json({ ok: true }); }
      if (path === "/_test/inspect") return Response.json(await stub.inspect());
      if (path === "/_test/strict") return Response.json(await stub.setStrict(key, await request.json(), true));
      if (path === "/_test/delete") return Response.json(await stub.deleteState(key));
    }
    return worker.fetch(request, env, ctx);
  }
};
