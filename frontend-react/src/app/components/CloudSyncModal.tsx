import { useState } from "react";
import { Cloud, DownloadCloud, RefreshCw, UploadCloud } from "lucide-react";

import {
  clearSyncAuth,
  fetchCloudStatus,
  getSyncDeviceName,
  requestSyncAuth,
  restoreStateFromCloud,
  uploadCurrentStateToCloud,
  usesProductAuthForSync,
  type SyncStatus,
} from "../state/syncStorage";
import { Button, Checkbox, Input, ModalShell, useAppDialog } from "./ui";

interface CloudSyncModalProps {
  open: boolean;
  onClose: () => void;
  onBeforeUpload: () => boolean;
  onRestored: () => void;
}

function formatTime(value?: string): string {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

export function CloudSyncModal({ open, onClose, onBeforeUpload, onRestored }: CloudSyncModalProps) {
  const appDialog = useAppDialog();
  const [syncCode, setSyncCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [deviceName, setDeviceName] = useState(getSyncDeviceName);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [message, setMessage] = useState("当前产品授权码会使用独立云端空间。");
  const [busy, setBusy] = useState(false);
  const productSync = usesProductAuthForSync();


  async function run(action: "auth" | "status" | "upload" | "restore") {
    if (busy) return;
    try {
      setBusy(true);
      setMessage("正在处理...");
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
        setMessage(next.exists ? `云端备份时间：${formatTime(next.updatedAt)}` : "云端暂无备份。");
        return;
      }
      if (action === "upload") {
        if (!onBeforeUpload()) { setMessage("本机保存失败，已停止上传，请先处理保存问题。"); return; }
        const next = await uploadCurrentStateToCloud(deviceName);
        setStatus(next);
        setMessage(`已上传到云端：${formatTime(next.updatedAt)}。`);
        return;
      }
      if (action === "restore") {
        if (!await appDialog.confirm({ title: "从云端恢复数据？", description: "云端数据将覆盖当前本机工作区。系统会先生成本机安全快照；请确认云端版本确实是需要恢复的版本。", confirmLabel: "确认恢复云端", variant: "danger" })) {
          setMessage("已取消恢复。");
          return;
        }
        if (!onBeforeUpload()) { setMessage("本机保存失败，已停止恢复，请先处理保存问题。"); return; }
        const next = await restoreStateFromCloud();
        setStatus(next);
        onRestored();
        setMessage(`已从云端恢复：${formatTime(next.updatedAt)}。`);
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
        setMessage("本机数据过大，暂时无法同步。请先使用旧版导出本机备份。");
      } else {
        setMessage("云同步暂时不可用，请稍后再试。");
      }
    } finally {
      setBusy(false);
    }
  }

  return <>
    <ModalShell open={open} title="云端备份与恢复" description="手动云端同步" onClose={() => { if (!busy) onClose(); }} footer={<>
      {!productSync && <Button variant="secondary" disabled={busy} onClick={() => void run("auth")}>授权</Button>}
      <Button variant="secondary" disabled={busy} onClick={() => void run("status")}><RefreshCw className="h-4 w-4"/>状态</Button>
      <Button disabled={busy} onClick={() => void run("upload")}><UploadCloud className="h-4 w-4"/>上传本机</Button>
      <Button variant="danger" disabled={busy} onClick={() => void run("restore")}><DownloadCloud className="h-4 w-4"/>恢复云端</Button>
      {!productSync && <Button variant="ghost" disabled={busy} onClick={() => { clearSyncAuth(); setMessage("同步授权已清除。"); }}>清除授权</Button>}
    </>}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="设备名称" value={deviceName} onChange={setDeviceName} />
            {productSync ? (
              <div>
                <span className="block text-caption-1-regular text-text-secondary">同步空间</span>
                <span className="mt-1 block text-body-regular text-text-primary">当前授权码独立空间</span>
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
              <span>状态：{status?.exists ? "已有备份" : status ? "暂无备份" : "未查询"}</span>
              <span>设备：{status?.deviceName || "--"}</span>
              <span className="col-span-2">时间：{formatTime(status?.updatedAt)}</span>
            </div>
            <p className="mt-2 text-body-regular text-accent-600">{message}</p>
          </div>
        </div>

    </ModalShell>
    {appDialog.dialog}
  </>;
}
