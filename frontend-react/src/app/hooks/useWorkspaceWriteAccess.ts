import { useEffect, useRef, useState } from "react";
import { acceptWorkspaceRevision, hasWorkspaceConflict, setWorkspaceWriteEnabled, WORKSPACES_KEY } from "../state/workspaces";

/** 同一浏览器文件柜只允许一个编辑窗口，旧版本或外部写入另由版本核验拦截。 */
export function useWorkspaceWriteAccess(reload: () => unknown) {
  const [status, setStatus] = useState<"checking" | "ready" | "elsewhere" | "conflict" | "failed">("checking");
  const [attempt, setAttempt] = useState(0);
  const lockRequest = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    let cancelled = false;
    let release: (() => void) | undefined;
    setWorkspaceWriteEnabled(false);
    setStatus("checking");
    const ready = () => {
      acceptWorkspaceRevision();
      reload();
      setWorkspaceWriteEnabled(true);
      setStatus("ready");
    };
    if (navigator.locks) {
      // 等待本窗口上一次释放完成，避免重试或开发热更新误判成另一个窗口。
      lockRequest.current = lockRequest.current.catch(() => undefined).then(async () => {
        if (cancelled) return;
        await navigator.locks.request(`${WORKSPACES_KEY}:editor`, { ifAvailable: true }, async lock => {
          if (cancelled) return;
          if (!lock) { setStatus("elsewhere"); return; }
          ready();
          await new Promise<void>(resolve => { release = resolve; });
        });
      }).catch(() => { if (!cancelled) setStatus("failed"); });
    } else ready();
    const conflict = () => { if (hasWorkspaceConflict()) { setWorkspaceWriteEnabled(false); setStatus("conflict"); } };
    const changed = (event: StorageEvent) => { if (event.key === WORKSPACES_KEY || event.key === null) conflict(); };
    window.addEventListener("storage", changed);
    window.addEventListener("workspace-storage-conflict", conflict);
    return () => {
      cancelled = true; setWorkspaceWriteEnabled(false); release?.();
      window.removeEventListener("storage", changed);
      window.removeEventListener("workspace-storage-conflict", conflict);
    };
  }, [attempt, reload]);
  return { status, retry: () => setAttempt(value => value + 1) };
}
