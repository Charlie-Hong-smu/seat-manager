/** Large pending/recovery snapshots live outside localStorage's main book quota. */
export interface SyncJournal {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}
async function openJournal(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("seat-manager-sync-journal-v2", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("entries");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("sync_storage_failed"));
    request.onblocked = () => reject(new Error("sync_storage_failed"));
  });
}
async function transaction<T>(write: boolean, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openJournal();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("entries", write ? "readwrite" : "readonly");
      const request = operation(tx.objectStore("entries"));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(new Error("sync_storage_failed"));
    });
  } finally { db.close(); }
}
export const syncJournal: SyncJournal = {
  get: <T>(key: string) => transaction<T | undefined>(false, store => store.get(key)),
  put: async (key, value) => { await transaction(true, store => store.put(value, key)); },
  remove: async key => { await transaction(true, store => store.delete(key)); },
};
