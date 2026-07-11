import { IS_COMMERCIAL } from "../config";
import { clearAiApiAuth, getAiAuth, hasStoredAiApiAuth } from "./aiApiClient";
import { getProductAuthToken } from "./authStorage";
import { buildLocalStudentTrendSummary, buildStudentAiContext, compactStudentContextForToken } from "./aiStudentContext";
import { getWorkerBaseUrl } from "./workerEndpoint";
import type { AppStudent, GradeExam, StudentExamSummary } from "./types";
import { getCurrentWorkspaceScope } from "./workspaces";

const AI_RESULT_CACHE_KEY = "seat-manager-ai-result-cache-v1";
const AI_TREND_CACHE_SCOPE = "student-trend";
const AI_CLASS_TREND_CACHE_SCOPE = "class-trend";
const AI_REQUEST_LIMIT_BYTES = 20 * 1024;

export interface AiTrendResult {
  overall: string;
  changes: string;
  suggestions: string;
  disclaimer: string;
}

export interface AiClassTrendResult {
  overall: string;
  classChanges: string;
  focusStudents: string;
  suggestions: string;
  disclaimer: string;
}

function hasBrowserStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage) && Boolean(window.sessionStorage);
}

export function hasStoredAiTrendAuth(): boolean {
  return hasStoredAiApiAuth();
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function getCacheSignature(scope: string, payload: unknown): string {
  return `${getCurrentWorkspaceScope()}:${scope}:${stableStringify(payload)}`;
}

function getCachedTrend<T>(signature: string): T | null {
  if (!hasBrowserStorage()) {
    return null;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, T>;
    return cache[signature] || null;
  } catch {
    return null;
  }
}

function storeCachedTrend(signature: string, result: AiTrendResult | AiClassTrendResult): void {
  if (!hasBrowserStorage()) {
    return;
  }
  try {
    const cache = JSON.parse(window.localStorage.getItem(AI_RESULT_CACHE_KEY) || "{}") as Record<string, AiTrendResult | AiClassTrendResult>;
    const next = Object.fromEntries(Object.entries({ ...cache, [signature]: result }).slice(-50));
    window.localStorage.setItem(AI_RESULT_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore cache write failures.
  }
}

export function readCachedStudentAiTrend(student: AppStudent): AiTrendResult | null {
  if (student.exams.length < 2) {
    return null;
  }
  const payload = buildPayload(student);
  const signature = getCacheSignature(AI_TREND_CACHE_SCOPE, { studentId: student.id, payload });
  return getCachedTrend<AiTrendResult>(signature);
}

function getExamSortValue(exam: StudentExamSummary): string {
  return `${exam.date || "9999-12-31"}-${exam.name}-${exam.id}`;
}

function getScoreEntries(exam: StudentExamSummary): Array<[string, number]> {
  return Object.entries(exam.scores).filter(([, score]) => Number.isFinite(score));
}

function getExamTotal(exam: StudentExamSummary): number | null {
  if (typeof exam.total === "number" && Number.isFinite(exam.total)) {
    return Math.round(exam.total * 10) / 10;
  }
  const entries = getScoreEntries(exam);
  if (!entries.length) {
    return null;
  }
  return Math.round(entries.reduce((sum, [, score]) => sum + score, 0) * 10) / 10;
}

export function buildLocalTrendSummary(exams: StudentExamSummary[]): string {
  return buildLocalStudentTrendSummary(exams);
}

function buildPayload(student: AppStudent) {
  const context = compactStudentContextForToken(buildStudentAiContext({ student, maxRecords: 0, maxTags: 12 }));
  const recentExams = context.exams.map(exam => ({
    ...exam,
    subjects: Object.fromEntries(exam.subjects.map(item => [
      item.subject,
      {
        score: item.score,
        rankClass: item.rankClass,
        rankSchool: item.rankSchool,
      },
    ])),
  }));
  return {
    student: "学生A",
    orderInstruction: "recentExams 包含当前学期该生全部考试，已按考试先后从早到晚排列；最后一项是最新考试。所有升降变化都必须用最新考试减最早考试来判断。",
    recentExams,
    localAnalysis: {
      summary: context.trend.summary,
      totalScoreChange: context.trend.totalScoreChange,
      classRankChange: context.trend.classRankChange,
      changedSubjects: context.trend.changedSubjects,
      zeroSubjectHints: context.exams.flatMap(exam => exam.zeroSubjects.map(subject => `${exam.name} ${subject}为0`)).slice(0, 8),
    },
  };
}

function validatePayloadSize(payload: unknown): boolean {
  return new TextEncoder().encode(JSON.stringify(payload)).length <= AI_REQUEST_LIMIT_BYTES;
}

function normalizeResult(data: Partial<AiTrendResult>): AiTrendResult {
  return {
    overall: String(data.overall || "").trim(),
    changes: String(data.changes || "").trim(),
    suggestions: String(data.suggestions || "").trim(),
    disclaimer: String(data.disclaimer || "AI 分析仅供教师参考，请结合课堂观察判断。").trim(),
  };
}

function normalizeClassResult(data: Partial<AiClassTrendResult> & { changes?: string }): AiClassTrendResult {
  return {
    overall: String(data.overall || "").trim(),
    classChanges: String(data.classChanges || data.changes || "").trim(),
    focusStudents: String(data.focusStudents || "").trim(),
    suggestions: String(data.suggestions || "").trim(),
    disclaimer: String(data.disclaimer || "AI 分析仅供教师参考，请结合课堂观察判断。").trim(),
  };
}

function getLatestExamTotal(exam: StudentExamSummary): number | null {
  return getExamTotal(exam);
}

function getGradeRowTotal(row: GradeExam["rows"][number]): number | null {
  if (typeof row.total === "number" && Number.isFinite(row.total)) {
    return Math.round(row.total * 10) / 10;
  }
  const values = Object.values(row.scores)
    .map(cell => cell.score)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) * 10) / 10 : null;
}

function average(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}

function buildExamStats(exams: GradeExam[]) {
  return [...exams]
    .sort((a, b) => `${a.date || "9999-12-31"}-${a.name}`.localeCompare(`${b.date || "9999-12-31"}-${b.name}`))
    .map(exam => {
      const totals = exam.rows.map(getGradeRowTotal).filter((value): value is number => value !== null);
      const sortedTotals = [...totals].sort((a, b) => a - b);
      const subjectAverages = Object.fromEntries(exam.subjects.map(subject => {
        const values = exam.rows
          .map(row => row.scores[subject]?.score)
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        return [subject, average(values)];
      }).filter(([, value]) => value !== null));
      const zeroRows = exam.rows
        .filter(row => row.total === 0 || Object.values(row.scores).some(cell => cell.score === 0))
        .slice(0, 12)
        .map(row => row.name);
      const avgTotal = average(totals);
      return {
        name: exam.name,
        date: exam.date,
        studentCount: exam.rows.length,
        subjectCount: exam.subjects.length,
        averageTotal: avgTotal,
        minTotal: sortedTotals[0] ?? null,
        medianTotal: sortedTotals.length ? sortedTotals[Math.floor(sortedTotals.length / 2)] : null,
        maxTotal: sortedTotals[sortedTotals.length - 1] ?? null,
        belowAverageCount: avgTotal === null ? 0 : totals.filter(value => value < avgTotal).length,
        subjectAverages,
        zeroScoreHints: zeroRows,
      };
    });
}

function buildFocusReason(item: {
  totalDiff: number;
  rankDiff: number | null;
  subjectChanges: Array<{ subject: string; diff: number }>;
}): string {
  const reasons: string[] = [];
  if (typeof item.rankDiff === "number" && item.rankDiff > 0) {
    reasons.push(`排名退步${item.rankDiff}`);
  }
  if (item.totalDiff < 0) {
    reasons.push(`总分下降${Math.abs(item.totalDiff)}`);
  }
  reasons.push(...item.subjectChanges
    .filter(change => change.diff < 0)
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 2)
    .map(change => `${change.subject}下降${Math.abs(change.diff)}`));
  if (!reasons.length && typeof item.rankDiff === "number" && item.rankDiff < 0) {
    reasons.push("排名进步但需巩固");
  }
  if (!reasons.length && item.totalDiff > 0) {
    reasons.push("总分提升后需保持");
  }
  return reasons.slice(0, 2).join("，") || "需继续观察";
}

function buildClassPayload(students: AppStudent[], exams: GradeExam[]) {
  const compared = students
    .map(student => {
      const chronological = [...student.exams].sort((a, b) => getExamSortValue(a).localeCompare(getExamSortValue(b)));
      if (chronological.length < 2) {
        return null;
      }
      const previous = chronological[chronological.length - 2];
      const latest = chronological[chronological.length - 1];
      const previousTotal = getLatestExamTotal(previous);
      const latestTotal = getLatestExamTotal(latest);
      if (previousTotal === null || latestTotal === null) {
        return null;
      }
      const previousRank = previous.rank ? Number.parseInt(previous.rank, 10) : null;
      const latestRank = latest.rank ? Number.parseInt(latest.rank, 10) : null;
      const subjects = new Set([...Object.keys(previous.scores), ...Object.keys(latest.scores)]);
      const subjectChanges = [...subjects]
        .map(subject => {
          const before = previous.scores[subject];
          const after = latest.scores[subject];
          if (!Number.isFinite(before) || !Number.isFinite(after)) {
            return null;
          }
          const diff = Math.round((after - before) * 10) / 10;
          return Math.abs(diff) >= 8 ? { subject, diff } : null;
        })
        .filter((item): item is { subject: string; diff: number } => Boolean(item))
        .slice(0, 4);
      return {
        name: student.name,
        previousExam: previous.name || "上次考试",
        latestExam: latest.name || "最近考试",
        totalDiff: Math.round((latestTotal - previousTotal) * 10) / 10,
        latestTotal,
        rankDiff: previousRank !== null && latestRank !== null ? latestRank - previousRank : null,
        latestRank,
        subjectChanges,
        examSeries: chronological.map(exam => ({
          name: exam.name || "考试",
          date: exam.date || "",
          totalScore: getLatestExamTotal(exam),
          classRank: exam.rank ? Number.parseInt(exam.rank, 10) || null : null,
        })),
      };
    })
    .filter((item): item is {
      name: string;
      previousExam: string;
      latestExam: string;
      totalDiff: number;
      latestTotal: number;
      rankDiff: number | null;
      latestRank: number | null;
      subjectChanges: Array<{ subject: string; diff: number }>;
      examSeries: Array<{ name: string; date: string; totalScore: number | null; classRank: number | null }>;
    } => Boolean(item));

  const focusCandidates = compared
    .map(student => ({
      ...student,
      concernScore:
        (student.totalDiff < 0 ? Math.abs(student.totalDiff) : 0) +
        (student.rankDiff && student.rankDiff > 0 ? Math.min(student.rankDiff, 100) / 2 : 0) +
        student.subjectChanges.filter(change => change.diff < 0).length * 8,
    }))
    .sort((a, b) => b.concernScore - a.concernScore || a.name.localeCompare(b.name, "zh-Hans-CN"))
    .slice(0, 30);

  return {
    payload: {
      className: "本班",
      examCount: exams.length,
      studentCount: students.length,
      comparedStudentCount: compared.length,
      examStats: buildExamStats(exams),
      focusCandidates: focusCandidates.map(({ concernScore: _concernScore, ...item }) => item),
      localAnalysis: {
        totalImproved: compared.filter(item => item.totalDiff > 0).length,
        totalDeclined: compared.filter(item => item.totalDiff < 0).length,
        rankImproved: compared.filter(item => typeof item.rankDiff === "number" && item.rankDiff < 0).length,
        rankDeclined: compared.filter(item => typeof item.rankDiff === "number" && item.rankDiff > 0).length,
      },
    },
    focusReasonMap: Object.fromEntries(focusCandidates.map(item => [item.name, buildFocusReason(item)])),
  };
}

export function readCachedClassAiTrend(students: AppStudent[], exams: GradeExam[]): AiClassTrendResult | null {
  const { payload } = buildClassPayload(students, exams);
  if (payload.comparedStudentCount < 2 || !payload.focusCandidates.length) {
    return null;
  }
  return getCachedTrend<AiClassTrendResult>(getCacheSignature(AI_CLASS_TREND_CACHE_SCOPE, payload));
}

export async function generateClassAiTrend(
  students: AppStudent[],
  exams: GradeExam[],
  input?: { accessCode?: string; remember?: boolean; force?: boolean },
): Promise<AiClassTrendResult> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }
  const { payload, focusReasonMap } = buildClassPayload(students, exams);
  if (payload.comparedStudentCount < 2 || !payload.focusCandidates.length) {
    throw new Error("ai_insufficient_trend");
  }
  if (!validatePayloadSize(payload)) {
    throw new Error("ai_payload_too_large");
  }
  const signature = getCacheSignature(AI_CLASS_TREND_CACHE_SCOPE, payload);
  if (!input?.force) {
    const cached = getCachedTrend<AiClassTrendResult>(signature);
    if (cached?.overall || cached?.classChanges || cached?.suggestions) {
      return cached;
    }
  }

  const send = async (token: string) => fetch(`${getWorkerBaseUrl()}/analyze-class`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let auth = await getAiAuth(input);
  let response = await send(auth.token);
  if (response.status === 401) {
    if (IS_COMMERCIAL && getProductAuthToken()) {
      throw new Error("ai_unauthorized");
    }
    clearAiApiAuth();
    auth = await getAiAuth(input);
    response = await send(auth.token);
  }
  if (response.status === 403) {
    throw new Error("ai_unauthorized");
  }
  if (response.status === 429) {
    throw new Error("ai_rate_limited");
  }
  if (!response.ok) {
    throw new Error("ai_failed");
  }

  const result = normalizeClassResult(await response.json() as Partial<AiClassTrendResult>);
  if (!result.overall && !result.classChanges && !result.suggestions) {
    throw new Error("ai_failed");
  }
  const enrichedFocus = result.focusStudents
    .split(/\n|；|;/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      if (/（.+）|\(.+\)/.test(line)) {
        return line;
      }
      const name = line.replace(/^[\d.\s、-]+/, "").trim();
      return focusReasonMap[name] ? `${name}（${focusReasonMap[name]}）` : line;
    })
    .join("\n");
  const normalized = { ...result, focusStudents: enrichedFocus || result.focusStudents };
  storeCachedTrend(signature, normalized);
  return normalized;
}

export async function generateStudentAiTrend(
  student: AppStudent,
  input?: { accessCode?: string; remember?: boolean; force?: boolean },
): Promise<AiTrendResult> {
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    throw new Error("ai_file_protocol");
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error("ai_offline");
  }
  if (student.exams.length < 2) {
    throw new Error("ai_insufficient_trend");
  }

  const payload = buildPayload(student);
  if (!validatePayloadSize(payload)) {
    throw new Error("ai_payload_too_large");
  }
  const signature = getCacheSignature(AI_TREND_CACHE_SCOPE, { studentId: student.id, payload });
  if (!input?.force) {
    const cached = getCachedTrend<AiTrendResult>(signature);
    if (cached?.overall || cached?.changes || cached?.suggestions) {
      return cached;
    }
  }

  const send = async (token: string) => fetch(`${getWorkerBaseUrl()}/analyze-trend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  let auth = await getAiAuth(input);
  let response = await send(auth.token);
  if (response.status === 401) {
    if (IS_COMMERCIAL && getProductAuthToken()) {
      throw new Error("ai_unauthorized");
    }
    clearAiApiAuth();
    auth = await getAiAuth(input);
    response = await send(auth.token);
  }
  if (response.status === 403) {
    throw new Error("ai_unauthorized");
  }
  if (response.status === 429) {
    throw new Error("ai_rate_limited");
  }
  if (!response.ok) {
    throw new Error("ai_failed");
  }

  const result = normalizeResult(await response.json() as Partial<AiTrendResult>);
  if (!result.overall && !result.changes && !result.suggestions) {
    throw new Error("ai_failed");
  }
  storeCachedTrend(signature, result);
  return result;
}
