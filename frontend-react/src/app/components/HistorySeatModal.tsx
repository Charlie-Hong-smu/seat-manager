import { useId, useState } from "react";
import { CalendarClock, Check, RotateCcw, Save, Trash2 } from "lucide-react";
import type { SeatHistorySnapshot } from "../state/types";
import { Button, ConfirmDialog, Input, ModalHeader, useModalFocus } from "./ui";

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
  const titleId = useId();
  const panelRef = useModalFocus(true, onClose);

  return (
    <div className="soft-backdrop-enter app-modal-overlay fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-10">
      <div ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} className="modal-panel-enter app-modal-panel mb-8 w-full max-w-5xl overflow-hidden outline-none">
        <ModalHeader icon={<CalendarClock className="h-4 w-4" />} eyebrow="历史座位详情" title={formatTime(snapshot.time)} titleId={titleId}
          description={`${occupied} 人 · ${snapshot.layout ? `${snapshot.layout.groups.length} 个小组 · 自定义布局` : `${rows} 排 · 最下方为讲台`}`}
          closeLabel="关闭历史座位详情" onClose={onClose}
          actions={<>
            <Button variant="quiet" size="sm" onClick={() => { setDeleteError(""); setConfirmDelete(true); }} className="text-status-danger-600 hover:bg-status-danger-50 hover:text-status-danger-700"><Trash2 className="h-3.5 w-3.5" />删除</Button>
            <Button variant="secondary" size="sm" onClick={() => onApply(snapshot)}><RotateCcw className="h-3.5 w-3.5" />应用</Button>
            <span className="mx-1 h-5 w-px bg-separator-border" aria-hidden="true" />
          </>} />

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <Input value={note} onChange={value => { setNote(value); setSaveResult("idle"); }} placeholder="给这份历史座位添加备注" />
            <Button variant="secondary" onClick={() => setSaveResult(onSaveNote(snapshot.id, note) ? "saved" : "failed")}>{saveResult === "saved" ? <Check className="h-4 w-4"/> : <Save className="h-4 w-4"/>}{saveResult === "saved" ? "已保存" : "保存备注"}</Button>
          </div>
          <div aria-live="polite" className="-mt-3 min-h-5 text-caption-1-regular">{saveResult === "saved" && <span className="font-semibold text-status-success-600">备注已保存到本机。</span>}{saveResult === "failed" && <span role="alert" className="font-semibold text-status-danger-600">保存失败，请检查本机存储空间后重试。</span>}</div>

          <div className="overflow-x-auto rounded-[var(--app-radius-md)] border border-separator-border bg-background-secondary-default p-4">
{snapshot.layout ? <SeatLayoutSurface layout={snapshot.layout} renderSeat={(seat, index) => { const name = snapshot.seats[index] || ""; return <div className={`grid h-full place-items-center rounded-[var(--app-radius-sm)] border text-body-semibold ${name ? "border-border-button-default bg-background-primary-default text-text-primary" : "border-dashed border-border-button-default text-text-tertiary"}`} title={seat.label}>{name || "空"}</div>; }} /> :
            <div className="min-w-[820px] space-y-2">
              <div className="grid grid-cols-[3rem_repeat(8,minmax(4.5rem,1fr))] gap-2">
                <div />
                {Array.from({ length: COLS }, (_, index) => (
                  <div key={index} className="text-center text-caption-1-medium text-text-tertiary">第{index + 1}列</div>
                ))}
              </div>

              {displayRows.map(rowIndex => (
                <div key={rowIndex} className="grid grid-cols-[3rem_repeat(8,minmax(4.5rem,1fr))] gap-2 items-center">
                  <div className="text-center text-caption-1-medium text-text-tertiary">第{rowIndex + 1}排</div>
                  {Array.from({ length: COLS }, (_, colIndex) => {
                    const seatIndex = rowIndex * COLS + colIndex;
                    const name = snapshot.seats[seatIndex] || "";
                    return (
                      <div
                        key={seatIndex}
                        className={`flex h-12 items-center justify-center rounded-[var(--app-radius-sm)] border text-body-regular ${name ? "border-border-button-default bg-background-primary-default font-semibold text-text-primary" : "border-dashed border-border-button-default text-text-tertiary"}`}
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
