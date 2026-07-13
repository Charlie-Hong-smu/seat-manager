import type { AppStudent, CommentCriteriaSummary, CommentCustomOptionSummary, Dormitory, StudentCommentDraft, StudentExamSummary } from "./types";
import { listDormitoryEvents } from "./dormitoryPeriods";

export interface AiStudentExamContext {
  order: number;
  name: string;
  date: string;
  period: "oldest" | "middle" | "latest";
  totalScore: number | null;
  classRank: number | null;
  schoolRank: number | null;
  subjects: Array<{
    subject: string;
    score: number;
    rankClass: number | null;
    rankSchool: number | null;
  }>;
  zeroSubjects: string[];
}

export interface AiStudentContext {
  student: {
    id: string;
    name: string;
    className: string;
    seat: string;
  };
  latestExam: {
    name: string;
    date: string;
    totalScore: number | null;
    scoreRate: null;
    classRank: number | null;
    schoolRank: number | null;
    subjects: AiStudentExamContext["subjects"];
  } | null;
  exams: AiStudentExamContext[];
  trend: {
    examCount: number;
    totalScoreChange: number | null;
    scoreRateChange: null;
    classRankChange: number | null;
    schoolRankChange: null;
    changedSubjects: Array<{ subject: string; diff: number }>;
    summary: string;
  };
  strengths: string[];
  weaknesses: string[];
  tags: string[];
  records: string[];
  dormitory: string;
  commentProfile?: {
    criteriaSummary: CommentCriteriaSummary[];
    customOptions: CommentCustomOptionSummary[];
    teacherNote: string;
  };
  teacherNote?: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function getExamSortValue(exam: StudentExamSummary): string {
  return `${exam.date || "9999-12-31"}-${exam.name}-${exam.id}`;
}

function getScoreEntries(exam: StudentExamSummary): Array<[string, number]> {
  return Object.entries(exam.scores)
    .filter(([, score]) => typeof score === "number" && Number.isFinite(score));
}

function getExamTotal(exam: StudentExamSummary): number | null {
  if (typeof exam.total === "number" && Number.isFinite(exam.total)) {
    return round1(exam.total);
  }
  const entries = getScoreEntries(exam);
  return entries.length ? round1(entries.reduce((sum, [, score]) => sum + score, 0)) : null;
}

function parseRank(rank: string | undefined): number | null {
  const parsed = Number.parseInt(String(rank || ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildExamContext(exam: StudentExamSummary, index: number, count: number): AiStudentExamContext {
  const subjects = getScoreEntries(exam)
    .map(([subject, score]) => ({
      subject,
      score: round1(score),
      rankClass: null,
      rankSchool: null,
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject, "zh-Hans-CN"));
  return {
    order: index + 1,
    name: exam.name || "考试",
    date: exam.date || "",
    period: index === 0 ? "oldest" : index === count - 1 ? "latest" : "middle",
    totalScore: getExamTotal(exam),
    classRank: parseRank(exam.rank),
    schoolRank: null,
    subjects,
    zeroSubjects: subjects.filter(item => item.score === 0).map(item => item.subject),
  };
}

function getSubjectChanges(first: StudentExamSummary | undefined, latest: StudentExamSummary | undefined): Array<{ subject: string; diff: number }> {
  if (!first || !latest) {
    return [];
  }
  const subjects = new Set([...Object.keys(first.scores), ...Object.keys(latest.scores)]);
  return [...subjects]
    .map(subject => {
      const before = first.scores[subject];
      const after = latest.scores[subject];
      if (!Number.isFinite(before) || !Number.isFinite(after)) {
        return null;
      }
      return { subject, diff: round1(after - before) };
    })
    .filter((item): item is { subject: string; diff: number } => Boolean(item))
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
    .slice(0, 8);
}

export function buildLocalStudentTrendSummary(exams: StudentExamSummary[]): string {
  const chronological = [...exams].sort((a, b) => getExamSortValue(a).localeCompare(getExamSortValue(b)));
  const totals = chronological.map(getExamTotal).filter((value): value is number => value !== null);
  const summary: string[] = [];
  if (totals.length >= 2) {
    const diff = round1(totals[totals.length - 1] - totals[0]);
    summary.push(`总分较最早一次${diff >= 0 ? "上升" : "下降"} ${Math.abs(diff)} 分。`);
  }
  getSubjectChanges(chronological[0], chronological[chronological.length - 1])
    .filter(change => Math.abs(change.diff) >= 5)
    .slice(0, 6)
    .forEach(change => {
      summary.push(`${change.subject}${change.diff >= 0 ? "上升" : "下降"} ${Math.abs(change.diff)} 分。`);
    });
  return summary.length ? summary.join(" ") : "可用考试次数或有效分数较少，主要参考单次成绩和排名。";
}

export function buildStudentAiContext(input: {
  student: AppStudent;
  dormitories?: Dormitory[];
  draft?: StudentCommentDraft;
  maxRecords?: number;
  maxTags?: number;
}): AiStudentContext {
  const { student } = input;
  const chronological = [...student.exams].sort((a, b) => getExamSortValue(a).localeCompare(getExamSortValue(b)));
  const latest = chronological[chronological.length - 1];
  const first = chronological[0];
  const exams = chronological.map((exam, index) => buildExamContext(exam, index, chronological.length));
  const latestExam = exams[exams.length - 1] || null;
  const firstTotal = first ? getExamTotal(first) : null;
  const latestTotal = latest ? getExamTotal(latest) : null;
  const firstRank = parseRank(first?.rank);
  const latestRank = parseRank(latest?.rank);
  const latestSubjects = latestExam?.subjects || [];
  const sortedLatest = [...latestSubjects].sort((a, b) => b.score - a.score);
  const tags = [...student.academicTags, ...student.tags].filter(Boolean).slice(0, input.maxTags ?? 12);
  const dormitory = input.dormitories?.find(dorm => dorm.memberIds.includes(student.id) || dorm.id === student.dormitoryId);
  const records = [...student.records]
    .sort((a, b) => `${b.date}-${b.id}`.localeCompare(`${a.date}-${a.id}`))
    .slice(0, input.maxRecords ?? 8)
    .map(record => `${record.date} ${record.type}：${record.note}`);
  const criteriaSummary = input.draft?.criteriaSummary || [];
  const customOptions = input.draft?.customOptions || [];
  const teacherNote = input.draft?.teacherNote || "";

  return {
    student: {
      id: student.id,
      name: student.name,
      className: "",
      seat: "",
    },
    latestExam: latestExam ? {
      name: latestExam.name,
      date: latestExam.date,
      totalScore: latestExam.totalScore,
      scoreRate: null,
      classRank: latestExam.classRank,
      schoolRank: latestExam.schoolRank,
      subjects: latestExam.subjects,
    } : null,
    exams,
    trend: {
      examCount: exams.length,
      totalScoreChange: latestTotal !== null && firstTotal !== null ? round1(latestTotal - firstTotal) : null,
      scoreRateChange: null,
      classRankChange: latestRank !== null && firstRank !== null ? latestRank - firstRank : null,
      schoolRankChange: null,
      changedSubjects: getSubjectChanges(first, latest),
      summary: buildLocalStudentTrendSummary(student.exams),
    },
    strengths: sortedLatest.slice(0, 2).map(item => item.subject),
    weaknesses: sortedLatest.slice(-2).reverse().map(item => item.subject),
    tags,
    records,
    dormitory: dormitory ? `${dormitory.name} 共 ${listDormitoryEvents(dormitory).length} 条加减分记录，成员 ${dormitory.memberIds.length} 人` : "",
    commentProfile: {
      criteriaSummary,
      customOptions,
      teacherNote,
    },
    teacherNote,
  };
}

export function compactStudentContextForToken(input: AiStudentContext, maxSubjectDetailExams = 8): AiStudentContext {
  if (input.exams.length <= maxSubjectDetailExams) {
    return input;
  }
  const keepIndexes = new Set<number>([
    0,
    input.exams.length - 1,
    ...input.exams
      .map((exam, index) => ({ exam, index }))
      .filter(item => item.exam.zeroSubjects.length > 0)
      .map(item => item.index),
  ]);
  for (let index = input.exams.length - 2; index >= 0 && keepIndexes.size < maxSubjectDetailExams; index -= 1) {
    keepIndexes.add(index);
  }
  return {
    ...input,
    exams: input.exams.map((exam, index) => keepIndexes.has(index) ? exam : {
      ...exam,
      subjects: [],
      zeroSubjects: [],
    }),
  };
}
