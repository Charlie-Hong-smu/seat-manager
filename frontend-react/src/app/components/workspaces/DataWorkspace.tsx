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
import { detectRosterMapping, prepareRosterRows, type RosterImportOptions, type RosterImportResult, type RosterMapping } from "../../state/rosterImport";
import type { AppStudent, SeatLayoutV1, StudentId } from "../../state/types";
import type { HealthIssue } from "../../state/dataInsights";
import { Button, FileDropZone, InlineStatus, SelectMenu, useAppDialog, useModalFocus } from "../ui";
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
  onBeforeBackupExport: () => void;
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
        description: `新名单将成为当前在班名单${keepHistory ? "，同名学生沿用原有档案" : "，且新名单学生不继承原有档案"}。未出现在新名单中的在班学生会移入本页的归档区，可随时恢复，不会被删除。确认后会先自动导出一份完整备份文件，再执行覆盖。`,
        confirmLabel: "导出备份并覆盖",
        variant: "danger",
      });
      if (!confirmed) return;
      onBeforeBackupExport();
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
    } catch {
      setRosterStatus("名单导入失败：请使用 .xlsx / .xls / .xlsm / .csv / .tsv，并确认表内有姓名列。");
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
    onBeforeBackupExport();
    setLastBackupAt(exportBackupJson());
    setBackupStatus("备份 JSON 已导出。");
  }

  async function restore() {
    if (!backupPreview) {
      setBackupStatus("请先选择备份 JSON 文件。");
      return;
    }
    if (!await appDialog.confirm({ title: "导入并覆盖当前数据？", description: "导入内容将覆盖当前本机工作区。系统会先自动导出一份当前备份，确认后再执行恢复。", confirmLabel: "确认导入恢复", variant: "danger" })) return;
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
    <div className="flex h-full flex-col bg-gray-50">
      <div className="grid gap-4 overflow-y-auto p-4 lg:grid-cols-3">
        <div className="surface-enter lg:col-span-3"><Panel title="数据健康检查" action={<span className={`rounded-full px-2.5 py-1 text-xs font-bold ${healthIssues.some(i => i.severity === "critical") ? "bg-red-50 text-red-600" : healthIssues.length ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>{healthIssues.length ? `${healthIssues.length} 项问题` : "状态正常"}</span>}><div className="grid gap-2 sm:grid-cols-2">{healthIssues.map(issue => <div key={issue.id} className={`rounded-xl border p-3 ${issue.severity === "critical" ? "border-red-100 bg-red-50" : "border-amber-100 bg-amber-50"}`}><div className="text-sm font-bold text-gray-800">{issue.title}</div><div className="mt-1 text-xs text-gray-500">{issue.detail}</div></div>)}{!healthIssues.length && <p className="text-sm text-gray-500">未发现重复学号、孤立座位、宿舍重复归属或无效学生引用。</p>}</div></Panel></div>
        <div className="surface-enter lg:col-span-3"><Panel title="归档学生" action={<span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">{archivedStudents?.length || 0} 人</span>}>
          {archivedStudents?.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{archivedStudents.map(student => <div key={student.id} className="flex items-center gap-3 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-gray-100 text-sm font-bold text-gray-600">{student.name.slice(0,1)}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-gray-800">{student.name}</div><div className="text-xs text-gray-400">{student.archivedAt ? `移出于 ${student.archivedAt.slice(0,10)}` : "已移出当前班级"}</div></div><Button size="sm" variant="secondary" onClick={() => onRestoreStudent?.(student.id)}><ArchiveRestore className="h-4 w-4"/>恢复</Button><Button size="sm" variant="danger" onClick={() => void permanentlyDelete(student)} aria-label={`彻底删除 ${student.name}`}><Trash2 className="h-4 w-4"/></Button></div>)}</div> : <p className="text-sm text-[var(--app-text-muted)]">暂无归档学生。学生从班级移出后会保留在这里，可恢复或用于误导入时彻底删除。</p>}
        </Panel></div>
        <div className="surface-enter">
        <Panel title="导入名单" action={<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600" style={{ fontWeight: 800 }}>导入</span>}>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={replaceExisting} onChange={event => setReplaceExisting(event.target.checked)} className="accent-blue-600" />覆盖现有名单</label>
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={keepHistory} disabled={!replaceExisting} onChange={event => setKeepHistory(event.target.checked)} className="accent-blue-600 disabled:opacity-40" />覆盖时保留历史数据</label>
            <FileDropZone accept=".xlsx,.xls,.xlsm,.csv,.tsv" onChange={file => { void readRosterFile(file); }} className="min-h-32 justify-center">
              <FileUp className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">{rosterFile ? rosterFile.name : "拖拽文件或点击选择 .xlsx / .csv"}</span>
            </FileDropZone>
            {rosterRows.length > 0 && rosterMapping && (
              <button
                type="button"
                onClick={() => setRosterMappingOpen(true)}
                className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-100"
                style={{ fontWeight: 900 }}
              >
                <span>映射设置</span>
                <span className="text-xs text-gray-400">{rosterMapping.nameCol >= 0 ? "已识别姓名列" : "需选择姓名列"}</span>
              </button>
            )}
            <Button onClick={importRoster} className="w-full">导入名单</Button>
            {rosterStatus && <InlineStatus message={rosterStatus} className="text-sm" />}
          </div>
        </Panel>
        </div>

        <div className="surface-enter [animation-delay:60ms]">
        <Panel title="导出" action={<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-600" style={{ fontWeight: 800 }}>导出</span>}>
          <div className="space-y-3">
            <Button variant="secondary" onClick={() => exportSeatsCsv(students, seatOrder, seatLayout)} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 py-3">
              <FileDown className="h-4 w-4" />导出座位表 CSV
            </Button>
            <Button variant="secondary" onClick={exportBackup} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 py-3">
              <FileDown className="h-4 w-4" />备份全部班级与学期
            </Button>
            <Button variant="ghost" onClick={() => { onBeforeBackupExport(); exportCurrentClassBackupJson(); }} className="w-full flex items-center justify-center gap-2"><FileDown className="h-4 w-4" />仅导出当前班级</Button>
            {lastBackupAt && <p className="text-sm text-gray-400">上次备份：{formatBackupTime(lastBackupAt)}</p>}
          </div>
        </Panel>
        </div>

        <div className="surface-enter [animation-delay:120ms]">
        <Panel title="恢复备份" action={<span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-600" style={{ fontWeight: 800 }}>恢复</span>}>
          <div className="space-y-3">
            <FileDropZone accept=".json" onChange={file => { if (file) void readBackup(file); }} className="min-h-32 justify-center">
              <FileUp className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">{backupPreview ? "已选择备份文件" : "拖拽或选择 JSON 备份文件"}</span>
            </FileDropZone>
            {backupPreview && <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">{backupPreview.workspaceBook ? `${backupPreview.workspaceBook.slices.length} 个班级学期 · ` : ""}{backupPreview.studentCount} 名学生 · {backupPreview.seatCount} 个座位</div>}
            <Button variant="danger" onClick={restore} className="w-full">恢复备份</Button>
            {backupStatus && <InlineStatus message={backupStatus} className="text-sm" />}
          </div>
        </Panel>
        </div>
      </div>
      {rosterMappingOpen && rosterMapping && (
        <div className="soft-backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/35 p-5">
          <div ref={rosterMappingRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="名单列映射" className="modal-panel-enter flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg text-gray-900" style={{ fontWeight: 900 }}>名单列映射</h3>
                <p className="mt-1 text-sm text-gray-500">确认姓名、学号、性别和座位行列后再导入。</p>
              </div>
              <button
                type="button"
                onClick={() => setRosterMappingOpen(false)}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem] overflow-hidden">
              <div className="min-h-0 border-r border-gray-100 bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>表格预览</div>
                    <div className="mt-0.5 text-xs text-gray-400">{rosterFile?.name || "名单"} · 共 {Math.max(rosterRows.length - (rosterMapping.hasHeader ? 1 : 0), 0)} 行</div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow-sm">显示前 10 行</span>
                </div>
                <div className="max-h-[56vh] overflow-auto rounded-2xl border border-gray-200 bg-white">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
                    <thead className="sticky top-0 bg-gray-100 text-gray-500">
                      <tr>
                        {rosterHeaders.map((header, index) => (
                          <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-gray-200 px-3 py-2 font-semibold">
                            {index + 1}. {header || "空列"}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rosterPreviewRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="odd:bg-white even:bg-gray-50/70">
                          {rosterHeaders.map((_, colIndex) => (
                            <td key={colIndex} className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-600">
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
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm text-violet-900" style={{ fontWeight: 900 }}>AI 映射</div>
                        <div className="mt-0.5 text-xs leading-5 text-violet-600">让 AI 先判断列，再由你确认。</div>
                      </div>
                      <button
                        type="button"
                        disabled={aiRosterMappingBusy}
                        onClick={() => void generateAiRosterMapping()}
                        className="rounded-xl bg-violet-600 px-3 py-2 text-xs text-white hover:bg-violet-700 disabled:opacity-60"
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
                          className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm outline-none focus:border-violet-300"
                          placeholder="输入 AI 授权码"
                        />
                        <label className="flex items-center gap-2 text-xs text-violet-700">
                          <input type="checkbox" checked={aiRosterMappingRemember} onChange={event => setAiRosterMappingRemember(event.target.checked)} />
                          记住授权码
                        </label>
                      </div>
                    )}
                    {aiRosterMappingSuggestion && (
                      <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-violet-700">
                        {aiRosterMappingSuggestion.note}
                      </div>
                    )}
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-2 text-sm text-gray-600">
                    <span style={{ fontWeight: 800 }}>首行是表头</span>
                    <input
                      type="checkbox"
                      checked={rosterMapping.hasHeader}
                      onChange={event => updateRosterMapping(mapping => ({ ...mapping, hasHeader: event.target.checked }))}
                      className="h-4 w-4 accent-blue-600"
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
                      <label className="block text-xs text-gray-500">{item.label}</label>
                      <SelectMenu value={rosterMapping[item.key as keyof RosterMapping] as number} onChange={value => updateRosterMapping(mapping => ({ ...mapping, [item.key]: Number(value) }))} ariaLabel={item.label} className="w-full" options={[{ value: -1, label: item.required ? "请选择" : "不导入" }, ...rosterColumnOptions]} />
                    </div>
                  ))}

                  {rosterMapping.warnings.length > 0 && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                      {rosterMapping.warnings.join(" ")}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setRosterMappingOpen(false)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                style={{ fontWeight: 800 }}
              >
                完成
              </button>
            </div>
          </div>
        </div>
      )}
      {appDialog.dialog}
    </div>
  );
}
