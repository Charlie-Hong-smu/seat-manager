export const SYNC_MAX_BYTES: number;
export const SYNC_CHUNK_BYTES: number;
export function canonicalJson(value: unknown): string;
export function contentHash(snapshot: { workspaceBook?: unknown; data?: unknown }): Promise<string>;
export function sha256(value: string | Uint8Array): Promise<string>;
export function syncContent(snapshot: { workspaceBook?: unknown; data?: unknown }): unknown;
export function validSyncData(value: unknown): boolean;
export function validSyncBook(value: unknown): boolean;
