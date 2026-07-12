import { useState, useMemo, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  History,
  Pencil,
  Plus,
  ListPlus,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import { DORM_EVENT_PRESETS } from "../state/dormitoryActions";
import type { NewDormEventInput } from "../state/dormitoryActions";
import type { AppStudent, DormEvent, Dormitory, FollowupTask, StudentId } from "../state/types";
import type { FollowupTaskDraft } from "./FollowupTaskDrawer";
import { animateSelectionTransfer } from "./selectionMotion";
import { DormitoryListPanel } from "./DormitoryListPanel";
import { DormitoryMembersPanel } from "./DormitoryMembersPanel";
import { ConfirmDialog, DatePicker, useAppDialog } from "./ui";

function scoreClass(value: number): string {
  return value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-gray-500";
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

interface PresetEvent {
  label: string;
}

interface PresetDraft {
  originalLabel: string;
  label: string;
  score: number;
}

interface Props {
  students: AppStudent[];
  dormitories: Dormitory[];
  onCreateDormitory: (name: string, baseScore: number) => Dormitory;
  onUpdateDormitory: (dormitoryId: string, patch: Partial<Pick<Dormitory, "name" | "baseScore">>) => void;
  onDeleteDormitory: (dormitoryId: string) => void;
  onAssignStudentDormitory: (studentId: StudentId, dormitoryId?: string) => void;
  onAddDormitoryEvent: (input: NewDormEventInput) => DormEvent | null;
  onUpdateDormitoryEvent: (dormId: string, eventId: string, patch: { reason?: string; score?: number; note?: string; punishment?: string; punishmentDone?: boolean; followupTaskIds?: string[] }) => void;
  onDeleteDormitoryEvent: (dormId: string, eventId: string) => void;
  onCloseDormitoryPeriod: (dormId: string, options?: { carryOver?: boolean }) => void;
  onCloseAllDormitoryPeriods: (options?: { carryOver?: boolean }) => void;
  onSelectStudent: (student: AppStudent) => void;
  followupTasks: FollowupTask[];
  onRequestFollowupTask: (draft: FollowupTaskDraft, afterSave?: (taskIds: string[]) => void) => void;
  onSetLinkedTaskStatus: (taskIds: string[], status: "completed" | "cancelled") => void;
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
  followupTasks,
  onRequestFollowupTask,
  onSetLinkedTaskStatus,
}: Props) {
  const appDialog = useAppDialog();
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
  const [createFollowup, setCreateFollowup] = useState(false);
  const [followupDueDate, setFollowupDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  // 可变预设事件列表 + 自定义输入
  const [presets, setPresets] = useState<PresetEvent[]>(() => {
    try {
      const saved = localStorage.getItem("dorm-presets");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DORM_EVENT_PRESETS.map(p => ({ label: p.label }));
  });
  const [customLabel, setCustomLabel] = useState("");
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<PresetDraft[]>([]);
  const [pendingDeletePreset, setPendingDeletePreset] = useState("");
  const [pendingDeleteDormitory, setPendingDeleteDormitory] = useState<Dormitory | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<DormEvent | null>(null);

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
  const memberListRef = useRef<HTMLDivElement>(null);
  const memberCandidatesRef = useRef<HTMLDivElement>(null);
  const responsibleSelectedRef = useRef<HTMLDivElement>(null);
  const responsibleCandidatesRef = useRef<HTMLDivElement>(null);

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
    if (reason === label) {
      setReason("");
      return;
    }
    setReason(label);
    const defaultScore = DORM_EVENT_PRESETS.find(preset => preset.label === label)?.score ?? 0;
    setScore(scoreMemory[label] ?? defaultScore);
  }

  function addCustomPresetDraft() {
    const label = customLabel.trim();
    if (!label) return;
    if (presetDrafts.some(preset => preset.label.trim() === label)) return;
    setPresetDrafts(previous => [...previous, { originalLabel: label, label, score: 0 }]);
    setCustomLabel("");
  }

  function openPresetManager() {
    setPresetDrafts(presets.map(preset => ({
      originalLabel: preset.label,
      label: preset.label,
      score: scoreMemory[preset.label] ?? DORM_EVENT_PRESETS.find(item => item.label === preset.label)?.score ?? 0,
    })));
    setCustomLabel("");
    setPendingDeletePreset("");
    setPresetManagerOpen(true);
  }

  function savePresetManager() {
    const normalized = presetDrafts
      .map(preset => ({ ...preset, label: preset.label.trim() }))
      .filter((preset, index, list) => preset.label && list.findIndex(item => item.label === preset.label) === index);
    const nextMemory: Record<string, number> = {};
    normalized.forEach(preset => { nextMemory[preset.label] = preset.score; });
    setPresets(normalized.map(preset => ({ label: preset.label })));
    setScoreMemory(nextMemory);
    const selectedDraft = normalized.find(preset => preset.originalLabel === reason);
    if (reason && !selectedDraft) {
      setReason("");
    } else if (selectedDraft) {
      setReason(selectedDraft.label);
      setScore(selectedDraft.score);
    }
    setPresetManagerOpen(false);
    setPendingDeletePreset("");
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

  function addMemberWithAnimation(event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent) {
    animateSelectionTransfer({
      itemId: student.id,
      itemName: student.name,
      sourceElement: event.currentTarget,
      sourceContainer: memberCandidatesRef.current,
      targetContainer: memberListRef.current,
      commit: () => onAssignStudentDormitory(student.id, selectedDormitory?.id),
    });
  }

  function selectResponsibleWithAnimation(event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent, selected: boolean) {
    const selectedElement = responsibleSelectedRef.current
      ? Array.from(responsibleSelectedRef.current.querySelectorAll<HTMLElement>("[data-selection-motion-id]")).find(element => element.dataset.selectionMotionId === student.id)
      : null;
    animateSelectionTransfer({
      itemId: student.id,
      itemName: student.name,
      sourceElement: selected ? selectedElement || event.currentTarget : event.currentTarget,
      sourceContainer: selected ? responsibleSelectedRef.current : responsibleCandidatesRef.current,
      targetContainer: selected ? responsibleCandidatesRef.current : responsibleSelectedRef.current,
      commit: () => toggleResponsible(student.id),
      tone: "indigo",
    });
  }

  function removeMemberWithAnimation(event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent) {
    const card = event.currentTarget.closest<HTMLElement>("[data-selection-motion-id]") || event.currentTarget;
    animateSelectionTransfer({
      itemId: student.id,
      itemName: student.name,
      sourceElement: card,
      sourceContainer: memberListRef.current,
      targetContainer: memberCandidatesRef.current,
      commit: () => onAssignStudentDormitory(student.id, undefined),
    });
  }

  function removeResponsibleWithAnimation(event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent) {
    const chip = event.currentTarget.closest<HTMLElement>("[data-selection-motion-id]") || event.currentTarget;
    animateSelectionTransfer({
      itemId: student.id,
      itemName: student.name,
      sourceElement: chip,
      sourceContainer: responsibleSelectedRef.current,
      targetContainer: responsibleCandidatesRef.current,
      commit: () => toggleResponsible(student.id),
      tone: "indigo",
    });
  }

  function submitEvent() {
    if (!selectedDormitory || !reason.trim()) return;
    // 记住这次设定的分数
    setScoreMemory(prev => ({ ...prev, [reason.trim()]: score }));
    const savedEvent = onAddDormitoryEvent({
      dormId: selectedDormitory.id,
      reason,
      score,
      note,
      punishment,
      responsibleStudentIds: responsibleIds.length > 0 ? responsibleIds : undefined,
      recordToStudent: responsibleIds.length > 0 ? recordToStudent : false,
    });
    if (savedEvent && createFollowup && punishment.trim() && responsibleIds.length) {
      const studentId = responsibleIds[0];
      onRequestFollowupTask({ studentId, studentIds: responsibleIds, title: `宿舍处理：${punishment.trim()}`, description: `${selectedDormitory.name} · ${reason.trim()}${note.trim() ? ` · ${note.trim()}` : ""}`, plannedDate: new Date().toISOString().slice(0, 10), dueDate: followupDueDate, type: "行为处理", source: "dormitory", sourceRef: { domain: "dormitory", entityId: savedEvent.id } }, taskIds => onUpdateDormitoryEvent(selectedDormitory.id, savedEvent.id, { followupTaskIds: taskIds }));
    }
    setNote("");
    setPunishment("");
    setCreateFollowup(false);
  }

  async function togglePunishment(event: DormEvent) {
    const nextDone = !event.punishmentDone;
    const pendingIds = (event.followupTaskIds || []).filter(id => followupTasks.some(task => task.id === id && task.status === "pending"));
    onUpdateDormitoryEvent(event.dormId, event.id, { punishmentDone: nextDone });
    if (nextDone && pendingIds.length && await appDialog.confirm({ title: "同步完成关联任务？", description: `处罚已标记完成。是否同时将关联的 ${pendingIds.length} 项待处理任务标记为已完成？`, confirmLabel: "同步完成任务", variant: "primary" })) onSetLinkedTaskStatus(pendingIds, "completed");
  }

  function deleteEvent(event: DormEvent) {
    setPendingDeleteEvent(event);
  }

  function confirmDeleteEvent(cancelLinkedTasks: boolean) {
    const event = pendingDeleteEvent;
    if (!event) return;
    const pendingIds = (event.followupTaskIds || []).filter(id => followupTasks.some(task => task.id === id && task.status === "pending"));
    if (cancelLinkedTasks && pendingIds.length) onSetLinkedTaskStatus(pendingIds, "cancelled");
    onDeleteDormitoryEvent(event.dormId, event.id);
    setPendingDeleteEvent(null);
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
        <DormitoryListPanel
          newName={newName}
          setNewName={setNewName}
          newBaseScore={newBaseScore}
          setNewBaseScore={setNewBaseScore}
          createDormitory={createDormitory}
          activeDormIndex={activeDormIndex}
          sortedDormitories={sortedDormitories}
          selectedDormitory={selectedDormitory}
          selectDorm={selectDorm}
          dormitories={dormitories}
          students={students}
          carryOver={carryOver}
          setCarryOver={setCarryOver}
          hasPendingEvents={hasPendingEvents}
          onCloseAllDormitoryPeriods={onCloseAllDormitoryPeriods}
        />

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
                      onClick={() => setPendingDeleteDormitory(selectedDormitory)}
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
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-bold text-gray-800">记录宿舍事件</div>
                      <div className="mt-0.5 text-[11px] text-gray-400">先选择事件类型，再补充得分与相关信息</div>
                    </div>
                    <button
                      type="button"
                      onClick={openPresetManager}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-semibold text-gray-500 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      管理类型
                    </button>
                  </div>
                  {/* 预设事件卡片：删除与改名统一放到管理窗口，避免误触。 */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {presets.map(preset => {
                      const active = reason === preset.label;
                      const memScore = scoreMemory[preset.label] ?? DORM_EVENT_PRESETS.find(item => item.label === preset.label)?.score ?? 0;
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          aria-pressed={active}
                          onClick={() => selectPreset(preset.label)}
                          className={`group flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-200 active:scale-[.98] ${
                            active
                              ? "border-blue-300 bg-blue-50 shadow-[0_6px_18px_rgba(37,99,235,0.10)]"
                              : "border-gray-200 bg-white hover:-translate-y-px hover:border-blue-200 hover:bg-blue-50/40"
                          }`}
                        >
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold transition-colors ${
                            active
                              ? "bg-blue-600 text-white"
                              : memScore > 0
                                ? "bg-emerald-50 text-emerald-600"
                                : memScore < 0
                                  ? "bg-amber-50 text-amber-600"
                                  : "bg-gray-100 text-gray-500"
                          }`}>
                            {memScore > 0 ? `+${memScore}` : memScore}
                          </span>
                          <span className="min-w-0">
                            <span className={`block truncate text-xs font-bold ${active ? "text-blue-700" : "text-gray-700"}`}>{preset.label}</span>
                            <span className={`mt-0.5 block text-[10px] ${active ? "text-blue-500" : "text-gray-400"}`}>{active ? "已选择，再点可收起" : "点击记录"}</span>
                          </span>
                          {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-blue-600" />}
                        </button>
                      );
                    })}
                  </div>

                  {/* 分数 + 责任人 + 备注 + 处罚：保留 DOM，利用 grid rows 平滑展开与收起。 */}
                  <div className="dorm-event-form-reveal" data-open={Boolean(reason)} aria-hidden={!reason}>
                    <div className="dorm-event-form-reveal__inner">
                    <div className="space-y-4 pt-4">
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
                      {punishment.trim() && <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3"><label className={`flex items-center gap-2 text-sm font-semibold ${responsibleIds.length ? "text-violet-700" : "text-gray-400"}`}><input type="checkbox" checked={createFollowup && responsibleIds.length > 0} disabled={!responsibleIds.length} onChange={event => setCreateFollowup(event.target.checked)} className="accent-violet-600"/><ListPlus className="h-4 w-4"/>同时为责任人创建跟进任务</label>{createFollowup && responsibleIds.length > 0 && <div className="mt-2 flex items-center gap-2 text-xs text-violet-600"><span>截止日期</span><DatePicker value={followupDueDate} onChange={setFollowupDueDate} ariaLabel="宿舍跟进截止日期" className="w-44 border-violet-100"/></div>} {!responsibleIds.length && <p className="mt-1 text-xs text-gray-400">选择责任人后才能关联任务。</p>}</div>}

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
                          {/* 已选责任人：同时作为名字飞入的落点 */}
                          <div ref={responsibleSelectedRef} className="mb-2 flex min-h-8 flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-indigo-100 bg-indigo-50/40 px-2 py-1.5">
                            {selectedResponsibleStudents.length > 0 ? selectedResponsibleStudents.map(student => (
                              <span
                                key={student.id}
                                data-selection-motion-id={student.id}
                                className="dorm-member-enter inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-white py-1 pl-2.5 pr-1 text-xs font-semibold text-indigo-700 shadow-sm"
                              >
                                {student.name}
                                <button
                                  type="button"
                                  onClick={event => removeResponsibleWithAnimation(event, student)}
                                  className="grid h-4 w-4 place-items-center rounded-full text-indigo-300 hover:bg-red-100 hover:text-red-500"
                                  title={`取消选择 ${student.name}`}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            )) : (
                              <span className="text-[11px] text-indigo-300">点击下方成员，添加责任人</span>
                            )}
                          </div>
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
                          <div ref={responsibleCandidatesRef} className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-gray-100 bg-white py-1">
                            {filteredMembers.length === 0 ? (
                              <div className="py-3 text-center text-xs text-gray-400">无匹配成员</div>
                            ) : (
                              filteredMembers.map(student => {
                                const selected = responsibleIds.includes(student.id);
                                return (
                                  <button
                                    key={student.id}
                                    data-selection-motion-id={student.id}
                                    type="button"
                                    onClick={event => selectResponsibleWithAnimation(event, student, selected)}
                                    className={`group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-[background-color,color,transform] duration-200 hover:bg-indigo-50 active:scale-[.99] ${
                                      selected ? "bg-blue-50 text-blue-600" : "text-gray-700"
                                    }`}
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${student.gender === "男" ? "bg-blue-50 text-blue-500" : student.gender === "女" ? "bg-pink-50 text-pink-500" : "bg-gray-100 text-gray-500"}`}>
                                        {student.name.slice(0, 1)}
                                      </span>
                                      <span className="truncate font-semibold">{student.name}</span>
                                    </span>
                                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0 text-indigo-300 transition-transform group-hover:scale-110" />}
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
                    </div>
                  </div>
                </div>

                {/* 事件列表 */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                    <h3 className="text-sm font-bold text-gray-700">事件记录</h3>
                    <button
                      onClick={async () => {
                        if (await appDialog.confirm({ title: "结算当前宿舍周期？", description: `将结算“${selectedDormitory.name}”当前周期${carryOver ? "，并把分数结转到下一周期" : "，下一周期分数归零"}。已记录事件会归档。`, confirmLabel: "确认结算", variant: "primary" })) onCloseDormitoryPeriod(selectedDormitory.id, { carryOver });
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
                                    onClick={() => deleteEvent(event)}
                                    className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </span>
                              </div>
                            </div>
                            {event.punishment && (
                              <div
                                className={`mt-2 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                                  event.punishmentDone
                                    ? "border-emerald-100 bg-emerald-50 text-emerald-600"
                                    : "border-amber-100 bg-amber-50 text-amber-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(event.punishmentDone)}
                                  onChange={() => togglePunishment(event)}
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
                                {!event.punishmentDone && (event.responsibleStudentIds?.length || event.responsibleStudentId) && <button type="button" onClick={() => { const ids = event.responsibleStudentIds ?? (event.responsibleStudentId ? [event.responsibleStudentId] : []); const studentId = ids[0]; const linked = followupTasks.find(task => task.studentId === studentId && task.status === "pending" && task.sourceRef?.domain === "dormitory" && task.sourceRef.entityId === event.id); onRequestFollowupTask(linked ? { id: linked.id, studentId: linked.studentId, title: linked.title, type: linked.type, description: linked.description, plannedDate: linked.plannedDate, dueDate: linked.dueDate, source: linked.source, sourceRef: linked.sourceRef } : { studentId, studentIds: ids, title: `宿舍处理：${event.punishment}`, description: `${selectedDormitory.name} · ${event.reason}`, plannedDate: new Date().toISOString().slice(0,10), dueDate: new Date().toISOString().slice(0,10), type: "行为处理", source: "dormitory", sourceRef: { domain: "dormitory", entityId: event.id } }, taskIds => onUpdateDormitoryEvent(selectedDormitory.id, event.id, { followupTaskIds: Array.from(new Set([...(event.followupTaskIds || []), ...taskIds])) })); }} className="ml-1 rounded-lg bg-white px-2 py-1 font-bold text-violet-600 shadow-sm hover:bg-violet-50"><ListPlus className="mr-1 inline h-3 w-3"/>{event.followupTaskIds?.length ? "查看任务" : "转为任务"}</button>}
                              </div>
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

        <DormitoryMembersPanel
          memberListRef={memberListRef}
          memberStudents={memberStudents}
          onSelectStudent={onSelectStudent}
          removeMemberWithAnimation={removeMemberWithAnimation}
          memberSearch={memberSearch}
          setMemberSearch={setMemberSearch}
          memberCandidatesRef={memberCandidatesRef}
          assignableStudents={assignableStudents}
          addMemberWithAnimation={addMemberWithAnimation}
        />
      </div>

      {presetManagerOpen && (
        <div
          className="soft-backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/35 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-label="管理宿舍事件类型"
          onMouseDown={event => {
            if (event.currentTarget === event.target) {
              setPresetManagerOpen(false);
              setPendingDeletePreset("");
            }
          }}
        >
          <div className="modal-panel-enter flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-gray-900">管理事件类型</h3>
                <p className="mt-1 text-xs text-gray-400">在这里统一改名、设置默认分数或删除，避免在记录时误触。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPresetManagerOpen(false);
                  setPendingDeletePreset("");
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                aria-label="关闭管理事件类型窗口"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-gray-50/60 p-4">
              {presetDrafts.map((preset, index) => {
                const deletePending = pendingDeletePreset === preset.originalLabel;
                return (
                  <div key={`${preset.originalLabel}-${index}`} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center gap-2 p-3">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold ${preset.score > 0 ? "bg-emerald-50 text-emerald-600" : preset.score < 0 ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500"}`}>
                        {preset.score > 0 ? `+${preset.score}` : preset.score}
                      </span>
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">事件类型名称</span>
                        <input
                          value={preset.label}
                          onChange={event => setPresetDrafts(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
                          className="w-full rounded-lg border border-transparent bg-gray-50 px-2.5 py-1.5 text-sm font-semibold text-gray-700 outline-none transition-colors focus:border-blue-200 focus:bg-white"
                        />
                      </label>
                      <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-gray-400">
                        默认分
                        <input
                          type="number"
                          value={preset.score}
                          onChange={event => setPresetDrafts(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, score: Number(event.target.value) || 0 } : item))}
                          className="w-14 rounded-lg border border-gray-200 bg-white px-1.5 py-1.5 text-center text-sm font-semibold text-gray-700 outline-none focus:border-blue-300"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setPendingDeletePreset(deletePending ? "" : preset.originalLabel)}
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${deletePending ? "bg-red-50 text-red-500" : "text-gray-300 hover:bg-red-50 hover:text-red-500"}`}
                        aria-label={`删除事件类型 ${preset.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {presetDrafts.length === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-6 text-center text-xs text-gray-400">暂无事件类型，可在下方新增</div>
              )}
            </div>

            <div className="border-t border-gray-100 bg-white p-4">
              <div className="mb-3 flex gap-2">
                <input
                  value={customLabel}
                  onChange={event => setCustomLabel(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter") addCustomPresetDraft(); }}
                  className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-300 focus:bg-white"
                  placeholder="新增事件类型名称"
                />
                <button
                  type="button"
                  onClick={addCustomPresetDraft}
                  disabled={!customLabel.trim() || presetDrafts.some(preset => preset.label.trim() === customLabel.trim())}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-600 hover:bg-blue-100 disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPresetManagerOpen(false)} className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50">取消</button>
                <button
                  type="button"
                  onClick={savePresetManager}
                  disabled={presetDrafts.some((preset, index, list) => !preset.label.trim() || list.findIndex(item => item.label.trim() === preset.label.trim()) !== index)}
                  className="flex-[2] rounded-xl bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  保存类型设置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog open={Boolean(pendingDeleteDormitory)} title="删除这个宿舍？" description={`将删除“${pendingDeleteDormitory?.name || "当前宿舍"}”及本周期 ${pendingDeleteDormitory?.events.length || 0} 条事件，${pendingDeleteDormitory?.memberIds.length || 0} 名成员会变为未分配宿舍。此操作无法撤销。`} confirmLabel="确认删除宿舍" onCancel={() => setPendingDeleteDormitory(null)} onConfirm={() => { if (!pendingDeleteDormitory) return; onDeleteDormitory(pendingDeleteDormitory.id); setPendingDeleteDormitory(null); }} />
      <ConfirmDialog open={Boolean(pendingDeleteEvent)} title="删除这条宿舍事件？" description={`将删除“${pendingDeleteEvent?.reason || "当前事件"}”。已完成的关联任务会保留；未完成任务可选择保留或同时取消。`} confirmLabel={(pendingDeleteEvent?.followupTaskIds || []).some(id => followupTasks.some(task => task.id === id && task.status === "pending")) ? "删除并取消未完成任务" : "确认删除事件"} alternateLabel={(pendingDeleteEvent?.followupTaskIds || []).some(id => followupTasks.some(task => task.id === id && task.status === "pending")) ? "删除但保留任务" : undefined} onCancel={() => setPendingDeleteEvent(null)} onAlternate={() => confirmDeleteEvent(false)} onConfirm={() => confirmDeleteEvent(true)} />
      <ConfirmDialog open={Boolean(pendingDeletePreset)} title="删除这个事件类型？" description={`将从预设中移除“${presetDrafts.find(item => item.originalLabel === pendingDeletePreset)?.label || "当前类型"}”，保存类型设置后生效。`} confirmLabel="确认删除类型" onCancel={() => setPendingDeletePreset("")} onConfirm={() => { setPresetDrafts(previous => previous.filter(item => item.originalLabel !== pendingDeletePreset)); setPendingDeletePreset(""); }} />
      {appDialog.dialog}
    </div>
  );
}
