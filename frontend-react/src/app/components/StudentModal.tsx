import { getAttendanceForDate, getAttendanceRange } from "../state/attendancePeriods";
import type { SaveCommunication } from "./CommunicationEditor";
import { useAttendanceUndo } from "../hooks/useAttendanceUndo";
import { StudentDutiesSection } from "./StudentDutiesSection";
import type { ClassDutiesBinding } from "../state/classDuties";
import { followupHasStudent } from "../state/followupStudents";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Trash2, Plus, Sparkles, TrendingUp, TrendingDown, Save, Loader2, Pencil, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";

import { RetryableLazy } from "./RetryableLazy";
import { type NewDormEventInput } from "../state/dormitoryActions";
import { DormEventForm } from "./DormEventForm";
import { AiStudentFollowupPanel } from "./AiStudentFollowupPanel";
import { createStudentRecord, updateStudentProfile } from "../state/studentActions";
import { readCommentRubric, readStudentCommentProfile, saveStudentCommentProfile } from "../state/commentRubricStorage";
import { BEHAVIOR_TAG_GROUPS, BEHAVIOR_TAG_IDS } from "../state/tagCatalog";
import { generateStudentAiTrend, hasStoredAiTrendAuth, readCachedStudentAiTrend, type AiTrendResult } from "../state/aiTrendService";
import type { ActivityEvent, AppStudent, AttendanceRecord, BusinessEntityPreviewFallback, BusinessEntityPreviewModel, BusinessEntityRef, CommunicationDraft, Dormitory, FollowupTask, Gender, GradeScoreCell, HomeworkAssignment, RecordType, SeatLayoutV1, StudentId, StudentRecord } from "../state/types";
import { getNeighborIndexPairs, getSeatPositionLabel, resolveSeatLayout } from "../state/seatLayout";
import { todayKey, upsertAttendance } from "../state/dailyManagement";
import { normalizeAttendancePatch } from "../state/classManagementCommands";
import { createActivityEvent } from "../state/activityEvents";
import { matchesStudentSearch } from "../state/studentSearch";
import { listDormitoryEvents } from "../state/dormitoryPeriods";
import { MotionSwitch, MotionCollapse, AiGenerationPanel, Button, ConfirmDialog, DialogPresence, IconButton, SegmentedControl, SelectMenu, UnderlineTabs, useActionToast, useAppDialog, useModalFocus } from "./ui";
import { AttendanceStatusControl } from "./AttendanceStatusControl";
import { StudentPicker } from "./StudentPicker";
import { StudentCommunicationPanel } from "./StudentCommunicationPanel";
import { StudentActivityTimeline, StudentAttentionSummary, type ContextPreviewRequest } from "./StudentAttentionSummary";
import {
  buildWeekOptions,
  getBestSubject,
  getExamSortValue,
  getExamTotal,
  getScoreEntries,
  getWeakSubject,
  getWeekStart,
  isRecordInWeek,
  parseAliases,
  sortTagIds,
  toLocalDateKey,
  type StudentModalRecord,
} from "./studentModalSelectors";

const loadStudentTrendChart = () => import("./StudentTrendChart");

function formatGradeRank(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "—";
}

function hasGradeScore(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getStudentExamScoreCell(exam: AppStudent["exams"][number], subject: string, score: number): GradeScoreCell {
  return exam.scoreCells?.[subject] || { score, rankClass: null, rankSchool: null };
}

export type StudentDetailTab = "records" | "profile" | "attendance" | "trend" | "followup";

const STUDENT_DETAIL_TABS: Array<{ value: StudentDetailTab; label: string; tone?: "default" | "ai" }> = [
  { value: "records", label: "奖罚记录" },
  { value: "profile", label: "档案" },
  { value: "attendance", label: "出勤" },
  { value: "trend", label: "成绩" },
  { value: "followup", label: "建议与沟通" },
];

interface Props {
  classDuties?: ClassDutiesBinding;
  student: AppStudent;
  students: AppStudent[];
  dormitories: Dormitory[];
  onClose: () => void;
  onUpdateStudent: (student: AppStudent) => void;
  onApplyRecord: (studentId: StudentId, record: StudentRecord, syncIds: StudentId[]) => void;
  onDeleteStudent: (studentId: StudentId) => void;
  onAssignDormitory: (studentId: StudentId, dormitoryId?: string) => void;
  onAddDormitoryEvent: (input: NewDormEventInput) => void;
  onOpenDormitories: () => void;
  onOpenAiComment?: () => void;
  seatOrder?: Array<StudentId | null>;
  seatLayout?: SeatLayoutV1;
  initialActiveTab?: StudentDetailTab;
  onActiveTabChange?: (tab: StudentDetailTab) => void;
  onNavigate?: (direction: -1 | 1) => void;
  onSelectStudent?: (studentId: StudentId) => void;
  navPosition?: { index: number; total: number };
  onCreateFollowupTask?: (input: { studentId: StudentId; title: string; description: string }) => void;
  attendanceRecords?: AttendanceRecord[];
  followupTasks?: FollowupTask[];
  onAttendanceChange?: (records: AttendanceRecord[]) => void;
  onActivity?: (event: ActivityEvent) => void | (() => void);
  homeworkAssignments?: HomeworkAssignment[];
  communicationDrafts?: CommunicationDraft[];
  onSaveCommunication?: SaveCommunication;
  activityEvents?: ActivityEvent[];
  onOpenEntity?: (ref: BusinessEntityRef) => void;
  resolveEntityPreview: (ref: BusinessEntityRef, fallback?: BusinessEntityPreviewFallback) => BusinessEntityPreviewModel;
  leavesWorkbench?: boolean;
  layerClassName?: string;
}

export function StudentModal({
  classDuties,
  student,
  students,
  dormitories,
  onClose,
  onUpdateStudent,
  onApplyRecord,
  onDeleteStudent,
  onAssignDormitory,
  onAddDormitoryEvent,
  onOpenDormitories,
  onOpenAiComment,
  seatOrder = [],
  seatLayout,
  initialActiveTab = "records",
  onActiveTabChange,
  onNavigate,
  onSelectStudent,
  navPosition,
  onCreateFollowupTask,
  attendanceRecords = [],
  followupTasks = [],
  onAttendanceChange,
  onActivity,
  homeworkAssignments = [],
  communicationDrafts = [],
  onSaveCommunication,
  activityEvents = [],
  onOpenEntity,
  resolveEntityPreview,
  leavesWorkbench = false,
  layerClassName = "z-[60]",
}: Props) {
  const modalPanelRef = useModalFocus(true, onClose);
  const appDialog = useAppDialog();
  const actionToast = useActionToast();
  const attendanceUndo = useAttendanceUndo(attendanceRecords, next => onAttendanceChange?.(next), todayKey());
  const [nameInput, setNameInput] = useState(student.name);
  const [genderInput, setGenderInput] = useState<Gender>(student.gender);
  const [aliasesInput, setAliasesInput] = useState(student.aliases.join("、"));
  const [parentPhoneInput, setParentPhoneInput] = useState(student.parentPhone || "");
  const [addressInput, setAddressInput] = useState(student.address || "");
  const [emergencyContactInput, setEmergencyContactInput] = useState(student.emergencyContact || "");
  const [isBoardingInput, setIsBoardingInput] = useState(student.isBoarding === true);
  const [selectedBehaviorTags, setSelectedBehaviorTags] = useState<Set<string>>(
    () => new Set(student.manualTagIds.filter(id => BEHAVIOR_TAG_IDS.has(id)))
  );
  const [noteInput, setNoteInput] = useState("");
  const [localRecords, setLocalRecords] = useState<StudentModalRecord[]>(() =>
    student.records.map(r => ({
      id: r.id,
      type: r.type,
      note: r.note,
      date: r.date,
      score: r.score,
      presetId: r.presetId,
      createdAt: r.createdAt,
    }))
  );
  const [selectedWeek, setSelectedWeek] = useState(() => toLocalDateKey(getWeekStart(new Date())));
  const [syncSearch, setSyncSearch] = useState("");
  const [syncSelected, setSyncSelected] = useState<Set<StudentId>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingRecordDelete, setPendingRecordDelete] = useState<StudentModalRecord | null>(null);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const profileNameRef = useRef<HTMLInputElement>(null);
  const [dormStatus, setDormStatus] = useState("");
  const [activeTab, setActiveTab] = useState<StudentDetailTab>(initialActiveTab);
  const [tabDirection, setTabDirection] = useState<"left" | "right">("right");
  const [dormAssignmentOpen, setDormAssignmentOpen] = useState(false);
  const [dormEventOpen, setDormEventOpen] = useState(false);
  const [pendingDormitoryId, setPendingDormitoryId] = useState(student.dormitoryId || "");
  const [trendMetric, setTrendMetric] = useState("total");
  const [aiTrendResult, setAiTrendResult] = useState<AiTrendResult | null>(() => readCachedStudentAiTrend(student));
  const [aiTrendResultVisible, setAiTrendResultVisible] = useState(true);
  const [aiTrendStatus, setAiTrendStatus] = useState("");
  const [aiTrendError, setAiTrendError] = useState(false);
  const [aiTrendBusy, setAiTrendBusy] = useState(false);
  const [aiTrendAccessCode, setAiTrendAccessCode] = useState("");
  const [rememberAiTrendAuth, setRememberAiTrendAuth] = useState(true);
  const [hasAiTrendAuth, setHasAiTrendAuth] = useState(() => hasStoredAiTrendAuth());
  const [followupView, setFollowupView] = useState<"advice" | "communication">("advice");
  const [contextPreview, setContextPreview] = useState<ContextPreviewRequest | null>(null);

  useLayoutEffect(() => {
    setNameInput(student.name);
    setGenderInput(student.gender);
    setAliasesInput(student.aliases.join("、"));
    setParentPhoneInput(student.parentPhone || "");
    setAddressInput(student.address || "");
    setEmergencyContactInput(student.emergencyContact || "");
    setIsBoardingInput(student.isBoarding === true);
    setSelectedBehaviorTags(new Set(student.manualTagIds.filter(id => BEHAVIOR_TAG_IDS.has(id))));
    setNoteInput("");
    setSyncSearch("");
    setSyncSelected(new Set());
    setShowDeleteConfirm(false);
    setPendingRecordDelete(null);
    setProfileStatus("");
    setProfileEditing(false);
    setDormStatus("");
    setDormAssignmentOpen(false);
    setDormEventOpen(false);
    setTrendMetric("total");
    setActiveTab(initialActiveTab);
    setContextPreview(null);
  }, [initialActiveTab, student]);

  useEffect(() => {
    const cached = readCachedStudentAiTrend(student);
    setAiTrendResult(cached);
    setAiTrendResultVisible(Boolean(cached));
    setAiTrendStatus(cached ? "已载入上次生成的趋势分析。" : "");
    setAiTrendError(false);
    setAiTrendAccessCode("");
    setHasAiTrendAuth(hasStoredAiTrendAuth());
  }, [student]);

  useEffect(() => {
    if (!profileEditing || activeTab !== "profile") return;
    const input = profileNameRef.current;
    const scrollParent = input?.closest<HTMLElement>(".app-motion-switch--scrollable");
    if (scrollParent?.scrollTop) scrollParent.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    input?.focus({ preventScroll: true });
  }, [profileEditing, activeTab]);

  const navigateStudent = useCallback((direction: -1 | 1) => {
    setTabDirection(direction < 0 ? "left" : "right");
    onNavigate?.(direction);
  }, [onNavigate]);

  const selectStudent = useCallback((studentId: StudentId) => {
    if (studentId === student.id) return;
    const currentIndex = students.findIndex(item => item.id === student.id);
    const nextIndex = students.findIndex(item => item.id === studentId);
    setTabDirection(nextIndex >= 0 && currentIndex >= 0 && nextIndex < currentIndex ? "left" : "right");
    onSelectStudent?.(studentId);
  }, [onSelectStudent, student.id, students]);

  // ←/→ 逐人切换；输入控件聚焦时不劫持方向键。
  useEffect(() => {
    if (!onNavigate) return;
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("button, a, input, textarea, select, [role=tab], [role=menuitem], [contenteditable=true]")) return;
      event.preventDefault();
      navigateStudent(event.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateStudent, onNavigate]);

  function changeActiveTab(nextTab: StudentDetailTab) {
    if (nextTab === activeTab) return;
    const currentIndex = STUDENT_DETAIL_TABS.findIndex(tab => tab.value === activeTab);
    const nextIndex = STUDENT_DETAIL_TABS.findIndex(tab => tab.value === nextTab);
    setTabDirection(nextIndex < currentIndex ? "left" : "right");
    setContextPreview(null);
    onActiveTabChange?.(nextTab);
    setActiveTab(nextTab);
  }

  function toggleContextPreview(request: ContextPreviewRequest) {
    setContextPreview(current => current?.source === request.source && current.key === request.key ? null : request);
  }

  useEffect(() => {
    setLocalRecords(student.records.map(r => ({
      id: r.id,
      type: r.type,
      note: r.note,
      date: r.date,
      score: r.score,
      presetId: r.presetId,
      createdAt: r.createdAt,
    })));
  }, [student.records]);

  useEffect(() => {
    setPendingDormitoryId(student.dormitoryId || "");
  }, [student.dormitoryId]);

  const examScores = student.exams;
  const chronologicalExams = useMemo(
    () => [...examScores].sort((a, b) => getExamSortValue(a).localeCompare(getExamSortValue(b))),
    [examScores]
  );
  const trendSubjects = useMemo(() => {
    const subjects = new Set<string>();
    chronologicalExams.forEach(exam => Object.keys(exam.scores).forEach(subject => subjects.add(subject)));
    return [...subjects];
  }, [chronologicalExams]);
  const trendMetricOptions = ["total", ...trendSubjects];
  const effectiveTrendMetric = trendMetric === "total" || trendSubjects.includes(trendMetric) ? trendMetric : "total";
  const trendData = chronologicalExams.map(exam => ({
    label: exam.name.length > 8 ? `${exam.name.slice(0, 8)}...` : exam.name,
    fullLabel: `${exam.name}${exam.date ? ` · ${exam.date}` : ""}`,
    total: getExamTotal(exam),
    ...exam.scores,
  }));
  const hasTrendChart = trendData.filter(item => typeof item[effectiveTrendMetric as keyof typeof item] === "number").length >= 2;
  const currentDormitory = dormitories.find(dormitory => dormitory.id === student.dormitoryId) || null;
  const latestDormitoryEvent = currentDormitory
    ? listDormitoryEvents(currentDormitory).sort((a, b) => `${b.event.date}-${b.event.createdAt}`.localeCompare(`${a.event.date}-${a.event.createdAt}`))[0]?.event
    : undefined;
  function updateTodayAttendance(patch: Partial<Pick<AttendanceRecord, "status" | "late" | "earlyLeave">>) {
    if (!onAttendanceChange) return;
    const date = todayKey();
    const current = getAttendanceForDate(attendanceRecords, date).find(item => item.studentId === student.id);
    const action = patch.status ? `status:${patch.status}` : "late" in patch ? "late" : "earlyLeave";
    if (attendanceUndo.tryRevert(student.id, action)) { actionToast.show("已恢复上次出勤状态"); return; }
    if (patch.status && (current?.status || "normal") === patch.status) return;
    const normalized = patch.status ? normalizeAttendancePatch(current, patch.status) : null;
    const next = upsertAttendance(attendanceRecords, { studentId: student.id, date, status: normalized?.status ?? current?.status ?? "normal", late: patch.late ?? normalized?.late ?? current?.late ?? false, earlyLeave: patch.earlyLeave ?? normalized?.earlyLeave ?? current?.earlyLeave ?? false, note: current?.note || "", leaveStart: patch.status ? normalized?.leaveStart : current?.leaveStart, leaveEnd: patch.status ? normalized?.leaveEnd : current?.leaveEnd });
    const saved = next.find(item => item.studentId === student.id && item.date === date);
    const statusLabel = saved?.status === "leave" ? "请假" : saved?.status === "absent" ? "缺勤" : "正常";
    const undoActivity = onActivity?.(createActivityEvent({ action: "status_changed", ref: { domain: "attendance", entityId: saved?.id || current?.id || `${date}:${student.id}`, studentId: student.id, date }, studentIds: [student.id], title: `登记出勤：${student.name}`, detail: `${statusLabel}${saved?.late ? " · 迟到" : ""}${saved?.earlyLeave ? " · 早退" : ""}` }));
    const undo = attendanceUndo.commit(next, action, undoActivity);
    if (undo) actionToast.show({ message: "出勤已保存，6 秒内再次点击可恢复", actionLabel: "撤销", actionIcon: <RotateCcw className="h-3.5 w-3.5" />, onAction: () => { undo(); }, duration: 6000 });
  }
  const preservedManualTagIds = useMemo(
    () => student.manualTagIds.filter(id => !BEHAVIOR_TAG_IDS.has(id)),
    [student.manualTagIds]
  );
  const initialBehaviorTagKey = useMemo(
    () => sortTagIds(student.manualTagIds.filter(id => BEHAVIOR_TAG_IDS.has(id))),
    [student.manualTagIds]
  );
  const selectedBehaviorTagKey = sortTagIds(selectedBehaviorTags);
  const profileDirty =
    nameInput.trim() !== student.name ||
    genderInput !== student.gender ||
    parseAliases(aliasesInput).join("|") !== student.aliases.join("|") ||
    parentPhoneInput.trim() !== (student.parentPhone || "") ||
    addressInput.trim() !== (student.address || "") ||
    emergencyContactInput.trim() !== (student.emergencyContact || "") ||
    isBoardingInput !== (student.isBoarding === true) ||
    selectedBehaviorTagKey !== initialBehaviorTagKey;
  const weekOptions = useMemo(() => buildWeekOptions(localRecords), [localRecords]);
  const activeWeek = weekOptions.find(week => week.key === selectedWeek) || weekOptions[0];
  const filteredRecords = activeWeek ? localRecords.filter(record => isRecordInWeek(record, activeWeek)) : localRecords;

  useEffect(() => {
    if (weekOptions.length > 0 && !weekOptions.some(week => week.key === selectedWeek)) {
      setSelectedWeek(weekOptions[0].key);
    }
  }, [selectedWeek, weekOptions]);

  function toggleBehaviorTag(id: string) {
    setSelectedBehaviorTags(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setProfileStatus("");
  }

  function saveProfile() {
    if (!nameInput.trim()) {
      setProfileStatus("姓名不能为空。");
      return;
    }

    const nextStudent = updateStudentProfile(student, {
      name: nameInput,
      gender: genderInput,
      aliases: parseAliases(aliasesInput),
      parentPhone: parentPhoneInput,
      address: addressInput,
      emergencyContact: emergencyContactInput,
      isBoarding: isBoardingInput,
      manualTagIds: [...preservedManualTagIds, ...selectedBehaviorTags],
    });
    onUpdateStudent(nextStudent);
    setProfileStatus("学生信息已保存。");
    setProfileEditing(false);
  }

  function cancelProfileEditing() {
    setNameInput(student.name);
    setGenderInput(student.gender);
    setAliasesInput(student.aliases.join("、"));
    setParentPhoneInput(student.parentPhone || "");
    setAddressInput(student.address || "");
    setEmergencyContactInput(student.emergencyContact || "");
    setIsBoardingInput(student.isBoarding === true);
    setSelectedBehaviorTags(new Set(student.manualTagIds.filter(id => BEHAVIOR_TAG_IDS.has(id))));
    setProfileEditing(false);
    setProfileStatus("已取消本次修改。");
  }

  async function addRecord(type: RecordType) {
    if (type !== "note" && !noteInput.trim() && !await appDialog.confirm({ title: "添加无备注记录？", description: `将为 ${student.name} 添加一条没有说明的${type === "reward" ? "奖励" : "纪律"}记录。建议填写事实依据，便于以后回看。`, confirmLabel: "仍然添加", variant: "primary" })) return;
    const newRecord = createStudentRecord(type, noteInput);
    setLocalRecords(prev => [newRecord, ...prev]);
    onApplyRecord(student.id, newRecord, [...syncSelected]);
    setNoteInput("");
    setProfileStatus(syncSelected.size ? `记录已同步到 ${syncSelected.size + 1} 名学生。` : "记录已保存。");
  }

  function handleDormitoryChange(dormitoryId: string) {
    onAssignDormitory(student.id, dormitoryId || undefined);
    setPendingDormitoryId(dormitoryId);
    setDormAssignmentOpen(false);
    setDormStatus(dormitoryId ? "所属宿舍已更新。" : "已从宿舍移除。");
  }

  function handleAddDormEvent(input: Omit<NewDormEventInput, "dormId">) {
    if (!currentDormitory) {
      setDormStatus("请先选择所属宿舍。");
      return;
    }
    onAddDormitoryEvent({ ...input, dormId: currentDormitory.id });
    setDormEventOpen(false);
    setDormStatus(
      input.recordToStudent === false
        ? `已同步到 ${currentDormitory.name}（未写入个人档案）。`
        : `已同步到 ${currentDormitory.name}，并写入该学生个人记录。`,
    );
  }

  function deleteRecord(recordId: string) {
    const nextRecords = localRecords.filter(record => record.id !== recordId);
    setLocalRecords(nextRecords);
    onUpdateStudent({ ...student, records: nextRecords });
    setProfileStatus("记录已删除。");
  }

  function isRecordValue(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function saveAiFollowupRecord(note: string) {
    const record = createStudentRecord("note", note);
    setLocalRecords(prev => [record, ...prev]);
    onApplyRecord(student.id, record, []);
    setProfileStatus("AI 跟进记录已保存。");
  }

  function appendAiFollowupMaterial(text: string) {
    const rubric = readCommentRubric();
    const profile = readStudentCommentProfile(student);
    const nextNote = [profile.teacherNote, text].map(item => item.trim()).filter(Boolean).join("\n");
    const savedProfile = saveStudentCommentProfile(student.id, rubric, {
      ...profile,
      teacherNote: nextNote,
      status: profile.generatedComment ? "edited" : "draft",
      updatedAt: new Date().toISOString(),
    });
    const aiComments = isRecordValue(student.aiComments) ? student.aiComments : {};
    onUpdateStudent({
      ...student,
      aiComments: {
        ...aiComments,
        profile: savedProfile,
      },
    });
    setProfileStatus("AI 跟进素材已加入评语补充说明。");
  }

  const syncCandidates = students.filter(s => s.id !== student.id && matchesStudentSearch(s, syncSearch));

  function toggleSync(id: StudentId) {
    setSyncSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const recordTypeStyle: Record<RecordType, { bg: string; text: string; label: string }> = {
    reward: { bg: "bg-status-success-50 border-status-success-100", text: "text-status-success-700", label: "奖" },
    punish: { bg: "bg-status-danger-50 border-status-danger-100", text: "text-status-danger-600", label: "罚" },
    note:   { bg: "bg-background-secondary-default border-separator-border", text: "text-text-secondary", label: "备注" },
  };

  const seatIndex = seatOrder.findIndex(id => id === student.id);
  const resolvedLayout = resolveSeatLayout(seatLayout, seatOrder.length);
  const neighborIndexes = seatIndex >= 0 ? getNeighborIndexPairs(resolvedLayout).filter(pair => pair.includes(seatIndex)).map(pair => pair[0] === seatIndex ? pair[1] : pair[0]) : [];
  const deskMateIndex = neighborIndexes[0] ?? -1;
  const groupId = resolvedLayout.seats[seatIndex]?.groupId;
  const nearbyIndexes = seatIndex >= 0 ? resolvedLayout.seats.map((seat, index) => seat.groupId && seat.groupId === groupId && index !== seatIndex && index !== deskMateIndex ? index : -1).filter(index => index >= 0) : [];
  const studentById = new Map(students.map(item => [item.id, item]));
  const deskMateName = deskMateIndex >= 0 ? studentById.get(seatOrder[deskMateIndex] || "")?.name || "" : "";
  const nearbyNames = nearbyIndexes
    .map(index => studentById.get(seatOrder[index] || "")?.name || "")
    .filter(Boolean);

  async function handleGenerateAiTrend() {
    setAiTrendBusy(true);
    setAiTrendResultVisible(false);
    setAiTrendStatus("正在生成趋势分析...");
    setAiTrendError(false);
    try {
      const result = await generateStudentAiTrend(student, {
        accessCode: aiTrendAccessCode,
        remember: rememberAiTrendAuth,
        force: true,
      });
      setAiTrendResult(result);
      window.requestAnimationFrame(() => setAiTrendResultVisible(true));
      setAiTrendStatus("AI 趋势分析已生成。");
      setAiTrendError(false);
      setAiTrendAccessCode("");
      setHasAiTrendAuth(hasStoredAiTrendAuth());
    } catch (error) {
      setAiTrendResultVisible(Boolean(aiTrendResult));
      const reason = error instanceof Error ? error.message : "";
      const messages: Record<string, string> = {
        ai_auth_required: "产品授权已失效，请退出后重新登录。",
        ai_unauthorized: "当前授权未开通 AI 或 AI 已到期。",
        ai_auth_failed: "AI 授权暂时不可用，请稍后重试。",
        ai_file_protocol: "当前是本地文件打开方式，请通过网页地址打开后再使用 AI。",
        ai_offline: "当前离线，联网后可生成趋势分析。",
        ai_payload_too_large: "当前成绩数据过多，请减少历史考试后再试。",
        ai_rate_limited: "今日 AI 调用较多，请稍后再试。",
        ai_insufficient_trend: "至少需要两次考试才能生成趋势分析。",
      };
      setAiTrendStatus(messages[reason] || "AI 趋势分析暂时不可用，本地趋势图不受影响。");
      setAiTrendError(true);
      setHasAiTrendAuth(hasStoredAiTrendAuth());
    } finally {
      setAiTrendBusy(false);
    }
  }


  return (
    <div className={`soft-backdrop-enter app-modal-overlay fixed inset-0 ${layerClassName} flex items-center justify-center p-4`}>
      <div ref={modalPanelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${student.name}学生详情`} className="student-detail-panel modal-panel-enter app-modal-panel flex max-h-[min(48rem,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden outline-none">
        {/* Header */}
        <div className="shrink-0 border-b border-separator-border p-5 pb-4">
          <div className="relative flex min-h-10 items-center justify-between">
            {onNavigate && <IconButton label="上一位学生" size="sm" onClick={() => navigateStudent(-1)}><ChevronLeft className="h-4 w-4" /></IconButton>}
            {!onNavigate && <span className="h-8 w-8" aria-hidden="true" />}
            <div className="pointer-events-none absolute left-1/2 top-1/2 w-[min(16rem,calc(100%_-_10rem))] -translate-x-1/2 -translate-y-1/2 text-center">
              <MotionSwitch transitionKey={student.id} direction={tabDirection}>
                <div className="mb-1 text-caption-1-regular text-text-tertiary" style={{ fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>学生{navPosition ? ` · ${navPosition.index + 1} / ${navPosition.total}` : ""}</div>
                <h3 className="truncate text-text-primary" title={`${student.name} · 本周 ${weekOptions[0]?.key || ""}`} style={{ fontSize: "1.25rem" }}>
                  {student.name}
                  <span className="ml-2 hidden text-text-tertiary 2xl:inline" style={{ fontWeight: 400, fontSize: "0.875rem" }}>· 本周 {weekOptions[0]?.key || ""}</span>
                </h3>
              </MotionSwitch>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              {onNavigate && <IconButton label="下一位学生" size="sm" onClick={() => navigateStudent(1)}><ChevronRight className="h-4 w-4" /></IconButton>}
              <IconButton label="关闭学生详情" size="sm" onClick={onClose}><X className="h-4 w-4" /></IconButton>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {onSelectStudent && <div className="w-40 shrink-0"><StudentPicker compact students={students} value={student.id} onChange={selectStudent} label="直接选择学生" /></div>}
                <Button type="button" size="sm" variant="ghost" aria-label="AI跟进" onClick={() => changeActiveTab("followup")} className="shrink-0 whitespace-nowrap px-2 sm:px-2.5">
                  <Sparkles className="h-3.5 w-3.5 text-status-ai-500" /><span className="hidden sm:inline">AI跟进</span>
                </Button>
                {onOpenAiComment && (
                  <Button type="button" size="sm" variant="ghost" aria-label="AI评语" onClick={onOpenAiComment} className="shrink-0 whitespace-nowrap px-2 sm:px-2.5">
                    <Sparkles className="h-3.5 w-3.5 text-status-ai-500" /><span className="hidden sm:inline">AI评语</span>
                  </Button>
                )}
                <Button type="button" size="sm" variant="ghost" aria-label="移出当前班级" onClick={() => setShowDeleteConfirm(true)} className="shrink-0 whitespace-nowrap border-status-danger-200 px-2 text-status-danger-500 hover:border-status-danger-200 hover:bg-status-danger-50 sm:px-2.5">
                  <Trash2 className="h-3.5 w-3.5" /><span className="hidden sm:inline">移出当前班级</span>
                </Button>
          </div>
        </div>

        <div className="student-detail-tabs relative shrink-0 border-b border-separator-border pr-28">
          <UnderlineTabs value={activeTab} options={STUDENT_DETAIL_TABS} onChange={changeActiveTab} ariaLabel="学生详情" className="border-b-0 px-6 pt-3" />
          {activeTab === "profile" && <div className="absolute bottom-2 right-6"><MotionSwitch transitionKey={profileEditing ? "edit" : "view"} className="student-profile-actions">{profileEditing ? <div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={cancelProfileEditing}>取消</Button><Button size="sm" onClick={saveProfile} disabled={!profileDirty}><Save className="h-3.5 w-3.5" />保存</Button></div> : <Button size="sm" onClick={() => { setProfileEditing(true); setProfileStatus("已进入编辑模式，修改后请保存。"); }}><Pencil className="h-3.5 w-3.5" />编辑资料</Button>}</MotionSwitch></div>}
        </div>

        <MotionSwitch scrollable transitionKey={`${student.id}-${activeTab}`} contentClassName="space-y-5 p-6">
          {activeTab === "profile" && (
          <div className="student-profile-sheet" data-editing={profileEditing}>
            <section className="student-profile-section" aria-label="基本资料">
              <div className="student-profile-section-heading"><h3>基本资料</h3><span>{profileEditing ? "编辑中 · 保存后生效" : "查看"}</span></div>
              <div className="student-profile-grid student-profile-grid--identity">
                <label className="student-profile-field student-profile-field--name">
                  <span>姓名</span>
                  <input ref={profileNameRef} disabled={!profileEditing} value={nameInput} onChange={event => { setNameInput(event.target.value); setProfileStatus(""); }} className="student-profile-input" />
                </label>
                <div className="student-profile-field">
                  <span>性别</span>
                  <div className="student-profile-choice">
                    <strong className="student-profile-choice-value" aria-hidden={profileEditing}>{genderInput === "男" || genderInput === "女" ? genderInput : "未记录"}</strong>
                    <div className="student-profile-choice-control" aria-hidden={!profileEditing}>
                      <SegmentedControl value={genderInput} ariaLabel="学生性别" disabled={!profileEditing} onChange={value => { setGenderInput(value as Gender); setProfileStatus(""); }} options={[{ value: "男", label: "男" }, { value: "女", label: "女" }]} className="flex h-10 w-full" />
                    </div>
                  </div>
                </div>
                <label className="student-profile-field student-profile-field--wide" data-empty={!aliasesInput}>
                  <span>别名</span>
                  <input disabled={!profileEditing} value={profileEditing ? aliasesInput : aliasesInput || "未填写"} onChange={event => { setAliasesInput(event.target.value); setProfileStatus(""); }} placeholder="多个别名用顿号或逗号分隔" className="student-profile-input" />
                </label>
              </div>
              {classDuties && <StudentDutiesSection key={student.id} binding={classDuties} studentId={student.id} />}
            </section>

            <section className="student-profile-section" aria-label="联系与住宿">
              <div className="student-profile-section-heading"><h3>联系与住宿</h3><span>保存在本机，可随备份同步</span></div>
              <div className="student-profile-grid">
                <label className="student-profile-field" data-empty={!parentPhoneInput}>
                  <span>家长电话</span>
                  <input disabled={!profileEditing} value={profileEditing ? parentPhoneInput : parentPhoneInput || "未填写"} onChange={event => { setParentPhoneInput(event.target.value); setProfileStatus(""); }} type="tel" placeholder="例如：13800000000" className="student-profile-input" />
                </label>
                <label className="student-profile-field" data-empty={!emergencyContactInput}>
                  <span>紧急联系人</span>
                  <input disabled={!profileEditing} value={profileEditing ? emergencyContactInput : emergencyContactInput || "未填写"} onChange={event => { setEmergencyContactInput(event.target.value); setProfileStatus(""); }} placeholder="姓名 / 关系 / 电话" className="student-profile-input" />
                </label>
                <label className="student-profile-field student-profile-field--wide" data-empty={!addressInput}>
                  <span>住址</span>
                  <input disabled={!profileEditing} value={profileEditing ? addressInput : addressInput || "未填写"} onChange={event => { setAddressInput(event.target.value); setProfileStatus(""); }} placeholder="家庭住址（可选）" className="student-profile-input" />
                </label>
                <div className="student-profile-field">
                  <span>住宿状态</span>
                  <div className="student-profile-choice">
                    <strong className="student-profile-choice-value" aria-hidden={profileEditing}>{isBoardingInput ? "住宿" : "走读"}</strong>
                    <div className="student-profile-choice-control" aria-hidden={!profileEditing}>
                      <SegmentedControl value={isBoardingInput ? "boarding" : "commuter"} ariaLabel="住宿状态" disabled={!profileEditing} onChange={value => { setIsBoardingInput(value === "boarding"); setProfileStatus(""); }} options={[{ value: "commuter", label: "走读" }, { value: "boarding", label: "住宿" }]} className="flex max-w-xs" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="student-profile-dormitory">
                <div className="min-w-0">
                  <span className="student-profile-meta-label">所属宿舍</span>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-regular">
                    <strong className="text-text-primary">{currentDormitory?.name || "未分配"}</strong>
                    {currentDormitory && <span className="text-text-tertiary">成员 {currentDormitory.memberIds.length} 人</span>}
                  </div>
                  {latestDormitoryEvent && <p className="mt-1 truncate text-caption-1-regular text-text-tertiary">最近事件：{latestDormitoryEvent.reason} · {latestDormitoryEvent.date}</p>}
                </div>
                <div className="student-profile-dormitory-actions">
                  <Button variant="ghost" size="sm" onClick={() => setDormAssignmentOpen(true)}>更换宿舍</Button>
                  <Button variant="ghost" size="sm" onClick={() => setDormEventOpen(true)} disabled={!currentDormitory}>记宿舍事件</Button>
                  <Button variant="ghost" size="sm" onClick={onOpenDormitories}>管理</Button>
                </div>
                {dormStatus && <p className="w-full text-caption-1-regular text-accent-600">{dormStatus}</p>}
              </div>
            </section>

            <section className="student-profile-section" aria-label="行为与学科标签">
              <div className="student-profile-section-heading"><h3>行为与学科</h3></div>
              <div className="student-profile-tag-groups">
                <span className="student-profile-meta-label">行为标签</span>
                <MotionCollapse open={!profileEditing && selectedBehaviorTags.size === 0} contentClassName="pt-2"><p className="text-body-regular text-text-tertiary">暂无行为标签</p></MotionCollapse>
                {BEHAVIOR_TAG_GROUPS.map(group => {
                  const hasSelected = group.tags.some(tag => selectedBehaviorTags.has(tag.id));
                  return <MotionCollapse key={group.id} open={profileEditing || hasSelected} contentClassName="pt-2">
                    <div className="student-profile-tag-group">
                      <span className="student-profile-meta-label">{group.name}</span>
                      <div className="flex flex-wrap">
                        {group.tags.map(tag => {
                          const active = selectedBehaviorTags.has(tag.id);
                          return <button key={tag.id} type="button" disabled={!profileEditing} data-active={active} aria-hidden={!profileEditing && !active} onClick={() => toggleBehaviorTag(tag.id)} className="student-profile-tag">{tag.label}</button>;
                        })}
                      </div>
                    </div>
                  </MotionCollapse>;
                })}
              </div>
              <div className="student-profile-academic">
                <span className="student-profile-meta-label">学科标签</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {student.academicTags.length ? student.academicTags.map(tag => <span key={tag} className={`rounded-full border px-2.5 py-1 text-caption-1-medium ${tag.endsWith("强") ? "border-status-success-100 bg-status-success-50 text-status-success-700" : "border-status-danger-100 bg-status-danger-50 text-status-danger-500"}`}>{tag}</span>) : <span className="text-body-regular text-text-tertiary">暂无学科标签</span>}
                </div>
              </div>
              {profileStatus && <p role="status" className="mt-3 text-caption-1-regular text-accent-600">{profileStatus}</p>}
            </section>
          </div>
          )}

          {activeTab === "records" && (
          <div className="space-y-5">
          {/* Record Actions */}
          <div className="flex items-center gap-2">
            <input
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              placeholder="备注（可选）"
              maxLength={40}
              className="flex-1 min-w-0 px-3.5 py-2.5 text-body-regular bg-background-secondary-default border border-border-button-default rounded-xl outline-none focus:border-accent-300"
            />
            <button onClick={() => addRecord("reward")} className="shrink-0 flex items-center gap-1 px-3.5 py-2.5 bg-status-success-500 hover:bg-status-success-600 text-text-white rounded-xl text-body-regular transition-colors" style={{ fontWeight: 600 }}>
              <Plus className="w-3.5 h-3.5" />奖
            </button>
            <button onClick={() => addRecord("punish")} className="shrink-0 flex items-center gap-1 px-3.5 py-2.5 bg-status-danger-500 hover:bg-status-danger-600 text-text-white rounded-xl text-body-regular transition-colors" style={{ fontWeight: 600 }}>
              <Plus className="w-3.5 h-3.5" />罚
            </button>
            <button onClick={() => addRecord("note")} className="shrink-0 px-3.5 py-2.5 text-body-regular text-text-secondary border border-border-button-default hover:bg-background-tertiary-default rounded-xl transition-colors" style={{ fontWeight: 600 }}>
              + 备注
            </button>
          </div>

          {/* Sync to other students */}
          <div className="border border-separator-border rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-background-secondary-default border-b border-separator-border">
              <span className="text-body-regular text-text-secondary" style={{ fontWeight: 600 }}>同步到其他学生（可选）</span>
              <div className="flex gap-2">
                <button onClick={() => setSyncSelected(new Set(students.filter(s => s.id !== student.id).map(s => s.id)))} className="text-caption-1-regular text-accent-600 hover:underline">全选</button>
                <button onClick={() => setSyncSelected(new Set())} className="text-caption-1-regular text-text-tertiary hover:underline">清空</button>
              </div>
            </div>
            <div className="px-3 pt-2 pb-1">
              <input
                value={syncSearch}
                onChange={e => setSyncSearch(e.target.value)}
                placeholder="搜索姓名"
                className="w-full px-3 py-2 text-body-regular bg-background-secondary-default border border-border-button-default rounded-xl outline-none focus:border-accent-300 mb-2"
              />
              <div className="max-h-32 overflow-y-auto space-y-0.5 pb-2">
                {syncCandidates.slice(0, 12).map(s => (
                  <label key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-background-secondary-default cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncSelected.has(s.id)}
                      onChange={() => toggleSync(s.id)}
                      className="w-4 h-4 accent-accent-600 rounded"
                    />
                    <span className="text-body-regular text-text-primary">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Week selector + Records */}
          <div className="flex items-center gap-3">
            <span className="text-body-regular text-text-secondary" style={{ fontWeight: 600 }}>查看周</span>
            <SelectMenu value={selectedWeek} onChange={setSelectedWeek} ariaLabel="查看周" className="w-64 bg-background-secondary-default" options={weekOptions.map(week => ({ value: week.key, label: week.label }))} />
          </div>

          {filteredRecords.length > 0 ? (
            <div className="space-y-2">
              {filteredRecords.map(record => (
                <div key={record.id} className={`flex items-center gap-3 px-4 py-3 border rounded-xl ${recordTypeStyle[record.type].bg}`}>
                  <span className={`text-caption-1-regular px-2 py-0.5 rounded-full border ${recordTypeStyle[record.type].bg} ${recordTypeStyle[record.type].text}`} style={{ fontWeight: 700 }}>
                    {recordTypeStyle[record.type].label}
                  </span>
                  <span className={`flex-1 text-body-regular ${recordTypeStyle[record.type].text}`}>{record.note || "(无备注)"}</span>
                  {record.score !== undefined && <span className={`rounded-full px-2 py-0.5 text-caption-1-semibold ${record.score > 0 ? "bg-status-success-100 text-status-success-700" : record.score < 0 ? "bg-status-danger-100 text-status-danger-600" : "bg-background-tertiary-default text-text-secondary"}`}>{record.score > 0 ? "+" : ""}{record.score}</span>}
                  <span className="text-caption-1-regular text-text-tertiary">{record.date}</span>
                  <button onClick={() => setPendingRecordDelete(record)} aria-label={`删除记录 ${record.note || "无备注"}`} className="p-1 text-text-tertiary hover:text-status-danger-500 hover:bg-background-primary-default/70 rounded-lg transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-body-regular text-text-tertiary text-center py-3">该周暂无记录，可以先来添加奖罚。</p>
          )}
          </div>
          )}

          {activeTab === "followup" && (
            <div className="space-y-4">
            <StudentAttentionSummary
              student={student}
              attendance={attendanceRecords}
              tasks={followupTasks}
              homework={homeworkAssignments}
              dormitories={dormitories}
              activePreview={contextPreview}
              onTogglePreview={toggleContextPreview}
              resolvePreview={resolveEntityPreview}
              onNavigate={onOpenEntity}
              leavesWorkbench={leavesWorkbench}
            />
            <StudentActivityTimeline
              studentId={student.id}
              events={activityEvents}
              activePreview={contextPreview}
              onTogglePreview={toggleContextPreview}
              resolvePreview={resolveEntityPreview}
              onNavigate={onOpenEntity}
              leavesWorkbench={leavesWorkbench}
            />
            <UnderlineTabs value={followupView} onChange={nextView => { setContextPreview(null); setFollowupView(nextView); }} ariaLabel="跟进与沟通" options={[{ value: "advice", label: "跟进建议", tone: "ai" }, { value: "communication", label: "周沟通稿" }]} />
            <MotionSwitch transitionKey={followupView}>{followupView === "advice" ? <AiStudentFollowupPanel
              student={student}
              context={{
                dormitories,
                seatIndex: seatIndex >= 0 ? seatIndex : null,
                seatLabel: seatIndex >= 0 ? getSeatPositionLabel(resolvedLayout, seatIndex) : "",
                deskMateName,
                nearbyNames,
                scenario: "detail",
              }}
              onSaveRecord={saveAiFollowupRecord}
              onAppendCommentMaterial={appendAiFollowupMaterial}
              onCreateTask={input => onCreateFollowupTask?.({ studentId: student.id, ...input })}
            /> : <StudentCommunicationPanel student={student} students={students} attendance={attendanceRecords} tasks={followupTasks} homework={homeworkAssignments} dormitories={dormitories} drafts={communicationDrafts} onSave={onSaveCommunication} />}</MotionSwitch>
            </div>
          )}

          {activeTab === "attendance" && (() => { const current = getAttendanceForDate(attendanceRecords, todayKey()).find(item => item.studentId === student.id); const month = todayKey().slice(0,7); const monthly = getAttendanceRange(attendanceRecords, `${month}-01`, todayKey()).filter(item => item.studentId === student.id); return <div className="space-y-4"><div className="grid grid-cols-4 gap-2">{[{label:"请假",value:monthly.filter(item=>item.status==="leave").length},{label:"缺勤",value:monthly.filter(item=>item.status==="absent").length},{label:"迟到",value:monthly.filter(item=>item.late).length},{label:"早退",value:monthly.filter(item=>item.earlyLeave).length}].map(item=><div key={item.label} className="rounded-xl bg-background-secondary-default p-3 text-center"><div className="text-title-2-regular font-black text-text-primary">{item.value}</div><div className="text-caption-1-regular text-text-tertiary">本月{item.label}天数</div></div>)}</div><div className="rounded-2xl border border-separator-border bg-background-secondary-default p-4"><div className="mb-3 text-body-semibold text-text-primary">今日状态</div><AttendanceStatusControl value={current?.status||"normal"} late={current?.late||false} earlyLeave={current?.earlyLeave||false} onChange={updateTodayAttendance}/></div><div className="space-y-2">{attendanceRecords.filter(item=>item.studentId===student.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(item=><div key={item.id} className="flex items-center justify-between rounded-xl border border-separator-border px-4 py-3"><span className="text-body-semibold text-text-primary">{item.date}</span><span className="text-body-regular text-text-secondary">{item.status==="leave"?"请假":item.status==="absent"?"缺勤":"正常"}{item.late?" · 迟到":""}{item.earlyLeave?" · 早退":""}</span></div>)}{!attendanceRecords.some(item=>item.studentId===student.id)&&<p className="py-8 text-center text-body-regular text-text-tertiary">暂无出勤异常</p>}</div><div className="rounded-xl bg-accent-50 p-3 text-body-regular text-accent-700">当前跟进任务 {followupTasks.filter(task=>followupHasStudent(task, student.id)&&task.status==="pending").length} 项</div></div>; })()}

          {activeTab === "trend" && (
          <div className="space-y-5">
          {/* Grade Trend */}
          <div className="border border-separator-border rounded-2xl overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-4 py-3 bg-background-secondary-default border-b border-separator-border">
              <div>
                <span className="text-body-regular text-text-primary" style={{ fontWeight: 700 }}>成绩趋势</span>
                <p className="text-caption-1-regular text-text-tertiary mt-0.5">{chronologicalExams.length} 次考试 · 分数曲线按时间展示，进退步按班排判断</p>
              </div>
              <div className="max-w-[60%] overflow-x-auto">
                <SegmentedControl value={effectiveTrendMetric} ariaLabel="成绩趋势科目" onChange={setTrendMetric} options={trendMetricOptions.slice(0, 7).map(metric => ({ value: metric, label: metric === "total" ? "总分" : metric }))} className="shrink-0" />
              </div>
            </div>
            <div className="p-4 space-y-4">
              {hasTrendChart ? (
                <div className="h-48">
                  <RetryableLazy
                    load={loadStudentTrendChart}
                    componentProps={{ data: trendData, metric: effectiveTrendMetric }}
                    fallback={<div className="h-full animate-pulse rounded-xl bg-background-tertiary-default" aria-label="正在加载趋势图" />}
                  />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border-button-default bg-background-secondary-default px-4 py-8 text-center text-body-regular text-text-tertiary">
                  至少需要两次有效考试，才会显示趋势图。
                </div>
              )}

              <div className="rounded-2xl border border-[var(--app-border)] bg-background-primary-default p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-body-semibold text-text-primary">
                      <Sparkles className="w-4 h-4 text-status-ai-500" />AI 成绩趋势分析
                    </div>
                  </div>
                  <Button variant="ai" size="sm" onClick={handleGenerateAiTrend} disabled={aiTrendBusy || chronologicalExams.length < 2}>
                    {aiTrendBusy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
                    {aiTrendBusy ? "正在分析" : aiTrendResult ? "重新生成" : "生成分析"}
                  </Button>
                </div>

                {!hasAiTrendAuth && (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <input
                      value={aiTrendAccessCode}
                      onChange={event => setAiTrendAccessCode(event.target.value)}
                      type="password"
                      placeholder="输入 AI 授权码"
                      className="min-w-0 px-3 py-2 text-body-regular bg-background-primary-default border border-border-button-default rounded-xl outline-none focus:border-accent-300"
                    />
                    <label className="flex items-center gap-2 px-2 text-caption-1-regular text-text-secondary cursor-pointer">
                      <input type="checkbox" checked={rememberAiTrendAuth} onChange={event => setRememberAiTrendAuth(event.target.checked)} className="accent-accent-600" />
                      记住授权
                    </label>
                  </div>
                )}

                {aiTrendBusy && <AiGenerationPanel title="正在生成成绩趋势分析" steps={["整理历次考试", "识别关键变化", "形成教师建议"]} />}
                {!aiTrendBusy && aiTrendStatus && <p className={`text-caption-1-regular ${aiTrendError ? "text-status-danger-600" : "text-text-tertiary"}`}>{aiTrendStatus}</p>}
                <div aria-hidden={!aiTrendResult || aiTrendBusy || !aiTrendResultVisible} inert={!aiTrendResult || aiTrendBusy || !aiTrendResultVisible ? true : undefined} className={`grid transition-[grid-template-rows,opacity,transform] duration-[320ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${aiTrendResult && !aiTrendBusy && aiTrendResultVisible ? "grid-rows-[1fr] translate-y-0 opacity-100" : "grid-rows-[0fr] -translate-y-1 opacity-0"}`}>
                  <div className="overflow-hidden">
                  {aiTrendResult && <div className="grid grid-cols-1 gap-2 pb-0.5">
                    {[
                      ["总体判断", aiTrendResult.overall],
                      ["重点变化", aiTrendResult.changes],
                      ["建议关注", aiTrendResult.suggestions],
                      ["参考提示", aiTrendResult.disclaimer],
                    ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-separator-border bg-background-primary-default px-3 py-2.5">
                        <div className="text-caption-1-semibold text-text-tertiary mb-1">{label}</div>
                        <p className="text-body-regular text-text-primary leading-relaxed">{value}</p>
                      </div>
                    ))}
                  </div>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Exam Scores */}
          <div className="border-t border-separator-border pt-5">
            <h4 className="text-text-primary mb-3" style={{ fontSize: "0.9375rem" }}>考试成绩</h4>
            <div className="space-y-4">
              {examScores.map(exam => {
                const scoreEntries = getScoreEntries(exam.scores);
                const best = getBestSubject(exam.scores);
                const weak = getWeakSubject(exam.scores);
                const total = getExamTotal(exam);
                return (
                  <div key={exam.id} className="border border-separator-border rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-background-secondary-default border-b border-separator-border">
                      <span className="text-body-regular text-text-primary" style={{ fontWeight: 700 }}>{exam.name}</span>
                      <span className="text-caption-1-regular text-text-tertiary">{exam.date}</span>
                    </div>
                    <div className="p-4">
                      {/* Subject scores grid */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {scoreEntries.map(([sub, subScore]) => {
                          const isBest = sub === best;
                          const isWeak = sub === weak;
                          const cell = getStudentExamScoreCell(exam, sub, subScore);
                          const scoreKind = hasGradeScore(cell.assignedScore) ? "赋" : hasGradeScore(cell.rawScore) ? "原" : "";
                          return (
                            <div
                              key={sub}
                              aria-label={`${sub}成绩 ${subScore}，班排 ${formatGradeRank(cell.rankClass)}${hasGradeScore(cell.rankSchool) ? `，校排 ${cell.rankSchool}` : ""}`}
                              className={`rounded-xl border px-3 py-2 text-body-regular ${
                              isBest ? "border-status-success-100 bg-status-success-50" :
                              isWeak ? "border-status-danger-100 bg-status-danger-50" :
                              "border-separator-border bg-background-primary-default"
                            }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className={`${isBest ? "text-status-success-700" : isWeak ? "text-status-danger-500" : "text-text-secondary"}`} style={{ fontWeight: 600 }}>{sub}</span>
                                <span className={`flex items-center gap-1 ${isBest ? "text-status-success-700" : isWeak ? "text-status-danger-500" : "text-text-primary"}`} style={{ fontWeight: 700 }}>
                                  {scoreKind && <span className="rounded bg-background-primary-default/70 px-1 py-0.5 text-[9px] font-bold text-text-tertiary">{scoreKind}</span>}
                                  {subScore}
                                </span>
                              </div>
                              <div className="mt-1.5 flex items-center gap-2 text-[10px] leading-none text-text-tertiary">
                                <span className="font-semibold text-accent-500">班排 {formatGradeRank(cell.rankClass)}</span>
                                {hasGradeScore(cell.rankSchool) && <span>校排 {cell.rankSchool}</span>}
                                {hasGradeScore(cell.assignedScore) && hasGradeScore(cell.rawScore) && <span className="ml-auto">原 {cell.rawScore}</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Summary */}
                      <div className="flex items-center gap-4 text-body-regular">
                        <div className="flex items-center gap-1.5 text-text-secondary">
                          <span className="text-text-tertiary">总分</span>
                          <span className="text-headline-semibold text-accent-700" style={{ fontSize: "1.125rem" }}>{Math.round(total * 10) / 10}</span>
                        </div>
                        {(exam.rank || hasGradeScore(exam.totalCell?.rankClass)) && (
                          <div className="flex items-center gap-1 text-text-tertiary">
                            <span>总班排</span>
                            <span className="text-text-primary" style={{ fontWeight: 700 }}>第 {formatGradeRank(exam.totalCell?.rankClass) !== "—" ? formatGradeRank(exam.totalCell?.rankClass) : exam.rank} 名</span>
                          </div>
                        )}
                        {hasGradeScore(exam.totalCell?.rankSchool) && <div className="text-caption-1-regular text-text-tertiary">校排 {exam.totalCell.rankSchool}</div>}
                        {hasGradeScore(exam.totalCell?.assignedScore) && hasGradeScore(exam.totalCell?.rawScore) && <div className="text-caption-1-regular text-text-tertiary">原始总分 {exam.totalCell.rawScore}</div>}
                        <div className="ml-auto flex items-center gap-3">
                          <div className="flex items-center gap-1 text-caption-1-regular text-status-success-600">
                            <TrendingUp className="w-3 h-3" />{best}
                          </div>
                          <div className="flex items-center gap-1 text-caption-1-regular text-status-danger-400">
                            <TrendingDown className="w-3 h-3" />{weak}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          </div>
          )}

        </MotionSwitch>
      </div>

      <DialogPresence open={dormAssignmentOpen}>
      {dormAssignmentOpen && (
        <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="modal-panel-enter app-modal-panel w-full max-w-sm p-5">
            <div className="text-headline-semibold text-text-primary">更换宿舍</div>
            <SelectMenu value={pendingDormitoryId} onChange={setPendingDormitoryId} ariaLabel="选择宿舍" className="mt-4 w-full bg-background-secondary-default" options={[{ value: "", label: "未分配" }, ...dormitories.map(dormitory => ({ value: dormitory.id, label: dormitory.name }))]} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setDormAssignmentOpen(false)} className="rounded-xl border border-border-button-default bg-background-primary-default py-2 text-body-semibold text-text-secondary hover:bg-background-secondary-default">取消</button>
              <button onClick={() => handleDormitoryChange(pendingDormitoryId)} className="rounded-xl bg-accent-600 py-2 text-body-semibold text-text-white hover:bg-accent-700">保存</button>
            </div>
          </div>
        </div>
      )}
      </DialogPresence>

      <DialogPresence open={dormEventOpen && Boolean(currentDormitory)}>
      {dormEventOpen && currentDormitory && (
        <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="modal-panel-enter app-modal-panel w-full max-w-md p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-headline-semibold text-text-primary">记宿舍事件</div>
                <div className="mt-1 text-caption-1-regular text-text-tertiary">{student.name} · {currentDormitory.name}</div>
              </div>
              <button onClick={() => setDormEventOpen(false)} className="rounded-lg p-1 text-text-tertiary hover:bg-background-tertiary-default hover:text-text-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4">
              <DormEventForm
                members={[]}
                lockedResponsible={{ id: student.id, name: student.name }}
                onSubmit={handleAddDormEvent}
              />
            </div>
          </div>
        </div>
      )}
      </DialogPresence>
      <ConfirmDialog open={showDeleteConfirm} title="将这名学生移出当前班级？" description={`“${student.name}”会从当前名单、座位、宿舍、出勤和新作业中移出，但历史记录、成绩、任务和沟通内容都会保留，可随时从归档学生中恢复。`} confirmLabel="确认移出班级" onCancel={() => setShowDeleteConfirm(false)} onConfirm={() => onDeleteStudent(student.id)} />
      <ConfirmDialog open={Boolean(pendingRecordDelete)} title="删除这条学生记录？" description={`将删除“${pendingRecordDelete?.note || "无备注记录"}”，删除后无法恢复。`} confirmLabel="确认删除记录" onCancel={() => setPendingRecordDelete(null)} onConfirm={() => { if (!pendingRecordDelete) return; deleteRecord(pendingRecordDelete.id); setPendingRecordDelete(null); }} />
      {appDialog.dialog}
      {actionToast.toast}
    </div>
  );
}
