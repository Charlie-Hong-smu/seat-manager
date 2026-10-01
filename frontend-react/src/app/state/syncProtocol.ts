import { contentHash, SYNC_MAX_BYTES } from "../../../../shared/sync-content.mjs";
import type { WorkspaceBook } from "./types";
import type { SyncJournal } from "./syncJournal";

// Release transition, independent of edition and teachers' persisted preference.
export const AUTOMATIC_SYNC_RELEASE_ENABLED = false;
export { contentHash };
export interface CloudHead {
  ready: boolean; exists: boolean; licenseId: string; epoch: string; revision: number; hash: string;
  strict: boolean; automaticAvailable: boolean; updatedAt?: string; deviceName?: string; sizeBytes?: number;
}
export interface CloudSnapshot extends CloudHead { workspaceBook?: WorkspaceBook; data?: Record<string, unknown>; }
export interface SnapshotPayload { version: 1; workspaceBook: WorkspaceBook; data: Record<string, unknown>; deviceName: string; }
export interface PendingSnapshot extends SnapshotPayload { protocol: 2; epoch: string; baseRevision: number; clientMutationId: string; hash: string; }
export interface Checkpoint { version: 2; space: string; epoch: string; revision: number; hash: string; automatic: boolean; }
export type SyncPhase = "unbound" | "manual" | "checking" | "synced" | "pending" | "offline" | "uploading" | "conflict" | "auth" | "paused" | "draft";
export interface SyncView { phase: SyncPhase; message: string; head?: CloudHead; choice?: "bind" | "conflict"; }
export class SyncProtocolError extends Error {
  constructor(public code: string, public status = 0) { super(code); }
  get retryable(): boolean { return this.status === 0 || this.status === 429 || this.status >= 500; }
}
export const syncErrorMessage = (error: unknown): string => {
  const code = error instanceof Error ? error.message : "";
  if (["sync_auth_required", "unauthorized"].includes(code)) return "授权失效，请重新登录；本机数据仍保留。";
  if (["forbidden", "automatic_disabled"].includes(code)) return "当前授权暂不能启用此同步能力。";
  if (["conflict", "epoch_changed", "upgrade_required", "mutation_reused"].includes(code)) return "云端版本已变化，请重新核对并选择；本机数据仍保留。";
  if (["sync_payload_too_large", "payload_too_large"].includes(code)) return "整柜数据超过 5 MiB，请在名单与备份页导出本机 JSON。";
  if (code === "rate_limited") return "请求较多，请稍后重试；待同步内容已保留。";
  if (["sync_storage_failed", "sync_local_save_failed"].includes(code)) return "本机存储失败，已暂停同步；请先导出备份并处理存储空间。";
  if (code === "sync_changed_during_request") return "请求期间本机发生编辑，已保留修改；请再次同步。";
  if (code === "migration_required") return "安全同步尚待云存储迁移验收；当前仍可使用手动备份与恢复。";
  if (code === "sync_invalid_data") return "云端协议或数据格式异常，已停止应用。";
  return "云同步暂时不可用；本机数据与待同步内容仍保留。";
};
export function snapshotOf(book: WorkspaceBook, deviceName: string): SnapshotPayload {
  const captured = structuredClone(book);
  const slice = captured.slices.find(item => item.id === captured.currentSliceId) || captured.slices[0];
  return { version: 1, workspaceBook: captured, data: structuredClone(slice.data), deviceName };
}
export function validateCloudHead(value: CloudHead): void {
  if (!value.ready) return;
  if (!value.licenseId || typeof value.epoch !== "string" || !value.epoch || !Number.isSafeInteger(value.revision) || value.revision < 0 || typeof value.hash !== "string" || (value.exists && !/^[a-f0-9]{64}$/.test(value.hash))) throw new SyncProtocolError("sync_invalid_data");
}

interface SyncPorts {
  token(): string; book(): WorkspaceBook; device(): string; flush(): boolean; editing(): boolean; writable(): boolean;
  editVersion(): number; unsaved(): boolean; generation(): string;
  apply(snapshot: CloudSnapshot, preserveSelection: boolean): boolean;
  api<T>(path: string, token: string, body?: unknown): Promise<T>;
  storage: Pick<Storage, "getItem" | "setItem">; journal: SyncJournal;
}
const BINDING_KEY = "seat-manager-sync-binding-v2";
const checkpointKey = (space: string) => `seat-manager-sync-checkpoint-v2:${space}`;
type Choice = { head: CloudHead; remote?: CloudSnapshot; local: SnapshotPayload; token: string; editVersion: number; generation: string; };

/** Single-flight local-first coordinator. Timestamps are display-only. */
export class SnapshotSync {
  private view: SyncView = { phase: "unbound", message: "云端未绑定" };
  private listeners = new Set<() => void>();
  private running: Promise<SyncView> | null = null;
  private choice: Choice | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private firstQueuedAt = 0;
  private retryAttempt = 0;
  private automatic = false;
  private inspectionVersion = 0;
  private session = 0;
  private requestSession = 0;
  constructor(private ports: SyncPorts) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.view;
  private show(view: SyncView): SyncView { this.view = view; this.listeners.forEach(listener => listener()); return view; }
  private current(token: string): void {
    if (!token || token !== this.ports.token()) throw new SyncProtocolError("sync_auth_required", 401);
    if (this.running && this.requestSession !== this.session) throw new SyncProtocolError("sync_storage_failed");
  }
  private readCheckpoint(space: string): Checkpoint | null {
    const raw = this.ports.storage.getItem(checkpointKey(space)); if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Checkpoint;
      return value.version === 2 && value.space === space && typeof value.epoch === "string" && Number.isSafeInteger(value.revision) && typeof value.hash === "string" ? value : null;
    } catch { return null; }
  }
  private acknowledge(head: CloudHead): void {
    try { this.ports.storage.setItem(checkpointKey(head.licenseId), JSON.stringify({ version: 2, space: head.licenseId, epoch: head.epoch, revision: head.revision, hash: head.hash, automatic: this.automatic } satisfies Checkpoint)); }
    catch { throw new SyncProtocolError("sync_storage_failed"); }
  }
  private async checkedHead(token: string): Promise<CloudHead> {
    this.current(token);
    const head = await this.ports.api<CloudHead>("/sync/status?protocol=2", token);
    this.current(token); validateCloudHead(head); return head;
  }
  private async remote(head: CloudHead, token: string): Promise<CloudSnapshot | undefined> {
    if (!head.exists) return undefined;
    const remote = await this.ports.api<CloudSnapshot>("/sync/load?protocol=2", token);
    this.current(token); validateCloudHead(remote);
    if (!remote.ready || !remote.exists || remote.licenseId !== head.licenseId || remote.epoch !== head.epoch || remote.revision !== head.revision || remote.hash !== head.hash || await contentHash(remote) !== remote.hash) throw new SyncProtocolError("conflict", 409);
    return remote;
  }
  async inspect(): Promise<SyncView> {
    if (this.running) return this.running;
    const version = ++this.inspectionVersion;
    try {
      const head = await this.checkedHead(this.ports.token());
      if (version !== this.inspectionVersion || this.running) return this.view;
      if (!head.ready) return this.show({ phase: "manual", message: syncErrorMessage(new Error("migration_required")), head });
      const checkpoint = this.readCheckpoint(head.licenseId);
      const hash = await contentHash(snapshotOf(this.ports.book(), this.ports.device()));
      if (version !== this.inspectionVersion || this.running) return this.view;
      if (this.ports.storage.getItem(BINDING_KEY) !== head.licenseId || !checkpoint) return this.show({ phase: "unbound", message: "请点击立即同步，核对所有班级学期与目标云空间。", head });
      const same = hash === head.hash && !this.ports.unsaved();
      return this.show({ phase: same ? "synced" : checkpoint.hash === hash && checkpoint.epoch === head.epoch ? "pending" : checkpoint.revision !== head.revision || checkpoint.epoch !== head.epoch ? "conflict" : "pending", message: same ? "云端已同步" : "有版本待核对，点击立即同步。", head });
    } catch (error) { return this.failure(error); }
  }
  private failure(error: unknown): SyncView {
    if (error instanceof DOMException && ["QuotaExceededError", "SecurityError"].includes(error.name)) error = new SyncProtocolError("sync_storage_failed");
    const status = error instanceof SyncProtocolError ? error.status : 0;
    const message = syncErrorMessage(error);
    const phase: SyncPhase = status === 401 || status === 403 ? "auth" : status === 409 ? "conflict" : error instanceof Error && error.message === "sync_changed_during_request" ? "draft" : error instanceof Error && /storage|local_save|payload|invalid/.test(error.message) ? "paused" : navigator.onLine === false ? "offline" : "pending";
    if (this.automatic && (error instanceof SyncProtocolError ? error.retryable : false)) {
      const delay = Math.min(60_000, 2000 * 2 ** this.retryAttempt++) * (0.8 + Math.random() * 0.4);
      this.timer = setTimeout(() => { void this.sync(); }, delay);
    } else if (["auth", "conflict", "paused"].includes(phase)) this.automatic = false;
    return this.show({ phase, message, head: this.view.head });
  }
  sync(): Promise<SyncView> {
    if (this.running) return this.running;
    this.inspectionVersion++;
    this.requestSession = this.session;
    this.running = this.run().catch(error => this.failure(error)).finally(() => {
      this.running = null;
      if (this.automatic && this.view.phase === "pending" && this.retryAttempt === 0) this.onSaved();
    });
    return this.running;
  }
  /** Manual backup/restore reviews both versions without choosing a transfer direction. */
  reviewManual(direction: "local" | "cloud"): Promise<SyncView> {
    if (this.running) return this.running;
    this.inspectionVersion++;
    this.requestSession = this.session;
    this.choice = null;
    this.automatic = false;
    clearTimeout(this.timer);
    this.running = (async () => {
      if (!this.ports.writable() || !this.ports.flush()) throw new SyncProtocolError("sync_local_save_failed");
      const token = this.ports.token();
      this.show({ phase: "checking", message: "正在核对手动操作涉及的本机与云端版本…" });
      const head = await this.checkedHead(token);
      if (!head.ready) return this.show({ phase: "manual", message: syncErrorMessage(new Error("migration_required")), head });
      if (direction === "cloud" && !head.exists) return this.show({ phase: "manual", message: "云端暂无备份，已停止恢复。", head });
      const local = snapshotOf(this.ports.book(), this.ports.device());
      const editVersion = this.ports.editVersion(); const generation = this.ports.generation();
      const remote = await this.remote(head, token);
      await this.ports.journal.put(`conflict:${head.licenseId}`, { local, remote, recordedAt: new Date().toISOString() });
      this.current(token);
      this.choice = { head, remote, local, token, editVersion, generation };
      return this.show({ phase: "manual", message: `已核对目标云空间 ${head.licenseId} 与全部 ${local.workspaceBook.slices.length} 个班级学期；请确认${direction === "local" ? "上传本机" : "恢复云端"}。`, head, choice: this.ports.storage.getItem(BINDING_KEY) === head.licenseId ? "conflict" : "bind" });
    })().catch(error => this.failure(error)).finally(() => { this.running = null; });
    return this.running;
  }
  private async run(): Promise<SyncView> {
    if (!this.ports.writable() || !this.ports.flush()) throw new SyncProtocolError("sync_local_save_failed");
    const token = this.ports.token();
    this.show({ phase: "checking", message: "正在核对本机与云端版本…" });
    const head = await this.checkedHead(token);
    if (!head.ready) return this.show({ phase: "manual", message: syncErrorMessage(new Error("migration_required")), head });
    const local = snapshotOf(this.ports.book(), this.ports.device());
    const localHash = await contentHash(local);
    const checkpoint = this.readCheckpoint(head.licenseId);
    const bound = this.ports.storage.getItem(BINDING_KEY) === head.licenseId;
    const editVersion = this.ports.editVersion(); const generation = this.ports.generation();
    // A persisted pending request takes precedence over a new comparison: its response may have been lost.
    if (bound) {
      const pending = await this.ports.journal.get<PendingSnapshot>(`pending:${head.licenseId}`);
      this.current(token);
      if (pending) {
        return this.uploadOrConflict(head, pending, token);
      }
    }
    if (bound && checkpoint && localHash === head.hash && !this.ports.unsaved()) {
      this.current(token); this.acknowledge(head);
      return this.show({ phase: "synced", message: "云端已同步", head });
    }
    if (!bound || !checkpoint || checkpoint.epoch !== head.epoch || (checkpoint.revision !== head.revision && checkpoint.hash !== localHash)) {
      const remote = await this.remote(head, token);
      this.choice = { head, remote, local, token, editVersion, generation };
      await this.ports.journal.put(`conflict:${head.licenseId}`, { local, remote, recordedAt: new Date().toISOString() });
      this.current(token);
      return this.show({ phase: !bound || !checkpoint ? "unbound" : "conflict", message: !bound || !checkpoint ? `核对目标云空间 ${head.licenseId}；将同步全部 ${local.workspaceBook.slices.length} 个班级学期。` : "两端都有修改，双版本已保存在本机。请明确选择。", head, choice: !bound || !checkpoint ? "bind" : "conflict" });
    }
    if (checkpoint.hash === localHash && head.revision !== checkpoint.revision) {
      if (this.ports.editing() || this.ports.unsaved()) return this.show({ phase: "draft", message: "有未保存的编辑或草稿，请先处理后同步。", head });
      const remote = await this.remote(head, token);
      if (!remote) return this.show({ phase: "conflict", message: "云端快照已删除，请明确选择是否重新发布本机。", head });
      await this.applyRemote({ head, remote, local, token, editVersion, generation }, true);
      return this.show({ phase: "synced", message: "已安全获取云端更新", head });
    }
    return this.uploadOrConflict(head, await this.pending(local, head), token);
  }
  private async pending(local: SnapshotPayload, head: CloudHead): Promise<PendingSnapshot> {
    const payload: PendingSnapshot = { ...local, protocol: 2, epoch: head.epoch, baseRevision: head.revision, clientMutationId: crypto.randomUUID(), hash: await contentHash(local) };
    const bytes = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (bytes > SYNC_MAX_BYTES - 256) throw new SyncProtocolError("sync_payload_too_large", 413);
    try { await this.ports.journal.put(`pending:${head.licenseId}`, payload); } catch { throw new SyncProtocolError("sync_storage_failed"); }
    return payload;
  }
  private async upload(head: CloudHead, payload: PendingSnapshot, token: string): Promise<SyncView> {
    this.current(token);
    this.show({ phase: "uploading", message: "正在上传已保存的整柜快照…", head });
    const receipt = await this.ports.api<CloudHead>("/sync/save", token, payload);
    this.current(token); validateCloudHead(receipt);
    if (!receipt.ready || receipt.licenseId !== head.licenseId || receipt.epoch !== payload.epoch || receipt.hash !== payload.hash || receipt.revision !== payload.baseRevision + 1) throw new SyncProtocolError("sync_invalid_data");
    this.acknowledge(receipt);
    await this.ports.journal.remove(`pending:${head.licenseId}`);
    this.current(token);
    const currentHash = await contentHash(snapshotOf(this.ports.book(), this.ports.device()));
    const dirty = currentHash !== payload.hash || this.ports.unsaved();
    const cloudAhead = head.revision > receipt.revision;
    this.retryAttempt = 0;
    if (dirty && this.automatic) this.onSaved();
    return this.show({ phase: dirty || cloudAhead ? "pending" : "synced", message: dirty ? "本次快照已上传；后续修改仍待同步。" : cloudAhead ? "旧请求已确认；云端已有更新，请再次同步核对。" : "云端已同步", head: receipt });
  }
  private async uploadOrConflict(head: CloudHead, pending: PendingSnapshot, token: string): Promise<SyncView> {
    try { return await this.upload(head, pending, token); }
    catch (error) {
      if (!(error instanceof SyncProtocolError) || error.status !== 409) throw error;
      const local = snapshotOf(this.ports.book(), this.ports.device());
      const editVersion = this.ports.editVersion(); const generation = this.ports.generation();
      const latest = await this.checkedHead(token); const remote = await this.remote(latest, token);
      this.choice = { head: latest, remote, local, token, editVersion, generation };
      await this.ports.journal.put(`conflict:${latest.licenseId}`, { local, remote, pending, recordedAt: new Date().toISOString() });
      this.current(token);
      return this.show({ phase: "conflict", message: "待发送快照与云端冲突，双版本已保留。请明确选择。", head: latest, choice: "conflict" });
    }
  }
  private async applyRemote(choice: Choice, preserveSelection: boolean, confirmedDraftDiscard = false): Promise<void> {
    const guard = async () => {
      const currentHash = await contentHash(snapshotOf(this.ports.book(), this.ports.device()));
      const capturedHash = await contentHash(choice.local);
      this.current(choice.token);
      if (!this.ports.writable() || this.ports.unsaved() || (!confirmedDraftDiscard && this.ports.editing()) || this.ports.editVersion() !== choice.editVersion || this.ports.generation() !== choice.generation || currentHash !== capturedHash) throw new SyncProtocolError("sync_changed_during_request");
    };
    await guard();
    // Commit a verified recovery point before replacing any teacher data.
    await this.ports.journal.put(`recovery:${choice.head.licenseId}`, { local: choice.local, remote: choice.remote, recordedAt: new Date().toISOString() });
    await guard();
    if (!choice.remote || !this.ports.apply(choice.remote, preserveSelection)) throw new SyncProtocolError("sync_storage_failed");
    this.acknowledge(choice.head);
  }
  async choose(direction: "local" | "cloud"): Promise<SyncView> {
    if (this.running || !this.choice) return this.view;
    this.requestSession = this.session;
    const choice = this.choice;
    this.running = (async () => {
      if (!this.ports.writable() || !this.ports.flush()) throw new SyncProtocolError("sync_local_save_failed");
      this.current(choice.token);
      if (this.ports.editVersion() !== choice.editVersion || this.ports.generation() !== choice.generation || await contentHash(snapshotOf(this.ports.book(), this.ports.device())) !== await contentHash(choice.local)) throw new SyncProtocolError("sync_changed_during_request");
      const latest = await this.checkedHead(choice.token);
      if (latest.epoch !== choice.head.epoch || latest.revision !== choice.head.revision) throw new SyncProtocolError("conflict", 409);
      await this.ports.journal.put(`recovery:${choice.head.licenseId}`, { local: choice.local, remote: choice.remote, recordedAt: new Date().toISOString() });
      const oldPending = await this.ports.journal.get<PendingSnapshot>(`pending:${choice.head.licenseId}`);
      if (oldPending) {
        await this.ports.journal.put(`discarded-pending:${choice.head.licenseId}`, oldPending);
        await this.ports.journal.remove(`pending:${choice.head.licenseId}`);
      }
      this.current(choice.token);
      try { this.ports.storage.setItem(BINDING_KEY, choice.head.licenseId); } catch { throw new SyncProtocolError("sync_storage_failed"); }
      if (direction === "cloud") {
        await this.applyRemote(choice, true, true);
        return this.show({ phase: "synced", message: "已采用云端版本，本机恢复点已保留。", head: choice.head });
      }
      this.acknowledge(choice.head);
      if (await contentHash(choice.local) === choice.head.hash) return this.show({ phase: "synced", message: "云端已同步", head: choice.head });
      // Conflict resolution also uses the exact confirmed revision, never force-write.
      return this.uploadOrConflict(choice.head, await this.pending(choice.local, choice.head), choice.token);
    })().catch(error => this.failure(error)).finally(() => { if (this.choice === choice) this.choice = null; this.running = null; });
    return this.running;
  }
  onSaved(): void {
    if (this.running) return;
    if (!this.automatic) {
      if (this.view.phase === "synced" && !this.running) {
        const view = this.view;
        void contentHash(snapshotOf(this.ports.book(), this.ports.device())).then(hash => {
          if (this.view === view && !this.running && hash !== view.head?.hash) this.show({ ...view, phase: "pending", message: "本机已保存，点击立即同步核对。" });
        }).catch(error => this.failure(error));
      }
      return;
    }
    const now = Date.now(); if (!this.firstQueuedAt) this.firstQueuedAt = now;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.firstQueuedAt = 0; void this.sync(); }, Math.min(3000, Math.max(0, 30_000 - (now - this.firstQueuedAt))));
  }
  checkAutomatic(): void { if (AUTOMATIC_SYNC_RELEASE_ENABLED && this.automatic) void this.sync(); }
  async recovery(): Promise<unknown> {
    const token = this.ports.token(); const head = await this.checkedHead(token);
    if (!head.ready) throw new SyncProtocolError("migration_required", 503);
    const recovery = await this.ports.journal.get(`recovery:${head.licenseId}`);
    const conflict = await this.ports.journal.get(`conflict:${head.licenseId}`);
    this.current(token);
    if (!recovery && !conflict) return null;
    return { version: 1, kind: "seat-manager-sync-recovery", space: head.licenseId, recovery, conflict };
  }
  async enableAutomatic(confirmedAllWorkspaces: boolean): Promise<SyncView> {
    if (!AUTOMATIC_SYNC_RELEASE_ENABLED || !confirmedAllWorkspaces) return this.show({ phase: "manual", message: "自动模式尚未开放：须先完成云存储迁移与两版兼容验收。" });
    const head = await this.checkedHead(this.ports.token());
    if (!head.ready || !head.automaticAvailable || this.ports.storage.getItem(BINDING_KEY) !== head.licenseId) throw new SyncProtocolError("automatic_disabled", 403);
    await this.ports.api("/sync/mode", this.ports.token(), { enable: true, acknowledgeAllWorkspaces: true, baseRevision: head.revision, epoch: head.epoch, hash: head.hash });
    this.automatic = true; this.acknowledge(head);
    return this.sync();
  }
  pause(): void { this.session++; this.inspectionVersion++; this.automatic = false; clearTimeout(this.timer); this.choice = null; this.show({ phase: "unbound", message: "云端已暂停，请核对当前授权空间后同步。" }); }
}
