import { useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { leavePeriodError } from "../state/attendancePeriods";
import type { AttendanceRecord } from "../state/types";
import { Button, DatePicker, InlineStatus } from "./ui";
import { useState } from "react";

function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [date = "", time = ""] = value.split("T");
  return <fieldset className="grid grid-cols-[minmax(0,1fr)_7rem] gap-2"><legend className="mb-1 text-caption-1-regular text-text-secondary">{label}</legend><DatePicker required value={date} onChange={next => onChange(`${next}T${time || "08:00"}`)} ariaLabel={`${label}日期`}/><input type="time" aria-label={`${label}时间`} value={time} onChange={event => onChange(`${date}T${event.target.value}`)} className="h-10 rounded-xl border border-border-button-default bg-background-primary-default px-2 text-caption-1-regular"/></fieldset>;
}
export function LeavePeriodEditor({ studentId, date, source, onSave, onReturn }: { studentId: string; date: string; source?: AttendanceRecord; onSave: (start: string, end: string) => void; onReturn: () => void }) {
  const key = `attendance:period:${studentId}:${source?.id || date}`;
  const [start, setStart] = useWorkspaceDraftState(`${key}:start`, source?.leaveStart || `${date}T08:00`);
  const [end, setEnd] = useWorkspaceDraftState(`${key}:end`, source?.leaveEnd || `${date}T18:00`);
  const [error, setError] = useState("");
  return <div className="space-y-3 sm:col-span-3"><div className="grid gap-2 sm:grid-cols-2"><DateTimeField label="请假开始" value={start} onChange={setStart}/><DateTimeField label="预计返校" value={end} onChange={setEnd}/></div><div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => { const message = !start || !end ? "请填写请假开始与预计返校时间。" : leavePeriodError(start, end); setError(message); if (!message) onSave(start, end); }}>保存请假时段</Button>{source?.status === "leave" && !source.leaveReturnedAt && <Button size="sm" variant="secondary" onClick={onReturn}>确认 {date} 已返校</Button>}</div><p className="text-caption-1-regular text-text-secondary">保存时段后会跨日显示请假；预计返校后仍需确认。返校请使用确认返校操作。</p>{error && <InlineStatus message={error}/>}</div>;
}
