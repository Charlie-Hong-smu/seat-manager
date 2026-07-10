import { useState } from "react";
import { FileDown, FileUp, X } from "lucide-react";

import {
  exportBackupJson,
  exportSeatsCsv,
  formatBackupTime,
  getLastBackupAt,
  parseBackupFile,
  restoreBackup,
  type BackupImportPreview,
} from "../../state/backupStorage";
import { hasStoredAiScoreMappingAuth, suggestRosterMappingWithAi, type AiRosterMappingSuggestion } from "../../state/aiScoreMappingService";
import { readRowsFromFile } from "../../state/scoreImport";
import { detectRosterMapping, prepareRosterRows, type RosterImportOptions, type RosterImportResult, type RosterMapping } from "../../state/rosterImport";
import type { AppStudent, StudentId } from "../../state/types";
import { Button, FileDropZone } from "../ui";
import { WorkspacePanel as Panel } from "./WorkspacePanel";

export function DataWorkspace({
  students,
  seatOrder,
  onImportRoster,
  onBeforeBackupExport,
  onBackupImported,
}: {
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  onImportRoster: (file: File, options: RosterImportOptions) => Promise<RosterImportResult>;
  onBeforeBackupExport: () => void;
  onBackupImported: () => void;
}) {
  const [replaceExisting, setReplaceExisting] = useState(true);
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

  async function importRoster() {
    if (!rosterFile) {
      setRosterStatus("请先选择名单文件。");
      return;
    }
    setRosterStatus("正在导入名单...");
    try {
      const result = await onImportRoster(rosterFile, { replaceExisting, keepHistory: replaceExisting ? keepHistory : true, mapping: rosterMapping || undefined });
      setRosterFile(null);
      setRosterRows([]);
      setRosterMapping(null);
      setAiRosterMappingSuggestion(null);
      setRosterStatus(`导入成功：${result.studentCount} 名学生、${result.seatCount} 个座位。`);
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
      ai_auth_required: "请输入 AI 授权码后再识别。",
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

  function restore() {
    if (!backupPreview) {
      setBackupStatus("请先选择备份 JSON 文件。");
      return;
    }
    if (!window.confirm("将覆盖当前本机数据，并在恢复前自动导出一份当前备份。是否继续？")) return;
    if (restoreBackup(backupPreview)) {
      setBackupPreview(null);
      setBackupStatus("备份已恢复。");
      onBackupImported();
    } else {
      setBackupStatus("恢复失败，请稍后重试。");
    }
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
            {rosterStatus && <div className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-600">{rosterStatus}</div>}
          </div>
        </Panel>
        </div>

        <div className="surface-enter [animation-delay:60ms]">
        <Panel title="导出" action={<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-600" style={{ fontWeight: 800 }}>导出</span>}>
          <div className="space-y-3">
            <Button variant="secondary" onClick={() => exportSeatsCsv(students, seatOrder)} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 py-3">
              <FileDown className="h-4 w-4" />导出座位表 CSV
            </Button>
            <Button variant="secondary" onClick={exportBackup} className="w-full flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 py-3">
              <FileDown className="h-4 w-4" />导出备份 JSON
            </Button>
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
            {backupPreview && <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-700">{backupPreview.studentCount} 名学生 · {backupPreview.seatCount} 个座位</div>}
            <Button variant="danger" onClick={restore} className="w-full">恢复备份</Button>
            {backupStatus && <p className="text-sm text-amber-600">{backupStatus}</p>}
          </div>
        </Panel>
        </div>
      </div>
      {rosterMappingOpen && rosterMapping && (
        <div className="soft-backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/35 p-5">
          <div className="modal-panel-enter flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
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
                      <select
                        value={rosterMapping[item.key as keyof RosterMapping] as number}
                        onChange={event => updateRosterMapping(mapping => ({ ...mapping, [item.key]: Number(event.target.value) }))}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300"
                      >
                        {!item.required && <option value={-1}>不导入</option>}
                        {item.required && <option value={-1}>请选择</option>}
                        {rosterColumnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
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
    </div>
  );
}

