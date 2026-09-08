import { useEffect } from "react";
import { CheckCircle2, RefreshCw, X } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";

async function removeLegacyPwaCaches(): Promise<void> {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.filter(key => key.startsWith("seat-manager-v")).map(key => caches.delete(key)));
}

export function PwaLifecycle() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW: () => {
      void removeLegacyPwaCaches();
    },
    onRegisterError: error => {
      console.warn("PWA 注册失败", error);
    },
  });

  useEffect(() => {
    if (!offlineReady) return;
    const timer = window.setTimeout(() => setOfflineReady(false), 5000);
    return () => window.clearTimeout(timer);
  }, [offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  return (
    <div role="status" className="fixed bottom-5 right-5 z-[120] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-border-button-default bg-background-primary-default p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${needRefresh ? "bg-accent-50 text-accent-600" : "bg-status-success-50 text-status-success-600"}`}>
          {needRefresh ? <RefreshCw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-body-semibold text-text-primary">{needRefresh ? "发现新版本" : "已可离线使用"}</div>
          <p className="mt-1 text-caption-1-regular leading-5 text-text-secondary">
            {needRefresh ? "更新将在你确认后刷新页面，当前编辑不会被自动打断。" : "应用核心页面已缓存，断网后仍可从本机打开。"}
          </p>
          {needRefresh && (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void updateServiceWorker(true)} className="rounded-lg bg-text-primary px-3 py-2 text-caption-1-semibold text-text-white">立即更新</button>
              <button type="button" onClick={() => setNeedRefresh(false)} className="rounded-lg bg-background-tertiary-default px-3 py-2 text-caption-1-semibold text-text-secondary">稍后</button>
            </div>
          )}
        </div>
        <button type="button" aria-label="关闭提示" onClick={() => { setOfflineReady(false); setNeedRefresh(false); }} className="rounded-lg p-1.5 text-text-tertiary hover:bg-background-tertiary-default hover:text-text-primary">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
