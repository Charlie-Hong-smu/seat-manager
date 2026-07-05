import { useState, useMemo, useEffect, useRef, type ReactNode } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  History,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

import { DORM_EVENT_PRESETS } from "../state/dormitoryActions";
import type { NewDormEventInput } from "../state/dormitoryActions";
import type { AppStudent, Dormitory, StudentId } from "../state/types";

function scoreClass(value: number): string {
  return value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-gray-500";
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

const DORM_ITEM_HEIGHT = 48;
const DORM_ITEM_GAP = 4;

interface PresetEvent {
  label: string;
}

interface Props {
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
}: Props) {
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

  // 事件录入表单 state
  const [reason, setReason] = useState("");
  const [score, setScore] = useState(0);
  const [note, setNote] = useState("");
  const [punishment, setPunishment] = useState("");
  const [responsibleIds, setResponsibleIds] = useState<string[]>([]);
  const [showResponsible, setShowResponsible] = useState(false);
  const [responsibleSearch, setResponsibleSearch] = useState("");
  const [recordToStudent, setRecordToStudent] = useState(true);

  // 可变预设事件列表 + 自定义输入
  const [presets, setPresets] = useState<PresetEvent[]>(() => {
    try {
      const saved = localStorage.getItem("dorm-presets");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DORM_EVENT_PRESETS.map(p => ({ label: p.label }));
  });
  const [customLabel, setCustomLabel] = useState("");

  // 分数记忆：记录每个事件标签上次设定的分数
  const [scoreMemory, setScoreMemory] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem("dorm-score-memory");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {};
  });

  // 切换动画 key
  const [animKey, setAnimKey] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);

  const sortedDormitories = [...dormitories].sort((a, b) => b.currentScore - a.currentScore || a.name.localeCompare(b.name, "zh-Hans-CN"));
  const selectedDormitory = dormitories.find(dormitory => dormitory.id === selectedDormId) || sortedDormitories[0] || null;
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const memberStudents = selectedDormitory ? selectedDormitory.memberIds.map(id => studentById.get(id)).filter((student): student is AppStudent => Boolean(student)) : [];
  const assignableStudents = students
    .filter(student => !selectedDormitory || student.dormitoryId !== selectedDormitory.id)
    .filter(student => !memberSearch || student.name.includes(memberSearch) || student.aliases.some(alias => alias.includes(memberSearch)))
    .slice(0, 16);
  const filteredMembers = responsibleSearch.trim()
    ? memberStudents.filter(student => student.name.includes(responsibleSearch.trim()) || student.aliases.some(alias => alias.includes(responsibleSearch.trim())))
    : memberStudents;
  const selectedResponsibleStudents = responsibleIds
    .map(id => memberStudents.find(student => student.id === id))
    .filter((student): student is AppStudent => Boolean(student));
  const periodDelta = selectedDormitory ? selectedDormitory.currentScore - selectedDormitory.baseScore : 0;
  const hasPendingEvents = dormitories.some(dormitory => dormitory.events.length > 0);

  const activeDormIndex = Math.max(0, sortedDormitories.findIndex(d => d.id === selectedDormitory?.id));

  useEffect(() => {
    if (!selectedDormitory && sortedDormitories[0]) {
      setSelectedDormId(sortedDormitories[0].id);
    }
  }, [selectedDormitory, sortedDormitories]);

  // 切换宿舍时重置编辑状态 + 触发主区域动画
  useEffect(() => {
    setEditingEventId("");
    setHistoryOpen(false);
    setAnimKey(k => k + 1);
  }, [selectedDormId]);

  // 持久化预设
  useEffect(() => {
    try { localStorage.setItem("dorm-presets", JSON.stringify(presets)); } catch {}
  }, [presets]);

  // 持久化分数记忆
  useEffect(() => {
    try { localStorage.setItem("dorm-score-memory", JSON.stringify(scoreMemory)); } catch {}
  }, [scoreMemory]);

  function selectDorm(id: string) {
    if (id !== selectedDormId) {
      setSelectedDormId(id);
    }
  }

  function createDormitory() {
    const dormitory = onCreateDormitory(newName, newBaseScore);
    setSelectedDormId(dormitory.id);
    setNewName("");
    setNewBaseScore(0);
  }

  function selectPreset(label: string) {
    setReason(label);
    // 用记忆的分数，没有则 0
    setScore(scoreMemory[label] ?? 0);
  }

  function addCustomPreset() {
    const label = customLabel.trim();
    if (!label) return;
    if (presets.some(p => p.label === label)) return;
    setPresets(prev => [...prev, { label }]);
    setCustomLabel("");
  }

  function deletePreset(label: string) {
    setPresets(prev => prev.filter(p => p.label !== label));
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

  function toggleResponsible(studentId: string) {
    setResponsibleIds(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  }

  function submitEvent() {
    if (!selectedDormitory || !reason.trim()) return;
    // 记住这次设定的分数
    setScoreMemory(prev => ({ ...prev, [reason.trim()]: score }));
    onAddDormitoryEvent({
      dormId: selectedDormitory.id,
      reason,
      score,
      note,
      punishment,
      responsibleStudentIds: responsibleIds.length > 0 ? responsibleIds : undefined,
      recordToStudent: responsibleIds.length > 0 ? recordToStudent : false,
    });
    setNote("");
    setPunishment("");
  }

  function resetForm() {
    setReason("");
    setScore(0);
    setNote("");
    setPunishment("");
    setResponsibleIds([]);
    setResponsibleSearch("");
    setShowResponsible(false);
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <div className="grid min-h-0 flex-1 grid-cols-[240px_1fr_220px] gap-4 overflow-hidden p-4">
        {/* 左侧：宿舍列表 */}
        <aside className="flex flex-col min-h-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-3">
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={event => setNewName(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm outline-none focus:border-blue-300"
                placeholder="新宿舍名称"
              />
              <input
                type="number"
                value={newBaseScore}
                onChange={event => setNewBaseScore(Number(event.target.value) || 0)}
                className="w-14 rounded-lg border border-gray-200 bg-gray-50 px-1 py-1.5 text-center text-sm outline-none focus:border-blue-300"
                placeholder="分"
              />
              <button
                onClick={createDormitory}
                disabled={!newName.trim()}
                className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-white hover:bg-blue-700 disabled:bg-gray-200"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <nav
            className="relative flex-1 min-h-0 overflow-y-auto p-2"
            style={{ ["--dorm-active-y" as string]: `${activeDormIndex * (DORM_ITEM_HEIGHT + DORM_ITEM_GAP)}px` }}
          >
            {/* 选中指示条 */}
            <div
              className="pointer-events-none absolute left-2 right-2 top-2 h-12 rounded-xl bg-gray-900 shadow-sm transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: "translateY(var(--dorm-active-y))" }}
            />
            <div className="relative space-y-1">
              {sortedDormitories.map((dormitory, index) => {
                const active = selectedDormitory?.id === dormitory.id;
                return (
                  <button
                    key={dormitory.id}
                    onClick={() => selectDorm(dormitory.id)}
                    className={`relative z-10 flex h-12 w-full items-center justify-between gap-2 rounded-xl px-3 text-left transition-colors duration-100 ${active ? "text-white" : "hover:bg-gray-50 text-gray-700"}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"}`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className={`truncate text-sm font-semibold ${active ? "text-white" : "text-gray-800"}`}>
                          {dormitory.name}
                        </div>
                        <div className={`text-[10px] ${active ? "text-white/60" : "text-gray-400"}`}>
                          {dormitory.memberIds.length} 人
                        </div>
                      </div>
                    </div>
                    <div className={`shrink-0 text-sm font-bold ${active ? "text-white" : scoreClass(dormitory.currentScore)}`}>
                      {formatSigned(dormitory.currentScore)}
                    </div>
                  </button>
                );
              })}
              {dormitories.length === 0 && (
                <div className="px-2 py-6 text-center text-xs text-gray-400">暂无宿舍</div>
              )}
            </div>
          </nav>
          <div className="border-t border-gray-100 p-3 space-y-2">
            <div className="text-[10px] text-gray-400">
              共 {dormitories.length} 间 · {students.filter(s => s.dormitoryId).length} 名学生
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={carryOver}
                onChange={event => setCarryOver(event.target.checked)}
                className="accent-blue-600"
              />
              结转上期分数
            </label>
            <button
              onClick={() => {
                if (!hasPendingEvents) return;
                if (window.confirm(
                  `将结算所有宿舍的当前周期${carryOver ? "（结转分数到下一周期）" : "（分数归零）"}，已记录事件会归档。是否继续？`
                )) {
                  onCloseAllDormitoryPeriods({ carryOver });
                }
              }}
              disabled={!hasPendingEvents}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              一键周清
            </button>
          </div>
        </aside>

        {/* 中间：事件账本 + 列表（带切换动画） */}
        <main ref={mainRef} className="flex flex-col min-h-0 overflow-hidden gap-4">
          {selectedDormitory ? (
            <div key={animKey} className="flex flex-col min-h-0 flex-1 gap-4 workspace-tab-enter">
              {/* 标题区 + 统计 */}
              <div className="flex items-start justify-between gap-4 shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-900">{selectedDormitory.name}</h2>
                    <button
                      onClick={() => onDeleteDormitory(selectedDormitory.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors"
                      title="删除宿舍"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    本周期自 {selectedDormitory.periodStart} 起 · 基础分
                    <input
                      type="number"
                      value={selectedDormitory.baseScore}
                      onChange={event =>
                        onUpdateDormitory(selectedDormitory.id, { baseScore: Number(event.target.value) || 0 })
                      }
                      className="inline w-12 mx-1 rounded-md border border-gray-200 bg-white px-1 py-0.5 text-center text-xs outline-none focus:border-blue-300"
                    />
                  </p>
                </div>
                <div className="flex shrink-0 gap-4">
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400">当前分</div>
                    <div className={`text-xl font-bold ${scoreClass(selectedDormitory.currentScore)}`}>
                      {formatSigned(selectedDormitory.currentScore)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400">本周期变化</div>
                    <div className={`text-xl font-bold ${scoreClass(periodDelta)}`}>
                      {formatSigned(periodDelta)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gray-400">本周事件</div>
                    <div className="text-xl font-bold text-gray-900">
                      {selectedDormitory.events.length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
                {/* 事件录入 */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <div className="text-xs text-gray-400 font-semibold mb-3">选择事件类型</div>
                  {/* 预设事件药丸（可删除） */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {presets.map(preset => {
                      const active = reason === preset.label;
                      const memScore = scoreMemory[preset.label];
                      return (
                        <div key={preset.label} className="group relative">
                          <button
                            type="button"
                            onClick={() => selectPreset(preset.label)}
                            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                              active
                                ? "border-blue-300 bg-blue-500 text-white"
                                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                            }`}
                          >
                            {preset.label}
                            {memScore !== undefined && (
                              <span className={`ml-1 ${active ? "text-white/70" : "text-gray-400"}`}>
                                {memScore > 0 ? "+" : ""}{memScore}
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => deletePreset(preset.label)}
                            className="absolute -top-1.5 -right-1.5 grid h-4 w-4 place-items-center rounded-full bg-gray-200 text-gray-400 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-500 group-hover:opacity-100"
                            title="删除预设"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {/* 添加自定义事件 */}
                  <div className="flex gap-2 mb-4">
                    <input
                      value={customLabel}
                      onChange={e => setCustomLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addCustomPreset(); }}
                      className="flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                      placeholder="添加自定义事件类型…"
                    />
                    <button
                      onClick={addCustomPreset}
                      disabled={!customLabel.trim()}
                      className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  {/* 分数 + 责任人 + 备注 + 处罚 */}
                  {reason && (
                    <div className="space-y-4 pt-2">
                      {/* 当前事件标签 + 分数 */}
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-semibold text-blue-600">
                          {reason}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <input
                            type="number"
                            value={score}
                            onChange={e => setScore(Number(e.target.value) || 0)}
                            className={`w-20 rounded-lg border bg-white px-2 py-1.5 text-center text-sm font-semibold outline-none focus:border-blue-300 ${
                              score > 0 ? "border-emerald-200 text-emerald-600" : score < 0 ? "border-red-200 text-red-500" : "border-gray-200 text-gray-600"
                            }`}
                          />
                          <div className="flex gap-1">
                            <button onClick={() => setScore(s => s - 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-red-50 hover:text-red-500 text-sm">−</button>
                            <button onClick={() => setScore(s => s + 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:bg-emerald-50 hover:text-emerald-500 text-sm">+</button>
                          </div>
                        </div>
                      </div>

                      {/* 备注 */}
                      <input
                        value={note}
                        onChange={event => setNote(event.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-blue-300"
                        placeholder="备注（可选）"
                      />

                      {/* 处罚措施 */}
                      <input
                        value={punishment}
                        onChange={event => setPunishment(event.target.value)}
                        className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-blue-300"
                        placeholder="处罚措施（可选）"
                      />

                      {/* 责任人（可展开，带动画） */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowResponsible(!showResponsible)}
                          className="flex items-center gap-1.5 text-xs text-gray-400 transition-colors hover:text-gray-600"
                        >
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showResponsible ? "rotate-180" : ""}`} />
                          责任人（可选，可多选）
                          {responsibleIds.length > 0 && (
                            <span className="text-blue-500">· 已选 {responsibleIds.length} 人</span>
                          )}
                        </button>
                        <div
                          className={`overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1)] ${
                            showResponsible ? "max-h-96 mt-3 opacity-100" : "max-h-0 mt-0 opacity-0"
                          }`}
                        >
                          {/* 已选责任人药丸 */}
                          {selectedResponsibleStudents.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                              {selectedResponsibleStudents.map(student => (
                                <span
                                  key={student.id}
                                  className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-blue-700"
                                >
                                  {student.name}
                                  <button
                                    type="button"
                                    onClick={() => toggleResponsible(student.id)}
                                    className="grid h-3.5 w-3.5 place-items-center rounded-full text-blue-300 hover:bg-red-100 hover:text-red-500"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}
                          {/* 搜索 */}
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                            <input
                              value={responsibleSearch}
                              onChange={e => setResponsibleSearch(e.target.value)}
                              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-300"
                              placeholder="搜索宿舍成员"
                            />
                          </div>
                          {/* 成员列表（多选切换） */}
                          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-100 bg-white py-1">
                            {filteredMembers.length === 0 ? (
                              <div className="py-3 text-center text-xs text-gray-400">无匹配成员</div>
                            ) : (
                              filteredMembers.map(student => {
                                const selected = responsibleIds.includes(student.id);
                                return (
                                  <button
                                    key={student.id}
                                    type="button"
                                    onClick={() => toggleResponsible(student.id)}
                                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 ${
                                      selected ? "bg-blue-50 text-blue-600" : "text-gray-700"
                                    }`}
                                  >
                                    {student.name}
                                    {selected && <Check className="h-3.5 w-3.5" />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                          {/* 同时记入个人档案 */}
                          <label className={`mt-2 flex items-center gap-2 text-xs ${responsibleIds.length > 0 ? "text-gray-600" : "text-gray-300"}`}>
                            <input
                              type="checkbox"
                              checked={responsibleIds.length > 0 ? recordToStudent : false}
                              disabled={responsibleIds.length === 0}
                              onChange={event => setRecordToStudent(event.target.checked)}
                              className="accent-blue-600"
                            />
                            同时记入责任人个人档案
                          </label>
                        </div>
                      </div>

                      {/* 按钮 */}
                      <div className="flex gap-2">
                        <button
                          onClick={resetForm}
                          className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50"
                        >
                          取消
                        </button>
                        <button
                          onClick={submitEvent}
                          disabled={!reason.trim()}
                          className="flex-[2] rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-300"
                        >
                          保存事件
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* 事件列表 */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-700">事件记录</h3>
                    <button
                      onClick={() => {
                        if (window.confirm(
                          `结算「${selectedDormitory.name}」当前周期${carryOver ? "（结转分数）" : "（分数归零）"}？已记录事件会归档。`
                        )) {
                          onCloseDormitoryPeriod(selectedDormitory.id, { carryOver });
                        }
                      }}
                      disabled={!selectedDormitory.events.length}
                      className="flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
                    >
                      <CalendarClock className="h-3 w-3" />
                      结算本周期
                    </button>
                  </div>
                  {selectedDormitory.events.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-gray-400">
                      本周期暂无事件
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {selectedDormitory.events.map(event =>
                        editingEventId === event.id ? (
                          <div key={event.id} className="bg-blue-50/40 px-5 py-3 space-y-2">
                            <div className="flex gap-2">
                              <input
                                value={editReason}
                                onChange={e => setEditReason(e.target.value)}
                                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                                placeholder="原因"
                              />
                              <input
                                type="number"
                                value={editScore}
                                onChange={e => setEditScore(Number(e.target.value) || 0)}
                                className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-center text-sm outline-none focus:border-blue-300"
                              />
                            </div>
                            <input
                              value={editNote}
                              onChange={e => setEditNote(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                              placeholder="备注"
                            />
                            <div className="flex gap-2">
                              <input
                                value={editPunishment}
                                onChange={e => setEditPunishment(e.target.value)}
                                className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300"
                                placeholder="处罚措施（可选）"
                              />
                              <button
                                onClick={saveEditEvent}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingEventId("")}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div key={event.id} className="group px-5 py-3 hover:bg-gray-50/60 transition-colors">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="text-[10px] text-gray-400 shrink-0">{event.date}</span>
                                <span className="text-xs font-semibold text-gray-800 truncate">
                                  {event.reason}
                                </span>
                                {event.note && (
                                  <span className="text-xs text-gray-400 truncate">· {event.note}</span>
                                )}
                                <span className="text-[10px] text-gray-400 shrink-0">
                                  {event.responsibleStudentNames?.length
                                    ? event.responsibleStudentNames.join("、")
                                    : event.responsibleStudentName || "宿舍"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-sm font-bold ${scoreClass(event.score)}`}>
                                  {formatSigned(event.score)}
                                </span>
                                <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button
                                    onClick={() =>
                                      startEditEvent(event.id, event.reason, event.score, event.note, event.punishment || "")
                                    }
                                    className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => onDeleteDormitoryEvent(selectedDormitory.id, event.id)}
                                    className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </span>
                              </div>
                            </div>
                            {event.punishment && (
                              <label
                                className={`mt-2 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                                  event.punishmentDone
                                    ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                                    : "border-amber-100 bg-amber-50 text-amber-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(event.punishmentDone)}
                                  onChange={() =>
                                    onUpdateDormitoryEvent(selectedDormitory.id, event.id, {
                                      punishmentDone: !event.punishmentDone,
                                    })
                                  }
                                  className="accent-emerald-600"
                                />
                                <span className="font-semibold">处罚</span>
                                <span
                                  className={`min-w-0 flex-1 truncate ${
                                    event.punishmentDone ? "line-through opacity-70" : ""
                                  }`}
                                >
                                  {event.punishment}
                                </span>
                                <span className="shrink-0 font-semibold">
                                  {event.punishmentDone ? "已执行" : "待执行"}
                                </span>
                              </label>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* 历史归档 */}
                {selectedDormitory.history.length > 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <button
                      onClick={() => setHistoryOpen(v => !v)}
                      className="flex w-full items-center justify-between px-5 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <h3 className="text-sm font-bold text-gray-700">周期历史</h3>
                      <div className="flex items-center gap-1 text-xs text-gray-500">
                        <History className="h-3.5 w-3.5" />
                        {historyOpen ? "收起" : `展开 ${selectedDormitory.history.length} 个周期`}
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>
                    {historyOpen && (
                      <div className="divide-y divide-gray-50">
                        {selectedDormitory.history.map(archive => (
                          <div
                            key={archive.id}
                            className="px-5 py-2.5 flex items-center justify-between text-sm"
                          >
                            <span className="text-gray-700">{archive.label}</span>
                            <span className="text-xs text-gray-400">
                              {archive.events.length} 个事件 · 最终 {formatSigned(archive.finalScore)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400 text-sm">
              请先选择或创建一个宿舍
            </div>
          )}
        </main>

        {/* 右侧：成员 */}
        <aside className="flex flex-col min-h-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">成员</h3>
            <span className="text-xs text-gray-400">{memberStudents.length} 人</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {memberStudents.map(student => (
                <span
                  key={student.id}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 py-0.5 pl-2.5 pr-1 text-xs font-semibold text-blue-700"
                >
                  <button onClick={() => onSelectStudent(student)} className="hover:underline">
                    {student.name}
                  </button>
                  <button
                    onClick={() => onAssignStudentDormitory(student.id, undefined)}
                    className="grid h-3.5 w-3.5 place-items-center rounded-full text-blue-300 hover:bg-red-100 hover:text-red-500"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              {memberStudents.length === 0 && (
                <span className="text-xs text-gray-400">暂无成员</span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                value={memberSearch}
                onChange={event => setMemberSearch(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-7 pr-2 text-sm outline-none focus:border-blue-300"
                placeholder="搜索并加入学生"
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-100">
              {assignableStudents.map(student => (
                <button
                  key={student.id}
                  onClick={() => onAssignStudentDormitory(student.id, selectedDormitory?.id)}
                  className="flex w-full items-center justify-between border-b border-gray-50 px-3 py-2 text-left text-sm last:border-0 hover:bg-blue-50"
                >
                  <span className="text-gray-700">{student.name}</span>
                  <span className="text-xs text-gray-400">
                    {student.dormitoryId ? "转入" : "加入"}
                  </span>
                </button>
              ))}
              {assignableStudents.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-gray-400">无可加入学生</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
