import { isValidDateKey, toLocalDateKey } from "./dateKey";
import type { AttendanceRecord } from "./types";

function validTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && isValidDateKey(value.slice(0, 10)) && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.slice(11));
}
export function leavePeriodError(start?: string, end?: string): string {
  if (start && !validTime(start) || end && !validTime(end)) return "请填写有效的请假日期和时间。";
  if (start && end && end < start) return "请假结束时间不能早于开始时间。";
  return "";
}
export function leaveCoversDate(record: AttendanceRecord, date: string): boolean {
  if (record.status !== "leave" || leavePeriodError(record.leaveStart, record.leaveEnd)) return false;
  const start = record.leaveStart?.slice(0, 10) || record.date;
  if (date < start || record.leaveReturnedAt && date >= record.leaveReturnedAt.slice(0, 10)) return false;
  return record.leaveTracking === true && Boolean(record.leaveEnd) || date <= (record.leaveEnd?.slice(0, 10) || record.date);
}

/** Explicit daily records override inherited leave; old leave ranges retain their original end date. */
export function getAttendanceForDate(records: AttendanceRecord[], date: string): AttendanceRecord[] {
  if (!isValidDateKey(date)) return [];
  const result = new Map<string, AttendanceRecord>();
  [...records].sort((a, b) => (a.leaveStart || a.date).localeCompare(b.leaveStart || b.date)).forEach(record => {
    if (leaveCoversDate(record, date)) result.set(record.studentId, { ...record, date });
  });
  records.filter(record => record.date === date).forEach(record => {
    if (record.status !== "leave" || leaveCoversDate(record, date)) result.set(record.studentId, record);
  });
  return [...result.values()];
}
export function getAttendanceRange(records: AttendanceRecord[], from: string, to: string): AttendanceRecord[] {
  if (!isValidDateKey(from) || !isValidDateKey(to)) return [];
  const [start, end] = from <= to ? [from, to] : [to, from];
  const days: AttendanceRecord[] = [];
  const cursor = new Date(`${start}T12:00:00`);
  for (let date = start; date <= end; cursor.setDate(cursor.getDate() + 1), date = toLocalDateKey(cursor)) days.push(...getAttendanceForDate(records, date));
  return days;
}
export function isAwaitingReturn(record: AttendanceRecord, date: string): boolean {
  return record.leaveTracking === true && !record.leaveReturnedAt && Boolean(record.leaveEnd && date >= record.leaveEnd.slice(0, 10));
}
export function confirmLeaveReturn(records: AttendanceRecord[], id: string, date: string): AttendanceRecord[] {
  const source = records.find(item => item.id === id);
  if (!source || source.status !== "leave" || !isValidDateKey(date) || date < (source.leaveStart?.slice(0, 10) || source.date)) return records;
  return records.map(item => item.id === id ? { ...item, leaveReturnedAt: `${date}T00:00`, updatedAt: new Date().toISOString() } : item);
}
