import type { AttendanceStatus } from "../state/types";
import { Button, SegmentedControl } from "./ui";

export function AttendanceStatusControl({ value, late, earlyLeave, onChange, compact: _compact = false }: { value: AttendanceStatus; late: boolean; earlyLeave: boolean; onChange: (patch: { status?: AttendanceStatus; late?: boolean; earlyLeave?: boolean }) => void; compact?: boolean }) {
  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label="出勤状态">
    <SegmentedControl value={value} ariaLabel="主要出勤状态" onChange={status => onChange({ status })} options={[{ value: "normal", label: "正常" }, { value: "leave", label: "请假" }, { value: "absent", label: "缺勤" }]} />
    <Button size="sm" variant={late ? "primary" : "secondary"} aria-pressed={late} onClick={() => onChange({ late: !late })}>迟到</Button>
    <Button size="sm" variant={earlyLeave ? "primary" : "secondary"} aria-pressed={earlyLeave} onClick={() => onChange({ earlyLeave: !earlyLeave })}>早退</Button>
  </div>;
}
