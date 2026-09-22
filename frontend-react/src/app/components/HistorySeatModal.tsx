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
    <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-10">
      <div className="modal-panel-enter app-modal-panel mb-8 w-full max-w-5xl overflow-hidden">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-separator-border">
          <div>
            <div className="flex items-center gap-2 text-caption-1-regular text-text-tertiary mb-1" style={{ fontWeight: 700 }}>
              <CalendarClock className="w-3.5 h-3.5" />历史座位详情
            </div>
            <h3 className="text-text-primary" style={{ fontSize: "1.25rem", fontWeight: 800 }}>
              {formatTime(snapshot.time)}
            </h3>
            <p className="text-caption-1-regular text-text-tertiary mt-1">{occupied} 人 · {snapshot.layout ? `${snapshot.layout.groups.length} 个小组 · 自定义布局` : `${rows} 排 · 最下方为讲台`}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onApply(snapshot)}><RotateCcw className="h-3.5 w-3.5" />应用</Button>
            <Button variant="ghost" size="sm" onClick={() => { setDeleteError(""); setConfirmDelete(true); }} className="border-status-danger-200 text-status-danger-500 hover:border-status-danger-200 hover:bg-status-danger-50"><Trash2 className="h-3.5 w-3.5" />删除</Button>
            <IconButton label="关闭历史座位详情" size="sm" onClick={onClose}><X className="h-4 w-4" /></IconButton>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <input
              value={note}
              onChange={event => { setNote(event.target.value); setSaveResult("idle"); }}
              placeholder="给这份历史座位添加备注"
              className="w-full px-3.5 py-2.5 text-body-regular bg-background-secondary-default border border-border-button-default rounded-xl outline-none focus:border-accent-300"
            />
            <Button onClick={() => setSaveResult(onSaveNote(snapshot.id, note) ? "saved" : "failed")} className={saveResult === "saved" ? "bg-status-success-600 hover:bg-status-success-700" : ""}>{saveResult === "saved" ? <Check className="h-4 w-4"/> : <Save className="h-4 w-4"/>}{saveResult === "saved" ? "已保存" : "保存备注"}</Button>
          </div>
          <div aria-live="polite" className="-mt-3 min-h-5 text-caption-1-regular">{saveResult === "saved" && <span className="font-semibold text-status-success-600">备注已保存到本机。</span>}{saveResult === "failed" && <span role="alert" className="font-semibold text-status-danger-600">保存失败，请检查本机存储空间后重试。</span>}</div>

          <div className="rounded-2xl border border-separator-border bg-background-secondary-default p-4 overflow-x-auto">
{snapshot.layout ? <SeatLayoutSurface layout={snapshot.layout} renderSeat={(seat, index) => { const name = snapshot.seats[index] || ""; return <div className={`grid h-full place-items-center rounded-xl border text-body-semibold ${name ? "border-border-button-default bg-background-primary-default text-text-primary" : "border-dashed border-border-button-default bg-background-tertiary-default text-text-tertiary"}`} title={seat.label}>{name || "空"}</div>; }} /> :
            <div className="min-w-[820px] space-y-2">
              <div className="grid grid-cols-[3rem_repeat(8,minmax(4.5rem,1fr))] gap-2">
                <div />
                {Array.from({ length: COLS }, (_, index) => (
                  <div key={index} className="text-center text-caption-1-regular text-text-tertiary" style={{ fontWeight: 700 }}>第{index + 1}列</div>
                ))}
              </div>

              {displayRows.map(rowIndex => (
                <div key={rowIndex} className="grid grid-cols-[3rem_repeat(8,minmax(4.5rem,1fr))] gap-2 items-center">
                  <div className="text-caption-1-regular text-text-tertiary text-center" style={{ fontWeight: 700 }}>第{rowIndex + 1}排</div>
                  {Array.from({ length: COLS }, (_, colIndex) => {
                    const seatIndex = rowIndex * COLS + colIndex;
                    const name = snapshot.seats[seatIndex] || "";
                    return (
                      <div
                        key={seatIndex}
                        className={`h-12 rounded-xl border flex items-center justify-center text-body-regular ${name ? "bg-background-primary-default border-border-button-default text-text-primary" : "bg-background-tertiary-default border-dashed border-border-button-default text-text-tertiary"}`}
                        style={{ fontWeight: name ? 700 : 500 }}
                      >
                        {name || "空"}
                      </div>
                    );
                  })}
                </div>
              ))}

              <div className="pt-3 text-center text-caption-1-regular text-text-tertiary border-t border-border-button-default">讲台</div>
            </div>}
          </div>
        </div>
      </div>
      <ConfirmDialog open={confirmDelete} title="删除这份座位快照？" description={`“${snapshot.note || formatTime(snapshot.time)}”删除后无法恢复，当前座位不会受到影响。`} confirmLabel="确认删除" error={deleteError} onCancel={() => { setConfirmDelete(false); setDeleteError(""); }} onConfirm={() => { if (!onDelete(snapshot.id)) setDeleteError("删除失败，请检查本机存储空间后重试。"); }} />
    </div>
  );
}
import { SeatLayoutSurface } from "./SeatLayoutSurface";
