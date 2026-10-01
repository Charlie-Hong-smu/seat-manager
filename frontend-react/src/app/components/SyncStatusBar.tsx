import { RefreshCw } from "lucide-react";
import { Button } from "./ui";
import type { SyncView } from "../state/syncProtocol";

export function SyncStatusBar({ view, saveStatus, onOpen, onRetrySave }: { view: SyncView; saveStatus: "saved" | "saving" | "failed" | "quota"; onOpen(): void; onRetrySave(): void }) {
  const failed = saveStatus === "failed" || saveStatus === "quota";
  const local = failed ? "本机未保存成功" : saveStatus === "saving" ? "本机保存中…" : "本机已保存";
  const cloud = view.phase === "synced" ? "云端已同步" : view.phase === "offline" ? "离线待同步" : view.phase === "conflict" ? "云端有冲突" : view.phase === "uploading" ? "上传中…" : view.phase === "pending" ? "待同步" : view.phase === "auth" ? "需重新授权" : view.phase === "paused" ? "同步已暂停" : view.phase === "checking" ? "核对中…" : "手动同步";
  return <div className="app-sync-status-bar min-h-11 shrink-0 items-center justify-between gap-2 border-b border-[var(--app-border)] bg-background-primary-default px-3">
    <span role="status" className={`min-w-0 text-caption-1-regular ${failed || view.phase === "conflict" ? "text-status-danger-600" : "text-text-secondary"}`}>{local} · {cloud}</span>
    <Button size="sm" variant="quiet" onClick={failed ? onRetrySave : onOpen}><RefreshCw className="h-4 w-4" />{failed ? "重试保存" : "立即同步"}</Button>
  </div>;
}
