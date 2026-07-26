import type { DormEvent, Dormitory, DormitoryPeriodMode, DormitoryPeriodSettings } from "./types";
import { toLocalDateKey } from "./dateKey";

export interface DormitoryPeriodRange {
  start: string;
  end: string;
  label: string;
}

export interface DormitoryEventEntry {
  event: DormEvent;
  archiveId?: string;
  archiveLabel?: string;
}

export function localDateKey(value = new Date()): string {
  return toLocalDateKey(value);
}

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year || 1970, Math.max(0, (month || 1) - 1), day || 1);
}

function addDays(value: string, amount: number): string {
  const date = parseDateKey(value);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

function daysBetween(start: string, end: string): number {
  const from = parseDateKey(start);
  const to = parseDateKey(end);
  return Math.round((Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86_400_000);
}

function addMonthsClamped(value: string, amount: number): string {
  const date = parseDateKey(value);
  const targetMonth = date.getMonth() + amount;
  const targetYear = date.getFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return localDateKey(new Date(targetYear, normalizedMonth, Math.min(date.getDate(), lastDay)));
}

function clampInterval(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(12, Math.max(1, Math.round(parsed))) : 2;
}

export function normalizeDormitoryPeriodSettings(value: unknown, fallbackDate = localDateKey()): DormitoryPeriodSettings {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const anchorDate = typeof record.anchorDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.anchorDate) && localDateKey(parseDateKey(record.anchorDate)) === record.anchorDate
    ? record.anchorDate
    : fallbackDate;
  return {
    anchorDate,
    unit: record.unit === "month" ? "month" : "week",
    intervalCount: clampInterval(record.intervalCount),
  };
}

function getCustomRange(anchor: string, settings: DormitoryPeriodSettings): DormitoryPeriodRange {
  if (settings.unit === "week") {
    const length = settings.intervalCount * 7;
    const index = Math.floor(daysBetween(settings.anchorDate, anchor) / length);
    const start = addDays(settings.anchorDate, index * length);
    const end = addDays(start, length - 1);
    return { start, end, label: `${start} 至 ${end} · 每 ${settings.intervalCount} 周` };
  }

  const anchorDate = parseDateKey(anchor);
  const origin = parseDateKey(settings.anchorDate);
  const monthDifference = (anchorDate.getFullYear() - origin.getFullYear()) * 12 + anchorDate.getMonth() - origin.getMonth();
  let index = Math.floor(monthDifference / settings.intervalCount);
  let start = addMonthsClamped(settings.anchorDate, index * settings.intervalCount);
  let next = addMonthsClamped(settings.anchorDate, (index + 1) * settings.intervalCount);
  while (anchor < start) {
    index -= 1;
    start = addMonthsClamped(settings.anchorDate, index * settings.intervalCount);
    next = addMonthsClamped(settings.anchorDate, (index + 1) * settings.intervalCount);
  }
  while (anchor >= next) {
    index += 1;
    start = next;
    next = addMonthsClamped(settings.anchorDate, (index + 1) * settings.intervalCount);
  }
  const end = addDays(next, -1);
  return { start, end, label: `${start} 至 ${end} · 每 ${settings.intervalCount} 个月` };
}

export function getDormitoryPeriodRange(mode: DormitoryPeriodMode, anchor: string, settings: DormitoryPeriodSettings): DormitoryPeriodRange {
  const date = parseDateKey(anchor);
  if (mode === "week") {
    const start = new Date(date);
    start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const startKey = localDateKey(start);
    const end = addDays(startKey, 6);
    return { start: startKey, end, label: `${startKey} 至 ${end}` };
  }
  if (mode === "month") {
    const start = localDateKey(new Date(date.getFullYear(), date.getMonth(), 1));
    const end = localDateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    return { start, end, label: `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` };
  }
  return getCustomRange(anchor, settings);
}

export function shiftDormitoryPeriod(mode: DormitoryPeriodMode, anchor: string, amount: number, settings: DormitoryPeriodSettings): string {
  if (mode === "week") return addDays(anchor, amount * 7);
  if (mode === "month") return addMonthsClamped(anchor, amount);
  const range = getCustomRange(anchor, settings);
  return amount > 0 ? addDays(range.end, 1) : addDays(range.start, -1);
}

export function listDormitoryEvents(dormitory: Dormitory): DormitoryEventEntry[] {
  const seen = new Set<string>();
  const entries: DormitoryEventEntry[] = [];
  dormitory.events.forEach(event => {
    if (!seen.has(event.id)) {
      seen.add(event.id);
      entries.push({ event });
    }
  });
  dormitory.history.forEach(archive => archive.events.forEach(event => {
    if (!seen.has(event.id)) {
      seen.add(event.id);
      entries.push({ event, archiveId: archive.id, archiveLabel: archive.label });
    }
  }));
  return entries;
}

export function filterDormitoryEventsByRange(dormitory: Dormitory, range: DormitoryPeriodRange): DormitoryEventEntry[] {
  return listDormitoryEvents(dormitory)
    .filter(({ event }) => event.date >= range.start && event.date <= range.end)
    .sort((a, b) => b.event.date.localeCompare(a.event.date) || b.event.createdAt.localeCompare(a.event.createdAt));
}

export function calculateDormitoryPeriodScore(dormitory: Dormitory, range: DormitoryPeriodRange): number {
  return filterDormitoryEventsByRange(dormitory, range).reduce((sum, entry) => sum + entry.event.score, 0);
}
