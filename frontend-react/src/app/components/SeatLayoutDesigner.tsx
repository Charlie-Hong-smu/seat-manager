import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Plus, RotateCcw, Save, Trash2, UsersRound } from "lucide-react";

import {
  createDefaultSeatLayout,
  createGridSeatLayout,
  createGroupedSeatLayout,
  createRoundTableSeatLayout,
  MAX_LAYOUT_SEATS,
  resolveSeatLayout,
} from "../state/seatLayout";
import type { SeatFrontEdge, SeatLayoutV1, SeatLayoutTemplate } from "../state/types";
import { Button, SelectMenu } from "./ui";

interface Props {
  current?: SeatLayoutV1;
  seatCount: number;
  onApply: (layout: SeatLayoutV1) => void;
}

function cloneLayout(layout: SeatLayoutV1): SeatLayoutV1 {
  return { ...layout, canvas: { ...layout.canvas }, seats: layout.seats.map(seat => ({ ...seat })), groups: layout.groups.map(group => ({ ...group, seatIds: [...group.seatIds] })), neighborEdges: layout.neighborEdges.map(edge => ({ ...edge })) };
}

export function SeatLayoutDesigner({ current, seatCount, onApply }: Props) {
  const [draft, setDraft] = useState(() => cloneLayout(resolveSeatLayout(current, seatCount)));
  const [template, setTemplate] = useState<SeatLayoutTemplate>(current?.template || "default-grid");
  const [rows, setRows] = useState(Math.max(1, Math.ceil(Math.max(1, seatCount) / 8)));
  const [columns, setColumns] = useState(8);
  const [deskSize, setDeskSize] = useState(2);
  const [groupCount, setGroupCount] = useState(4);
  const [groupRows, setGroupRows] = useState(3);
  const [groupColumns, setGroupColumns] = useState(2);
  const [tables, setTables] = useState(6);
  const [seatsPerTable, setSeatsPerTable] = useState(6);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDraft(cloneLayout(resolveSeatLayout(current, seatCount))); setTemplate(current?.template || "default-grid"); setSelected(new Set()); }, [current, seatCount]);

  const requestedCount = template === "grid" ? rows * columns : template === "group-grid" ? groupCount * groupRows * groupColumns : template === "round-table" ? tables * seatsPerTable : draft.seats.length;
  const invalidCount = requestedCount > MAX_LAYOUT_SEATS;
  const selectedSeats = useMemo(() => draft.seats.filter(seat => selected.has(seat.id)), [draft.seats, selected]);

  function generate() {
    if (invalidCount) return;
    const frontEdge = draft.frontEdge;
    const next = template === "default-grid"
      ? createDefaultSeatLayout(Math.max(seatCount, 1))
      : template === "grid"
        ? createGridSeatLayout({ rows, columns, deskSize, frontEdge })
        : template === "group-grid"
          ? createGroupedSeatLayout({ groupCount, groupRows, groupColumns, frontEdge })
          : template === "round-table"
            ? createRoundTableSeatLayout({ tables, seatsPerTable, frontEdge })
            : { ...draft, template: "freeform" as const };
    setDraft(next); setSelected(new Set());
  }

  function beginMove(event: React.PointerEvent<HTMLButtonElement>, seatId: string) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (pointerEvent: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(draft.canvas.width, (pointerEvent.clientX - rect.left) / rect.width * draft.canvas.width));
      const y = Math.max(0, Math.min(draft.canvas.height, (pointerEvent.clientY - rect.top) / rect.height * draft.canvas.height));
      setDraft(currentDraft => ({ ...currentDraft, template: "freeform", seats: currentDraft.seats.map(seat => seat.id === seatId ? { ...seat, x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 } : seat) }));
    };
    const stop = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", stop);
  }

  function toggleSeat(seatId: string, additive: boolean) {
    setSelected(currentSelection => {
      const next = additive ? new Set(currentSelection) : new Set<string>();
      if (next.has(seatId)) next.delete(seatId); else next.add(seatId);
      return next;
    });
  }

  function addSeat() {
    if (draft.seats.length >= MAX_LAYOUT_SEATS) return;
    const id = `seat-custom-${Date.now()}`;
    setDraft(currentDraft => ({ ...currentDraft, template: "freeform", seats: [...currentDraft.seats, { id, x: 500, y: 350, rotation: 0, label: `座位 ${currentDraft.seats.length + 1}` }] }));
    setSelected(new Set([id]));
  }

  function deleteSelected() {
    if (!selected.size) return;
    setDraft(currentDraft => ({ ...currentDraft, template: "freeform", seats: currentDraft.seats.filter(seat => !selected.has(seat.id)), groups: currentDraft.groups.map(group => ({ ...group, seatIds: group.seatIds.filter(id => !selected.has(id)) })).filter(group => group.seatIds.length), neighborEdges: currentDraft.neighborEdges.filter(edge => !selected.has(edge.a) && !selected.has(edge.b)) }));
    setSelected(new Set());
  }

  function groupSelected() {
    if (selected.size < 2) return;
    const id = `group-custom-${Date.now()}`;
    const group = { id, name: `第 ${draft.groups.length + 1} 组`, shape: "custom" as const, seatIds: [...selected] };
    setDraft(currentDraft => ({ ...currentDraft, template: "freeform", seats: currentDraft.seats.map(seat => selected.has(seat.id) ? { ...seat, groupId: id } : seat), groups: [...currentDraft.groups.map(item => ({ ...item, seatIds: item.seatIds.filter(seatId => !selected.has(seatId)) })).filter(item => item.seatIds.length), group] }));
  }

  function ungroupSelected() {
    if (!selected.size) return;
    setDraft(currentDraft => ({ ...currentDraft, template: "freeform", seats: currentDraft.seats.map(seat => selected.has(seat.id) ? { ...seat, groupId: undefined } : seat), groups: currentDraft.groups.map(group => ({ ...group, seatIds: group.seatIds.filter(id => !selected.has(id)) })).filter(group => group.seatIds.length) }));
  }

  function toggleNeighbor() {
    if (selectedSeats.length !== 2) return;
    const [a, b] = selectedSeats.map(seat => seat.id);
    const matches = (edge: { a: string; b: string }) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a);
    setDraft(currentDraft => ({ ...currentDraft, template: "freeform", neighborEdges: currentDraft.neighborEdges.some(matches) ? currentDraft.neighborEdges.filter(edge => !matches(edge)) : [...currentDraft.neighborEdges, { a, b }] }));
  }

  return <div className="space-y-4">
    <section className="rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <SelectMenu value={template} onChange={value => setTemplate(value as SeatLayoutTemplate)} ariaLabel="座位布局模板" options={[{ value: "default-grid", label: "当前默认八列" }, { value: "grid", label: "传统教室网格" }, { value: "group-grid", label: "分组方阵" }, { value: "round-table", label: "围桌布局" }, { value: "freeform", label: "保留并自由编辑" }]} />
        <SelectMenu value={draft.frontEdge} onChange={value => setDraft(currentDraft => ({ ...currentDraft, frontEdge: value as SeatFrontEdge }))} ariaLabel="讲台方向" options={[{ value: "bottom", label: "讲台在下" }, { value: "top", label: "讲台在上" }, { value: "left", label: "讲台在左" }, { value: "right", label: "讲台在右" }]} />
      </div>
      {template === "grid" && <div className="mt-3 grid grid-cols-3 gap-2"><NumberField label="行数" value={rows} min={1} max={20} onChange={setRows}/><NumberField label="列数" value={columns} min={1} max={20} onChange={setColumns}/><NumberField label="每桌人数" value={deskSize} min={1} max={12} onChange={setDeskSize}/></div>}
      {template === "group-grid" && <div className="mt-3 grid grid-cols-3 gap-2"><NumberField label="小组数" value={groupCount} min={1} max={20} onChange={setGroupCount}/><NumberField label="每组行数" value={groupRows} min={1} max={12} onChange={setGroupRows}/><NumberField label="每组列数" value={groupColumns} min={1} max={12} onChange={setGroupColumns}/></div>}
      {template === "round-table" && <div className="mt-3 grid grid-cols-2 gap-2"><NumberField label="桌数" value={tables} min={1} max={20} onChange={setTables}/><NumberField label="每桌人数" value={seatsPerTable} min={2} max={12} onChange={setSeatsPerTable}/></div>}
      {invalidCount && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">当前参数会生成 {requestedCount} 个座位，最多支持 {MAX_LAYOUT_SEATS} 个。</p>}
      <Button className="mt-3 w-full" variant="secondary" disabled={invalidCount} onClick={generate}><RotateCcw className="h-4 w-4"/>生成布局草稿</Button>
    </section>

    <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={addSeat}><Plus className="h-4 w-4"/>增加座位</Button><Button size="sm" variant="ghost" disabled={selected.size < 2} onClick={groupSelected}><UsersRound className="h-4 w-4"/>组成小组</Button><Button size="sm" variant="ghost" disabled={!selected.size} onClick={ungroupSelected}>解除分组</Button><Button size="sm" variant="ghost" disabled={selected.size !== 2} onClick={toggleNeighbor}><Link2 className="h-4 w-4"/>切换邻座</Button><Button size="sm" variant="danger" disabled={!selected.size} onClick={deleteSelected}><Trash2 className="h-4 w-4"/>删除所选</Button></div>

    {selectedSeats.length === 1 && <div className="grid gap-2 rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-[var(--app-surface-muted)] p-3 sm:grid-cols-3"><label className="text-xs font-semibold text-[var(--app-text-muted)]">座位名称<input value={selectedSeats[0].label} onChange={event => setDraft(currentDraft => ({ ...currentDraft, seats: currentDraft.seats.map(seat => seat.id === selectedSeats[0].id ? { ...seat, label: event.target.value } : seat) }))} className="mt-1 h-9 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-2 text-sm"/></label><NumberField label="旋转角度" value={selectedSeats[0].rotation} min={-180} max={180} onChange={value => setDraft(currentDraft => ({ ...currentDraft, template: "freeform", seats: currentDraft.seats.map(seat => seat.id === selectedSeats[0].id ? { ...seat, rotation: value } : seat) }))}/>{selectedSeats[0].groupId && <label className="text-xs font-semibold text-[var(--app-text-muted)]">小组名称<input value={draft.groups.find(group => group.id === selectedSeats[0].groupId)?.name || ""} onChange={event => setDraft(currentDraft => ({ ...currentDraft, groups: currentDraft.groups.map(group => group.id === selectedSeats[0].groupId ? { ...group, name: event.target.value } : group) }))} className="mt-1 h-9 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-2 text-sm"/></label>}</div>}

    <div ref={canvasRef} className="relative min-h-[360px] overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white" style={{ aspectRatio: `${draft.canvas.width}/${draft.canvas.height}` }}>
      <div className={`absolute rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-bold text-blue-600 ${draft.frontEdge === "top" ? "left-1/2 top-1 -translate-x-1/2" : draft.frontEdge === "bottom" ? "bottom-1 left-1/2 -translate-x-1/2" : draft.frontEdge === "left" ? "left-1 top-1/2 -translate-y-1/2 -rotate-90" : "right-1 top-1/2 -translate-y-1/2 rotate-90"}`}>讲台</div>
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">{draft.neighborEdges.map(edge => { const a = draft.seats.find(seat => seat.id === edge.a); const b = draft.seats.find(seat => seat.id === edge.b); return a && b ? <line key={`${edge.a}-${edge.b}`} x1={`${a.x / draft.canvas.width * 100}%`} y1={`${a.y / draft.canvas.height * 100}%`} x2={`${b.x / draft.canvas.width * 100}%`} y2={`${b.y / draft.canvas.height * 100}%`} stroke="var(--app-primary)" strokeOpacity="0.28" strokeWidth="2"/> : null; })}</svg>
      {draft.seats.map(seat => <button key={seat.id} type="button" onPointerDown={event => beginMove(event, seat.id)} onClick={event => toggleSeat(seat.id, event.shiftKey || event.metaKey)} aria-pressed={selected.has(seat.id)} aria-label={`${seat.label}${seat.groupId ? "，已分组" : ""}`} className={`absolute grid h-9 w-14 touch-none place-items-center rounded-lg border text-[10px] font-bold shadow-sm ${selected.has(seat.id) ? "border-blue-500 bg-blue-600 text-white" : "border-gray-200 bg-white text-gray-600"}`} style={{ left: `${seat.x / draft.canvas.width * 100}%`, top: `${seat.y / draft.canvas.height * 100}%`, transform: `translate(-50%, -50%) rotate(${seat.rotation}deg)` }}>{seat.label}</button>)}
    </div>
    <p className="text-xs leading-5 text-[var(--app-text-muted)]">拖动座位可自由调整；按 Shift 或 Command 多选后可组成小组、标记邻座或删除。布局应用后，超出容量的学生进入待排区。</p>
    <Button className="w-full" onClick={() => onApply(cloneLayout(draft))}><Save className="h-4 w-4"/>应用布局</Button>
  </div>;
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="text-xs font-semibold text-[var(--app-text-muted)]">{label}<input type="number" value={value} min={min} max={max} onChange={event => onChange(Math.max(min, Math.min(max, Number(event.target.value) || min)))} className="mt-1 h-9 w-full rounded-[var(--app-radius-sm)] border border-[var(--app-border)] bg-white px-2 text-sm text-[var(--app-text)] outline-none focus:border-blue-400"/></label>;
}
