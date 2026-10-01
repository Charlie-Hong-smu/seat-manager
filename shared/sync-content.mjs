// Shared wire semantics. Only navigation/known persistence metadata are excluded.
export const SYNC_MAX_BYTES = 5 * 1024 * 1024;
export const SYNC_CHUNK_BYTES = 512 * 1024;
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item ?? null)).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function syncContent(snapshot) {
  if (!snapshot.workspaceBook) return snapshot.data;
  const { currentSliceId: _selection, ...book } = snapshot.workspaceBook;
  return { ...book, slices: book.slices.map(slice => {
    const { updatedAt: _savedAt, ...content } = slice;
    return content;
  }) };
}
export async function sha256(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
export function contentHash(snapshot) { return sha256(canonicalJson(syncContent(snapshot))); }
export function validSyncData(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.students) && Array.isArray(value.seatOrder));
}
export function validSyncBook(book) {
  if (!book || book.version !== 1 || !Array.isArray(book.slices) || !book.slices.length) return false;
  const text = value => typeof value === "string" && Boolean(value.trim());
  const ids = new Set(); const terms = new Set();
  for (const slice of book.slices) {
    if (!slice || !text(slice.id) || ids.has(slice.id) || !text(slice.classId) || typeof slice.className !== "string" || !text(slice.createdAt) || !text(slice.updatedAt) || !validSyncData(slice.data)) return false;
    const term = slice.term;
    if (!term || !text(term.id) || terms.has(term.id) || !Number.isFinite(term.year) || !["spring", "autumn", "custom"].includes(term.season) || !text(term.label) || !text(term.createdAt)) return false;
    ids.add(slice.id); terms.add(term.id);
  }
  return ids.has(book.currentSliceId);
}
