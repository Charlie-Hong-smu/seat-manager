import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pencil, Ungroup } from "lucide-react";
import { getSeatGroupOutlinePath, type GridCell, type SeatGroupEdge } from "../state/seatLayoutGrid";
import type { SeatLayoutGroup } from "../state/types";

interface Props {
  groups: SeatLayoutGroup[];
  cells: Map<string, GridCell>;
  columns: number;
  rows: number;
  hovered?: string | null;
  onHover?: (id: string | null) => void;
  onUngroup?: (id: string) => void;
  onRename?: (id: string) => void;
  podium?: GridCell;
  resizable?: boolean;
  onResizeStart?: (id: string, edge: SeatGroupEdge, event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizeNudge?: (id: string, edge: SeatGroupEdge, delta: number) => void;
  collisions?: Set<string>;
}

export function SeatGroupOverlay({ groups, cells, columns, rows, hovered, onHover, onUngroup, onRename, podium, resizable, onResizeStart, onResizeNudge, collisions }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState({ width: 100, height: 40 });
  useLayoutEffect(() => {
    const element = overlayRef.current;
    if (!element) return;
    const measure = () => { const rect = element.getBoundingClientRect(); if (rect.width && rect.height) setCellSize({ width: rect.width / columns, height: rect.height / rows }); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [columns, rows]);
  const outlines = useMemo(() => groups.map(group => {
    const members = group.seatIds.flatMap(id => cells.get(id) ? [cells.get(id)!] : []);
    return { group, members, count: members.length,
      left: Math.min(...members.map(cell => cell.column)), right: Math.max(...members.map(cell => cell.column)),
      top: Math.min(...members.map(cell => cell.row)), bottom: Math.max(...members.map(cell => cell.row)),
    };
  }).filter(item => item.count).sort((a, b) => a.top - b.top || a.left - b.left), [groups, cells]);
  return <div ref={overlayRef} className="seat-groups-overlay" aria-label="座位分组">
    {outlines.map(({ group, members, left, right, top, bottom }) => {
      const name = group.name;
      const localPodium = podium && podium.column >= left && podium.column <= right && podium.row >= top && podium.row <= bottom ? { column: podium.column - left, row: podium.row - top } : undefined;
      const width = right - left + 1, height = bottom - top + 1;
      const contour = group.outline === "seats" || Boolean(localPodium);
      const localMembers = group.outline === "seats" ? members.map(cell => ({ column: cell.column - left, row: cell.row - top })) : undefined;
      const occupied = localMembers ? new Set(localMembers.map(cell => `${cell.column}:${cell.row}`)) : undefined;
      const hasCell = (column: number, row: number) => (!occupied || occupied.has(`${column}:${row}`)) && !(localPodium?.column === column && localPodium.row === row);
      const anchorColumn = Array.from({ length: width }, (_, column) => column).find(column => hasCell(column, 0)) || 0;
      const handles = (["top", "right", "bottom", "left"] as const).flatMap(edge => {
        const horizontal = edge === "top" || edge === "bottom";
        const count = horizontal ? width : height;
        const spans: Array<{ edge: SeatGroupEdge; start: number; end: number }> = [];
        for (let index = 0; index < count; index++) {
          if (!hasCell(horizontal ? index : edge === "left" ? 0 : width - 1, horizontal ? edge === "top" ? 0 : height - 1 : index)) continue;
          if (spans[spans.length - 1]?.end === index) spans[spans.length - 1].end = index + 1;
          else spans.push({ edge, start: index, end: index + 1 });
        }
        return spans.map(span => ({ ...span, horizontal, count }));
      });
      const onKeyDown = (edge: SeatGroupEdge) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
        const delta = edge === "left" || edge === "right" ? event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0 : event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (delta) { event.preventDefault(); onResizeNudge?.(group.id, edge, delta); }
      };
      return <div key={group.id} data-seat-layout-group-boundary={group.id} data-collision={collisions?.has(group.id) ? "true" : undefined} data-highlighted={hovered === group.id ? "true" : "false"} data-podium-cutout={localPodium ? "true" : undefined} data-contour={contour ? "true" : undefined} className="seat-group-shape" style={{
        left: `calc(${left / columns * 100}% + ${contour ? 0 : 2}px)`, top: `calc(${top / rows * 100}% + ${contour ? 0 : 2}px)`,
        width: `calc(${width / columns * 100}% - ${contour ? 0 : 4}px)`, height: `calc(${height / rows * 100}% - ${contour ? 0 : 4}px)`,
      }}>
        {contour && <svg className="seat-group-shape__outline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={getSeatGroupOutlinePath(width, height, localPodium, localMembers, { x: 2 / cellSize.width, y: 2 / cellSize.height })} vectorEffect="non-scaling-stroke" /></svg>}
        <div className="seat-group-label" style={contour ? { left: `calc(${anchorColumn / width * 100}% + 4px)`, top: 2 } : undefined} data-highlighted={hovered === group.id ? "true" : "false"} data-align-end={right === columns - 1 && left === right ? "true" : undefined} onPointerEnter={() => onHover?.(group.id)} onPointerLeave={() => onHover?.(null)} onFocus={() => onHover?.(group.id)} onBlur={() => onHover?.(null)} onMouseDown={event => event.stopPropagation()} onMouseUp={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
          <span className="seat-group-label__name" title={name}>{name}</span>
          {onRename && <button type="button" aria-label={`编辑${name}组名`} title="编辑组名" onClick={() => onRename(group.id)}><Pencil className="h-3 w-3" /><span>编辑</span></button>}
          {onUngroup && <button type="button" aria-label={`解除${name}小组`} title="解除小组" onClick={() => onUngroup(group.id)}><Ungroup className="h-3 w-3" /><span>解除小组</span></button>}
        </div>
        {resizable && handles.map(({ edge, start, end, horizontal, count }) => <button key={`${edge}-${start}`} type="button" data-seat-group-resize={edge} aria-label={`调整${name}${edge === "top" ? "上" : edge === "right" ? "右" : edge === "bottom" ? "下" : "左"}边缘`} title="拖动调整小组范围；方向键可微调" className={`seat-group-resize-handle seat-group-resize-handle--${edge}`} style={horizontal ? { left: `calc(${start / count * 100}% + 5px)`, right: `calc(${(count - end) / count * 100}% + 5px)` } : { top: `calc(${start / count * 100}% + 5px)`, bottom: `calc(${(count - end) / count * 100}% + 5px)` }} onPointerDown={event => { event.preventDefault(); event.stopPropagation(); onResizeStart?.(group.id, edge, event); }} onKeyDown={onKeyDown(edge)} />)}
      </div>;
    })}
  </div>;
}
