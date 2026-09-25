import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useEffect, useMemo, useState } from "react";
import { FileUp, ListOrdered, PanelLeftClose, PanelLeftOpen, Pencil, Plus, RotateCcw, Sparkles, Table, Trash2 } from "lucide-react";

import { useInitialTargetEffect } from "../../hooks/useInitialTargetEffect";

import { hasStoredAiScoreMappingAuth, suggestScoreMappingWithAi, type AiScoreMappingSuggestion } from "../../state/aiScoreMappingService";
import { applyAutomaticClassRanks, getMissingClassRankSummary } from "../../state/gradeRanking";
import {
  buildScoreImportDraftFromRows,
  createSavedGradeExamRecord,
  detectScoreMapping,
  prefetchXlsxAsset,
  prepareScoreRows,
  parseRowsWithMapping,
  readRowsFromFile,
  SUBJECT_ORDER,
  type ScoreMapping,
} from "../../state/scoreImport";
import type { AiClassTrendResult } from "../../state/aiTrendService";
import type { GradeThresholds } from "../../state/teacherWorkbench";
import type { AppStudent, FollowupTask, GradeExam, GradeItemAnalysis, GradeQuestionDefinition, SavedGradeExamRecord, ScoreImportDraft, StudentId } from "../../state/types";
import type { TimelineTarget } from "../../state/dataInsights";
import { ExamTableModal } from "../ExamTableModal";
import { GradesPage } from "../GradesPage";
import { AiGenerationPanel, Checkbox, Input, MotionSwitch, Button, ConfirmDialog, DatePicker, DialogPresence, FileDropZone, IconButton, InlineStatus, ModalHeader, ModalShell, SelectMenu, UnderlineTabs, useActionToast, useModalFocus } from "../ui";
import { assignColumnRole, columnRoleOf, columnRoleOptions, mappedColumnCount } from "../scoreColumnRoles";
import { ScoreItemAnalysisPanel } from "../ScoreItemAnalysisPanel";
import { WorkspacePanel as Panel } from "./WorkspacePanel";
import { toLocalDateKey } from "../../state/dateKey";

export function ScoresWorkspace({
  exams,
  students,
  onSelectStudent,
  onOpenStudentFollowup,
  onSaveScoreImport,
  onUpdateGradeExam,
  onDeleteGradeExam,
  onGenerateClassAnalysis,
  onGenerateLocalClassAnalysis,
  onGenerateStudentTrendAdvice,
  studentAdviceProgress,
  onSaveItemAnalysis,
  onCreateScoreFollowup,
  onCreateQuestionFollowups,
  tasks,
  initialTarget,
  onInitialTargetConsumed,
  onOpenTask,
  gradeThresholds,
  onGradeThresholdsChange,
}: {
  exams: GradeExam[];
  students: AppStudent[];
  onSelectStudent: (student: AppStudent) => void;
  onOpenStudentFollowup: (student: AppStudent) => void;
  onSaveScoreImport: (record: SavedGradeExamRecord) => GradeExam | null;
  onUpdateGradeExam: (examId: string, name: string, date: string) => boolean;
  onDeleteGradeExam: (examId: string) => (() => void) | null;
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
  onSaveItemAnalysis: (examId: string, itemAnalysis: GradeItemAnalysis) => boolean;
  onCreateScoreFollowup: (studentId: string, exam: GradeExam, reason: string) => void;
  onCreateQuestionFollowups: (studentIds: StudentId[], exam: GradeExam, question: GradeQuestionDefinition) => void;
  tasks: FollowupTask[];
  initialTarget?: TimelineTarget;
  onInitialTargetConsumed?: () => void;
  onOpenTask?: (taskId: string) => void;
  gradeThresholds?: GradeThresholds;
  onGradeThresholdsChange?: (next: GradeThresholds) => void;
}) {
  const actionToast = useActionToast();
  const [draft, setDraft] = useState<ScoreImportDraft | null>(null);
  const [sourceDraft, setSourceDraft] = useState<ScoreImportDraft | null>(null);
  const [scoreRows, setScoreRows] = useState<string[][]>([]);
  const [scoreFilename, setScoreFilename] = useState("");
  const [manualMapping, setManualMapping] = useState<ScoreMapping | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const mappingModalRef = useModalFocus(mappingModalOpen, () => setMappingModalOpen(false));
  const [rankChoice, setRankChoice] = useState<"pending" | "auto" | "source">("pending");
  const [rankDialogOpen, setRankDialogOpen] = useState(false);
  const [scoreStatus, setScoreStatus] = useState("");
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState(toLocalDateKey());
  const [remappingExamId, setRemappingExamId] = useState("");
  const [aiMappingBusy, setAiMappingBusy] = useState(false);
  const [aiMappingSuggestion, setAiMappingSuggestion] = useState<AiScoreMappingSuggestion | null>(null);
  const [aiMappingAccessCode, setAiMappingAccessCode] = useState("");
  const [aiMappingRemember, setAiMappingRemember] = useState(true);
  const [hasAiMappingAuth, setHasAiMappingAuth] = useState(() => hasStoredAiScoreMappingAuth());
  const [examTable, setExamTable] = useState<GradeExam | null>(null);
  const [editingExamId, setEditingExamId] = useState("");
  const [editExamName, setEditExamName] = useState("");
  const [editExamDate, setEditExamDate] = useState("");
  const [classAnalysis, setClassAnalysis] = useState<AiClassTrendResult | null>(null);
  const [classAnalysisStatus, setClassAnalysisStatus] = useState("");
  const [classAnalysisBusy, setClassAnalysisBusy] = useState(false);
  const isMobile = useMediaQuery("(max-width: 767px), (max-height: 500px) and (pointer: coarse)");
  const [managementOpen, setManagementOpen] = useState(() => !window.matchMedia("(max-width: 767px), (max-height: 500px) and (pointer: coarse)").matches);
  const [pendingDeleteExam, setPendingDeleteExam] = useState<GradeExam | null>(null);
  const [deleteExamError, setDeleteExamError] = useState("");
  const [scoreView, setScoreView] = useState<"overview" | "items">("overview");
  useEffect(() => prefetchXlsxAsset(), []);
  // 目标复制到本地后立刻回收，懒加载面板挂载时仍能拿到定位参数。
  const [analysisTarget, setAnalysisTarget] = useState<TimelineTarget | undefined>(initialTarget);
  useInitialTargetEffect(initialTarget?.entityId ? `${initialTarget.entityId}|${initialTarget.subEntityId || ""}` : undefined, () => {
    setAnalysisTarget(initialTarget);
    if (initialTarget?.entityId && initialTarget.subEntityId) setScoreView("items");
  }, onInitialTargetConsumed);

  async function readScoreFile(file?: File) {
    if (!file) return;
    setScoreStatus("正在解析成绩表...");
    setAiMappingSuggestion(null);
    try {
      const rows = prepareScoreRows(await readRowsFromFile(file));
      const mapping = detectScoreMapping(rows);
      setManualMapping(mapping);
      const nextDraft = {
        ...parseRowsWithMapping(rows, mapping),
        filename: file.name,
      };
      setScoreRows(rows);
      setScoreFilename(file.name);
      setDraft(nextDraft);
      setSourceDraft(nextDraft);
      const missingRanks = getMissingClassRankSummary(nextDraft);
      setRankChoice(missingRanks.missingCellCount ? "pending" : "source");
      setRankDialogOpen(missingRanks.missingCellCount > 0);
      if (!remappingExamId) {
        setExamName(file.name.replace(/\.[^.]+$/, "") || "考试");
        setExamDate(toLocalDateKey());
      }
      setScoreStatus(`已解析 ${nextDraft.entries.length} 名学生、${nextDraft.subjects.length} 个科目。${nextDraft.warnings.length ? " 可打开映射设置进一步确认。" : ""}`);
    } catch (error) {
      try {
        const rows = prepareScoreRows(await readRowsFromFile(file));
        setManualMapping(detectScoreMapping(rows));
        setScoreRows(rows);
        setScoreFilename(file.name);
        if (!remappingExamId) {
          setExamName(file.name.replace(/\.[^.]+$/, "") || "考试");
          setExamDate(toLocalDateKey());
        }
      } catch {
        setScoreRows([]);
        setScoreFilename("");
        setManualMapping(null);
      }
      setDraft(null);
      setSourceDraft(null);
      setRankChoice("pending");
      setRankDialogOpen(false);
      const reason = error instanceof Error ? error.message : "";
      setScoreStatus({
        mapping_failed: "未能自动识别姓名或科目列，可打开映射设置。",
        xlsx_unavailable: "Excel 解析组件加载失败，请刷新页面后重试；若仍失败，可先另存为 CSV 再导入。",
        empty_file: "成绩表为空，或第一个工作表没有可读取内容。",
        unsupported_file: "暂只支持 .xlsx / .xls / .xlsm / .csv / .tsv。",
      }[reason] || "成绩表解析失败，请检查文件格式。");
    }
  }

  function updateManualMapping(updater: (mapping: ScoreMapping) => ScoreMapping) {
    if (!manualMapping && scoreRows.length) {
      setManualMapping(updater(detectScoreMapping(scoreRows)));
      return;
    }
    if (manualMapping) {
      setManualMapping(updater(manualMapping));
    }
  }

  function applyManualMapping() {
    if (!manualMapping || !scoreRows.length) {
      setScoreStatus("请先上传成绩表并设置映射。");
      return;
    }
    try {
      const nextDraft = buildScoreImportDraftFromRows(scoreRows, scoreFilename, manualMapping);
      setSourceDraft(nextDraft);
      setDraft(rankChoice === "auto" ? applyAutomaticClassRanks(nextDraft) : nextDraft);
      setMappingModalOpen(false);
      setAiMappingSuggestion(null);
      if (rankChoice === "pending" && getMissingClassRankSummary(nextDraft).missingCellCount) {
        setRankDialogOpen(true);
      }
      setScoreStatus(`已应用手动映射：${nextDraft.entries.length} 名学生、${nextDraft.subjects.length} 个科目。`);
    } catch {
      setScoreStatus("手动映射无法应用，请至少选择姓名列和一个科目分数列。");
    }
  }

  function applyRankChoice(choice: "auto" | "source") {
    if (!sourceDraft) return;
    setRankChoice(choice);
    setDraft(choice === "auto" ? applyAutomaticClassRanks(sourceDraft) : sourceDraft);
    setRankDialogOpen(false);
    setScoreStatus(choice === "auto"
      ? "已按有效成绩补全缺失班排；已有班排和校排保持原值。"
      : "已保留原表排名，缺失班排不会自动补全。");
  }

  function getAiMappingErrorMessage(reason: string): string {
    return {
      ai_auth_required: "产品授权已失效，请退出后重新登录。",
      ai_unauthorized: "当前授权未开通 AI 或 AI 已到期。",
      ai_auth_failed: "AI 授权暂时不可用，请稍后重试。",
      ai_file_protocol: "当前是本地文件打开方式，请通过网页地址打开后再使用 AI。",
      ai_offline: "当前离线，联网后可使用 AI 映射。",
      ai_rate_limited: "今日 AI 调用较多，请稍后再试。",
      ai_mapping_empty: "成绩表没有可识别的表头。",
      ai_mapping_failed: "AI 暂未能识别出姓名和科目列。",
    }[reason] || "AI 映射暂时不可用，请稍后重试。";
  }

  async function generateAiMapping() {
    if (!scoreRows.length) {
      setScoreStatus("请先上传成绩表。");
      return;
    }
    setAiMappingBusy(true);
    setScoreStatus("AI 正在识别成绩表列...");
    try {
      const suggestion = await suggestScoreMappingWithAi(scoreRows, {
        accessCode: aiMappingAccessCode,
        remember: aiMappingRemember,
      });
      setAiMappingSuggestion(suggestion);
      setManualMapping(suggestion.mapping);
      setMappingModalOpen(true);
      setAiMappingAccessCode("");
      setHasAiMappingAuth(true);
      setScoreStatus(suggestion.note);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setScoreStatus(getAiMappingErrorMessage(reason));
      setHasAiMappingAuth(hasStoredAiScoreMappingAuth());
    } finally {
      setAiMappingBusy(false);
    }
  }

  function saveDraft() {
    if (!draft || !sourceDraft || !examName.trim()) {
      setScoreStatus("请先上传成绩表并填写考试名称。");
      return;
    }
    if (rankChoice === "pending" && getMissingClassRankSummary(sourceDraft).missingCellCount) {
      setRankDialogOpen(true);
      setScoreStatus("请先确认是否自动补全缺失班排。");
      return;
    }
    const saved = onSaveScoreImport(createSavedGradeExamRecord(sourceDraft, {
      id: remappingExamId || undefined,
      name: examName,
      date: examDate,
      rows: scoreRows,
      mapping: manualMapping || undefined,
      rankConfig: { autoClassRank: rankChoice === "auto", scoreBasis: "effective" },
    }));
    if (!saved) {
      setScoreStatus("保存失败，当前导入内容已保留，请检查存储空间后重试。");
      return;
    }
    setDraft(null);
    setSourceDraft(null);
    setScoreRows([]);
    setScoreFilename("");
    setManualMapping(null);
    setRemappingExamId("");
    setRankChoice("pending");
    setRankDialogOpen(false);
    setMappingModalOpen(false);
    setAiMappingSuggestion(null);
    setScoreStatus(`已保存「${saved.name}」。`);
    actionToast.show({ message: `考试“${saved.name}”已保存`, duration: 4000 });
  }

  function editExam(exam: GradeExam) {
    if (!exam.importSource) {
      setDraft(null);
      setSourceDraft(null);
      setScoreRows([]);
      setScoreFilename("");
      setManualMapping(null);
      setRankChoice("pending");
      setRankDialogOpen(false);
      setExamName(exam.name);
      setExamDate(exam.date || toLocalDateKey());
      setRemappingExamId(exam.id);
      setMappingModalOpen(false);
      setAiMappingSuggestion(null);
      setEditingExamId("");
      setScoreStatus(`「${exam.name}」没有保存原始表格，请重新选择原成绩文件，确认映射后会覆盖原考试。`);
      return;
    }
    const rows = exam.importSource.rows;
    const mapping: ScoreMapping = {
      ...exam.importSource.mapping,
      headers: rows[0] || exam.importSource.mapping.headers,
      subjectMappings: exam.importSource.mapping.subjectMappings.map(item => ({
        ...item,
        rawScoreCol: item.rawScoreCol ?? -1,
        assignedScoreCol: item.assignedScoreCol ?? -1,
      })),
      totalMapping: {
        ...exam.importSource.mapping.totalMapping,
        rawScoreCol: exam.importSource.mapping.totalMapping.rawScoreCol ?? -1,
        assignedScoreCol: exam.importSource.mapping.totalMapping.assignedScoreCol ?? -1,
      },
      warnings: [...exam.importSource.mapping.warnings],
    };
    try {
      const nextSourceDraft = buildScoreImportDraftFromRows(rows, exam.importSource.filename || `${exam.name}.csv`, mapping);
      const nextRankChoice = exam.rankConfig
        ? exam.rankConfig.autoClassRank ? "auto" : "source"
        : getMissingClassRankSummary(nextSourceDraft).missingCellCount ? "pending" : "source";
      setSourceDraft(nextSourceDraft);
      setDraft(nextRankChoice === "auto" ? applyAutomaticClassRanks(nextSourceDraft) : nextSourceDraft);
      setScoreRows(rows);
      setScoreFilename(exam.importSource.filename || nextSourceDraft.filename);
      setManualMapping(mapping);
      setExamName(exam.name);
      setExamDate(exam.date || toLocalDateKey());
      setRemappingExamId(exam.id);
      setRankChoice(nextRankChoice);
      setRankDialogOpen(false);
      setMappingModalOpen(true);
      setAiMappingSuggestion(null);
      setScoreStatus(`正在重新映射「${exam.name}」，应用映射后可覆盖保存。`);
    } catch {
      setScoreStatus("这场考试的原始表格无法重新映射，只能编辑考试名称和日期。");
      setEditingExamId(exam.id);
      setEditExamName(exam.name);
      setEditExamDate(exam.date || toLocalDateKey());
    }
  }

  function deleteExam(exam: GradeExam) {
    const undo = onDeleteGradeExam(exam.id);
    if (undo) {
      setScoreStatus(`已删除「${exam.name}」。`);
      setPendingDeleteExam(null);
      setDeleteExamError("");
      actionToast.show({
        message: `考试“${exam.name}”已删除`,
        actionLabel: "撤销",
        actionIcon: <RotateCcw className="h-3.5 w-3.5" />,
        onAction: undo,
        duration: 6000,
      });
    } else {
      setDeleteExamError("删除失败，本机成绩数据未改变，请检查存储空间后重试。");
    }
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

  const scoreHeaders = scoreRows[0] || [];
  const scorePreviewRows = scoreRows.slice(1, 13);
  const columnRoleOptionsCache = useMemo(() => (manualMapping ? columnRoleOptions(manualMapping) : []), [manualMapping]);
  const missingRankSummary = sourceDraft ? getMissingClassRankSummary(sourceDraft) : null;
  const rankChoiceLabel = rankChoice === "auto" ? "自动补全" : rankChoice === "source" ? "保留原表" : "待确认";

  return (
    <div className="flex h-full flex-col bg-background-primary-default">
      <div className="score-mobile-controls"><Button variant="secondary" onClick={() => setManagementOpen(open => !open)} aria-expanded={managementOpen}>{managementOpen ? "返回成绩分析" : "考试与导入"}</Button></div>
      <div className="score-workspace-grid relative grid min-h-0 flex-1 overflow-hidden p-4" data-management-open={managementOpen}>
        <IconButton
          label={managementOpen ? "收起成绩管理" : "展开成绩管理"}
          size="sm"
          onClick={() => setManagementOpen(open => !open)}
          aria-expanded={managementOpen}
          className="score-management-toggle absolute z-20 shadow-sm"
        >
          {managementOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </IconButton>

        <aside
          aria-hidden={!managementOpen}
          inert={!managementOpen ? true : undefined}
          className="score-management-panel min-h-0 w-[320px] space-y-4 overflow-y-auto"
        >
          <Panel title="成绩导入">
            <div className="space-y-3">
              <FileDropZone accept=".xlsx,.xls,.xlsm,.csv,.tsv" onChange={file => { if (file) void readScoreFile(file); }} className="flex-row justify-center px-4 py-3">
                <FileUp className="h-4 w-4 text-text-tertiary" />
                  <span className="text-body-regular text-text-secondary">{draft ? draft.filename : "拖拽或选择成绩文件"}</span>
              </FileDropZone>
              {draft && (
                <div className="space-y-2">
                  {remappingExamId && (
                    <div className="flex items-start gap-2 rounded-xl border border-accent-100 bg-accent-50 px-3 py-2 text-caption-1-regular text-accent-700">
                      <span className="min-w-0 flex-1">
                        正在重新映射已保存考试，保存后会覆盖原考试。
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(null);
                          setSourceDraft(null);
                          setScoreRows([]);
                          setScoreFilename("");
                          setManualMapping(null);
                          setRemappingExamId("");
                          setRankChoice("pending");
                          setRankDialogOpen(false);
                          setScoreStatus("");
                        }}
                        className="shrink-0 font-semibold text-accent-500 hover:text-accent-700"
                      >
                        取消
                      </button>
                    </div>
                  )}
                  <input value={examName} onChange={event => setExamName(event.target.value)} className="w-full rounded-xl border border-border-button-default bg-background-primary-default px-3 py-2 text-body-regular outline-none focus:border-accent-300" placeholder="考试名称" />
                  <DatePicker required value={examDate} onChange={setExamDate} ariaLabel="考试日期" className="w-full bg-background-primary-default" />
                  <Button onClick={saveDraft} className="w-full">{remappingExamId ? "保存修改" : "保存考试"}</Button>
                </div>
              )}
              {scoreRows.length > 0 && manualMapping && (
                <button
                  type="button"
                  onClick={() => setMappingModalOpen(true)}
                  className="flex w-full items-center justify-between rounded-2xl border border-border-button-default bg-background-primary-default px-4 py-3 text-left text-body-regular text-text-primary hover:bg-background-secondary-default"
                  style={{ fontWeight: 900 }}
                >
                  <span>映射设置</span>
                  <span className="text-caption-1-regular text-text-tertiary">{manualMapping.subjectMappings.length} 个科目</span>
                </button>
              )}
              {missingRankSummary && missingRankSummary.missingCellCount > 0 && (
                <button
                  type="button"
                  onClick={() => setRankDialogOpen(true)}
                  className="flex w-full items-center justify-between rounded-2xl border border-accent-100 bg-accent-50 px-4 py-3 text-left text-body-regular text-accent-800 hover:bg-accent-100"
                  style={{ fontWeight: 900 }}
                >
                  <span className="flex items-center gap-2"><ListOrdered className="h-4 w-4" />排名设置</span>
                  <span className="text-caption-1-regular text-accent-500">{rankChoiceLabel}</span>
                </button>
              )}
              {draft?.warnings.length ? (
                <div className="rounded-xl border border-status-warning-100 bg-status-warning-50 px-3 py-2 text-caption-1-regular leading-5 text-status-warning-700">
                  {draft.warnings.join(" ")}
                </div>
              ) : null}
              {scoreStatus && <InlineStatus message={scoreStatus} className="text-body-regular" />}
            </div>
          </Panel>

          <Panel title="历史考试">
            <div className="divide-y divide-separator-border">
              {exams.map(exam => (
                <MotionSwitch key={exam.id} transitionKey={editingExamId === exam.id ? "edit" : "view"} className="score-exam-edit-morph">
                {editingExamId === exam.id ? (
                  <div key={exam.id} className="rounded-xl border border-separator-border p-3">
                    <div className="space-y-2">
                      <input value={editExamName} onChange={e => setEditExamName(e.target.value)} className="w-full rounded-lg border border-border-button-default bg-background-primary-default px-3 py-1.5 text-body-regular outline-none focus:border-accent-300" placeholder="考试名称" />
                      <DatePicker required value={editExamDate} onChange={setEditExamDate} ariaLabel="修改考试日期" className="w-full" />
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
                  </div>
                ) : (
                  <div key={exam.id} className="flex items-center gap-1 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body-medium text-text-primary">{exam.name}</div>
                      <div className="mt-0.5 text-caption-1-regular text-text-tertiary">{exam.date || "未填写日期"} · {exam.rows.length} 人 · {exam.subjects.length} 科</div>
                    </div>
                    <IconButton size="sm" label="查看成绩表格" onClick={() => setExamTable(exam)}><Table className="h-4 w-4" /></IconButton>
                    <IconButton size="sm" label="编辑考试" onClick={() => editExam(exam)}><Pencil className="h-4 w-4" /></IconButton>
                    <IconButton size="sm" label="删除考试" onClick={() => { setDeleteExamError(""); setPendingDeleteExam(exam); }}><Trash2 className="h-4 w-4" /></IconButton>
                  </div>
                )}
                </MotionSwitch>
              ))}
              {exams.length === 0 && <div className="py-6 text-center text-body-regular text-text-tertiary">暂无考试</div>}
            </div>
          </Panel>

          <Panel title="分析与建议">
            <div className="space-y-2">
              <Button size="sm" variant="secondary" disabled={classAnalysisBusy} onClick={generateClassAnalysis} className="w-full">{classAnalysisBusy ? "生成中" : "生成班级分析"}</Button>
              <Button size="sm" variant="secondary" disabled={studentAdviceProgress.busy} onClick={() => void onGenerateStudentTrendAdvice()} className="w-full">
                <Sparkles className="h-4 w-4" />{studentAdviceProgress.busy ? "生成中" : "生成学生建议"}
              </Button>
              {classAnalysisBusy && <AiGenerationPanel compact title="正在生成班级趋势分析" steps={["汇总考试变化", "识别班级趋势", "形成关注建议"]} />}
              {studentAdviceProgress.busy && <AiGenerationPanel compact title="正在生成学生建议" steps={["筛选变化学生", "整理个人趋势", "写入建议草稿"]} />}
              {classAnalysis && !classAnalysisBusy && (
                <div className="ai-followup-result-enter rounded-xl border border-accent-100 bg-accent-50 px-3 py-2 text-caption-1-regular leading-relaxed text-accent-700">
                  <div>{classAnalysis.overall}</div>
                  {classAnalysis.disclaimer && <div className="mt-1 text-accent-500">{classAnalysis.disclaimer}</div>}
                </div>
              )}
              {classAnalysisStatus && <InlineStatus message={classAnalysisStatus} />}
              {studentAdviceProgress.status && <InlineStatus message={studentAdviceProgress.status} />}
            </div>
          </Panel>
        </aside>

        <main hidden={isMobile && managementOpen} className="min-h-0 min-w-0 overflow-y-auto rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
          <UnderlineTabs value={scoreView} onChange={setScoreView} ariaLabel="成绩分析视图" className={`sticky top-0 z-10 bg-background-primary-default pr-3 transition-[padding] duration-[440ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${managementOpen ? "pl-3" : "pl-12"}`} options={[{ value: "overview", label: "成绩概览" }, { value: "items", label: "题目分析" }]} />
          <MotionSwitch transitionKey={scoreView}>{scoreView === "overview" ? <GradesPage exams={exams} students={students} onSelectStudent={onSelectStudent} onOpenStudentFollowup={onOpenStudentFollowup} thresholds={gradeThresholds} onThresholdsChange={onGradeThresholdsChange} /> : <ScoreItemAnalysisPanel exams={exams} students={students} tasks={tasks} onSave={onSaveItemAnalysis} onCreateFollowup={onCreateScoreFollowup} onCreateQuestionFollowups={onCreateQuestionFollowups} onOpenTask={onOpenTask} initialExamId={analysisTarget?.entityId} initialQuestionId={analysisTarget?.subEntityId}/>}</MotionSwitch>
        </main>
      </div>
      <DialogPresence open={mappingModalOpen && Boolean(manualMapping)}>
      {mappingModalOpen && manualMapping && (
        <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-5">
          <div ref={mappingModalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="成绩列映射" className="score-mapping-panel modal-panel-enter app-modal-panel flex max-h-[88vh] w-full max-w-[88rem] flex-col overflow-hidden outline-none">
            <ModalHeader title="成绩列映射" onClose={() => setMappingModalOpen(false)} actions={<Button variant="ai" size="sm" disabled={aiMappingBusy} onClick={() => void generateAiMapping()}>{aiMappingBusy ? "识别中…" : "AI 识别"}</Button>} />

            <div className="score-mapping-grid grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_17rem] gap-0 overflow-hidden">
              <div className="flex min-h-0 min-w-0 flex-col border-r border-separator-border bg-background-secondary-default p-4">
                <div className="mb-2 flex items-center justify-between gap-3 px-1">
                  <span className="truncate text-caption-1-regular text-text-tertiary">{scoreFilename || "成绩表"} · 前 12 行预览 · 已标记 {mappedColumnCount(manualMapping, scoreHeaders.length)} / {scoreHeaders.length} 列</span>
                </div>
                <div className="min-h-0 flex-1 overflow-auto rounded-[var(--app-radius-md)] border border-border-button-default bg-background-primary-default">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-caption-1-regular">
                    <thead className="sticky top-0 z-10 text-text-secondary">
                      <tr>
                        {scoreHeaders.map((header, index) => {
                          const role = columnRoleOf(manualMapping, index);
                          const mapped = role !== "unused";
                          return (
                            <th key={`${header}-${index}`} data-mapped={mapped} className={`whitespace-nowrap border-b border-border-button-default px-2 py-2 align-top font-normal ${mapped ? "bg-accent-50/80" : "bg-background-tertiary-default"}`}>
                              <div className="min-w-[8.5rem]">
                                <div className={`mb-1 truncate px-0.5 font-semibold ${mapped ? "text-text-primary" : "text-text-secondary"}`}>{index + 1}. {header || "空列"}</div>
                                <SelectMenu
                                  value={role}
                                  onChange={value => updateManualMapping(mapping => assignColumnRole(mapping, index, value))}
                                  ariaLabel={`第 ${index + 1} 列「${header || "空列"}」用途`}
                                  className="h-8 w-full rounded-lg px-2 py-1 text-caption-1-regular shadow-none"
                                  options={columnRoleOptionsCache}
                                />
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {scorePreviewRows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {scoreHeaders.map((_, colIndex) => (
                            <td key={colIndex} className={`whitespace-nowrap border-b border-separator-border px-3 py-2 text-text-secondary ${columnRoleOf(manualMapping, colIndex) !== "unused" ? "bg-accent-50/30" : rowIndex % 2 ? "bg-background-secondary-default/70" : "bg-background-primary-default"}`}>
                              {row[colIndex] || ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto p-4">
                <div className="space-y-4">
                  {!hasAiMappingAuth && (
                    <div className="space-y-2">
                      <Input
                        value={aiMappingAccessCode}
                        onChange={setAiMappingAccessCode}
                        placeholder="输入 AI 授权码"
                      />
                      <Checkbox isSelected={aiMappingRemember} onChange={setAiMappingRemember}>记住授权码</Checkbox>
                    </div>
                  )}
                  {aiMappingSuggestion && (
                    <p className="rounded-[var(--app-radius-sm)] border border-separator-border bg-background-secondary-default px-3 py-2 text-caption-1-regular leading-5 text-text-secondary">
                      {aiMappingSuggestion.note || "AI 已填入映射，可继续手动修改或直接应用。"}
                    </p>
                  )}

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2 px-1">
                      <div className="text-body-semibold text-text-primary">科目</div>
                      <Button variant="quiet" size="sm" onClick={() => updateManualMapping(mapping => ({
                        ...mapping,
                        subjectMappings: [...mapping.subjectMappings, { subject: `科目${mapping.subjectMappings.length + 1}`, scoreCol: -1, rawScoreCol: -1, assignedScoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 }],
                      }))}><Plus className="h-3.5 w-3.5" />添加</Button>
                    </div>
                    <div className="space-y-1.5">
                      {manualMapping.subjectMappings.map((item, index) => (
                        <div key={`${item.subject}-${index}`} className="flex items-center gap-1.5">
                          <SelectMenu
                            value={item.subject}
                            onChange={value => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.map((subjectItem, subjectIndex) => subjectIndex === index ? { ...subjectItem, subject: value } : subjectItem),
                            }))}
                            ariaLabel={`第 ${index + 1} 个科目名称`}
                            className="h-8 min-w-0 flex-1 rounded-lg px-2 py-1 text-caption-1-regular shadow-none"
                            options={[...SUBJECT_ORDER.map(subject => ({ value: subject, label: subject })), ...(!SUBJECT_ORDER.includes(item.subject) ? [{ value: item.subject, label: item.subject }] : [])]}
                          />
                          <IconButton
                            label={`删除科目 ${item.subject}`}
                            size="sm"
                            variant="quiet"
                            className="text-text-tertiary hover:bg-status-danger-50 hover:text-status-danger-600"
                            onClick={() => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.filter((_, subjectIndex) => subjectIndex !== index),
                            }))}
                          ><Trash2 className="h-3.5 w-3.5" /></IconButton>
                        </div>
                      ))}
                      {!manualMapping.subjectMappings.length && <p className="text-caption-1-regular text-text-tertiary">还没有科目</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-separator-border px-5 py-4">
              <Button variant="secondary" onClick={() => setMappingModalOpen(false)}>先不应用</Button>
              <Button onClick={applyManualMapping}>应用映射</Button>
            </div>
          </div>
        </div>
      )}
      </DialogPresence>
      <ModalShell
        open={rankDialogOpen && Boolean(sourceDraft) && Boolean(missingRankSummary?.missingCellCount)}
        title="自动补全班级排名？"
        description={`这份成绩表有 ${missingRankSummary?.missingCellCount || 0} 处班排缺失，涉及 ${missingRankSummary?.missingMetricCount || 0} 个科目或总分。自动计算会优先使用赋分，其次原始分；同分并列采用 1、1、3，已有班排和校排保持原值。`}
        onClose={() => setRankDialogOpen(false)}
        footer={<>
          <Button variant="ghost" onClick={() => setRankDialogOpen(false)}>稍后决定</Button>
          <Button variant="secondary" onClick={() => applyRankChoice("source")}>保留原表</Button>
          <Button onClick={() => applyRankChoice("auto")}>应用自动排名</Button>
        </>}
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-accent-100 bg-accent-50 px-3 py-2.5 text-caption-1-regular leading-5 text-accent-700">
            只补齐可计算的缺失班排，科目成绩不完整时不生成总排名。
          </div>
          <div className="rounded-xl border border-separator-border bg-background-secondary-default px-3 py-2.5 text-caption-1-regular leading-5 text-text-secondary">
            关闭后可随时从导入面板的“排名设置”重新选择。
          </div>
        </div>
      </ModalShell>
      <DialogPresence open={Boolean(examTable)}>{examTable && <ExamTableModal exam={examTable} onClose={() => setExamTable(null)} />}</DialogPresence>
      <ConfirmDialog open={Boolean(pendingDeleteExam)} title="删除这场考试？" description={`将删除“${pendingDeleteExam?.name || "当前考试"}”及其对应的全部学生成绩记录；操作后可在 6 秒内撤销。`} confirmLabel="确认删除考试" error={deleteExamError} onCancel={() => { setPendingDeleteExam(null); setDeleteExamError(""); }} onConfirm={() => pendingDeleteExam && deleteExam(pendingDeleteExam)} />
      {actionToast.toast}
    </div>
  );
}
