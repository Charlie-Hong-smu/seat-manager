import { type ReactNode } from "react";
import { BarChart2, History, Home, LayoutGrid, MessageSquareText, Sparkles, Upload, Wallet } from "lucide-react";

import type { AppStudent, Dormitory, GradeExam, StudentId } from "../state/types";

export type SidebarTab = "daily" | "dormitories" | "scores" | "ai" | "funds" | "data" | "history";

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
    key: "ai",
    label: "AI助手",
    icon: <Sparkles className="h-4 w-4" />,
    getMeta: ({ students }) => `${students.length} 人摘要`,
  },
  {
    key: "funds",
    label: "班费",
    icon: <Wallet className="h-4 w-4" />,
    getMeta: () => `收支流水`,
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

const NAV_ITEM_HEIGHT = 56;
const NAV_ITEM_GAP = 4;

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
  const activeIndex = Math.max(0, NAV_ITEMS.findIndex(item => item.key === activeTab));

  return (
    <aside className="flex h-full w-40 shrink-0 flex-col border-r border-gray-100 bg-white">
      <div className="border-b border-gray-100 px-3 py-4">
        <div className="text-xs text-gray-400" style={{ fontWeight: 700 }}>工作台</div>
        <div className="mt-1 text-lg text-gray-900" style={{ fontWeight: 900 }}>班级管理</div>
      </div>

      <nav
        className="relative flex-1 overflow-y-auto px-2 py-3"
        style={{ ["--nav-active-y" as string]: `${activeIndex * (NAV_ITEM_HEIGHT + NAV_ITEM_GAP)}px` }}
      >
        <div
          className="pointer-events-none absolute left-2 right-2 top-3 h-14 rounded-xl bg-gray-900 shadow-sm transition-transform duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ transform: "translateY(var(--nav-active-y))" }}
        />
        {NAV_ITEMS.map(item => {
          const active = activeTab === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onTabChange(item.key)}
              className={`relative z-10 mb-1 flex h-14 w-full items-center gap-2 rounded-xl px-2.5 text-left transition-colors duration-100 ${
                active ? "text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors duration-100 ${active ? "bg-white/15 text-white" : "bg-gray-100 text-gray-500"}`}>
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm" style={{ fontWeight: 800 }}>{item.label}</span>
                <span className={`block truncate text-xs transition-colors duration-100 ${active ? "text-white/70" : "text-gray-400"}`}>{item.getMeta({ students, dormitories, gradeExams, seatOrder, savedSeatHistoryCount })}</span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-gray-100 px-2.5 py-4">
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
