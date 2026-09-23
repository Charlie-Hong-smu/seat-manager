import type { ClassDutiesBinding } from "../state/classDuties";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { isValidDateKey } from "../state/dateKey";
import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { findMatchingFollowupTask } from "../state/dailyManagement";
import { getFollowupStudentIds } from "../state/followupStudents";
import { useState, useMemo, useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";

import { useInitialTargetEffect } from "../hooks/useInitialTargetEffect";
import {
  Check,
  ChevronDown,
  Pencil,
  Plus,
  ListPlus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";

import { DORM_EVENT_PRESETS } from "../state/dormitoryActions";
import type { NewDormEventInput } from "../state/dormitoryActions";
import { resolveDormitoryPreferences, type DormitoryPreferences } from "../state/dormitoryPreferences";
import { matchesStudentSearch } from "../state/studentSearch";
import { resolveReferencedStudentNames } from "../state/studentReferences";
import { createActivityEvent } from "../state/activityEvents";
import { calculateDormitoryPeriodScore, filterDormitoryEventsByRange, getDormitoryPeriodRange, localDateKey, shiftDormitoryPeriod } from "../state/dormitoryPeriods";
import type { ActivityEvent, AppStudent, DormEvent, Dormitory, DormitoryPeriodMode, DormitoryPeriodSettings, FollowupTask, StudentId } from "../state/types";
import type { FollowupTaskDraft } from "./FollowupTaskDrawer";
import type { TimelineTarget } from "../state/dataInsights";
import { animateSelectionTransfer } from "./selectionMotion";
import { DormitoryListPanel } from "./DormitoryListPanel";
import { DormitoryMembersPanel } from "./DormitoryMembersPanel";
import { DormitoryPeriodToolbar } from "./DormitoryPeriodToolbar";
import { MobilePaneTabs, MotionCollapse, ConfirmDialog, DatePicker, DialogPresence, IconButton, runViewTransition, useActionToast, useAppDialog, useModalFocus } from "./ui";

function scoreClass(value: number): string {
  return value > 0 ? "text-status-success-600" : value < 0 ? "text-status-danger-500" : "text-text-secondary";
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
  classDuties?: ClassDutiesBinding;
  students: AppStudent[];
  dormitories: Dormitory[];
  onCreateDormitory: (name: string, baseScore: number) => Dormitory;
  onRenameDormitory: (dormitoryId: string, name: string) => void;
  onDeleteDormitory: (dormitoryId: string) => () => void;
  onAssignStudentDormitory: (studentId: StudentId, dormitoryId?: string) => void;
  onAddDormitoryEvent: (input: NewDormEventInput) => DormEvent | null;
  onUpdateDormitoryEvent: (dormId: string, eventId: string, patch: { reason?: string; score?: number; note?: string; punishment?: string; punishmentDone?: boolean; followupTaskIds?: string[]; date?: string }) => void;
  onDeleteDormitoryEvent: (dormId: string, eventId: string) => () => void;
  onSelectStudent: (student: AppStudent) => void;
  followupTasks: FollowupTask[];
  onRequestFollowupTask: (draft: FollowupTaskDraft, afterSave?: (taskIds: string[]) => void | (() => void)) => void;
  onActivity?: (event: ActivityEvent) => void | (() => void);
  onSetLinkedTaskStatus: (taskIds: string[], status: "pending" | "completed" | "cancelled") => void | (() => void);
  periodSettings: DormitoryPeriodSettings;
  onPeriodSettingsChange: (settings: DormitoryPeriodSettings) => void;
  preferences: unknown;
  onPreferencesChange: (preferences: DormitoryPreferences) => void;
  initialTarget?: TimelineTarget;
  onInitialTargetConsumed?: () => void;
}

export function DormitoryWorkspace({
  classDuties,
  students,
  dormitories,
  onCreateDormitory,
  onRenameDormitory,
  onDeleteDormitory,
  onAssignStudentDormitory,
  onAddDormitoryEvent,
  onUpdateDormitoryEvent,
  onDeleteDormitoryEvent,
  onSelectStudent,
  followupTasks,
  onRequestFollowupTask,
  onActivity,
  onSetLinkedTaskStatus,
  periodSettings,
  onPeriodSettingsChange,
  preferences,
  onPreferencesChange,
  initialTarget,
  onInitialTargetConsumed,
}: Props) {
  const appDialog = useAppDialog();
  const actionToast = useActionToast();
  const [selectedDormId, setSelectedDormId] = useState(dormitories[0]?.id || "");
  const [renamingDormId, setRenamingDormId] = useState("");
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState("");
  const isMobile = useMediaQuery("(max-width: 767px), (max-height: 500px) and (pointer: coarse)");
  const [mobilePane, setMobilePane] = useState<"list" | "events" | "members">("list");
  const [newName, setNewName] = useWorkspaceDraftState("dormitory:new:newName", "");
  const [memberSearch, setMemberSearch] = useState("");
  const [editingEventId, setEditingEventId] = useState("");
  const editingSource = dormitories.flatMap(dorm => [...dorm.events, ...dorm.history.flatMap(history => history.events)]).find(event => event.id === editingEventId);
  const [editReason, setEditReason, cleareditReason] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:reason`, editingSource?.reason ?? "");
  const [editScore, setEditScore, cleareditScore] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:score`, editingSource?.score ?? 0);
  const [editNote, setEditNote, cleareditNote] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:note`, editingSource?.note ?? "");
  const [editPunishment, setEditPunishment, cleareditPunishment] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:punishment`, editingSource?.punishment ?? "");
  const [editDate, setEditDate, cleareditDate] = useWorkspaceDraftState(`dormitory:edit:${editingEventId}:date`, editingSource?.date ?? localDateKey());
  const [eventDate, setEventDate] = useWorkspaceDraftState(`dormitory:new:eventDate:${selectedDormId}`, localDateKey());
  const [periodMode, setPeriodMode] = useState<DormitoryPeriodMode>("week");
  const [periodAnchor, setPeriodAnchor] = useState(localDateKey());
  const [focusedEventId, setFocusedEventId] = useState("");

  // 事件录入表单 state
  const [reason, setReason] = useWorkspaceDraftState(`dormitory:new:reason:${selectedDormId}`, "");
  const [score, setScore] = useWorkspaceDraftState(`dormitory:new:score:${selectedDormId}`, 0);
  const [note, setNote] = useWorkspaceDraftState(`dormitory:new:note:${selectedDormId}`, "");
  const [punishment, setPunishment] = useWorkspaceDraftState(`dormitory:new:punishment:${selectedDormId}`, "");
  const [responsibleIds, setResponsibleIds] = useWorkspaceDraftState<string[]>(`dormitory:new:responsibleIds:${selectedDormId}`, []);
  const [showResponsible, setShowResponsible] = useState(false);
  const [responsibleSearch, setResponsibleSearch] = useState("");
  const [recordToStudent, setRecordToStudent] = useWorkspaceDraftState(`dormitory:new:recordToStudent:${selectedDormId}`, true);
  const [createFollowup, setCreateFollowup] = useWorkspaceDraftState(`dormitory:new:createFollowup:${selectedDormId}`, false);
  const [followupDueDate, setFollowupDueDate] = useWorkspaceDraftState(`dormitory:new:followupDueDate:${selectedDormId}`, () => localDateKey());

  // 可变预设事件列表 + 自定义输入
  const initialPreferences = useMemo(
    () => resolveDormitoryPreferences(preferences, typeof window === "undefined" ? null : window.localStorage),
    [preferences],
  );
  const [presets, setPresets] = useState<PresetEvent[]>(initialPreferences.presets);
  const [customLabel, setCustomLabel] = useWorkspaceDraftState(`dormitory:new:customLabel:${selectedDormId}`, "");
  const [presetManagerOpen, setPresetManagerOpen] = useState(false);
  const [presetDrafts, setPresetDrafts] = useState<PresetDraft[]>([]);
  const [pendingDeletePreset, setPendingDeletePreset] = useState("");
  const [pendingDeleteDormitory, setPendingDeleteDormitory] = useState<Dormitory | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<DormEvent | null>(null);
  const presetManagerRef = useModalFocus(presetManagerOpen, () => setPresetManagerOpen(false));

  // 分数记忆：记录每个事件标签上次设定的分数
  const [scoreMemory, setScoreMemory] = useState<Record<string, number>>(initialPreferences.scoreMemory);

  // 切换动画 key
  const [animKey, setAnimKey] = useState(0);
  const mainRef = useRef<HTMLDivElement>(null);
  const memberListRef = useRef<HTMLDivElement>(null);
  const memberCandidatesRef = useRef<HTMLDivElement>(null);
  const responsibleSelectedRef = useRef<HTMLDivElement>(null);
  const responsibleCandidatesRef = useRef<HTMLDivElement>(null);

  const periodRange = getDormitoryPeriodRange(periodMode, periodAnchor, periodSettings);
  const periodScores = new Map(dormitories.map(dormitory => [dormitory.id, calculateDormitoryPeriodScore(dormitory, periodRange)]));
  const sortedDormitories = [...dormitories].sort((a, b) => (periodScores.get(b.id) || 0) - (periodScores.get(a.id) || 0) || a.name.localeCompare(b.name, "zh-Hans-CN"));
  const selectedDormitory = dormitories.find(dormitory => dormitory.id === selectedDormId) || sortedDormitories[0] || null;
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const memberStudents = useMemo(() => selectedDormitory ? selectedDormitory.memberIds.map(id => studentById.get(id)).filter((student): student is AppStudent => Boolean(student)) : [], [selectedDormitory, studentById]);
  const assignableStudents = useMemo(() => students
    .filter(student => !selectedDormitory || student.dormitoryId !== selectedDormitory.id)
    .filter(student => matchesStudentSearch(student, memberSearch))
    .slice(0, 16), [students, selectedDormitory, memberSearch]);
  const filteredMembers = useMemo(() => responsibleSearch.trim()
    ? memberStudents.filter(student => matchesStudentSearch(student, responsibleSearch))
    : memberStudents, [memberStudents, responsibleSearch]);
  const selectedResponsibleStudents = useMemo(() => responsibleIds
    .map(id => memberStudents.find(student => student.id === id))
    .filter((student): student is AppStudent => Boolean(student)), [responsibleIds, memberStudents]);
  const selectedPeriodEvents = useMemo(() => selectedDormitory ? filterDormitoryEventsByRange(selectedDormitory, periodRange) : [], [selectedDormitory, periodRange]);
  const selectedPeriodScore = selectedDormitory ? periodScores.get(selectedDormitory.id) || 0 : 0;

  const activeDormIndex = Math.max(0, sortedDormitories.findIndex(d => d.id === selectedDormitory?.id));

  useEffect(() => {
    if (!selectedDormitory && sortedDormitories[0]) {
      setSelectedDormId(sortedDormitories[0].id);
    }
  }, [selectedDormitory, sortedDormitories]);

  useInitialTargetEffect(initialTarget?.entityId, () => {
    const entityId = initialTarget?.entityId || "";
    const match = dormitories.flatMap(dormitory => [...dormitory.events, ...dormitory.history.flatMap(archive => archive.events)].map(event => ({ dormitory, event }))).find(item => item.event.id === entityId || item.dormitory.id === entityId);
    if (!match) return;
    setSelectedDormId(match.dormitory.id);
    if (match.event) setPeriodAnchor(match.event.date);
    setFocusedEventId(entityId);
    window.setTimeout(() => document.querySelector(`[data-dormitory-event-id="${CSS.escape(entityId)}"]`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }), 100);
  }, onInitialTargetConsumed);

  // 切换宿舍时重置编辑状态 + 触发主区域动画
  useEffect(() => {
    setEditingEventId("");
    setRenamingDormId("");
    setRenameError("");
    setAnimKey(k => k + 1);
  }, [selectedDormId]);

  // 每个班级/学期从切片 settings 读取；旧全局键只作为首次迁移源，不再写入。
  useEffect(() => {
    setPresets(initialPreferences.presets);
    setScoreMemory(initialPreferences.scoreMemory);
    if (!preferences || typeof preferences !== "object") onPreferencesChange(initialPreferences);
  }, [initialPreferences, onPreferencesChange, preferences]);

  function persistPreferences(nextPresets: PresetEvent[], nextScoreMemory: Record<string, number>) {
    onPreferencesChange({ version: 1, presets: nextPresets, scoreMemory: nextScoreMemory });
  }

  function selectDorm(id: string) {
    if (isMobile) setMobilePane("events");
    if (id !== selectedDormId) {
      runViewTransition(() => setSelectedDormId(id));
    }
  }

  function saveDormitoryName() {
    const name = renameDraft.trim();
    if (!renamingDormId) return;
    if (!name) { setRenameError("请输入宿舍名称"); return; }
    if (dormitories.some(dormitory => dormitory.id !== renamingDormId && dormitory.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setRenameError("已有同名宿舍");
      return;
    }
    const previousName = dormitories.find(dormitory => dormitory.id === renamingDormId)?.name;
    if (previousName && previousName !== name) {
      onRenameDormitory(renamingDormId, name);
      const dormitoryId = renamingDormId;
      actionToast.show({ message: `已将宿舍改名为“${name}”`, actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5" />, onAction: () => onRenameDormitory(dormitoryId, previousName), duration: 6000 });
    }
    setRenamingDormId("");
    setRenameError("");
  }

  function createDormitory() {
    const previousSelectedId = selectedDormitory?.id || "";
    runViewTransition(() => {
      const dormitory = onCreateDormitory(newName, 0);
      setSelectedDormId(dormitory.id);
      setNewName("");
      actionToast.show({
        message: "宿舍已创建",
        actionLabel: "撤销",
        actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
        onAction: () => runViewTransition(() => {
          onDeleteDormitory(dormitory.id);
          setSelectedDormId(previousSelectedId);
        }),
        duration: 6000,
      });
    });
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
    const previousPresets = presets;
    const previousMemory = scoreMemory;
    const previousReason = reason;
    const previousScore = score;
    const normalized = presetDrafts
      .map(preset => ({ ...preset, label: preset.label.trim() }))
      .filter((preset, index, list) => preset.label && list.findIndex(item => item.label === preset.label) === index);
    const nextMemory: Record<string, number> = {};
    normalized.forEach(preset => { nextMemory[preset.label] = preset.score; });
    const nextPresets = normalized.map(preset => ({ label: preset.label }));
    setPresets(nextPresets);
    setScoreMemory(nextMemory);
    persistPreferences(nextPresets, nextMemory);
    const selectedDraft = normalized.find(preset => preset.originalLabel === reason);
    if (reason && !selectedDraft) {
      setReason("");
    } else if (selectedDraft) {
      setReason(selectedDraft.label);
      setScore(selectedDraft.score);
    }
    setPresetManagerOpen(false);
    setPendingDeletePreset("");
    actionToast.show({
      message: "事件类型设置已保存",
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => {
        setPresets(previousPresets);
        setScoreMemory(previousMemory);
        persistPreferences(previousPresets, previousMemory);
        setReason(previousReason);
        setScore(previousScore);
      },
      duration: 6000,
    });
  }

  function startEditEvent(eventId: string, _reason: string, _score: number, _note: string, _punishment: string, _date: string) {
    setEditingEventId(eventId);
  }

  function saveEditEvent() {
    if (!selectedDormitory || !editingEventId || !isValidDateKey(editDate)) return;
    const previousEvent = selectedPeriodEvents.find(entry => entry.event.id === editingEventId)?.event;
    onUpdateDormitoryEvent(selectedDormitory.id, editingEventId, { reason: editReason, score: editScore, note: editNote, punishment: editPunishment, date: editDate });
    cleareditReason(); cleareditScore(); cleareditNote(); cleareditPunishment(); cleareditDate();
    const undoActivity = onActivity?.(createActivityEvent({ action: "updated", ref: { domain: "dormitory", entityId: editingEventId, studentId: previousEvent?.responsibleStudentIds?.[0] || previousEvent?.responsibleStudentId }, studentIds: previousEvent?.responsibleStudentIds || (previousEvent?.responsibleStudentId ? [previousEvent.responsibleStudentId] : []), title: `修改宿舍事件：${editReason}`, detail: `${selectedDormitory.name} · ${editScore > 0 ? "+" : ""}${editScore} 分` }));
    setEditingEventId("");
    actionToast.show({
      message: "宿舍事件修改已保存",
      actionLabel: previousEvent ? "撤销" : undefined,
      actionIcon: previousEvent ? <RotateCcw className="h-3.5 w-3.5" /> : undefined,
      onAction: previousEvent ? () => { onUpdateDormitoryEvent(selectedDormitory.id, previousEvent.id, { reason: previousEvent.reason, score: previousEvent.score, note: previousEvent.note, punishment: previousEvent.punishment || "", date: previousEvent.date }); if (typeof undoActivity === "function") undoActivity(); } : undefined,
      duration: 6000,
    });
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
      sourceElement: selected ? selectedElement || event.currentTarget : event.currentTarget,
      sourceContainer: selected ? responsibleSelectedRef.current : responsibleCandidatesRef.current,
      targetContainer: selected ? responsibleCandidatesRef.current : responsibleSelectedRef.current,
      commit: () => toggleResponsible(student.id),
    });
  }

  function removeMemberWithAnimation(event: ReactMouseEvent<HTMLButtonElement>, student: AppStudent) {
    const card = event.currentTarget.closest<HTMLElement>("[data-selection-motion-id]") || event.currentTarget;
    animateSelectionTransfer({
      itemId: student.id,
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
      sourceElement: chip,
      sourceContainer: responsibleSelectedRef.current,
      targetContainer: responsibleCandidatesRef.current,
      commit: () => toggleResponsible(student.id),
    });
  }

  function submitEvent() {
    if (!selectedDormitory || !reason.trim() || !isValidDateKey(eventDate)) return;
    // 记住这次设定的分数
    const nextScoreMemory = { ...scoreMemory, [reason.trim()]: score };
    setScoreMemory(nextScoreMemory);
    persistPreferences(presets, nextScoreMemory);
    const savedEvent = onAddDormitoryEvent({
      dormId: selectedDormitory.id,
      reason,
      score,
      note,
      punishment,
      responsibleStudentIds: responsibleIds.length > 0 ? responsibleIds : undefined,
      recordToStudent: responsibleIds.length > 0 ? recordToStudent : false,
      date: eventDate,
    });
    if (!savedEvent) return;
    const undoActivity = onActivity?.(createActivityEvent({ action: "created", ref: { domain: "dormitory", entityId: savedEvent.id, studentId: savedEvent.responsibleStudentIds?.[0] || savedEvent.responsibleStudentId }, studentIds: savedEvent.responsibleStudentIds || (savedEvent.responsibleStudentId ? [savedEvent.responsibleStudentId] : []), title: `新增宿舍事件：${savedEvent.reason}`, detail: `${selectedDormitory.name} · ${savedEvent.score > 0 ? "+" : ""}${savedEvent.score} 分` }));
    if (createFollowup && punishment.trim() && responsibleIds.length) {
      const studentId = responsibleIds[0];
      onRequestFollowupTask({ studentId, studentIds: responsibleIds, title: `宿舍处理：${punishment.trim()}`, description: `${selectedDormitory.name} · ${reason.trim()}${note.trim() ? ` · ${note.trim()}` : ""}`, plannedDate: localDateKey(), dueDate: followupDueDate, type: "行为处理", source: "dormitory", sourceRef: { domain: "dormitory", entityId: savedEvent.id } }, taskIds => { onUpdateDormitoryEvent(selectedDormitory.id, savedEvent.id, { followupTaskIds: taskIds }); return () => onUpdateDormitoryEvent(selectedDormitory.id, savedEvent.id, { followupTaskIds: savedEvent.followupTaskIds || [] }); });
    }
    resetForm();
    actionToast.show({
      message: "宿舍事件已保存",
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => { onDeleteDormitoryEvent(savedEvent.dormId, savedEvent.id); if (typeof undoActivity === "function") undoActivity(); },
      duration: 6000,
    });
  }

  async function togglePunishment(event: DormEvent) {
    const nextDone = !event.punishmentDone;
    const pendingIds = (event.followupTaskIds || []).filter(id => followupTasks.some(task => task.id === id && task.status === "pending"));
    onUpdateDormitoryEvent(event.dormId, event.id, { punishmentDone: nextDone });
    let undoLinkedTasks: void | (() => void);
    if (nextDone && pendingIds.length && await appDialog.confirm({ title: "同步完成关联任务？", description: `处罚已标记完成。是否同时将关联的 ${pendingIds.length} 项待处理任务标记为已完成？`, confirmLabel: "同步完成任务", variant: "primary" })) undoLinkedTasks = onSetLinkedTaskStatus(pendingIds, "completed");
    const undoActivity = onActivity?.(createActivityEvent({ action: "status_changed", ref: { domain: "dormitory", entityId: event.id, studentId: event.responsibleStudentIds?.[0] || event.responsibleStudentId }, studentIds: event.responsibleStudentIds || (event.responsibleStudentId ? [event.responsibleStudentId] : []), title: `${nextDone ? "完成" : "恢复"}宿舍处理：${event.reason}`, detail: event.punishment || "处罚执行状态已更新" }));
    actionToast.show({ message: nextDone ? "宿舍处理已完成" : "宿舍处理已恢复", actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5" />, onAction: () => { onUpdateDormitoryEvent(event.dormId, event.id, { punishmentDone: event.punishmentDone }); if (typeof undoLinkedTasks === "function") undoLinkedTasks(); if (typeof undoActivity === "function") undoActivity(); }, duration: 6000 });
  }

  function deleteEvent(event: DormEvent) {
    setPendingDeleteEvent(event);
  }

  function confirmDeleteEvent(cancelLinkedTasks: boolean) {
    const event = pendingDeleteEvent;
    if (!event) return;
    const pendingIds = (event.followupTaskIds || []).filter(id => followupTasks.some(task => task.id === id && task.status === "pending"));
    const undoTaskStatus = cancelLinkedTasks && pendingIds.length ? onSetLinkedTaskStatus(pendingIds, "cancelled") : undefined;
    const undoDelete = onDeleteDormitoryEvent(event.dormId, event.id);
    const undoActivity = onActivity?.(createActivityEvent({ action: "deleted", ref: { domain: "dormitory", entityId: event.id, studentId: event.responsibleStudentIds?.[0] || event.responsibleStudentId }, studentIds: event.responsibleStudentIds || (event.responsibleStudentId ? [event.responsibleStudentId] : []), title: `删除宿舍事件：${event.reason}`, detail: "宿舍事件已删除" }));
    setPendingDeleteEvent(null);
    actionToast.show({
      message: `宿舍事件“${event.reason}”已删除`,
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => {
        undoDelete();
        if (typeof undoTaskStatus === "function") undoTaskStatus();
        if (typeof undoActivity === "function") undoActivity();
      },
      duration: 6000,
    });
  }

  function resetForm() {
    setReason("");
    setScore(0);
    setNote("");
    setPunishment("");
    setResponsibleIds([]);
    setResponsibleSearch("");
    setShowResponsible(false);
    setRecordToStudent(true);
    setCreateFollowup(false);
    setEventDate(localDateKey());
  }

  function changePeriodAnchor(value: string) {
    if (value === "previous") {
      setPeriodAnchor(current => shiftDormitoryPeriod(periodMode, current, -1, periodSettings));
      return;
    }
    if (value === "next") {
      setPeriodAnchor(current => shiftDormitoryPeriod(periodMode, current, 1, periodSettings));
      return;
    }
    setPeriodAnchor(value);
  }

  return (
    <div className="flex h-full flex-col bg-background-primary-default">
      <DormitoryPeriodToolbar
        mode={periodMode}
        onModeChange={setPeriodMode}
        anchor={periodAnchor}
        onAnchorChange={changePeriodAnchor}
        range={periodRange}
        settings={periodSettings}
              onSettingsChange={settings => {
                const previousSettings = periodSettings;
                onPeriodSettingsChange(settings);
                actionToast.show({ message: "宿舍统计周期已保存", actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5" />, onAction: () => onPeriodSettingsChange(previousSettings), duration: 6000 });
              }}
      />
      <MobilePaneTabs value={mobilePane} onChange={setMobilePane} label="宿舍工作区" options={[{ value: "list", label: "宿舍" }, { value: "events", label: "奖罚记录" }, { value: "members", label: "成员" }]} />
      <div className="dormitory-workspace-grid grid min-h-0 flex-1 grid-cols-[240px_1fr_220px] grid-rows-[minmax(0,1fr)] gap-4 overflow-hidden p-4">
        <div hidden={isMobile && mobilePane !== "list"} className="dormitory-pane min-h-0 flex flex-col">
        <DormitoryListPanel
          newName={newName}
          setNewName={setNewName}
          createDormitory={createDormitory}
          activeDormIndex={activeDormIndex}
          sortedDormitories={sortedDormitories}
          selectedDormitory={selectedDormitory}
          selectDorm={selectDorm}
          dormitories={dormitories}
          students={students}
          periodScores={periodScores}
        />

        </div>
        {/* 中间：事件账本 + 列表（带切换动画） */}
        <main hidden={isMobile && mobilePane !== "events"} ref={mainRef} className="vt-dorm-detail flex flex-col min-h-0 overflow-hidden gap-4">
          {selectedDormitory ? (
            <div key={animKey} className="flex flex-col min-h-0 flex-1 gap-4">
              {/* 标题区 + 统计 */}
              <div className="flex items-start justify-between gap-4 shrink-0">
                <div className="min-w-0">
                  {renamingDormId === selectedDormitory.id ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        autoFocus
                        aria-label="宿舍名称"
                        value={renameDraft}
                        onChange={event => { setRenameDraft(event.target.value); setRenameError(""); }}
                        onKeyDown={event => { if (event.key === "Enter") saveDormitoryName(); if (event.key === "Escape") { setRenamingDormId(""); setRenameError(""); } }}
                        aria-invalid={Boolean(renameError)}
                        aria-describedby={renameError ? "dormitory-rename-error" : undefined}
                        className="h-9 min-w-0 max-w-48 rounded-lg border border-border-button-default bg-background-primary-default px-2.5 text-body-semibold text-text-primary outline-none focus:border-accent-300"
                      />
                      <IconButton label="保存宿舍名称" size="sm" onClick={saveDormitoryName}><Check className="h-4 w-4" /></IconButton>
                      <IconButton label="取消改名" size="sm" onClick={() => { setRenamingDormId(""); setRenameError(""); }}><X className="h-4 w-4" /></IconButton>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <h2 className="min-w-0 truncate text-title-2-semibold text-text-primary">{selectedDormitory.name}</h2>
                      <IconButton label="重命名宿舍" size="sm" onClick={() => { setRenamingDormId(selectedDormitory.id); setRenameDraft(selectedDormitory.name); setRenameError(""); }}><Pencil className="h-4 w-4" /></IconButton>
                      <IconButton label="删除宿舍" title="删除宿舍" size="sm" onClick={() => setPendingDeleteDormitory(selectedDormitory)}><Trash2 className="h-4 w-4" /></IconButton>
                    </div>
                  )}
                  {renameError && <p id="dormitory-rename-error" role="alert" className="mt-1 text-caption-1-regular text-status-danger-500">{renameError}</p>}
                  <p className="mt-0.5 text-caption-1-regular text-text-tertiary">统计范围：{periodRange.start} 至 {periodRange.end}</p>
                </div>
                <div className="flex shrink-0 gap-4">
                  <div className="text-right">
                    <div className="text-[10px] text-text-tertiary">所选周期得分</div>
                    <div className={`text-title-2-semibold ${scoreClass(selectedPeriodScore)}`}>
                      {formatSigned(selectedPeriodScore)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-text-tertiary">所选周期事件</div>
                    <div className="text-title-2-semibold text-text-primary">
                      {selectedPeriodEvents.length}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto space-y-4">
                {/* 事件录入 */}
                <div className="bg-background-primary-default rounded-2xl border border-separator-border shadow-sm p-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-body-semibold text-text-primary">记录宿舍事件</div>
                      <div className="mt-0.5 text-[11px] text-text-tertiary">先选择事件类型，再补充得分与相关信息</div>
                    </div>
                    <button
                      type="button"
                      onClick={openPresetManager}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border-button-default bg-background-secondary-default px-2.5 py-1.5 text-caption-1-semibold text-text-secondary transition-colors hover:border-accent-200 hover:bg-accent-50 hover:text-accent-600"
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
                              ? "border-accent-300 bg-accent-50 shadow-[0_6px_18px_rgba(37,99,235,0.10)]"
                              : "border-border-button-default bg-background-primary-default  hover:border-accent-200 hover:bg-accent-50/40"
                          }`}
                        >
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-caption-1-semibold transition-colors ${
                            active
                              ? "bg-accent-600 text-text-white"
                              : memScore > 0
                                ? "bg-status-success-50 text-status-success-600"
                                : memScore < 0
                                  ? "bg-status-warning-50 text-status-warning-600"
                                  : "bg-background-tertiary-default text-text-secondary"
                          }`}>
                            {memScore > 0 ? `+${memScore}` : memScore}
                          </span>
                          <span className="min-w-0">
                            <span className={`block truncate text-caption-1-semibold ${active ? "text-accent-700" : "text-text-primary"}`}>{preset.label}</span>
                            <span className={`mt-0.5 block text-[10px] ${active ? "text-accent-500" : "text-text-tertiary"}`}>{active ? "已选择，再点可收起" : "点击记录"}</span>
                          </span>
                          {active && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-accent-600" />}
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
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 border border-accent-200 px-3 py-1 text-caption-1-semibold text-accent-600">
                          {reason}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <input
                            type="number"
                            value={score}
                            onChange={e => setScore(Number(e.target.value) || 0)}
                            className={`w-20 rounded-lg border bg-background-primary-default px-2 py-1.5 text-center text-body-semibold outline-none focus:border-accent-300 ${
                              score > 0 ? "border-status-success-200 text-status-success-600" : score < 0 ? "border-status-danger-200 text-status-danger-500" : "border-border-button-default text-text-secondary"
                            }`}
                          />
                          <div className="flex gap-1">
                            <button onClick={() => setScore(s => s - 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-border-button-default bg-background-primary-default text-text-tertiary hover:bg-status-danger-50 hover:text-status-danger-500 text-body-regular">−</button>
                            <button onClick={() => setScore(s => s + 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-border-button-default bg-background-primary-default text-text-tertiary hover:bg-status-success-50 hover:text-status-success-500 text-body-regular">+</button>
                          </div>
                        </div>
                      </div>

                      <label className="block">
                        <span className="mb-1.5 block text-caption-1-semibold text-text-tertiary">发生日期</span>
                        <DatePicker required value={eventDate} onChange={setEventDate} ariaLabel="宿舍事件发生日期" className="w-full" max={localDateKey()} />
                      </label>

                      {/* 备注 */}
                      <input
                        value={note}
                        onChange={event => setNote(event.target.value)}
                        className="w-full rounded-xl border border-border-button-default bg-background-primary-default px-3.5 py-2.5 text-body-regular outline-none transition-colors focus:border-accent-300"
                        placeholder="备注（可选）"
                      />

                      {/* 处罚措施 */}
                      <input
                        value={punishment}
                        onChange={event => setPunishment(event.target.value)}
                        className="w-full rounded-xl border border-border-button-default bg-background-primary-default px-3.5 py-2.5 text-body-regular outline-none transition-colors focus:border-accent-300"
                        placeholder="处罚措施（可选）"
                      />
                      {punishment.trim() && <div className="rounded-xl border border-accent-100 bg-accent-50/60 p-3"><label className={`flex items-center gap-2 text-body-semibold ${responsibleIds.length ? "text-accent-700" : "text-text-tertiary"}`}><input type="checkbox" checked={createFollowup && responsibleIds.length > 0} disabled={!responsibleIds.length} onChange={event => setCreateFollowup(event.target.checked)} className="accent-accent-600"/><ListPlus className="h-4 w-4"/>同时为责任人创建跟进任务</label>{createFollowup && responsibleIds.length > 0 && <div className="mt-2 flex items-center gap-2 text-caption-1-regular text-accent-600"><span>截止日期</span><DatePicker value={followupDueDate} onChange={setFollowupDueDate} ariaLabel="宿舍跟进截止日期" className="w-44 border-accent-100"/></div>} {!responsibleIds.length && <p className="mt-1 text-caption-1-regular text-text-tertiary">选择责任人后才能关联任务。</p>}</div>}

                      {/* 责任人（可展开，带动画） */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowResponsible(!showResponsible)}
                          className="flex items-center gap-1.5 text-caption-1-regular text-text-tertiary transition-colors hover:text-text-secondary"
                        >
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showResponsible ? "rotate-180" : ""}`} />
                          责任人（可选，可多选）
                          {responsibleIds.length > 0 && (
                            <span className="text-accent-500">· 已选 {responsibleIds.length} 人</span>
                          )}
                        </button>
                        <MotionCollapse open={showResponsible} contentClassName="pt-3">
                          {/* 已选责任人：同时作为名字飞入的落点 */}
                          <div ref={responsibleSelectedRef} className="mb-2 flex min-h-8 flex-wrap items-center gap-1.5 rounded-xl border border-dashed border-status-indigo-100 bg-status-indigo-50/40 px-2 py-1.5">
                            {selectedResponsibleStudents.length > 0 ? selectedResponsibleStudents.map(student => (
                              <span
                                key={student.id}
                                data-selection-motion-id={student.id}
                                className="inline-flex items-center gap-1 rounded-lg border border-status-indigo-200 bg-background-primary-default py-1 pl-2.5 pr-1 text-caption-1-semibold text-status-indigo-700 shadow-sm"
                              >
                                {student.name}
                                <button
                                  type="button"
                                  onClick={event => removeResponsibleWithAnimation(event, student)}
                                  className="grid h-4 w-4 place-items-center rounded-md text-status-indigo-300 hover:bg-status-danger-100 hover:text-status-danger-500"
                                  title={`取消选择 ${student.name}`}
                                >
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </span>
                            )) : (
                              <span className="text-[11px] text-status-indigo-300">点击下方成员，添加责任人</span>
                            )}
                          </div>
                          {/* 搜索 */}
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
                            <input
                              value={responsibleSearch}
                              onChange={e => setResponsibleSearch(e.target.value)}
                              className="w-full rounded-xl border border-border-button-default bg-background-primary-default py-2.5 pl-9 pr-3 text-body-regular outline-none transition-colors focus:border-accent-300"
                              placeholder="搜索宿舍成员"
                            />
                          </div>
                          {/* 成员列表（多选切换） */}
                          <div ref={responsibleCandidatesRef} className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-separator-border bg-background-primary-default py-1">
                            {filteredMembers.length === 0 ? (
                              <div className="py-3 text-center text-caption-1-regular text-text-tertiary">无匹配成员</div>
                            ) : (
                              filteredMembers.map(student => {
                                const selected = responsibleIds.includes(student.id);
                                return (
                                  <button
                                    key={student.id}
                                    data-selection-motion-id={student.id}
                                    type="button"
                                    onClick={event => selectResponsibleWithAnimation(event, student, selected)}
                                    className={`group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body-regular transition-[background-color,color,transform] duration-200 hover:bg-status-indigo-50 active:scale-[.99] ${
                                      selected ? "bg-accent-50 text-accent-600" : "text-text-primary"
                                    }`}
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[10px] font-bold ${student.gender === "男" ? "bg-accent-50 text-accent-500" : student.gender === "女" ? "bg-status-pink-50 text-status-pink-500" : "bg-background-tertiary-default text-text-secondary"}`}>
                                        {student.name.slice(0, 1)}
                                      </span>
                                      <span className="truncate font-semibold">{student.name}</span>
                                    </span>
                                    {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : <Plus className="h-3.5 w-3.5 shrink-0 text-status-indigo-300 transition-transform group-hover:scale-110" />}
                                  </button>
                                );
                              })
                            )}
                          </div>
                          {/* 同时记入个人档案 */}
                          <label className={`mt-2 flex items-center gap-2 text-caption-1-regular ${responsibleIds.length > 0 ? "text-text-secondary" : "text-text-tertiary"}`}>
                            <input
                              type="checkbox"
                              checked={responsibleIds.length > 0 ? recordToStudent : false}
                              disabled={responsibleIds.length === 0}
                              onChange={event => setRecordToStudent(event.target.checked)}
                              className="accent-accent-600"
                            />
                            同时记入责任人个人档案
                          </label>
                        </MotionCollapse>
                      </div>

                      {/* 按钮 */}
                      <div className="flex gap-2">
                        <button
                          onClick={resetForm}
                          className="flex-1 rounded-xl border border-border-button-default bg-background-primary-default py-2.5 text-body-semibold text-text-secondary hover:bg-background-secondary-default"
                        >
                          取消
                        </button>
                        <button
                          onClick={submitEvent}
                          disabled={!reason.trim()}
                          className="flex-[2] rounded-xl bg-accent-600 py-2.5 text-body-semibold text-text-white hover:bg-accent-700 disabled:bg-background-tertiary-default disabled:text-text-tertiary"
                        >
                          保存事件
                        </button>
                      </div>
                    </div>
                    </div>
                  </div>
                </div>

                {/* 事件列表 */}
                <div className="bg-background-primary-default rounded-2xl border border-separator-border shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b border-separator-border">
                    <h3 className="text-body-semibold text-text-primary">所选周期事件</h3>
                  </div>
                  {selectedPeriodEvents.length === 0 ? (
                    <div className="px-5 py-8 text-center text-body-regular text-text-tertiary">
                      所选周期暂无事件
                    </div>
                  ) : (
                    <div className="divide-y divide-separator-border">
                      {selectedPeriodEvents.map(({ event }) =>
                        editingEventId === event.id ? (
                          <div key={event.id} data-dormitory-event-id={event.id} className={`bg-accent-50/40 px-5 py-3 space-y-2 ${focusedEventId === event.id ? "entity-focus-highlight" : ""}`}>
                            <div className="flex gap-2">
                              <input
                                value={editReason}
                                onChange={e => setEditReason(e.target.value)}
                                className="flex-1 rounded-lg border border-border-button-default bg-background-primary-default px-3 py-1.5 text-body-regular outline-none focus:border-accent-300"
                                placeholder="原因"
                              />
                              <input
                                type="number"
                                value={editScore}
                                onChange={e => setEditScore(Number(e.target.value) || 0)}
                                className="w-16 rounded-lg border border-border-button-default bg-background-primary-default px-2 py-1.5 text-center text-body-regular outline-none focus:border-accent-300"
                              />
                            </div>
                            <input
                              value={editNote}
                              onChange={e => setEditNote(e.target.value)}
                              className="w-full rounded-lg border border-border-button-default bg-background-primary-default px-3 py-1.5 text-body-regular outline-none focus:border-accent-300"
                              placeholder="备注"
                            />
                            <DatePicker required value={editDate} onChange={setEditDate} ariaLabel="修改宿舍事件日期" className="w-full" max={localDateKey()} />
                            <div className="flex gap-2">
                              <input
                                value={editPunishment}
                                onChange={e => setEditPunishment(e.target.value)}
                                className="flex-1 rounded-lg border border-border-button-default bg-background-primary-default px-3 py-1.5 text-body-regular outline-none focus:border-accent-300"
                                placeholder="处罚措施（可选）"
                              />
                              <button
                                onClick={saveEditEvent}
                                className="rounded-lg bg-accent-600 px-3 py-1.5 text-caption-1-semibold text-text-white hover:bg-accent-700"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => setEditingEventId("")}
                                className="rounded-lg border border-border-button-default bg-background-primary-default px-3 py-1.5 text-caption-1-semibold text-text-secondary hover:bg-background-secondary-default"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div key={event.id} data-dormitory-event-id={event.id} className={`group px-5 py-3 hover:bg-background-secondary-default/60 transition-colors ${focusedEventId === event.id ? "entity-focus-highlight" : ""}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <span className="text-[10px] text-text-tertiary shrink-0">{event.date}</span>
                                <span className="text-caption-1-semibold text-text-primary truncate">
                                  {event.reason}
                                </span>
                                {event.note && (
                                  <span className="text-caption-1-regular text-text-tertiary truncate">· {event.note}</span>
                                )}
                                <span className="text-[10px] text-text-tertiary shrink-0">
                                  {resolveReferencedStudentNames({ students, studentIds: event.responsibleStudentIds, studentId: event.responsibleStudentId, snapshotNames: event.responsibleStudentNames, snapshotName: event.responsibleStudentName }).join("、") || "宿舍"}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-body-semibold ${scoreClass(event.score)}`}>
                                  {formatSigned(event.score)}
                                </span>
                                <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                  <button
                                    onClick={() =>
                                      startEditEvent(event.id, event.reason, event.score, event.note, event.punishment || "", event.date)
                                    }
                                    className="rounded-md p-1 text-text-tertiary hover:bg-background-tertiary-default hover:text-text-primary"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    onClick={() => deleteEvent(event)}
                                    className="rounded-md p-1 text-text-tertiary hover:bg-status-danger-50 hover:text-status-danger-500"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </span>
                              </div>
                            </div>
                            {event.punishment && (
                              <div
                                className={`mt-2 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-caption-1-regular ${
                                  event.punishmentDone
                                    ? "border-status-success-100 bg-status-success-50 text-status-success-600"
                                    : "border-status-warning-100 bg-status-warning-50 text-status-warning-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={Boolean(event.punishmentDone)}
                                  onChange={() => { void togglePunishment(event); }}
                                  className="accent-status-success-600"
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
                                {!event.punishmentDone && (event.responsibleStudentIds?.length || event.responsibleStudentId) && <button type="button" onClick={() => { const ids = event.responsibleStudentIds ?? (event.responsibleStudentId ? [event.responsibleStudentId] : []); const studentId = ids[0]; const linked = findMatchingFollowupTask(followupTasks, { studentId, studentIds: ids, title: event.punishment || event.reason, source: "dormitory", sourceRef: { domain: "dormitory", entityId: event.id } }); onRequestFollowupTask(linked ? { id: linked.id, studentIds: getFollowupStudentIds(linked), studentMode: linked.studentMode, studentId: linked.studentId, title: linked.title, type: linked.type, description: linked.description, plannedDate: linked.plannedDate, dueDate: linked.dueDate, source: linked.source, sourceRef: linked.sourceRef } : { studentId, studentIds: ids, title: `宿舍处理：${event.punishment}`, description: `${selectedDormitory.name} · ${event.reason}`, plannedDate: localDateKey(), dueDate: localDateKey(), type: "行为处理", source: "dormitory", sourceRef: { domain: "dormitory", entityId: event.id } }, taskIds => { onUpdateDormitoryEvent(selectedDormitory.id, event.id, { followupTaskIds: Array.from(new Set([...(event.followupTaskIds || []), ...taskIds])) }); return () => onUpdateDormitoryEvent(selectedDormitory.id, event.id, { followupTaskIds: event.followupTaskIds || [] }); }); }} className="ml-1 rounded-lg bg-background-primary-default px-2 py-1 font-bold text-accent-600 shadow-sm hover:bg-accent-50"><ListPlus className="mr-1 inline h-3 w-3"/>{event.followupTaskIds?.length ? "查看任务" : "转为任务"}</button>}
                              </div>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  )}
                </div>

              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-text-tertiary text-body-regular">
              请先选择或创建一个宿舍
            </div>
          )}
        </main>

        <div hidden={isMobile && mobilePane !== "members"} className="vt-dorm-members dormitory-pane min-h-0 flex flex-col">
        <DormitoryMembersPanel
          leaderStudentId={selectedDormitory ? classDuties?.value.dormitoryLeaders[selectedDormitory.id] : undefined}
          onLeaderChange={classDuties && selectedDormitory ? id => { classDuties.onChange(current => ({ ...current, dormitoryLeaders: { ...current.dormitoryLeaders, [selectedDormitory.id]: id } })); actionToast.show({ message: id ? "宿舍长已设置" : "已取消宿舍长" }); } : undefined}
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
      </div>

      <DialogPresence open={presetManagerOpen}>
      {presetManagerOpen && (
        <div
          className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4"
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
          <div ref={presetManagerRef} tabIndex={-1} className="modal-panel-enter app-modal-panel flex max-h-[82vh] w-full max-w-lg flex-col overflow-hidden outline-none">
            <div className="flex items-start justify-between border-b border-separator-border px-5 py-4">
              <div>
                <h3 className="text-headline-semibold text-text-primary">管理事件类型</h3>
                <p className="mt-1 text-caption-1-regular text-text-tertiary">在这里统一改名、设置默认分数或删除，避免在记录时误触。</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPresetManagerOpen(false);
                  setPendingDeletePreset("");
                }}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-tertiary transition-colors hover:bg-background-tertiary-default hover:text-text-primary"
                aria-label="关闭管理事件类型窗口"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-background-secondary-default/60 p-4">
              {presetDrafts.map((preset, index) => {
                const deletePending = pendingDeletePreset === preset.originalLabel;
                return (
                  <div key={`${preset.originalLabel}-${index}`} className="overflow-hidden rounded-xl border border-border-button-default bg-background-primary-default shadow-sm">
                    <div className="flex items-center gap-2 p-3">
                      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-caption-1-semibold ${preset.score > 0 ? "bg-status-success-50 text-status-success-600" : preset.score < 0 ? "bg-status-warning-50 text-status-warning-600" : "bg-background-tertiary-default text-text-secondary"}`}>
                        {preset.score > 0 ? `+${preset.score}` : preset.score}
                      </span>
                      <label className="min-w-0 flex-1">
                        <span className="sr-only">事件类型名称</span>
                        <input
                          value={preset.label}
                          onChange={event => setPresetDrafts(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
                          className="w-full rounded-lg border border-transparent bg-background-secondary-default px-2.5 py-1.5 text-body-semibold text-text-primary outline-none transition-colors focus:border-accent-200 focus:bg-background-primary-default"
                        />
                      </label>
                      <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-text-tertiary">
                        默认分
                        <input
                          type="number"
                          value={preset.score}
                          onChange={event => setPresetDrafts(previous => previous.map((item, itemIndex) => itemIndex === index ? { ...item, score: Number(event.target.value) || 0 } : item))}
                          className="w-14 rounded-lg border border-border-button-default bg-background-primary-default px-1.5 py-1.5 text-center text-body-semibold text-text-primary outline-none focus:border-accent-300"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => setPendingDeletePreset(deletePending ? "" : preset.originalLabel)}
                        className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors ${deletePending ? "bg-status-danger-50 text-status-danger-500" : "text-text-tertiary hover:bg-status-danger-50 hover:text-status-danger-500"}`}
                        aria-label={`删除事件类型 ${preset.label}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {presetDrafts.length === 0 && (
                <div className="rounded-xl border border-dashed border-border-button-default bg-background-primary-default px-4 py-6 text-center text-caption-1-regular text-text-tertiary">暂无事件类型，可在下方新增</div>
              )}
            </div>

            <div className="border-t border-separator-border bg-background-primary-default p-4">
              <div className="mb-3 flex gap-2">
                <input
                  value={customLabel}
                  onChange={event => setCustomLabel(event.target.value)}
                  onKeyDown={event => { if (event.key === "Enter") addCustomPresetDraft(); }}
                  className="min-w-0 flex-1 rounded-xl border border-border-button-default bg-background-secondary-default px-3 py-2 text-body-regular outline-none transition-colors focus:border-accent-300 focus:bg-background-primary-default"
                  placeholder="新增事件类型名称"
                />
                <button
                  type="button"
                  onClick={addCustomPresetDraft}
                  disabled={!customLabel.trim() || presetDrafts.some(preset => preset.label.trim() === customLabel.trim())}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-accent-200 bg-accent-50 px-3 text-body-semibold text-accent-600 hover:bg-accent-100 disabled:border-border-button-default disabled:bg-background-secondary-default disabled:text-text-tertiary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增
                </button>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPresetManagerOpen(false)} className="flex-1 rounded-xl border border-border-button-default bg-background-primary-default py-2.5 text-body-semibold text-text-secondary hover:bg-background-secondary-default">取消</button>
                <button
                  type="button"
                  onClick={savePresetManager}
                  disabled={presetDrafts.some((preset, index, list) => !preset.label.trim() || list.findIndex(item => item.label.trim() === preset.label.trim()) !== index)}
                  className="flex-[2] rounded-xl bg-accent-600 py-2.5 text-body-semibold text-text-white hover:bg-accent-700 disabled:bg-background-tertiary-hover disabled:text-text-tertiary"
                >
                  保存类型设置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </DialogPresence>
      <ConfirmDialog open={Boolean(pendingDeleteDormitory)} title="删除这个宿舍？" description={`将删除“${pendingDeleteDormitory?.name || "当前宿舍"}”及全部事件，${pendingDeleteDormitory?.memberIds.length || 0} 名成员会变为未分配宿舍；操作后可在 6 秒内撤销。`} confirmLabel="确认删除宿舍" onCancel={() => setPendingDeleteDormitory(null)} onConfirm={() => {
        if (!pendingDeleteDormitory) return;
        const deleted = pendingDeleteDormitory;
        const remaining = sortedDormitories.filter(dormitory => dormitory.id !== deleted.id);
        const nextSelectedId = remaining[Math.min(activeDormIndex, remaining.length - 1)]?.id || "";
        runViewTransition(() => {
          const undo = onDeleteDormitory(deleted.id);
          setSelectedDormId(nextSelectedId);
          setPendingDeleteDormitory(null);
          actionToast.show({ message: `宿舍“${deleted.name}”已删除`, actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5" />, onAction: () => runViewTransition(() => { undo(); setSelectedDormId(deleted.id); }), duration: 6000 });
        });
      }} />
      <ConfirmDialog open={Boolean(pendingDeleteEvent)} title="删除这条宿舍事件？" description={`将删除“${pendingDeleteEvent?.reason || "当前事件"}”。已完成的关联任务会保留；未完成任务可选择保留或同时取消。`} confirmLabel={(pendingDeleteEvent?.followupTaskIds || []).some(id => followupTasks.some(task => task.id === id && task.status === "pending")) ? "删除并取消未完成任务" : "确认删除事件"} alternateLabel={(pendingDeleteEvent?.followupTaskIds || []).some(id => followupTasks.some(task => task.id === id && task.status === "pending")) ? "删除但保留任务" : undefined} onCancel={() => setPendingDeleteEvent(null)} onAlternate={() => confirmDeleteEvent(false)} onConfirm={() => confirmDeleteEvent(true)} />
      <ConfirmDialog open={Boolean(pendingDeletePreset)} title="删除这个事件类型？" description={`将从预设中移除“${presetDrafts.find(item => item.originalLabel === pendingDeletePreset)?.label || "当前类型"}”，保存类型设置后生效。`} confirmLabel="确认删除类型" onCancel={() => setPendingDeletePreset("")} onConfirm={() => { setPresetDrafts(previous => previous.filter(item => item.originalLabel !== pendingDeletePreset)); setPendingDeletePreset(""); }} />
      {appDialog.dialog}
      {actionToast.toast}
    </div>
  );
}
