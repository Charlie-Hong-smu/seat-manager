import { Minus, Plus } from "lucide-react";
import { MAX_SEAT_GRID_COLUMNS, MAX_SEAT_GRID_ROWS, type SeatGridAxis } from "../state/seatLayoutGrid";
import { IconButton } from "./ui";

export interface SeatGridAxisTarget { axis: SeatGridAxis; index: number }

export function SeatGridAxisControls({ rows, columns, disabled, onChange, onTarget }: {
  rows: number;
  columns: number;
  disabled: boolean;
  onChange: (axis: SeatGridAxis, index: number, action: "insert" | "delete") => void;
  onTarget: (target: SeatGridAxisTarget | null) => void;
}) {
  return <>{(["column", "row"] as const).map(axis => {
    const count = axis === "row" ? rows : columns;
    const limit = axis === "row" ? MAX_SEAT_GRID_ROWS : MAX_SEAT_GRID_COLUMNS;
    const word = axis === "row" ? "行" : "列";
    const position = (value: number) => axis === "row" ? { top: `${value / count * 100}%` } : { left: `${value / count * 100}%` };
    return <div key={axis} className={`seat-grid-axis seat-grid-axis--${axis}`} aria-label={`${word}操作`} onMouseDown={event => event.stopPropagation()} onMouseUp={event => event.stopPropagation()}>
      {Array.from({ length: count + 1 }, (_, index) => <span key={`insert-${index}`} className="seat-grid-axis__action" style={position(index)}>
        <IconButton size="xs" tone="success" label={index === count ? `在第 ${count} ${word}后新增一${word}` : `在第 ${index + 1} ${word}前新增一${word}`} disabled={disabled || count >= limit} onClick={() => onChange(axis, index, "insert")}><Plus className="h-3 w-3" /></IconButton>
      </span>)}
      {Array.from({ length: count }, (_, index) => <span key={`delete-${index}`} className="seat-grid-axis__action" style={position(index + 0.5)}>
        <IconButton size="xs" tone="danger" label={`删除第 ${index + 1} ${word}`} disabled={disabled || count <= 1} onPointerEnter={() => onTarget({ axis, index })} onPointerLeave={() => onTarget(null)} onFocus={() => onTarget({ axis, index })} onBlur={() => onTarget(null)} onClick={() => onChange(axis, index, "delete")}><Minus className="h-3 w-3" /></IconButton>
      </span>)}
    </div>;
  })}</>;
}
