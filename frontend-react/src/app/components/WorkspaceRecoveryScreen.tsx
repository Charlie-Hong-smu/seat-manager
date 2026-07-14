import { useState } from "react";
import { AlertTriangle, Download, FileUp, RotateCcw } from "lucide-react";

import { parseBackupFile, restoreBackup, type BackupImportPreview } from "../state/backupStorage";
import { resetCorruptWorkspace, type WorkspaceStorageStatus } from "../state/workspaces";
import { Button, ConfirmDialog, FileDropZone } from "./ui";

interface Props {
  storage: Extract<WorkspaceStorageStatus, { status: "corrupt" }>;
  onRecovered: () => void;
}

function downloadRawWorkspace(raw: string): void {
  const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `seat_manager_corrupt_raw_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function WorkspaceRecoveryScreen({ storage, onRecovered }: Props) {
  const [preview, setPreview] = useState<BackupImportPreview | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function readBackup(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setPreview(await parseBackupFile(file));
    } catch {
      setError("这个文件不是可恢复的完整备份。原始本机数据没有被修改。");
    } finally {
      setBusy(false);
    }
  }

  function confirmRestore() {
    if (!preview) return;
    if (!restoreBackup(preview, { skipSafetyBackup: true })) {
      setError("恢复写入失败，请检查浏览器存储空间后重试。");
      return;
    }
    setPreview(null);
    onRecovered();
  }

  function confirmEmptyReset() {
    if (!resetCorruptWorkspace()) {
      setError("无法创建新的空工作区，请检查浏览器存储空间后重试。");
      setConfirmReset(false);
      return;
    }
    setConfirmReset(false);
    onRecovered();
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] px-5 py-10 text-[var(--app-text)]">
      <section className="mx-auto max-w-2xl rounded-[var(--app-radius-lg)] border border-amber-200 bg-white p-6 shadow-[var(--app-shadow-card)] sm:p-8">
        <div className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700"><AlertTriangle className="h-5 w-5" /></span>
          <div>
            <h1 className="text-xl font-bold">检测到本机工作区数据异常</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--app-text-muted)]">系统已停止自动保存，不会覆盖现有原始数据。请先导出原始文件，再选择有效备份恢复；只有明确确认后才会创建空工作区。</p>
          </div>
        </div>

        <div className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">检测详情</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {storage.issues.slice(0, 5).map(issue => <li key={`${issue.path}-${issue.message}`}>{issue.path}：{issue.message}</li>)}
          </ul>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Button variant="secondary" className="w-full" onClick={() => downloadRawWorkspace(storage.raw)}><Download className="h-4 w-4" />导出原始数据</Button>
          <Button variant="danger" className="w-full" onClick={() => setConfirmReset(true)}><RotateCcw className="h-4 w-4" />创建空工作区</Button>
        </div>

        <div className="mt-6 border-t border-[var(--app-border)] pt-6">
          <h2 className="text-sm font-bold">从完整备份恢复</h2>
          <FileDropZone accept=".json" onChange={file => { void readBackup(file); }} className="mt-3 min-h-28 justify-center">
            <FileUp className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-semibold">{busy ? "正在校验…" : "选择或拖入 JSON 备份"}</span>
          </FileDropZone>
          {error && <p role="alert" className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
        </div>
      </section>

      <ConfirmDialog open={Boolean(preview)} title="用这份备份恢复？" description={`已通过结构校验，包含 ${preview?.studentCount || 0} 名学生。恢复后将替换当前异常数据。建议先点击“导出原始数据”留存原文件。`} confirmLabel="确认恢复" variant="primary" onCancel={() => setPreview(null)} onConfirm={confirmRestore} />
      <ConfirmDialog open={confirmReset} title="确定创建空工作区？" description="当前异常数据将被替换且无法在应用内撤销。请先导出原始数据，以便后续人工恢复。" confirmLabel="确认清空并新建" onCancel={() => setConfirmReset(false)} onConfirm={confirmEmptyReset} />
    </main>
  );
}
