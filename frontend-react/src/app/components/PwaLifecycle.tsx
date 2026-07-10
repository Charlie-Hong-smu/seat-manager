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
    <div role="status" className="fixed bottom-5 right-5 z-[120] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl">
      <div className="flex items-start gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${needRefresh ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"}`}>
          {needRefresh ? <RefreshCw className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-gray-900">{needRefresh ? "发现新版本" : "已可离线使用"}</div>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            {needRefresh ? "更新将在你确认后刷新页面，当前编辑不会被自动打断。" : "应用核心页面已缓存，断网后仍可从本机打开。"}
          </p>
          {needRefresh && (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => void updateServiceWorker(true)} className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-bold text-white">立即更新</button>
              <button type="button" onClick={() => setNeedRefresh(false)} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600">稍后</button>
            </div>
          )}
        </div>
        <button type="button" aria-label="关闭提示" onClick={() => { setOfflineReady(false); setNeedRefresh(false); }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
