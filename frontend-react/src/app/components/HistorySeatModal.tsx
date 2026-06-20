import { useState } from "react";
import { CalendarClock, RotateCcw, Save, Trash2, X } from "lucide-react";
import type { SeatHistorySnapshot } from "../state/types";

interface Props {
  snapshot: SeatHistorySnapshot;
  onClose: () => void;
  onSaveNote: (id: string, note: string) => void;
  onApply: (snapshot: SeatHistorySnapshot) => void;
  onDelete: (id: string) => void;
}

const COLS = 8;

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || "未记录时间" : date.toLocaleString("zh-CN", { hour12: false });
}

export function HistorySeatModal({ snapshot, onClose, onSaveNote, onApply, onDelete }: Props) {
  const [note, setNote] = useState(snapshot.note);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rows = Math.max(1, snapshot.rows || Math.ceil(snapshot.seats.length / COLS));
  const displayRows = Array.from({ length: rows }, (_, displayRow) => rows - 1 - displayRow);
  const occupied = snapshot.seats.filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 backdrop-blur-sm p-4 pt-10 overflow-y-auto">
      <div className="w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden mb-8">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-400 mb-1" style={{ fontWeight: 700 }}>
              <CalendarClock className="w-3.5 h-3.5" />历史座位详情
            </div>
            <h3 className="text-gray-900" style={{ fontSize: "1.25rem", fontWeight: 800 }}>
              {formatTime(snapshot.time)}
            </h3>
            <p className="text-xs text-gray-400 mt-1">{occupied} 人 · {rows} 排 · 最下方为讲台</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onApply(snapshot)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-blue-600 border border-blue-200 rounded-xl hover:bg-blue-50 transition-colors"
              style={{ fontWeight: 700 }}
            >
              <RotateCcw className="w-3.5 h-3.5" />应用
            </button>
            {confirmDelete ? (
              <>
                <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">取消</button>
                <button onClick={() => onDelete(snapshot.id)} className="px-3 py-2 text-sm text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors" style={{ fontWeight: 700 }}>确认删除</button>
              </>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 border border-red-200 rounded-xl hover:bg-red-50 transition-colors"
                style={{ fontWeight: 700 }}
              >
                <Trash2 className="w-3.5 h-3.5" />删除
              </button>
            )}
            <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
            <input
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="给这份历史座位添加备注"
              className="w-full px-3.5 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:border-blue-300"
            />
            <button
              onClick={() => onSaveNote(snapshot.id, note)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm transition-colors"
              style={{ fontWeight: 700 }}
            >
              <Save className="w-3.5 h-3.5" />保存备注
            </button>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 overflow-x-auto">
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
