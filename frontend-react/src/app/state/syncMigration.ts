import { canonicalJson, contentHash, sha256, SYNC_MAX_BYTES, validSyncBook, validSyncData } from "../../../../shared/sync-content.mjs";

export interface MigrationStatus {
  available: boolean; space: string; phase: "unprepared" | "freezing" | "prepared" | "complete" | "aborted";
  operationId?: string; cutoverId?: string; backupIntegrity?: string; sourceIntegrity?: string; hash?: string; exists?: boolean; bytes?: number;
  freshInitialization?: { available: boolean; phase: "unprepared" | "checking" | "complete" | "cancelled"; operationId?: string; receipt?: FreshInitializationReceipt };
  initializationReceipt?: FreshInitializationReceipt;
}
export interface FreshInitializationReceipt { source: "fresh-test-empty-strict"; space: string; operationId: string; epoch: string; revision: 0; strict: true; createdAt: string; licenseCreatedAt: string; }
export interface MigrationBackup {
  version: 1; kind: "seat-manager-migration-backup"; space: string; operationId: string; cutoverId: string;
  integrity: string; sourceIntegrity: string; hash: string; snapshot: { data: Record<string, unknown>; workspaceBook?: unknown } | null;
}
export async function verifyMigrationBackup(backup: MigrationBackup, status: MigrationStatus): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(backup.snapshot));
  if (backup.version !== 1 || backup.kind !== "seat-manager-migration-backup" || backup.space !== status.space || backup.operationId !== status.operationId || backup.cutoverId !== status.cutoverId || bytes.length > SYNC_MAX_BYTES || bytes.length !== status.bytes || backup.integrity !== status.backupIntegrity || await sha256(bytes) !== backup.integrity || backup.sourceIntegrity !== status.sourceIntegrity || await sha256(canonicalJson(backup.snapshot)) !== backup.sourceIntegrity || backup.hash !== status.hash || (backup.snapshot ? !validSyncData(backup.snapshot.data) || (backup.snapshot.workspaceBook !== undefined && !validSyncBook(backup.snapshot.workspaceBook)) || await contentHash(backup.snapshot) !== backup.hash : backup.hash !== "")) throw new Error("migration_backup_corrupt");
}
