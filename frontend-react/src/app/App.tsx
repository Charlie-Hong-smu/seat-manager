import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

import { AppShell } from "./components/AppShell";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar, type SidebarTab } from "./components/Sidebar";
import { StudentDetail } from "./components/StudentDetail";
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
import type { AppStudent, GradeExam, GradeItemAnalysis, SavedGradeExamRecord, SeatHistorySnapshot, SeatLayoutV1, SeatSettings, StudentId } from "./state/types";
import { useStudentActions } from "./hooks/useStudentActions";
import { useDormitoryActions } from "./hooks/useDormitoryActions";
import { useClassFundActions } from "./hooks/useClassFundActions";
import { createFollowupTask, findOpenLinkedTask, getTaskUrgency, todayKey } from "./state/dailyManagement";
import { FollowupTaskDrawer, type FollowupTaskDraft } from "./components/FollowupTaskDrawer";
import { buildTimeline, inspectStateHealth, type TimelineTarget } from "./state/dataInsights";
import { useActionToast, useAppDialog } from "./components/ui";
import { normalizeDormitoryPeriodSettings } from "./state/dormitoryPeriods";
import { resolveSeatLayout } from "./state/seatLayout";
import { WorkspaceRecoveryScreen } from "./components/WorkspaceRecoveryScreen";
import { inspectWorkspaceStorage } from "./state/workspaces";
import { TodayWorkspace } from "./components/workspaces/TodayWorkspace";
import { QuickRecordDrawer, type QuickRecordInput } from "./components/QuickRecordDrawer";
import { normalizeSubjectCatalog } from "./state/teacherWorkbench";

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
const loadAiAssistantWorkspace = () => import("./components/AiAssistantWorkspace").then((module) => ({ default: module.AiAssistantWorkspace }));
const loadScoresWorkspace = () => import("./components/workspaces/ScoresWorkspace").then((module) => ({ default: module.ScoresWorkspace }));

export default function App() {
  const appDialog = useAppDialog();
  const actionToast = useActionToast();
  const initialState = useSeatManagerState();
  const controller = useSeatManagerController(initialState);
  const appState = controller.state;
  const { students, dormitories, fundTransactions, attendanceRecords, followupTasks, drawSessions, seatOrder, seatSettings, schedule, homeworkAssignments, quickRecordPresets, communicationDrafts } = appState;
  const savedSeatHistory = appState.seatHistory;
  const lockedSeats = new Set(appState.lockedSeats);
  const { setStudents, setDormitories, setFundTransactions, setAttendanceRecords, setFollowupTasks, setDrawSessions, setSeatOrder, setSeatSettings, setSettings, setLockedSeats, setSeatHistory: setSavedSeatHistory, setSchedule, setHomeworkAssignments, setQuickRecordPresets, setCommunicationDrafts } = controller;
  const dormitoryPeriodSettings = normalizeDormitoryPeriodSettings(appState.settings.dormitoryPeriod);
  const subjectCatalog = normalizeSubjectCatalog(appState.settings.subjectCatalog, [
    ...schedule.entries.map(entry => entry.subject),
    ...homeworkAssignments.map(assignment => assignment.subject),
    ...appState.gradeExams.flatMap(exam => exam.subjects),
  ]);
  const { persist: persistState, reload: reloadState, replace: replaceState } = controller;
  const [loggedIn, setLoggedIn] = useState(() => isAuthenticated());
  const [workspaceStorage, setWorkspaceStorage] = useState(() => inspectWorkspaceStorage());
  const [sidebarTab, setSidebarTab] = useState<AppTab>("today");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 1199px)").matches);
  const [selectedStudentId, setSelectedStudentId] = useState<StudentId | null>(null);
  const selectedStudent = students.find(student => student.id === selectedStudentId) || null;
  const [selectedStudentInitialTab, setSelectedStudentInitialTab] = useState<"records" | "profile" | "trend" | "followup">("records");
  const [showCommentWorkbench, setShowCommentWorkbench] = useState(false);
  const [commentWorkbenchTransition, setCommentWorkbenchTransition] = useState<"preparing" | "open" | "closing">("preparing");
  const [CommentWorkbenchComponent, setCommentWorkbenchComponent] = useState<Awaited<ReturnType<typeof loadCommentWorkbench>>["default"] | null>(null);
  const [aiWorkspaceMounted, setAiWorkspaceMounted] = useState(false);
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

  function applyQuickRecord(input: QuickRecordInput) {
    const previous = students;
    const now = new Date().toISOString();
    setStudents(current => current.map(student => input.studentIds.includes(student.id) ? { ...student, records: [{ id: `record-${Date.now()}-${student.id}`, type: input.type, note: input.note, date: todayKey(), score: input.score, presetId: input.presetId, createdAt: now }, ...student.records] } : student));
    return () => setStudents(previous);
  }

  function requestFollowupTask(draft: FollowupTaskDraft, afterSave?: (taskIds: string[]) => void) {
    if (!draft.id && draft.sourceRef) {
      const existing = findOpenLinkedTask(followupTasks, draft.studentId, draft.sourceRef);
      if (existing) {
        setFollowupDraft({ id: existing.id, studentId: existing.studentId, title: existing.title, type: existing.type, description: existing.description, plannedDate: existing.plannedDate, dueDate: existing.dueDate, source: existing.source, sourceRef: existing.sourceRef });
        return;
      }
    }
    followupAfterSave.current = afterSave || null;
    setFollowupDraft(draft);
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
      const created = studentIds.map(studentId => createFollowupTask({ ...draft, studentId }));
      savedIds = created.map(task => task.id);
      setFollowupTasks(current => [...created, ...current]);
    }
    afterSave?.(savedIds);
    followupAfterSave.current = null;
    setFollowupDraft(null);
    actionToast.show({
      message: wasEditing ? "跟进任务修改已保存" : savedIds.length > 1 ? `已创建 ${savedIds.length} 项跟进任务` : "跟进任务已创建",
      actionLabel: "撤销",
      actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
      onAction: () => {
        if (previousTask) {
          setFollowupTasks(current => current.map(task => task.id === previousTask.id ? previousTask : task));
          return;
        }
        const idSet = new Set(savedIds);
        setFollowupTasks(current => current.filter(task => !idSet.has(task.id)));
        afterSave?.([]);
      },
      duration: 6000,
    });
  }

  useEffect(() => {
    if (sidebarTab === "ai") setAiWorkspaceMounted(true);
  }, [sidebarTab]);

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

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (!loggedIn || workspaceStorage.status === "corrupt") {
      return;
    }
    setSaveStatus("saving");
    const saved = persistState();
    if (saved) setSaveStatus("saved");
    else {
      try { const probe = "seat-manager-storage-probe"; localStorage.setItem(probe, "1"); localStorage.removeItem(probe); setSaveStatus("failed"); } catch { setSaveStatus("quota"); }
    }
  }, [appState, loggedIn, persistState, workspaceStorage.status]);

  useEffect(() => {
    if (!loggedIn || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const due = followupTasks.filter(task => ["overdue", "today"].includes(getTaskUrgency(task)) && task.lastNotifiedAt?.slice(0, 10) !== new Date().toISOString().slice(0, 10));
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
      students,
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

  function openStudentDetail(student: AppStudent, initialTab: "records" | "profile" | "trend" | "followup" = "records") {
    setSelectedStudentInitialTab(initialTab);
    setSelectedStudentId(student.id);
  }

  function openTimelineTarget(target: TimelineTarget) {
    if (target.kind === "student") {
      const student = students.find(item => item.id === target.studentId || item.id === target.entityId);
      if (student) openStudentDetail(student, target.studentTab || "records");
      return;
    }
    if (!target.workspace) return;
    if (target.workspace === "followups") setFollowupMode(homeworkAssignments.some(item => item.id === target.entityId) ? "homework" : "tasks");
    setTimelineTarget({ ...target });
    setSidebarTab(target.workspace);
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
    const next = saveGradeExamRecord({
      record,
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      settings: appState.settings,
      dormitories,
      seatHistory: savedSeatHistory,
    });
    if (!next) {
      return null;
    }
    replaceState(next);
    setSeatHistory([]);
    setSidebarTab("scores");
    return next.gradeExams.find(exam => exam.id === record.id) || next.gradeExams[0] || null;
  }

  function handleUpdateGradeExam(examId: string, name: string, date: string): boolean {
    const next = updateGradeExamRecordMetadata({
      examId,
      name,
      date,
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      settings: appState.settings,
      dormitories,
      seatHistory: savedSeatHistory,
    });
    if (!next) {
      return false;
    }
    replaceState(next);
    return true;
  }

  function handleDeleteGradeExam(examId: string): boolean {
    const next = deleteGradeExamRecord({
      examId,
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      settings: appState.settings,
      dormitories,
      seatHistory: savedSeatHistory,
    });
    if (!next) {
      return false;
    }
    replaceState(next);
    return true;
  }

  function handleSaveGradeItemAnalysis(examId: string, itemAnalysis: GradeItemAnalysis): boolean {
    const next = updateGradeExamItemAnalysis({ examId, itemAnalysis, students, seatOrder, lockedSeats: [...lockedSeats], seatSettings, settings: appState.settings, dormitories, seatHistory: savedSeatHistory, fundTransactions, attendanceRecords, followupTasks, drawSessions, schedule, homeworkAssignments, quickRecordPresets, communicationDrafts });
    if (!next) return false;
    replaceState(next);
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
    handleDeleteStudent,
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
  } = useClassFundActions({ students, setFundTransactions });

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
          saveStatus={saveStatus}
          onRetrySave={() => { setSaveStatus("saving"); setSaveStatus(persistState() ? "saved" : "failed"); }}
          onLogout={() => {
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
          {showCommentWorkbench && (
            CommentWorkbenchComponent
              ? <CommentWorkbenchComponent students={students} transitionState={commentWorkbenchTransition} onClose={closeCommentWorkbench} onExitComplete={finishClosingCommentWorkbench} onSelectStudent={(student: AppStudent) => openStudentDetail(student)} />
              : <RetryableLazy load={loadCommentWorkbench} componentProps={{ students, transitionState: commentWorkbenchTransition, onClose: closeCommentWorkbench, onExitComplete: finishClosingCommentWorkbench, onSelectStudent: (student: AppStudent) => openStudentDetail(student) }} />
          )}

          {selectedStudent && (
            <StudentDetail
              student={selectedStudent}
              students={students}
              dormitories={dormitories}
              onClose={() => {
                setSelectedStudentInitialTab("records");
                setSelectedStudentId(null);
              }}
              onUpdateStudent={handleUpdateStudent}
              onApplyRecord={handleApplyStudentRecord}
              onDeleteStudent={handleDeleteStudent}
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
              onCreateFollowupTask={input => requestFollowupTask({ ...input, type: "常规跟进", plannedDate: todayKey(), dueDate: todayKey(), source: "ai", sourceRef: { domain: "ai", entityId: `${input.studentId}-${Date.now()}` } })}
              attendanceRecords={attendanceRecords}
              followupTasks={followupTasks}
              onAttendanceChange={setAttendanceRecords}
              homeworkAssignments={homeworkAssignments}
              communicationDrafts={communicationDrafts}
              onCommunicationDraftsChange={setCommunicationDrafts}
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
        {sidebarTab === "today" && <div className="h-full workspace-tab-enter"><TodayWorkspace students={students} attendance={attendanceRecords} tasks={followupTasks} homework={homeworkAssignments} schedule={schedule} drafts={communicationDrafts} onScheduleChange={setSchedule} onDraftsChange={setCommunicationDrafts} onOpenSeats={() => setSidebarTab("daily")} onOpenAttendance={() => setSidebarTab("attendance")} onOpenTasks={() => { setFollowupMode("tasks"); setSidebarTab("followups"); }} onOpenHomework={() => { setFollowupMode("homework"); setSidebarTab("followups"); }} onOpenQuickRecord={() => setQuickRecordOpen(true)} /></div>}
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
              onSetLinkedTaskStatus={(taskIds, status) => { const now = new Date().toISOString(); setFollowupTasks(current => current.map(task => taskIds.includes(task.id) ? { ...task, status, updatedAt: now, completedAt: status === "completed" ? now : undefined } : task)); }}
              periodSettings={dormitoryPeriodSettings}
              onPeriodSettingsChange={settings => setSettings(current => ({ ...current, dormitoryPeriod: settings }))}
            />
          </div>
        )}

        {sidebarTab === "attendance" && <div className="h-full workspace-tab-enter"><AttendanceWorkspace students={students} records={attendanceRecords} onChange={setAttendanceRecords} onRequestTask={requestFollowupTask} initialTarget={timelineTarget?.workspace === "attendance" ? timelineTarget : undefined} /></div>}

        {sidebarTab === "followups" && <div className="h-full workspace-tab-enter"><FollowupWorkspace key={followupMode} students={students} tasks={followupTasks} homeworkAssignments={homeworkAssignments} subjectCatalog={subjectCatalog} onChange={setFollowupTasks} onHomeworkChange={setHomeworkAssignments} onSubjectCatalogChange={subjects => setSettings(current => ({ ...current, subjectCatalog: subjects }))} onRequestTask={requestFollowupTask} initialTarget={timelineTarget?.workspace === "followups" ? timelineTarget : undefined} initialMode={followupMode} /></div>}

        {sidebarTab === "scores" && (
          <div className="h-full workspace-tab-enter">
            <RetryableLazy load={loadScoresWorkspace} componentProps={{ exams: appState.gradeExams, students, onSelectStudent: (student: AppStudent) => openStudentDetail(student), onOpenStudentFollowup: (student: AppStudent) => openStudentDetail(student, "followup"), onSaveScoreImport: handleSaveScoreImport, onUpdateGradeExam: handleUpdateGradeExam, onDeleteGradeExam: handleDeleteGradeExam, onGenerateClassAnalysis: handleGenerateClassAnalysis, onGenerateLocalClassAnalysis: handleGenerateLocalClassAnalysis, onGenerateStudentTrendAdvice: handleGenerateStudentTrendAdvice, studentAdviceProgress, onSaveItemAnalysis: handleSaveGradeItemAnalysis, onCreateScoreFollowup: (studentId: string, exam: GradeExam, reason: string) => requestFollowupTask({ studentId, title: `跟进考试：${exam.name}`, type: "学业关注", description: reason, plannedDate: todayKey(), dueDate: todayKey(), source: "score", sourceRef: { domain: "score", entityId: exam.id } }) }} />
          </div>
        )}

        {aiWorkspaceMounted && <div className={sidebarTab === "ai" ? "h-full workspace-tab-enter" : "hidden"}>
          <RetryableLazy load={loadAiAssistantWorkspace} componentProps={{ active: sidebarTab === "ai", students, exams: appState.gradeExams, dormitories, fundTransactions, seatOrder, onSaveStudentRecord: handleSaveAiAssistantRecord, onAppendCommentMaterial: handleAppendAiAssistantMaterial }} />
        </div>}

        {sidebarTab === "data" && (
          <div className="h-full workspace-tab-enter">
            <DataWorkspace
              students={students}
              seatOrder={seatOrder}
              seatLayout={seatSettings.layout}
              onImportRoster={handleImportRoster}
              onBeforeBackupExport={saveCurrentLegacySnapshot}
              onBackupImported={reloadFromLegacyState}
              healthIssues={inspectStateHealth(appState)}
            />
          </div>
        )}

        {sidebarTab === "history" && (
          <div className="h-full workspace-tab-enter">
            <HistoryWorkspace
              students={students}
              history={savedSeatHistory}
              timeline={buildTimeline(appState)}
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
            />
          </div>
        )}
      </div>
      {appDialog.dialog}
      {actionToast.toast}
    </AppShell>
  );
}
