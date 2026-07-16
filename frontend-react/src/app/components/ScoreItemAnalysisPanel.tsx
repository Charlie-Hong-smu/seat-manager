import { BarChart3, ChevronDown, ChevronUp, FileSpreadsheet, HelpCircle, ListPlus, Sparkles, Tags } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { generateAiItemAnalysis, type AiItemAnalysisResult } from "../state/teacherAiService";
import { buildItemAnalysisFromWideRows, getQuestionStats } from "../state/teacherWorkbench";
import type { AppStudent, FollowupTask, GradeExam, GradeItemAnalysis, GradeQuestionDefinition, StudentId } from "../state/types";
import { AiGenerationPanel, AnimatedPopover, Button, Card, IconButton, SelectMenu } from "./ui";
import { LinkedTaskBadge } from "./LinkedWorkflow";

export function ScoreItemAnalysisPanel({ exams, students, tasks, onSave, onCreateFollowup, onCreateQuestionFollowups, onOpenTask, initialExamId, initialQuestionId }: { exams: GradeExam[]; students: AppStudent[]; tasks: FollowupTask[]; onSave: (examId: string, itemAnalysis: GradeItemAnalysis) => boolean; onCreateFollowup: (studentId: string, exam: GradeExam, reason: string) => void; onCreateQuestionFollowups: (studentIds: StudentId[], exam: GradeExam, question: GradeQuestionDefinition) => void; onOpenTask?: (taskId: string) => void; initialExamId?: string; initialQuestionId?: string }) {
  const [examId, setExamId] = useState(initialExamId || exams[0]?.id || "");
  const exam = exams.find(item => item.id === examId) || exams[0];
  const [status, setStatus] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<AiItemAnalysisResult | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [expandedQuestionId, setExpandedQuestionId] = useState(initialQuestionId || "");
  const analysis = exam?.itemAnalysis;
  const stats = useMemo(() => analysis ? getQuestionStats(analysis) : [], [analysis]);
  const knowledgeStats = useMemo(() => {
    const groups = new Map<string, number[]>();
    stats.forEach(item => item.question.knowledgePoints.forEach(point => groups.set(point, [...(groups.get(point) || []), item.rate])));
    return [...groups].map(([label, rates]) => ({ label, rate: Math.round(rates.reduce((sum, value) => sum + value, 0) / rates.length * 10) / 10 })).sort((a, b) => a.rate - b.rate);
  }, [stats]);

  useEffect(() => {
    if (initialExamId && exams.some(item => item.id === initialExamId)) setExamId(initialExamId);
    if (initialQuestionId) {
      setExpandedQuestionId(initialQuestionId);
      window.setTimeout(() => document.querySelector(`[data-score-question-id="${CSS.escape(initialQuestionId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [exams, initialExamId, initialQuestionId]);

  function linkedTask(studentId: StudentId, questionId: string) {
    return tasks.find(task => task.studentId === studentId && task.sourceRef?.domain === "score" && task.sourceRef.entityId === exam?.id && task.sourceRef.subEntityId === questionId && task.status === "pending")
      || tasks.find(task => task.studentId === studentId && task.sourceRef?.domain === "score" && task.sourceRef.entityId === exam?.id && task.sourceRef.subEntityId === questionId);
  }

  function importQuestions() {
    if (!exam?.importSource?.rows.length) { setStatus("这场考试没有保存原始表格，请在成绩管理中重新映射原文件。"); return; }
    try { const itemAnalysis = buildItemAnalysisFromWideRows(exam.importSource.rows, exam); setStatus(onSave(exam.id, itemAnalysis) ? `已识别 ${itemAnalysis.questions.length} 道题。` : "题目分析保存失败。"); }
    catch { setStatus("未找到“第1题”或“Q1”形式的题目列。"); }
  }

  function updateQuestion(questionId: string, patch: { maxScore?: number; knowledgePoints?: string[]; description?: string }) {
    if (!exam || !analysis) return;
    onSave(exam.id, { ...analysis, questions: analysis.questions.map(question => question.id === questionId ? { ...question, ...patch } : question), updatedAt: new Date().toISOString() });
  }

  async function analyzeWithAi() {
    if (!exam || !analysis) return;
    setAiBusy(true); setStatus("");
    try { setAiResult(await generateAiItemAnalysis({ exam: { id: exam.id, name: exam.name, date: exam.date }, questions: stats.map(item => ({ id: item.question.id, label: item.question.label, description: item.question.description, knowledgePoints: item.question.knowledgePoints, maxScore: item.question.maxScore, average: item.average, rate: item.rate, weakStudentIds: item.weakStudentIds.slice(0, 12) })) })); }
    catch { setStatus("AI 暂时不可用，本地题目统计仍可使用。"); }
    finally { setAiBusy(false); }
  }

  if (!exam) return <div className="py-20 text-center text-sm text-gray-400">请先导入一场考试</div>;
  return <div className="space-y-4 p-4"><Card overflow="visible" bodyClassName="flex flex-wrap items-center gap-3 p-4"><SelectMenu value={exam.id} onChange={setExamId} ariaLabel="选择题目分析考试" options={exams.map(item => ({ value: item.id, label: item.name }))}/><Button variant="secondary" onClick={importQuestions}><FileSpreadsheet className="h-4 w-4"/>{analysis ? "重新识别题目列" : "从原成绩表识别题目"}</Button>{analysis && <Button onClick={() => void analyzeWithAi()}><Sparkles className="h-4 w-4"/>AI 教学分析</Button>}{status && <span className="min-w-0 flex-1 text-xs text-blue-600">{status}</span>}<div className="relative ml-auto"><IconButton label="题目分析使用说明" size="sm" active={helpOpen} aria-expanded={helpOpen} onClick={() => setHelpOpen(open => !open)}><HelpCircle className="h-4 w-4"/></IconButton><AnimatedPopover open={helpOpen} className="absolute right-0 top-full z-30 mt-2 w-[min(42rem,calc(100vw-3rem))] rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow-float)]"><div><h2 className="text-sm font-bold text-gray-900">题目分析怎么用</h2><div className="mt-3 grid gap-3 lg:grid-cols-3"><div className="flex gap-3 rounded-xl bg-gray-50 p-3"><FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"/><div><strong className="text-sm text-gray-800">1. 识别逐题得分</strong><p className="mt-1 text-xs leading-5 text-gray-500">原成绩表需有“第1题、第2题…”或“Q1、Q2…”列；只有学科总分时无法生成。</p></div></div><div className="flex gap-3 rounded-xl bg-gray-50 p-3"><BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"/><div><strong className="text-sm text-gray-800">2. 先做本地统计</strong><p className="mt-1 text-xs leading-5 text-gray-500">计算每题均分、得分率和低于 60% 的学生人数，不需要调用 AI。</p></div></div><div className="flex gap-3 rounded-xl bg-gray-50 p-3"><Tags className="mt-0.5 h-4 w-4 shrink-0 text-blue-600"/><div><strong className="text-sm text-gray-800">3. 补充教学判断</strong><p className="mt-1 text-xs leading-5 text-gray-500">老师可填写满分与知识点，再按需让 AI 整理薄弱点和教学建议。</p></div></div></div></div></AnimatedPopover></div></Card>
    {aiBusy && <AiGenerationPanel title="正在分析题目与知识点" steps={["整理本地统计", "识别薄弱点", "形成教学建议"]}/>}
    {aiResult && !aiBusy && <Card title="AI 教学建议"><div className="space-y-3"><p className="text-sm leading-6 text-gray-700">{aiResult.overview}</p>{aiResult.weakPoints.length > 0 && <div><div className="text-xs font-bold text-gray-400">主要薄弱点</div><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">{aiResult.weakPoints.map(item => <li key={item}>{item}</li>)}</ul></div>}{aiResult.teachingSuggestions.length > 0 && <div><div className="text-xs font-bold text-gray-400">教学建议</div><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">{aiResult.teachingSuggestions.map(item => <li key={item}>{item}</li>)}</ul></div>}{aiResult.followupCandidates.length > 0 && <div className="flex flex-wrap gap-2">{aiResult.followupCandidates.map(candidate => { const student = students.find(item => item.id === candidate.studentId); return student ? <Button key={candidate.studentId} size="sm" variant="secondary" onClick={() => onCreateFollowup(candidate.studentId, exam, candidate.reason)}>为 {student.name} 创建跟进</Button> : null; })}</div>}<p className="text-xs text-gray-400">{aiResult.disclaimer}</p></div></Card>}
    {knowledgeStats.length > 0 && <Card title="知识点得分率" bodyClassName="flex flex-wrap gap-2 p-4">{knowledgeStats.map(item => <span key={item.label} className={`rounded-full px-3 py-1.5 text-xs font-bold ${item.rate < 60 ? "bg-rose-50 text-rose-600" : "bg-blue-50 text-blue-700"}`}>{item.label} {item.rate}%</span>)}</Card>}
    {analysis ? <Card title="题目得分率"><div className="space-y-2">{stats.map(item => {
      const expanded = expandedQuestionId === item.question.id;
      const weakStudents = item.weakStudentIds.map(id => students.find(student => student.id === id)).filter((student): student is AppStudent => Boolean(student));
      return <div key={item.question.id} data-score-question-id={item.question.id} className={`rounded-xl border p-3 ${initialQuestionId === item.question.id ? "entity-focus-highlight border-blue-200" : "border-gray-100"}`}>
        <div className="grid gap-3 lg:grid-cols-[7rem_7rem_1fr_10rem]">
          <div><strong className="text-sm text-gray-800">{item.question.label}</strong><div className={`mt-1 text-lg font-black ${item.rate < 60 ? "text-rose-600" : "text-blue-600"}`}>{item.rate}%</div></div>
          <label className="text-xs text-gray-400">满分<input type="number" min={0.1} value={item.question.maxScore} onChange={event => updateQuestion(item.question.id, { maxScore: Math.max(0.1, Number(event.target.value) || 1) })} className="mt-1 h-9 w-full rounded-xl border border-gray-200 px-2 text-sm text-gray-700"/></label>
          <label className="text-xs text-gray-400">知识点（顿号分隔）<input value={item.question.knowledgePoints.join("、")} onChange={event => updateQuestion(item.question.id, { knowledgePoints: event.target.value.split(/[、,，]/).map(value => value.trim()).filter(Boolean) })} className="mt-1 h-9 w-full rounded-xl border border-gray-200 px-2 text-sm text-gray-700"/></label>
          <button type="button" onClick={() => setExpandedQuestionId(expanded ? "" : item.question.id)} className="rounded-xl bg-gray-50 px-3 py-2 text-left text-xs text-gray-500 hover:bg-blue-50 hover:text-blue-700"><span className="flex items-center justify-between">均分 <strong>{item.average} / {item.question.maxScore}</strong></span><span className="mt-1 flex items-center justify-between font-bold">薄弱 {item.weakStudentIds.length} 人 {expanded ? <ChevronUp className="h-4 w-4"/> : <ChevronDown className="h-4 w-4"/>}</span></button>
        </div>
        {expanded && <div className="view-switch-enter mt-3 rounded-xl bg-[var(--app-surface-muted)] p-3"><div className="mb-2 flex items-center justify-between gap-2"><strong className="text-xs text-gray-700">低于 60% 的学生</strong>{weakStudents.length > 0 && <Button size="sm" onClick={() => onCreateQuestionFollowups(weakStudents.map(student => student.id), exam, item.question)}><ListPlus className="h-3.5 w-3.5"/>为 {weakStudents.length} 人创建跟进</Button>}</div><div className="flex flex-wrap gap-2">{weakStudents.map(student => { const task = linkedTask(student.id, item.question.id); return <div key={student.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white px-3 py-2"><span className="text-xs font-bold text-gray-700">{student.name}</span>{task ? <LinkedTaskBadge task={task} onOpen={onOpenTask}/> : <Button size="sm" variant="ghost" onClick={() => onCreateQuestionFollowups([student.id], exam, item.question)}>创建跟进</Button>}</div>; })}{!weakStudents.length && <span className="text-xs text-gray-400">暂无匹配到班级名单的薄弱学生</span>}</div></div>}
      </div>;
    })}</div></Card> : <div className="rounded-2xl border border-dashed border-gray-200 px-5 py-14 text-center"><strong className="text-sm text-gray-700">当前还没有逐题数据</strong><p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-gray-500">请确认原成绩表包含“第1题、第2题…”或“Q1、Q2…”列，再点击“从原成绩表识别题目”。仅包含语文、数学等学科总分的表格只能用于成绩概览。</p></div>}
  </div>;
}
