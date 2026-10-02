import { SYNC_CHUNK_BYTES, SYNC_MAX_BYTES, canonicalJson, contentHash, sha256, validSyncBook, validSyncData } from "../shared/sync-content.mjs";

const id = value => typeof value === "string" && /^[\w-]{8,128}$/.test(value);
const digest = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const validSnapshot = value => value === null || (validSyncData(value?.data) && (value.workspaceBook === undefined || validSyncBook(value.workspaceBook)));

/** Operator evidence is deployment configuration, never a claim from a client. */
export function cutoverFor(env, space) {
  if (env.SYNC_MIGRATION_ENABLED !== "true" || !space) return null;
  try {
    const value = JSON.parse(env.SYNC_CUTOVER_MANIFESTS || "{}")[space];
    if (!value || !id(value.cutoverId) || !id(value.retiredWorkerVersion) || !digest(value.sourceIntegrity) || value.oldWritersRetired !== true || value.backupRetained !== true || !Number.isFinite(Date.parse(value.verifiedAt)) || Date.parse(value.verifiedAt) > Date.now() + 300_000) return null;
    return value;
  } catch { return null; }
}

/** Called only inside the coordinator queue. Backup rows stay below 512 KiB. */
export class SyncMigration {
  constructor(owner) {
    this.owner = owner;
    owner.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS migration_meta (slot TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS migration_chunks (slot TEXT, position INTEGER, value BLOB NOT NULL, PRIMARY KEY(slot, position));
    `);
  }
  meta(slot) {
    const row = this.owner.ctx.storage.sql.exec("SELECT value FROM migration_meta WHERE slot=?", slot).toArray()[0];
    return row ? JSON.parse(row.value) : null;
  }
  putMeta(slot, value) { this.owner.ctx.storage.sql.exec("INSERT OR REPLACE INTO migration_meta VALUES(?, ?)", slot, JSON.stringify(value)); }
  async writeBlob(slot, snapshot, metadata) {
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    if (bytes.length > SYNC_MAX_BYTES) throw new Error("legacy_snapshot_too_large");
    const next = { ...metadata, bytes: bytes.length, integrity: await sha256(bytes), sourceIntegrity: await sha256(canonicalJson(snapshot)), hash: snapshot ? await contentHash(snapshot) : "", exists: Boolean(snapshot) };
    this.owner.ctx.storage.transactionSync(() => {
      this.owner.ctx.storage.sql.exec("DELETE FROM migration_chunks WHERE slot=?", slot);
      for (let offset = 0, position = 0; offset < bytes.length; offset += SYNC_CHUNK_BYTES, position++) this.owner.ctx.storage.sql.exec("INSERT INTO migration_chunks VALUES(?, ?, ?)", slot, position, bytes.slice(offset, offset + SYNC_CHUNK_BYTES).buffer);
      this.putMeta(slot, next);
    });
    return next;
  }
  async blob(slot, metadata = this.meta(slot)) {
    if (!metadata) throw new Error("migration_backup_missing");
    const bytes = new Uint8Array(metadata.bytes); let offset = 0;
    for (const row of this.owner.ctx.storage.sql.exec("SELECT value FROM migration_chunks WHERE slot=? ORDER BY position", slot).toArray()) {
      const chunk = new Uint8Array(row.value); bytes.set(chunk, offset); offset += chunk.length;
    }
    if (offset !== bytes.length || await sha256(bytes) !== metadata.integrity) throw new Error("migration_backup_corrupt");
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  }
  frozen() { return ["freezing", "prepared"].includes(this.meta("operation")?.phase); }
  status(space) {
    const cutover = cutoverFor(this.owner.env, space); const operation = this.meta("operation");
    return { available: Boolean(cutover), space, phase: this.owner.head()?.cutoverId ? "complete" : operation?.phase || "unprepared",
      ...(operation ? { operationId: operation.operationId, cutoverId: operation.cutoverId, backupIntegrity: operation.integrity, sourceIntegrity: operation.sourceIntegrity, hash: operation.hash, exists: operation.exists, bytes: operation.bytes, sequence: operation.sequence, recordedAt: operation.recordedAt } : {}) };
  }
  async legacySave(key, payload, space) {
    const cutover = cutoverFor(this.owner.env, space);
    // Spaces outside the rollout keep the historical manual storage behavior.
    if (!cutover) { await this.owner.env.SEAT_MANAGER_KV.put(key, JSON.stringify(payload)); return; }
    const witness = await this.writeBlob("legacy", payload, { boundary: cutover.cutoverId, sequence: (this.meta("legacy")?.sequence || 0) + 1, pendingMirror: true });
    // Capture before external I/O so a lost response/restart can finish this exact write.
    await this.owner.env.SEAT_MANAGER_KV.put(key, JSON.stringify(payload));
    this.putMeta("legacy", { ...witness, pendingMirror: false });
  }
  async prepare(key, space, operationId) {
    const cutover = cutoverFor(this.owner.env, space);
    if (!cutover) return { error: "migration_unavailable", status: 403 };
    if (!id(operationId)) return { error: "bad_request", status: 400 };
    const authority = this.owner.head();
    if (authority?.cutoverId) return this.status(space);
    let operation = this.meta("operation");
    if (operation && operation.phase !== "aborted" && operation.operationId !== operationId) return { error: "migration_operation_changed", status: 409, ...this.status(space) };
    if (operation?.phase === "prepared") return this.status(space);
    if (!operation || operation.phase === "aborted") {
      operation = { operationId, key, cutoverId: cutover.cutoverId, phase: "freezing", recordedAt: new Date().toISOString(), ...(authority ? { authorityEpoch: authority.epoch, authorityRevision: authority.revision, authorityHash: authority.hash } : {}) };
      this.putMeta("operation", operation); // Persistent queue barrier precedes the first source read.
    }
    if (operation.cutoverId !== cutover.cutoverId) return { error: "migration_boundary_changed", status: 409 };
    const witness = this.meta("legacy");
    let snapshot; let sequence = 0;
    if (authority) {
      snapshot = await this.owner.snapshot(authority);
      if (await sha256(canonicalJson(snapshot)) !== cutover.sourceIntegrity) return { error: "migration_source_not_settled", status: 503, ...this.status(space) };
    } else if (witness?.boundary === cutover.cutoverId) {
      snapshot = await this.blob("legacy", witness); sequence = witness.sequence;
      if (witness.pendingMirror) {
        await this.owner.env.SEAT_MANAGER_KV.put(key, JSON.stringify(snapshot));
        this.putMeta("legacy", { ...witness, pendingMirror: false });
      }
    } else {
      snapshot = await this.owner.env.SEAT_MANAGER_KV.get(key, { type: "json" });
      // The candidate must match the independently retained, sealed source backup.
      // Repeated reads, clocks, and a single KV response never establish freshness.
      if (await sha256(canonicalJson(snapshot)) !== cutover.sourceIntegrity) return { error: "migration_source_not_settled", status: 503, ...this.status(space) };
    }
    if (!validSnapshot(snapshot)) return { error: "legacy_snapshot_invalid", status: 400 };
    await this.writeBlob("operation", snapshot, { ...operation, phase: "prepared", sequence });
    return this.status(space);
  }
  async backup(space, operationId) {
    const operation = this.meta("operation");
    if (!operation || operation.operationId !== operationId || !["prepared", "complete"].includes(operation.phase)) return { error: "migration_backup_missing", status: 409 };
    return { version: 1, kind: "seat-manager-migration-backup", space, operationId, cutoverId: operation.cutoverId, integrity: operation.integrity, sourceIntegrity: operation.sourceIntegrity, hash: operation.hash, snapshot: await this.blob("operation", operation) };
  }
  async commit(key, space, request) {
    const operation = this.meta("operation"); const cutover = cutoverFor(this.owner.env, space);
    if (!operation || request.operationId !== operation.operationId || request.backupIntegrity !== operation.integrity) return { error: "migration_operation_changed", status: 409 };
    if (operation.phase === "complete" && this.owner.head()) return this.status(space);
    if (!cutover || cutover.cutoverId !== operation.cutoverId) return { error: "migration_boundary_changed", status: 409 };
    if (operation.phase !== "prepared" || request.acknowledgeBackup !== true || request.acknowledgeAllWorkspaces !== true) return { error: "migration_confirmation_required", status: 400 };
    const snapshot = await this.blob("operation", operation); const bytes = new TextEncoder().encode(JSON.stringify(snapshot));
    const authority = this.owner.head();
    if (authority && (authority.epoch !== operation.authorityEpoch || authority.revision !== operation.authorityRevision || authority.hash !== operation.authorityHash)) return { error: "migration_operation_changed", status: 409 };
    const head = { key, cutoverId: operation.cutoverId, sourceIntegrity: operation.sourceIntegrity, epoch: crypto.randomUUID(), revision: snapshot ? 1 : 0, exists: Boolean(snapshot), strict: false, hash: operation.hash,
      integrity: operation.integrity, bytes: bytes.length, updatedAt: snapshot?.updatedAt || "", deviceName: snapshot?.deviceName || "", version: Number(snapshot?.version) || 1, sizeBytes: Number(snapshot?.sizeBytes) || 0, mirrorPending: true };
    this.owner.ctx.storage.transactionSync(() => {
      if (authority) this.owner.putHead({ ...authority, cutoverId: operation.cutoverId, sourceIntegrity: operation.sourceIntegrity });
      else { if (this.owner.head()) throw new Error("migration_already_committed"); if (snapshot) this.owner.putChunks(head.revision, bytes); this.owner.putHead(head); }
      this.putMeta("operation", { ...operation, phase: "complete", completedAt: new Date().toISOString() });
      this.owner.ctx.storage.sql.exec("DELETE FROM migration_chunks WHERE slot='legacy'");
      this.owner.ctx.storage.sql.exec("DELETE FROM migration_meta WHERE slot='legacy'");
    });
    await this.owner.mirror();
    return this.status(space);
  }
  abort(space, operationId) {
    const operation = this.meta("operation");
    if (!operation || operation.operationId !== operationId || this.owner.head()?.cutoverId) return { error: "migration_operation_changed", status: 409 };
    this.putMeta("operation", { ...operation, phase: "aborted" });
    return this.status(space);
  }
  delete() {
    this.owner.ctx.storage.sql.exec("DELETE FROM migration_chunks");
    this.owner.ctx.storage.sql.exec("DELETE FROM migration_meta");
  }
}
