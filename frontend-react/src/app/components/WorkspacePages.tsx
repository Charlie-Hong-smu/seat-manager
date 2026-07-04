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
import { createSavedGradeExamRecord, parseScoreFile } from "../state/scoreImport";
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
            <div className="space-y-3">
              {(() => {
                const c = seatSettings.constraints;
                const activeCount = c.lockedDeskmatePairs.length + c.noDeskmatePairs.length + c.frontRowStudentIds.length + seatSettings.complementRuleIds.length + (seatSettings.pairByGender ? 1 : 0);
                return (
                  <button onClick={() => setShowSeatSettings(true)} className="w-full rounded-xl bg-blue-600 py-2.5 text-sm text-white hover:bg-blue-700" style={{ fontWeight: 800 }}>
                    <Shuffle className="mr-1.5 inline h-4 w-4 -mt-0.5" />排座
                    {activeCount > 0 && <span className="ml-1.5 rounded-full bg-white/25 px-1.5 text-xs">{activeCount}</span>}
                  </button>
                );
              })()}
              <div className="flex gap-2">
                <button
                  onClick={onRandomizeSeats}
                  disabled={!canUndoSeatOrder}
                  className="flex-1 rounded-xl border border-blue-200 bg-blue-50 py-2 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
                >
                  随机
                </button>
                <button
                  onClick={onUndoSeatOrder}
                  disabled={!canUndoSeatOrder}
                  className="flex-1 rounded-xl border border-gray-200 bg-white py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
                >
                  撤销
                </button>
              </div>
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

export function DormitoryWorkspace({
  students,
  dormitories,
  onCreateDormitory,
  onUpdateDormitory,
  onDeleteDormitory,
  onAssignStudentDormitory,
  onAddDormitoryEvent,
  onUpdateDormitoryEvent,
  onDeleteDormitoryEvent,
  onCloseDormitoryPeriod,
  onCloseAllDormitoryPeriods,
  onSelectStudent,
}: {
  students: AppStudent[];
  dormitories: Dormitory[];
  onCreateDormitory: (name: string, baseScore: number) => Dormitory;
  onUpdateDormitory: (dormitoryId: string, patch: Partial<Pick<Dormitory, "name" | "baseScore">>) => void;
  onDeleteDormitory: (dormitoryId: string) => void;
  onAssignStudentDormitory: (studentId: StudentId, dormitoryId?: string) => void;
  onAddDormitoryEvent: (input: NewDormEventInput) => void;
  onUpdateDormitoryEvent: (dormId: string, eventId: string, patch: { reason?: string; score?: number; note?: string; punishment?: string; punishmentDone?: boolean }) => void;
  onDeleteDormitoryEvent: (dormId: string, eventId: string) => void;
  onCloseDormitoryPeriod: (dormId: string, options?: { carryOver?: boolean }) => void;
  onCloseAllDormitoryPeriods: (options?: { carryOver?: boolean }) => void;
  onSelectStudent: (student: AppStudent) => void;
}) {
  const [selectedDormId, setSelectedDormId] = useState(dormitories[0]?.id || "");
  const [newName, setNewName] = useState("");
  const [newBaseScore, setNewBaseScore] = useState(0);
  const [memberSearch, setMemberSearch] = useState("");
  const [carryOver, setCarryOver] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editScore, setEditScore] = useState(0);
  const [editNote, setEditNote] = useState("");
  const [editPunishment, setEditPunishment] = useState("");
  const sortedDormitories = [...dormitories].sort((a, b) => b.currentScore - a.currentScore || a.name.localeCompare(b.name, "zh-Hans-CN"));
  const selectedDormitory = dormitories.find(dormitory => dormitory.id === selectedDormId) || sortedDormitories[0] || null;
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const memberStudents = selectedDormitory ? selectedDormitory.memberIds.map(id => studentById.get(id)).filter((student): student is AppStudent => Boolean(student)) : [];
  const assignableStudents = students
    .filter(student => !selectedDormitory || student.dormitoryId !== selectedDormitory.id)
    .filter(student => !memberSearch || student.name.includes(memberSearch) || student.aliases.some(alias => alias.includes(memberSearch)))
    .slice(0, 16);
  const periodDelta = selectedDormitory ? selectedDormitory.currentScore - selectedDormitory.baseScore : 0;
  const hasPendingEvents = dormitories.some(dormitory => dormitory.events.length > 0);

  useEffect(() => {
    if (!selectedDormitory && sortedDormitories[0]) {
      setSelectedDormId(sortedDormitories[0].id);
    }
  }, [selectedDormitory, sortedDormitories]);

  useEffect(() => {
    setEditingEventId("");
    setHistoryOpen(false);
  }, [selectedDormId]);

  function createDormitory() {
    const dormitory = onCreateDormitory(newName, newBaseScore);
    setSelectedDormId(dormitory.id);
    setNewName("");
    setNewBaseScore(0);
  }

  function startEditEvent(eventId: string, reason: string, score: number, note: string, punishment: string) {
    setEditingEventId(eventId);
    setEditReason(reason);
    setEditScore(score);
    setEditNote(note);
    setEditPunishment(punishment);
  }

  function saveEditEvent() {
    if (!selectedDormitory || !editingEventId) return;
    onUpdateDormitoryEvent(selectedDormitory.id, editingEventId, { reason: editReason, score: editScore, note: editNote, punishment: editPunishment });
    setEditingEventId("");
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-4 overflow-hidden p-4">
        <aside className="min-h-0 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-4">
            <div className="grid grid-cols-[1fr_5rem_auto] gap-2">
              <input value={newName} onChange={event => setNewName(event.target.value)} className="min-w-0 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" placeholder="新宿舍" />
              <input type="number" value={newBaseScore} onChange={event => setNewBaseScore(Number(event.target.value) || 0)} className="rounded-xl border border-gray-200 bg-gray-50 px-2 py-2 text-center text-sm outline-none focus:border-blue-300" placeholder="基础分" />
              <button onClick={createDormitory} className="rounded-xl bg-blue-600 px-3 py-2 text-white hover:bg-blue-700"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="space-y-1 p-3">
            {sortedDormitories.map((dormitory, index) => {
              const active = selectedDormitory?.id === dormitory.id;
              const delta = dormitory.currentScore - dormitory.baseScore;
              return (
                <button
                  key={dormitory.id}
                  onClick={() => setSelectedDormId(dormitory.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${active ? "border-blue-300 bg-blue-50" : "border-transparent hover:bg-gray-50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-xs font-bold ${active ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>{index + 1}</span>
                      <div className="min-w-0">
                        <div className={`truncate text-sm font-bold ${active ? "text-blue-900" : "text-gray-800"}`}>{dormitory.name}</div>
                        <div className="mt-0.5 truncate text-xs text-gray-400">{dormitory.memberIds.length} 人{delta !== 0 ? ` · 本周期 ${formatSigned(delta)}` : ""}</div>
                      </div>
                    </div>
                    <div className={`shrink-0 text-base font-bold ${scoreClass(dormitory.currentScore)}`}>{formatSigned(dormitory.currentScore)}</div>
                  </div>
                </button>
              );
            })}
            {dormitories.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-8 text-center text-sm text-gray-400">暂无宿舍</div>}
          </div>
        </aside>

        <main className="min-h-0 overflow-y-auto">
          <div className="mb-4 flex items-center justify-end gap-3">
            <label className="flex items-center gap-1.5 text-sm text-gray-500">
              <input type="checkbox" checked={carryOver} onChange={event => setCarryOver(event.target.checked)} className="accent-blue-600" />
              结转上期分数
            </label>
            <button
              onClick={() => {
                if (!hasPendingEvents) return;
                if (window.confirm(`将结算所有宿舍的当前周期${carryOver ? "（结转分数到下一周期）" : "（分数归零）"}，已记录事件会归档到周期历史。是否继续？`)) {
                  onCloseAllDormitoryPeriods({ carryOver });
                }
              }}
              disabled={!hasPendingEvents}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"
            >
              <CalendarClock className="h-4 w-4" />一键周清
            </button>
          </div>
          {selectedDormitory ? (
            <div className="space-y-4">
              <Panel
                title={selectedDormitory.name}
                action={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (window.confirm(`结算「${selectedDormitory.name}」当前周期${carryOver ? "（结转分数）" : "（分数归零）"}？已记录事件会归档。`)) {
                          onCloseDormitoryPeriod(selectedDormitory.id, { carryOver });
                        }
                      }}
                      disabled={!selectedDormitory.events.length}
                      className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
                    >
                      <CalendarClock className="mr-1 inline h-3.5 w-3.5 -mt-0.5" />结算本周期
                    </button>
                    <button onClick={() => onDeleteDormitory(selectedDormitory.id)} className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-500 hover:bg-red-100">
                      <Trash2 className="mr-1 inline h-3.5 w-3.5 -mt-0.5" />删除
                    </button>
                  </div>
                }
              >
                <div className="grid grid-cols-4 gap-3">
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-400">当前分</div>
                    <div className={`mt-1 text-2xl font-bold ${scoreClass(selectedDormitory.currentScore)}`}>{formatSigned(selectedDormitory.currentScore)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-400">本周期变化</div>
                    <div className={`mt-1 text-2xl font-bold ${scoreClass(periodDelta)}`}>{formatSigned(periodDelta)}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-400">成员</div>
                    <div className="mt-1 text-2xl font-bold text-gray-900">{memberStudents.length}</div>
                  </div>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                    <div className="text-xs text-gray-400">本周期事件</div>
                    <div className="mt-1 text-2xl font-bold text-gray-900">{selectedDormitory.events.length}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-[1fr_8rem] items-end gap-3">
                  <label className="space-y-1">
                    <span className="text-xs text-gray-400">宿舍名称</span>
                    <input value={selectedDormitory.name} onChange={event => onUpdateDormitory(selectedDormitory.id, { name: event.target.value })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-gray-400">基础分（本周期起始）</span>
                    <input type="number" value={selectedDormitory.baseScore} onChange={event => onUpdateDormitory(selectedDormitory.id, { baseScore: Number(event.target.value) || 0 })} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-2 py-2 text-center text-sm outline-none focus:border-blue-300" />
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-400">本周期自 {selectedDormitory.periodStart} 起 · 当前分 = 基础分 {formatSigned(selectedDormitory.baseScore)} + 事件 {formatSigned(periodDelta)}</p>
              </Panel>

              <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-4">
                <Panel title="事件账本">
                  <DormEventForm
                    members={memberStudents}
                    onSubmit={input => onAddDormitoryEvent({ ...input, dormId: selectedDormitory.id })}
                  />

                  <div className="mt-5 overflow-hidden rounded-xl border border-gray-100">
                    {selectedDormitory.events.slice(0, 30).map(event => (
                      editingEventId === event.id ? (
                        <div key={event.id} className="space-y-2 border-b border-gray-50 bg-blue-50/40 px-4 py-3 last:border-0">
                          <div className="grid grid-cols-[1fr_5rem] gap-2">
                            <input value={editReason} onChange={e => setEditReason(e.target.value)} className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300" placeholder="原因" />
                            <input type="number" value={editScore} onChange={e => setEditScore(Number(e.target.value) || 0)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm outline-none focus:border-blue-300" />
                          </div>
                          <input value={editNote} onChange={e => setEditNote(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300" placeholder="备注（可选）" />
                          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                            <input value={editPunishment} onChange={e => setEditPunishment(e.target.value)} className="min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300" placeholder="处罚措施（可选）" />
                            <button onClick={saveEditEvent} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"><Check className="inline h-3.5 w-3.5" /></button>
                            <button onClick={() => setEditingEventId("")} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50"><X className="inline h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      ) : (
                        <div key={event.id} className="group border-b border-gray-50 px-4 py-3 last:border-0 hover:bg-gray-50/60">
                          <div className="grid grid-cols-[5.5rem_1fr_6rem_3.5rem_auto] items-center gap-3 text-sm">
                            <span className="text-xs text-gray-400">{event.date}</span>
                            <span className="min-w-0 truncate font-semibold text-gray-800">{event.reason}{event.note ? ` · ${event.note}` : ""}</span>
                            <span className="truncate text-xs text-gray-500">{event.responsibleStudentName || "宿舍"}</span>
                            <span className={`text-right font-bold ${scoreClass(event.score)}`}>{formatSigned(event.score)}</span>
                            <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button onClick={() => startEditEvent(event.id, event.reason, event.score, event.note, event.punishment || "")} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="编辑"><Pencil className="h-3.5 w-3.5" /></button>
                              <button onClick={() => onDeleteDormitoryEvent(selectedDormitory.id, event.id)} className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="删除"><Trash2 className="h-3.5 w-3.5" /></button>
                            </span>
                          </div>
                          {event.punishment && (
                            <label className={`mt-2 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${event.punishmentDone ? "border-emerald-100 bg-emerald-50 text-emerald-600" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
                              <input
                                type="checkbox"
                                checked={Boolean(event.punishmentDone)}
                                onChange={() => onUpdateDormitoryEvent(selectedDormitory.id, event.id, { punishmentDone: !event.punishmentDone })}
                                className="accent-emerald-600"
                              />
                              <span className="font-semibold">处罚</span>
                              <span className={`min-w-0 flex-1 truncate ${event.punishmentDone ? "line-through opacity-70" : ""}`}>{event.punishment}</span>
                              <span className="shrink-0 font-semibold">{event.punishmentDone ? "已执行" : "待执行"}</span>
                            </label>
                          )}
                        </div>
                      )
                    ))}
                    {selectedDormitory.events.length === 0 && <div className="px-4 py-8 text-center text-sm text-gray-400">本周期暂无事件</div>}
                  </div>
                </Panel>

                <Panel title="成员">
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {memberStudents.map(student => (
                        <span key={student.id} className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 py-1 pl-3 pr-1.5 text-sm font-semibold text-blue-700">
                          <button onClick={() => onSelectStudent(student)} className="hover:underline">{student.name}</button>
                          <button onClick={() => onAssignStudentDormitory(student.id, undefined)} className="grid h-4 w-4 place-items-center rounded-full text-blue-300 hover:bg-red-100 hover:text-red-500" title="移出宿舍"><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                      {memberStudents.length === 0 && <span className="text-sm text-gray-400">暂无成员，从下方搜索加入。</span>}
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                      <input value={memberSearch} onChange={event => setMemberSearch(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-300" placeholder="搜索并加入学生" />
                    </div>
                    <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-100">
                      {assignableStudents.map(student => (
                        <button key={student.id} onClick={() => onAssignStudentDormitory(student.id, selectedDormitory.id)} className="flex w-full items-center justify-between border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-blue-50">
                          <span className="text-gray-700">{student.name}</span>
                          <span className="text-xs text-gray-400">{student.dormitoryId ? "转入" : "加入"}</span>
                        </button>
                      ))}
                      {assignableStudents.length === 0 && <div className="px-3 py-6 text-center text-xs text-gray-400">无可加入学生</div>}
                    </div>
                  </div>
                </Panel>
              </div>

              {selectedDormitory.history.length > 0 && (
                <Panel
                  title="周期历史"
                  action={
                    <button onClick={() => setHistoryOpen(value => !value)} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700">
                      <History className="h-3.5 w-3.5" />{historyOpen ? "收起" : `展开 ${selectedDormitory.history.length} 个周期`}
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
                    </button>
                  }
                >
                  {historyOpen ? (
                    <div className="overflow-hidden rounded-xl border border-gray-100">
                      {selectedDormitory.history.map(period => (
                        <div key={period.id} className="grid grid-cols-[1fr_5rem_5rem] items-center gap-3 border-b border-gray-50 px-4 py-3 text-sm last:border-0">
                          <span className="truncate text-gray-600">{period.label}</span>
                          <span className="text-right text-xs text-gray-400">{period.events.length} 条</span>
                          <span className={`text-right font-bold ${scoreClass(period.finalScore)}`}>{formatSigned(period.finalScore)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">已归档 {selectedDormitory.history.length} 个周期，点击右上角展开查看每期结算分。</p>
                  )}
                </Panel>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-16 text-center text-gray-400">请先创建宿舍。</div>
          )}
        </main>
      </div>
    </div>
  );
}

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
  const [scoreStatus, setScoreStatus] = useState("");
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));
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
    try {
      const nextDraft = await parseScoreFile(file);
      setDraft(nextDraft);
      setExamName(file.name.replace(/\.[^.]+$/, "") || "考试");
      setExamDate(new Date().toISOString().slice(0, 10));
      setScoreStatus(`已解析 ${nextDraft.entries.length} 名学生、${nextDraft.subjects.length} 个科目。`);
    } catch {
      setScoreStatus("成绩表解析失败，请检查文件格式。");
    }
  }

  function saveDraft() {
    if (!draft || !examName.trim()) {
      setScoreStatus("请先上传成绩表并填写考试名称。");
      return;
    }
    const saved = onSaveScoreImport(createSavedGradeExamRecord(draft, { name: examName, date: examDate }));
    setDraft(null);
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
  onUpdate: (id: string, patch: Partial<Pick<FundTransaction, "type" | "amount" | "category" | "note" | "date" | "relatedStudentId">>) => void;
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
                              {tx.relatedStudentName && (
                                <span className="text-xs text-blue-500">@{tx.relatedStudentName}</span>
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
