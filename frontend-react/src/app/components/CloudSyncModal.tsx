import { useState } from "react";
import { Cloud, DownloadCloud, KeyRound, RefreshCw, UploadCloud, X } from "lucide-react";

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
import { useAppDialog } from "./ui";

interface CloudSyncModalProps {
  open: boolean;
  onClose: () => void;
  onBeforeUpload: () => void;
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

  if (!open) {
    return null;
  }

  async function run(action: "auth" | "status" | "upload" | "restore") {
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
        onBeforeUpload();
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

  return (
    <div className="soft-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="modal-panel-enter w-full max-w-lg overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-2xl">
        <div className="px-5 py-4 border-b border-separator-border flex items-start justify-between">
          <div>
            <div className="text-caption-1-regular text-accent-500 mb-0.5" style={{ fontWeight: 700 }}>手动云端同步</div>
            <h2 className="text-text-primary" style={{ fontSize: "1.125rem", fontWeight: 800 }}>云端备份与恢复</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-text-tertiary hover:text-text-secondary hover:bg-background-tertiary-default">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-caption-1-regular text-text-secondary mb-1.5" style={{ fontWeight: 700 }}>设备名称</span>
              <input
                value={deviceName}
                onChange={event => setDeviceName(event.target.value)}
                className="w-full px-3 py-2 text-body-regular bg-background-secondary-default border border-border-button-default rounded-xl outline-none focus:border-accent-300"
              />
            </label>
            {productSync ? (
              <div className="rounded-xl border border-accent-100 bg-accent-50 px-3 py-2">
                <span className="block text-caption-1-regular text-accent-500 mb-1" style={{ fontWeight: 700 }}>同步空间</span>
                <span className="text-body-regular text-accent-700">当前授权码独立空间</span>
              </div>
            ) : (
              <label className="block">
                <span className="block text-caption-1-regular text-text-secondary mb-1.5" style={{ fontWeight: 700 }}>同步码</span>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={syncCode}
                    onChange={event => setSyncCode(event.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-body-regular bg-background-secondary-default border border-border-button-default rounded-xl outline-none focus:border-accent-300"
                    placeholder="输入同步码"
                  />
                </div>
              </label>
            )}
          </div>

          {!productSync && (
            <label className="flex items-center gap-2 text-body-regular text-text-secondary cursor-pointer">
              <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} className="accent-accent-600" />
              记住同步授权 30 天
            </label>
          )}

          <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-4">
            <div className="flex items-center gap-2 text-body-regular text-text-primary" style={{ fontWeight: 700 }}>
              <Cloud className="w-4 h-4 text-accent-500" />
              云端状态
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-body-regular text-text-secondary">
              <span>状态：{status?.exists ? "已有备份" : status ? "暂无备份" : "未查询"}</span>
              <span>设备：{status?.deviceName || "--"}</span>
              <span className="col-span-2">时间：{formatTime(status?.updatedAt)}</span>
            </div>
            <p className="mt-3 text-body-regular text-accent-600">{message}</p>
          </div>
        </div>

        <div className="p-4 border-t border-separator-border flex flex-wrap gap-2">
          {!productSync && (
            <button disabled={busy} onClick={() => run("auth")} className="px-3 py-2 rounded-xl border border-border-button-default text-text-secondary hover:bg-background-secondary-default disabled:opacity-50 text-body-regular" style={{ fontWeight: 700 }}>
              授权
            </button>
          )}
          <button disabled={busy} onClick={() => run("status")} className="px-3 py-2 rounded-xl border border-border-button-default text-text-secondary hover:bg-background-secondary-default disabled:opacity-50 text-body-regular inline-flex items-center gap-1.5" style={{ fontWeight: 700 }}>
            <RefreshCw className="w-3.5 h-3.5" />状态
          </button>
          <button disabled={busy} onClick={() => run("upload")} className="px-3 py-2 rounded-xl bg-accent-600 text-text-white hover:bg-accent-700 disabled:opacity-50 text-body-regular inline-flex items-center gap-1.5" style={{ fontWeight: 700 }}>
            <UploadCloud className="w-3.5 h-3.5" />上传本机
          </button>
          <button disabled={busy} onClick={() => run("restore")} className="px-3 py-2 rounded-xl bg-status-warning-500 text-text-white hover:bg-status-warning-600 disabled:opacity-50 text-body-regular inline-flex items-center gap-1.5" style={{ fontWeight: 700 }}>
            <DownloadCloud className="w-3.5 h-3.5" />恢复云端
          </button>
          {!productSync && (
            <button disabled={busy} onClick={() => { clearSyncAuth(); setMessage("同步授权已清除。"); }} className="ml-auto px-3 py-2 rounded-xl text-text-tertiary hover:bg-background-secondary-default disabled:opacity-50 text-body-regular">
              清除授权
            </button>
          )}
        </div>
      </div>
      {appDialog.dialog}
    </div>
  );
}
