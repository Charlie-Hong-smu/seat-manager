import { IS_COMMERCIAL } from "../config";
import { getProductAuthToken } from "./authStorage";
import { getDirectWorkerUrl, getWorkerBaseUrl } from "./workerEndpoint";
import type { AppStudent, Dormitory, FundTransaction, GradeExam, GradeRow } from "./types";

const AI_AUTH_TOKEN_KEY = "seat-manager-ai-auth-token";
const AI_AUTH_EXPIRES_KEY = "seat-manager-ai-auth-expires";
const AI_AUTH_SESSION_TOKEN_KEY = "seat-manager-ai-session-token";
const AI_AUTH_SESSION_EXPIRES_KEY = "seat-manager-ai-session-expires";
const AI_REMEMBER_DAYS = 30;
const AI_CHAT_LIMIT = 20;

interface AiAuth {
  token: string;
  expiresAt: number;
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
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
  kind: "student" | "candidate_students" | "exam" | "dormitory" | "tag" | "records";
  title: string;
  reason: string;
  items: AiContextPackItem[];
}

export interface AiAssistantContext {
  baseContext: AiAssistantBaseContext;
  contextPacks: AiContextPack[];
}

export interface AiAssistantResponse {
  message: string;
  disclaimer: string;
  suggestedPrompts: string[];
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage) && Boolean(window.sessionStorage);
}

function getStoredAiAuth(): AiAuth | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  const now = Date.now();
  const candidates = [
    {
      token: window.localStorage.getItem(AI_AUTH_TOKEN_KEY) || "",
      expiresAt: Number.parseInt(window.localStorage.getItem(AI_AUTH_EXPIRES_KEY) || "", 10),
    },
    {
      token: window.sessionStorage.getItem(AI_AUTH_SESSION_TOKEN_KEY) || "",
      expiresAt: Number.parseInt(window.sessionStorage.getItem(AI_AUTH_SESSION_EXPIRES_KEY) || "", 10),
    },
  ];
  return candidates.find(item => item.token && Number.isFinite(item.expiresAt) && item.expiresAt > now) || null;
}

function clearAiAuth(): void {
  if (!hasBrowserStorage()) {
    return;
  }
  window.localStorage.removeItem(AI_AUTH_TOKEN_KEY);
  window.localStorage.removeItem(AI_AUTH_EXPIRES_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_TOKEN_KEY);
  window.sessionStorage.removeItem(AI_AUTH_SESSION_EXPIRES_KEY);
}

function storeAiAuth(auth: AiAuth, remember: boolean): void {
  if (!hasBrowserStorage()) {
    return;
  }
  clearAiAuth();
  const storage = remember ? window.localStorage : window.sessionStorage;
  storage.setItem(remember ? AI_AUTH_TOKEN_KEY : AI_AUTH_SESSION_TOKEN_KEY, auth.token);
  storage.setItem(remember ? AI_AUTH_EXPIRES_KEY : AI_AUTH_SESSION_EXPIRES_KEY, String(auth.expiresAt));
}

export function hasStoredAiAssistantAuth(): boolean {
  return Boolean(IS_COMMERCIAL && getProductAuthToken()) || Boolean(getStoredAiAuth());
}

async function requestAiAuth(accessCode: string, remember: boolean): Promise<AiAuth> {
  const requestBody = JSON.stringify({ accessCode, rememberDays: remember ? AI_REMEMBER_DAYS : 0 });
  const send = (baseUrl: string) => fetch(`${baseUrl}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: requestBody,
  });
  let response: Response;
  try {
    response = await send(getWorkerBaseUrl());
  } catch (error) {
    response = await send(getDirectWorkerUrl());
  }
  if (response.status === 404 || response.status === 405) {
    response = await send(getDirectWorkerUrl());
  }
  if (response.status === 403) {
    throw new Error("ai_unauthorized");
  }
  if (!response.ok) {
    throw new Error("ai_auth_failed");
  }
  const data = await response.json() as AiAuth;
  if (!data.token || !Number.isFinite(data.expiresAt)) {
    throw new Error("ai_auth_failed");
  }
  storeAiAuth(data, remember);
  return data;
}

async function getAuth(input?: { accessCode?: string; remember?: boolean }): Promise<AiAuth> {
  const productToken = IS_COMMERCIAL ? getProductAuthToken() : "";
  if (productToken) {
    return { token: productToken, expiresAt: Date.now() + AI_REMEMBER_DAYS * 24 * 60 * 60 * 1000 };
  }
  const stored = getStoredAiAuth();
  if (stored) {
    return stored;
  }
  const accessCode = input?.accessCode?.trim();
  if (!accessCode) {
    throw new Error("ai_auth_required");
  }
  return requestAiAuth(accessCode, Boolean(input?.remember));
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
  }).filter(([, value]) => value > 0));
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

function findMentionedStudents(prompt: string, students: AppStudent[]): AppStudent[] {
  const normalized = normalizeQuery(prompt);
  return students
    .filter(student => {
      const names = [student.name, ...student.aliases].map(normalizeQuery).filter(Boolean);
      return names.some(name => normalized.includes(name));
    })
    .slice(0, 6);
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

function buildStudentPack(student: AppStudent, exams: GradeExam[], latestExam: GradeExam | undefined, latestSubjectAverages: Record<string, number>, dormitories: Dormitory[]): AiContextPack {
  const chronological = [...exams].sort((a, b) => `${b.date || ""}-${b.name}`.localeCompare(`${a.date || ""}-${a.name}`));
  const recentExams = chronological.slice(0, 4);
  const latestRow = findStudentExamRow(latestExam, student);
  const previousRow = recentExams[1] ? findStudentExamRow(recentExams[1], student) : null;
  const latestTotal = getRowTotal(latestRow);
  const previousTotal = getRowTotal(previousRow);
  const dormitory = dormitories.find(dorm => dorm.memberIds.includes(student.id));
  return {
    kind: "student",
    title: `${student.name}明细`,
    reason: "问题中提到具体学生，附带该生近期成绩、标签、记录和宿舍信息。",
    items: [{
      ...formatStudentExamSummary(student, latestExam, latestSubjectAverages),
      previousTotal,
      trend: latestTotal !== null && previousTotal !== null ? Math.round((latestTotal - previousTotal) * 10) / 10 : null,
      exams: recentExams.map(exam => {
        const row = findStudentExamRow(exam, student);
        const total = getRowTotal(row);
        const scores = formatRowScores(row, exam.subjects).join("、");
        return `${exam.name}${exam.date ? `(${exam.date})` : ""}：总分${total ?? "无"}；${scores || "无各科"}`;
      }),
      dormitory: dormitory ? `${dormitory.name} 当前 ${dormitory.currentScore} 分` : "",
    }],
  };
}

function buildCandidatePack(title: string, reason: string, students: AppStudent[], latestExam: GradeExam | undefined, latestSubjectAverages: Record<string, number>, category: string): AiContextPack | null {
  const items = students.slice(0, 20).map(student => ({
    ...formatStudentExamSummary(student, latestExam, latestSubjectAverages),
    category,
  }));
  return items.length ? { kind: "candidate_students", title, reason, items } : null;
}

function buildDormitoryPack(dormitories: Dormitory[], students: AppStudent[]): AiContextPack | null {
  const items = dormitories.slice(0, 8).map(dorm => ({
    name: dorm.name,
    summary: `当前 ${dorm.currentScore} 分，基础分 ${dorm.baseScore}，成员 ${dorm.memberIds.length} 人`,
    members: dorm.memberIds.map(id => students.find(student => student.id === id)?.name || "").filter(Boolean).slice(0, 12),
    events: [...dorm.events]
      .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`))
      .slice(0, 8)
      .map(event => `${event.date} ${event.type} ${event.score >= 0 ? "+" : ""}${event.score}：${event.reason || event.note}`),
  }));
  return items.length ? { kind: "dormitory", title: "宿舍明细", reason: "问题涉及宿舍，附带宿舍成员、分数和近期事件。", items } : null;
}

function buildExamPack(exams: GradeExam[], students: AppStudent[]): AiContextPack | null {
  const items = exams.slice(0, 3).map(exam => {
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
    .map(dorm => `${dorm.name} 当前 ${dorm.currentScore} 分，成员 ${dorm.memberIds.length} 人`)
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
}): AiAssistantContext {
  const prompt = input.prompt || "";
  const normalized = normalizeQuery(prompt);
  const exams = [...input.exams].sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`));
  const latestExam = exams[exams.length - 1];
  const latestSubjectAverages = getSubjectAverages(latestExam);
  const packs: AiContextPack[] = [];
  const mentionedStudents = findMentionedStudents(prompt, input.students);
  mentionedStudents.forEach(student => packs.push(buildStudentPack(student, exams, latestExam, latestSubjectAverages, input.dormitories)));

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

  const deduped = packs.filter((pack, index, array) => (
    array.findIndex(item => item.kind === pack.kind && item.title === pack.title) === index
  )).slice(0, 6);
  return {
    baseContext: input.baseContext,
    contextPacks: deduped,
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
  const auth = await getAuth({ accessCode: input.accessCode, remember: input.remember });
  const requestBody = JSON.stringify({
    messages: input.messages.slice(-AI_CHAT_LIMIT).map(message => ({
      role: message.role,
      content: message.content,
    })),
    context: input.context,
  });
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
    if (!IS_COMMERCIAL) {
      clearAiAuth();
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
  const data = await response.json() as Partial<AiAssistantResponse>;
  const message = String(data.message || "").trim();
  if (!message) {
    throw new Error("ai_failed");
  }
  return {
    message,
    disclaimer: String(data.disclaimer || "AI 内容仅供教师参考，请结合实际课堂观察判断。").trim(),
    suggestedPrompts: Array.isArray(data.suggestedPrompts) ? data.suggestedPrompts.map(String).filter(Boolean).slice(0, 4) : [],
  };
}
