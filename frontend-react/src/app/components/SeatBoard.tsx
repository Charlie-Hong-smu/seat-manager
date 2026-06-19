import { type DragEvent, type KeyboardEvent, useMemo, useState } from "react";
import { Lock, Star, Maximize2, Minimize2 } from "lucide-react";
import type { AppStudent, StudentId } from "../state/types";

interface Props {
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  onSelectStudent: (student: AppStudent) => void;
  onMoveSeat: (fromIndex: number, toIndex: number) => void;
  lockedSeats: Set<number>;
  onToggleLock: (idx: number) => void;
}

const COLS = 8;

function SeatCard({
  studentId,
  studentById,
  seatIndex,
  isLocked,
  isDragging,
  cardMode,
  onSelect,
  onMoveSeat,
  onDragStateChange,
  onToggleLock,
}: {
  studentId: StudentId | null;
  studentById: Map<StudentId, AppStudent>;
  seatIndex: number;
  isLocked: boolean;
  isDragging: boolean;
  cardMode: "compact" | "detail";
  onSelect: (s: AppStudent) => void;
  onMoveSeat: (fromIndex: number, toIndex: number) => void;
  onDragStateChange: (seatIndex: number | null) => void;
  onToggleLock: (idx: number) => void;
}) {
  const student = studentId ? studentById.get(studentId) : null;

  function handleDragStart(event: DragEvent<HTMLElement>) {
    if (isLocked || !studentId) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", String(seatIndex));
    event.dataTransfer.effectAllowed = "move";
    onDragStateChange(seatIndex);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!isLocked) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const fromIndex = Number.parseInt(event.dataTransfer.getData("text/plain"), 10);
    if (Number.isInteger(fromIndex) && !isLocked) {
      onMoveSeat(fromIndex, seatIndex);
    }
    onDragStateChange(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (student) {
        onSelect(student);
      }
    }
  }

  if (!studentId || !student) {
    return (
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`rounded-xl border-2 border-dashed flex items-center justify-center text-gray-300 text-xs select-none transition-colors ${isLocked ? "border-amber-200 bg-amber-50/40" : "border-gray-200 bg-gray-50/50 hover:border-blue-200 hover:bg-blue-50/40"} ${cardMode === "compact" ? "h-12" : "h-20"}`}
      >
        空
      </div>
    );
  }

  const genderColor = student.gender === "男" ? "text-blue-400" : student.gender === "女" ? "text-pink-400" : "text-gray-300";
  const genderDot = student.gender === "男" ? "bg-blue-400" : student.gender === "女" ? "bg-pink-400" : "bg-gray-300";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(student)}
      onKeyDown={handleKeyDown}
      draggable={!isLocked}
      onDragStart={handleDragStart}
      onDragEnd={() => onDragStateChange(null)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`relative w-full rounded-xl border border-gray-200 bg-white hover:border-blue-300 hover:shadow-md hover:bg-blue-50/30 transition-all text-left group ${isLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing"} ${
        isLocked ? "border-amber-300 bg-amber-50/30" : ""
      } ${isDragging ? "opacity-50 ring-2 ring-blue-200" : ""} ${cardMode === "compact" ? "h-12 px-3" : "h-20 px-3 pt-2.5 pb-2"}`}
    >
      {/* Lock indicator */}
      {isLocked && (
        <div className="absolute top-1 right-1">
          <Lock className="w-2.5 h-2.5 text-amber-400" />
        </div>
      )}

      {/* Lock toggle (hover) */}
      <button
        onClick={e => { e.stopPropagation(); onToggleLock(seatIndex); }}
        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100"
      >
        <Lock className={`w-3 h-3 ${isLocked ? "text-amber-400" : "text-gray-300"}`} />
      </button>

      {cardMode === "compact" ? (
        <div className="flex items-center gap-2 h-full">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${genderDot}`} />
          <span className="text-sm text-gray-800 truncate" style={{ fontWeight: 600 }}>{student.name}</span>
          {student.academicTags.length > 0 && (
            <span className="ml-auto text-xs text-gray-400 truncate hidden group-hover:block">{student.academicTags[0]}</span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1 h-full">
          <div className="flex items-center gap-1.5">
            <span className={`text-xs ${genderColor}`} style={{ fontWeight: 700 }}>{student.gender || "—"}</span>
            <span className="text-sm text-gray-800 truncate" style={{ fontWeight: 700 }}>{student.name}</span>
          </div>
          {student.academicTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-auto">
              {student.academicTags.slice(0, 2).map(tag => {
                const isStrong = tag.endsWith("强");
                return (
                  <span
                    key={tag}
                    className={`text-xs px-1.5 py-0.5 rounded-full ${isStrong ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-red-50 text-red-400 border border-red-100"}`}
                    style={{ fontWeight: 600 }}
                  >
                    {tag}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function SeatBoard({ students, seatOrder, onSelectStudent, onMoveSeat, lockedSeats, onToggleLock }: Props) {
  const [cardMode, setCardMode] = useState<"compact" | "detail">("compact");
  const [draggingSeat, setDraggingSeat] = useState<number | null>(null);
  const studentById = useMemo(() => new Map(students.map(student => [student.id, student])), [students]);
  const rowCount = Math.ceil(seatOrder.length / COLS);

  const rows = Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: COLS }, (_, c) => ({
      seatIndex: r * COLS + c,
      studentId: seatOrder[r * COLS + c] ?? null,
    }))
  );

  // Groups: [0,1] [2,3] [4,5] [6,7]
  const groups = [
    [0, 1], [2, 3], [4, 5], [6, 7],
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Compact toolbar — no title, just the mode toggle + hint */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-xs text-gray-400">每两列为同桌一组，共 4 组 · 点击卡片查看学生详情</p>
        <div className="flex p-1 bg-gray-100 rounded-xl gap-1">
          <button
            onClick={() => setCardMode("compact")}
            className={`px-3 py-1 rounded-lg text-xs transition-all ${cardMode === "compact" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            style={{ fontWeight: 600 }}
          >
            <Minimize2 className="w-3 h-3 inline mr-1 -mt-0.5" />简洁
          </button>
          <button
            onClick={() => setCardMode("detail")}
            className={`px-3 py-1 rounded-lg text-xs transition-all ${cardMode === "detail" ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
            style={{ fontWeight: 600 }}
          >
            <Maximize2 className="w-3 h-3 inline mr-1 -mt-0.5" />详细
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto min-h-0">
        {/* Column group headers */}
        <div className="flex gap-3 mb-2 pl-12">
          {groups.map((_, gi) => (
            <div key={gi} className="flex-1 text-center text-xs text-gray-400" style={{ fontWeight: 600 }}>
              第 {gi + 1} 组
            </div>
          ))}
        </div>

        {/* Rows */}
        <div className="flex flex-col gap-2">
          {rows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex items-center gap-3">
              {/* Row label */}
              <div className="w-9 shrink-0 text-center">
                <span className="text-xs text-gray-400" style={{ fontWeight: 600 }}>第{rowIdx + 1}排</span>
              </div>

              {/* 4 groups of 2 columns */}
              {groups.map((cols, gi) => (
                <div key={gi} className="flex-1 grid grid-cols-2 gap-2">
                  {cols.map(colIdx => {
                    const cell = row[colIdx];
                    return (
                      <SeatCard
                        key={cell.seatIndex}
                        studentId={cell.studentId}
                        studentById={studentById}
                        seatIndex={cell.seatIndex}
                        isLocked={lockedSeats.has(cell.seatIndex)}
                        isDragging={draggingSeat === cell.seatIndex}
                        cardMode={cardMode}
                        onSelect={onSelectStudent}
                        onMoveSeat={onMoveSeat}
                        onDragStateChange={setDraggingSeat}
                        onToggleLock={onToggleLock}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-blue-400" />男生
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-pink-400" />女生
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Star className="w-3 h-3 text-emerald-400" />学科优势
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Lock className="w-3 h-3 text-amber-400" />座位锁定
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-4 h-4 rounded border-2 border-dashed border-gray-300" />空座
          </div>
        </div>
      </div>
    </div>
  );
}
