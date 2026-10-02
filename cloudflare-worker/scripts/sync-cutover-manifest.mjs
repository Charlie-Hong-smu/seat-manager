import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { canonicalJson, contentHash, sha256, SYNC_MAX_BYTES, validSyncBook, validSyncData } from "../../shared/sync-content.mjs";

/** Offline only: sealing is an explicit operator attestation, not inferred from a GET. */
export async function makeCutoverManifest({ space, snapshot, cutoverId, retiredWorkerVersion, verifiedAt, oldWritersRetired, backupRetained }) {
  const identifier = value => typeof value === "string" && /^[\w-]{8,128}$/.test(value);
  if (typeof space !== "string" || !space || space.length > 128 || !identifier(cutoverId) || !identifier(retiredWorkerVersion) || oldWritersRetired !== true || backupRetained !== true || !Number.isFinite(Date.parse(verifiedAt)) || Date.parse(verifiedAt) > Date.now() + 300_000) throw new Error("Explicit space, retired-writer boundary and retained-backup attestations are required.");
  if (snapshot !== null && (!validSyncData(snapshot?.data) || (snapshot.workspaceBook !== undefined && !validSyncBook(snapshot.workspaceBook)))) throw new Error("Invalid source snapshot.");
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > SYNC_MAX_BYTES) throw new Error("Source snapshot exceeds 5 MiB.");
  return { [space]: { cutoverId, retiredWorkerVersion, verifiedAt, oldWritersRetired: true, backupRetained: true, sourceIntegrity: await sha256(canonicalJson(snapshot)), sourceContentHash: snapshot ? await contentHash(snapshot) : "" } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [evidencePath, backupPath, outputPath] = process.argv.slice(2);
    if (!evidencePath || !backupPath || !outputPath) throw new Error("Usage: node scripts/sync-cutover-manifest.mjs <evidence.json> <retained-backup.json> <manifest.json>");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    const snapshot = JSON.parse(readFileSync(backupPath, "utf8"));
    const manifest = await makeCutoverManifest({ ...evidence, snapshot });
    writeFileSync(outputPath, JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
    console.log("Created a local cutover manifest. No cloud request or deployment was performed.");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
