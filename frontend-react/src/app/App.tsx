import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar, type SidebarTab } from "./components/Sidebar";
import { StudentDetail } from "./components/StudentDetail";
import type { StudentDetailTab } from "./components/StudentModal";
import { resolveBusinessEntityPreview } from "./state/businessEntityPreview";
import { TopHeader } from "./components/TopHeader";
import { CloudSyncModal } from "./components/CloudSyncModal";
import { InstallHelpModal } from "./components/InstallHelpModal";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import { SeatShufflePreview } from "./components/SeatShufflePreview";
import { HistorySeatModal } from "./components/HistorySeatModal";
import { DailyWorkspace, DataWorkspace, DormitoryWorkspace, HistoryWorkspace, ClassFundWorkspace, AttendanceWorkspace, FollowupWorkspace } from "./components/workspaces";
import { RetryableLazy } from "./components/RetryableLazy";
import {
  buildSeatOrderByStudentList,
  swapSeatOrder,
  type SeatOrder,
} from "./state/seatActions";
import { buildBestShuffleCandidate, evaluateSeatOrder, type ShuffleCandidate } from "./state/seatPlanner";
import { clearAuth, isAuthenticated, unbindCurrentDevice } from "./state/authStorage";
import { USES_LICENSE_AUTH } from "./config";
import { deleteGradeExamRecord, saveGradeExamRecord, saveLegacySnapshot, updateGradeExamItemAnalysis, updateGradeExamRecordMetadata } from "./state/legacyWriteAdapter";
import { importRosterFile, type RosterImportOptions, type RosterImportResult } from "./state/rosterImport";
import { useSeatManagerState } from "./state/store";
import { useSeatManagerController } from "./state/seatManagerController";
import { generateClassAiTrend, generateStudentAiTrend, readCachedStudentAiTrend, type AiClassTrendResult } from "./state/aiTrendService";
import type { ActivityEvent, AppStudent, BusinessEntityRef, GradeExam, GradeItemAnalysis, GradeQuestionDefinition, SavedGradeExamRecord, SeatHistorySnapshot, SeatLayoutV1, SeatSettings, StudentId } from "./state/types";
import { useStudentActions } from "./hooks/useStudentActions";
import { useDormitoryActions } from "./hooks/useDormitoryActions";
import { useClassFundActions } from "./hooks/useClassFundActions";
import { createFollowupTask, findOpenLinkedTask, getTaskUrgency, todayKey } from "./state/dailyManagement";
import { FollowupTaskDrawer, type FollowupTaskDraft } from "./components/FollowupTaskDrawer";
import { buildTimeline, businessEntityExists, inspectStateHealth, targetFromBusinessRef, type TimelineTarget } from "./state/dataInsights";
import { createActivityEvent } from "./state/activityEvents";
import { archiveStudent, changeFollowupTaskStatus, permanentlyDeleteStudent, restoreStudent, syncCompletedFollowupHomework, updateFollowupResolution } from "./state/classManagementCommands";
import { useActionToast, useAppDialog } from "./components/ui";
import { normalizeDormitoryPeriodSettings } from "./state/dormitoryPeriods";
import { resolveSeatLayout } from "./state/seatLayout";
import { WorkspaceRecoveryScreen } from "./components/WorkspaceRecoveryScreen";
import { getCurrentWorkspaceScope, inspectWorkspaceStorage } from "./state/workspaces";
import { TodayWorkspace } from "./components/workspaces/TodayWorkspace";
import { QuickRecordDrawer, type QuickRecordInput } from "./components/QuickRecordDrawer";
import { normalizeGradeThresholds, normalizeSubjectCatalog, type GradeThresholds } from "./state/teacherWorkbench";
import { deleteStudentCommentDraft } from "./state/commentStorage";
import { removeStudentFromCommentBatch } from "./components/commentBatchStorage";
import { AiAssistantLauncher } from "./components/AiAssistantLauncher";

type AppTab = SidebarTab;
type StudentAdviceProgress = {
  busy: boolean;
  status: string;
  generated: number;
  failed: number;
  skipped: number;
  total: number;
};
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const loadCommentWorkbench = () => import("./components/CommentWorkbench").then((module) => ({ default: module.CommentWorkbench }));
const loadAiAssistantCompanion = () => import("./components/AiAssistantWorkspace").then((module) => ({ default: module.AiAssistantCompanion }));
const loadScoresWorkspace = () => import("./components/workspaces/ScoresWorkspace").then((module) => ({ default: module.ScoresWorkspace }));

const APP_TAB_LABELS: Record<AppTab, string> = {
  today: "今日",
  daily: "座位",
  attendance: "出勤",
  followups: "任务与作业",
  dormitories: "宿舍",
  scores: "成绩",
  funds: "班费",
  data: "名单 / 备份",
  history: "历史",
};

export default function App() {
  const appDialog = useAppDialog();
  const actionToast = useActionToast();
  const initialState = useSeatManagerState();
  const controller = useSeatManagerController(initialState);
  const appState = controller.state;
  const { students: allStudents, dormitories, fundTransactions, attendanceRecords, followupTasks, drawSessions, seatOrder, seatSettings, schedule, homeworkAssignments, quickRecordPresets, communicationDrafts } = appState;
  const students = allStudents.filter(student => student.enrollmentStatus !== "archived");
  const savedSeatHistory = appState.seatHistory;
  const lockedSeats = new Set(appState.lockedSeats);
  const { setStudents, setDormitories, setFundTransactions, setAttendanceRecords, setFollowupTasks, setDrawSessions, setSeatOrder, setSeatSettings, setSettings, setLockedSeats, setSeatHistory: setSavedSeatHistory, setSchedule, setHomeworkAssignments, setQuickRecordPresets, setActivityEvents } = controller;
  const dormitoryPeriodSettings = normalizeDormitoryPeriodSettings(appState.settings.dormitoryPeriod);
  const subjectCatalog = normalizeSubjectCatalog(appState.settings.subjectCatalog, [
    ...schedule.entries.map(entry => entry.subject),
    ...homeworkAssignments.map(assignment => assignment.subject),
    ...appState.gradeExams.flatMap(exam => exam.subjects),
  ]);
  const gradeThresholds = normalizeGradeThresholds(appState.settings.gradeThresholds);
  const { persist: persistState, reload: reloadState, replace: replaceState } = controller;
  const [loggedIn, setLoggedIn] = useState(() => isAuthenticated());
  const [workspaceStorage, setWorkspaceStorage] = useState(() => inspectWorkspaceStorage());
  const [sidebarTab, setSidebarTab] = useState<AppTab>("today");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1199px)").matches);
  const [selectedStudentId, setSelectedStudentId] = useState<StudentId | null>(null);
  const selectedStudent = allStudents.find(student => student.id === selectedStudentId) || null;
  const [selectedStudentInitialTab, setSelectedStudentInitialTab] = useState<StudentDetailTab>("records");
  const [showCommentWorkbench, setShowCommentWorkbench] = useState(false);
  const [commentWorkbenchTransition, setCommentWorkbenchTransition] = useState<"preparing" | "open" | "closing">("preparing");
  const [CommentWorkbenchComponent, setCommentWorkbenchComponent] = useState<Awaited<ReturnType<typeof loadCommentWorkbench>>["default"] | null>(null);
  const [aiCompanionMounted, setAiCompanionMounted] = useState(false);
  const [aiCompanionOpen, setAiCompanionOpen] = useState(false);
  const [aiCompanionBusy, setAiCompanionBusy] = useState(false);
  const [seatHistory, setSeatHistory] = useState<SeatOrder[]>([]);
  const [selectedHistorySnapshot, setSelectedHistorySnapshot] = useState<SeatHistorySnapshot | null>(null);
  const [shufflePreview, setShufflePreview] = useState<ShuffleCandidate | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [showCloudSync, setShowCloudSync] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [installMessage, setInstallMessage] = useState("当前浏览器没有直接提供安装确认，请按下面方式手动添加。");
  const [studentAdviceProgress, setStudentAdviceProgress] = useState<StudentAdviceProgress>({
    busy: false,
    status: "",
    generated: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  });
  const [saveStatus, setSaveStatus] = useState<"saving" | "saved" | "failed" | "quota">("saved");
  const [followupDraft, setFollowupDraft] = useState<FollowupTaskDraft | null>(null);
  const [timelineTarget, setTimelineTarget] = useState<TimelineTarget | null>(null);
  const [followupMode, setFollowupMode] = useState<"tasks" | "homework">("tasks");
  const [quickRecordOpen, setQuickRecordOpen] = useState(false);
  const followupAfterSave = useRef<((taskIds: string[]) => void) | null>(null);
  const flushPersistRef = useRef<() => void>(() => {});
  // 两个全量扫描只在对应页签激活时计算，且 toast/弹窗等 App 局部状态变化不再触发重算。
  const historyTimeline = useMemo(() => (sidebarTab === "history" ? buildTimeline(appState) : []), [appState, sidebarTab]);
  const healthIssues = useMemo(() => (sidebarTab === "data" ? inspectStateHealth(appState) : []), [appState, sidebarTab]);

  function recordActivity(event: ActivityEvent) {
    return recordActivities([event]);
  }

  function recordActivities(events: ActivityEvent[]) {
    const ids = new Set(events.map(event => event.id));
    setActivityEvents(current => [...events, ...current].slice(0, 2000));
    return () => setActivityEvents(current => current.filter(item => !ids.has(item.id)));
  }

  function applyQuickRecord(input: QuickRecordInput) {
    const now = new Date().toISOString();
    const records = new Map(input.studentIds.map((studentId, index) => [studentId, { id: `record-${Date.now()}-${index}-${studentId}`, type: input.type, note: input.note, date: todayKey(), score: input.score, presetId: input.presetId, createdAt: now }]));
    setStudents(current => current.map(student => records.has(student.id) ? { ...student, records: [records.get(student.id)!, ...student.records] } : student));
    const removeActivities = recordActivities(input.studentIds.map(studentId => createActivityEvent({ action: "created", ref: { domain: "student", entityId: studentId, subEntityId: records.get(studentId)?.id, studentId, date: todayKey() }, studentIds: [studentId], title: input.note, detail: "快捷记录" })));
    return () => {
      setStudents(current => current.map(student => {
        const createdRecord = records.get(student.id);
        return createdRecord ? { ...student, records: student.records.filter(record => record.id !== createdRecord.id) } : student;
      }));
      removeActivities();
    };
  }

  function requestFollowupTask(draft: FollowupTaskDraft, afterSave?: (taskIds: string[]) => void) {
    if (!draft.id && !draft.continuedFromTaskId && draft.sourceRef) {
      const existing = findOpenLinkedTask(followupTasks, draft.studentId, draft.sourceRef);
      if (existing) {
        setFollowupDraft({ id: existing.id, studentId: existing.studentId, title: existing.title, type: existing.type, description: existing.description, plannedDate: existing.plannedDate, dueDate: existing.dueDate, source: existing.source, sourceRef: existing.sourceRef });
        return;
      }
    }
    followupAfterSave.current = afterSave || null;
    setFollowupDraft(draft);
  }

  async function handleCompleteTodayTask(taskId: string) {
    const task = followupTasks.find(item => item.id === taskId);
    if (!task || task.status !== "pending") return false;
    const previousHomework = homeworkAssignments;
    const result = changeFollowupTaskStatus(task, "completed");
    setFollowupTasks(current => current.map(item => (item.id === taskId ? result.task : item)));
    const events = [result.event];
    let homeworkChanged = false;
    const homeworkSync = syncCompletedFollowupHomework(task, homeworkAssignments);
    if (homeworkSync) {
      const assignment = homeworkAssignments.find(item => item.id === task.sourceRef?.entityId);
      homeworkChanged = await appDialog.confirm({ title: "同步作业状态？", description: `跟进任务已经完成。是否同时把“${assignment?.title || "关联作业"}”中该学生的状态更新为“已交”？选择取消也不会影响任务完成。`, confirmLabel: "同步为已交" });
      if (homeworkChanged) {
        setHomeworkAssignments(homeworkSync.assignments);
        events.push(homeworkSync.event);
      }
    }
    const removeActivity = recordActivities(events);
    actionToast.show({
      message: `已完成跟进：${task.title}`,
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => {
        setFollowupTasks(current => current.map(item => (item.id === taskId ? task : item)));
        if (homeworkChanged) setHomeworkAssignments(previousHomework);
        removeActivity();
      },
      duration: 6000,
    });
    return true;
  }

  function handleSaveTodayTaskResolution(taskId: string, note: string) {
    const task = followupTasks.find(item => item.id === taskId);
    if (!task) return;
    const result = updateFollowupResolution(task, note);
    setFollowupTasks(current => current.map(item => item.id === taskId ? result.task : item));
    const removeActivity = recordActivity(result.event);
    actionToast.show({ message: "处理结果已保存", actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5" />, onAction: () => { setFollowupTasks(current => current.map(item => item.id === taskId ? task : item)); removeActivity(); }, duration: 6000 });
  }

  function handleContinueTodayTask(taskId: string) {
    const task = followupTasks.find(item => item.id === taskId);
    if (!task) return;
    requestFollowupTask({ studentId: task.studentId, title: task.title, type: task.type, description: task.resolutionNote ? `上次处理：${task.resolutionNote}` : task.description, plannedDate: todayKey(), dueDate: todayKey(), source: task.source, sourceRef: task.sourceRef, continuedFromTaskId: task.id });
  }

  function handleSetLinkedTaskStatus(taskIds: string[], status: "pending" | "completed" | "cancelled") {
    const previous = followupTasks.filter(task => taskIds.includes(task.id));
    const changes = previous.map(task => changeFollowupTaskStatus(task, status));
    setFollowupTasks(current => current.map(task => changes.find(change => change.task.id === task.id)?.task || task));
    const removeActivities = recordActivities(changes.map(change => change.event));
    return () => {
      setFollowupTasks(current => current.map(task => previous.find(item => item.id === task.id) || task));
      removeActivities();
    };
  }

  async function openCommentWorkbench() {
    if (!CommentWorkbenchComponent) {
      try {
        const Workbench = (await loadCommentWorkbench()).default;
        setCommentWorkbenchComponent(() => Workbench);
      } catch {
        setShowCommentWorkbench(true);
        return;
      }
    }
    setCommentWorkbenchTransition("preparing");
    setShowCommentWorkbench(true);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setCommentWorkbenchTransition("open"));
    });
  }

  function closeCommentWorkbench() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShowCommentWorkbench(false);
      setCommentWorkbenchTransition("preparing");
      return;
    }
    setCommentWorkbenchTransition("closing");
  }

  function finishClosingCommentWorkbench() {
    setShowCommentWorkbench(false);
    setCommentWorkbenchTransition("preparing");
  }

  function confirmFollowupTask(draft: FollowupTaskDraft) {
    const wasEditing = Boolean(draft.id);
    const previousTask = draft.id ? followupTasks.find(task => task.id === draft.id) : undefined;
    const afterSave = followupAfterSave.current;
    let savedIds: string[] = draft.id ? [draft.id] : [];
    if (draft.id) {
      const { studentIds: _studentIds, id: _id, ...patch } = draft;
      setFollowupTasks(current => current.map(task => task.id === draft.id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task));
    } else {
      const studentIds = draft.studentIds?.length ? draft.studentIds : [draft.studentId];
      const created = studentIds.map(studentId => createFollowupTask({ ...draft, studentId, sourceRef: draft.sourceRef ? { ...draft.sourceRef, studentId: draft.sourceRef.studentId || studentId } : undefined }));
      savedIds = created.map(task => task.id);
      setFollowupTasks(current => [...created, ...current]);
    }
    afterSave?.(savedIds);
    const activity = createActivityEvent({ action: wasEditing ? "updated" : "created", ref: { domain: "followup", entityId: savedIds[0] || draft.id || "", studentId: draft.studentId || undefined }, studentIds: draft.studentIds?.length ? draft.studentIds : draft.studentId ? [draft.studentId] : [], title: `${wasEditing ? "修改" : "创建"}跟进：${draft.title}`, detail: draft.description || `截止 ${draft.dueDate}` });
    recordActivity(activity);
    followupAfterSave.current = null;
    setFollowupDraft(null);
    actionToast.show({
      message: wasEditing ? "跟进任务修改已保存" : savedIds.length > 1 ? `已创建 ${savedIds.length} 项跟进任务` : "跟进任务已创建",
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => {
        if (previousTask) {
          setFollowupTasks(current => current.map(task => task.id === previousTask.id ? previousTask : task));
          setActivityEvents(current => current.filter(item => item.id !== activity.id));
          return;
        }
        const idSet = new Set(savedIds);
        setFollowupTasks(current => current.filter(task => !idSet.has(task.id)));
        setActivityEvents(current => current.filter(item => item.id !== activity.id));
        afterSave?.([]);
      },
      duration: 6000,
    });
  }

  useEffect(() => {
    if (!loggedIn) setAiCompanionOpen(false);
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn || typeof window === "undefined") return;
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const preload = () => {
      void loadCommentWorkbench()
        .then(module => setCommentWorkbenchComponent(() => module.default))
        .catch(() => undefined);
    };
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(preload, { timeout: 2_000 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const handle = window.setTimeout(preload, 800);
    return () => window.clearTimeout(handle);
  }, [loggedIn]);
  const hasMounted = useRef(false);
  const studentAdviceRunning = useRef(false);

  // 400ms 防抖：连续输入合并为一次整柜写入。关页、隐藏、切换班级或登出前
  // 必须先经 flushPersistRef 同步落盘；flush 时校验切片未变，旧切片状态不得写进新切片。
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (!loggedIn || workspaceStorage.status === "corrupt") {
      return;
    }
    setSaveStatus("saving");
    const scope = getCurrentWorkspaceScope();
    let timer: number | null = window.setTimeout(() => flush(), 400);
    function flush() {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
      if (getCurrentWorkspaceScope() !== scope) return;
      const saved = persistState();
      if (saved) setSaveStatus("saved");
      else {
        try { const probe = "seat-manager-storage-probe"; localStorage.setItem(probe, "1"); localStorage.removeItem(probe); setSaveStatus("failed"); } catch { setSaveStatus("quota"); }
      }
    }
    flushPersistRef.current = flush;
    const handleVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (timer !== null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };
  }, [appState, loggedIn, persistState, workspaceStorage.status]);

  useEffect(() => {
    if (!loggedIn || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const due = followupTasks.filter(task => ["overdue", "today"].includes(getTaskUrgency(task)) && task.lastNotifiedAt?.slice(0, 10) !== todayKey());
    if (!due.length) return;
    new Notification("班级跟进提醒", { body: `今天有 ${due.length} 项待处理或已逾期任务。` });
    const now = new Date().toISOString();
    setFollowupTasks(current => current.map(task => due.some(item => item.id === task.id) ? { ...task, lastNotifiedAt: now } : task));
  }, [followupTasks, loggedIn, setFollowupTasks]);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
      setInstallMessage("已安装到桌面。");
      setShowInstallHelp(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  function toggleLock(idx: number) {
    setLockedSeats(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function commitSeatOrder(next: SeatOrder) {
    setSeatHistory(prev => [seatOrder, ...prev].slice(0, 20));
    setSeatOrder(next);
  }

  function handleMoveSeat(fromIndex: number, toIndex: number) {
    const next = swapSeatOrder(seatOrder, fromIndex, toIndex, lockedSeats);
    if (next !== seatOrder) {
      commitSeatOrder(next);
    }
  }

  function handleAssignStudentToSeat(studentId: StudentId, seatIndex: number) {
    if (lockedSeats.has(seatIndex) || seatIndex < 0 || seatIndex >= seatOrder.length) return;
    const next = seatOrder.map(id => id === studentId ? null : id);
    next[seatIndex] = studentId;
    commitSeatOrder(next);
  }

  function handleRandomizeSeats() {
    const candidate = buildBestShuffleCandidate(students, seatOrder, lockedSeats, seatSettings);
    if (candidate) {
      setShufflePreview(candidate);
    }
  }

  function handleShufflePreviewOrderChange(order: SeatOrder) {
    setShufflePreview({
      order,
      evaluation: evaluateSeatOrder(students, order, seatSettings),
    });
  }

  function handleApplyShufflePreview() {
    if (!shufflePreview) {
      return;
    }
    commitSeatOrder(shufflePreview.order);
    setShufflePreview(null);
  }

  function updateSeatSettings(updater: (current: SeatSettings) => SeatSettings) {
    setSeatSettings(updater);
  }

  function applySeatLayout(layout: SeatLayoutV1) {
    const previousLayout = resolveSeatLayout(seatSettings.layout, seatOrder.length);
    const occupantBySeatId = new Map(previousLayout.seats.map((seat, index) => [seat.id, seatOrder[index] ?? null]));
    const used = new Set<StudentId>();
    const nextOrder = layout.seats.map(seat => {
      const occupant = occupantBySeatId.get(seat.id) || null;
      if (occupant) used.add(occupant);
      return occupant;
    });
    const remaining = seatOrder.filter((id): id is StudentId => Boolean(id)).filter(id => !used.has(id));
    nextOrder.forEach((id, index) => { if (!id && remaining.length) nextOrder[index] = remaining.shift() || null; });
    const lockedSeatIds = new Set([...lockedSeats].map(index => previousLayout.seats[index]?.id).filter((id): id is string => Boolean(id)));
    const nextLocked = new Set(layout.seats.map((seat, index) => lockedSeatIds.has(seat.id) ? index : -1).filter(index => index >= 0));
    setSeatHistory(previous => [seatOrder, ...previous].slice(0, 20));
    setSeatOrder(nextOrder);
    setLockedSeats(nextLocked);
    setSeatSettings(current => ({ ...current, layout }));
    actionToast.show({ message: remaining.length ? `布局已应用，${remaining.length} 名学生进入待排区` : "座位布局已应用" });
  }

  function normalizeNameForHistory(name: string): string {
    return name.trim().replace(/\u3000/g, " ").replace(/[()（）][^()（）]*[()（）]/g, "").replace(/(同学|学生)$/g, "").replace(/\s+/g, "");
  }

  function createSnapshotId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `seat-history-${Date.now()}`;
  }

  function persistSeatHistory(nextHistory: SeatHistorySnapshot[]): boolean {
    setSaveStatus("saving");
    const saved = saveLegacySnapshot({
      students: allStudents,
      seatOrder,
      lockedSeats: appState.lockedSeats,
      seatSettings,
      settings: appState.settings,
      dormitories,
      seatHistory: nextHistory,
      fundTransactions,
      attendanceRecords,
      followupTasks,
      drawSessions,
      schedule,
      homeworkAssignments,
      quickRecordPresets,
      communicationDrafts,
      activityEvents: appState.activityEvents,
      savedExams: appState.savedExams,
      exams: appState.exams,
    });
    setSaveStatus(saved ? "saved" : "failed");
    if (saved) setSavedSeatHistory(nextHistory);
    return saved;
  }

  function handleSaveSeatHistory(note: string) {
    if (!students.length) {
      return;
    }
    const studentById = new Map(students.map(student => [student.id, student]));
    const rows = seatSettings.layout ? 1 : Math.max(1, Math.ceil(seatOrder.length / 8));
    const snapshot: SeatHistorySnapshot = {
      id: createSnapshotId(),
      time: new Date().toISOString(),
      note: note.trim(),
      rows,
      seats: seatOrder.map(id => (id ? studentById.get(id)?.name || "" : "")),
      layout: seatSettings.layout,
    };
    const nextHistory = [snapshot, ...savedSeatHistory].slice(0, 20);
    if (persistSeatHistory(nextHistory)) {
      setSelectedHistorySnapshot(snapshot);
      actionToast.show({
        message: "座位快照已保存",
        actionLabel: "撤销",
        actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
        onAction: () => handleDeleteSeatHistory(snapshot.id),
        duration: 6000,
      });
    }
  }

  function handleUpdateSeatHistoryNote(id: string, note: string): boolean {
    const normalizedNote = note.trim();
    const nextHistory = savedSeatHistory.map(item => (item.id === id ? { ...item, note: normalizedNote } : item));
    const saved = persistSeatHistory(nextHistory);
    if (saved) setSelectedHistorySnapshot(prev => (prev?.id === id ? { ...prev, note: normalizedNote } : prev));
    return saved;
  }

  function handleDeleteSeatHistory(id: string): boolean {
    const saved = persistSeatHistory(savedSeatHistory.filter(item => item.id !== id));
    if (saved) setSelectedHistorySnapshot(prev => (prev?.id === id ? null : prev));
    return saved;
  }

  function handleApplySeatHistory(snapshot: SeatHistorySnapshot) {
    const queues = new Map<string, StudentId[]>();
    students.forEach(student => {
      const key = normalizeNameForHistory(student.name);
      if (!queues.has(key)) {
        queues.set(key, []);
      }
      queues.get(key)?.push(student.id);
    });
    const next = snapshot.seats.map(name => {
      if (!name) {
        return null;
      }
      const queue = queues.get(normalizeNameForHistory(name));
      return queue?.shift() || null;
    });
    if (snapshot.layout) {
      setSeatSettings(current => ({ ...current, layout: snapshot.layout }));
      setLockedSeats(current => new Set([...current].filter(index => index < snapshot.layout!.seats.length)));
    }
    commitSeatOrder(next);
    setSelectedHistorySnapshot(null);
  }

  function handleOrderSeatsByList() {
    commitSeatOrder(buildSeatOrderByStudentList(students, seatSettings.layout));
  }

  function handleUndoSeatOrder() {
    setSeatHistory(prev => {
      const [last, ...rest] = prev;
      if (last) {
        setSeatOrder(last);
      }
      return rest;
    });
  }

  function openStudentDetail(student: AppStudent, initialTab: StudentDetailTab = "records") {
    setSelectedStudentInitialTab(initialTab);
    setSelectedStudentId(student.id);
  }

  // 学生详情内按名单顺序逐人切换；保持当前页签，方便逐人过档案或成绩。
  function navigateStudentDetail(direction: -1 | 1) {
    if (!selectedStudentId || students.length < 2) return;
    const index = students.findIndex(item => item.id === selectedStudentId);
    if (index < 0) return;
    setSelectedStudentId(students[(index + direction + students.length) % students.length].id);
  }

  const selectedStudentIndex = selectedStudentId ? students.findIndex(item => item.id === selectedStudentId) : -1;

  function consumeTimelineTarget() {
    setTimelineTarget(null);
  }

  function openTimelineTarget(target: TimelineTarget) {
    if (target.kind === "student") {
      const student = allStudents.find(item => item.id === target.studentId || item.id === target.entityId);
      if (student) openStudentDetail(student, target.studentTab || "records");
      return;
    }
    if (!target.workspace) return;
    if (target.workspace === "followups") setFollowupMode(homeworkAssignments.some(item => item.id === target.entityId) ? "homework" : "tasks");
    setTimelineTarget({ ...target });
    setSidebarTab(target.workspace);
  }

  function navigateToEntity(ref: BusinessEntityRef) {
    if (!businessEntityExists(appState, ref)) {
      void appDialog.notice({ title: "原始内容已不存在", description: "这条记录仍保留在历史中，但对应的业务内容可能已被删除或来自旧版数据，暂时无法继续定位。" });
      return;
    }
    openTimelineTarget(targetFromBusinessRef(ref));
  }

  function saveCurrentLegacySnapshot() {
    persistState();
  }

  function reloadFromLegacyState() {
    reloadState();
    setSeatHistory([]);
    setSelectedStudentInitialTab("records");
    setSelectedStudentId(null);
  }

  function handleSaveScoreImport(record: SavedGradeExamRecord): GradeExam | null {
    const existed = appState.gradeExams.some(exam => exam.id === record.id);
    const next = saveGradeExamRecord({
      record,
      students: allStudents,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      settings: appState.settings,
      dormitories,
      seatHistory: savedSeatHistory,
      fundTransactions, attendanceRecords, followupTasks, drawSessions, schedule, homeworkAssignments, quickRecordPresets, communicationDrafts, activityEvents: appState.activityEvents, savedExams: appState.savedExams, exams: appState.exams,
    });
    if (!next) {
      return null;
    }
    replaceState(next);
    recordActivity(createActivityEvent({ action: existed ? "updated" : "created", ref: { domain: "score", entityId: record.id }, studentIds: record.entries.map(entry => entry.studentId).filter((id): id is string => Boolean(id)), title: `${existed ? "更新" : "导入"}考试：${record.name || "考试"}`, detail: `${record.studentCount} 名学生 · ${record.subjectCount} 科` }));
    setSeatHistory([]);
    setSidebarTab("scores");
    return next.gradeExams.find(exam => exam.id === record.id) || next.gradeExams[0] || null;
  }

  function handleUpdateGradeExam(examId: string, name: string, date: string): boolean {
    const previousExam = appState.gradeExams.find(exam => exam.id === examId);
    const next = updateGradeExamRecordMetadata({
      examId,
      name,
      date,
      students: allStudents,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      settings: appState.settings,
      dormitories,
      seatHistory: savedSeatHistory,
      fundTransactions, attendanceRecords, followupTasks, drawSessions, schedule, homeworkAssignments, quickRecordPresets, communicationDrafts, activityEvents: appState.activityEvents, savedExams: appState.savedExams, exams: appState.exams,
    });
    if (!next) {
      return false;
    }
    replaceState(next);
    recordActivity(createActivityEvent({ action: "updated", ref: { domain: "score", entityId: examId }, studentIds: previousExam?.rows.map(row => row.studentId).filter((id): id is string => Boolean(id)) || [], title: `修改考试：${name}`, detail: date || "未设置日期" }));
    return true;
  }

  function handleDeleteGradeExam(examId: string): (() => void) | null {
    const exam = appState.gradeExams.find(item => item.id === examId);
    const storedRecord = appState.savedExams.find(item => item !== null && typeof item === "object" && "id" in item && item.id === examId) as SavedGradeExamRecord | undefined;
    const deletedRecord = storedRecord || (exam ? {
      id: exam.id,
      name: exam.name,
      date: exam.date,
      savedAt: exam.savedAt || new Date().toISOString(),
      studentCount: exam.rows.length,
      subjectCount: exam.subjects.length,
      subjects: exam.subjects,
      entries: exam.rows.map(row => ({
        studentId: row.studentId,
        name: row.name,
        studentNo: row.studentNo,
        scores: row.scores,
        total: { score: row.total, rankClass: row.rankClass, rankSchool: row.rankSchool },
      })),
      importSource: exam.importSource,
      itemAnalysis: exam.itemAnalysis,
    } satisfies SavedGradeExamRecord : undefined);
    const next = deleteGradeExamRecord({
      examId,
      students: allStudents,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      settings: appState.settings,
      dormitories,
      seatHistory: savedSeatHistory,
      fundTransactions, attendanceRecords, followupTasks, drawSessions, schedule, homeworkAssignments, quickRecordPresets, communicationDrafts, activityEvents: appState.activityEvents, savedExams: appState.savedExams, exams: appState.exams,
    });
    if (!next) {
      return null;
    }
    replaceState(next);
    const removeActivity = recordActivity(createActivityEvent({ action: "deleted", ref: { domain: "score", entityId: examId }, studentIds: exam?.rows.map(row => row.studentId).filter((id): id is string => Boolean(id)) || [], title: `删除考试：${exam?.name || deletedRecord?.name || "考试"}`, detail: "考试成绩已删除" }));
    if (!deletedRecord) return null;
    return () => { replaceState(current => saveGradeExamRecord({
      record: deletedRecord,
      students: current.students,
      seatOrder: current.seatOrder,
      lockedSeats: current.lockedSeats,
      seatSettings: current.seatSettings,
      settings: current.settings,
      dormitories: current.dormitories,
      seatHistory: current.seatHistory,
      fundTransactions: current.fundTransactions,
      attendanceRecords: current.attendanceRecords,
      followupTasks: current.followupTasks,
      drawSessions: current.drawSessions,
      schedule: current.schedule,
      homeworkAssignments: current.homeworkAssignments,
      quickRecordPresets: current.quickRecordPresets,
      communicationDrafts: current.communicationDrafts,
      activityEvents: current.activityEvents,
      savedExams: current.savedExams,
      exams: current.exams,
    }) || current); removeActivity(); };
  }

  function handleSaveGradeItemAnalysis(examId: string, itemAnalysis: GradeItemAnalysis): boolean {
    const next = updateGradeExamItemAnalysis({ examId, itemAnalysis, students: allStudents, seatOrder, lockedSeats: [...lockedSeats], seatSettings, settings: appState.settings, dormitories, seatHistory: savedSeatHistory, fundTransactions, attendanceRecords, followupTasks, drawSessions, schedule, homeworkAssignments, quickRecordPresets, communicationDrafts, activityEvents: appState.activityEvents, savedExams: appState.savedExams, exams: appState.exams });
    if (!next) return false;
    replaceState(next);
    recordActivity(createActivityEvent({ action: "updated", ref: { domain: "score", entityId: examId }, studentIds: itemAnalysis.rows.map(row => row.studentId).filter((id): id is string => Boolean(id)), title: `更新题目分析：${appState.gradeExams.find(exam => exam.id === examId)?.name || "考试"}`, detail: `${itemAnalysis.questions.length} 道题目` }));
    return true;
  }

  function getExamTotalAverage(exam: GradeExam): number | null {
    const totals = exam.rows
      .map(row => {
        if (typeof row.total === "number" && Number.isFinite(row.total)) {
          return row.total;
        }
        const scores = Object.values(row.scores)
          .map(cell => cell.score)
          .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
        return scores.length ? scores.reduce((sum, score) => sum + score, 0) : null;
      })
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return totals.length ? Math.round((totals.reduce((sum, value) => sum + value, 0) / totals.length) * 10) / 10 : null;
  }

  function getSubjectAverage(exam: GradeExam, subject: string): number | null {
    const scores = exam.rows
      .map(row => row.scores[subject]?.score)
      .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
    return scores.length ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10 : null;
  }

  async function handleGenerateClassAnalysis(): Promise<AiClassTrendResult> {
    return generateClassAiTrend(students, appState.gradeExams, { force: false });
  }

  function handleGenerateLocalClassAnalysis(): string {
    const exams = [...appState.gradeExams].sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`));
    if (exams.length < 2) {
      return "至少需要两次考试，才能分析班级整体分数变化。";
    }

    const first = exams[0];
    const latest = exams[exams.length - 1];
    const firstAvg = getExamTotalAverage(first);
    const latestAvg = getExamTotalAverage(latest);
    const parts: string[] = [`已对比「${first.name}」到「${latest.name}」共 ${exams.length} 次考试。`];
    if (firstAvg !== null && latestAvg !== null) {
      const diff = Math.round((latestAvg - firstAvg) * 10) / 10;
      parts.push(`班级总分均分${diff >= 0 ? "上升" : "下降"} ${Math.abs(diff)} 分，最新均分 ${latestAvg}。`);
    }

    const subjectDiffs = latest.subjects
      .map(subject => {
        const start = getSubjectAverage(first, subject);
        const end = getSubjectAverage(latest, subject);
        return start === null || end === null ? null : { subject, diff: Math.round((end - start) * 10) / 10, end };
      })
      .filter((item): item is { subject: string; diff: number; end: number } => Boolean(item))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    const improved = subjectDiffs.filter(item => item.diff > 0).slice(0, 2).map(item => `${item.subject}+${item.diff}`);
    const declined = subjectDiffs.filter(item => item.diff < 0).slice(0, 2).map(item => `${item.subject}${item.diff}`);
    if (improved.length) {
      parts.push(`提升较明显：${improved.join("、")}。`);
    }
    if (declined.length) {
      parts.push(`需要关注：${declined.join("、")}。`);
    }
    if (!improved.length && !declined.length) {
      parts.push("各科均分变化较平稳，可继续结合学生个体趋势做分层跟进。");
    }
    return parts.join("");
  }

  async function handleGenerateStudentTrendAdvice(): Promise<{ generated: number; failed: number; skipped: number }> {
    if (studentAdviceRunning.current) {
      return {
        generated: studentAdviceProgress.generated,
        failed: studentAdviceProgress.failed,
        skipped: studentAdviceProgress.skipped,
      };
    }
    studentAdviceRunning.current = true;
    let generated = 0;
    let failed = 0;
    let skipped = 0;
    const eligible = students.filter(student => student.exams.length >= 2);
    setStudentAdviceProgress({
      busy: true,
      status: `正在生成学生趋势分析：0 / ${eligible.length}`,
      generated,
      failed,
      skipped,
      total: eligible.length,
    });

    for (const student of students) {
      if (student.exams.length < 2) {
        skipped += 1;
        continue;
      }
      const cached = readCachedStudentAiTrend(student);
      if (cached?.overall || cached?.changes || cached?.suggestions) {
        generated += 1;
        setStudentAdviceProgress({
          busy: true,
          status: `正在生成学生趋势分析：${generated + failed} / ${eligible.length}`,
          generated,
          failed,
          skipped,
          total: eligible.length,
        });
        continue;
      }
      try {
        await generateStudentAiTrend(student, { force: false });
        generated += 1;
      } catch {
        failed += 1;
      }
      setStudentAdviceProgress({
        busy: true,
        status: `正在生成学生趋势分析：${generated + failed} / ${eligible.length}`,
        generated,
        failed,
        skipped,
        total: eligible.length,
      });
    }

    setStudentAdviceProgress({
      busy: false,
      status: `已生成 ${generated} 人，跳过 ${skipped} 人，失败 ${failed} 人。`,
      generated,
      failed,
      skipped,
      total: eligible.length,
    });
    studentAdviceRunning.current = false;
    return { generated, failed, skipped };
  }

  async function handleImportRoster(file: File, options: RosterImportOptions): Promise<RosterImportResult> {
    saveCurrentLegacySnapshot();
    const result = await importRosterFile(file, options);
    replaceState(result.state);
    setSeatHistory([]);
    setSelectedStudentInitialTab("records");
    setSelectedStudentId(null);
    return result;
  }

  async function handleInstallApp() {
    if (!installPrompt) {
      setInstallMessage("当前浏览器没有直接提供安装确认，请按下面方式手动添加。");
      setShowInstallHelp(true);
      return;
    }

    const promptEvent = installPrompt;
    setInstallPrompt(null);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "dismissed") {
        setInstallMessage("已取消安装。需要时也可以按下面方式手动添加。");
        setShowInstallHelp(true);
      }
    } catch (error) {
      console.warn("安装确认未能打开", error);
      setInstallMessage("安装确认未能打开，请按下面方式手动添加。");
      setShowInstallHelp(true);
    }
  }

  async function handleUnbindDevice() {
    if (!await appDialog.confirm({ title: "解绑当前设备？", description: "解绑后，本机将退出登录并释放一个设备名额。下次使用需要重新输入授权码。", confirmLabel: "确认解绑", variant: "danger" })) {
      return;
    }
    try {
      flushPersistRef.current();
      await unbindCurrentDevice();
      await appDialog.notice({ title: "设备已解绑", description: "本机已经退出登录，并释放了一个设备名额。" });
      setLoggedIn(false);
    } catch {
      await appDialog.notice({ title: "解绑失败", description: "暂时无法解绑当前设备，请稍后重试。", confirmLabel: "知道了" });
    }
  }

  const {
    handleAddStudent,
    handleUpdateStudent,
    handleApplyStudentRecord,
    handleSaveAiAssistantRecord,
    handleAppendAiAssistantMaterial,
  } = useStudentActions({
    students,
    seatOrder,
    seatLayout: seatSettings.layout,
    setStudents,
    setDormitories,
    setSeatSettings,
    setAttendanceRecords,
    setFollowupTasks,
    commitSeatOrder,
    closeStudentDetail: () => {
      setSelectedStudentInitialTab("records");
      setSelectedStudentId(null);
    },
  });

  function handleArchiveStudent(studentId: StudentId) {
    replaceState(archiveStudent(appState, studentId));
    setSelectedStudentInitialTab("records");
    setSelectedStudentId(null);
  }

  function handleRestoreStudent(studentId: StudentId) {
    replaceState(restoreStudent(appState, studentId));
  }

  function handlePermanentlyDeleteStudent(studentId: StudentId) {
    deleteStudentCommentDraft(studentId);
    removeStudentFromCommentBatch(studentId);
    replaceState(permanentlyDeleteStudent(appState, studentId));
  }
  const {
    handleCreateDormitory,
    handleDeleteDormitory,
    handleAssignStudentDormitory,
    handleAddDormitoryEvent,
    handleUpdateDormEvent,
    handleDeleteDormEvent,
  } = useDormitoryActions({ students, dormitories, setStudents, setDormitories });
  const {
    handleAddFundTransaction,
    handleRemoveCreatedFundTransaction,
    handleUpdateFundTransaction,
    handleDeleteFundTransaction,
    handleClearFundTransactions,
  } = useClassFundActions({ students, fundTransactions, setFundTransactions });

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  if (workspaceStorage.status === "corrupt") {
    return <WorkspaceRecoveryScreen storage={workspaceStorage} onRecovered={() => {
      const next = inspectWorkspaceStorage();
      setWorkspaceStorage(next);
      if (next.status === "ready") reloadFromLegacyState();
    }} />;
  }

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      header={
        <TopHeader
          students={students}
          sidebarCollapsed={sidebarCollapsed}
          accountOpen={accountOpen}
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
          onToggleAccount={() => setAccountOpen(v => !v)}
          onCloseAccount={() => setAccountOpen(false)}
          onInstallApp={handleInstallApp}
          onChangePassword={USES_LICENSE_AUTH ? undefined : () => setShowChangePassword(true)}
          onOpenCloudSync={() => setShowCloudSync(true)}
          onSelectStudent={student => openStudentDetail(student)}
          onUnbindDevice={USES_LICENSE_AUTH ? handleUnbindDevice : undefined}
          onWorkspaceChanged={reloadFromLegacyState}
          onBeforeWorkspaceMutate={() => flushPersistRef.current()}
          saveStatus={saveStatus}
          onRetrySave={() => { setSaveStatus("saving"); setSaveStatus(persistState() ? "saved" : "failed"); }}
          onLogout={() => {
            flushPersistRef.current();
            clearAuth();
            setLoggedIn(false);
          }}
        />
      }
      sidebar={
        <Sidebar
          activeTab={sidebarTab}
          collapsed={sidebarCollapsed}
          students={students}
          dormitories={dormitories}
          seatOrder={seatOrder}
          gradeExams={appState.gradeExams}
          savedSeatHistoryCount={savedSeatHistory.length}
          pendingTaskCount={followupTasks.filter(task => ["overdue", "today"].includes(getTaskUrgency(task))).length}
          onTabChange={setSidebarTab}
          onOpenCommentWorkbench={openCommentWorkbench}
        />
      }
      overlays={
        <>
          <AiAssistantLauncher
            open={aiCompanionOpen}
            busy={aiCompanionBusy}
            onOpen={() => {
              setAiCompanionMounted(true);
              setAiCompanionOpen(true);
            }}
          />
          {aiCompanionMounted && (
            <RetryableLazy
              load={loadAiAssistantCompanion}
              componentProps={{
                open: aiCompanionOpen,
                activeSurfaceLabel: selectedStudent ? `学生档案 · ${selectedStudent.name}` : APP_TAB_LABELS[sidebarTab],
                students,
                exams: appState.gradeExams,
                dormitories,
                fundTransactions,
                seatOrder,
                onClose: () => setAiCompanionOpen(false),
                onBusyChange: setAiCompanionBusy,
                onSaveStudentRecord: handleSaveAiAssistantRecord,
                onAppendCommentMaterial: handleAppendAiAssistantMaterial,
              }}
              fallback={
                <div role="status" aria-label="正在打开 AI 助手" className="fixed inset-x-2 bottom-2 top-16 z-[70] grid place-items-center rounded-[var(--app-radius-lg)] border border-violet-100 bg-white text-sm font-semibold text-violet-600 shadow-[var(--app-shadow-float)] sm:inset-x-auto sm:bottom-4 sm:right-4 sm:top-[72px] sm:w-[420px]">
                  正在打开 AI 助手…
                </div>
              }
            />
          )}
          {showCommentWorkbench && (
            CommentWorkbenchComponent
              ? <CommentWorkbenchComponent students={students} transitionState={commentWorkbenchTransition} onClose={closeCommentWorkbench} onExitComplete={finishClosingCommentWorkbench} onSelectStudent={(student: AppStudent) => openStudentDetail(student)} />
              : <RetryableLazy load={loadCommentWorkbench} componentProps={{ students, transitionState: commentWorkbenchTransition, onClose: closeCommentWorkbench, onExitComplete: finishClosingCommentWorkbench, onSelectStudent: (student: AppStudent) => openStudentDetail(student) }} />
          )}

          {selectedStudent && (
            <StudentDetail
              student={selectedStudent}
              elevated={showCommentWorkbench}
              students={students}
              dormitories={dormitories}
              onClose={() => {
                setSelectedStudentInitialTab("records");
                setSelectedStudentId(null);
              }}
              onUpdateStudent={handleUpdateStudent}
              onApplyRecord={handleApplyStudentRecord}
              onDeleteStudent={handleArchiveStudent}
              onAssignDormitory={handleAssignStudentDormitory}
              onAddDormitoryEvent={handleAddDormitoryEvent}
              onOpenDormitories={() => {
                setSidebarTab("dormitories");
                setSidebarCollapsed(false);
                finishClosingCommentWorkbench();
                setSelectedStudentInitialTab("records");
                setSelectedStudentId(null);
              }}
              seatOrder={seatOrder}
              seatLayout={seatSettings.layout}
              initialActiveTab={selectedStudentInitialTab}
              onActiveTabChange={setSelectedStudentInitialTab}
              onNavigate={selectedStudentIndex >= 0 && students.length > 1 ? navigateStudentDetail : undefined}
              onSelectStudent={students.length > 1 ? setSelectedStudentId : undefined}
              navPosition={selectedStudentIndex >= 0 ? { index: selectedStudentIndex, total: students.length } : undefined}
              onCreateFollowupTask={input => {
                setSelectedStudentInitialTab("records");
                setSelectedStudentId(null);
                requestFollowupTask({ ...input, type: "常规跟进", plannedDate: todayKey(), dueDate: todayKey(), source: "ai", sourceRef: { domain: "ai", entityId: `${input.studentId}-${Date.now()}` } });
              }}
              attendanceRecords={attendanceRecords}
              followupTasks={followupTasks}
              onAttendanceChange={setAttendanceRecords}
              onActivity={recordActivity}
              homeworkAssignments={homeworkAssignments}
              communicationDrafts={communicationDrafts}
              activityEvents={appState.activityEvents}
              resolveEntityPreview={(ref, fallback) => resolveBusinessEntityPreview(appState, ref, fallback)}
              onOpenEntity={ref => {
                setSelectedStudentInitialTab("records");
                setSelectedStudentId(null);
                if (showCommentWorkbench) finishClosingCommentWorkbench();
                navigateToEntity(ref);
              }}
            />
          )}

          {shufflePreview && (
            <SeatShufflePreview
              students={students}
              currentOrder={seatOrder}
              candidate={shufflePreview}
              seatSettings={seatSettings}
              onOrderChange={handleShufflePreviewOrderChange}
              onRegenerate={handleRandomizeSeats}
              onApply={handleApplyShufflePreview}
              onClose={() => setShufflePreview(null)}
              onSelectStudent={student => openStudentDetail(student)}
            />
          )}

          {selectedHistorySnapshot && (
            <HistorySeatModal
              snapshot={selectedHistorySnapshot}
              onClose={() => setSelectedHistorySnapshot(null)}
              onSaveNote={handleUpdateSeatHistoryNote}
              onApply={handleApplySeatHistory}
              onDelete={handleDeleteSeatHistory}
            />
          )}

          {showCloudSync && (
            <CloudSyncModal
              open={showCloudSync}
              onClose={() => setShowCloudSync(false)}
              onBeforeUpload={saveCurrentLegacySnapshot}
              onRestored={reloadFromLegacyState}
            />
          )}
          <FollowupTaskDrawer open={Boolean(followupDraft)} students={students} draft={followupDraft} onClose={() => { followupAfterSave.current = null; setFollowupDraft(null); }} onConfirm={confirmFollowupTask} />
          <QuickRecordDrawer open={quickRecordOpen} students={students} presets={quickRecordPresets} onClose={() => setQuickRecordOpen(false)} onApply={applyQuickRecord} onPresetsChange={setQuickRecordPresets} />

          {showInstallHelp && (
            <InstallHelpModal message={installMessage} onClose={() => setShowInstallHelp(false)} />
          )}

          {!USES_LICENSE_AUTH && showChangePassword && (
            <ChangePasswordModal
              onClose={() => setShowChangePassword(false)}
              onPasswordChanged={() => {
                setShowChangePassword(false);
                setLoggedIn(false);
              }}
            />
          )}
        </>
      }
    >
      <div className="h-full">
        {sidebarTab === "today" && <div className="h-full workspace-tab-enter"><TodayWorkspace students={students} attendance={attendanceRecords} tasks={followupTasks} homework={homeworkAssignments} dormitories={dormitories} gradeExams={appState.gradeExams} schedule={schedule} drafts={communicationDrafts} onScheduleChange={setSchedule} onOpenSeats={() => setSidebarTab("daily")} onOpenAttendance={() => setSidebarTab("attendance")} onOpenTasks={() => { setFollowupMode("tasks"); setSidebarTab("followups"); }} onOpenHomework={() => { setFollowupMode("homework"); setSidebarTab("followups"); }} onOpenQuickRecord={() => setQuickRecordOpen(true)} onOpenEntity={navigateToEntity} onCompleteTask={handleCompleteTodayTask} onSaveTaskResolution={handleSaveTodayTaskResolution} onContinueTask={handleContinueTodayTask} initialDraftId={timelineTarget?.workspace === "today" ? timelineTarget.entityId : undefined} onInitialDraftConsumed={consumeTimelineTarget} /></div>}
        {sidebarTab === "daily" && (
          <div className="h-full workspace-tab-enter">
            <DailyWorkspace
              students={students}
              seatOrder={seatOrder}
              lockedSeats={lockedSeats}
              seatSettings={seatSettings}
              canUndoSeatOrder={seatHistory.length > 0}
              onRandomizeSeats={handleRandomizeSeats}
              onOrderSeatsByList={handleOrderSeatsByList}
              onUndoSeatOrder={handleUndoSeatOrder}
              onUpdateSeatSettings={updateSeatSettings}
              onApplySeatLayout={applySeatLayout}
              onAddStudent={handleAddStudent}
              onSelectStudent={student => openStudentDetail(student)}
              onOpenStudentFollowup={student => openStudentDetail(student, "followup")}
              onMoveSeat={handleMoveSeat}
              onAssignStudentToSeat={handleAssignStudentToSeat}
              onToggleLock={toggleLock}
              drawSessions={drawSessions}
              onDrawSessionsChange={setDrawSessions}
              attendanceRecords={attendanceRecords}
              followupTasks={followupTasks}
              onOpenAttendance={() => setSidebarTab("attendance")}
              onOpenFollowups={() => setSidebarTab("followups")}
            />
          </div>
        )}

        {sidebarTab === "dormitories" && (
          <div className="h-full workspace-tab-enter">
            <DormitoryWorkspace
              students={students}
              dormitories={dormitories}
              onCreateDormitory={handleCreateDormitory}
              onDeleteDormitory={handleDeleteDormitory}
              onAssignStudentDormitory={handleAssignStudentDormitory}
              onAddDormitoryEvent={handleAddDormitoryEvent}
              onUpdateDormitoryEvent={handleUpdateDormEvent}
              onDeleteDormitoryEvent={handleDeleteDormEvent}
              onSelectStudent={student => openStudentDetail(student)}
              followupTasks={followupTasks}
              onRequestFollowupTask={requestFollowupTask}
              onActivity={recordActivity}
              onSetLinkedTaskStatus={handleSetLinkedTaskStatus}
              periodSettings={dormitoryPeriodSettings}
              onPeriodSettingsChange={settings => setSettings(current => ({ ...current, dormitoryPeriod: settings }))}
              preferences={appState.settings.dormitoryPreferences}
              onPreferencesChange={preferences => setSettings(current => ({ ...current, dormitoryPreferences: preferences }))}
              initialTarget={timelineTarget?.workspace === "dormitories" ? timelineTarget : undefined}
              onInitialTargetConsumed={consumeTimelineTarget}
            />
          </div>
        )}

        {sidebarTab === "attendance" && <div className="h-full workspace-tab-enter"><AttendanceWorkspace students={students} records={attendanceRecords} tasks={followupTasks} onChange={setAttendanceRecords} onRequestTask={requestFollowupTask} onActivity={recordActivity} onOpenTask={taskId => openTimelineTarget({ kind: "workspace", workspace: "followups", entityId: taskId })} initialTarget={timelineTarget?.workspace === "attendance" ? timelineTarget : undefined} onInitialTargetConsumed={consumeTimelineTarget} /></div>}

        {sidebarTab === "followups" && <div className="h-full workspace-tab-enter"><FollowupWorkspace key={followupMode} students={students} tasks={followupTasks} homeworkAssignments={homeworkAssignments} subjectCatalog={subjectCatalog} onChange={setFollowupTasks} onHomeworkChange={setHomeworkAssignments} onSubjectCatalogChange={subjects => setSettings(current => ({ ...current, subjectCatalog: subjects }))} onRequestTask={requestFollowupTask} onActivity={recordActivity} onOpenSource={navigateToEntity} sourceExists={ref => businessEntityExists(appState, ref)} initialTarget={timelineTarget?.workspace === "followups" ? timelineTarget : undefined} onInitialTargetConsumed={consumeTimelineTarget} initialMode={followupMode} /></div>}

        {sidebarTab === "scores" && (
          <div className="h-full workspace-tab-enter">
            <RetryableLazy load={loadScoresWorkspace} componentProps={{ exams: appState.gradeExams, students, tasks: followupTasks, gradeThresholds, onGradeThresholdsChange: (next: GradeThresholds) => setSettings(current => ({ ...current, gradeThresholds: next })), initialTarget: timelineTarget?.workspace === "scores" ? timelineTarget : undefined, onInitialTargetConsumed: consumeTimelineTarget, onOpenTask: (taskId: string) => openTimelineTarget({ kind: "workspace", workspace: "followups", entityId: taskId }), onSelectStudent: (student: AppStudent) => openStudentDetail(student), onOpenStudentFollowup: (student: AppStudent) => openStudentDetail(student, "followup"), onSaveScoreImport: handleSaveScoreImport, onUpdateGradeExam: handleUpdateGradeExam, onDeleteGradeExam: handleDeleteGradeExam, onGenerateClassAnalysis: handleGenerateClassAnalysis, onGenerateLocalClassAnalysis: handleGenerateLocalClassAnalysis, onGenerateStudentTrendAdvice: handleGenerateStudentTrendAdvice, studentAdviceProgress, onSaveItemAnalysis: handleSaveGradeItemAnalysis, onCreateScoreFollowup: (studentId: string, exam: GradeExam, reason: string) => requestFollowupTask({ studentId, title: `跟进考试：${exam.name}`, type: "学业关注", description: reason, plannedDate: todayKey(), dueDate: todayKey(), source: "score", sourceRef: { domain: "score", entityId: exam.id, studentId } }), onCreateQuestionFollowups: (studentIds: StudentId[], exam: GradeExam, question: GradeQuestionDefinition) => requestFollowupTask({ studentId: studentIds[0], studentIds, title: `跟进${exam.name} · ${question.label}`, type: "学业关注", description: question.knowledgePoints.length ? `薄弱知识点：${question.knowledgePoints.join("、")}` : `${question.label}得分低于 60%`, plannedDate: todayKey(), dueDate: todayKey(), source: "score", sourceRef: { domain: "score", entityId: exam.id, subEntityId: question.id } }) }} />
          </div>
        )}

        {sidebarTab === "data" && (
          <div className="h-full workspace-tab-enter">
            <DataWorkspace
              students={students}
              archivedStudents={allStudents.filter(student => student.enrollmentStatus === "archived")}
              seatOrder={seatOrder}
              seatLayout={seatSettings.layout}
              onImportRoster={handleImportRoster}
              onBeforeBackupExport={saveCurrentLegacySnapshot}
              onBackupImported={reloadFromLegacyState}
              healthIssues={healthIssues}
              onRestoreStudent={handleRestoreStudent}
              onPermanentlyDeleteStudent={handlePermanentlyDeleteStudent}
            />
          </div>
        )}

        {sidebarTab === "history" && (
          <div className="h-full workspace-tab-enter">
            <HistoryWorkspace
              students={students}
              history={savedSeatHistory}
              timeline={historyTimeline}
              onSave={handleSaveSeatHistory}
              onRename={handleUpdateSeatHistoryNote}
              onView={setSelectedHistorySnapshot}
              onApply={handleApplySeatHistory}
              onDelete={handleDeleteSeatHistory}
              onOpenTimeline={openTimelineTarget}
            />
          </div>
        )}

        {sidebarTab === "funds" && (
          <div className="h-full workspace-tab-enter">
            <ClassFundWorkspace
              transactions={fundTransactions}
              students={students}
              onAdd={handleAddFundTransaction}
              onRemoveCreated={handleRemoveCreatedFundTransaction}
              onUpdate={handleUpdateFundTransaction}
              onDelete={handleDeleteFundTransaction}
              onClearAll={handleClearFundTransactions}
              onRequestFollowupTask={requestFollowupTask}
              onActivity={recordActivity}
            />
          </div>
        )}
      </div>
      {appDialog.dialog}
      {actionToast.toast}
    </AppShell>
  );
}
