import { Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppStudent, Dormitory } from "../state/types";

const DORM_ITEM_HEIGHT = 48;
const DORM_ITEM_GAP = 4;

function scoreClass(value: number): string {
  return value > 0 ? "text-emerald-600" : value < 0 ? "text-red-500" : "text-gray-500";
}

function formatSigned(value: number): string {
  return `${value > 0 ? "+" : ""}${value}`;
}

export function DormitoryListPanel({
  newName, setNewName, createDormitory, activeDormIndex,
  sortedDormitories, selectedDormitory, selectDorm, dormitories, students, periodScores,
}: {
  newName: string;
  setNewName: Dispatch<SetStateAction<string>>;
  createDormitory: () => void;
  activeDormIndex: number;
  sortedDormitories: Dormitory[];
  selectedDormitory: Dormitory | null;
  selectDorm: (id: string) => void;
  dormitories: Dormitory[];
  students: AppStudent[];
  periodScores: Map<string, number>;
}) {
  return <>
        <aside className="flex flex-col min-h-0 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 p-3">
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={event => setNewName(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm outline-none focus:border-blue-300"
                placeholder="新宿舍名称"
              />
              <button
                onClick={createDormitory}
                disabled={!newName.trim()}
                className="shrink-0 rounded-lg bg-blue-600 px-2.5 py-1.5 text-white hover:bg-blue-700 disabled:bg-gray-200"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <nav
            className="relative flex-1 min-h-0 overflow-y-auto p-2"
            style={{ ["--dorm-active-y" as string]: `${activeDormIndex * (DORM_ITEM_HEIGHT + DORM_ITEM_GAP)}px` }}
          >
            {/* 选中指示条 */}
            <div
              className="pointer-events-none absolute left-2 right-2 top-2 h-12 rounded-xl bg-gray-900 shadow-sm transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: "translateY(var(--dorm-active-y))" }}
            />
            <div className="relative space-y-1">
              {sortedDormitories.map((dormitory, index) => {
                const active = selectedDormitory?.id === dormitory.id;
                return (
                  <button
                    key={dormitory.id}
                    onClick={() => selectDorm(dormitory.id)}
                    className={`relative z-10 flex h-12 w-full items-center justify-between gap-2 rounded-xl px-3 text-left transition-colors duration-100 ${active ? "text-white" : "hover:bg-gray-50 text-gray-700"}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"}`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className={`truncate text-sm font-semibold ${active ? "text-white" : "text-gray-800"}`}>
                          {dormitory.name}
                        </div>
                        <div className={`text-[10px] ${active ? "text-white/60" : "text-gray-400"}`}>
                          {dormitory.memberIds.length} 人
                        </div>
                      </div>
                    </div>
                    <div className={`shrink-0 text-sm font-bold ${active ? "text-white" : scoreClass(periodScores.get(dormitory.id) || 0)}`}>
                      {formatSigned(periodScores.get(dormitory.id) || 0)}
                    </div>
                  </button>
                );
              })}
              {dormitories.length === 0 && (
                <div className="px-2 py-6 text-center text-xs text-gray-400">暂无宿舍</div>
              )}
            </div>
          </nav>
          <div className="border-t border-gray-100 p-3">
            <div className="text-[10px] text-gray-400">
              共 {dormitories.length} 间 · {students.filter(s => s.dormitoryId).length} 名学生
            </div>
          </div>
        </aside>
  </>;
}
