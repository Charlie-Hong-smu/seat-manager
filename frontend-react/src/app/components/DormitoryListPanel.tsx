import { Plus } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { AppStudent, Dormitory } from "../state/types";

const DORM_ITEM_HEIGHT = 48;
const DORM_ITEM_GAP = 4;

function scoreClass(value: number): string {
  return value > 0 ? "text-status-success-600" : value < 0 ? "text-status-danger-500" : "text-text-secondary";
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
        <aside className="flex flex-col min-h-0 overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default shadow-sm">
          <div className="border-b border-separator-border p-3">
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={event => setNewName(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-border-button-default bg-background-secondary-default px-2.5 py-1.5 text-body-regular outline-none focus:border-accent-300"
                placeholder="新宿舍名称"
              />
              <button
                onClick={createDormitory}
                disabled={!newName.trim()}
                className="shrink-0 rounded-lg bg-accent-600 px-2.5 py-1.5 text-text-white hover:bg-accent-700 disabled:bg-background-tertiary-hover"
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
              className="pointer-events-none absolute left-2 right-2 top-2 h-12 rounded-xl bg-text-primary shadow-sm transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={{ transform: "translateY(var(--dorm-active-y))" }}
            />
            <div className="relative space-y-1">
              {sortedDormitories.map((dormitory, index) => {
                const active = selectedDormitory?.id === dormitory.id;
                return (
                  <button
                    key={dormitory.id}
                    onClick={() => selectDorm(dormitory.id)}
                    className={`relative z-10 flex h-12 w-full items-center justify-between gap-2 rounded-xl px-3 text-left transition-colors duration-100 ${active ? "text-text-white" : "hover:bg-background-secondary-default text-text-primary"}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold ${active ? "bg-background-primary-default/20 text-text-white" : "bg-background-tertiary-default text-text-tertiary"}`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className={`truncate text-body-semibold ${active ? "text-text-white" : "text-text-primary"}`}>
                          {dormitory.name}
                        </div>
                        <div className={`text-[10px] ${active ? "text-text-white/60" : "text-text-tertiary"}`}>
                          {dormitory.memberIds.length} 人
                        </div>
                      </div>
                    </div>
                    <div className={`shrink-0 text-body-semibold ${active ? "text-text-white" : scoreClass(periodScores.get(dormitory.id) || 0)}`}>
                      {formatSigned(periodScores.get(dormitory.id) || 0)}
                    </div>
                  </button>
                );
              })}
              {dormitories.length === 0 && (
                <div className="px-2 py-6 text-center text-caption-1-regular text-text-tertiary">暂无宿舍</div>
              )}
            </div>
          </nav>
          <div className="border-t border-separator-border p-3">
            <div className="text-[10px] text-text-tertiary">
              共 {dormitories.length} 间 · {students.filter(s => s.dormitoryId).length} 名学生
            </div>
          </div>
        </aside>
  </>;
}
