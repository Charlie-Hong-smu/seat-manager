import { useCallback, useEffect, useRef } from "react";

/** Cancel obsolete work when its student, workspace, drawer or component changes. */
export function useScopedRequest(scope: string) {
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const pending = useRef<AbortController | null>(null);
  const cancel = useCallback(() => { pending.current?.abort(); pending.current = null; }, []);
  useEffect(() => cancel, [scope, cancel]);
  const start = useCallback(() => {
    cancel();
    const controller = new AbortController();
    const startedScope = currentScope.current;
    pending.current = controller;
    return { signal: controller.signal, isCurrent: () => pending.current === controller && currentScope.current === startedScope && !controller.signal.aborted };
  }, [cancel]);
  return { start, cancel };
}
