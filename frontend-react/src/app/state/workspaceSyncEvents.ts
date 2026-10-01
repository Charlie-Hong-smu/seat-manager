import { useSyncExternalStore } from "react";
const GENERATION_KEY = "seat-manager-workspace-generation-v2";
let editVersion = 0;
let unsaved = false;
export function getRemoteGeneration(): string { try { return localStorage.getItem(GENERATION_KEY) || ""; } catch { return ""; } }
export function getEditVersion(): number { return editVersion; }
export function markWorkspaceEdited(): void { editVersion++; unsaved = true; }
export function markControllerSaved(): void { unsaved = false; }
export function hasUnsavedController(): boolean { return unsaved; }
export function prepareRemoteGeneration(): () => void {
  const previous = getRemoteGeneration();
  localStorage.setItem(GENERATION_KEY, crypto.randomUUID());
  return () => { if (previous) localStorage.setItem(GENERATION_KEY, previous); else localStorage.removeItem(GENERATION_KEY); };
}
export function notifyRemoteApplied(): void { editVersion++; unsaved = false; window.dispatchEvent(new Event("workspace-remote-applied")); }
const subscribe = (listener: () => void) => { window.addEventListener("workspace-remote-applied", listener); return () => window.removeEventListener("workspace-remote-applied", listener); };
export function useRemoteGeneration(): string { return useSyncExternalStore(subscribe, getRemoteGeneration, () => ""); }
export function cacheGenerationSuffix(): string { const generation = getRemoteGeneration(); return generation ? `:generation-${generation}` : ""; }
