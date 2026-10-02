import { canonicalJson, sha256 } from "../shared/sync-content.mjs";
import { loadLicenseRecordByKey } from "./worker-license-store.js";

const SOURCE = "fresh-test-empty-strict";
const WINDOW_MS = 48 * 60 * 60 * 1000;
const operationId = value => typeof value === "string" && /^[\w-]{8,128}$/.test(value);

/** A short-lived operator grant for ONE newly issued synthetic license, not retirement evidence. */
export function freshTestGrant(env, space, license, now = Date.now()) {
  if (env.SYNC_FRESH_INITIALIZATION_ENABLED !== "true" || !license || !/^tenant-[a-f0-9]{64}$/.test(space)) return null;
  try {
    const grants = JSON.parse(env.SYNC_FRESH_TEST_GRANTS || "{}");
    if (!grants || Array.isArray(grants) || Object.keys(grants).length !== 1 || !Object.hasOwn(grants, space)) return null;
    const grant = grants[space];
    const created = Date.parse(grant?.licenseCreatedAt); const approved = Date.parse(grant?.approvedAt); const expires = Date.parse(grant?.expiresAt);
    if (grant?.purpose !== "synthetic-test" || !/^同步合成测试-/.test(grant.displayName || "") || grant.displayName !== license.displayName
      || grant.licenseCreatedAt !== license.createdAt || license.licenseId !== space || license.aiEnabled !== false || license.maxDevices !== 3
      || license.allowedEditions.length !== 1 || license.allowedEditions[0] !== "zhang"
      || ![created, approved, expires].every(Number.isFinite) || created > now || now - created > WINDOW_MS
      || approved < created || approved > now + 300_000 || expires <= now || expires <= approved || expires - approved > WINDOW_MS) return null;
    return grant;
  } catch { return null; }
}

export function hasFreshAuthority(head) {
  return head?.strict === true && head.freshInitialization?.source === SOURCE && operationId(head.freshInitialization.operationId);
}

/** All methods execute in the owner's queue. Never import or delete KV here. */
export class SyncFreshInitialization {
  constructor(owner) {
    this.owner = owner;
    owner.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS fresh_initialization (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL)");
  }
  record() { const row = this.owner.ctx.storage.sql.exec("SELECT value FROM fresh_initialization WHERE id=1").toArray()[0]; return row ? JSON.parse(row.value) : null; }
  put(record) { this.owner.ctx.storage.sql.exec("INSERT OR REPLACE INTO fresh_initialization VALUES(1, ?)", JSON.stringify(record)); }
  frozen() { return this.record()?.phase === "checking"; }
  hasMigrationSource() {
    return Boolean(this.owner.ctx.storage.sql.exec("SELECT EXISTS(SELECT 1 FROM migration_meta) OR EXISTS(SELECT 1 FROM migration_chunks) AS retained").toArray()[0].retained);
  }
  status(space, license, firstLifetime) {
    const record = this.record(); const head = this.owner.head();
    return { available: !head && record?.phase !== "complete" && !this.hasMigrationSource() && firstLifetime === true && Boolean(freshTestGrant(this.owner.env, space, license)), phase: record?.phase || "unprepared",
      ...(record ? { operationId: record.operationId, ...(record.receipt ? { receipt: record.receipt } : {}) } : {}) };
  }
  async grant(space, actor) {
    if (!actor || actor.edition !== "zhang") return null;
    const license = await loadLicenseRecordByKey(actor.licenseKey, this.owner.env);
    const grant = freshTestGrant(this.owner.env, space, license);
    if (!grant || !this.owner.env.ACCOUNT_COORDINATOR || !await this.owner.env.ACCOUNT_COORDINATOR.getByName(actor.licenseKey).isFirstLicenseLifetime(actor.licenseKey, license.createdAt)) return null;
    return grant;
  }
  async initialize(key, space, request, actor) {
    const grant = await this.grant(space, actor);
    if (!grant) return { error: "initialization_unavailable", status: 403 };
    if (!operationId(request.operationId) || request.acknowledgeAllWorkspaces !== true || request.acknowledgeSyntheticTestOnly !== true || request.acknowledgeIgnoreLateLegacy !== true) return { error: "initialization_confirmation_required", status: 400 };
    const fingerprint = await sha256(canonicalJson(grant));
    let record = this.record(); const head = this.owner.head();
    if (head) {
      if (record?.phase === "complete" && record.operationId === request.operationId && hasFreshAuthority(head) && head.epoch === record.receipt.epoch) return { receipt: record.receipt };
      return { error: "initialization_existing_head", status: 409 };
    }
    if (record?.phase === "complete") return { error: "initialization_existing_head", status: 409 };
    if (this.hasMigrationSource()) return { error: "initialization_existing_source", status: 409 };
    if (record?.phase === "checking" && (record.operationId !== request.operationId || record.fingerprint !== fingerprint)) return { error: "initialization_operation_changed", status: 409 };
    if (!record || record.phase === "cancelled") {
      record = { key, space, operationId: request.operationId, phase: "checking", fingerprint, licenseCreatedAt: grant.licenseCreatedAt };
      this.put(record); // Survives interruption BEFORE any external source read.
    }
    // Any visible value, even malformed JSON or literal null, is an existing source.
    if (await this.owner.env.SEAT_MANAGER_KV.get(key) !== null) return { error: "initialization_existing_source", status: 409 };
    const currentGrant = await this.grant(space, actor);
    if (!await this.owner.authorized(key, actor) || !currentGrant) return { error: "initialization_unavailable", status: 403 };
    if (await sha256(canonicalJson(currentGrant)) !== fingerprint) return { error: "initialization_operation_changed", status: 409 };
    const receipt = { source: SOURCE, space, operationId: record.operationId, epoch: crypto.randomUUID(), revision: 0, createdAt: new Date().toISOString(), licenseCreatedAt: grant.licenseCreatedAt, strict: true };
    this.owner.ctx.storage.transactionSync(() => {
      if (this.owner.head()) throw new Error("initialization_existing_head");
      this.owner.putHead({ key, epoch: receipt.epoch, revision: 0, exists: false, strict: true, hash: "", bytes: 0, integrity: "", updatedAt: "", deviceName: "", version: 1, sizeBytes: 0, mirrorPending: false, freshInitialization: receipt });
      this.put({ ...record, phase: "complete", receipt });
    });
    return { receipt };
  }
  cancel(request) {
    const record = this.record();
    if (record?.phase !== "checking" || record.operationId !== request.operationId || this.owner.head() || request.acknowledgeAllWorkspaces !== true) return { error: "initialization_operation_changed", status: 409 };
    this.put({ ...record, phase: "cancelled" });
    return { cancelled: true };
  }
  onDelete() { const record = this.record(); if (record?.phase === "checking") this.put({ ...record, phase: "cancelled" }); }
}
