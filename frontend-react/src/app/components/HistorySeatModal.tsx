import { useState } from "react";
import { CalendarClock, Check, RotateCcw, Save, Trash2, X } from "lucide-react";
import type { SeatHistorySnapshot } from "../state/types";
import { Button, ConfirmDialog, IconButton } from "./ui";

interface Props {
  snapshot: SeatHistorySnapshot;
  onClose: () => void;
  onSaveNote: (id: string, note: string) => boolean;
  onApply: (snapshot: SeatHistorySnapshot) => void;
  onDelete: (id: string) => boolean;
}

const COLS = 8;

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "未记录时间" : date.toLocaleString("zh-CN", { hour12: false });
}

export function HistorySeatModal({ snapshot, onClose, onSaveNote, onApply, onDelete }: Props) {
  const [note, setNote] = useState(snapshot.note);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saveResult, setSaveResult] = useState<"idle" | "saved" | "failed">("idle");
  const [deleteError, setDeleteError] = useState("");
  const rows = Math.max(1, snapshot.rows || Math.ceil(snapshot.seats.length / COLS));
  const displayRows = Array.from({ length: rows }, (_, displayRow) => rows - 1 - displayRow);
  const occupied = snapshot.seats.filter(Boolean).length;

  return (
    <div className="soft-backdrop-enter fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/35 p-4 pt-10 backdrop-blur-sm">
      <div className="modal-panel-enter mb-8 w-full max-w-5xl overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1" style={{ fontWeight: 700 }}>
              <CalendarClock className="w-3.5 h-3.5" />历史座位详情
            </div>
            <h3 className="text-gray-900" style={{ fontSize: "1.25rem", fontWeight: 800 }}>
              {formatTime(snapshot.time)}
            </h3>
            <p className="text-xs text-gray-400 mt-1">{occupied} 人 · {snapshot.layout ? `${snapshot.layout.groups.length} 个小组 · 自定义布局` : `${rows} 排 · 最下方为讲台`}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onApply(snapshot)}><RotateCcw className="h-3.5 w-3.5" />应用</Button>
            <Button variant="ghost" size="sm" onClick={() => { setDeleteError(""); setConfirmDelete(true); }} className="border-red-200 text-red-500 hover:border-red-200 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />删除</Button>
            <IconButton label="关闭历史座位详情" size="sm" onClick={onClose}><X className="h-4 w-4" /></IconButton>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <input
              value={note}
              onChange={event => { setNote(event.target.value); setSaveResult("idle"); }}
              placeholder="给这份历史座位添加备注"
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300"
            />
            <Button onClick={() => setSaveResult(onSaveNote(snapshot.id, note) ? "saved" : "failed")} className={saveResult === "saved" ? "bg-emerald-600 hover:bg-emerald-700" : ""}>{saveResult === "saved" ? <Check className="h-4 w-4"/> : <Save className="h-4 w-4"/>}{saveResult === "saved" ? "已保存" : "保存备注"}</Button>
          </div>
          <div aria-live="polite" className="-mt-3 min-h-5 text-xs">{saveResult === "saved" && <span className="font-semibold text-emerald-600">备注已保存到本机。</span>}{saveResult === "failed" && <span role="alert" className="font-semibold text-red-600">保存失败，请检查本机存储空间后重试。</span>}</div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 overflow-x-auto">
            {snapshot.layout ? <div className="relative min-h-[520px] min-w-[760px]" style={{ aspectRatio: `${snapshot.layout.canvas.width}/${snapshot.layout.canvas.height}` }}>{snapshot.layout.seats.map((seat, index) => { const name = snapshot.seats[index] || ""; return <div key={seat.id} className={`absolute grid h-12 w-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border text-sm font-bold ${name ? "border-gray-200 bg-white text-gray-800" : "border-dashed border-gray-200 bg-gray-100 text-gray-300"}`} style={{ left: `${seat.x / snapshot.layout!.canvas.width * 100}%`, top: `${seat.y / snapshot.layout!.canvas.height * 100}%` }}>{name || "空"}<span className="absolute -bottom-4 text-[10px] font-medium text-gray-400">{seat.label}</span></div>; })}</div> :
            <div className="min-w-[820px] space-y-2">
              <div className="grid grid-cols-[3rem_repeat(8,minmax(4.5rem,1fr))] gap-2">
                <div />
                {Array.from({ length: COLS }, (_, index) => (
                  <div key={index} className="text-center text-xs text-gray-400" style={{ fontWeight: 700 }}>第{index + 1}列</div>
                ))}
              </div>

              {displayRows.map(rowIndex => (
                <div key={rowIndex} className="grid grid-cols-[3rem_repeat(8,minmax(4.5rem,1fr))] gap-2 items-center">
                  <div className="text-xs text-gray-400 text-center" style={{ fontWeight: 700 }}>第{rowIndex + 1}排</div>
                  {Array.from({ length: COLS }, (_, colIndex) => {
                    const seatIndex = rowIndex * COLS + colIndex;
                    const name = snapshot.seats[seatIndex] || "";
                    return (
                      <div
                        key={seatIndex}
                        className={`h-12 rounded-xl border flex items-center justify-center text-sm ${name ? "bg-white border-gray-200 text-gray-800" : "bg-gray-100 border-dashed border-gray-200 text-gray-300"}`}
                        style={{ fontWeight: name ? 700 : 500 }}
                      >
                        {name || "空"}
                      </div>
                    );
                  })}
                </div>
              ))}

              <div className="pt-3 text-center text-xs text-gray-400 border-t border-gray-200">讲台</div>
            </div>}
          </div>
        </div>
      </div>
      <ConfirmDialog open={confirmDelete} title="删除这份座位快照？" description={`“${snapshot.note || formatTime(snapshot.time)}”删除后无法恢复，当前座位不会受到影响。`} confirmLabel="确认删除" error={deleteError} onCancel={() => { setConfirmDelete(false); setDeleteError(""); }} onConfirm={() => { if (!onDelete(snapshot.id)) setDeleteError("删除失败，请检查本机存储空间后重试。"); }} />
    </div>
  );
}
