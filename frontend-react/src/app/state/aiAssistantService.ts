import { clearAiApiAuth, getAiAuth, hasStoredAiApiAuth } from "./aiApiClient";
import { getProductAuthToken } from "./authStorage";
import { buildStudentAiContext, compactStudentContextForToken } from "./aiStudentContext";
import { createSeatManagerState } from "./legacyStateAdapter";
import { getDirectWorkerUrl, getWorkerBaseUrl } from "./workerEndpoint";
import { exportWholeBook, getCurrentSlice, sliceDisplayName } from "./workspaces";
import type { AppStudent, Dormitory, FundTransaction, GradeExam, GradeRow, SeatManagerState, WorkspaceSlice } from "./types";
import { buildAiAssistantRequestBody } from "./aiAssistantPayload";
import { parseAiAssistantResponse } from "./aiAssistantResult";
import { listDormitoryEvents } from "./dormitoryPeriods";

interface MentionedStudentMatch {
  student: AppStudent;
  matchNote?: string;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  contextLabels?: string[];
  contextEvidence?: Array<{ title: string; detail: string }>;
  suggestedPrompts?: string[];
}

export interface AiAssistantBaseContext {
  className: string;
  termLabel: string;
  studentCount: number;
  seatCount: number;
  latestExam?: {
    name: string;
    date: string;
    studentCount: number;
    subjectCount: number;
    averageTotal: number | null;
  };
  examInsights: string[];
  gradeTrend: string[];
  focusStudents: Array<{
    name: string;
    category: string;
    latestTotal: number | null;
    reasons: string[];
    tags: string[];
  }>;
  tagSummary: string[];
  recordSummary: string[];
  seatSummary: string;
  dormitorySummary: string[];
  fundSummary: string;
}

export interface AiContextPackItem {
  name?: string;
  category?: string;
  summary?: string;
  latestExam?: string;
  latestTotal?: number | null;
  previousTotal?: number | null;
  trend?: number | null;
  latestScores?: string[];
  weakSubjects?: string[];
  exams?: string[];
  records?: string[];
  tags?: string[];
  dormitory?: string;
  members?: string[];
  events?: string[];
}

export interface AiContextPack {
  kind: "student" | "candidate_students" | "exam" | "dormitory" | "tag" | "records" | "fund";
  title: string;
  reason: string;
  items: AiContextPackItem[];
}

export interface AiComparisonPackItem {
  name?: string;
  summary: string;
  current?: string;
  compare?: string;
  trend?: number | null;
  subjects?: string[];
  exams?: string[];
}

export interface AiComparisonPack {
  kind: "class_term" | "subject_term" | "student_term" | "candidate_students" | "notice";
  title: string;
  reason: string;
  items: AiComparisonPackItem[];
}

export interface AiComparisonContext {
  currentScope: {
    className: string;
    termLabel: string;
  };
  compareScope?: {
    className: string;
    termLabel: string;
  };
  notice?: string;
  comparisonPacks: AiComparisonPack[];
}

export interface AiAssistantContext {
  baseContext: AiAssistantBaseContext;
  contextPacks: AiContextPack[];
  comparisonContext?: AiComparisonContext;
}

export interface AiAssistantResponse {
  message: string;
  disclaimer: string;
  suggestedPrompts: string[];
}

export function hasStoredAiAssistantAuth(): boolean {
  return hasStoredAiApiAuth();
}

function getExamTotalAverage(exam: GradeExam | undefined): number | null {
  if (!exam) {
    return null;
  }
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

function getStudentLatestTotal(student: AppStudent): number | null {
  const exam = [...student.exams].sort((a, b) => `${b.date || ""}-${b.name}`.localeCompare(`${a.date || ""}-${a.name}`))[0];
  if (!exam) {
    return null;
  }
  if (typeof exam.total === "number" && Number.isFinite(exam.total)) {
    return Math.round(exam.total * 10) / 10;
  }
  const scores = Object.values(exam.scores).filter((score): score is number => Number.isFinite(score));
  return scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) * 10) / 10 : null;
}

function getStudentTrend(student: AppStudent): number | null {
  const chronological = [...student.exams].sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`));
  if (chronological.length < 2) {
    return null;
  }
  const first = chronological[0];
  const latest = chronological[chronological.length - 1];
  const firstTotal = typeof first.total === "number" ? first.total : null;
  const latestTotal = typeof latest.total === "number" ? latest.total : null;
  if (firstTotal === null || latestTotal === null) {
    return null;
  }
  return Math.round((latestTotal - firstTotal) * 10) / 10;
}

function buildStudentReasons(student: AppStudent, latestTotal: number | null, averageTotal: number | null): string[] {
  const reasons: string[] = [];
  if (latestTotal !== null) {
    reasons.push(`最新总分 ${latestTotal}`);
    if (averageTotal !== null) {
      const gap = Math.round((latestTotal - averageTotal) * 10) / 10;
      if (gap < 0) reasons.push(`低于班均 ${Math.abs(gap)}`);
      if (gap > 0) reasons.push(`高于班均 ${gap}`);
    }
  }
  const diff = getStudentTrend(student);
  if (diff !== null && diff < 0) reasons.push(`总分下降 ${Math.abs(diff)}`);
  if (diff !== null && diff > 0) reasons.push(`总分提升 ${diff}`);
  if (student.records.length) {
    reasons.push(`近期记录 ${student.records.slice(0, 3).map(record => record.note).filter(Boolean).join("；")}`);
  }
  if (!reasons.length && (student.academicTags.length || student.tags.length)) {
    reasons.push("有标签可参考");
  }
  return reasons.slice(0, 3);
}

function average(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}

function getSubjectAverages(exam: GradeExam | undefined): Record<string, number> {
  if (!exam) {
    return {};
  }
  return Object.fromEntries(exam.subjects.map(subject => {
    const values = exam.rows
      .map(row => row.scores[subject]?.score)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return [subject, average(values) ?? 0];
  }).filter((entry) => Number(entry[1]) > 0));
}

function getExamTotals(exam: GradeExam | undefined): number[] {
  if (!exam) {
    return [];
  }
  return exam.rows
    .map(row => {
      if (typeof row.total === "number" && Number.isFinite(row.total)) {
        return row.total;
      }
      const values = Object.values(row.scores).map(cell => cell.score).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    })
    .filter((value): value is number => value !== null);
}

function findStudentExamRow(exam: GradeExam | undefined, student: AppStudent): GradeRow | null {
  if (!exam) {
    return null;
  }
  return exam.rows.find(row => row.studentId === student.id || row.name === student.name) || null;
}

function getRowTotal(row: GradeRow | null): number | null {
  if (!row) {
    return null;
  }
  if (typeof row.total === "number" && Number.isFinite(row.total)) {
    return Math.round(row.total * 10) / 10;
  }
  const values = Object.values(row.scores)
    .map(cell => cell.score)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10 : null;
}

function formatRowScores(row: GradeRow | null, subjects: string[]): string[] {
  if (!row) {
    return [];
  }
  return subjects
    .map(subject => {
      const score = row.scores[subject]?.score;
      return typeof score === "number" && Number.isFinite(score) ? `${subject}${Math.round(score * 10) / 10}` : "";
    })
    .filter(Boolean)
    .slice(0, 10);
}

function getWeakSubjects(row: GradeRow | null, subjectAverages: Record<string, number>): string[] {
  if (!row) {
    return [];
  }
  return Object.entries(row.scores)
    .map(([subject, cell]) => {
      const score = cell.score;
      const avg = subjectAverages[subject];
      if (typeof score !== "number" || !Number.isFinite(score) || !avg) {
        return null;
      }
      return { subject, score, gap: Math.round((score - avg) * 10) / 10 };
    })
    .filter((item): item is { subject: string; score: number; gap: number } => Boolean(item))
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 3)
    .map(item => `${item.subject}${item.score}（较均${item.gap >= 0 ? "+" : ""}${item.gap}）`);
}

function normalizeQuery(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "").replace(/[，。！？、,.!?;；:：()（）【】\[\]]/g, "");
}

function includesAny(text: string, words: string[]): boolean {
  return words.some(word => text.includes(word));
}

function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function getQueryWindows(text: string, length: number): string[] {
  if (!text || length <= 0 || text.length < Math.max(2, length - 1)) {
    return [];
  }
  const sizes = Array.from(new Set([length - 1, length, length + 1].filter(size => size >= 2 && size <= text.length)));
  return sizes.flatMap(size => Array.from({ length: text.length - size + 1 }, (_, index) => text.slice(index, index + size)));
}

function findMentionedStudents(prompt: string, students: AppStudent[]): MentionedStudentMatch[] {
  const normalized = normalizeQuery(prompt);
  const direct = students
    .filter(student => {
      const names = [student.name, ...student.aliases].map(normalizeQuery).filter(Boolean);
      return names.some(name => normalized.includes(name));
    })
    .slice(0, 6)
    .map(student => ({ student }));
  if (direct.length) {
    return direct;
  }
  return students
    .map(student => {
      const names = [student.name, ...student.aliases].map(normalizeQuery).filter(Boolean);
      const best = names
        .flatMap(name => getQueryWindows(normalized, name.length).map(window => ({
          name,
          window,
          distance: editDistance(name, window),
        })))
        .sort((a, b) => a.distance - b.distance)[0];
      return { student, best };
    })
    .filter(item => item.best && Number.isFinite(item.best.distance) && item.best.distance <= (item.best.name.length >= 4 ? 2 : 1))
    .sort((a, b) => (a.best?.distance ?? 99) - (b.best?.distance ?? 99))
    .slice(0, 3)
    .map(item => ({
      student: item.student,
      matchNote: item.best ? `问题中疑似写作“${item.best.window}”，系统按“${item.student.name}”附带资料，请老师确认姓名。` : undefined,
    }));
}

function findMentionedTags(prompt: string, students: AppStudent[]): string[] {
  const normalized = normalizeQuery(prompt);
  const tags = new Set(students.flatMap(student => [...student.academicTags, ...student.tags]).filter(Boolean));
  return Array.from(tags).filter(tag => normalized.includes(normalizeQuery(tag))).slice(0, 5);
}

function findMentionedExams(prompt: string, exams: GradeExam[]): GradeExam[] {
  const normalized = normalizeQuery(prompt);
  return exams.filter(exam => normalized.includes(normalizeQuery(exam.name))).slice(0, 3);
}

function findMentionedDormitories(prompt: string, dormitories: Dormitory[]): Dormitory[] {
  const normalized = normalizeQuery(prompt);
  return dormitories.filter(dorm => normalized.includes(normalizeQuery(dorm.name))).slice(0, 4);
}

function formatStudentExamSummary(student: AppStudent, exam: GradeExam | undefined, subjectAverages: Record<string, number>): AiContextPackItem {
  const row = findStudentExamRow(exam, student);
  return {
    name: student.name,
    latestExam: exam?.name || "",
    latestTotal: getRowTotal(row),
    latestScores: formatRowScores(row, exam?.subjects || []),
    weakSubjects: getWeakSubjects(row, subjectAverages),
    records: [...student.records]
      .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`))
      .slice(0, 8)
      .map(record => `${record.date} ${record.type}：${record.note}`),
    tags: [...student.academicTags, ...student.tags].slice(0, 8),
  };
}

function buildStudentPack(student: AppStudent, exams: GradeExam[], latestExam: GradeExam | undefined, latestSubjectAverages: Record<string, number>, dormitories: Dormitory[], matchNote?: string): AiContextPack {
  const studentContext = compactStudentContextForToken(buildStudentAiContext({ student, dormitories, maxRecords: 8, maxTags: 12 }), 12);
  const previousTotal = studentContext.exams.length >= 2 ? studentContext.exams[studentContext.exams.length - 2].totalScore : null;
  return {
    kind: "student",
    title: matchNote ? `疑似${student.name}明细` : `${student.name}明细`,
    reason: matchNote || "问题中提到具体学生，附带该生近期成绩、标签、记录和宿舍信息。",
    items: [{
      ...formatStudentExamSummary(student, latestExam, latestSubjectAverages),
      summary: matchNote || "",
      previousTotal,
      trend: studentContext.trend.totalScoreChange,
      exams: studentContext.exams.map(exam => {
        const scores = exam.subjects.map(item => `${item.subject}${item.score}`).join("、");
        const rank = exam.classRank !== null ? `；班排${exam.classRank}` : "";
        return `${exam.name}${exam.date ? `(${exam.date})` : ""}：总分${exam.totalScore ?? "无"}${rank}；${scores || "无各科"}`;
      }),
      records: studentContext.records,
      tags: studentContext.tags,
      weakSubjects: studentContext.weaknesses,
      dormitory: studentContext.dormitory,
    }],
  };
}

function buildCandidatePack(title: string, reason: string, students: AppStudent[], latestExam: GradeExam | undefined, latestSubjectAverages: Record<string, number>, category: string): AiContextPack | null {
  const items = students.slice(0, 20).map(student => {
    const context = compactStudentContextForToken(buildStudentAiContext({ student, maxRecords: 3, maxTags: 8 }), 8);
    return {
      ...formatStudentExamSummary(student, latestExam, latestSubjectAverages),
      category,
      trend: context.trend.totalScoreChange,
      exams: context.exams.map(exam => `${exam.name}${exam.date ? `(${exam.date})` : ""}：总分${exam.totalScore ?? "无"}${exam.classRank !== null ? `，班排${exam.classRank}` : ""}`),
      records: context.records,
      tags: context.tags,
    };
  });
  return items.length ? { kind: "candidate_students", title, reason, items } : null;
}

function buildDormitoryPack(dormitories: Dormitory[], students: AppStudent[]): AiContextPack | null {
  const items = dormitories.slice(0, 8).map(dorm => {
    const events = listDormitoryEvents(dorm).map(entry => entry.event);
    return {
    name: dorm.name,
    summary: `共 ${events.length} 条加减分记录，成员 ${dorm.memberIds.length} 人`,
    members: dorm.memberIds.map(id => students.find(student => student.id === id)?.name || "").filter(Boolean).slice(0, 12),
    events: events
      .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`))
      .slice(0, 8)
      .map(event => `${event.date} ${event.type} ${event.score >= 0 ? "+" : ""}${event.score}：${event.reason || event.note}`),
  }; });
  return items.length ? { kind: "dormitory", title: "宿舍明细", reason: "问题涉及宿舍，附带宿舍成员、分数和近期事件。", items } : null;
}

function buildExamPack(exams: GradeExam[], students: AppStudent[]): AiContextPack | null {
  const items = exams.slice(0, 5).map(exam => {
    const totals = getExamTotals(exam).sort((a, b) => a - b);
    const subjectAverages = getSubjectAverages(exam);
    return {
      name: exam.name,
      summary: `${exam.date || "未填日期"}，${exam.rows.length} 人，${exam.subjects.length} 科，总分均分 ${getExamTotalAverage(exam) ?? "无"}，最低 ${totals[0] ?? "无"}，最高 ${totals[totals.length - 1] ?? "无"}`,
      latestScores: Object.entries(subjectAverages).map(([subject, value]) => `${subject}${value}`),
      records: exam.rows
        .filter(row => row.total === 0 || Object.values(row.scores).some(cell => cell.score === 0))
        .slice(0, 10)
        .map(row => `${row.name} 有 0 分/缺考风险`),
      tags: students.length ? [`匹配学生库 ${students.length} 人`] : [],
    };
  });
  return items.length ? { kind: "exam", title: "考试明细", reason: "问题涉及考试或成绩，附带考试统计和异常分数提示。", items } : null;
}

function buildRecordsPack(students: AppStudent[], latestExam: GradeExam | undefined, latestSubjectAverages: Record<string, number>): AiContextPack | null {
  const ranked = students
    .filter(student => student.records.length)
    .sort((a, b) => b.records.length - a.records.length)
    .slice(0, 20);
  return buildCandidatePack("近期记录较多学生", "问题涉及日常记录/表现，附带记录较多学生。", ranked, latestExam, latestSubjectAverages, "近期记录");
}

function buildTagPack(tags: string[], students: AppStudent[], latestExam: GradeExam | undefined, latestSubjectAverages: Record<string, number>): AiContextPack | null {
  const matched = students.filter(student => [...student.academicTags, ...student.tags].some(tag => tags.includes(tag))).slice(0, 20);
  return buildCandidatePack(`标签匹配：${tags.join("、")}`, "问题命中学生标签，附带相关学生。", matched, latestExam, latestSubjectAverages, "标签匹配");
}

function summarizeFundCategories(transactions: FundTransaction[], type: FundTransaction["type"], limit: number): string[] {
  const sums = new Map<string, number>();
  transactions
    .filter(tx => tx.type === type)
    .forEach(tx => {
      const label = tx.category || (type === "income" ? "未分类收入" : "未分类支出");
      sums.set(label, (sums.get(label) || 0) + Math.abs(tx.amount || 0));
    });
  return Array.from(sums.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, amount]) => `${label} ${Math.round(amount * 100) / 100}`);
}

function buildFundPack(transactions: FundTransaction[]): AiContextPack {
  const income = transactions.filter(tx => tx.type === "income").reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
  const expense = transactions.filter(tx => tx.type === "expense").reduce((sum, tx) => sum + Math.abs(tx.amount || 0), 0);
  const latest = [...transactions]
    .sort((a, b) => `${b.date || ""}-${b.createdAt || ""}`.localeCompare(`${a.date || ""}-${a.createdAt || ""}`))
    .slice(0, 12)
    .map(tx => {
      const sign = tx.type === "income" ? "+" : "-";
      const names = tx.relatedStudentNames?.length ? `（关联：${tx.relatedStudentNames.slice(0, 4).join("、")}）` : "";
      return `${tx.date || "未填日期"} ${sign}${Math.round(Math.abs(tx.amount || 0) * 100) / 100} ${tx.category || "未分类"}：${tx.note || "无备注"}${names}`;
    });
  return {
    kind: "fund",
    title: "班费流水",
    reason: "问题涉及班费、花销、收支或余额，附带班费概览、分类汇总和最近流水。",
    items: [{
      name: "班费概览",
      summary: `收入 ${Math.round(income * 100) / 100}，支出 ${Math.round(expense * 100) / 100}，余额 ${Math.round((income - expense) * 100) / 100}，流水 ${transactions.length} 笔`,
      records: latest.length ? latest : ["暂无班费流水"],
      tags: [
        ...summarizeFundCategories(transactions, "income", 5).map(item => `收入：${item}`),
        ...summarizeFundCategories(transactions, "expense", 5).map(item => `支出：${item}`),
      ].slice(0, 10),
    }],
  };
}

function summarizeCounts(values: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  values.filter(Boolean).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label} ${count} 人`);
}

function dedupeFocusStudents(items: Array<{ student: AppStudent; category: string; latestTotal: number | null; reasons: string[] }>) {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.student.id) || !item.reasons.length) {
      return false;
    }
    seen.add(item.student.id);
    return true;
  });
}

function normalizeTermText(text: string): string {
  return normalizeQuery(text).replace(/季/g, "");
}

function getTermOrder(slice: Pick<WorkspaceSlice, "term" | "createdAt">): number {
  const seasonWeight = slice.term.season === "autumn" ? 2 : slice.term.season === "spring" ? 1 : 0;
  if (slice.term.year > 0 && seasonWeight > 0) {
    return slice.term.year * 10 + seasonWeight;
  }
  return Date.parse(slice.createdAt || "") || 0;
}

function getLatestExam(exams: GradeExam[]): GradeExam | undefined {
  const sorted = [...exams].sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`));
  return sorted[sorted.length - 1];
}

function formatMaybeNumber(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "无";
}

function findStudentByName(student: AppStudent, candidates: AppStudent[]): AppStudent | null {
  const names = new Set([student.name, ...student.aliases].map(normalizeQuery).filter(Boolean));
  return candidates.find(candidate => [candidate.name, ...candidate.aliases].some(name => names.has(normalizeQuery(name)))) || null;
}

function getStudentExamSeries(student: AppStudent): string[] {
  return [...student.exams]
    .sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`))
    .map(exam => {
      const parsedRank = Number.parseInt(String(exam.rank || ""), 10);
      const rank = Number.isFinite(parsedRank) ? `，班排${parsedRank}` : "";
      return `${exam.name}${exam.date ? `(${exam.date})` : ""}：总分${formatMaybeNumber(exam.total)}${rank}`;
    })
    .slice(-8);
}

function getLatestStudentTotal(student: AppStudent | null): number | null {
  return student ? getStudentLatestTotal(student) : null;
}

function hasTermComparisonIntent(normalizedPrompt: string): boolean {
  return includesAny(normalizedPrompt, ["上学期", "上一学期", "上个学期", "跨学期", "学期对比", "比上学期", "和上学期", "这学期比"])
    || /20\d{2}(春|秋)/.test(normalizedPrompt)
    || (normalizedPrompt.includes("学期") && includesAny(normalizedPrompt, ["对比", "比较", "相比", "变化"]));
}

function mentionsOtherClass(normalizedPrompt: string, currentClassName: string): boolean {
  const current = normalizeQuery(currentClassName);
  const withoutCurrent = current ? normalizedPrompt.replace(current, "") : normalizedPrompt;
  return /(?:高|初)?[一二三四五六七八九十0-9]{1,3}班/.test(withoutCurrent);
}

function findExplicitCompareSlice(prompt: string, slices: WorkspaceSlice[], currentSlice: WorkspaceSlice): WorkspaceSlice | null {
  const normalized = normalizeTermText(prompt);
  const currentTerm = normalizeTermText(currentSlice.term.label);
  return slices.find(slice => slice.id !== currentSlice.id && normalizeTermText(slice.term.label) !== currentTerm && normalized.includes(normalizeTermText(slice.term.label))) || null;
}

function findDefaultCompareSlice(slices: WorkspaceSlice[], currentSlice: WorkspaceSlice): WorkspaceSlice | null {
  const currentOrder = getTermOrder(currentSlice);
  const sorted = slices
    .filter(slice => slice.id !== currentSlice.id)
    .sort((a, b) => getTermOrder(b) - getTermOrder(a));
  return sorted.find(slice => getTermOrder(slice) < currentOrder) || sorted[0] || null;
}

function buildClassComparisonPack(currentState: Pick<SeatManagerState, "gradeExams">, compareState: Pick<SeatManagerState, "gradeExams">, currentTerm: string, compareTerm: string): AiComparisonPack {
  const currentExam = getLatestExam(currentState.gradeExams);
  const compareExam = getLatestExam(compareState.gradeExams);
  const currentAvg = currentExam ? getExamTotalAverage(currentExam) : null;
  const compareAvg = compareExam ? getExamTotalAverage(compareExam) : null;
  const avgDiff = currentAvg !== null && compareAvg !== null ? Math.round((currentAvg - compareAvg) * 10) / 10 : null;
  const currentSubjects = getSubjectAverages(currentExam);
  const compareSubjects = getSubjectAverages(compareExam);
  const subjectDiffs = Object.keys(currentSubjects)
    .map(subject => {
      const previous = compareSubjects[subject];
      if (!previous) return "";
      const diff = Math.round((currentSubjects[subject] - previous) * 10) / 10;
      return `${subject}${diff >= 0 ? "+" : ""}${diff}`;
    })
    .filter(Boolean)
    .slice(0, 10);
  return {
    kind: "class_term",
    title: "班级跨学期变化",
    reason: "问题涉及同班级跨学期整体对比。",
    items: [{
      summary: `${currentTerm} 最近考试均分 ${formatMaybeNumber(currentAvg)}，${compareTerm} 最近考试均分 ${formatMaybeNumber(compareAvg)}${avgDiff !== null ? `，变化 ${avgDiff >= 0 ? "+" : ""}${avgDiff}` : ""}`,
      current: currentExam ? `${currentExam.name}，${currentExam.rows.length} 人，${currentExam.subjects.length} 科` : "当前学期暂无考试",
      compare: compareExam ? `${compareExam.name}，${compareExam.rows.length} 人，${compareExam.subjects.length} 科` : "对比学期暂无考试",
      trend: avgDiff,
      subjects: subjectDiffs,
    }],
  };
}

function buildStudentTermPack(students: AppStudent[], compareStudents: AppStudent[], mentioned: MentionedStudentMatch[], currentTerm: string, compareTerm: string): AiComparisonPack | null {
  const items = mentioned
    .map(match => {
      const compareStudent = findStudentByName(match.student, compareStudents);
      const currentTotal = getLatestStudentTotal(match.student);
      const compareTotal = getLatestStudentTotal(compareStudent);
      const diff = currentTotal !== null && compareTotal !== null ? Math.round((currentTotal - compareTotal) * 10) / 10 : null;
      return {
        name: match.student.name,
        summary: compareStudent
          ? `${match.student.name} ${currentTerm} 最新总分 ${formatMaybeNumber(currentTotal)}，${compareTerm} 最新总分 ${formatMaybeNumber(compareTotal)}${diff !== null ? `，变化 ${diff >= 0 ? "+" : ""}${diff}` : ""}`
          : `${match.student.name} 在对比学期未匹配到同名学生`,
        current: getStudentExamSeries(match.student).join("；") || "当前学期暂无成绩",
        compare: compareStudent ? (getStudentExamSeries(compareStudent).join("；") || "对比学期暂无成绩") : "未匹配",
        trend: diff,
        subjects: [],
        exams: [...getStudentExamSeries(compareStudent || match.student), ...getStudentExamSeries(match.student)].slice(0, 12),
      };
    })
    .slice(0, 6);
  return items.length ? {
    kind: "student_term",
    title: "学生跨学期档案",
    reason: "问题提到具体学生，附带该生两个学期的成绩序列摘要。",
    items,
  } : null;
}

function buildCandidateTermPack(currentStudents: AppStudent[], compareStudents: AppStudent[]): AiComparisonPack | null {
  const items = currentStudents
    .flatMap<AiComparisonPackItem>(student => {
      const compareStudent = findStudentByName(student, compareStudents);
      const currentTotal = getLatestStudentTotal(student);
      const compareTotal = getLatestStudentTotal(compareStudent);
      if (!compareStudent || currentTotal === null || compareTotal === null) {
        return [];
      }
      const diff = Math.round((currentTotal - compareTotal) * 10) / 10;
      return [{
        name: student.name,
        summary: `${student.name} 总分变化 ${diff >= 0 ? "+" : ""}${diff}`,
        current: `当前最新总分 ${currentTotal}`,
        compare: `对比最新总分 ${compareTotal}`,
        trend: diff,
        subjects: [],
        exams: [],
      }];
    })
    .sort((a, b) => Math.abs(b.trend || 0) - Math.abs(a.trend || 0))
    .slice(0, 30);
  return items.length ? {
    kind: "candidate_students",
    title: "变化明显学生",
    reason: "附带两个学期总分变化幅度较明显的学生。",
    items,
  } : null;
}

function buildAiAssistantComparisonContext(input: {
  prompt: string;
  currentState: Pick<SeatManagerState, "students" | "gradeExams">;
}): AiComparisonContext | undefined {
  const normalized = normalizeTermText(input.prompt);
  const currentSlice = getCurrentSlice();
  const currentClassName = sliceDisplayName(currentSlice);
  if (mentionsOtherClass(normalized, currentClassName) && includesAny(normalized, ["比", "对比", "比较", "相比"])) {
    return {
      currentScope: { className: currentClassName, termLabel: currentSlice.term.label },
      notice: "第一版暂不支持跨班级对比；请先使用同一班级的跨学期对比。",
      comparisonPacks: [{
        kind: "notice",
        title: "暂不支持跨班级对比",
        reason: "问题提到另一个班级，但第一版只支持同一班级跨学期对比。",
        items: [{ summary: "跨班级对比将在后续版本支持。" }],
      }],
    };
  }
  if (!hasTermComparisonIntent(normalized)) {
    return undefined;
  }
  const sameClassSlices = exportWholeBook().slices.filter(slice => slice.classId === currentSlice.classId);
  const compareSlice = findExplicitCompareSlice(input.prompt, sameClassSlices, currentSlice) || findDefaultCompareSlice(sameClassSlices, currentSlice);
  if (!compareSlice) {
    return {
      currentScope: { className: currentClassName, termLabel: currentSlice.term.label },
      notice: "当前班级没有可用于对比的其他学期。",
      comparisonPacks: [{
        kind: "notice",
        title: "没有可对比学期",
        reason: "文件柜中未找到同一班级的其他学期。",
        items: [{ summary: "请先在文件柜中建立或导入同一班级的其他学期数据。" }],
      }],
    };
  }
  const compareState = createSeatManagerState(compareSlice.data);
  const mentionedStudents = findMentionedStudents(input.prompt, input.currentState.students);
  const studentPack = buildStudentTermPack(input.currentState.students, compareState.students, mentionedStudents, currentSlice.term.label, compareSlice.term.label);
  const candidatePack = buildCandidateTermPack(input.currentState.students, compareState.students);
  const packs = [
    buildClassComparisonPack(input.currentState, compareState, currentSlice.term.label, compareSlice.term.label),
    studentPack,
    candidatePack,
  ].filter((pack): pack is AiComparisonPack => Boolean(pack));
  return {
    currentScope: { className: currentClassName, termLabel: currentSlice.term.label },
    compareScope: { className: sliceDisplayName(compareSlice), termLabel: compareSlice.term.label },
    comparisonPacks: packs,
  };
}

export function buildAiAssistantBaseContext(input: {
  className: string;
  termLabel: string;
  students: AppStudent[];
  exams: GradeExam[];
  dormitories: Dormitory[];
  fundTransactions: FundTransaction[];
  seatCount: number;
  occupiedSeatCount?: number;
}): AiAssistantBaseContext {
  const exams = [...input.exams].sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`));
  const latestExam = exams[exams.length - 1];
  const previousExam = exams[exams.length - 2];
  const latestAverage = getExamTotalAverage(latestExam);
  const gradeTrend: string[] = [];
  if (previousExam && latestExam) {
    const previousAvg = getExamTotalAverage(previousExam);
    const latestAvg = latestAverage;
    if (previousAvg !== null && latestAvg !== null) {
      const diff = Math.round((latestAvg - previousAvg) * 10) / 10;
      gradeTrend.push(`班级均分较上次${diff >= 0 ? "上升" : "下降"} ${Math.abs(diff)} 分`);
    }
    const previousSubjects = getSubjectAverages(previousExam);
    const latestSubjects = getSubjectAverages(latestExam);
    const subjectChanges = Object.keys(latestSubjects)
      .map(subject => previousSubjects[subject] ? `${subject}${latestSubjects[subject] >= previousSubjects[subject] ? "+" : ""}${Math.round((latestSubjects[subject] - previousSubjects[subject]) * 10) / 10}` : "")
      .filter(Boolean)
      .slice(0, 8);
    if (subjectChanges.length) {
      gradeTrend.push(`各科均分变化：${subjectChanges.join("、")}`);
    }
  }
  const latestSubjectAverages = getSubjectAverages(latestExam);
  const totals = getExamTotals(latestExam).sort((a, b) => a - b);
  const examInsights = [
    Object.keys(latestSubjectAverages).length ? `最近考试各科均分：${Object.entries(latestSubjectAverages).map(([subject, value]) => `${subject}${value}`).join("、")}` : "",
    totals.length ? `总分区间：最低 ${totals[0]}，中位 ${totals[Math.floor(totals.length / 2)]}，最高 ${totals[totals.length - 1]}` : "",
    latestAverage !== null && totals.length ? `低于班均 ${totals.filter(value => value < latestAverage).length} 人，高于或等于班均 ${totals.filter(value => value >= latestAverage).length} 人` : "",
  ].filter(Boolean);

  const scoredStudents = input.students.map(student => ({
    student,
    latestTotal: getStudentLatestTotal(student),
    trend: getStudentTrend(student),
    reasons: buildStudentReasons(student, getStudentLatestTotal(student), latestAverage),
  }));
  const focusStudents = dedupeFocusStudents([
    ...scoredStudents
      .filter(item => item.latestTotal !== null)
      .sort((a, b) => (a.latestTotal ?? 0) - (b.latestTotal ?? 0))
      .slice(0, 6)
      .map(item => ({ ...item, category: "低分关注" })),
    ...scoredStudents
      .filter(item => item.trend !== null && item.trend < 0)
      .sort((a, b) => (a.trend ?? 0) - (b.trend ?? 0))
      .slice(0, 5)
      .map(item => ({ ...item, category: "退步关注" })),
    ...scoredStudents
      .filter(item => item.trend !== null && item.trend > 0)
      .sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0))
      .slice(0, 4)
      .map(item => ({ ...item, category: "进步样本" })),
    ...scoredStudents
      .filter(item => item.student.records.length)
      .sort((a, b) => (b.student.records[0]?.date || "").localeCompare(a.student.records[0]?.date || ""))
      .slice(0, 4)
      .map(item => ({ ...item, category: "近期记录" })),
  ])
    .slice(0, 14)
    .map(item => ({
      name: item.student.name,
      category: item.category,
      latestTotal: item.latestTotal,
      reasons: item.reasons,
      tags: [...item.student.academicTags, ...item.student.tags].slice(0, 6),
    }));
  const tagSummary = summarizeCounts(input.students.flatMap(student => [...student.academicTags, ...student.tags]), 10);
  const records = input.students.flatMap(student => student.records.map(record => ({ ...record, studentName: student.name })));
  const recordSummary = [
    `日常记录 ${records.length} 条：奖励 ${records.filter(record => record.type === "reward").length}，提醒 ${records.filter(record => record.type === "punish").length}，备注 ${records.filter(record => record.type === "note").length}`,
    ...records
      .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`))
      .slice(0, 6)
      .map(record => `${record.date} ${record.studentName}：${record.note}`),
  ].filter(Boolean);
  const dormitorySummary = input.dormitories
    .map(dorm => `${dorm.name} 共 ${listDormitoryEvents(dorm).length} 条加减分记录，成员 ${dorm.memberIds.length} 人`)
    .slice(0, 8);
  const income = input.fundTransactions.filter(tx => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expense = input.fundTransactions.filter(tx => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  return {
    className: input.className,
    termLabel: input.termLabel,
    studentCount: input.students.length,
    seatCount: input.seatCount,
    latestExam: latestExam ? {
      name: latestExam.name,
      date: latestExam.date,
      studentCount: latestExam.rows.length,
      subjectCount: latestExam.subjects.length,
      averageTotal: latestAverage,
    } : undefined,
    examInsights,
    gradeTrend,
    focusStudents,
    tagSummary,
    recordSummary,
    seatSummary: `座位 ${input.seatCount} 个，已安排 ${input.occupiedSeatCount ?? 0} 人，未安排约 ${Math.max(input.students.length - (input.occupiedSeatCount ?? 0), 0)} 人`,
    dormitorySummary,
    fundSummary: `收入 ${Math.round(income * 100) / 100}，支出 ${Math.round(expense * 100) / 100}，余额 ${Math.round((income - expense) * 100) / 100}`,
  };
}

export function buildAiAssistantContext(input: {
  prompt: string;
  baseContext: AiAssistantBaseContext;
  students: AppStudent[];
  exams: GradeExam[];
  dormitories: Dormitory[];
  fundTransactions: FundTransaction[];
}): AiAssistantContext {
  const prompt = input.prompt || "";
  const normalized = normalizeQuery(prompt);
  const exams = [...input.exams].sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`));
  const latestExam = exams[exams.length - 1];
  const latestSubjectAverages = getSubjectAverages(latestExam);
  const packs: AiContextPack[] = [];
  const mentionedStudents = findMentionedStudents(prompt, input.students);
  mentionedStudents.forEach(match => packs.push(buildStudentPack(match.student, exams, latestExam, latestSubjectAverages, input.dormitories, match.matchNote)));

  const mentionedTags = findMentionedTags(prompt, input.students);
  const tagPack = mentionedTags.length ? buildTagPack(mentionedTags, input.students, latestExam, latestSubjectAverages) : null;
  if (tagPack) packs.push(tagPack);

  const mentionedDormitories = findMentionedDormitories(prompt, input.dormitories);
  const needsDormitory = mentionedDormitories.length > 0 || includesAny(normalized, ["宿舍", "寝室", "内务", "扣分", "加分"]);
  const dormPack = needsDormitory ? buildDormitoryPack(mentionedDormitories.length ? mentionedDormitories : input.dormitories, input.students) : null;
  if (dormPack) packs.push(dormPack);

  const mentionedExams = findMentionedExams(prompt, exams);
  const needsExam = mentionedExams.length > 0 || includesAny(normalized, ["考试", "成绩", "分数", "排名", "均分", "学科", "科目", "缺考"]);
  const examPack = needsExam ? buildExamPack(mentionedExams.length ? mentionedExams : exams.slice(-2).reverse(), input.students) : null;
  if (examPack) packs.push(examPack);

  const scoredStudents = input.students.map(student => ({
    student,
    latestTotal: getStudentLatestTotal(student),
    trend: getStudentTrend(student),
    recordCount: student.records.length,
  }));
  if (includesAny(normalized, ["退步", "下降", "下滑", "掉"])) {
    const candidates = scoredStudents
      .filter(item => item.trend !== null && item.trend < 0)
      .sort((a, b) => (a.trend ?? 0) - (b.trend ?? 0))
      .map(item => item.student);
    const pack = buildCandidatePack("退步候选学生", "问题询问退步/下降，附带退步幅度靠前的学生。", candidates, latestExam, latestSubjectAverages, "退步关注");
    if (pack) packs.push(pack);
  }
  if (includesAny(normalized, ["进步", "提升", "上升", "经验"])) {
    const candidates = scoredStudents
      .filter(item => item.trend !== null && item.trend > 0)
      .sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0))
      .map(item => item.student);
    const pack = buildCandidatePack("进步候选学生", "问题询问进步/提升，附带提升幅度靠前的学生。", candidates, latestExam, latestSubjectAverages, "进步样本");
    if (pack) packs.push(pack);
  }
  if (includesAny(normalized, ["低分", "薄弱", "弱项", "关注", "重点", "帮扶", "临界"])) {
    const candidates = scoredStudents
      .filter(item => item.latestTotal !== null)
      .sort((a, b) => (a.latestTotal ?? 0) - (b.latestTotal ?? 0))
      .map(item => item.student);
    const pack = buildCandidatePack("低分/重点候选学生", "问题询问重点关注或薄弱学生，附带低分候选。", candidates, latestExam, latestSubjectAverages, "低分关注");
    if (pack) packs.push(pack);
  }
  if (includesAny(normalized, ["日常", "记录", "表现", "纪律", "奖励", "提醒", "作业", "课堂"])) {
    const pack = buildRecordsPack(input.students, latestExam, latestSubjectAverages);
    if (pack) packs.push(pack);
  }
  if (includesAny(normalized, ["班费", "花销", "花费", "支出", "收入", "余额", "报销", "费用", "流水", "钱", "财务"])) {
    packs.push(buildFundPack(input.fundTransactions));
  }

  const comparisonContext = buildAiAssistantComparisonContext({
    prompt,
    currentState: {
      students: input.students,
      gradeExams: input.exams,
    },
  });
  const deduped = packs.filter((pack, index, array) => (
    array.findIndex(item => item.kind === pack.kind && item.title === pack.title) === index
  )).slice(0, 6);
  return {
    baseContext: input.baseContext,
    contextPacks: deduped,
    comparisonContext,
  };
}

export async function sendAiAssistantChat(input: {
  messages: AiChatMessage[];
  context: AiAssistantContext;
  accessCode?: string;
  remember?: boolean;
}): Promise<AiAssistantResponse> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }
  const auth = await getAiAuth({ accessCode: input.accessCode, remember: input.remember });
  const requestBody = buildAiAssistantRequestBody(input.messages, input.context);
  const send = (baseUrl: string) => fetch(`${baseUrl}/chat-assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.token}`,
    },
    body: requestBody,
  });
  let response = await send(getWorkerBaseUrl());
  if (response.status === 404 || response.status === 405) {
    response = await send(getDirectWorkerUrl());
  }
  if (response.status === 401) {
    if (!getProductAuthToken()) {
      clearAiApiAuth();
    }
    throw new Error("ai_unauthorized");
  }
  if (response.status === 403) {
    throw new Error("ai_unauthorized");
  }
  if (response.status === 413) {
    throw new Error("ai_payload_too_large");
  }
  if (response.status === 429) {
    throw new Error("ai_rate_limited");
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(errorData.error ? `ai_failed:${errorData.error}` : "ai_failed");
  }
  return parseAiAssistantResponse(await response.json());
}
