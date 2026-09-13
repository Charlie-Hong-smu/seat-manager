import { useCallback, useRef, useState, type SetStateAction } from "react";
import { getCurrentWorkspaceScope } from "../state/workspaces";

const prefix = "seat-manager-form-draft-v1:";
const memory = new Map<string, unknown>();

function draftKey(name: string): string { return `${prefix}${getCurrentWorkspaceScope()}:${name}`; }

export function readWorkspaceDraft<T>(name: string, fallback: T): T {
  const key = draftKey(name);
  try {
    const raw = localStorage.getItem(key);
    const value: unknown = raw === null ? memory.get(key) : JSON.parse(raw);
    if (value !== undefined && typeof value === typeof fallback && Array.isArray(value) === Array.isArray(fallback)) return value as T;
  } catch { /* 存储不可用时仍保留当前会话草稿。 */ }
  return memory.has(key) ? memory.get(key) as T : fallback;
}

/** 草稿单独缓存，不进入业务状态、备份或云端；提交方成功后清理。 */
export function useWorkspaceDraftState<T>(name: string, initial: T | (() => T)): [T, (update: SetStateAction<T>) => void, () => void] {
  const key = draftKey(name);
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const fallback = () => typeof initialRef.current === "function" ? (initialRef.current as () => T)() : initialRef.current;
  const [snapshot, setSnapshot] = useState(() => ({ key, value: readWorkspaceDraft(name, fallback()) }));
  const value = snapshot.key === key ? snapshot.value : readWorkspaceDraft(name, fallback());
  const current = useRef(value);
  current.current = value;
  const setValue = useCallback((update: SetStateAction<T>) => {
    const next = typeof update === "function" ? (update as (value: T) => T)(current.current) : update;
    current.current = next;
    memory.set(key, next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 输入仍保留于当前会话。 */ }
    setSnapshot({ key, value: next });
  }, [key]);
  const clear = useCallback(() => {
    memory.delete(key);
    try { localStorage.removeItem(key); } catch { /* 存储不可用时只清理会话缓存。 */ }
    setSnapshot(previous => ({ ...previous, key: "" }));
  }, [key]);
  return [value, setValue, clear];
}
