import { useEffect, useState } from "react";
import { FileUp, PanelLeftClose, PanelLeftOpen, Sparkles, Trash2, X } from "lucide-react";

import { hasStoredAiScoreMappingAuth, suggestScoreMappingWithAi, type AiScoreMappingSuggestion } from "../../state/aiScoreMappingService";
import {
  buildScoreImportDraftFromRows,
  createSavedGradeExamRecord,
  detectScoreMapping,
  prepareScoreRows,
  parseRowsWithMapping,
  readRowsFromFile,
  SUBJECT_ORDER,
  type ScoreMapping,
} from "../../state/scoreImport";
import type { AiClassTrendResult } from "../../state/aiTrendService";
import type { AppStudent, FollowupTask, GradeExam, GradeItemAnalysis, GradeQuestionDefinition, SavedGradeExamRecord, ScoreImportDraft, StudentId } from "../../state/types";
import type { TimelineTarget } from "../../state/dataInsights";
import { ExamTableModal } from "../ExamTableModal";
import { GradesPage } from "../GradesPage";
import { AiGenerationPanel, Button, ConfirmDialog, DatePicker, FileDropZone, IconButton, SelectMenu, UnderlineTabs } from "../ui";
import { ScoreItemAnalysisPanel } from "../ScoreItemAnalysisPanel";
import { WorkspacePanel as Panel } from "./WorkspacePanel";

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
  onOpenTask,
}: {
  exams: GradeExam[];
  students: AppStudent[];
  onSelectStudent: (student: AppStudent) => void;
  onOpenStudentFollowup: (student: AppStudent) => void;
  onSaveScoreImport: (record: SavedGradeExamRecord) => GradeExam | null;
  onUpdateGradeExam: (examId: string, name: string, date: string) => boolean;
  onDeleteGradeExam: (examId: string) => boolean;
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
  onOpenTask?: (taskId: string) => void;
}) {
  const [draft, setDraft] = useState<ScoreImportDraft | null>(null);
  const [scoreRows, setScoreRows] = useState<string[][]>([]);
  const [scoreFilename, setScoreFilename] = useState("");
  const [manualMapping, setManualMapping] = useState<ScoreMapping | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [scoreStatus, setScoreStatus] = useState("");
  const [examName, setExamName] = useState("");
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10));
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
  const [managementOpen, setManagementOpen] = useState(true);
  const [pendingDeleteExam, setPendingDeleteExam] = useState<GradeExam | null>(null);
  const [deleteExamError, setDeleteExamError] = useState("");
  const [scoreView, setScoreView] = useState<"overview" | "items">("overview");
  useEffect(() => {
    if (initialTarget?.entityId && initialTarget.subEntityId) setScoreView("items");
  }, [initialTarget]);

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
      if (!remappingExamId) {
        setExamName(file.name.replace(/\.[^.]+$/, "") || "考试");
        setExamDate(new Date().toISOString().slice(0, 10));
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
          setExamDate(new Date().toISOString().slice(0, 10));
        }
      } catch {
        setScoreRows([]);
        setScoreFilename("");
        setManualMapping(null);
      }
      setDraft(null);
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
      setDraft(nextDraft);
      setMappingModalOpen(false);
      setAiMappingSuggestion(null);
      setScoreStatus(`已应用手动映射：${nextDraft.entries.length} 名学生、${nextDraft.subjects.length} 个科目。`);
    } catch {
      setScoreStatus("手动映射无法应用，请至少选择姓名列和一个科目分数列。");
    }
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
    if (!draft || !examName.trim()) {
      setScoreStatus("请先上传成绩表并填写考试名称。");
      return;
    }
    const saved = onSaveScoreImport(createSavedGradeExamRecord(draft, {
      id: remappingExamId || undefined,
      name: examName,
      date: examDate,
      rows: scoreRows,
      mapping: manualMapping || undefined,
    }));
    setDraft(null);
    setScoreRows([]);
    setScoreFilename("");
    setManualMapping(null);
    setRemappingExamId("");
    setMappingModalOpen(false);
    setAiMappingSuggestion(null);
    setScoreStatus(saved ? `已保存「${saved.name}」。` : "保存失败。");
  }

  function editExam(exam: GradeExam) {
    if (!exam.importSource) {
      setDraft(null);
      setScoreRows([]);
      setScoreFilename("");
      setManualMapping(null);
      setExamName(exam.name);
      setExamDate(exam.date || new Date().toISOString().slice(0, 10));
      setRemappingExamId(exam.id);
      setMappingModalOpen(false);
      setAiMappingSuggestion(null);
      setEditingExamId("");
      setScoreStatus(`「${exam.name}」没有保存原始表格，请重新选择原成绩文件，确认映射后会覆盖原考试。`);
      return;
    }
    const rows = exam.importSource.rows;
    const mapping = {
      ...exam.importSource.mapping,
      headers: rows[0] || exam.importSource.mapping.headers,
      subjectMappings: exam.importSource.mapping.subjectMappings.map(item => ({ ...item })),
      totalMapping: { ...exam.importSource.mapping.totalMapping },
      warnings: [...exam.importSource.mapping.warnings],
    };
    try {
      const nextDraft = buildScoreImportDraftFromRows(rows, exam.importSource.filename || `${exam.name}.csv`, mapping);
      setDraft(nextDraft);
      setScoreRows(rows);
      setScoreFilename(exam.importSource.filename || nextDraft.filename);
      setManualMapping(mapping);
      setExamName(exam.name);
      setExamDate(exam.date || new Date().toISOString().slice(0, 10));
      setRemappingExamId(exam.id);
      setMappingModalOpen(true);
      setAiMappingSuggestion(null);
      setScoreStatus(`正在重新映射「${exam.name}」，应用映射后可覆盖保存。`);
    } catch {
      setScoreStatus("这场考试的原始表格无法重新映射，只能编辑考试名称和日期。");
      setEditingExamId(exam.id);
      setEditExamName(exam.name);
      setEditExamDate(exam.date || new Date().toISOString().slice(0, 10));
    }
  }

  function deleteExam(exam: GradeExam) {
    if (onDeleteGradeExam(exam.id)) {
      setScoreStatus(`已删除「${exam.name}」。`);
      setPendingDeleteExam(null);
      setDeleteExamError("");
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
  const columnOptions = scoreHeaders.map((header, index) => ({
    value: index,
    label: `${index + 1}. ${header || "空列"}`,
  }));
  const scorePreviewRows = scoreRows.slice(1, 13);

  return (
    <div className="flex h-full flex-col bg-gray-50">
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
              <FileDropZone accept=".xlsx,.xls,.xlsm,.csv,.tsv" onChange={file => { if (file) void readScoreFile(file); }}>
                <FileUp className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-500">{draft ? draft.filename : "拖拽或选择成绩文件"}</span>
              </FileDropZone>
              {draft && (
                <div className="space-y-2">
                  {remappingExamId && (
                    <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                      <span className="min-w-0 flex-1">
                        正在重新映射已保存考试，保存后会覆盖原考试。
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(null);
                          setScoreRows([]);
                          setScoreFilename("");
                          setManualMapping(null);
                          setRemappingExamId("");
                          setScoreStatus("");
                        }}
                        className="shrink-0 font-semibold text-blue-500 hover:text-blue-700"
                      >
                        取消
                      </button>
                    </div>
                  )}
                  <input value={examName} onChange={event => setExamName(event.target.value)} className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-blue-300" placeholder="考试名称" />
                  <DatePicker value={examDate} onChange={setExamDate} ariaLabel="考试日期" className="w-full bg-gray-50" />
                  <Button onClick={saveDraft} className="w-full">{remappingExamId ? "保存修改" : "保存考试"}</Button>
                </div>
              )}
              {scoreRows.length > 0 && manualMapping && (
                <button
                  type="button"
                  onClick={() => setMappingModalOpen(true)}
                  className="flex w-full items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-100"
                  style={{ fontWeight: 900 }}
                >
                  <span>映射设置</span>
                  <span className="text-xs text-gray-400">{manualMapping.subjectMappings.length} 个科目</span>
                </button>
              )}
              {draft?.warnings.length ? (
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
                  {draft.warnings.join(" ")}
                </div>
              ) : null}
              {scoreStatus && <p className="text-sm text-blue-600">{scoreStatus}</p>}
            </div>
          </Panel>

          <Panel title="历史考试">
            <div className="space-y-2">
              {exams.map(exam => (
                <div key={exam.id} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                  {editingExamId === exam.id ? (
                    <div className="space-y-2">
                      <input value={editExamName} onChange={e => setEditExamName(e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-300" placeholder="考试名称" />
                      <DatePicker value={editExamDate} onChange={setEditExamDate} ariaLabel="修改考试日期" className="w-full" />
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
                  ) : (
                    <>
                      <div className="truncate text-sm font-bold text-gray-800">{exam.name}</div>
                      <div className="mt-1 text-xs text-gray-400">{exam.date || "未填写日期"} · {exam.rows.length} 人 · {exam.subjects.length} 科</div>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setExamTable(exam)}>表格</Button>
                        <Button size="sm" variant="secondary" onClick={() => editExam(exam)}>编辑</Button>
                        <Button size="sm" variant="danger" onClick={() => { setDeleteExamError(""); setPendingDeleteExam(exam); }}>删除</Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {exams.length === 0 && <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-3 py-8 text-center text-sm text-gray-400">暂无考试</div>}
            </div>
          </Panel>

          <Panel title="分析与建议">
            <div className="space-y-2">
              <button disabled={classAnalysisBusy} onClick={generateClassAnalysis} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60" style={{ fontWeight: 800 }}>{classAnalysisBusy ? "生成中" : "生成班级分析"}</button>
              <button disabled={studentAdviceProgress.busy} onClick={() => void onGenerateStudentTrendAdvice()} className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-60" style={{ fontWeight: 800 }}>
                <Sparkles className="mr-1.5 inline h-4 w-4 -mt-0.5" />{studentAdviceProgress.busy ? "生成中" : "生成学生建议"}
              </button>
              {classAnalysisBusy && <AiGenerationPanel compact title="正在生成班级趋势分析" steps={["汇总考试变化", "识别班级趋势", "形成关注建议"]} />}
              {studentAdviceProgress.busy && <AiGenerationPanel compact title="正在生成学生建议" steps={["筛选变化学生", "整理个人趋势", "写入建议草稿"]} />}
              {classAnalysis && !classAnalysisBusy && (
                <div className="ai-followup-result-enter rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-700">
                  <div>{classAnalysis.overall}</div>
                  {classAnalysis.disclaimer && <div className="mt-1 text-blue-500">{classAnalysis.disclaimer}</div>}
                </div>
              )}
              {classAnalysisStatus && <p className="text-xs text-blue-600">{classAnalysisStatus}</p>}
              {studentAdviceProgress.status && <p className="text-xs text-violet-600">{studentAdviceProgress.status}</p>}
            </div>
          </Panel>
        </aside>

        <main className="min-h-0 min-w-0 overflow-y-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
          <UnderlineTabs value={scoreView} onChange={setScoreView} ariaLabel="成绩分析视图" className={`sticky top-0 z-10 bg-white pr-3 transition-[padding] duration-[440ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${managementOpen ? "pl-3" : "pl-12"}`} options={[{ value: "overview", label: "成绩概览" }, { value: "items", label: "题目分析" }]} />
          {scoreView === "overview" ? <GradesPage exams={exams} students={students} onSelectStudent={onSelectStudent} onOpenStudentFollowup={onOpenStudentFollowup} /> : <ScoreItemAnalysisPanel exams={exams} students={students} tasks={tasks} onSave={onSaveItemAnalysis} onCreateFollowup={onCreateScoreFollowup} onCreateQuestionFollowups={onCreateQuestionFollowups} onOpenTask={onOpenTask} initialExamId={initialTarget?.entityId} initialQuestionId={initialTarget?.subEntityId}/>}
        </main>
      </div>
      {mappingModalOpen && manualMapping && (
        <div className="soft-backdrop-enter fixed inset-0 z-[70] flex items-center justify-center bg-gray-950/35 p-5">
          <div className="modal-panel-enter flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
              <div>
                <h3 className="text-lg text-gray-900" style={{ fontWeight: 900 }}>成绩列映射</h3>
                <p className="mt-1 text-sm text-gray-500">AI 会读取表头和最多 80 行样例，生成后仍可手动调整。</p>
              </div>
              <button
                type="button"
                onClick={() => setMappingModalOpen(false)}
                className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="关闭"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_25rem] gap-0 overflow-hidden">
              <div className="min-h-0 border-r border-gray-100 bg-gray-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>表格预览</div>
                    <div className="mt-0.5 text-xs text-gray-400">{scoreFilename || "成绩表"} · 共 {Math.max(scoreRows.length - 1, 0)} 行数据</div>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs text-gray-500 shadow-sm">显示前 12 行</span>
                </div>
                <div className="max-h-[58vh] overflow-auto rounded-2xl border border-gray-200 bg-white">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
                    <thead className="sticky top-0 bg-gray-100 text-gray-500">
                      <tr>
                        {scoreHeaders.map((header, index) => (
                          <th key={`${header}-${index}`} className="whitespace-nowrap border-b border-gray-200 px-3 py-2 font-semibold">
                            {index + 1}. {header || "空列"}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {scorePreviewRows.map((row, rowIndex) => (
                        <tr key={rowIndex} className="odd:bg-white even:bg-gray-50/70">
                          {scoreHeaders.map((_, colIndex) => (
                            <td key={colIndex} className="whitespace-nowrap border-b border-gray-100 px-3 py-2 text-gray-600">
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
                  <div className="rounded-2xl border border-violet-100 bg-violet-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm text-violet-900" style={{ fontWeight: 900 }}>AI 映射</div>
                        <div className="mt-0.5 text-xs leading-5 text-violet-600">先让 AI 填好右侧映射，再由你确认或继续改。</div>
                      </div>
                      <button
                        type="button"
                        disabled={aiMappingBusy}
                        onClick={() => void generateAiMapping()}
                        className="rounded-xl bg-violet-600 px-3 py-2 text-xs text-white hover:bg-violet-700 disabled:opacity-60"
                        style={{ fontWeight: 900 }}
                      >
                        {aiMappingBusy ? "识别中" : "AI 识别"}
                      </button>
                    </div>
                    {!hasAiMappingAuth && (
                      <div className="mt-3 space-y-2">
                        <input
                          value={aiMappingAccessCode}
                          onChange={event => setAiMappingAccessCode(event.target.value)}
                          className="w-full rounded-xl border border-violet-100 bg-white px-3 py-2 text-sm outline-none focus:border-violet-300"
                          placeholder="输入 AI 授权码"
                        />
                        <label className="flex items-center gap-2 text-xs text-violet-700">
                          <input type="checkbox" checked={aiMappingRemember} onChange={event => setAiMappingRemember(event.target.checked)} />
                          记住授权码
                        </label>
                      </div>
                    )}
                    {aiMappingSuggestion && (
                      <div className="mt-3 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-violet-700">
                        {aiMappingSuggestion.note || "AI 已填入映射，可继续手动修改或直接应用。"}
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs text-gray-500">姓名列</label>
                    <SelectMenu value={manualMapping.nameCol} onChange={value => updateManualMapping(mapping => ({ ...mapping, nameCol: Number(value) }))} ariaLabel="姓名列" className="w-full" options={columnOptions} />
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs text-gray-500">学号列（可选）</label>
                    <SelectMenu value={manualMapping.studentNoCol} onChange={value => updateManualMapping(mapping => ({ ...mapping, studentNoCol: Number(value) }))} ariaLabel="学号列" className="w-full" options={[{ value: -1, label: "未识别学号" }, ...columnOptions]} />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-gray-900" style={{ fontWeight: 900 }}>科目分数列</div>
                      <button
                        type="button"
                        onClick={() => updateManualMapping(mapping => ({
                          ...mapping,
                          subjectMappings: [...mapping.subjectMappings, { subject: "科目", scoreCol: 0, rankClassCol: -1, rankSchoolCol: -1 }],
                        }))}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                        style={{ fontWeight: 800 }}
                      >
                        添加科目
                      </button>
                    </div>
                    {manualMapping.subjectMappings.map((item, index) => (
                      <div key={`${item.subject}-${index}`} className="space-y-2 rounded-2xl border border-gray-100 bg-gray-50 p-3">
                        <div className="grid grid-cols-[1fr_1.35fr_auto] gap-2">
                          <SelectMenu
                            value={item.subject}
                            onChange={value => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.map((subjectItem, subjectIndex) => subjectIndex === index ? { ...subjectItem, subject: value } : subjectItem),
                            }))}
                            ariaLabel="科目"
                            className="w-full"
                            options={[...SUBJECT_ORDER.map(subject => ({ value: subject, label: subject })), ...(!SUBJECT_ORDER.includes(item.subject) ? [{ value: item.subject, label: item.subject }] : [])]}
                          />
                          <SelectMenu
                            value={item.scoreCol}
                            onChange={value => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.map((subjectItem, subjectIndex) => subjectIndex === index ? { ...subjectItem, scoreCol: Number(value) } : subjectItem),
                            }))}
                            ariaLabel="分数列"
                            className="w-full"
                            options={columnOptions}
                          />
                          <button
                            type="button"
                            onClick={() => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.filter((_, subjectIndex) => subjectIndex !== index),
                            }))}
                            className="rounded-xl px-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="删除科目"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <SelectMenu
                            value={item.rankClassCol}
                            onChange={value => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.map((subjectItem, subjectIndex) => subjectIndex === index ? { ...subjectItem, rankClassCol: Number(value) } : subjectItem),
                            }))}
                            ariaLabel="班级排名列"
                            className="w-full"
                            options={[{ value: -1, label: "班排列（可选）" }, ...columnOptions]}
                          />
                          <SelectMenu
                            value={item.rankSchoolCol}
                            onChange={value => updateManualMapping(mapping => ({
                              ...mapping,
                              subjectMappings: mapping.subjectMappings.map((subjectItem, subjectIndex) => subjectIndex === index ? { ...subjectItem, rankSchoolCol: Number(value) } : subjectItem),
                            }))}
                            ariaLabel="学校排名列"
                            className="w-full"
                            options={[{ value: -1, label: "校排列（可选）" }, ...columnOptions]}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <label className="block text-xs text-gray-500">总分与总排名</label>
                    <SelectMenu
                      value={manualMapping.totalMapping.scoreCol}
                      onChange={value => updateManualMapping(mapping => ({
                        ...mapping,
                        totalMapping: { ...mapping.totalMapping, scoreCol: Number(value) },
                      }))}
                      ariaLabel="总分列"
                      className="w-full"
                      options={[{ value: -1, label: "总分列（可选）" }, ...columnOptions]}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <SelectMenu
                        value={manualMapping.totalMapping.rankClassCol}
                        onChange={value => updateManualMapping(mapping => ({
                          ...mapping,
                          totalMapping: { ...mapping.totalMapping, rankClassCol: Number(value) },
                        }))}
                        ariaLabel="总班级排名列"
                        className="w-full"
                        options={[{ value: -1, label: "总班排（可选）" }, ...columnOptions]}
                      />
                      <SelectMenu
                        value={manualMapping.totalMapping.rankSchoolCol}
                        onChange={value => updateManualMapping(mapping => ({
                          ...mapping,
                          totalMapping: { ...mapping.totalMapping, rankSchoolCol: Number(value) },
                        }))}
                        ariaLabel="总学校排名列"
                        className="w-full"
                        options={[{ value: -1, label: "总校排（可选）" }, ...columnOptions]}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4">
              <button
                type="button"
                onClick={() => setMappingModalOpen(false)}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
                style={{ fontWeight: 800 }}
              >
                先不应用
              </button>
              <button
                type="button"
                onClick={applyManualMapping}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                style={{ fontWeight: 900 }}
              >
                应用映射
              </button>
            </div>
          </div>
        </div>
      )}
      {examTable && <ExamTableModal exam={examTable} onClose={() => setExamTable(null)} />}
      <ConfirmDialog open={Boolean(pendingDeleteExam)} title="删除这场考试？" description={`将删除“${pendingDeleteExam?.name || "当前考试"}”及其对应的全部学生成绩记录。删除后无法恢复。`} confirmLabel="确认删除考试" error={deleteExamError} onCancel={() => { setPendingDeleteExam(null); setDeleteExamError(""); }} onConfirm={() => pendingDeleteExam && deleteExam(pendingDeleteExam)} />
    </div>
  );
}
