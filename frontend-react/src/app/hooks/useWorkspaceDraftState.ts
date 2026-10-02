import { useCallback, useRef, useState, type SetStateAction } from "react";
import { getCurrentWorkspaceScope } from "../state/workspaces";
import { cacheGenerationSuffix, getRemoteGeneration } from "../state/workspaceSyncEvents";

const prefix = "seat-manager-form-draft-v1:";
// Failed writes (including clears) take precedence over an older disk value.
const memory = new Map<string, { value: unknown; pending: boolean }>();
export function hasWorkspaceDrafts(): boolean {
  const suffix = cacheGenerationSuffix();
  const active = (key: string) => key.startsWith(prefix) && (suffix ? key.endsWith(suffix) : !key.includes(":generation-"));
  for (const [key, entry] of memory) if (active(key) && entry.pending && entry.value !== undefined) return true;
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index) || "";
    if (active(key) && !(memory.get(key)?.pending && memory.get(key)?.value === undefined)) return true;
  }
  return false;
}

function draftKey(name: string): string { return `${prefix}${getCurrentWorkspaceScope()}:${name}${cacheGenerationSuffix()}`; }

export function readWorkspaceDraft<T>(name: string, fallback: T): T {
  const key = draftKey(name);
  const cached = memory.get(key);
  const compatible = (value: unknown): value is T => value !== undefined
    && (value === null ? fallback === null : fallback !== null && typeof value === typeof fallback)
    && Array.isArray(value) === Array.isArray(fallback);
  if (cached?.pending) return compatible(cached.value) ? cached.value : fallback;
  try {
    const raw = localStorage.getItem(key);
    const value: unknown = raw === null ? undefined : JSON.parse(raw);
    return compatible(value) ? value : fallback;
  } catch { /* 存储不可用时仍保留当前会话草稿。 */ }
  const cachedValue = cached?.value;
  return compatible(cachedValue) ? cachedValue : fallback;
}

/** 草稿单独缓存，不进入业务状态、备份或云端；提交方成功后清理。 */
export function useWorkspaceDraftState<T>(name: string, initial: T | (() => T)): [T, (update: SetStateAction<T>) => void, () => void] {
  const key = draftKey(name);
  const generation = getRemoteGeneration();
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const fallback = () => typeof initialRef.current === "function" ? (initialRef.current as () => T)() : initialRef.current;
  const [snapshot, setSnapshot] = useState(() => ({ key, value: readWorkspaceDraft(name, fallback()) }));
  const value = snapshot.key === key ? snapshot.value : readWorkspaceDraft(name, fallback());
  const current = useRef({ key, value });
  current.current = { key, value };
  const setValue = useCallback((update: SetStateAction<T>) => {
    if (current.current.key !== key || generation !== getRemoteGeneration()) return;
    const next = typeof update === "function" ? (update as (value: T) => T)(current.current.value) : update;
    current.current = { key, value: next };
    const initialValue = typeof initialRef.current === "function" ? (initialRef.current as () => T)() : initialRef.current;
    if (JSON.stringify(next) === JSON.stringify(initialValue)) {
      // Returning to the form's original value leaves no active edit to protect.
      memory.set(key, { value: undefined, pending: true });
      try { localStorage.removeItem(key); memory.delete(key); } catch { /* The memory tombstone suppresses an older disk draft. */ }
      setSnapshot({ key, value: next });
      return;
    }
    const entry = { value: next, pending: true };
    memory.set(key, entry);
    try { localStorage.setItem(key, JSON.stringify(next)); entry.pending = false; } catch { /* 输入仍保留于当前会话。 */ }
    setSnapshot({ key, value: next });
  }, [key, generation]);
  const clear = useCallback(() => {
    if (current.current.key !== key || generation !== getRemoteGeneration()) return;
    current.current = { key, value: typeof initialRef.current === "function" ? (initialRef.current as () => T)() : initialRef.current };
    memory.set(key, { value: undefined, pending: true });
    try { localStorage.removeItem(key); memory.delete(key); } catch { /* 阻止旧磁盘草稿在当前会话重新出现。 */ }
    setSnapshot(previous => ({ ...previous, key: "" }));
  }, [key, generation]);
  return [value, setValue, clear];
}
