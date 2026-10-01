import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SnapshotSync, AUTOMATIC_SYNC_RELEASE_ENABLED, type CloudSnapshot } from "../state/syncProtocol";
import { syncJournal } from "../state/syncJournal";
import { fetchSyncProtocol, getSyncDeviceName } from "../state/syncStorage";
import { getProductAuthToken } from "../state/authStorage";
import { exportWholeBook, importPreparedWorkspace, prepareWorkspaceImport } from "../state/workspaces";
import { getEditVersion, getRemoteGeneration, hasUnsavedController } from "../state/workspaceSyncEvents";
import { hasWorkspaceDrafts } from "./useWorkspaceDraftState";

function hasCachedDrafts(): boolean {
  if (hasWorkspaceDrafts() || document.querySelector("[data-seat-layout-editor]")) return true;
  for (const dialog of document.querySelectorAll('[role="dialog"], [role="alertdialog"]')) {
    if (!dialog.querySelector("[data-cloud-sync]") && dialog.getAttribute("aria-hidden") !== "true") return true;
  }
  const generation = getRemoteGeneration();
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index) || "";
    if (key.startsWith("seat-manager-ai-assistant-chat:") && key.endsWith(":draft") && localStorage.getItem(key) && (generation ? key.endsWith(`:generation-${generation}:draft`) : !key.includes(":generation-"))) return true;
    if (!/^(seat-manager-form-draft-v1:|seat-manager-ai-comment-draft:)/.test(key)) continue;
    if (generation ? key.endsWith(`:generation-${generation}`) : !key.includes(":generation-")) return true;
  }
  return false;
}
export function useCloudSync(options: { enabled: boolean; writable: boolean; flush(): boolean; editing(): boolean; onApplied(): void }) {
  const current = useRef(options); current.current = options;
  const [engine] = useState(() => new SnapshotSync({
    token: getProductAuthToken, book: exportWholeBook, device: getSyncDeviceName, storage: localStorage, journal: syncJournal,
    flush: () => current.current.flush(), editing: () => current.current.editing() || hasCachedDrafts(), writable: () => current.current.writable,
    editVersion: getEditVersion, unsaved: hasUnsavedController, generation: getRemoteGeneration, api: fetchSyncProtocol,
    apply: (snapshot: CloudSnapshot, preserveSelection: boolean) => {
      const prepared = prepareWorkspaceImport(snapshot.workspaceBook ?? snapshot.data);
      const selection = exportWholeBook().currentSliceId;
      if (preserveSelection && prepared.book.slices.some(slice => slice.id === selection)) prepared.book.currentSliceId = selection;
      return importPreparedWorkspace(prepared, "remote");
    },
  }));
  const view = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
  useEffect(() => {
    const written = (event: Event) => { if ((event as CustomEvent<{ source: string }>).detail?.source === "local") engine.onSaved(); };
    const applied = () => current.current.onApplied();
    const failed = () => engine.pause();
    const authChanged = () => engine.pause();
    window.addEventListener("workspace-book-written", written);
    window.addEventListener("workspace-remote-applied", applied);
    window.addEventListener("workspace-book-write-failed", failed);
    window.addEventListener("product-auth-changed", authChanged);
    const visible = () => { if (AUTOMATIC_SYNC_RELEASE_ENABLED && current.current.enabled && document.visibilityState === "visible") engine.checkAutomatic(); };
    window.addEventListener("online", visible);
    document.addEventListener("visibilitychange", visible);
    const poll = AUTOMATIC_SYNC_RELEASE_ENABLED ? window.setInterval(visible, 60_000) : undefined;
    return () => {
      engine.pause(); if (poll) window.clearInterval(poll);
      window.removeEventListener("workspace-book-written", written);
      window.removeEventListener("workspace-remote-applied", applied);
      window.removeEventListener("workspace-book-write-failed", failed);
      window.removeEventListener("product-auth-changed", authChanged);
      window.removeEventListener("online", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [engine]);
  return { engine, view };
}
