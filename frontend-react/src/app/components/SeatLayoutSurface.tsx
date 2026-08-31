import { type ReactNode, useMemo, useState } from "react";
import { getSeatGridCells, prepareSeatLayoutGrid } from "../state/seatLayoutGrid";
import { getSeatLayoutStageMinWidth } from "../state/seatLayout";
import type { SeatLayoutNode, SeatLayoutV1 } from "../state/types";
import { SeatGroupOverlay } from "./SeatGroupOverlay";

/** Same responsive geometry for the live board, shuffle preview and history. */
export function SeatLayoutSurface({ layout: source, detail = false, renderSeat }: {
  layout: SeatLayoutV1;
  detail?: boolean;
  renderSeat: (seat: SeatLayoutNode, index: number) => ReactNode;
}) {
  const layout = useMemo(() => prepareSeatLayoutGrid(source), [source]);
  const grid = useMemo(() => getSeatGridCells(layout), [layout]);
  const [hovered, setHovered] = useState<string | null>(null);
  // Old hand-positioned / round-table layouts keep their physical geometry until explicitly edited.
  if (!source.slotGridVersion && !["default-grid", "grid"].includes(source.template)) {
    return <div className="relative mx-auto" data-seat-layout-surface style={{ minWidth: getSeatLayoutStageMinWidth(source), aspectRatio: `${source.canvas.width}/${source.canvas.height}` }}>
      {source.groups.filter(group => group.shape === "round").map(group => {
        const members = source.seats.filter(seat => group.seatIds.includes(seat.id));
        const x = members.reduce((sum, seat) => sum + seat.x, 0) / Math.max(1, members.length);
        const y = members.reduce((sum, seat) => sum + seat.y, 0) / Math.max(1, members.length);
        return <div key={group.id} className="pointer-events-none absolute grid h-20 w-28 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[50%] border border-amber-200 bg-amber-50 text-xs text-amber-700" style={{ left: `${x / source.canvas.width * 100}%`, top: `${y / source.canvas.height * 100}%` }}>{group.name}</div>;
      })}
      {source.seats.map((seat, index) => <div key={seat.id} data-seat-layout-node={seat.id} className="absolute h-[68px] w-[104px] -translate-x-1/2 -translate-y-1/2" style={{ left: `${seat.x / source.canvas.width * 100}%`, top: `${seat.y / source.canvas.height * 100}%` }}>{renderSeat(seat, index)}</div>)}
      {source.podium ? <div data-seat-layout-podium className="seat-layout-surface__podium absolute h-10 w-24 -translate-x-1/2 -translate-y-1/2" style={{ left: `${source.podium.x / source.canvas.width * 100}%`, top: `${source.podium.y / source.canvas.height * 100}%` }}>讲台</div> : <div className={`seat-layout-surface__podium absolute ${source.frontEdge === "top" ? "inset-x-4 top-1" : source.frontEdge === "bottom" ? "inset-x-4 bottom-1" : source.frontEdge === "left" ? "left-1 top-1/2" : "right-1 top-1/2"}`}>讲台</div>}
    </div>;
  }
  const occupied = [...grid.seats.values(), ...(grid.podium ? [grid.podium] : [])].filter(Boolean);
  const columns = Math.max(8, ...occupied.map(cell => cell.column + 1));
  const rows = Math.max(1, ...occupied.map(cell => cell.row + 1));
  return <div className="seat-layout-surface" data-seat-layout-surface data-detail={detail ? "true" : "false"} style={{ minWidth: `${columns * 76}px` }}>
    {!layout.podium && layout.frontEdge === "top" && <div className="seat-layout-surface__podium">讲台</div>}
    <div className="seat-layout-surface__grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, minmax(${detail ? 78 : 40}px, 1fr))`, minHeight: rows * (detail ? 78 : 40), maxHeight: rows * (detail ? 94 : 58) }} onPointerLeave={() => setHovered(null)}>
      <SeatGroupOverlay groups={layout.groups} cells={grid.seats} podium={grid.podium} columns={columns} rows={rows} hovered={hovered} onHover={setHovered} />
      {layout.seats.map((seat, index) => {
        const cell = grid.seats.get(seat.id);
        return cell && <div key={seat.id} data-seat-layout-node={seat.id} data-seat-grid-cell={cell.key} data-seat-group={seat.groupId} className="seat-layout-surface__seat" style={{ gridColumn: cell.column + 1, gridRow: cell.row + 1 }} onPointerEnter={() => setHovered(seat.groupId || null)}>{renderSeat(seat, index)}</div>;
      })}
      {grid.podium && <div data-seat-layout-podium className="seat-layout-surface__podium seat-layout-surface__seat" style={{ gridColumn: grid.podium.column + 1, gridRow: grid.podium.row + 1 }}>讲台</div>}
    </div>
    {!layout.podium && layout.frontEdge !== "top" && <div className="seat-layout-surface__podium">{layout.frontEdge === "left" ? "← 讲台" : layout.frontEdge === "right" ? "讲台 →" : "讲台"}</div>}
  </div>;
}
