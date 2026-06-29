import { useEffect, useRef, useState } from "react";

import { AppShell } from "./components/AppShell";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar, type SidebarTab } from "./components/Sidebar";
import { StudentDetail } from "./components/StudentDetail";
import { CommentWorkbench } from "./components/CommentWorkbench";
import { TopHeader } from "./components/TopHeader";
import { CloudSyncModal } from "./components/CloudSyncModal";
import { InstallHelpModal } from "./components/InstallHelpModal";
import { ChangePasswordModal } from "./components/ChangePasswordModal";
import { SeatShufflePreview } from "./components/SeatShufflePreview";
import { HistorySeatModal } from "./components/HistorySeatModal";
import { DailyWorkspace, DataWorkspace, DormitoryWorkspace, HistoryWorkspace, ScoresWorkspace } from "./components/WorkspacePages";
import {
  buildSeatOrderByStudentList,
  placeStudentInFirstEmptySeat,
  swapSeatOrder,
  type SeatOrder,
} from "./state/seatActions";
import { buildBestShuffleCandidate, evaluateSeatOrder, type ShuffleCandidate } from "./state/seatPlanner";
import { clearAuth, isAuthenticated } from "./state/authStorage";
import { IS_COMMERCIAL } from "./config";
import { createSeatManagerState } from "./state/legacyStateAdapter";
import { closeDormitoryPeriod, createDormEvent, createDormitory, createDormStudentRecord, normalizeDormitoryScore, type NewDormEventInput } from "./state/dormitoryActions";
import { createStudent } from "./state/studentActions";
import { deleteGradeExamRecord, saveGradeExamRecord, saveLegacySnapshot, updateGradeExamRecordMetadata } from "./state/legacyWriteAdapter";
import { importRosterFile, type RosterImportOptions, type RosterImportResult } from "./state/rosterImport";
import { readLegacyRootState } from "./state/storage";
import { useSeatManagerState } from "./state/store";
import { generateClassAiTrend, generateStudentAiTrend, readCachedStudentAiTrend, type AiClassTrendResult } from "./state/aiTrendService";
import type { AppStudent, Dormitory, Gender, GradeExam, SavedGradeExamRecord, SeatHistorySnapshot, SeatSettings, StudentId, StudentRecord } from "./state/types";

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

export default function App() {
  const initialState = useSeatManagerState();
  const [appState, setAppState] = useState(() => initialState);
  const [loggedIn, setLoggedIn] = useState(() => isAuthenticated());
  const [sidebarTab, setSidebarTab] = useState<AppTab>("daily");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [students, setStudents] = useState<AppStudent[]>(() => initialState.students);
  const [dormitories, setDormitories] = useState<Dormitory[]>(() => initialState.dormitories);
  const [selectedStudent, setSelectedStudent] = useState<AppStudent | null>(null);
  const [showCommentWorkbench, setShowCommentWorkbench] = useState(false);
  const [seatOrder, setSeatOrder] = useState<SeatOrder>(() => initialState.seatOrder);
  const [seatHistory, setSeatHistory] = useState<SeatOrder[]>([]);
  const [savedSeatHistory, setSavedSeatHistory] = useState<SeatHistorySnapshot[]>(() => initialState.seatHistory);
  const [selectedHistorySnapshot, setSelectedHistorySnapshot] = useState<SeatHistorySnapshot | null>(null);
  const [lockedSeats, setLockedSeats] = useState<Set<number>>(() => new Set(initialState.lockedSeats));
  const [seatSettings, setSeatSettings] = useState<SeatSettings>(() => initialState.seatSettings);
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
  const hasMounted = useRef(false);
  const studentAdviceRunning = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (!loggedIn) {
      return;
    }
    saveLegacySnapshot({
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      dormitories,
      seatHistory: savedSeatHistory,
    });
  }, [students, seatOrder, lockedSeats, seatSettings, dormitories, savedSeatHistory, loggedIn]);

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
    setSeatSettings(current => {
      const next = updater(current);
      setAppState(prev => ({ ...prev, seatSettings: next }));
      return next;
    });
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

  function handleSaveSeatHistory(note: string) {
    if (!students.length) {
      return;
    }
    const studentById = new Map(students.map(student => [student.id, student]));
    const rows = Math.max(1, Math.ceil(seatOrder.length / 8));
    const snapshot: SeatHistorySnapshot = {
      id: createSnapshotId(),
      time: new Date().toISOString(),
      note: note.trim(),
      rows,
      seats: seatOrder.map(id => (id ? studentById.get(id)?.name || "" : "")),
    };
    setSavedSeatHistory(prev => [snapshot, ...prev].slice(0, 20));
    setSelectedHistorySnapshot(snapshot);
  }

  function handleUpdateSeatHistoryNote(id: string, note: string) {
    setSavedSeatHistory(prev => prev.map(item => (item.id === id ? { ...item, note: note.trim() } : item)));
    setSelectedHistorySnapshot(prev => (prev?.id === id ? { ...prev, note: note.trim() } : prev));
  }

  function handleDeleteSeatHistory(id: string) {
    setSavedSeatHistory(prev => prev.filter(item => item.id !== id));
    setSelectedHistorySnapshot(prev => (prev?.id === id ? null : prev));
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
    commitSeatOrder(next);
    setSelectedHistorySnapshot(null);
  }

  function handleOrderSeatsByList() {
    commitSeatOrder(buildSeatOrderByStudentList(students));
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

  function handleAddStudent(name: string, gender: Gender, alias?: string) {
    const student = createStudent({ name, gender, alias });
    setStudents(prev => [...prev, student]);
    commitSeatOrder(placeStudentInFirstEmptySeat(seatOrder, student.id, students.length + 1));
  }

  function handleUpdateStudent(nextStudent: AppStudent) {
    setStudents(prev => prev.map(student => (student.id === nextStudent.id ? nextStudent : student)));
    setSelectedStudent(nextStudent);
  }

  function handleCreateDormitory(name: string, baseScore: number) {
    const dormitory = createDormitory(name, baseScore);
    setDormitories(prev => [dormitory, ...prev]);
    return dormitory;
  }

  function handleUpdateDormitory(dormitoryId: string, patch: Partial<Pick<Dormitory, "name" | "baseScore">>) {
    setDormitories(prev => prev.map(dormitory => {
      if (dormitory.id !== dormitoryId) {
        return dormitory;
      }
      return normalizeDormitoryScore({
        ...dormitory,
        name: patch.name !== undefined ? patch.name.trim() || dormitory.name : dormitory.name,
        baseScore: patch.baseScore !== undefined && Number.isFinite(patch.baseScore) ? patch.baseScore : dormitory.baseScore,
      });
    }));
  }

  function handleDeleteDormitory(dormitoryId: string) {
    setDormitories(prev => prev.filter(dormitory => dormitory.id !== dormitoryId));
    setStudents(prev => prev.map(student => (
      student.dormitoryId === dormitoryId ? { ...student, dormitoryId: undefined } : student
    )));
    setSelectedStudent(prev => (
      prev?.dormitoryId === dormitoryId ? { ...prev, dormitoryId: undefined } : prev
    ));
  }

  function handleAssignStudentDormitory(studentId: StudentId, dormitoryId?: string) {
    const targetDormitory = dormitoryId ? dormitories.find(dormitory => dormitory.id === dormitoryId) : undefined;
    const nextDormitoryId = targetDormitory?.id;
    setStudents(prev => prev.map(student => (
      student.id === studentId ? { ...student, dormitoryId: nextDormitoryId } : student
    )));
    setDormitories(prev => prev.map(dormitory => {
      const withoutStudent = dormitory.memberIds.filter(id => id !== studentId);
      const memberIds = dormitory.id === nextDormitoryId ? [...withoutStudent, studentId] : withoutStudent;
      return { ...dormitory, memberIds: Array.from(new Set(memberIds)) };
    }));
    setSelectedStudent(prev => (
      prev?.id === studentId ? { ...prev, dormitoryId: nextDormitoryId } : prev
    ));
  }

  function handleAddDormitoryEvent(input: NewDormEventInput) {
    const dormitory = dormitories.find(item => item.id === input.dormId);
    if (!dormitory) {
      return null;
    }
    const event = createDormEvent(input, students);
    const nextDormitory = normalizeDormitoryScore({
      ...dormitory,
      events: [event, ...dormitory.events].slice(0, 200),
    });
    setDormitories(prev => prev.map(item => (item.id === dormitory.id ? nextDormitory : item)));
    const record = input.recordToStudent === false ? null : createDormStudentRecord(event, nextDormitory);
    if (record && event.responsibleStudentId) {
      setStudents(prev => prev.map(student => (
        student.id === event.responsibleStudentId
          ? { ...student, records: [record, ...student.records] }
          : student
      )));
      setSelectedStudent(prev => (
        prev?.id === event.responsibleStudentId
          ? { ...prev, records: [record, ...prev.records] }
          : prev
      ));
    }
    return event;
  }

  function handleUpdateDormEvent(dormId: string, eventId: string, patch: { reason?: string; score?: number; note?: string; punishment?: string; punishmentDone?: boolean }) {
    setDormitories(prev => prev.map(dormitory => {
      if (dormitory.id !== dormId) {
        return dormitory;
      }
      const events = dormitory.events.map(event => {
        if (event.id !== eventId) {
          return event;
        }
        const nextScore = patch.score !== undefined && Number.isFinite(patch.score) ? Math.round(patch.score * 10) / 10 : event.score;
        return {
          ...event,
          reason: patch.reason !== undefined ? patch.reason.trim() || event.reason : event.reason,
          score: nextScore,
          type: nextScore > 0 ? "reward" : nextScore < 0 ? "punish" : "note",
          note: patch.note !== undefined ? patch.note.trim() : event.note,
          punishment: patch.punishment !== undefined ? patch.punishment.trim() : event.punishment,
          punishmentDone: patch.punishmentDone !== undefined ? patch.punishmentDone : event.punishmentDone,
        };
      });
      return normalizeDormitoryScore({ ...dormitory, events });
    }));
  }

  function handleDeleteDormEvent(dormId: string, eventId: string) {
    let responsibleStudentId: StudentId | undefined;
    setDormitories(prev => prev.map(dormitory => {
      if (dormitory.id !== dormId) {
        return dormitory;
      }
      const target = dormitory.events.find(event => event.id === eventId);
      responsibleStudentId = target?.responsibleStudentId;
      return normalizeDormitoryScore({
        ...dormitory,
        events: dormitory.events.filter(event => event.id !== eventId),
      });
    }));
    // 删除事件时，一并清掉当初联动写入责任人个人档案的那条记录（id 为 record-<eventId>），保持一致。
    if (responsibleStudentId) {
      const linkedRecordId = `record-${eventId}`;
      setStudents(prev => prev.map(student => (
        student.id === responsibleStudentId
          ? { ...student, records: student.records.filter(record => record.id !== linkedRecordId) }
          : student
      )));
      setSelectedStudent(prev => (
        prev?.id === responsibleStudentId
          ? { ...prev, records: prev.records.filter(record => record.id !== linkedRecordId) }
          : prev
      ));
    }
  }

  function handleCloseDormitoryPeriod(dormId: string, options: { carryOver?: boolean } = {}) {
    setDormitories(prev => prev.map(dormitory => (
      dormitory.id === dormId ? closeDormitoryPeriod(dormitory, options) : dormitory
    )));
  }

  function handleCloseAllDormitoryPeriods(options: { carryOver?: boolean } = {}) {
    setDormitories(prev => prev.map(dormitory => (
      dormitory.events.length ? closeDormitoryPeriod(dormitory, options) : dormitory
    )));
  }

  function handleApplyStudentRecord(studentId: StudentId, record: StudentRecord, syncIds: StudentId[]) {
    const syncSet = new Set(syncIds.filter(id => id !== studentId));
    setStudents(prev => prev.map(student => {
      if (student.id === studentId) {
        return { ...student, records: [record, ...student.records] };
      }
      if (syncSet.has(student.id)) {
        return {
          ...student,
          records: [{ ...record, id: `${record.id}-${student.id}` }, ...student.records],
        };
      }
      return student;
    }));
    setSelectedStudent(prev => (
      prev?.id === studentId ? { ...prev, records: [record, ...prev.records] } : prev
    ));
  }

  function handleDeleteStudent(studentId: StudentId) {
    setStudents(prev => prev.filter(student => student.id !== studentId));
    setDormitories(prev => prev.map(dormitory => ({
      ...dormitory,
      memberIds: dormitory.memberIds.filter(id => id !== studentId),
    })));
    commitSeatOrder(seatOrder.map(id => (id === studentId ? null : id)));
    updateSeatSettings(current => ({
      ...current,
      constraints: {
        ...current.constraints,
        lockedDeskmatePairs: current.constraints.lockedDeskmatePairs.filter(pair => pair.a !== studentId && pair.b !== studentId),
        noDeskmatePairs: current.constraints.noDeskmatePairs.filter(pair => pair.a !== studentId && pair.b !== studentId),
        frontRowStudentIds: current.constraints.frontRowStudentIds.filter(id => id !== studentId),
      },
    }));
    setSelectedStudent(null);
  }

  function saveCurrentLegacySnapshot() {
    saveLegacySnapshot({
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      dormitories,
      seatHistory: savedSeatHistory,
    });
  }

  function reloadFromLegacyState() {
    const next = createSeatManagerState(readLegacyRootState());
    setAppState(next);
    setStudents(next.students);
    setSeatOrder(next.seatOrder);
    setLockedSeats(new Set(next.lockedSeats));
    setSeatSettings(next.seatSettings);
    setDormitories(next.dormitories);
    setSavedSeatHistory(next.seatHistory);
    setSeatHistory([]);
    setSelectedStudent(null);
  }

  function handleSaveScoreImport(record: SavedGradeExamRecord): GradeExam | null {
    const next = saveGradeExamRecord({
      record,
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      dormitories,
      seatHistory: savedSeatHistory,
    });
    if (!next) {
      return null;
    }
    setAppState(next);
    setStudents(next.students);
    setSeatOrder(next.seatOrder);
    setLockedSeats(new Set(next.lockedSeats));
    setSeatSettings(next.seatSettings);
    setDormitories(next.dormitories);
    setSavedSeatHistory(next.seatHistory);
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
      dormitories,
      seatHistory: savedSeatHistory,
    });
    if (!next) {
      return false;
    }
    setAppState(next);
    setStudents(next.students);
    setSeatOrder(next.seatOrder);
    setLockedSeats(new Set(next.lockedSeats));
    setSeatSettings(next.seatSettings);
    setDormitories(next.dormitories);
    setSavedSeatHistory(next.seatHistory);
    return true;
  }

  function handleDeleteGradeExam(examId: string): boolean {
    const next = deleteGradeExamRecord({
      examId,
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
      seatSettings,
      dormitories,
      seatHistory: savedSeatHistory,
    });
    if (!next) {
      return false;
    }
    setAppState(next);
    setStudents(next.students);
    setSeatOrder(next.seatOrder);
    setLockedSeats(new Set(next.lockedSeats));
    setSeatSettings(next.seatSettings);
    setDormitories(next.dormitories);
    setSavedSeatHistory(next.seatHistory);
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
    setAppState(result.state);
    setStudents(result.state.students);
    setSeatOrder(result.state.seatOrder);
    setLockedSeats(new Set(result.state.lockedSeats));
    setSeatSettings(result.state.seatSettings);
    setDormitories(result.state.dormitories);
    setSavedSeatHistory(result.state.seatHistory);
    setSeatHistory([]);
    setSelectedStudent(null);
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

  const studentCount = students.length;
  const seatCount = seatOrder.length;

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      header={
        <TopHeader
          studentCount={studentCount}
          seatCount={seatCount}
          sidebarCollapsed={sidebarCollapsed}
          accountOpen={accountOpen}
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
          onToggleAccount={() => setAccountOpen(v => !v)}
          onCloseAccount={() => setAccountOpen(false)}
          onInstallApp={handleInstallApp}
          onChangePassword={IS_COMMERCIAL ? undefined : () => setShowChangePassword(true)}
          onOpenCloudSync={() => setShowCloudSync(true)}
          onLogout={() => {
            clearAuth();
            setLoggedIn(false);
          }}
        />
      }
      sidebar={
        <Sidebar
          activeTab={sidebarTab}
          students={students}
          dormitories={dormitories}
          seatOrder={seatOrder}
          gradeExams={appState.gradeExams}
          savedSeatHistoryCount={savedSeatHistory.length}
          onTabChange={setSidebarTab}
          onOpenCommentWorkbench={() => setShowCommentWorkbench(true)}
        />
      }
      overlays={
        <>
          {showCommentWorkbench && (
            <CommentWorkbench students={students} onClose={() => setShowCommentWorkbench(false)} onSelectStudent={setSelectedStudent} />
          )}

          {selectedStudent && (
            <StudentDetail
              student={selectedStudent}
              students={students}
              dormitories={dormitories}
              onClose={() => setSelectedStudent(null)}
              onUpdateStudent={handleUpdateStudent}
              onApplyRecord={handleApplyStudentRecord}
              onDeleteStudent={handleDeleteStudent}
              onAssignDormitory={handleAssignStudentDormitory}
              onAddDormitoryEvent={handleAddDormitoryEvent}
              onOpenDormitories={() => {
                setSidebarTab("dormitories");
                setSidebarCollapsed(false);
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

          {showInstallHelp && (
            <InstallHelpModal message={installMessage} onClose={() => setShowInstallHelp(false)} />
          )}

          {!IS_COMMERCIAL && showChangePassword && (
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
      {sidebarTab === "daily" && (
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
          onAddStudent={handleAddStudent}
          onSelectStudent={setSelectedStudent}
          onMoveSeat={handleMoveSeat}
          onToggleLock={toggleLock}
        />
      )}

      {sidebarTab === "dormitories" && (
        <DormitoryWorkspace
          students={students}
          dormitories={dormitories}
          onCreateDormitory={handleCreateDormitory}
          onUpdateDormitory={handleUpdateDormitory}
          onDeleteDormitory={handleDeleteDormitory}
          onAssignStudentDormitory={handleAssignStudentDormitory}
          onAddDormitoryEvent={handleAddDormitoryEvent}
          onUpdateDormitoryEvent={handleUpdateDormEvent}
          onDeleteDormitoryEvent={handleDeleteDormEvent}
          onCloseDormitoryPeriod={handleCloseDormitoryPeriod}
          onCloseAllDormitoryPeriods={handleCloseAllDormitoryPeriods}
          onSelectStudent={setSelectedStudent}
        />
      )}

      {sidebarTab === "scores" && (
        <ScoresWorkspace
          exams={appState.gradeExams}
          students={students}
          onSelectStudent={setSelectedStudent}
          onSaveScoreImport={handleSaveScoreImport}
          onUpdateGradeExam={handleUpdateGradeExam}
          onDeleteGradeExam={handleDeleteGradeExam}
          onGenerateClassAnalysis={handleGenerateClassAnalysis}
          onGenerateLocalClassAnalysis={handleGenerateLocalClassAnalysis}
          onGenerateStudentTrendAdvice={handleGenerateStudentTrendAdvice}
          studentAdviceProgress={studentAdviceProgress}
        />
      )}

      {sidebarTab === "data" && (
        <DataWorkspace
          students={students}
          seatOrder={seatOrder}
          onImportRoster={handleImportRoster}
          onBeforeBackupExport={saveCurrentLegacySnapshot}
          onBackupImported={reloadFromLegacyState}
        />
      )}

      {sidebarTab === "history" && (
        <HistoryWorkspace
          history={savedSeatHistory}
          onSave={handleSaveSeatHistory}
          onRename={handleUpdateSeatHistoryNote}
          onView={setSelectedHistorySnapshot}
          onApply={handleApplySeatHistory}
          onDelete={handleDeleteSeatHistory}
        />
      )}
    </AppShell>
  );
}
