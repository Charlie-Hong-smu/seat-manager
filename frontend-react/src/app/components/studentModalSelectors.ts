import type { RecordType, StudentExamSummary } from "../state/types";

export interface StudentModalRecord {
  id: string;
  type: RecordType;
  note: string;
  date: string;
  score?: number;
  presetId?: string;
  createdAt?: string;
}

export interface WeekOption {
  key: string;
  label: string;
  start: Date;
  end: Date;
}

export function getScoreEntries(scores: Record<string, number>): Array<[string, number]> {
  return Object.entries(scores).filter(([, score]) => Number.isFinite(score));
}

export function getBestSubject(scores: Record<string, number>): string {
  return getScoreEntries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
}

export function getWeakSubject(scores: Record<string, number>): string {
  return getScoreEntries(scores).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "";
}

export function getExamTotal(exam: StudentExamSummary): number {
  return exam.total ?? getScoreEntries(exam.scores).reduce((sum, [, score]) => sum + score, 0);
}

export function getExamSortValue(exam: StudentExamSummary): string {
  return `${exam.date || "9999-12-31"}-${exam.name}-${exam.id}`;
}

export function formatScore(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value * 10) / 10) : "—";
}

import { toLocalDateKey } from "../state/dateKey";

export { toLocalDateKey };

export function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getWeekStart(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = start.getDay();
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return start;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function buildWeekOptions(records: StudentModalRecord[], now = new Date()): WeekOption[] {
  const currentWeekStart = getWeekStart(now);
  const currentWeekKey = toLocalDateKey(currentWeekStart);
  const weekKeys = new Set<string>();
  for (let index = 0; index < 12; index += 1) weekKeys.add(toLocalDateKey(addDays(currentWeekStart, index * -7)));
  records.forEach((record) => {
    const recordDate = parseLocalDate(record.date);
    if (recordDate) weekKeys.add(toLocalDateKey(getWeekStart(recordDate)));
  });
  return [...weekKeys].sort((a, b) => b.localeCompare(a)).map((key) => {
    const start = parseLocalDate(key) || currentWeekStart;
    const end = addDays(start, 6);
    return { key, start, end, label: `${key} - ${toLocalDateKey(end)}${key === currentWeekKey ? "（本周）" : ""}` };
  });
}

export function isRecordInWeek(record: StudentModalRecord, week: WeekOption): boolean {
  const recordDate = parseLocalDate(record.date);
  return Boolean(recordDate && recordDate >= week.start && recordDate <= week.end);
}

export function parseAliases(value: string): string[] {
  return value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
}

export function sortTagIds(ids: Iterable<string>): string {
  return [...ids].sort().join("|");
}
