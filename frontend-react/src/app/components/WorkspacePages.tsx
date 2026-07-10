import { useState } from "react";
import {
  ChevronDown,
  Dices,
  FileDown,
  FileUp,
  LayoutGrid,
  Maximize2,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
  Undo2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import {
  exportBackupJson,
  exportSeatsCsv,
  formatBackupTime,
  getLastBackupAt,
  parseBackupFile,
  restoreBackup,
  type BackupImportPreview,
} from "../state/backupStorage";
import { calcBalance, calcExpenseTotal, calcIncomeTotal, type NewFundTxInput } from "../state/classFundActions";
import { FundTransactionForm } from "./FundTransactionForm";
import { SeatSettingsModal } from "./SeatSettingsModal";
import { AnimatedPopover, Button, FileDropZone, SegmentedControl, ToolDrawer } from "./ui";
import { hasStoredAiScoreMappingAuth, suggestRosterMappingWithAi, suggestScoreMappingWithAi, type AiRosterMappingSuggestion, type AiScoreMappingSuggestion } from "../state/aiScoreMappingService";
import {
  buildScoreImportDraftFromRows,
  createSavedGradeExamRecord,
  detectScoreMapping,
  prepareScoreRows,
  parseRowsWithMapping,
  readRowsFromFile,
  SUBJECT_ORDER,
  type ScoreMapping,
} from "../state/scoreImport";
import { detectRosterMapping, prepareRosterRows, type RosterImportOptions, type RosterImportResult, type RosterMapping } from "../state/rosterImport";
import type { AiClassTrendResult } from "../state/aiTrendService";
import type {
  AppStudent,
  FundTransaction,
  FundTxType,
  Gender,
  GradeExam,
  SavedGradeExamRecord,
  ScoreImportDraft,
  SeatSettings,
  StudentId,
} from "../state/types";
import { ExamTableModal } from "./ExamTableModal";
import { GradesPage } from "./GradesPage";
import { SeatBoard } from "./SeatBoard";
import { WorkspacePanel as Panel } from "./workspaces/WorkspacePanel";

export function DailyWorkspace({
  students,
  seatOrder,
  lockedSeats,
  seatSettings,
  canUndoSeatOrder,
  onRandomizeSeats,
  onOrderSeatsByList,
  onUndoSeatOrder,
  onUpdateSeatSettings,
  onAddStudent,
  onSelectStudent,
  onOpenStudentFollowup,
  onMoveSeat,
  onToggleLock,
}: {
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  lockedSeats: Set<number>;
  seatSettings: SeatSettings;
  canUndoSeatOrder: boolean;
  onRandomizeSeats: () => void;
  onOrderSeatsByList: () => void;
  onUndoSeatOrder: () => void;
  onUpdateSeatSettings: (updater: (current: SeatSettings) => SeatSettings) => void;
  onAddStudent: (name: string, gender: Gender, alias?: string) => void;
  onSelectStudent: (student: AppStudent) => void;
  onOpenStudentFollowup: (student: AppStudent) => void;
  onMoveSeat: (fromIndex: number, toIndex: number) => void;
  onToggleLock: (idx: number) => void;
}) {
  const [showSeatSettings, setShowSeatSettings] = useState(false);
  const [activeTool, setActiveTool] = useState<"student" | "draw" | null>(null);
  const [cardMode, setCardMode] = useState<"compact" | "detail">("compact");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [alias, setAlias] = useState("");
  const [search, setSearch] = useState("");
  const [drawerSearch, setDrawerSearch] = useState("");
  const [drawCount, setDrawCount] = useState(1);
  const [noRepeat, setNoRepeat] = useState(false);
  const [drawResult, setDrawResult] = useState<string[]>([]);
  const [drawHistory, setDrawHistory] = useState<Array<{ id: string; time: string; names: string[] }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const filteredStudents = students.filter(student => !search || student.name.includes(search) || student.aliases.some(item => item.includes(search))).slice(0, 8);
  const drawerStudents = students.filter(student => !drawerSearch || student.name.includes(drawerSearch) || student.aliases.some(item => item.includes(drawerSearch))).slice(0, 8);
  const constraints = seatSettings.constraints;
  const activeConstraintCount = constraints.lockedDeskmatePairs.length
    + constraints.noDeskmatePairs.length
    + constraints.frontRowStudentIds.length
    + seatSettings.complementRuleIds.length
    + (seatSettings.pairByGender ? 1 : 0);

  function addStudent() {
    if (!name.trim()) return;
    onAddStudent(name, gender, alias);
    setName("");
    setGender("");
    setAlias("");
  }

  function draw() {
    const pool = students.map(student => student.name);
    const picked: string[] = [];
    const used = new Set<number>();
    for (let index = 0; index < drawCount && pool.length; index += 1) {
      let pickedIndex = Math.floor(Math.random() * pool.length);
      if (noRepeat) {
        let guard = 0;
        while (used.has(pickedIndex) && guard < pool.length * 2) {
          pickedIndex = Math.floor(Math.random() * pool.length);
          guard += 1;
        }
      }
      used.add(pickedIndex);
      picked.push(pool[pickedIndex]);
    }
    setDrawResult(picked);
    setDrawHistory(current => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), names: picked },
      ...current,
    ].slice(0, 10));
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--app-bg)]">
      <div className="daily-toolbar flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--app-border)] bg-white px-4 py-3">
        <div className="daily-toolbar-primary flex flex-1 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--app-radius-sm)] bg-blue-50 px-2.5 text-xs font-bold text-blue-700">
              <Users className="h-3.5 w-3.5" />{students.length} 人
            </span>
            <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--app-radius-sm)] bg-violet-50 px-2.5 text-xs font-bold text-violet-700">
              <LayoutGrid className="h-3.5 w-3.5" />{seatOrder.length} 座
            </span>
          </div>

          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              className="h-10 w-full rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none transition-[background-color,border-color,box-shadow] duration-200 placeholder:text-gray-400 focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-500/10"
              placeholder="在座位表中查找学生"
            />
            <AnimatedPopover
              open={Boolean(search)}
              className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-1.5 shadow-[var(--app-shadow-float)]"
            >
                {filteredStudents.map(student => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => { setSearch(""); onSelectStudent(student); }}
                    className="flex h-10 w-full items-center justify-between rounded-[var(--app-radius-sm)] px-3 text-left text-sm transition-[background-color,transform] duration-150 hover:translate-x-px hover:bg-blue-50"
                  >
                    <span className="min-w-0 truncate font-semibold text-gray-700">{student.name}</span>
                    <span className="ml-3 shrink-0 text-xs text-gray-400">{student.gender || "未知"}</span>
                  </button>
                ))}
                {filteredStudents.length === 0 && <div className="px-3 py-5 text-center text-sm text-gray-400">无匹配结果</div>}
            </AnimatedPopover>
          </div>
        </div>

        <div className="daily-toolbar-actions ml-auto flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
          <SegmentedControl
            value={cardMode}
            ariaLabel="座位卡显示方式"
            onChange={value => setCardMode(value as "compact" | "detail")}
            options={[
              { value: "compact", label: "简洁", icon: <Minimize2 className="h-3.5 w-3.5" /> },
              { value: "detail", label: "详细", icon: <Maximize2 className="h-3.5 w-3.5" /> },
            ]}
          />
          <Button size="sm" onClick={() => setShowSeatSettings(true)}>
            <Shuffle className="h-4 w-4" />排座
            {activeConstraintCount > 0 && <span className="rounded-full bg-white/20 px-1.5 text-[10px]">{activeConstraintCount}</span>}
          </Button>
          <Button size="sm" variant="ghost" disabled={!canUndoSeatOrder} onClick={onUndoSeatOrder}>
            <Undo2 className="h-4 w-4" />撤销
          </Button>
          <Button id="daily-student-tool-trigger" size="sm" variant={activeTool === "student" ? "secondary" : "ghost"} onClick={() => setActiveTool(activeTool === "student" ? null : "student")}>
            <UserPlus className="h-4 w-4" />新增学生
          </Button>
          <Button id="daily-draw-tool-trigger" size="sm" variant={activeTool === "draw" ? "secondary" : "ghost"} onClick={() => setActiveTool(activeTool === "draw" ? null : "draw")}>
            <Dices className="h-4 w-4" />抽签
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <div className="h-full min-h-0 overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow-card)]">
          <SeatBoard cardMode={cardMode} students={students} seatOrder={seatOrder} onSelectStudent={onSelectStudent} onOpenStudentFollowup={onOpenStudentFollowup} onMoveSeat={onMoveSeat} lockedSeats={lockedSeats} onToggleLock={onToggleLock} />
        </div>
      </div>

      <ToolDrawer open={activeTool === "student"} title="学生工具" returnFocusId="daily-student-tool-trigger" onClose={() => setActiveTool(null)}>
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-bold text-gray-800">新增学生</h3>
            <p className="mt-1 text-xs leading-5 text-gray-400">新学生会自动安排到第一个空座位。</p>
          </div>
          <div className="space-y-3 rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-gray-50 p-3">
            <input value={name} onChange={event => setName(event.target.value)} className="h-10 w-full rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="姓名" />
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <input value={alias} onChange={event => setAlias(event.target.value)} className="h-10 min-w-0 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="别名 / 拼音（可选）" />
              <select value={gender} onChange={event => setGender(event.target.value as Gender)} className="h-10 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-2 text-sm outline-none focus:border-blue-300">
                <option value="">未知</option><option value="男">男</option><option value="女">女</option>
              </select>
            </div>
            <Button className="w-full" disabled={!name.trim()} onClick={addStudent}><Plus className="h-4 w-4" />添加到班级</Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-gray-800">查找已有学生</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={drawerSearch} onChange={event => setDrawerSearch(event.target.value)} className="h-10 w-full rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white" placeholder="姓名或别名" />
            </div>
            {drawerSearch && (
              <div className="mt-2 divide-y divide-gray-50 overflow-hidden rounded-[var(--app-radius-sm)] border border-[var(--app-border)]">
                {drawerStudents.map(student => (
                  <button key={student.id} type="button" onClick={() => onSelectStudent(student)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-blue-50">
                    <span className="font-semibold text-gray-700">{student.name}</span><span className="text-xs text-gray-400">{student.gender || "未知"}</span>
                  </button>
                ))}
                {drawerStudents.length === 0 && <div className="px-3 py-5 text-center text-sm text-gray-400">无匹配结果</div>}
              </div>
            )}
          </div>
        </div>
      </ToolDrawer>

      <ToolDrawer open={activeTool === "draw"} title="课堂抽签" returnFocusId="daily-draw-tool-trigger" onClose={() => setActiveTool(null)}>
        <div className="space-y-4">
          <div className="rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                人数
                <input type="number" min={1} max={Math.max(1, students.length)} value={drawCount} onChange={event => setDrawCount(Number(event.target.value) || 1)} className="h-9 w-16 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-2 text-center outline-none focus:border-blue-300" />
              </label>
              <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={noRepeat} onChange={event => setNoRepeat(event.target.checked)} className="h-4 w-4 accent-blue-600" />去重
              </label>
            </div>
            <Button className="mt-4 w-full" onClick={draw}><Dices className="h-4 w-4" />开始抽签</Button>
          </div>
          {drawResult.length > 0 && (
            <div className="surface-enter rounded-[var(--app-radius-md)] border border-blue-100 bg-blue-50 p-4">
              <div className="mb-2 text-xs font-bold text-blue-500">本次结果</div>
              <div className="flex flex-wrap gap-2">{drawResult.map(resultName => <span key={resultName} className="rounded-full bg-blue-600 px-3 py-1.5 text-sm font-bold text-white">{resultName}</span>)}</div>
            </div>
          )}
          {drawHistory.length > 0 && (
            <div className="overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white">
              <button type="button" onClick={() => setHistoryOpen(value => !value)} className="flex h-11 w-full items-center justify-between px-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
                最近 {drawHistory.length} 次<ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
              </button>
              {historyOpen && <div className="divide-y divide-gray-50 border-t border-[var(--app-border)]">{drawHistory.map(item => (
                <div key={item.id} className="px-3 py-3"><div className="text-xs text-gray-400">{item.time}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{item.names.map(resultName => <span key={`${item.id}-${resultName}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{resultName}</span>)}</div></div>
              ))}</div>}
            </div>
          )}
        </div>
      </ToolDrawer>

      <SeatSettingsModal
        open={showSeatSettings}
        students={students}
        settings={seatSettings}
        canUndo={canUndoSeatOrder}
        onUpdate={onUpdateSeatSettings}
        onRandomize={onRandomizeSeats}
        onOrderByList={onOrderSeatsByList}
        onUndo={onUndoSeatOrder}
        onClose={() => setShowSeatSettings(false)}
      />
    </div>
  );
}

export { DormitoryWorkspace } from "./DormitoryWorkspace";
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

export function ScoresWorkspace({
  exams,
  students,
  onSelectStudent,
  onOpenStudentFollowup,
  onSaveScoreImport,
  onUpdateGradeExam,
  onDeleteGradeExam,
  onGenerateClassAnalysis,
  onGenerateLocalClassAnalysis,
  onGenerateStudentTrendAdvice,
  studentAdviceProgress,
}: {
  exams: GradeExam[];
  students: AppStudent[];
  onSelectStudent: (student: AppStudent) => void;
  onOpenStudentFollowup: (student: AppStudent) => void;
  onSaveScoreImport: (record: SavedGradeExamRecord) => GradeExam | null;
  onUpdateGradeExam: (examId: string, name: string, date: string) => boolean;
  onDeleteGradeExam: (examId: string) => boolean;
  onGenerateClassAnalysis: () => Promise<AiClassTrendResult>;
  onGenerateLocalClassAnalysis: () => string;
  onGenerateStudentTrendAdvice: () => Promise<{ generated: number; failed: number; skipped: number }>;
  studentAdviceProgress: {
    busy: boolean;
    status: string;
    generated: number;
    failed: number;
    skipped: number;
    total: number;
  };
}) {
  const [draft, setDraft] = useState<ScoreImportDraft | null>(null);
  const [scoreRows, setScoreRows] = useState<string[][]>([]);
  const [scoreFilename, setScoreFilename] = useState("");
  const [manualMapping, setManualMapping] = useState<ScoreMapping | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [scoreStatus, setScoreStatus] = useState("");
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));
  const [remappingExamId, setRemappingExamId] = useState("");
  const [aiMappingBusy, setAiMappingBusy] = useState(false);
  const [aiMappingSuggestion, setAiMappingSuggestion] = useState<AiScoreMappingSuggestion | null>(null);
  const [aiMappingAccessCode, setAiMappingAccessCode] = useState("");
  const [aiMappingRemember, setAiMappingRemember] = useState(true);
  const [hasAiMappingAuth, setHasAiMappingAuth] = useState(() => hasStoredAiScoreMappingAuth());
  const [examTable, setExamTable] = useState<GradeExam | null>(null);
  const [editingExamId, setEditingExamId] = useState("");
  const [editExamName, setEditExamName] = useState("");
  const [editExamDate, setEditExamDate] = useState("");
  const [classAnalysis, setClassAnalysis] = useState<AiClassTrendResult | null>(null);
  const [classAnalysisStatus, setClassAnalysisStatus] = useState("");
  const [classAnalysisBusy, setClassAnalysisBusy] = useState(false);
  const [managementOpen, setManagementOpen] = useState(true);

  async function readScoreFile(file?: File) {
    if (!file) return;
    setScoreStatus("正在解析成绩表...");
    setAiMappingSuggestion(null);
    try {
      const rows = prepareScoreRows(await readRowsFromFile(file));
      const mapping = detectScoreMapping(rows);
      setManualMapping(mapping);
      const nextDraft = {
        ...parseRowsWithMapping(rows, mapping),
        filename: file.name,
      };
      setScoreRows(rows);
      setScoreFilename(file.name);
      setDraft(nextDraft);
      if (!remappingExamId) {
        setExamName(file.name.replace(/\.[^.]+$/, "") || "考试");
        setExamDate(new Date().toISOString().slice(0, 10));
      }
      setScoreStatus(`已解析 ${nextDraft.entries.length} 名学生、${nextDraft.subjects.length} 个科目。${nextDraft.warnings.length ? " 可打开映射设置进一步确认。" : ""}`);
    } catch (error) {
      try {
        const rows = prepareScoreRows(await readRowsFromFile(file));
        setManualMapping(detectScoreMapping(rows));
        setScoreRows(rows);
        setScoreFilename(file.name);
        if (!remappingExamId) {
          setExamName(file.name.replace(/\.[^.]+$/, "") || "考试");
          setExamDate(new Date().toISOString().slice(0, 10));
        }
      } catch {
        setScoreRows([]);
        setScoreFilename("");
        setManualMapping(null);
      }
      setDraft(null);
      const reason = error instanceof Error ? error.message : "";
      setScoreStatus({
        mapping_failed: "未能自动识别姓名或科目列，可打开映射设置。",
        xlsx_unavailable: "Excel 解析组件加载失败，请刷新页面后重试；若仍失败，可先另存为 CSV 再导入。",
        empty_file: "成绩表为空，或第一个工作表没有可读取内容。",
        unsupported_file: "暂只支持 .xlsx / .xls / .xlsm / .csv / .tsv。",
      }[reason] || "成绩表解析失败，请检查文件格式。");
    }
  }

  function updateManualMapping(updater: (mapping: ScoreMapping) => ScoreMapping) {
    if (!manualMapping && scoreRows.length) {
      setManualMapping(updater(detectScoreMapping(scoreRows)));
      return;
    }
    if (manualMapping) {
      setManualMapping(updater(manualMapping));
    }
  }

  function applyManualMapping() {
    if (!manualMapping || !scoreRows.length) {
      setScoreStatus("请先上传成绩表并设置映射。");
      return;
    }
    try {
      const nextDraft = buildScoreImportDraftFromRows(scoreRows, scoreFilename, manualMapping);
      setDraft(nextDraft);
      setMappingModalOpen(false);
      setAiMappingSuggestion(null);
      setScoreStatus(`已应用手动映射：${nextDraft.entries.length} 名学生、${nextDraft.subjects.length} 个科目。`);
    } catch {
      setScoreStatus("手动映射无法应用，请至少选择姓名列和一个科目分数列。");
    }
  }

  function getAiMappingErrorMessage(reason: string): string {
    return {
      ai_auth_required: "请输入 AI 授权码后再识别。",
      ai_unauthorized: "当前授权未开通 AI 或 AI 已到期。",
      ai_auth_failed: "AI 授权暂时不可用，请稍后重试。",
      ai_file_protocol: "当前是本地文件打开方式，请通过网页地址打开后再使用 AI。",
      ai_offline: "当前离线，联网后可使用 AI 映射。",
      ai_rate_limited: "今日 AI 调用较多，请稍后再试。",
      ai_mapping_empty: "成绩表没有可识别的表头。",
      ai_mapping_failed: "AI 暂未能识别出姓名和科目列。",
    }[reason] || "AI 映射暂时不可用，请稍后重试。";
  }

  async function generateAiMapping() {
    if (!scoreRows.length) {
      setScoreStatus("请先上传成绩表。");
      return;
    }
    setAiMappingBusy(true);
    setScoreStatus("AI 正在识别成绩表列...");
    try {
      const suggestion = await suggestScoreMappingWithAi(scoreRows, {
        accessCode: aiMappingAccessCode,
        remember: aiMappingRemember,
      });
      setAiMappingSuggestion(suggestion);
      setManualMapping(suggestion.mapping);
      setMappingModalOpen(true);
      setAiMappingAccessCode("");
      setHasAiMappingAuth(true);
      setScoreStatus(suggestion.note);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setScoreStatus(getAiMappingErrorMessage(reason));
      setHasAiMappingAuth(hasStoredAiScoreMappingAuth());
    } finally {
      setAiMappingBusy(false);
    }
  }

  function saveDraft() {
    if (!draft || !examName.trim()) {
      setScoreStatus("请先上传成绩表并填写考试名称。");
      return;
    }
    const saved = onSaveScoreImport(createSavedGradeExamRecord(draft, {
      id: remappingExamId || undefined,
      name: examName,
      date: examDate,
      rows: scoreRows,
      mapping: manualMapping || undefined,
    }));
    setDraft(null);
    setScoreRows([]);
    setScoreFilename("");
    setManualMapping(null);
    setRemappingExamId("");
    setMappingModalOpen(false);
    setAiMappingSuggestion(null);
    setScoreStatus(saved ? `已保存「${saved.name}」。` : "保存失败。");
  }

  function editExam(exam: GradeExam) {
    if (!exam.importSource) {
      setDraft(null);
      setScoreRows([]);
      setScoreFilename("");
      setManualMapping(null);
      setExamName(exam.name);
      setExamDate(exam.date || new Date().toISOString().slice(0, 10));
      setRemappingExamId(exam.id);
      setMappingModalOpen(false);
      setAiMappingSuggestion(null);
      setEditingExamId("");
      setScoreStatus(`「${exam.name}」没有保存原始表格，请重新选择原成绩文件，确认映射后会覆盖原考试。`);
      return;
    }
    const rows = exam.importSource.rows;
    const mapping = {
      ...exam.importSource.mapping,
      headers: rows[0] || exam.importSource.mapping.headers,
      subjectMappings: exam.importSource.mapping.subjectMappings.map(item => ({ ...item })),
      totalMapping: { ...exam.importSource.mapping.totalMapping },
      warnings: [...exam.importSource.mapping.warnings],
    };
    try {
      const nextDraft = buildScoreImportDraftFromRows(rows, exam.importSource.filename || `${exam.name}.csv`, mapping);
      setDraft(nextDraft);
      setScoreRows(rows);
      setScoreFilename(exam.importSource.filename || nextDraft.filename);
      setManualMapping(mapping);
      setExamName(exam.name);
      setExamDate(exam.date || new Date().toISOString().slice(0, 10));
      setRemappingExamId(exam.id);
      setMappingModalOpen(true);
      setAiMappingSuggestion(null);
      setScoreStatus(`正在重新映射「${exam.name}」，应用映射后可覆盖保存。`);
    } catch {
      setScoreStatus("这场考试的原始表格无法重新映射，只能编辑考试名称和日期。");
      setEditingExamId(exam.id);
      setEditExamName(exam.name);
      setEditExamDate(exam.date || new Date().toISOString().slice(0, 10));
    }
  }

  function deleteExam(exam: GradeExam) {
    if (!window.confirm(`确定要删除「${exam.name}」这场考试及对应学生成绩记录吗？\n删除后无法恢复。`)) {
      return;
    }
    if (onDeleteGradeExam(exam.id)) {
      setScoreStatus(`已删除「${exam.name}」。`);
    }
  }

  async function generateClassAnalysis() {
    setClassAnalysisBusy(true);
    setClassAnalysisStatus("正在生成班级 AI 分析...");
    try {
      const result = await onGenerateClassAnalysis();
      setClassAnalysis(result);
      setClassAnalysisStatus("");
    } catch {
      setClassAnalysis({
        overall: onGenerateLocalClassAnalysis(),
        classChanges: "",
        focusStudents: "",
        suggestions: "",
        disclaimer: "本地分析基于已保存成绩计算，未调用 AI。",
      });
      setClassAnalysisStatus("AI 分析暂时不可用，已显示本地分析。");
    } finally {
      setClassAnalysisBusy(false);
    }
  }

  const scoreHeaders = scoreRows[0] || [];
  const columnOptions = scoreHeaders.map((header, index) => ({
    value: index,
    label: `${index + 1}. ${header || "空列"}`,
  }));
  const scorePreviewRows = scoreRows.slice(1, 13);

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="score-workspace-grid relative grid min-h-0 flex-1 overflow-hidden p-4" data-management-open={managementOpen}>
        <button
          type="button"
          onClick={() => setManagementOpen(open => !open)}
          className="score-management-toggle absolute z-20 grid h-9 w-9 place-items-center rounded-xl border border-gray-200 bg-white text-gray-500 shadow-sm transition-[color,background-color,border-color,box-shadow] hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
          aria-label={managementOpen ? "收起成绩管理" : "展开成绩管理"}
          aria-expanded={managementOpen}
          title={managementOpen ? "收起成绩管理" : "展开成绩管理"}
        >
          {managementOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>

        <aside
          aria-hidden={!managementOpen}
          inert={!managementOpen}
          className="score-management-panel min-h-0 w-[320px] space-y-4 overflow-y-auto"
        >
          <Panel title="成绩导入">
            <div className="space-y-3">
              <FileDropZone accept=".xlsx,.xls,.xlsm,.csv,.tsv" onChange={file => { if (file) void readScoreFile(file); }}>
                <FileUp className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">{draft ? draft.filename : "拖拽或选择成绩文件"}</span>
              </FileDropZone>
              {draft && (
                <div className="space-y-2">
                  {remappingExamId && (
                    <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      <span className="min-w-0 flex-1">
                        正在重新映射已保存考试，保存后会覆盖原考试。
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(null);
                          setScoreRows([]);
                          setScoreFilename("");
                          setManualMapping(null);
                          setRemappingExamId("");
                          setScoreStatus("");
                        }}
                        className="shrink-0 font-semibold text-blue-500 hover:text-blue-700"
                      >
                        取消
                      </button>
                    </div>
                  )}
                  <input value={examName} onChange={event => setExamName(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" placeholder="考试名称" />
                  <input type="date" value={examDate} onChange={event => setExamDate(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" />
                  <Button onClick={saveDraft} className="w-full">{remappingExamId ? "保存修改" : "保存考试"}</Button>
                </div>
              )}
              {scoreRows.length > 0 && manualMapping && (
                <button
                  type="button"
                  onClick={() => setMappingModalOpen(true)}
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-100"
                  style={{ fontWeight: 900 }}
                >
                  <span>映射设置</span>
                  <span className="text-xs text-gray-400">{manualMapping.subjectMappings.length} 个科目</span>
                </button>
              )}
              {draft?.warnings.length ? (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                  {draft.warnings.join(" ")}
                </div>
              ) : null}
              {scoreStatus && <p className="text-sm text-blue-600">{scoreStatus}</p>}
            </div>
          </Panel>

          <Panel title="历史考试">
            <div className="space-y-2">
              {exams.map(exam => (
                <div key={exam.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  {editingExamId === exam.id ? (
                    <div className="space-y-2">
                      <input value={editExamName} onChange={e => setEditExamName(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300" placeholder="考试名称" />
                      <input type="date" value={editExamDate} onChange={e => setEditExamDate(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300" />
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!editExamName.trim()) return;
                            if (onUpdateGradeExam(exam.id, editExamName, editExamDate)) setEditingExamId("");
                          }}
                        >
                          保存
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditingExamId("")}>取消</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="truncate text-sm font-bold text-gray-800">{exam.name}</div>
                      <div className="mt-1 text-xs text-gray-400">{exam.date || "未填写日期"} · {exam.rows.length} 人 · {exam.subjects.length} 科</div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setExamTable(exam)}>表格</Button>
                        <Button size="sm" variant="secondary" onClick={() => editExam(exam)}>编辑</Button>
                        <Button size="sm" variant="danger" onClick={() => deleteExam(exam)}>删除</Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {exams.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-8 text-center text-sm text-gray-400">暂无考试</div>}
            </div>
          </Panel>

          <Panel title="分析与建议">
            <div className="space-y-2">
              <button disabled={classAnalysisBusy} onClick={generateClassAnalysis} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60" style={{ fontWeight: 800 }}>{classAnalysisBusy ? "生成中" : "生成班级分析"}</button>
              <button disabled={studentAdviceProgress.busy} onClick={() => void onGenerateStudentTrendAdvice()} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60" style={{ fontWeight: 800 }}>
                <Sparkles className="mr-1.5 inline h-4 w-4 -mt-0.5" />{studentAdviceProgress.busy ? "生成中" : "生成学生建议"}
              </button>
              {classAnalysis && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-700">
                  <div>{classAnalysis.overall}</div>
                  {classAnalysis.disclaimer && <div className="mt-1 text-blue-500">{classAnalysis.disclaimer}</div>}
                </div>
              )}
              {classAnalysisStatus && <p className="text-xs text-blue-600">{classAnalysisStatus}</p>}
              {studentAdviceProgress.status && <p className="text-xs text-violet-600">{studentAdviceProgress.status}</p>}
            </div>
          </Panel>
        </aside>

        <main className="min-h-0 min-w-0 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <GradesPage exams={exams} students={students} onSelectStudent={onSelectStudent} onOpenStudentFollowup={onOpenStudentFollowup} />
        </main>
      </div>
      {mappingModalOpen && manualMapping && (
        <div className="soft-backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/35 p-5">
          <div className="modal-panel-enter flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg text-gray-900" style={{ fontWeight: 900 }}>成绩列映射</h3>
                <p className="mt-1 text-sm text-gray-500">AI 会读取表头和最多 80 行样例，生成后仍可手动调整。</p>
              </div>
              <button
                type="button"
                onClick={() => setMappingModalOpen(false)}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_25rem] gap-0 overflow-hidden">
              <div className="min-h-0 border-r border-gray-100 bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>表格预览</div>
                    <div className="mt-0.5 text-xs text-gray-400">{scoreFilename || "成绩表"} · 共 {Math.max(scoreRows.length - 1, 0)} 行数据</div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow-sm">显示前 12 行</span>
                </div>
                <div className="max-h-[58vh] overflow-auto rounded-2xl border border-gray-200 bg-white">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
                    <thead className="sticky top-0 bg-gray-100 text-gray-500">
                      <tr>
                        {scoreHeaders.map((header, index) => (
                          <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-gray-200 px-3 py-2 font-semibold">
                            {index + 1}. {header || "空列"}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scorePreviewRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="odd:bg-white even:bg-gray-50/70">
                          {scoreHeaders.map((_, colIndex) => (
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
                        <div className="mt-0.5 text-xs leading-5 text-violet-600">先让 AI 填好右侧映射，再由你确认或继续改。</div>
                      </div>
                      <button
                        type="button"
                        disabled={aiMappingBusy}
                        onClick={() => void generateAiMapping()}
                        className="rounded-xl bg-violet-600 px-3 py-2 text-xs text-white hover:bg-violet-700 disabled:opacity-60"
                        style={{ fontWeight: 900 }}
                      >
                        {aiMappingBusy ? "识别中" : "AI 识别"}
                      </button>
                    </div>
                    {!hasAiMappingAuth && (
                      <div className="mt-3 space-y-2">
                        <input
                          value={aiMappingAccessCode}
                          onChange={event => setAiMappingAccessCode(event.target.value)}
                          className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm outline-none focus:border-violet-300"
                          placeholder="输入 AI 授权码"
                        />
                        <label className="flex items-center gap-2 text-xs text-violet-700">
                          <input type="checkbox" checked={aiMappingRemember} onChange={event => setAiMappingRemember(event.target.checked)} />
                          记住授权码
                        </label>
                      </div>
                    )}
                    {aiMappingSuggestion && (
                      <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-violet-700">
                        {aiMappingSuggestion.note || "AI 已填入映射，可继续手动修改或直接应用。"}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs text-gray-500">姓名列</label>
                    <select
                      value={manualMapping.nameCol}
                      onChange={event => updateManualMapping(mapping => ({ ...mapping, nameCol: Number(event.target.value) }))}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300"
                    >
                      {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs text-gray-500">学号列（可选）</label>
                    <select
                      value={manualMapping.studentNoCol}
                      onChange={event => updateManualMapping(mapping => ({ ...mapping, studentNoCol: Number(event.target.value) }))}
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300"
                    >
                      <option value={-1}>未识别学号</option>
                      {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>科目分数列</div>
                      <button
                        type="button"
                        onClick={() => updateManualMapping(mapping => ({
                          ...mapping,
                          subjectMappings: [...mapping.subjectMappings, { subject: "科目", scoreCol: 0, rankClassCol: -1, rankSchoolCol: -1 }],
                        }))}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        style={{ fontWeight: 800 }}
                      >
                        添加科目
                      </button>
                    </div>
                    {manualMapping.subjectMappings.map((item, index) => (
                      <div key={`${item.subject}-${index}`} className="space-y-2 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                        <div className="grid grid-cols-[1fr_1.35fr_auto] gap-2">
                          <select
                            value={item.subject}
                            onChange={event => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.map((subjectItem, subjectIndex) => subjectIndex === index ? { ...subjectItem, subject: event.target.value } : subjectItem),
                            }))}
                            className="min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm outline-none focus:border-blue-300"
                          >
                            {SUBJECT_ORDER.map(subject => <option key={subject} value={subject}>{subject}</option>)}
                            {!SUBJECT_ORDER.includes(item.subject) && <option value={item.subject}>{item.subject}</option>}
                          </select>
                          <select
                            value={item.scoreCol}
                            onChange={event => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.map((subjectItem, subjectIndex) => subjectIndex === index ? { ...subjectItem, scoreCol: Number(event.target.value) } : subjectItem),
                            }))}
                            className="min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm outline-none focus:border-blue-300"
                          >
                            {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                          <button
                            type="button"
                            onClick={() => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.filter((_, subjectIndex) => subjectIndex !== index),
                            }))}
                            className="rounded-xl px-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="删除科目"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={item.rankClassCol}
                            onChange={event => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.map((subjectItem, subjectIndex) => subjectIndex === index ? { ...subjectItem, rankClassCol: Number(event.target.value) } : subjectItem),
                            }))}
                            className="min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm outline-none focus:border-blue-300"
                          >
                            <option value={-1}>班排列（可选）</option>
                            {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                          <select
                            value={item.rankSchoolCol}
                            onChange={event => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.map((subjectItem, subjectIndex) => subjectIndex === index ? { ...subjectItem, rankSchoolCol: Number(event.target.value) } : subjectItem),
                            }))}
                            className="min-w-0 rounded-xl border border-gray-200 bg-white px-2 py-2 text-sm outline-none focus:border-blue-300"
                          >
                            <option value={-1}>校排列（可选）</option>
                            {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <label className="block text-xs text-gray-500">总分与总排名</label>
                    <select
                      value={manualMapping.totalMapping.scoreCol}
                      onChange={event => updateManualMapping(mapping => ({
                        ...mapping,
                        totalMapping: { ...mapping.totalMapping, scoreCol: Number(event.target.value) },
                      }))}
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300"
                    >
                      <option value={-1}>总分列（可选）</option>
                      {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={manualMapping.totalMapping.rankClassCol}
                        onChange={event => updateManualMapping(mapping => ({
                          ...mapping,
                          totalMapping: { ...mapping.totalMapping, rankClassCol: Number(event.target.value) },
                        }))}
                        className="min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300"
                      >
                        <option value={-1}>总班排（可选）</option>
                        {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <select
                        value={manualMapping.totalMapping.rankSchoolCol}
                        onChange={event => updateManualMapping(mapping => ({
                          ...mapping,
                          totalMapping: { ...mapping.totalMapping, rankSchoolCol: Number(event.target.value) },
                        }))}
                        className="min-w-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300"
                      >
                        <option value={-1}>总校排（可选）</option>
                        {columnOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setMappingModalOpen(false)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                style={{ fontWeight: 800 }}
              >
                先不应用
              </button>
              <button
                type="button"
                onClick={applyManualMapping}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                style={{ fontWeight: 900 }}
              >
                应用映射
              </button>
            </div>
          </div>
        </div>
      )}
      {examTable && <ExamTableModal exam={examTable} onClose={() => setExamTable(null)} />}
    </div>
  );
}

// ── 班费管理 ──────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ClassFundWorkspace({
  transactions,
  students,
  onAdd,
  onUpdate,
  onDelete,
  onClearAll,
}: {
  transactions: FundTransaction[];
  students: AppStudent[];
  onAdd: (input: NewFundTxInput) => void;
  onUpdate: (id: string, patch: Partial<Pick<FundTransaction, "type" | "amount" | "category" | "note" | "date" | "relatedStudentIds">>) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}) {
  const [editingId, setEditingId] = useState("");
  const [editType, setEditType] = useState<FundTxType>("income");
  const [editAmount, setEditAmount] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");

  const balance = calcBalance(transactions);
  const incomeTotal = calcIncomeTotal(transactions);
  const expenseTotal = calcExpenseTotal(transactions);

  function startEdit(tx: FundTransaction) {
    setEditingId(tx.id);
    setEditType(tx.type);
    setEditAmount(String(tx.amount));
    setEditCategory(tx.category);
    setEditNote(tx.note);
    setEditDate(tx.date);
  }

  function saveEdit() {
    if (!editingId) {
      return;
    }
    const value = Number(editAmount);
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    onUpdate(editingId, {
      type: editType,
      amount: Math.abs(value),
      category: editCategory,
      note: editNote,
      date: editDate,
    });
    setEditingId("");
  }

  function handleClearAll() {
    if (transactions.length === 0) {
      return;
    }
    if (window.confirm(`确定清空全部 ${transactions.length} 条交易记录？此操作不可撤销。`)) {
      onClearAll();
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl space-y-5">
          {/* 统计卡：左大余额 + 右两小卡 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_12rem_12rem]">
            <div className="surface-enter rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-xs text-gray-400">当前余额</div>
              <div className={`mt-1 text-3xl ${balance >= 0 ? "text-gray-900" : "text-red-500"}`} style={{ fontWeight: 900 }}>
                ¥{formatCurrency(balance)}
              </div>
              <div className="mt-1 text-xs text-gray-400">{transactions.length} 笔交易</div>
            </div>
            <div className="surface-enter flex flex-col justify-center rounded-2xl border border-gray-100 bg-white p-4 shadow-sm [animation-delay:60ms]">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                收入合计
              </div>
              <div className="mt-1 text-xl text-emerald-600" style={{ fontWeight: 900 }}>
                ¥{formatCurrency(incomeTotal)}
              </div>
            </div>
            <div className="surface-enter flex flex-col justify-center rounded-2xl border border-gray-100 bg-white p-4 shadow-sm [animation-delay:120ms]">
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <TrendingDown className="h-3.5 w-3.5 text-red-500" />
                支出合计
              </div>
              <div className="mt-1 text-xl text-red-500" style={{ fontWeight: 900 }}>
                ¥{formatCurrency(expenseTotal)}
              </div>
            </div>
          </div>

          {/* 左右双栏：记一笔 + 收支流水 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[22rem_1fr]">
            {/* 左：记一笔 */}
            <div className="surface-enter rounded-2xl border border-gray-100 bg-white p-5 shadow-sm [animation-delay:60ms]">
              <div className="mb-4 text-sm font-semibold text-gray-900">记一笔</div>
              <FundTransactionForm students={students} onSubmit={onAdd} />
            </div>

            {/* 右：收支流水 */}
            <div className="surface-enter rounded-2xl border border-gray-100 bg-white p-5 shadow-sm [animation-delay:120ms]">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">收支流水</div>
                {transactions.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs text-red-500 transition-colors hover:bg-red-50"
                  >
                    清空全部
                  </button>
                )}
              </div>
              {transactions.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-400">
                  暂无交易记录，在左侧「记一笔」开始记录
                </div>
              ) : (
                <div className="space-y-1">
                  {transactions.map(tx => (
                    <div key={tx.id} className="border-b border-gray-50 last:border-b-0">
                      {editingId === tx.id ? (
                        /* 编辑态 */
                        <div className="space-y-2 bg-blue-50/40 px-3 py-3">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setEditType("income")}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                editType === "income" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-gray-200 bg-white text-gray-500"
                              }`}
                            >
                              收入
                            </button>
                            <button
                              onClick={() => setEditType("expense")}
                              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                                editType === "expense" ? "border-red-200 bg-red-50 text-red-600" : "border-gray-200 bg-white text-gray-500"
                              }`}
                            >
                              支出
                            </button>
                          </div>
                          <div className="grid grid-cols-[1fr_7rem] gap-2">
                            <input
                              value={editCategory}
                              onChange={e => setEditCategory(e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                              placeholder="分类"
                            />
                            <input
                              type="number"
                              value={editAmount}
                              onChange={e => setEditAmount(e.target.value)}
                              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-right text-sm outline-none focus:border-blue-300"
                              placeholder="金额"
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <input
                            value={editNote}
                            onChange={e => setEditNote(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                            placeholder="说明"
                          />
                          <input
                            type="date"
                            value={editDate}
                            onChange={e => setEditDate(e.target.value)}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={saveEdit}
                              className="flex-1 rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              保存
                            </button>
                            <button
                              onClick={() => setEditingId("")}
                              className="rounded-lg border border-gray-200 bg-white px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        /* 展示态 */
                        <div className="group flex items-center gap-3 px-1 py-2.5 transition-colors hover:bg-gray-50">
                          {/* 图标 */}
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            tx.type === "income" ? "bg-emerald-50 text-emerald-500" : "bg-red-50 text-red-500"
                          }`}>
                            {tx.type === "income" ? (
                              <TrendingUp className="h-4 w-4" />
                            ) : (
                              <TrendingDown className="h-4 w-4" />
                            )}
                          </span>
                          {/* 内容 */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm text-gray-800" style={{ fontWeight: 700 }}>
                                {tx.category || "未分类"}
                              </span>
                              {tx.note && (
                                <span className="text-xs text-gray-400">{tx.note}</span>
                              )}
                              {(tx.relatedStudentNames?.length ? tx.relatedStudentNames.join("、") : tx.relatedStudentName) && (
                                <span className="text-xs text-blue-500">@{tx.relatedStudentNames?.length ? tx.relatedStudentNames.join("、") : tx.relatedStudentName}</span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-gray-400">{tx.date}</div>
                          </div>
                          {/* 金额 */}
                          <span className={`shrink-0 text-sm font-semibold ${
                            tx.type === "income" ? "text-emerald-600" : "text-red-500"
                          }`}>
                            {tx.type === "income" ? "+" : "−"}¥{formatCurrency(tx.amount)}
                          </span>
                          {/* 操作 */}
                          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => startEdit(tx)}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onDelete(tx.id)}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
