import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Dices,
  FileDown,
  FileUp,
  History,
  Pencil,
  Plus,
  Save,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  TrendingDown,
  TrendingUp,
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
import { type NewDormEventInput } from "../state/dormitoryActions";
import { calcBalance, calcExpenseTotal, calcIncomeTotal, type NewFundTxInput } from "../state/classFundActions";
import { DormEventForm } from "./DormEventForm";
import { FundTransactionForm } from "./FundTransactionForm";
import { SeatSettingsModal } from "./SeatSettingsModal";
import { Button, FileDropZone } from "./ui";
import { hasStoredAiScoreMappingAuth, suggestScoreMappingWithAi, type AiScoreMappingSuggestion } from "../state/aiScoreMappingService";
import {
  buildScoreImportDraftFromRows,
  createSavedGradeExamRecord,
  detectScoreMapping,
  parseRowsWithMapping,
  readRowsFromFile,
  SUBJECT_ORDER,
  type ScoreMapping,
} from "../state/scoreImport";
import type { RosterImportOptions, RosterImportResult } from "../state/rosterImport";
import type { AiClassTrendResult } from "../state/aiTrendService";
import type {
  AppStudent,
  Dormitory,
  FundTransaction,
  FundTxType,
  Gender,
  GradeExam,
  SavedGradeExamRecord,
  ScoreImportDraft,
  SeatHistorySnapshot,
  SeatSettings,
  StudentId,
} from "../state/types";
import { ExamTableModal } from "./ExamTableModal";
import { GradesPage } from "./GradesPage";
import { SeatBoard } from "./SeatBoard";

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <h2 className="text-base text-gray-900" style={{ fontWeight: 900 }}>{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4">
      <div>
        <h1 className="text-xl text-gray-900" style={{ fontWeight: 900 }}>{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-400">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function formatHistoryTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "未记录时间" : date.toLocaleString("zh-CN", { hour12: false });
}

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
  onMoveSeat: (fromIndex: number, toIndex: number) => void;
  onToggleLock: (idx: number) => void;
}) {
  const [showSeatSettings, setShowSeatSettings] = useState(false);
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [alias, setAlias] = useState("");
  const [search, setSearch] = useState("");
  const [drawCount, setDrawCount] = useState(1);
  const [noRepeat, setNoRepeat] = useState(false);
  const [drawResult, setDrawResult] = useState<string[]>([]);
  const [drawHistory, setDrawHistory] = useState<Array<{ id: string; time: string; names: string[] }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const filteredStudents = students.filter(student => !search || student.name.includes(search) || student.aliases.some(item => item.includes(search))).slice(0, 8);

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
    <div className="flex h-full flex-col bg-gray-50">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_320px] gap-4 overflow-hidden p-4">
        <div className="min-h-0 overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <SeatBoard students={students} seatOrder={seatOrder} onSelectStudent={onSelectStudent} onMoveSeat={onMoveSeat} lockedSeats={lockedSeats} onToggleLock={onToggleLock} />
        </div>
        <aside className="min-h-0 space-y-4 overflow-y-auto">
          <Panel title="排座">
            <div className="flex gap-2">
              {(() => {
                const c = seatSettings.constraints;
                const activeCount = c.lockedDeskmatePairs.length + c.noDeskmatePairs.length + c.frontRowStudentIds.length + seatSettings.complementRuleIds.length + (seatSettings.pairByGender ? 1 : 0);
                return (
                  <button onClick={() => setShowSeatSettings(true)} className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm text-white hover:bg-blue-700" style={{ fontWeight: 800 }}>
                    <Shuffle className="mr-1.5 inline h-4 w-4 -mt-0.5" />排座
                    {activeCount > 0 && <span className="ml-1.5 rounded-full bg-white/25 px-1.5 text-xs">{activeCount}</span>}
                  </button>
                );
              })()}
              <button
                onClick={onUndoSeatOrder}
                disabled={!canUndoSeatOrder}
                className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
              >
                撤销
              </button>
            </div>
          </Panel>

          <Panel title="学生">
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_5rem_auto] gap-2">
                <input value={name} onChange={event => setName(event.target.value)} className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" placeholder="姓名" />
                <select value={gender} onChange={event => setGender(event.target.value as Gender)} className="rounded-xl border border-gray-200 bg-gray-50 px-2 py-2 text-sm outline-none focus:border-blue-300">
                  <option value="">未知</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
                <button disabled={!name.trim()} onClick={addStudent} className="rounded-xl bg-blue-600 px-3 py-2 text-white disabled:bg-gray-100 disabled:text-gray-300">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <input value={alias} onChange={event => setAlias(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" placeholder="别名/拼音（可选）" />
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input value={search} onChange={event => setSearch(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-300" placeholder="搜索学生" />
              </div>
              {search && (
                <div className="overflow-hidden rounded-xl border border-gray-100">
                  {filteredStudents.map(student => (
                    <button key={student.id} onClick={() => onSelectStudent(student)} className="flex w-full items-center justify-between border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-blue-50">
                      <span className="text-gray-700">{student.name}</span>
                      <span className="text-xs text-gray-400">{student.gender || "未知"}</span>
                    </button>
                  ))}
                  {filteredStudents.length === 0 && <div className="px-3 py-3 text-center text-sm text-gray-400">无匹配结果</div>}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="抽签">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  人数
                  <input type="number" min={1} max={Math.max(1, students.length)} value={drawCount} onChange={event => setDrawCount(Number(event.target.value) || 1)} className="w-16 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-center outline-none" />
                </label>
                <label className="ml-auto flex items-center gap-1.5 text-sm text-gray-600">
                  <input type="checkbox" checked={noRepeat} onChange={event => setNoRepeat(event.target.checked)} className="accent-blue-600" />
                  去重
                </label>
              </div>
              <button onClick={draw} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm text-white hover:bg-blue-700" style={{ fontWeight: 800 }}>
                <Dices className="mr-1.5 inline h-4 w-4 -mt-0.5" />开始抽签
              </button>
              {drawResult.length > 0 && (
                <div className="flex flex-wrap gap-2 rounded-xl border border-blue-100 bg-blue-50 p-2">
                  {drawResult.map(name => <span key={name} className="rounded-full bg-blue-600 px-2.5 py-1 text-sm text-white" style={{ fontWeight: 800 }}>{name}</span>)}
                </div>
              )}
              {drawHistory.length > 0 && (
                <div className="overflow-hidden rounded-xl border border-gray-100">
                  <button onClick={() => setHistoryOpen(value => !value)} className="flex w-full items-center justify-between px-3 py-2 text-xs text-gray-600 hover:bg-gray-50" style={{ fontWeight: 800 }}>
                    最近 {drawHistory.length} 次
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
                  </button>
                  {historyOpen && (
                    <div className="divide-y divide-gray-50 border-t border-gray-50">
                      {drawHistory.map(item => (
                        <div key={item.id} className="px-3 py-2">
                          <div className="text-xs text-gray-400">{item.time}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {item.names.map(name => <span key={`${item.id}-${name}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{name}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Panel>
        </aside>
      </div>

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

function scoreClass(value: number): string {
  return value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-gray-500";
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
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
      const result = await onImportRoster(rosterFile, { replaceExisting, keepHistory: replaceExisting ? keepHistory : true });
      setRosterFile(null);
      setRosterStatus(`导入成功：${result.studentCount} 名学生、${result.seatCount} 个座位。`);
    } catch {
      setRosterStatus("名单导入失败，请检查文件格式。");
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

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="grid gap-4 overflow-y-auto p-4 lg:grid-cols-3">
        <div className="surface-enter">
        <Panel title="导入名单" action={<span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-600" style={{ fontWeight: 800 }}>导入</span>}>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={replaceExisting} onChange={event => setReplaceExisting(event.target.checked)} className="accent-blue-600" />覆盖现有名单</label>
            <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={keepHistory} disabled={!replaceExisting} onChange={event => setKeepHistory(event.target.checked)} className="accent-blue-600 disabled:opacity-40" />覆盖时保留历史数据</label>
            <FileDropZone accept=".xlsx,.xls,.csv,.tsv" onChange={file => setRosterFile(file)} className="min-h-32 justify-center">
              <FileUp className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-500">{rosterFile ? rosterFile.name : "拖拽文件或点击选择 .xlsx / .csv"}</span>
            </FileDropZone>
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
    </div>
  );
}

export function HistoryWorkspace({
  history,
  onSave,
  onRename,
  onView,
  onApply,
  onDelete,
}: {
  history: SeatHistorySnapshot[];
  onSave: (note: string) => void;
  onRename: (id: string, note: string) => void;
  onView: (snapshot: SeatHistorySnapshot) => void;
  onApply: (snapshot: SeatHistorySnapshot) => void;
  onDelete: (id: string) => void;
}) {
  const [note, setNote] = useState("");
  const [renamingId, setRenamingId] = useState("");
  const [renameValue, setRenameValue] = useState("");

  function save() {
    if (!note.trim()) return;
    onSave(note);
    setNote("");
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] gap-4 overflow-hidden p-4">
        <Panel title="保存当前座位">
          <div className="space-y-3">
            <input value={note} onChange={event => setNote(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" placeholder="记录名称，例如：期中后调整" />
            <button onClick={save} disabled={!note.trim()} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300" style={{ fontWeight: 800 }}>
              <Save className="mr-1.5 inline h-4 w-4 -mt-0.5" />保存座位
            </button>
          </div>
        </Panel>

        <Panel title="历史列表">
          <div className="overflow-hidden rounded-xl border border-gray-100">
            {history.map(snapshot => (
              <div key={snapshot.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-gray-50 px-4 py-3 last:border-0">
                <div className="min-w-0">
                  {renamingId === snapshot.id ? (
                    <input value={renameValue} onChange={event => setRenameValue(event.target.value)} className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm outline-none" />
                  ) : (
                    <div className="truncate text-sm text-gray-800" style={{ fontWeight: 900 }}>{snapshot.note || "未命名座位"}</div>
                  )}
                  <div className="mt-1 text-xs text-gray-400">{formatHistoryTime(snapshot.time)} · {snapshot.rows} 排</div>
                </div>
                <div className="flex items-center gap-2">
                  {renamingId === snapshot.id ? (
                    <button onClick={() => { onRename(snapshot.id, renameValue); setRenamingId(""); }} className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white" style={{ fontWeight: 800 }}>保存</button>
                  ) : (
                    <button onClick={() => { setRenamingId(snapshot.id); setRenameValue(snapshot.note); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50" style={{ fontWeight: 800 }}>命名</button>
                  )}
                  <button onClick={() => onView(snapshot)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50" style={{ fontWeight: 800 }}>查看</button>
                  <button onClick={() => onApply(snapshot)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700" style={{ fontWeight: 800 }}>恢复</button>
                  <button onClick={() => onDelete(snapshot.id)} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-500 hover:bg-red-100" style={{ fontWeight: 800 }}>删除</button>
                </div>
              </div>
            ))}
            {history.length === 0 && <div className="px-4 py-12 text-center text-sm text-gray-400">暂无历史记录</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function ScoresWorkspace({
  exams,
  students,
  onSelectStudent,
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

  async function readScoreFile(file?: File) {
    if (!file) return;
    setScoreStatus("正在解析成绩表...");
    setAiMappingSuggestion(null);
    try {
      const rows = await readRowsFromFile(file);
      const mapping = detectScoreMapping(rows);
      setManualMapping(mapping);
      const nextDraft = {
        ...parseRowsWithMapping(rows, mapping),
        filename: file.name,
      };
      setScoreRows(rows);
      setScoreFilename(file.name);
      setDraft(nextDraft);
      setExamName(file.name.replace(/\.[^.]+$/, "") || "考试");
      setExamDate(new Date().toISOString().slice(0, 10));
      setScoreStatus(`已解析 ${nextDraft.entries.length} 名学生、${nextDraft.subjects.length} 个科目。${nextDraft.warnings.length ? " 可打开映射设置进一步确认。" : ""}`);
    } catch (error) {
      try {
        const rows = await readRowsFromFile(file);
        setManualMapping(detectScoreMapping(rows));
        setScoreRows(rows);
        setScoreFilename(file.name);
        setExamName(file.name.replace(/\.[^.]+$/, "") || "考试");
        setExamDate(new Date().toISOString().slice(0, 10));
      } catch {
        setScoreRows([]);
        setScoreFilename("");
        setManualMapping(null);
      }
      setDraft(null);
      setScoreStatus(error instanceof Error && error.message === "mapping_failed" ? "未能自动识别姓名或科目列，可打开映射设置。" : "成绩表解析失败，请检查文件格式。");
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
    const saved = onSaveScoreImport(createSavedGradeExamRecord(draft, { name: examName, date: examDate }));
    setDraft(null);
    setScoreRows([]);
    setScoreFilename("");
    setManualMapping(null);
    setMappingModalOpen(false);
    setAiMappingSuggestion(null);
    setScoreStatus(saved ? `已保存「${saved.name}」。` : "保存失败。");
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
      <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] gap-4 overflow-hidden p-4">
        <aside className="min-h-0 space-y-4 overflow-y-auto">
          <Panel title="成绩导入">
            <div className="space-y-3">
              <FileDropZone accept=".xlsx,.xls,.csv,.tsv" onChange={file => { if (file) void readScoreFile(file); }}>
                <FileUp className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-500">{draft ? draft.filename : "拖拽或选择成绩文件"}</span>
              </FileDropZone>
              {draft && (
                <div className="space-y-2">
                  <input value={examName} onChange={event => setExamName(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" placeholder="考试名称" />
                  <input type="date" value={examDate} onChange={event => setExamDate(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" />
                  <Button onClick={saveDraft} className="w-full">保存考试</Button>
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
                        <Button size="sm" variant="secondary" onClick={() => { setEditingExamId(exam.id); setEditExamName(exam.name); setEditExamDate(exam.date || new Date().toISOString().slice(0, 10)); }}>编辑</Button>
                        <Button size="sm" variant="danger" onClick={() => { if (window.confirm(`确认删除「${exam.name}」？该操作不可撤销。`)) onDeleteGradeExam(exam.id); }}>删除</Button>
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

        <main className="min-h-0 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <GradesPage exams={exams} students={students} onSelectStudent={onSelectStudent} />
        </main>
      </div>
      {mappingModalOpen && manualMapping && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/35 p-5">
          <div className="flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
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
