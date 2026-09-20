import { useEffect, useState } from "react";
import { ArchiveRestore, FileDown, FileUp, Trash2, X } from "lucide-react";

import {
  exportBackupJson,
  exportCurrentClassBackupJson,
  exportPreImportBackup,
  exportSeatsCsv,
  formatBackupTime,
  getLastBackupAt,
  parseBackupFile,
  restoreBackup,
  type BackupImportPreview,
} from "../../state/backupStorage";
import { hasStoredAiScoreMappingAuth, suggestRosterMappingWithAi, type AiRosterMappingSuggestion } from "../../state/aiScoreMappingService";
import { prefetchXlsxAsset, readRowsFromFile } from "../../state/scoreImport";
import { detectRosterMapping, parseRosterRows, prepareRosterRows, type RosterImportOptions, type RosterImportResult, type RosterMapping } from "../../state/rosterImport";
import type { AppStudent, SeatLayoutV1, StudentId } from "../../state/types";
import type { HealthIssue } from "../../state/dataInsights";
import { Button, DialogPresence, FileDropZone, InlineStatus, SelectMenu, useAppDialog, useModalFocus } from "../ui";
import { WorkspacePanel as Panel } from "./WorkspacePanel";

export function DataWorkspace({
  students,
  archivedStudents,
  seatOrder,
  seatLayout,
  onImportRoster,
  onBeforeBackupExport,
  onBackupImported,
  healthIssues = [],
  onRestoreStudent,
  onPermanentlyDeleteStudent,
}: {
  students: AppStudent[];
  archivedStudents?: AppStudent[];
  seatOrder: Array<StudentId | null>;
  seatLayout?: SeatLayoutV1;
  onImportRoster: (file: File, options: RosterImportOptions) => Promise<RosterImportResult>;
  onBeforeBackupExport: () => boolean;
  onBackupImported: () => void;
  healthIssues?: HealthIssue[];
  onRestoreStudent?: (studentId: StudentId) => void;
  onPermanentlyDeleteStudent?: (studentId: StudentId) => void;
}) {
  const appDialog = useAppDialog();
  useEffect(() => prefetchXlsxAsset(), []);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [keepHistory, setKeepHistory] = useState(true);
  const [rosterFile, setRosterFile] = useState<File | null>(null);
  const [rosterRows, setRosterRows] = useState<string[][]>([]);
  const [rosterMapping, setRosterMapping] = useState<RosterMapping | null>(null);
  const [rosterMappingOpen, setRosterMappingOpen] = useState(false);
  const [aiRosterMappingBusy, setAiRosterMappingBusy] = useState(false);
  const [aiRosterMappingSuggestion, setAiRosterMappingSuggestion] = useState<AiRosterMappingSuggestion | null>(null);
  const [aiRosterMappingAccessCode, setAiRosterMappingAccessCode] = useState("");
  const [aiRosterMappingRemember, setAiRosterMappingRemember] = useState(true);
  const [hasAiRosterMappingAuth, setHasAiRosterMappingAuth] = useState(() => hasStoredAiScoreMappingAuth());
  const [rosterStatus, setRosterStatus] = useState("");
  const [backupPreview, setBackupPreview] = useState<BackupImportPreview | null>(null);
  const [backupStatus, setBackupStatus] = useState("");
  const [lastBackupAt, setLastBackupAt] = useState(() => getLastBackupAt());
  const rosterMappingRef = useModalFocus(rosterMappingOpen, () => setRosterMappingOpen(false));

  async function importRoster() {
    if (!rosterFile) {
      setRosterStatus("请先选择名单文件。");
      return;
    }
    if (replaceExisting) {
      const confirmed = await appDialog.confirm({
        title: "覆盖现有名单？",
        description: `新名单将成为当前在班名单${keepHistory ? "，按唯一学号或唯一姓名沿用原有档案" : "，且新名单学生不继承原有档案"}。未出现在新名单中的在班学生会移入本页的归档区，可随时恢复，不会被删除。确认后会先自动导出一份完整备份文件，再执行覆盖。`,
        confirmLabel: "导出备份并覆盖",
        variant: "danger",
      });
      if (!confirmed) return;
      if (!onBeforeBackupExport()) { setRosterStatus("本机保存失败，已停止导入，请先处理保存问题。"); return; }
      exportPreImportBackup();
    }
    setRosterStatus("正在导入名单...");
    try {
      const result = await onImportRoster(rosterFile, { replaceExisting, keepHistory: replaceExisting ? keepHistory : true, mapping: rosterMapping || undefined });
      setRosterFile(null);
      setRosterRows([]);
      setRosterMapping(null);
      setAiRosterMappingSuggestion(null);
      if (result.mode === "replace") {
        const parts = [`当前在班 ${result.studentCount} 名学生`];
        if (result.matchedCount) parts.push(`${result.matchedCount} 名沿用原档案`);
        if (result.archivedCount) parts.push(`${result.archivedCount} 名未出现的学生已移入归档`);
        setRosterStatus(`名单已覆盖：${parts.join("，")}。`);
      } else {
        const parts: string[] = [];
        if (result.newCount) parts.push(`新增 ${result.newCount} 名`);
        if (result.matchedCount) parts.push(`从归档恢复 ${result.matchedCount} 名`);
        if (result.skippedCount) parts.push(`跳过 ${result.skippedCount} 名已在名单中`);
        setRosterStatus(`导入完成：${parts.length ? `${parts.join("，")}，` : ""}当前在班 ${result.studentCount} 名学生。`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setRosterStatus(message === "save_failed" ? "本机保存失败，名单未导入。请检查存储状态。" : /[\u4e00-\u9fff]/.test(message) ? message : "名单导入失败：请确认文件格式及姓名列。");
    }
  }

  async function readRosterFile(file?: File | null) {
    if (!file) {
      setRosterFile(null);
      setRosterRows([]);
      setRosterMapping(null);
      setAiRosterMappingSuggestion(null);
      return;
    }
    setRosterFile(file);
    setRosterStatus("正在解析名单...");
    setAiRosterMappingSuggestion(null);
    try {
      const rows = prepareRosterRows(await readRowsFromFile(file));
      const mapping = detectRosterMapping(rows);
      setRosterRows(rows);
      setRosterMapping(mapping);
      const placementWarnings = parseRosterRows(rows, mapping).warnings || [];
      mapping.warnings.push(...placementWarnings);
      setRosterStatus(mapping.warnings.length ? `${mapping.warnings.join(" ")} 可打开映射设置调整。` : `已读取 ${Math.max(rows.length - (mapping.hasHeader ? 1 : 0), 0)} 行名单，可直接导入或调整映射。`);
    } catch {
      setRosterRows([]);
      setRosterMapping(null);
      setRosterStatus("名单解析失败：请使用 .xlsx / .xls / .xlsm / .csv / .tsv。");
    }
  }

  function updateRosterMapping(updater: (mapping: RosterMapping) => RosterMapping) {
    if (!rosterMapping && rosterRows.length) {
      setRosterMapping(updater(detectRosterMapping(rosterRows)));
      return;
    }
    if (rosterMapping) {
      setRosterMapping(updater(rosterMapping));
    }
  }

  function getAiRosterMappingErrorMessage(reason: string): string {
    return {
      ai_auth_required: "产品授权已失效，请退出后重新登录。",
      ai_unauthorized: "当前授权未开通 AI 或 AI 已到期。",
      ai_auth_failed: "AI 授权暂时不可用，请稍后重试。",
      ai_file_protocol: "当前是本地文件打开方式，请通过网页地址打开后再使用 AI。",
      ai_offline: "当前离线，联网后可使用 AI 映射。",
      ai_rate_limited: "今日 AI 调用较多，请稍后再试。",
      ai_mapping_empty: "名单表没有可识别的表头。",
      ai_mapping_failed: "AI 暂未能识别出姓名列。",
    }[reason] || "AI 名单映射暂时不可用，请稍后重试。";
  }

  async function generateAiRosterMapping() {
    if (!rosterRows.length) {
      setRosterStatus("请先上传名单。");
      return;
    }
    setAiRosterMappingBusy(true);
    setRosterStatus("AI 正在识别名单列...");
    try {
      const suggestion = await suggestRosterMappingWithAi(rosterRows, {
        accessCode: aiRosterMappingAccessCode,
        remember: aiRosterMappingRemember,
      });
      setAiRosterMappingSuggestion(suggestion);
      setRosterMapping(suggestion.mapping);
      setRosterMappingOpen(true);
      setAiRosterMappingAccessCode("");
      setHasAiRosterMappingAuth(true);
      setRosterStatus(suggestion.note);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setRosterStatus(getAiRosterMappingErrorMessage(reason));
      setHasAiRosterMappingAuth(hasStoredAiScoreMappingAuth());
    } finally {
      setAiRosterMappingBusy(false);
    }
  }

  async function readBackup(file?: File) {
    if (!file) return;
    try {
      const preview = await parseBackupFile(file);
      setBackupPreview(preview);
      setBackupStatus(`已识别 ${preview.studentCount} 名学生、${preview.seatCount} 个座位。`);
    } catch {
      setBackupPreview(null);
      setBackupStatus("备份文件格式不正确。");
    }
  }

  function exportBackup() {
    if (!onBeforeBackupExport()) { setBackupStatus("本机保存失败，已停止导出，请先处理保存问题。"); return; }
    setLastBackupAt(exportBackupJson());
    setBackupStatus("备份 JSON 已导出。");
  }

  async function restore() {
    if (!backupPreview) {
      setBackupStatus("请先选择备份 JSON 文件。");
      return;
    }
    if (!await appDialog.confirm({ title: "导入并覆盖当前数据？", description: "导入内容将覆盖当前本机工作区。系统会先自动导出一份当前备份，确认后再执行恢复。", confirmLabel: "确认导入恢复", variant: "danger" })) return;
    if (!onBeforeBackupExport()) { setBackupStatus("本机保存失败，已停止恢复，请先处理保存问题。"); return; }
    if (restoreBackup(backupPreview)) {
      setBackupPreview(null);
      setBackupStatus("备份已恢复。");
      onBackupImported();
    } else {
      setBackupStatus("恢复失败，请稍后重试。");
    }
  }

  async function permanentlyDelete(student: AppStudent) {
    if (!onPermanentlyDeleteStudent) return;
    const confirmed = await appDialog.confirm({ title: `彻底删除“${student.name}”？`, description: "仅在误导入数据时使用。该学生的档案、出勤、任务、沟通稿、作业状态、成绩行和题目行会被删除，并从座位、宿舍、抽签、约束与班费关联中解除。共享财务和宿舍事件本身会保留。此操作无法恢复。", confirmLabel: "彻底删除", variant: "danger" });
    if (confirmed) onPermanentlyDeleteStudent(student.id);
  }

  const rosterHeaders = rosterRows[0] || [];
  const rosterColumnOptions = rosterHeaders.map((header, index) => ({
    value: index,
    label: `${index + 1}. ${header || "空列"}`,
  }));
  const rosterPreviewRows = rosterRows.slice(rosterMapping?.hasHeader === false ? 0 : 1, (rosterMapping?.hasHeader === false ? 0 : 1) + 10);

  return (
    <div className="flex h-full flex-col bg-background-primary-default">
      <div className="grid gap-4 overflow-y-auto p-4 lg:grid-cols-3">
        <div className="surface-enter lg:col-span-3"><Panel title="数据健康检查" action={<span className={`rounded-full px-2.5 py-1 text-caption-1-semibold ${healthIssues.some(i => i.severity === "critical") ? "bg-status-danger-50 text-status-danger-600" : healthIssues.length ? "bg-status-warning-50 text-status-warning-600" : "bg-status-success-50 text-status-success-600"}`}>{healthIssues.length ? `${healthIssues.length} 项问题` : "状态正常"}</span>}><div className="grid gap-2 sm:grid-cols-2">{healthIssues.map(issue => <div key={issue.id} className={`rounded-xl border p-3 ${issue.severity === "critical" ? "border-status-danger-100 bg-status-danger-50" : "border-status-warning-100 bg-status-warning-50"}`}><div className="text-body-semibold text-text-primary">{issue.title}</div><div className="mt-1 text-caption-1-regular text-text-secondary">{issue.detail}</div></div>)}{!healthIssues.length && <p className="text-body-regular text-text-secondary">未发现重复学号、孤立座位、宿舍重复归属或无效学生引用。</p>}</div></Panel></div>
        <div className="surface-enter lg:col-span-3"><Panel title="归档学生" action={<span className="rounded-full bg-background-tertiary-default px-2.5 py-1 text-caption-1-semibold text-text-secondary">{archivedStudents?.length || 0} 人</span>}>
          {archivedStudents?.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{archivedStudents.map(student => <div key={student.id} className="flex items-center gap-3 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-background-primary-default p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-background-tertiary-default text-body-semibold text-text-secondary">{student.name.slice(0,1)}</div><div className="min-w-0 flex-1"><div className="truncate text-body-semibold text-text-primary">{student.name}</div><div className="text-caption-1-regular text-text-tertiary">{student.archivedAt ? `移出于 ${student.archivedAt.slice(0,10)}` : "已移出当前班级"}</div></div><Button size="sm" variant="secondary" onClick={() => onRestoreStudent?.(student.id)}><ArchiveRestore className="h-4 w-4"/>恢复</Button><Button size="sm" variant="danger" onClick={() => void permanentlyDelete(student)} aria-label={`彻底删除 ${student.name}`}><Trash2 className="h-4 w-4"/></Button></div>)}</div> : <p className="text-body-regular text-[var(--app-text-muted)]">暂无归档学生。学生从班级移出后会保留在这里，可恢复或用于误导入时彻底删除。</p>}
        </Panel></div>
        <div className="surface-enter">
        <Panel title="导入名单" action={<span className="rounded-full bg-accent-50 px-2.5 py-1 text-caption-1-regular text-accent-600" style={{ fontWeight: 800 }}>导入</span>}>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-body-regular text-text-secondary"><input type="checkbox" checked={replaceExisting} onChange={event => setReplaceExisting(event.target.checked)} className="accent-accent-600" />覆盖现有名单</label>
            <label className="flex items-center gap-2 text-body-regular text-text-secondary"><input type="checkbox" checked={keepHistory} disabled={!replaceExisting} onChange={event => setKeepHistory(event.target.checked)} className="accent-accent-600 disabled:opacity-40" />覆盖时保留历史数据</label>
            <FileDropZone accept=".xlsx,.xls,.xlsm,.csv,.tsv" onChange={file => { void readRosterFile(file); }} className="min-h-32 justify-center">
              <FileUp className="h-4 w-4 text-text-tertiary" />
              <span className="text-body-regular text-text-secondary">{rosterFile ? rosterFile.name : "拖拽文件或点击选择 .xlsx / .csv"}</span>
            </FileDropZone>
            {rosterRows.length > 0 && rosterMapping && (
              <button
                type="button"
                onClick={() => setRosterMappingOpen(true)}
                className="flex w-full items-center justify-between rounded-2xl border border-border-button-default bg-background-secondary-default px-4 py-3 text-left text-body-regular text-text-primary hover:bg-background-tertiary-default"
                style={{ fontWeight: 900 }}
              >
                <span>映射设置</span>
                <span className="text-caption-1-regular text-text-tertiary">{rosterMapping.nameCol >= 0 ? "已识别姓名列" : "需选择姓名列"}</span>
              </button>
            )}
            <Button onClick={importRoster} className="w-full">导入名单</Button>
            {rosterStatus && <InlineStatus message={rosterStatus} className="text-body-regular" />}
          </div>
        </Panel>
        </div>

        <div className="surface-enter [animation-delay:60ms]">
        <Panel title="导出" action={<span className="rounded-full bg-status-success-50 px-2.5 py-1 text-caption-1-regular text-status-success-600" style={{ fontWeight: 800 }}>导出</span>}>
          <div className="space-y-3">
            <Button variant="secondary" onClick={() => exportSeatsCsv(students, seatOrder, seatLayout)} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border-button-default bg-background-secondary-default py-3">
              <FileDown className="h-4 w-4" />导出座位表 CSV
            </Button>
            <Button variant="secondary" onClick={exportBackup} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-border-button-default bg-background-secondary-default py-3">
              <FileDown className="h-4 w-4" />备份全部班级与学期
            </Button>
            <Button variant="ghost" onClick={() => { if (onBeforeBackupExport()) exportCurrentClassBackupJson(); else setBackupStatus("本机保存失败，已停止导出。"); }} className="w-full flex items-center justify-center gap-2"><FileDown className="h-4 w-4" />仅导出当前班级</Button>
            {lastBackupAt && <p className="text-body-regular text-text-tertiary">上次备份：{formatBackupTime(lastBackupAt)}</p>}
          </div>
        </Panel>
        </div>

        <div className="surface-enter [animation-delay:120ms]">
        <Panel title="恢复备份" action={<span className="rounded-full bg-status-warning-50 px-2.5 py-1 text-caption-1-regular text-status-warning-600" style={{ fontWeight: 800 }}>恢复</span>}>
          <div className="space-y-3">
            <FileDropZone accept=".json" onChange={file => { if (file) void readBackup(file); }} className="min-h-32 justify-center">
              <FileUp className="h-4 w-4 text-text-tertiary" />
              <span className="text-body-regular text-text-secondary">{backupPreview ? "已选择备份文件" : "拖拽或选择 JSON 备份文件"}</span>
            </FileDropZone>
            {backupPreview && <div className="rounded-xl border border-status-warning-100 bg-status-warning-50 px-3 py-2 text-body-regular text-status-warning-700">{backupPreview.workspaceBook ? `${backupPreview.workspaceBook.slices.length} 个班级学期 · ` : ""}{backupPreview.studentCount} 名学生 · {backupPreview.seatCount} 个座位</div>}
            <Button variant="danger" onClick={restore} className="w-full">恢复备份</Button>
            {backupStatus && <InlineStatus message={backupStatus} className="text-body-regular" />}
          </div>
        </Panel>
        </div>
      </div>
      <DialogPresence open={rosterMappingOpen && Boolean(rosterMapping)}>
      {rosterMappingOpen && rosterMapping && (
        <div className="soft-backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-text-primary/35 p-5">
          <div ref={rosterMappingRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="名单列映射" className="modal-panel-enter flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-background-primary-default shadow-2xl outline-none">
            <div className="flex items-start justify-between gap-4 border-b border-separator-border px-5 py-4">
              <div>
                <h3 className="text-title-3-regular text-text-primary" style={{ fontWeight: 900 }}>名单列映射</h3>
                <p className="mt-1 text-body-regular text-text-secondary">确认姓名、学号、性别和座位行列后再导入。</p>
              </div>
              <button
                type="button"
                onClick={() => setRosterMappingOpen(false)}
                className="rounded-xl p-2 text-text-tertiary hover:bg-background-tertiary-default hover:text-text-primary"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem] overflow-hidden">
              <div className="min-h-0 border-r border-separator-border bg-background-secondary-default p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-body-regular text-text-primary" style={{ fontWeight: 900 }}>表格预览</div>
                    <div className="mt-0.5 text-caption-1-regular text-text-tertiary">{rosterFile?.name || "名单"} · 共 {Math.max(rosterRows.length - (rosterMapping.hasHeader ? 1 : 0), 0)} 行</div>
                  </div>
                  <span className="rounded-full bg-background-primary-default px-3 py-1 text-caption-1-regular text-text-secondary shadow-sm">显示前 10 行</span>
                </div>
                <div className="max-h-[56vh] overflow-auto rounded-2xl border border-border-button-default bg-background-primary-default">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-caption-1-regular">
                    <thead className="sticky top-0 bg-background-tertiary-default text-text-secondary">
                      <tr>
                        {rosterHeaders.map((header, index) => (
                          <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-border-button-default px-3 py-2 font-semibold">
                            {index + 1}. {header || "空列"}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rosterPreviewRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="odd:bg-background-primary-default even:bg-background-secondary-default/70">
                          {rosterHeaders.map((_, colIndex) => (
                            <td key={colIndex} className="whitespace-nowrap border-b border-separator-border px-3 py-2 text-text-secondary">
                              {row[colIndex] || ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto p-4">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-status-ai-100 bg-status-ai-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-body-regular text-status-ai-900" style={{ fontWeight: 900 }}>AI 映射</div>
                        <div className="mt-0.5 text-caption-1-regular leading-5 text-status-ai-600">让 AI 先判断列，再由你确认。</div>
                      </div>
                      <button
                        type="button"
                        disabled={aiRosterMappingBusy}
                        onClick={() => void generateAiRosterMapping()}
                        className="rounded-xl bg-status-ai-600 px-3 py-2 text-caption-1-regular text-text-white hover:bg-status-ai-700 disabled:opacity-60"
                        style={{ fontWeight: 900 }}
                      >
                        {aiRosterMappingBusy ? "识别中" : "AI 识别"}
                      </button>
                    </div>
                    {!hasAiRosterMappingAuth && (
                      <div className="mt-3 space-y-2">
                        <input
                          value={aiRosterMappingAccessCode}
                          onChange={event => setAiRosterMappingAccessCode(event.target.value)}
                          className="w-full rounded-xl border border-status-ai-100 bg-background-primary-default px-3 py-2 text-body-regular outline-none focus:border-status-ai-300"
                          placeholder="输入 AI 授权码"
                        />
                        <label className="flex items-center gap-2 text-caption-1-regular text-status-ai-700">
                          <input type="checkbox" checked={aiRosterMappingRemember} onChange={event => setAiRosterMappingRemember(event.target.checked)} />
                          记住授权码
                        </label>
                      </div>
                    )}
                    {aiRosterMappingSuggestion && (
                      <div className="mt-3 rounded-xl bg-background-primary-default px-3 py-2 text-caption-1-regular leading-5 text-status-ai-700">
                        {aiRosterMappingSuggestion.note}
                      </div>
                    )}
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-separator-border bg-background-secondary-default px-3 py-2 text-body-regular text-text-secondary">
                    <span style={{ fontWeight: 800 }}>首行是表头</span>
                    <input
                      type="checkbox"
                      checked={rosterMapping.hasHeader}
                      onChange={event => updateRosterMapping(mapping => ({ ...mapping, hasHeader: event.target.checked }))}
                      className="h-4 w-4 accent-accent-600"
                    />
                  </label>

                  {[
                    { key: "nameCol", label: "姓名列", required: true },
                    { key: "studentNoCol", label: "学号列", required: false },
                    { key: "genderCol", label: "性别列", required: false },
                    { key: "rowCol", label: "座位行", required: false },
                    { key: "colCol", label: "座位列", required: false },
                  ].map(item => (
                    <div key={item.key} className="space-y-2">
                      <label className="block text-caption-1-regular text-text-secondary">{item.label}</label>
                      <SelectMenu value={rosterMapping[item.key as keyof RosterMapping] as number} onChange={value => updateRosterMapping(mapping => ({ ...mapping, [item.key]: Number(value) }))} ariaLabel={item.label} className="w-full" options={[{ value: -1, label: item.required ? "请选择" : "不导入" }, ...rosterColumnOptions]} />
                    </div>
                  ))}

                  {rosterMapping.warnings.length > 0 && (
                    <div className="rounded-xl border border-status-warning-100 bg-status-warning-50 px-3 py-2 text-caption-1-regular leading-5 text-status-warning-700">
                      {rosterMapping.warnings.join(" ")}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-separator-border px-5 py-4">
              <button
                type="button"
                onClick={() => setRosterMappingOpen(false)}
                className="rounded-xl border border-border-button-default bg-background-primary-default px-4 py-2 text-body-regular text-text-secondary hover:bg-background-secondary-default"
                style={{ fontWeight: 800 }}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
      </DialogPresence>
      {appDialog.dialog}
    </div>
  );
}
