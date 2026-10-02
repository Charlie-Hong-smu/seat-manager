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

const migrationPhaseLabel = { unprepared: "尚未准备", freezing: "已冻结，待核对备份", prepared: "备份已固定，待下载确认", complete: "已完成", aborted: "已取消" };

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
  const [backupVerified, setBackupVerified] = useState(false);
  const productSync = usesProductAuthForSync();
  const cloudStatus = syncView.head?.ready ? syncView.head : status;
  useEffect(() => { if (open && productSync) void engine.inspect(); }, [open, productSync, engine]);

  async function confirmChoice(local: boolean, reviewed: SyncView) {
    const confirmed = await appDialog.confirm({ title: local ? "保留本机并发布到云端？" : "采用云端全部班级学期？", description: `目标云空间：${reviewed.head?.licenseId || "当前授权空间"}。本次涉及全部班级和学期。${local ? "将以本机整柜替换刚核对的云端版本" : "将以刚核对的云端整柜替换本机正式数据，保留本机当前班级选择"}；双版本恢复点已保留。已缓存草稿会隔离保留，不会自动写入新数据；未缓存的布局和预览草稿会丢弃。自动模式仍关闭。`, confirmLabel: local ? "确认保留本机并发布" : "确认采用云端", variant: "danger" });
    if (confirmed) setMessage((await engine.choose(local ? "local" : "cloud")).message);
    else setMessage("已取消选择，双版本仍保留。");
  }

  async function run(action: "auth" | "status" | "upload" | "restore" | "sync" | "local" | "cloud" | "recovery" | "enable" | "disable" | "prepare" | "commit" | "abort" | "migration-backup" | "initialize" | "cancel-initialization") {
    if (busy) return;
    try {
      setBusy(true);
      setMessage("正在处理...");
      if (action === "initialize" || action === "cancel-initialization") {
        const confirmed = await appDialog.confirm({ title: action === "initialize" ? "初始化这个新建合成测试空间？" : "取消未完成的空初始化？", description: `目标云空间：${syncView.head?.licenseId || syncView.migration?.space}。${action === "initialize" ? "仅用于新建合成测试授权。确认本机全部班级和学期只有虚构数据。云端将建立空的严格同步空间，本机数据保持保存且不会上传，自动模式保持关闭。初始化后永久拒绝旧客户端盲写；未知或迟到的旧云端写入不会进入此空间，可能被舍弃。此操作不能替代已有教师空间的数据迁移。" : "解除此空间未完成初始化的上传冻结；本机数据保留。已经完成的严格初始化不能撤销。"}`, confirmLabel: action === "initialize" ? "确认合成测试并初始化" : "确认取消空初始化", variant: "danger" });
        if (confirmed) setMessage((await engine.initializeFresh(action, true, syncView.head?.licenseId || syncView.migration?.space)).message);
        return;
      }
      if (["sync", "upload", "local", "cloud"].includes(action)) setSyncDeviceName(deviceName);
      if (action === "enable") {
        const confirmed = await appDialog.confirm({ title: syncView.automaticPaused ? "恢复自动同步？" : "启用自动同步？", description: `目标云空间：${syncView.head?.licenseId || "当前授权空间"}。将同步本机全部班级和学期：正式保存后上传，进入、回前台或联网时核对云端；仅本机干净且没有活动草稿时获取更新。两端修改会保留双版本并暂停。启用后此空间会拒绝旧客户端盲写；可随时停用自动发送。`, confirmLabel: "确认启用全部班级学期", variant: "danger" });
        if (confirmed) setMessage((await engine.enableAutomatic(true, syncView.head?.licenseId)).message);
        else setMessage("未启用自动同步。");
        return;
      }
      if (action === "disable") { setMessage(engine.disableAutomatic().message); return; }
      if (action === "prepare" || action === "commit" || action === "abort") {
        const confirmed = await appDialog.confirm({ title: action === "prepare" ? "准备此空间的安全迁移？" : action === "commit" ? "确认提交已校验的迁移备份？" : "取消此次迁移？", description: `目标云空间：${syncView.migration?.space || syncView.head?.licenseId || "当前授权空间"}。涉及全部班级和学期。${action === "prepare" ? "先冻结此空间的旧上传，再固定云端备份；本机修改仍保留。须下载并保留校验备份后，才能明确提交。" : action === "commit" ? "请确认已将下载的校验备份保存在可靠位置。将以这份固定备份建立安全同步版本，不重新读取旧云端。本机数据保持保存，之后需确认采用哪一版本。" : "释放旧手动上传冻结，保留已下载备份；自动模式保持关闭。"}`, confirmLabel: action === "prepare" ? "确认冻结并准备备份" : action === "commit" ? "已保留备份，确认迁移" : "确认取消迁移", variant: "danger" });
        if (confirmed) { setMessage((await engine.migrate(action, true, syncView.migration?.space || syncView.head?.licenseId)).message); if (action !== "commit") setBackupVerified(false); }
        return;
      }
      if (action === "migration-backup") {
        const backup = await engine.migrationBackup(syncView.migration?.space);
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
        const anchor = document.createElement("a"); anchor.href = url; anchor.download = `seat-manager-migration-${backup.operationId}.json`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000); setBackupVerified(true);
        setMessage(`迁移备份哈希已校验：${backup.integrity}。请妥善保存文件后再提交迁移。`); return;
      }
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
    <ModalShell open={open} title="云端备份与恢复" description={`安全快照同步 · ${syncView.automatic ? "自动模式已启用" : syncView.automaticPaused ? "自动模式已暂停" : "自动模式关闭"}`} onClose={() => { if (!busy) onClose(); }} footer={<>
      {!productSync && <Button variant="secondary" disabled={busy} onClick={() => void run("auth")}>授权</Button>}
      <Button variant="secondary" disabled={busy} onClick={() => void run("status")}><RefreshCw className="h-4 w-4"/>状态</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void run("upload")}><UploadCloud className="h-4 w-4"/>上传本机</Button>
      <Button variant="secondary" disabled={busy} onClick={() => void run("restore")}><DownloadCloud className="h-4 w-4"/>恢复云端</Button>
      <Button disabled={busy} onClick={() => void run("sync")}><RefreshCw className="h-4 w-4"/>立即同步</Button>
      {!productSync && <Button variant="ghost" disabled={busy} onClick={() => { clearSyncAuth(); setMessage("同步授权已清除。"); }}>清除授权</Button>}
    </>}>
        <div className="space-y-4" data-cloud-sync>
          <p className="text-body-regular text-text-secondary" role="status">{syncView.message}</p>
          {productSync && !syncView.head?.ready && syncView.migration?.freshInitialization && (syncView.migration.freshInitialization.available || syncView.migration.freshInitialization.phase === "checking") && <div className="border-t border-separator-border pt-4 space-y-2">
            <p className="text-body-semibold text-text-primary">合成测试空间初始化</p>
            <p className="text-body-regular text-text-secondary">仅对已获准的新建测试授权开放；会永久拒绝旧盲写，未知旧写不会进入新空间。</p>
            {syncView.migration.freshInitialization.available && <Button variant="secondary" disabled={busy} onClick={() => void run("initialize")}>{syncView.migration.freshInitialization.phase === "checking" ? "继续空初始化" : "初始化全新测试空间"}</Button>}
            {syncView.migration.freshInitialization.phase === "checking" && <Button variant="quiet" disabled={busy} onClick={() => void run("cancel-initialization")}>取消空初始化</Button>}
          </div>}
          {productSync && (!syncView.head?.ready || (syncView.head.migrationReady === false && !syncView.head.initializationReady)) && syncView.migration && <div className="border-t border-separator-border pt-4 space-y-2">
            <p className="text-body-semibold text-text-primary">安全迁移</p>
            <p className="text-body-regular text-text-secondary">{syncView.migration.available ? `空间 ${syncView.migration.space} 已获准迁移。当前阶段：${migrationPhaseLabel[syncView.migration.phase]}。` : "此空间尚无已核对的旧写截断与留存备份，继续使用手动备份与恢复。"}</p>
            <div className="flex flex-wrap gap-2">
              {syncView.migration.available && ["unprepared", "aborted", "freezing"].includes(syncView.migration.phase) && <Button variant="secondary" disabled={busy} onClick={() => void run("prepare")}>{syncView.migration.phase === "freezing" ? "继续准备迁移" : "准备安全迁移"}</Button>}
              {syncView.migration.phase === "prepared" && <>
                <Button variant="secondary" disabled={busy} onClick={() => void run("migration-backup")}>下载并校验迁移备份</Button>
                <Button disabled={busy || !backupVerified} onClick={() => void run("commit")}>确认提交迁移</Button>
              </>}
              {["freezing", "prepared"].includes(syncView.migration.phase) && <Button variant="quiet" disabled={busy} onClick={() => void run("abort")}>取消迁移</Button>}
            </div>
          </div>}
          {syncView.head?.authoritySource === "fresh-test-initialization" && <p className="text-body-regular text-text-secondary">此空间来自已确认的合成测试空初始化，已永久拒绝旧盲写。</p>}
          {productSync && syncView.head?.ready && <div className="border-t border-separator-border pt-4 space-y-2">
            <p className="text-body-semibold text-text-primary">自动同步</p>
            <p className="text-body-regular text-text-secondary">{syncView.automatic ? "正式保存后同步全部班级学期；双端冲突会暂停。" : syncView.releaseEnabled && syncView.head.automaticAvailable ? "默认关闭。先立即同步并核对当前空间的整柜版本，再明确启用。" : "自动模式关闭：云空间迁移与两版兼容发布门禁尚未全部开放。"}</p>
            {syncView.automatic ? <Button variant="secondary" disabled={busy} onClick={() => void run("disable")}>停用自动同步</Button> : syncView.releaseEnabled && syncView.head.automaticAvailable && <Button variant="secondary" disabled={busy || Boolean(syncView.choice)} onClick={() => void run("enable")}>{syncView.automaticPaused ? "恢复自动同步" : "启用自动同步"}</Button>}
            {syncView.automaticPaused && <Button variant="quiet" disabled={busy} onClick={() => void run("disable")}>关闭已暂停的自动模式</Button>}
          </div>}
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
