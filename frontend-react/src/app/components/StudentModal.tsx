import { useEffect, useMemo, useState } from "react";
import { X, Trash2, Plus, Sparkles, TrendingUp, TrendingDown, Save } from "lucide-react";
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
import { createStudentRecord, updateStudentProfile } from "../state/studentActions";
import { BEHAVIOR_TAG_GROUPS, BEHAVIOR_TAG_IDS } from "../state/tagCatalog";
import { generateStudentAiTrend, hasStoredAiTrendAuth, readCachedStudentAiTrend, type AiTrendResult } from "../state/aiTrendService";
import type { AppStudent, Dormitory, Gender, RecordType, StudentExamSummary, StudentId, StudentRecord } from "../state/types";

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
}

interface LocalRecord {
  id: string;
  type: RecordType;
  note: string;
  date: string;
}

const WEEKS = [
  "2026-06-14（本周）",
  "2026-06-07",
  "2026-05-31",
  "2026-05-24",
  "2026-05-17",
];

function getScoreEntries(scores: Record<string, number>): Array<[string, number]> {
  return Object.entries(scores).filter(([, score]) => Number.isFinite(score));
}

function getBestSubject(scores: Record<string, number>): string {
  return getScoreEntries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

function getWeakSubject(scores: Record<string, number>): string {
  return getScoreEntries(scores).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "";
}

function getExamTotal(exam: StudentExamSummary): number {
  return exam.total ?? getScoreEntries(exam.scores).reduce((sum, [, score]) => sum + score, 0);
}

function getExamSortValue(exam: StudentExamSummary): string {
  return `${exam.date || "9999-12-31"}-${exam.name}-${exam.id}`;
}

function formatScore(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "—";
}

function parseAliases(value: string): string[] {
  return value
    .split(/[、,，\n]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function sortTagIds(ids: Iterable<string>): string {
  return [...ids].sort().join("|");
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
}: Props) {
  const [nameInput, setNameInput] = useState(student.name);
  const [genderInput, setGenderInput] = useState<Gender>(student.gender);
  const [aliasesInput, setAliasesInput] = useState(student.aliases.join("、"));
  const [selectedBehaviorTags, setSelectedBehaviorTags] = useState<Set<string>>(
    () => new Set(student.manualTagIds.filter(id => BEHAVIOR_TAG_IDS.has(id)))
  );
  const [noteInput, setNoteInput] = useState("");
  const [localRecords, setLocalRecords] = useState<LocalRecord[]>(() =>
    student.records.map(r => ({
      id: r.id,
      type: r.type,
      note: r.note,
      date: r.date,
    }))
  );
  const [selectedWeek, setSelectedWeek] = useState(WEEKS[0]);
  const [syncSearch, setSyncSearch] = useState("");
  const [syncSelected, setSyncSelected] = useState<Set<StudentId>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [profileStatus, setProfileStatus] = useState("");
  const [dormStatus, setDormStatus] = useState("");
  const [activeTab, setActiveTab] = useState<"records" | "profile" | "trend">("records");
  const [dormAssignmentOpen, setDormAssignmentOpen] = useState(false);
  const [dormEventOpen, setDormEventOpen] = useState(false);
  const [pendingDormitoryId, setPendingDormitoryId] = useState(student.dormitoryId || "");
  const [trendMetric, setTrendMetric] = useState("total");
  const [aiTrendResult, setAiTrendResult] = useState<AiTrendResult | null>(() => readCachedStudentAiTrend(student));
  const [aiTrendStatus, setAiTrendStatus] = useState("");
  const [aiTrendBusy, setAiTrendBusy] = useState(false);
  const [aiTrendAccessCode, setAiTrendAccessCode] = useState("");
  const [rememberAiTrendAuth, setRememberAiTrendAuth] = useState(true);
  const [hasAiTrendAuth, setHasAiTrendAuth] = useState(() => hasStoredAiTrendAuth());

  useEffect(() => {
    const cached = readCachedStudentAiTrend(student);
    setAiTrendResult(cached);
    setAiTrendStatus(cached ? "已载入上次生成的趋势分析。" : "");
    setAiTrendAccessCode("");
    setHasAiTrendAuth(hasStoredAiTrendAuth());
  }, [student]);

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
    selectedBehaviorTagKey !== initialBehaviorTagKey;

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
      manualTagIds: [...preservedManualTagIds, ...selectedBehaviorTags],
    });
    onUpdateStudent(nextStudent);
    setProfileStatus("学生信息已保存。");
  }

  function addRecord(type: RecordType) {
    if (type !== "note" && !noteInput.trim() && !window.confirm("不填备注直接添加？")) return;
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

  async function handleGenerateAiTrend() {
    setAiTrendBusy(true);
    setAiTrendStatus("正在生成趋势分析...");
    try {
      const result = await generateStudentAiTrend(student, {
        accessCode: aiTrendAccessCode,
        remember: rememberAiTrendAuth,
        force: true,
      });
      setAiTrendResult(result);
      setAiTrendStatus("AI 趋势分析已生成。");
      setAiTrendAccessCode("");
      setHasAiTrendAuth(hasStoredAiTrendAuth());
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      const messages: Record<string, string> = {
        ai_auth_required: "请输入 AI 授权码后再生成。",
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

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center p-4 pt-12 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mb-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-gray-100">
          <div>
            <div className="text-xs text-gray-400 mb-1" style={{ fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>学生</div>
            <h3 className="text-gray-900" style={{ fontSize: "1.25rem" }}>
              {student.name}
              <span className="text-gray-400 ml-2" style={{ fontWeight: 400, fontSize: "0.875rem" }}>· 周起始 2026-06-14</span>
            </h3>
          </div>
          <div className="flex items-center gap-2">
            {showDeleteConfirm ? (
              <>
                <span className="text-xs text-red-500 mr-1">确认删除？</span>
                <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">取消</button>
                <button onClick={() => onDeleteStudent(student.id)} className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors" style={{ fontWeight: 600 }}>确认</button>
              </>
            ) : (
              <>
                {onOpenAiComment && (
                  <button onClick={onOpenAiComment} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-violet-600 border border-violet-200 rounded-xl hover:bg-violet-50 transition-colors" style={{ fontWeight: 600 }}>
                    <Sparkles className="w-3.5 h-3.5" />AI评语
                  </button>
                )}
                <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors" style={{ fontWeight: 600 }}>
                  <Trash2 className="w-3.5 h-3.5" />删除学生
                </button>
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 border-b border-gray-100 px-6 pt-3">
          {([["records", "奖罚记录"], ["profile", "档案"], ["trend", "成绩"]] as Array<["records" | "profile" | "trend", string]>).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`relative px-4 py-2.5 text-sm font-semibold transition-colors ${activeTab === key ? "text-blue-700" : "text-gray-400 hover:text-gray-600"}`}
            >
              {label}
              {activeTab === key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-blue-600" />}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(100vh-14rem)]">
          {activeTab === "profile" && (
          <div className="border border-gray-100 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
              <span className="text-sm text-gray-700" style={{ fontWeight: 700 }}>学生信息</span>
              <button
                onClick={saveProfile}
                disabled={!profileDirty}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-xl transition-colors ${profileDirty ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-gray-100 text-gray-400 cursor-default"}`}
                style={{ fontWeight: 600 }}
              >
                <Save className="w-3.5 h-3.5" />保存信息
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>姓名</span>
                  <input
                    value={nameInput}
                    onChange={e => {
                      setNameInput(e.target.value);
                      setProfileStatus("");
                    }}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-300"
                  />
                </label>
                <div className="space-y-1.5">
                  <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>性别</span>
                  <div className="grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-xl">
                    {(["男", "女"] as Gender[]).map(gender => (
                      <button
                        key={gender}
                        onClick={() => {
                          setGenderInput(gender);
                          setProfileStatus("");
                        }}
                        className={`px-4 py-1.5 text-sm rounded-lg transition-colors ${genderInput === gender ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                        style={{ fontWeight: 700 }}
                      >
                        {gender}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <label className="space-y-1.5 block">
                <span className="text-xs text-gray-500" style={{ fontWeight: 600 }}>别名</span>
                <input
                  value={aliasesInput}
                  onChange={e => {
                    setAliasesInput(e.target.value);
                    setProfileStatus("");
                  }}
                  placeholder="多个别名用顿号或逗号分隔"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:border-blue-300"
                />
              </label>

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
                              onClick={() => toggleBehaviorTag(tag.id)}
                              className={`px-2.5 py-1.5 rounded-full text-sm border transition-colors ${active ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"}`}
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
            <select
              value={selectedWeek}
              onChange={e => setSelectedWeek(e.target.value)}
              className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300 cursor-pointer"
            >
              {WEEKS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          {localRecords.length > 0 ? (
            <div className="space-y-2">
              {localRecords.map(record => (
                <div key={record.id} className={`flex items-center gap-3 px-4 py-3 border rounded-xl ${recordTypeStyle[record.type].bg}`}>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${recordTypeStyle[record.type].bg} ${recordTypeStyle[record.type].text}`} style={{ fontWeight: 700 }}>
                    {recordTypeStyle[record.type].label}
                  </span>
                  <span className={`flex-1 text-sm ${recordTypeStyle[record.type].text}`}>{record.note || "(无备注)"}</span>
                  <span className="text-xs text-gray-400">{record.date}</span>
                  <button onClick={() => deleteRecord(record.id)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-white/70 rounded-lg transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-3">本周暂无记录，可以先来添加奖罚。</p>
          )}
          </div>
          )}

          {activeTab === "trend" && (
          <div className="space-y-5">
          {/* Grade Trend */}
          <div className="border border-gray-100 rounded-2xl overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
              <div>
                <span className="text-sm text-gray-700" style={{ fontWeight: 700 }}>成绩趋势</span>
                <p className="text-xs text-gray-400 mt-0.5">{chronologicalExams.length} 次考试 · 趋势按时间先后展示</p>
              </div>
              <div className="flex flex-nowrap justify-end gap-1 overflow-x-auto">
                {trendMetricOptions.slice(0, 7).map(metric => (
                  <button
                    key={metric}
                    onClick={() => setTrendMetric(metric)}
                    className={`shrink-0 px-2.5 py-1 rounded-lg text-xs transition-colors ${effectiveTrendMetric === metric ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:bg-white"}`}
                    style={{ fontWeight: 700 }}
                  >
                    {metric === "total" ? "总分" : metric}
                  </button>
                ))}
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
                    className="shrink-0 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ fontWeight: 700 }}
                  >
                    {aiTrendBusy ? "生成中" : aiTrendResult ? "重新生成" : "生成分析"}
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

                {aiTrendStatus && <p className="text-xs text-violet-600">{aiTrendStatus}</p>}
                {aiTrendResult && (
                  <div className="grid grid-cols-1 gap-2">
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
                  </div>
                )}
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

      {dormAssignmentOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl">
            <div className="text-base text-gray-900" style={{ fontWeight: 900 }}>更换宿舍</div>
            <select
              value={pendingDormitoryId}
              onChange={event => setPendingDormitoryId(event.target.value)}
              className="mt-4 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300"
            >
              <option value="">未分配</option>
              {dormitories.map(dormitory => <option key={dormitory.id} value={dormitory.id}>{dormitory.name}</option>)}
            </select>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => setDormAssignmentOpen(false)} className="rounded-xl border border-gray-200 bg-white py-2 text-sm text-gray-600 hover:bg-gray-50" style={{ fontWeight: 800 }}>取消</button>
              <button onClick={() => handleDormitoryChange(pendingDormitoryId)} className="rounded-xl bg-blue-600 py-2 text-sm text-white hover:bg-blue-700" style={{ fontWeight: 800 }}>保存</button>
            </div>
          </div>
        </div>
      )}

      {dormEventOpen && currentDormitory && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/20 p-4">
          <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-5 shadow-2xl">
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
    </div>
  );
}
