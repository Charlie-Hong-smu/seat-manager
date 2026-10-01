import { useEffect, useState } from "react";
import { Cloud, DownloadCloud, RefreshCw, UploadCloud } from "lucide-react";

import {
  clearSyncAuth,
  fetchCloudStatus,
  getSyncDeviceName,
  setSyncDeviceName,
  requestSyncAuth,
  restoreStateFromCloud,
  uploadCurrentStateToCloud,
  usesProductAuthForSync,
  type SyncStatus,
} from "../state/syncStorage";
import { Button, Checkbox, Input, ModalShell, useAppDialog } from "./ui";
import { syncErrorMessage, type SnapshotSync, type SyncView } from "../state/syncProtocol";

interface CloudSyncModalProps {
  open: boolean;
  onClose: () => void;
  onBeforeUpload: () => boolean;
  onRestored: () => void;
  engine: SnapshotSync;
  syncView: SyncView;
}

function formatTime(value?: string): string {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export function CloudSyncModal({ open, onClose, onBeforeUpload, onRestored, engine, syncView }: CloudSyncModalProps) {
  const appDialog = useAppDialog();
  const [syncCode, setSyncCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [deviceName, setDeviceName] = useState(getSyncDeviceName);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [message, setMessage] = useState("当前产品授权码会使用独立云端空间。");
  const [busy, setBusy] = useState(false);
  const productSync = usesProductAuthForSync();
  const cloudStatus = syncView.head?.ready ? syncView.head : status;
  useEffect(() => { if (open && productSync) void engine.inspect(); }, [open, productSync, engine]);

  async function confirmChoice(local: boolean, reviewed: SyncView) {
    const confirmed = await appDialog.confirm({ title: local ? "保留本机并发布到云端？" : "采用云端全部班级学期？", description: `目标云空间：${reviewed.head?.licenseId || "当前授权空间"}。本次涉及全部班级和学期。${local ? "将以本机整柜替换刚核对的云端版本" : "将以刚核对的云端整柜替换本机正式数据，保留本机当前班级选择"}；双版本恢复点已保留。已缓存草稿会隔离保留，不会自动写入新数据；未缓存的布局和预览草稿会丢弃。自动模式仍关闭。`, confirmLabel: local ? "确认保留本机并发布" : "确认采用云端", variant: "danger" });
    if (confirmed) setMessage((await engine.choose(local ? "local" : "cloud")).message);
    else setMessage("已取消选择，双版本仍保留。");
  }

  async function run(action: "auth" | "status" | "upload" | "restore" | "sync" | "local" | "cloud" | "recovery") {
    if (busy) return;
    try {
      setBusy(true);
      setMessage("正在处理...");
      if (["sync", "upload", "local", "cloud"].includes(action)) setSyncDeviceName(deviceName);
      if (action === "recovery") {
        const recovery = await engine.recovery();
        if (!recovery) { setMessage("当前空间暂无同步恢复点。"); return; }
        const url = URL.createObjectURL(new Blob([JSON.stringify(recovery, null, 2)], { type: "application/json" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = `seat-manager-sync-recovery-${Date.now()}.json`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage("已导出双版本恢复点；可分别取出 local.workspaceBook 或 remote.workspaceBook，使用原 JSON 导入流程恢复。"); return;
      }
      if (action === "sync") { const result = await engine.sync(); setMessage(result.message); return; }
      if (action === "local" || action === "cloud") {
        await confirmChoice(action === "local", syncView);
        return;
      }
      if (action === "auth") {
        if (productSync) {
          setMessage("当前已使用产品授权，无需另输同步码。");
          return;
        }
        if (!syncCode.trim()) {
          setMessage("请输入同步码。");
          return;
        }
        await requestSyncAuth(syncCode.trim(), remember);
        setSyncCode("");
        setMessage("同步授权成功。");
        return;
      }
      if (action === "status") {
        const next = await fetchCloudStatus();
        setStatus(next);
        setMessage(`${next.exists ? `云端备份时间：${formatTime(next.updatedAt)}` : "云端暂无备份。"}${next.metadataWarning ? "本机同步时间未能保存。" : ""}`);
        return;
      }
      if (action === "upload") {
        if (productSync) {
          const result = await engine.reviewManual("local");
          if (result.head?.ready || result.phase !== "manual" || !result.head) { setMessage(result.message); if (result.choice) await confirmChoice(true, result); return; }
        }
        if (!onBeforeUpload()) { setMessage("本机保存失败，已停止上传，请先处理保存问题。"); return; }
        const next = await uploadCurrentStateToCloud(deviceName);
        setStatus(next);
        setMessage(`已上传到云端：${formatTime(next.updatedAt)}。${next.metadataWarning ? "本机同步时间未能保存，请检查存储空间。" : ""}`);
        return;
      }
      if (action === "restore") {
        if (productSync) {
          const result = await engine.reviewManual("cloud");
          if (result.head?.ready || result.phase !== "manual" || !result.head) { setMessage(result.message); if (result.choice) await confirmChoice(false, result); return; }
        }
        if (!await appDialog.confirm({ title: "从云端恢复数据？", description: "云端数据将覆盖当前本机工作区。系统会先生成本机安全快照；请确认云端版本确实是需要恢复的版本。", confirmLabel: "确认恢复云端", variant: "danger" })) {
          setMessage("已取消恢复。");
          return;
        }
        if (!onBeforeUpload()) { setMessage("本机保存失败，已停止恢复，请先处理保存问题。"); return; }
        const next = await restoreStateFromCloud();
        setStatus(next);
        onRestored();
        setMessage(`已从云端恢复：${formatTime(next.updatedAt)}。${next.metadataWarning ? "本机恢复时间未能保存，恢复数据已生效。" : ""}`);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      if (reason === "sync_auth_required") {
        setMessage(productSync ? "产品授权已过期，请退出后重新输入授权码。" : "请先输入同步码完成授权。");
      } else if (reason === "sync_forbidden") {
        setMessage("同步码错误，请重新输入。");
      } else if (reason === "sync_invalid_data") {
        setMessage("云端数据格式异常，已取消恢复。");
      } else if (reason === "sync_payload_too_large") {
        setMessage("整柜数据超过 5 MiB，请在名单与备份页导出本机 JSON。");
      } else {
        setMessage(syncErrorMessage(error));
      }
    } finally {
      setBusy(false);
    }
  }

  return <>
    <ModalShell open={open} title="云端备份与恢复" description="安全快照同步 · 自动模式关闭" onClose={() => { if (!busy) onClose(); }} footer={<>
      {!productSync && <Button variant="secondary" disabled={busy} onClick={() => void run("auth")}>授权</Button>}
      <Button variant="secondary" disabled={busy} onClick={() => void run("status")}><RefreshCw className="h-4 w-4"/>状态</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void run("upload")}><UploadCloud className="h-4 w-4"/>上传本机</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void run("restore")}><DownloadCloud className="h-4 w-4"/>恢复云端</Button>
      <Button disabled={busy} onClick={() => void run("sync")}><RefreshCw className="h-4 w-4"/>立即同步</Button>
      {!productSync && <Button variant="ghost" disabled={busy} onClick={() => { clearSyncAuth(); setMessage("同步授权已清除。"); }}>清除授权</Button>}
    </>}>
        <div className="space-y-4" data-cloud-sync>
          <p className="text-body-regular text-text-secondary" role="status">{syncView.message}</p>
          {syncView.choice && <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => void run("local")}>保留本机并发布</Button>
            <Button variant="secondary" disabled={busy || !syncView.head?.exists} onClick={() => void run("cloud")}>采用云端版本</Button>
            <Button variant="quiet" disabled={busy} onClick={onClose}>稍后处理</Button>
          </div>}
          {syncView.head?.ready && <Button variant="quiet" disabled={busy} onClick={() => void run("recovery")}>导出同步恢复点</Button>}
          <div className="grid grid-cols-2 gap-3">
            <Input label="设备名称" value={deviceName} onChange={setDeviceName} />
            {productSync ? (
              <div>
                <span className="block text-caption-1-regular text-text-secondary">同步空间</span>
                <span className="mt-1 block break-all text-body-regular text-text-primary">{syncView.head?.licenseId || "当前授权码独立空间"}</span>
              </div>
            ) : (
              <Input label="同步码" type="password" value={syncCode} onChange={setSyncCode} placeholder="输入同步码" />
            )}
          </div>

          {!productSync && (
            <Checkbox isSelected={remember} onChange={setRemember}>记住同步授权 30 天</Checkbox>
          )}

          <div className="border-t border-separator-border pt-4">
            <div className="flex items-center gap-2 text-body-semibold text-text-primary">
              <Cloud className="h-4 w-4 text-accent-500" />
              云端状态
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-body-regular text-text-secondary">
              <span>状态：{cloudStatus?.exists ? "已有备份" : cloudStatus ? "暂无备份" : "未查询"}</span>
              <span>设备：{cloudStatus?.deviceName || "--"}</span>
              <span className="col-span-2">时间：{formatTime(cloudStatus?.updatedAt)}</span>
            </div>
            {message !== syncView.message && message !== "当前产品授权码会使用独立云端空间。" && <p className="mt-2 text-body-regular text-accent-600">{message}</p>}
          </div>
        </div>

    </ModalShell>
    {appDialog.dialog}
  </>;
}
