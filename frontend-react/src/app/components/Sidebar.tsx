import { type ReactNode } from "react";
import { Archive, BarChart2, History, Home, LayoutGrid, MessageSquareText, Upload } from "lucide-react";

import type { AppStudent, Dormitory, GradeExam, StudentId } from "../state/types";

export type SidebarTab = "daily" | "dormitories" | "scores" | "data" | "history";

interface Props {
  activeTab: SidebarTab;
  students: AppStudent[];
  dormitories: Dormitory[];
  gradeExams: GradeExam[];
  seatOrder: Array<StudentId | null>;
  savedSeatHistoryCount: number;
  onTabChange: (tab: SidebarTab) => void;
  onOpenCommentWorkbench: () => void;
}

const NAV_ITEMS: Array<{
  key: SidebarTab;
  label: string;
  icon: ReactNode;
  getMeta: (input: Pick<Props, "students" | "dormitories" | "gradeExams" | "seatOrder" | "savedSeatHistoryCount">) => string;
}> = [
  {
    key: "daily",
    label: "日常",
    icon: <LayoutGrid className="h-4 w-4" />,
    getMeta: ({ students, seatOrder }) => `${students.length} 人 · ${seatOrder.length} 座`,
  },
  {
    key: "dormitories",
    label: "宿舍",
    icon: <Home className="h-4 w-4" />,
    getMeta: ({ dormitories }) => `${dormitories.length} 间`,
  },
  {
    key: "scores",
    label: "成绩",
    icon: <BarChart2 className="h-4 w-4" />,
    getMeta: ({ gradeExams }) => `${gradeExams.length} 次考试`,
  },
  {
    key: "data",
    label: "名单/备份",
    icon: <Upload className="h-4 w-4" />,
    getMeta: ({ students }) => `${students.length} 名学生`,
  },
  {
    key: "history",
    label: "历史",
    icon: <History className="h-4 w-4" />,
    getMeta: ({ savedSeatHistoryCount }) => `${savedSeatHistoryCount} 条记录`,
  },
];

export function Sidebar({
  activeTab,
  students,
  dormitories,
  gradeExams,
  seatOrder,
  savedSeatHistoryCount,
  onTabChange,
  onOpenCommentWorkbench,
}: Props) {
  const assignedDormCount = students.filter(student => student.dormitoryId).length;
  const latestExam = gradeExams[0];

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-gray-100 bg-white">
      <div className="border-b border-gray-100 px-5 py-4">
        <div className="text-xs text-gray-400" style={{ fontWeight: 700 }}>工作台</div>
        <div className="mt-1 text-lg text-gray-900" style={{ fontWeight: 900 }}>班级管理</div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {NAV_ITEMS.map(item => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                active ? "bg-gray-900 text-white shadow-sm" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${active ? "bg-white/15" : "bg-gray-100 text-gray-500"}`}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm" style={{ fontWeight: 800 }}>{item.label}</span>
                <span className={`block truncate text-xs ${active ? "text-white/70" : "text-gray-400"}`}>{item.getMeta({ students, dormitories, gradeExams, seatOrder, savedSeatHistoryCount })}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-gray-100 px-4 py-4">
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-3 py-3">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Archive className="h-3.5 w-3.5" />
            <span style={{ fontWeight: 800 }}>摘要</span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-gray-400">宿舍归属</div>
              <div className="mt-0.5 text-gray-800" style={{ fontWeight: 900 }}>{assignedDormCount}/{students.length}</div>
            </div>
            <div>
              <div className="text-gray-400">最近考试</div>
              <div className="mt-0.5 truncate text-gray-800" style={{ fontWeight: 900 }}>{latestExam?.name || "暂无"}</div>
            </div>
          </div>
        </div>

        <button
          onClick={onOpenCommentWorkbench}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm text-violet-600 transition-colors hover:bg-violet-50"
          style={{ fontWeight: 800 }}
        >
          <MessageSquareText className="h-4 w-4" />
          评语工作台
        </button>
      </div>
    </aside>
  );
}
