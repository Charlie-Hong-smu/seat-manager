import { useRef } from "react";
import type { AttendanceRecord } from "../state/types";
import { useRegistrationUndo } from "./useRegistrationUndo";

export function useAttendanceUndo(records: AttendanceRecord[], onChange: (records: AttendanceRecord[]) => void, date: string) {
  const latest = useRef(records);
  latest.current = records;
  const entries = (values: AttendanceRecord[]) => Object.fromEntries(values.filter(item => item.date === date).map(item => [item.studentId, item]));
  const history = useRegistrationUndo({ scope: `attendance:${date}`, entries: entries(records), onRestore: values => {
    const next = latest.current.filter(item => item.date !== date || !Object.prototype.hasOwnProperty.call(values, item.studentId));
    next.push(...Object.values(values).filter((item): item is AttendanceRecord => Boolean(item)));
    latest.current = next;
    onChange(next);
  } });
  return { ...history, commit: (next: AttendanceRecord[], action?: string, undoActivity?: void | (() => void)) => {
    const undo = history.record(entries(next), action, undoActivity);
    latest.current = next;
    onChange(next);
    return undo;
  } };
}
