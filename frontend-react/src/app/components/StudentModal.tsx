import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { X, Trash2, Plus, Sparkles, TrendingUp, TrendingDown, Save, Loader2, Pencil } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type NewDormEventInput } from "../state/dormitoryActions";
import { DormEventForm } from "./DormEventForm";
import { AiStudentFollowupPanel } from "./AiStudentFollowupPanel";
import { createStudentRecord, updateStudentProfile } from "../state/studentActions";
import { readCommentRubric, readStudentCommentProfile, saveStudentCommentProfile } from "../state/commentRubricStorage";
import { BEHAVIOR_TAG_GROUPS, BEHAVIOR_TAG_IDS } from "../state/tagCatalog";
import { generateStudentAiTrend, hasStoredAiTrendAuth, readCachedStudentAiTrend, type AiTrendResult } from "../state/aiTrendService";
import type { AppStudent, AttendanceRecord, Dormitory, FollowupTask, Gender, RecordType, StudentId, StudentRecord } from "../state/types";
import { todayKey, upsertAttendance } from "../state/dailyManagement";
import { AiGenerationPanel, Button, ConfirmDialog, IconButton, SegmentedControl, SelectMenu, UnderlineTabs, useAppDialog } from "./ui";
import { AttendanceStatusControl } from "./AttendanceStatusControl";
import {
  buildWeekOptions,
  formatScore,
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

type StudentDetailTab = "records" | "profile" | "attendance" | "trend" | "followup";

const STUDENT_DETAIL_TABS: Array<{ value: StudentDetailTab; label: string; tone?: "default" | "ai" }> = [
  { value: "records", label: "奖罚记录" },
  { value: "profile", label: "档案" },
  { value: "attendance", label: "出勤" },
  { value: "trend", label: "成绩" },
  { value: "followup", label: "AI跟进", tone: "ai" },
];

interface Props {
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
  initialActiveTab?: StudentDetailTab;
  onCreateFollowupTask?: (input: { studentId: StudentId; title: string; description: string }) => void;
  attendanceRecords?: AttendanceRecord[];
  followupTasks?: FollowupTask[];
  onAttendanceChange?: (records: AttendanceRecord[]) => void;
}

export function StudentModal({
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
  initialActiveTab = "records",
  onCreateFollowupTask,
  attendanceRecords = [],
  followupTasks = [],
  onAttendanceChange,
}: Props) {
  const appDialog = useAppDialog();
  const modalHeaderRef = useRef<HTMLDivElement>(null);
  const modalTabsRef = useRef<HTMLDivElement>(null);
  const modalContentMeasureRef = useRef<HTMLDivElement>(null);
  const [modalHeight, setModalHeight] = useState<number>();
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
    }))
  );
  const [selectedWeek, setSelectedWeek] = useState(() => toLocalDateKey(getWeekStart(new Date())));
  const [syncSearch, setSyncSearch] = useState("");
  const [syncSelected, setSyncSelected] = useState<Set<StudentId>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pendingRecordDelete, setPendingRecordDelete] = useState<StudentModalRecord | null>(null);
  const [profileStatus, setProfileStatus] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
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
  const [aiTrendBusy, setAiTrendBusy] = useState(false);
  const [aiTrendAccessCode, setAiTrendAccessCode] = useState("");
  const [rememberAiTrendAuth, setRememberAiTrendAuth] = useState(true);
  const [hasAiTrendAuth, setHasAiTrendAuth] = useState(() => hasStoredAiTrendAuth());

  useEffect(() => {
    const cached = readCachedStudentAiTrend(student);
    setAiTrendResult(cached);
    setAiTrendResultVisible(Boolean(cached));
    setAiTrendStatus(cached ? "已载入上次生成的趋势分析。" : "");
    setAiTrendAccessCode("");
    setHasAiTrendAuth(hasStoredAiTrendAuth());
    setActiveTab(initialActiveTab);
  }, [initialActiveTab, student]);

  function changeActiveTab(nextTab: StudentDetailTab) {
    if (nextTab === activeTab) return;
    const currentIndex = STUDENT_DETAIL_TABS.findIndex(tab => tab.value === activeTab);
    const nextIndex = STUDENT_DETAIL_TABS.findIndex(tab => tab.value === nextTab);
    setTabDirection(nextIndex < currentIndex ? "left" : "right");
    setActiveTab(nextTab);
  }

  useEffect(() => {
    setLocalRecords(student.records.map(r => ({
      id: r.id,
      type: r.type,
      note: r.note,
      date: r.date,
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

  const syncCandidates = students.filter(s => s.id !== student.id && s.name.includes(syncSearch));

  function toggleSync(id: StudentId) {
    setSyncSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const recordTypeStyle: Record<RecordType, { bg: string; text: string; label: string }> = {
    reward: { bg: "bg-emerald-50 border-emerald-100", text: "text-emerald-700", label: "奖" },
    punish: { bg: "bg-red-50 border-red-100", text: "text-red-600", label: "罚" },
    note:   { bg: "bg-gray-50 border-gray-100", text: "text-gray-600", label: "备注" },
  };

  const seatIndex = seatOrder.findIndex(id => id === student.id);
  const seatRow = seatIndex >= 0 ? Math.floor(seatIndex / 8) + 1 : null;
  const seatCol = seatIndex >= 0 ? (seatIndex % 8) + 1 : null;
  const deskMateIndex = seatIndex >= 0 ? (seatIndex % 2 === 0 ? seatIndex + 1 : seatIndex - 1) : -1;
  const nearbyIndexes = seatIndex >= 0
    ? [seatIndex - 8, seatIndex + 8, seatIndex - 1, seatIndex + 1].filter(index => index >= 0 && index < seatOrder.length && index !== deskMateIndex)
    : [];
  const studentById = new Map(students.map(item => [item.id, item]));
  const deskMateName = deskMateIndex >= 0 ? studentById.get(seatOrder[deskMateIndex] || "")?.name || "" : "";
  const nearbyNames = nearbyIndexes
    .map(index => studentById.get(seatOrder[index] || "")?.name || "")
    .filter(Boolean);

  async function handleGenerateAiTrend() {
    setAiTrendBusy(true);
    setAiTrendResultVisible(false);
    setAiTrendStatus("正在生成趋势分析...");
    try {
      const result = await generateStudentAiTrend(student, {
        accessCode: aiTrendAccessCode,
        remember: rememberAiTrendAuth,
        force: true,
      });
      setAiTrendResult(result);
      window.requestAnimationFrame(() => setAiTrendResultVisible(true));
      setAiTrendStatus("AI 趋势分析已生成。");
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
      setHasAiTrendAuth(hasStoredAiTrendAuth());
    } finally {
      setAiTrendBusy(false);
    }
  }

  useLayoutEffect(() => {
    const header = modalHeaderRef.current;
    const tabs = modalTabsRef.current;
    const content = modalContentMeasureRef.current;
    if (!header || !tabs || !content) return;
    const updateHeight = () => {
      const viewportLimit = Math.min(768, window.innerHeight - 32);
      setModalHeight(Math.min(viewportLimit, header.offsetHeight + tabs.offsetHeight + content.scrollHeight));
    };
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(header);
    resizeObserver.observe(tabs);
    resizeObserver.observe(content);
    const mutationObserver = new MutationObserver(updateHeight);
    mutationObserver.observe(content, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", updateHeight);
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, [activeTab, profileEditing, student.id]);

  return (
    <div className="soft-backdrop-enter fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div style={modalHeight ? { height: modalHeight } : undefined} className="modal-panel-enter flex max-h-[min(48rem,calc(100vh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--app-radius-lg)] border border-white/60 bg-white shadow-[var(--app-shadow-float)] transition-[height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none">
        {/* Header */}
        <div ref={modalHeaderRef} className="flex shrink-0 items-start justify-between border-b border-gray-100 p-6 pb-4">
          <div>
            <div className="text-xs text-gray-400 mb-1" style={{ fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>学生</div>
            <h3 className="text-gray-900" style={{ fontSize: "1.25rem" }}>
              {student.name}
              <span className="text-gray-400 ml-2" style={{ fontWeight: 400, fontSize: "0.875rem" }}>· 本周 {weekOptions[0]?.key || ""}</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <>
                <button onClick={() => changeActiveTab("followup")} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors" style={{ fontWeight: 700 }}>
                  <Sparkles className="w-3.5 h-3.5" />AI跟进
                </button>
                {onOpenAiComment && (
                  <button onClick={onOpenAiComment} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-600 border border-violet-200 rounded-xl hover:bg-violet-50 transition-colors" style={{ fontWeight: 600 }}>
                    <Sparkles className="w-3.5 h-3.5" />AI评语
                  </button>
                )}
                <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors" style={{ fontWeight: 600 }}>
                  <Trash2 className="w-3.5 h-3.5" />删除学生
                </button>
                <IconButton label="关闭学生详情" size="sm" onClick={onClose}><X className="h-4 w-4" /></IconButton>
            </>
          </div>
        </div>

        <div ref={modalTabsRef} className="relative shrink-0 border-b border-gray-100 pr-28">
          <UnderlineTabs value={activeTab} options={STUDENT_DETAIL_TABS} onChange={changeActiveTab} ariaLabel="学生详情" className="border-b-0 px-6 pt-3" />
          {activeTab === "profile" && <div className="absolute bottom-2 right-6">{profileEditing ? <div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={cancelProfileEditing}>取消</Button><Button size="sm" onClick={saveProfile} disabled={!profileDirty}><Save className="h-3.5 w-3.5" />保存</Button></div> : <Button size="sm" onClick={() => { setProfileEditing(true); setProfileStatus("已进入编辑模式，修改后请保存。"); }}><Pencil className="h-3.5 w-3.5" />编辑资料</Button>}</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
        <div ref={modalContentMeasureRef} key={activeTab} className={`student-tab-content-enter space-y-5 p-6 ${tabDirection === "left" ? "student-tab-enter-left" : "student-tab-enter-right"}`}>
          {activeTab === "profile" && (
          <div className="rounded-2xl border border-gray-100">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
              <span className="text-sm text-gray-700" style={{ fontWeight: 700 }}>学生信息</span>
              <span className="text-xs text-gray-400">{profileEditing ? "编辑中 · 保存后生效" : "查看模式"}</span>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <label className="flex min-w-0 flex-col gap-1.5">
                  <span className="block text-xs text-gray-500" style={{ fontWeight: 600 }}>姓名</span>
                  <input
                    disabled={!profileEditing}
                    value={nameInput}
                    onChange={e => {
                      setNameInput(e.target.value);
                      setProfileStatus("");
                    }}
                    className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm outline-none focus:border-blue-300 disabled:cursor-default disabled:border-transparent disabled:bg-gray-50 disabled:text-gray-700"
                  />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="block text-xs text-gray-500" style={{ fontWeight: 600 }}>性别</span>
                  <SegmentedControl value={genderInput} ariaLabel="学生性别" disabled={!profileEditing} onChange={value => { setGenderInput(value as Gender); setProfileStatus(""); }} options={[{ value: "男", label: "男" }, { value: "女", label: "女" }]} className="flex h-10 w-full" />
                </div>
              </div>
              <label className="space-y-1.5 block">
                <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>别名</span>
                <input
                  disabled={!profileEditing}
                  value={aliasesInput}
                  onChange={e => {
                    setAliasesInput(e.target.value);
                    setProfileStatus("");
                  }}
                  placeholder="多个别名用顿号或逗号分隔"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-300 disabled:cursor-default disabled:border-transparent disabled:bg-gray-50 disabled:text-gray-700"
                />
              </label>

              <div className="rounded-xl border border-blue-100 bg-blue-50/40 px-3 py-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="text-xs text-blue-700" style={{ fontWeight: 800 }}>联系与住宿信息</span>
                  <span className="text-xs text-blue-500/70">仅保存在本机 / 同步备份中</span>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1.5">
                    <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>家长电话</span>
                    <input
                      disabled={!profileEditing}
                      value={parentPhoneInput}
                      onChange={e => {
                        setParentPhoneInput(e.target.value);
                        setProfileStatus("");
                      }}
                      type="tel"
                      placeholder="例如：13800000000"
                      className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-300 disabled:cursor-default disabled:border-transparent disabled:bg-white/60 disabled:text-gray-700 disabled:placeholder:text-gray-400"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>紧急联系人</span>
                    <input
                      disabled={!profileEditing}
                      value={emergencyContactInput}
                      onChange={e => {
                        setEmergencyContactInput(e.target.value);
                        setProfileStatus("");
                      }}
                      placeholder="姓名 / 关系 / 电话"
                      className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-300 disabled:cursor-default disabled:border-transparent disabled:bg-white/60 disabled:text-gray-700 disabled:placeholder:text-gray-400"
                    />
                  </label>
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>住址</span>
                    <input
                      disabled={!profileEditing}
                      value={addressInput}
                      onChange={e => {
                        setAddressInput(e.target.value);
                        setProfileStatus("");
                      }}
                      placeholder="家庭住址（可选）"
                      className="w-full rounded-xl border border-blue-100 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-blue-300 disabled:cursor-default disabled:border-transparent disabled:bg-white/60 disabled:text-gray-700 disabled:placeholder:text-gray-400"
                    />
                  </label>
                  <div className="space-y-1.5 sm:col-span-2">
                    <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>是否住宿</span>
                    <SegmentedControl value={isBoardingInput ? "boarding" : "commuter"} ariaLabel="住宿状态" disabled={!profileEditing} onChange={value => { setIsBoardingInput(value === "boarding"); setProfileStatus(""); }} options={[{ value: "commuter", label: "走读" }, { value: "boarding", label: "住宿" }]} className="flex max-w-xs" />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-400" style={{ fontWeight: 800 }}>宿舍</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <span className="text-gray-900" style={{ fontWeight: 900 }}>{currentDormitory?.name || "未分配"}</span>
                      <span className="text-gray-400">当前分 <span className={currentDormitory && currentDormitory.currentScore < 0 ? "text-red-500" : "text-emerald-600"} style={{ fontWeight: 900 }}>{currentDormitory ? `${currentDormitory.currentScore > 0 ? "+" : ""}${currentDormitory.currentScore}` : "—"}</span></span>
                      <span className="text-gray-400">成员 {currentDormitory?.memberIds.length ?? "—"}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-400">
                      最近事件：{currentDormitory?.events[0] ? `${currentDormitory.events[0].reason} · ${currentDormitory.events[0].date}` : "暂无"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => setDormAssignmentOpen(true)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50" style={{ fontWeight: 800 }}>更换宿舍</button>
                    <button onClick={() => setDormEventOpen(true)} disabled={!currentDormitory} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:bg-gray-100 disabled:text-gray-400" style={{ fontWeight: 800 }}>记宿舍事件</button>
                    <button onClick={onOpenDormitories} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50" style={{ fontWeight: 800 }}>管理</button>
                  </div>
                </div>
                {dormStatus && <p className="mt-2 text-xs text-blue-600">{dormStatus}</p>}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500" style={{ fontWeight: 700 }}>行为标签</span>
                  <span className="text-xs text-gray-400">写回旧版手动标签</span>
                </div>
                <div className="space-y-3">
                  {BEHAVIOR_TAG_GROUPS.map(group => (
                    <div key={group.id} className="grid grid-cols-[5rem_1fr] gap-3 items-start">
                      <span className="text-xs text-gray-400 pt-1.5">{group.name}</span>
                      <div className="flex flex-wrap gap-2">
                        {group.tags.map(tag => {
                          const active = selectedBehaviorTags.has(tag.id);
                          return (
                            <button
                              key={tag.id}
                              disabled={!profileEditing}
                              onClick={() => toggleBehaviorTag(tag.id)}
                              className={`rounded-full border px-2.5 py-1.5 text-sm transition-colors disabled:cursor-default ${active ? "border-blue-200 bg-blue-50 text-blue-700" : `border-gray-200 bg-white text-gray-500 ${profileEditing ? "hover:bg-gray-50" : "opacity-70"}`}`}
                              style={{ fontWeight: 600 }}
                            >
                              {tag.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs text-gray-500" style={{ fontWeight: 700 }}>学科标签</span>
                <div className="flex flex-wrap gap-2">
                  {student.academicTags.length > 0 ? student.academicTags.map(tag => {
                    const isStrong = tag.endsWith("强");
                    return (
                      <span key={tag} className={`px-2.5 py-1 rounded-full text-sm border ${isStrong ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-500 border-red-100"}`} style={{ fontWeight: 600 }}>
                        {tag}
                      </span>
                    );
                  }) : <span className="text-sm text-gray-400">暂无自动学科标签</span>}
                </div>
              </div>

              {profileStatus && <p className="text-xs text-blue-600">{profileStatus}</p>}
            </div>
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
              className="flex-1 min-w-0 px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300"
            />
            <button onClick={() => addRecord("reward")} className="shrink-0 flex items-center gap-1 px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
              <Plus className="w-3.5 h-3.5" />奖
            </button>
            <button onClick={() => addRecord("punish")} className="shrink-0 flex items-center gap-1 px-3.5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm transition-colors" style={{ fontWeight: 600 }}>
              <Plus className="w-3.5 h-3.5" />罚
            </button>
            <button onClick={() => addRecord("note")} className="shrink-0 px-3.5 py-2.5 text-sm text-gray-600 border border-gray-200 hover:bg-gray-100 rounded-xl transition-colors" style={{ fontWeight: 600 }}>
              + 备注
            </button>
          </div>

          {/* Sync to other students */}
          <div className="border border-gray-100 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <span className="text-sm text-gray-600" style={{ fontWeight: 600 }}>同步到其他学生（可选）</span>
              <div className="flex gap-2">
                <button onClick={() => setSyncSelected(new Set(students.filter(s => s.id !== student.id).map(s => s.id)))} className="text-xs text-blue-600 hover:underline">全选</button>
                <button onClick={() => setSyncSelected(new Set())} className="text-xs text-gray-400 hover:underline">清空</button>
              </div>
            </div>
            <div className="px-3 pt-2 pb-1">
              <input
                value={syncSearch}
                onChange={e => setSyncSearch(e.target.value)}
                placeholder="搜索姓名"
                className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 mb-2"
              />
              <div className="max-h-32 overflow-y-auto space-y-0.5 pb-2">
                {syncCandidates.slice(0, 12).map(s => (
                  <label key={s.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncSelected.has(s.id)}
                      onChange={() => toggleSync(s.id)}
                      className="w-4 h-4 accent-blue-600 rounded"
                    />
                    <span className="text-sm text-gray-700">{s.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Week selector + Records */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600" style={{ fontWeight: 600 }}>查看周</span>
            <SelectMenu value={selectedWeek} onChange={setSelectedWeek} ariaLabel="查看周" className="w-64 bg-gray-50" options={weekOptions.map(week => ({ value: week.key, label: week.label }))} />
          </div>

          {filteredRecords.length > 0 ? (
            <div className="space-y-2">
              {filteredRecords.map(record => (
                <div key={record.id} className={`flex items-center gap-3 px-4 py-3 border rounded-xl ${recordTypeStyle[record.type].bg}`}>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${recordTypeStyle[record.type].bg} ${recordTypeStyle[record.type].text}`} style={{ fontWeight: 700 }}>
                    {recordTypeStyle[record.type].label}
                  </span>
                  <span className={`flex-1 text-sm ${recordTypeStyle[record.type].text}`}>{record.note || "(无备注)"}</span>
                  <span className="text-xs text-gray-400">{record.date}</span>
                  <button onClick={() => setPendingRecordDelete(record)} aria-label={`删除记录 ${record.note || "无备注"}`} className="p-1 text-gray-300 hover:text-red-500 hover:bg-white/70 rounded-lg transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-3">该周暂无记录，可以先来添加奖罚。</p>
          )}
          </div>
          )}

          {activeTab === "followup" && (
            <AiStudentFollowupPanel
              student={student}
              context={{
                dormitories,
                seatIndex: seatIndex >= 0 ? seatIndex : null,
                seatLabel: seatRow && seatCol ? `第${seatRow}排 第${seatCol}列` : "",
                deskMateName,
                nearbyNames,
                scenario: "detail",
              }}
              onSaveRecord={saveAiFollowupRecord}
              onAppendCommentMaterial={appendAiFollowupMaterial}
              onCreateTask={input => onCreateFollowupTask?.({ studentId: student.id, ...input })}
            />
          )}

          {activeTab === "attendance" && (() => { const current = attendanceRecords.find(item => item.studentId === student.id && item.date === todayKey()); const month = todayKey().slice(0,7); const monthly = attendanceRecords.filter(item => item.studentId === student.id && item.date.startsWith(month)); return <div className="space-y-4"><div className="grid grid-cols-4 gap-2">{[{label:"请假",value:monthly.filter(item=>item.status==="leave").length},{label:"缺勤",value:monthly.filter(item=>item.status==="absent").length},{label:"迟到",value:monthly.filter(item=>item.late).length},{label:"早退",value:monthly.filter(item=>item.earlyLeave).length}].map(item=><div key={item.label} className="rounded-xl bg-gray-50 p-3 text-center"><div className="text-xl font-black text-gray-800">{item.value}</div><div className="text-xs text-gray-400">本月{item.label}</div></div>)}</div><div className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><div className="mb-3 text-sm font-bold text-gray-800">今日状态</div><AttendanceStatusControl value={current?.status||"normal"} late={current?.late||false} earlyLeave={current?.earlyLeave||false} onChange={patch=>onAttendanceChange?.(upsertAttendance(attendanceRecords,{studentId:student.id,date:todayKey(),status:patch.status??current?.status??"normal",late:patch.late??current?.late??false,earlyLeave:patch.earlyLeave??current?.earlyLeave??false,note:current?.note||"",leaveStart:current?.leaveStart,leaveEnd:current?.leaveEnd}))}/></div><div className="space-y-2">{attendanceRecords.filter(item=>item.studentId===student.id).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12).map(item=><div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 px-4 py-3"><span className="text-sm font-bold text-gray-700">{item.date}</span><span className="text-sm text-gray-500">{item.status==="leave"?"请假":item.status==="absent"?"缺勤":"正常"}{item.late?" · 迟到":""}{item.earlyLeave?" · 早退":""}</span></div>)}{!attendanceRecords.some(item=>item.studentId===student.id)&&<p className="py-8 text-center text-sm text-gray-400">暂无出勤异常</p>}</div><div className="rounded-xl bg-violet-50 p-3 text-sm text-violet-700">当前跟进任务 {followupTasks.filter(task=>task.studentId===student.id&&task.status==="pending").length} 项</div></div>; })()}

          {activeTab === "trend" && (
          <div className="space-y-5">
          {/* Grade Trend */}
          <div className="border border-gray-100 rounded-2xl overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div>
                <span className="text-sm text-gray-700" style={{ fontWeight: 700 }}>成绩趋势</span>
                <p className="text-xs text-gray-400 mt-0.5">{chronologicalExams.length} 次考试 · 趋势按时间先后展示</p>
              </div>
              <div className="max-w-[60%] overflow-x-auto">
                <SegmentedControl value={effectiveTrendMetric} ariaLabel="成绩趋势科目" onChange={setTrendMetric} options={trendMetricOptions.slice(0, 7).map(metric => ({ value: metric, label: metric === "total" ? "总分" : metric }))} className="shrink-0" />
              </div>
            </div>
            <div className="p-4 space-y-4">
              {hasTrendChart ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={36} />
                      <Tooltip
                        labelFormatter={label => String(label || "")}
                        formatter={(value) => [formatScore(typeof value === "number" ? value : null), effectiveTrendMetric === "total" ? "总分" : effectiveTrendMetric]}
                        contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
                      />
                      <Line
                        type="monotone"
                        dataKey={effectiveTrendMetric}
                        stroke="#2563eb"
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: "#2563eb", strokeWidth: 0 }}
                        activeDot={{ r: 5, fill: "#1d4ed8", stroke: "#dbeafe", strokeWidth: 3 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-400">
                  至少需要两次有效考试，才会显示趋势图。
                </div>
              )}

              <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm text-violet-700" style={{ fontWeight: 700 }}>
                      <Sparkles className="w-4 h-4" />AI 成绩趋势分析
                    </div>
                  </div>
                  <button
                    onClick={handleGenerateAiTrend}
                    disabled={aiTrendBusy || chronologicalExams.length < 2}
                    className="inline-flex shrink-0 items-center justify-center gap-2 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ fontWeight: 700 }}
                  >
                    {aiTrendBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                    {aiTrendBusy ? "正在分析" : aiTrendResult ? "重新生成" : "生成分析"}
                  </button>
                </div>

                {!hasAiTrendAuth && (
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                    <input
                      value={aiTrendAccessCode}
                      onChange={event => setAiTrendAccessCode(event.target.value)}
                      type="password"
                      placeholder="输入 AI 授权码"
                      className="min-w-0 px-3 py-2 text-sm bg-white border border-violet-100 rounded-xl outline-none focus:border-violet-300"
                    />
                    <label className="flex items-center gap-2 px-2 text-xs text-violet-500 cursor-pointer">
                      <input type="checkbox" checked={rememberAiTrendAuth} onChange={event => setRememberAiTrendAuth(event.target.checked)} className="accent-violet-600" />
                      记住授权
                    </label>
                  </div>
                )}

                {aiTrendBusy && <AiGenerationPanel title="正在生成成绩趋势分析" steps={["整理历次考试", "识别关键变化", "形成教师建议"]} />}
                {!aiTrendBusy && aiTrendStatus && <p className="text-xs text-violet-600">{aiTrendStatus}</p>}
                <div aria-hidden={!aiTrendResult || aiTrendBusy || !aiTrendResultVisible} inert={!aiTrendResult || aiTrendBusy || !aiTrendResultVisible} className={`grid transition-[grid-template-rows,opacity,transform] duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${aiTrendResult && !aiTrendBusy && aiTrendResultVisible ? "grid-rows-[1fr] translate-y-0 opacity-100" : "grid-rows-[0fr] -translate-y-1 opacity-0"}`}>
                  <div className="overflow-hidden">
                  {aiTrendResult && <div className="ai-followup-result-enter grid grid-cols-1 gap-2 pb-0.5">
                    {[
                      ["总体判断", aiTrendResult.overall],
                      ["重点变化", aiTrendResult.changes],
                      ["建议关注", aiTrendResult.suggestions],
                      ["参考提示", aiTrendResult.disclaimer],
                    ].filter(([, value]) => Boolean(value)).map(([label, value]) => (
                      <div key={label} className="rounded-xl border border-violet-100 bg-white px-3 py-2.5">
                        <div className="text-xs text-violet-500 mb-1" style={{ fontWeight: 700 }}>{label}</div>
                        <p className="text-sm text-gray-700 leading-relaxed">{value}</p>
                      </div>
                    ))}
                  </div>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Exam Scores */}
          <div className="border-t border-gray-100 pt-5">
            <h4 className="text-gray-700 mb-3" style={{ fontSize: "0.9375rem" }}>考试成绩</h4>
            <div className="space-y-4">
              {examScores.map(exam => {
                const scoreEntries = getScoreEntries(exam.scores);
                const best = getBestSubject(exam.scores);
                const weak = getWeakSubject(exam.scores);
                const total = getExamTotal(exam);
                return (
                  <div key={exam.id} className="border border-gray-100 rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                      <span className="text-sm text-gray-700" style={{ fontWeight: 700 }}>{exam.name}</span>
                      <span className="text-xs text-gray-400">{exam.date}</span>
                    </div>
                    <div className="p-4">
                      {/* Subject scores grid */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        {scoreEntries.map(([sub, subScore]) => {
                          const isBest = sub === best;
                          const isWeak = sub === weak;
                          return (
                            <div key={sub} className={`flex items-center justify-between px-3 py-2 rounded-xl border text-sm ${
                              isBest ? "border-emerald-100 bg-emerald-50" :
                              isWeak ? "border-red-100 bg-red-50" :
                              "border-gray-100 bg-white"
                            }`}>
                              <span className={`${isBest ? "text-emerald-700" : isWeak ? "text-red-500" : "text-gray-600"}`} style={{ fontWeight: 600 }}>{sub}</span>
                              <span className={`${isBest ? "text-emerald-700" : isWeak ? "text-red-500" : "text-gray-800"}`} style={{ fontWeight: 700 }}>{subScore}</span>
                            </div>
                          );
                        })}
                      </div>
                      {/* Summary */}
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1.5 text-gray-600">
                          <span className="text-gray-400">总分</span>
                          <span className="text-blue-700" style={{ fontWeight: 800, fontSize: "1.125rem" }}>{Math.round(total * 10) / 10}</span>
                        </div>
                        {exam.rank && (
                          <div className="flex items-center gap-1 text-gray-400">
                            <span>总排名</span>
                            <span className="text-gray-700" style={{ fontWeight: 700 }}>第 {exam.rank} 名</span>
                          </div>
                        )}
                        <div className="ml-auto flex items-center gap-3">
                          <div className="flex items-center gap-1 text-xs text-emerald-600">
                            <TrendingUp className="w-3 h-3" />{best}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-red-400">
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

        </div>
        </div>
      </div>

      {dormAssignmentOpen && (
        <div className="soft-backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-black/20 p-4 backdrop-blur-[1px]">
          <div className="modal-panel-enter w-full max-w-sm rounded-[var(--app-radius-lg)] border border-gray-100 bg-white p-5 shadow-[var(--app-shadow-float)]">
            <div className="text-base text-gray-900" style={{ fontWeight: 900 }}>更换宿舍</div>
            <SelectMenu value={pendingDormitoryId} onChange={setPendingDormitoryId} ariaLabel="选择宿舍" className="mt-4 w-full bg-gray-50" options={[{ value: "", label: "未分配" }, ...dormitories.map(dormitory => ({ value: dormitory.id, label: dormitory.name }))]} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setDormAssignmentOpen(false)} className="rounded-xl border border-gray-200 bg-white py-2 text-sm text-gray-600 hover:bg-gray-50" style={{ fontWeight: 800 }}>取消</button>
              <button onClick={() => handleDormitoryChange(pendingDormitoryId)} className="rounded-xl bg-blue-600 py-2 text-sm text-white hover:bg-blue-700" style={{ fontWeight: 800 }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {dormEventOpen && currentDormitory && (
        <div className="soft-backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-black/20 p-4 backdrop-blur-[1px]">
          <div className="modal-panel-enter w-full max-w-md rounded-[var(--app-radius-lg)] border border-gray-100 bg-white p-5 shadow-[var(--app-shadow-float)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base text-gray-900" style={{ fontWeight: 900 }}>记宿舍事件</div>
                <div className="mt-1 text-xs text-gray-400">{student.name} · {currentDormitory.name}</div>
              </div>
              <button onClick={() => setDormEventOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
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
      <ConfirmDialog open={showDeleteConfirm} title="删除这名学生？" description={`将删除“${student.name}”在当前学期的档案、记录、出勤和跟进数据，并从当前座位及宿舍中移除。删除后无法恢复。`} confirmLabel="确认删除学生" onCancel={() => setShowDeleteConfirm(false)} onConfirm={() => onDeleteStudent(student.id)} />
      <ConfirmDialog open={Boolean(pendingRecordDelete)} title="删除这条学生记录？" description={`将删除“${pendingRecordDelete?.note || "无备注记录"}”，删除后无法恢复。`} confirmLabel="确认删除记录" onCancel={() => setPendingRecordDelete(null)} onConfirm={() => { if (!pendingRecordDelete) return; deleteRecord(pendingRecordDelete.id); setPendingRecordDelete(null); }} />
      {appDialog.dialog}
    </div>
  );
}
