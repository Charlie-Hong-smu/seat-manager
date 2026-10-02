import { DurableObject } from "cloudflare:workers";
import { SYNC_CHUNK_BYTES, SYNC_MAX_BYTES, canonicalJson, contentHash, sha256, validSyncBook, validSyncData } from "../shared/sync-content.mjs";
import { loadLicenseRecordByKey } from "./worker-license-store.js";
import { getLicensedSyncStateKey } from "./worker-license-keys.js";
import { SyncMigration } from "./worker-sync-migration.js";
import { automaticSpaceAllowed } from "./worker-sync-policy.js";
import { SyncFreshInitialization, hasFreshAuthority } from "./worker-sync-fresh.js";

/** One authority per authenticated state key. No KV fallback after migration. */
export class SyncCoordinator extends DurableObject {
  pending = Promise.resolve();
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS head (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks (revision INTEGER, position INTEGER, value BLOB NOT NULL, PRIMARY KEY(revision, position));
      CREATE TABLE IF NOT EXISTS receipts (mutation TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, revision INTEGER NOT NULL, value TEXT NOT NULL);
    `);
    this.migrationState = new SyncMigration(this);
    this.freshState = new SyncFreshInitialization(this);
  }
  enqueue(operation) {
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }
  head() { const row = this.ctx.storage.sql.exec("SELECT value FROM head WHERE id=1").toArray()[0]; return row ? JSON.parse(row.value) : null; }
  putHead(head) { this.ctx.storage.sql.exec("INSERT OR REPLACE INTO head VALUES(1, ?)", JSON.stringify(head)); }
  putChunks(revision, bytes) {
    for (let offset = 0, position = 0; offset < bytes.length; offset += SYNC_CHUNK_BYTES, position++) {
      this.ctx.storage.sql.exec("INSERT INTO chunks VALUES(?, ?, ?)", revision, position, bytes.slice(offset, offset + SYNC_CHUNK_BYTES).buffer);
    }
  }
  async snapshot(head) {
    if (!head.exists) return null;
    const chunks = this.ctx.storage.sql.exec("SELECT value FROM chunks WHERE revision=? ORDER BY position", head.revision).toArray();
    const bytes = new Uint8Array(head.bytes); let offset = 0;
    for (const chunk of chunks) { const value = new Uint8Array(chunk.value); bytes.set(value, offset); offset += value.length; }
    if (offset !== head.bytes || await sha256(bytes) !== head.integrity) throw new Error("snapshot_integrity_failed");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
  async initialize(key) {
    const head = this.head();
    if (head) { if (head.key !== key) throw new Error("space_mismatch"); return head; }
    if (this.freshState.record()?.phase === "complete") throw new Error("fresh_authority_missing");
    // A GET or global rollout flag never migrates a teacher's cloud data.
    return null;
  }
  metadata(head) {
    return { exists: head.exists, epoch: head.epoch, revision: head.revision, hash: head.hash, strict: head.strict, ready: true, migrationReady: Boolean(head.cutoverId), initializationReady: Boolean(hasFreshAuthority(head)), authoritySource: head.cutoverId ? "verified-cutover" : hasFreshAuthority(head) ? "fresh-test-initialization" : "unverified",
      updatedAt: head.updatedAt, deviceName: head.deviceName, version: head.version, sizeBytes: head.sizeBytes,
      automaticAvailable: Boolean(head.cutoverId || hasFreshAuthority(head)) && automaticSpaceAllowed(this.env, head.key), mirrorPending: head.mirrorPending };
  }
  async authorized(key, actor) {
    if (!actor) return true;
    const license = await loadLicenseRecordByKey(actor.licenseKey, this.env);
    const device = license?.devices.find(item => item.id === actor.deviceId);
    const expiry = license?.expiresAt ? Date.parse(license.expiresAt) : null;
    return Boolean(license && license.status === "active" && getLicensedSyncStateKey(license.licenseId) === key && license.allowedEditions.includes(actor.edition)
      && actor.expiresAt > Date.now() && (expiry === null || (Number.isFinite(expiry) && expiry > Date.now())) && device && (device.sessionId || "") === actor.sessionId);
  }
  read(key, load = false) {
    return this.enqueue(async () => {
      const head = await this.initialize(key);
      if (!head) return { ready: false, saved: await this.env.SEAT_MANAGER_KV.get(key, { type: "json" }) };
      return { ...this.metadata(head), ...(load ? { saved: await this.snapshot(head) } : {}) };
    });
  }
  save(key, payload, protocol, actor = null, space = "") {
    return this.enqueue(async () => {
      if (actor) {
        // Recheck inside this queue so revocation/deletion cannot race a prior route check.
        if (!await this.authorized(key, actor)) return { error: "unauthorized", status: 401 };
      }
      let head = await this.initialize(key);
      if (this.freshState.frozen()) return { error: "initialization_in_progress", status: 503 };
      if (this.migrationState.frozen()) return { error: "migration_in_progress", status: 503 };
      if (!head) {
        if (protocol) return { error: "migration_required", status: 503 };
        await this.migrationState.legacySave(key, payload, space);
        return { legacy: true };
      }
      if (actor && head.blockedActors?.includes(`${actor.licenseKey}:${actor.deviceId}:${actor.sessionId}`)) return { error: "unauthorized", status: 401 };
      if (!protocol && head.strict) return { error: "upgrade_required", status: 409 };
      if (protocol && (!Number.isSafeInteger(protocol.baseRevision) || protocol.baseRevision < 0 || typeof protocol.epoch !== "string" || !/^[\w-]{8,128}$/.test(protocol.clientMutationId || ""))) return { error: "bad_request", status: 400 };
      if (!validSyncData(payload.data) || (payload.workspaceBook !== undefined && !validSyncBook(payload.workspaceBook))) return { error: "invalid_snapshot", status: 400 };
      if (protocol && payload.workspaceBook && canonicalJson(payload.data) !== canonicalJson(payload.workspaceBook.slices.find(slice => slice.id === payload.workspaceBook.currentSliceId).data)) return { error: "invalid_snapshot", status: 400 };
      const hash = await contentHash(payload);
      if (protocol && protocol.hash !== hash) return { error: "hash_mismatch", status: 400 };
      const fingerprint = protocol ? await sha256(canonicalJson({ ...protocol, payload: { ...payload, updatedAt: undefined, sizeBytes: undefined } })) : "";
      if (protocol) {
        // Check epoch before receipt: deletion invalidates every previous mutation.
        if (protocol.epoch !== head.epoch) return { error: "epoch_changed", status: 409, ...this.metadata(head) };
        const old = this.ctx.storage.sql.exec("SELECT fingerprint, value FROM receipts WHERE mutation=?", protocol.clientMutationId).toArray()[0];
        if (old) return old.fingerprint === fingerprint ? { ...JSON.parse(old.value), automaticAvailable: this.metadata(head).automaticAvailable } : { error: "mutation_reused", status: 409 };
        if (protocol.baseRevision !== head.revision) return { error: "conflict", status: 409, ...this.metadata(head) };
      }
      const bytes = new TextEncoder().encode(JSON.stringify(payload));
      if (bytes.length > SYNC_MAX_BYTES) return { error: "payload_too_large", status: 413 };
      const next = { ...head, revision: head.revision + 1, exists: true, hash, integrity: await sha256(bytes), bytes: bytes.length,
        updatedAt: payload.updatedAt, deviceName: payload.deviceName, version: payload.version, sizeBytes: payload.sizeBytes, mirrorPending: true };
      const result = { ok: true, ...this.metadata(next) };
      this.ctx.storage.transactionSync(() => {
        this.putChunks(next.revision, bytes);
        this.putHead(next);
        if (protocol) this.ctx.storage.sql.exec("INSERT INTO receipts VALUES(?, ?, ?, ?)", protocol.clientMutationId, fingerprint, next.revision, JSON.stringify(result));
        // Current plus two recovery revisions; old receipts cannot permit blind replay.
        this.ctx.storage.sql.exec("DELETE FROM chunks WHERE revision < ?", next.revision - 2);
        this.ctx.storage.sql.exec("DELETE FROM receipts WHERE revision < ?", next.revision - 256);
      });
      await this.mirror();
      head = this.head();
      return { ...result, mirrorPending: head.mirrorPending };
    });
  }
  migration(key, space, action, request = {}, actor = null) {
    return this.enqueue(async () => {
      if (!await this.authorized(key, actor)) return { error: "unauthorized", status: 401 };
      if (actor && this.head()?.blockedActors?.includes(`${actor.licenseKey}:${actor.deviceId}:${actor.sessionId}`)) return { error: "unauthorized", status: 401 };
      const license = actor ? await loadLicenseRecordByKey(actor.licenseKey, this.env) : null;
      const firstLifetime = Boolean(await this.freshState.grant(space, actor));
      const status = () => ({ ...this.migrationState.status(space), freshInitialization: this.freshState.status(space, license, firstLifetime) });
      if (action === "status") return status();
      if (action === "initialize" || action === "cancel-initialization") {
        const result = action === "initialize" ? await this.freshState.initialize(key, space, request, actor) : this.freshState.cancel(request);
        return result.error ? result : { ...status(), ...(result.receipt ? { initializationReceipt: result.receipt } : {}) };
      }
      if (this.freshState.frozen()) return { error: "initialization_in_progress", status: 503 };
      if (hasFreshAuthority(this.head()) && action === "prepare") return { error: "initialization_existing_head", status: 409 };
      if (action === "backup") return this.migrationState.backup(space, request.operationId);
      if (action === "prepare") {
        if (request.acknowledgeAllWorkspaces !== true) return { error: "migration_confirmation_required", status: 400 };
        return this.migrationState.prepare(key, space, request.operationId);
      }
      if (action === "commit") return this.migrationState.commit(key, space, request);
      if (action === "abort" && request.acknowledgeAllWorkspaces === true) return this.migrationState.abort(space, request.operationId);
      return { error: "bad_request", status: 400 };
    });
  }
  setStrict(key, expected, allowed, actor = null) {
    return this.enqueue(async () => {
      if (!await this.authorized(key, actor)) return { error: "unauthorized", status: 401 };
      const head = await this.initialize(key);
      if (actor && head?.blockedActors?.includes(`${actor.licenseKey}:${actor.deviceId}:${actor.sessionId}`)) return { error: "unauthorized", status: 401 };
      // Edition rights may change after the outer route check while this call waits.
      const license = actor ? await loadLicenseRecordByKey(actor.licenseKey, this.env) : null;
      const compatible = !actor || (license && (!license.allowedEditions.includes("commercial") || this.env.SYNC_COMMERCIAL_PROTOCOL_READY === "true"));
      if (!(head?.cutoverId || hasFreshAuthority(head)) || !allowed || !compatible || !automaticSpaceAllowed(this.env, key)) return { error: "automatic_disabled", status: 403 };
      if (expected.epoch !== head.epoch || expected.baseRevision !== head.revision || expected.hash !== head.hash) return { error: "conflict", status: 409 };
      this.putHead({ ...head, strict: true });
      return this.metadata(this.head());
    });
  }
  deleteState(key, blockedActors = []) {
    return this.enqueue(async () => {
      const previous = this.head();
      const receipt = this.freshState.record()?.receipt;
      const head = { key, cutoverId: previous?.cutoverId, sourceIntegrity: previous?.sourceIntegrity, freshInitialization: previous?.freshInitialization || receipt, epoch: crypto.randomUUID(), revision: (previous?.revision || 0) + 1, exists: false, strict: previous?.strict || Boolean(receipt), blockedActors: [...new Set([...(previous?.blockedActors || []), ...blockedActors])],
        hash: "", bytes: 0, integrity: "", updatedAt: "", deviceName: "", version: 1, sizeBytes: 0, mirrorPending: true };
      this.ctx.storage.transactionSync(() => { this.ctx.storage.sql.exec("DELETE FROM chunks"); this.ctx.storage.sql.exec("DELETE FROM receipts"); this.migrationState.delete(); this.freshState.onDelete(); this.putHead(head); });
      await this.mirror();
      return this.metadata(this.head());
    });
  }
  async mirror() {
    const head = this.head();
    if (!head?.mirrorPending) return;
    try {
      if (head.exists) await this.env.SEAT_MANAGER_KV.put(head.key, JSON.stringify(await this.snapshot(head)));
      else await this.env.SEAT_MANAGER_KV.delete(head.key);
      this.putHead({ ...head, mirrorPending: false });
    } catch {
      console.warn(JSON.stringify({ event: "sync_mirror_pending" }));
      try { await this.ctx.storage.setAlarm(Date.now() + 60_000); } catch { /* Next save/delete also retries the latest mirror. */ }
    }
  }
  alarm() { return this.enqueue(() => this.mirror()); }
}
