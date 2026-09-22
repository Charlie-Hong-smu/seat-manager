import { useRef, useState } from "react";
import { getCurrentWorkspaceScope } from "../state/workspaces";

export const RECLICK_UNDO_MS = 6000;
type Entries<T> = Record<string, T | undefined>;
type Change<T> = { key: string; before: T | undefined; after: T | undefined };
type Registration<T> = { scope: string; changes: Change<T>[]; action?: string; expires: number; active: boolean; undoActivity?: () => void };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Each undo owns only its changed entries; later edits and other scopes are never overwritten. */
export function useRegistrationUndo<T>({ scope, entries, onRestore }: { scope: string; entries: Entries<T>; onRestore: (values: Entries<T>) => void }) {
  const fullScope = `${getCurrentWorkspaceScope()}:${scope}`;
  const latest = useRef({ scope: fullScope, entries, onRestore });
  const recent = useRef(new Map<string, Registration<T>>());
  if (latest.current.scope !== fullScope) {
    recent.current.forEach(item => { item.active = false; });
    recent.current.clear();
  }
  latest.current = { scope: fullScope, entries, onRestore };
  const [last, setLast] = useState<Registration<T> | null>(null);

  function valid(item: Registration<T>) {
    return item.active && item.scope === latest.current.scope && item.changes.every(change => equal(latest.current.entries[change.key], change.after));
  }
  function undo(item: Registration<T>) {
    if (!valid(item)) return false;
    item.active = false;
    const values = Object.fromEntries(item.changes.map(change => [change.key, change.before]));
    latest.current.entries = { ...latest.current.entries, ...values };
    latest.current.onRestore(values);
    item.undoActivity?.();
    setLast(current => current === item ? null : current);
    return true;
  }
  function record(next: Entries<T>, action?: string, undoActivity?: void | (() => void)) {
    const before = latest.current.entries;
    const changes = [...new Set([...Object.keys(before), ...Object.keys(next)])].filter(key => !equal(before[key], next[key])).map(key => ({ key, before: before[key], after: next[key] }));
    if (!changes.length) return undefined;
    for (const [key, item] of recent.current) if (!item.active) recent.current.delete(key);
    for (const change of changes) { const previous = recent.current.get(change.key); if (previous) previous.active = false; }
    const item: Registration<T> = { scope: fullScope, changes, action, expires: Date.now() + RECLICK_UNDO_MS, active: true, undoActivity: typeof undoActivity === "function" ? undoActivity : undefined };
    changes.forEach(change => recent.current.set(change.key, item));
    latest.current.entries = next;
    setLast(item);
    return () => undo(item);
  }
  function tryRevert(key: string, action: string) {
    const item = recent.current.get(key);
    return Boolean(item && item.changes.length === 1 && item.action === action && Date.now() < item.expires && undo(item));
  }
  return { record, tryRevert, canUndo: Boolean(last && valid(last)), undoLast: () => last ? undo(last) : false };
}
