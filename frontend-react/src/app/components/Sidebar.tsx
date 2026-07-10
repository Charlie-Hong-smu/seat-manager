import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BarChart2,
  Database,
  History,
  Home,
  LayoutGrid,
  MessageSquareText,
  PanelsTopLeft,
  Sparkles,
  Wallet,
} from "lucide-react";

import type { AppStudent, Dormitory, GradeExam, StudentId } from "../state/types";

export type SidebarTab = "daily" | "dormitories" | "scores" | "ai" | "funds" | "data" | "history";

interface Props {
  activeTab: SidebarTab;
  collapsed: boolean;
  students: AppStudent[];
  dormitories: Dormitory[];
  gradeExams: GradeExam[];
  seatOrder: Array<StudentId | null>;
  savedSeatHistoryCount: number;
  onTabChange: (tab: SidebarTab) => void;
  onOpenCommentWorkbench: () => void;
}

type NavInput = Pick<Props, "students" | "dormitories" | "gradeExams" | "seatOrder" | "savedSeatHistoryCount">;
type NavEntry = {
  key: SidebarTab | "comments";
  label: string;
  icon: ReactNode;
  getBadge?: (input: NavInput) => string;
};

const NAV_GROUPS: Array<{ label: string; items: NavEntry[] }> = [
  {
    label: "日常管理",
    items: [
      { key: "daily", label: "日常", icon: <LayoutGrid className="h-[18px] w-[18px]" />, getBadge: ({ students }) => String(students.length) },
      { key: "dormitories", label: "宿舍", icon: <Home className="h-[18px] w-[18px]" />, getBadge: ({ dormitories }) => String(dormitories.length) },
    ],
  },
  {
    label: "学情分析",
    items: [
      { key: "scores", label: "成绩", icon: <BarChart2 className="h-[18px] w-[18px]" />, getBadge: ({ gradeExams }) => String(gradeExams.length) },
      { key: "ai", label: "AI 助手", icon: <Sparkles className="h-[18px] w-[18px]" /> },
      { key: "comments", label: "评语工作台", icon: <MessageSquareText className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    label: "班级工具",
    items: [
      { key: "funds", label: "班费", icon: <Wallet className="h-[18px] w-[18px]" /> },
      { key: "history", label: "历史", icon: <History className="h-[18px] w-[18px]" />, getBadge: ({ savedSeatHistoryCount }) => String(savedSeatHistoryCount) },
    ],
  },
  {
    label: "数据设置",
    items: [
      { key: "data", label: "名单 / 备份", icon: <Database className="h-[18px] w-[18px]" /> },
    ],
  },
];

export function Sidebar({
  activeTab,
  collapsed,
  students,
  dormitories,
  gradeExams,
  seatOrder,
  savedSeatHistoryCount,
  onTabChange,
  onOpenCommentWorkbench,
}: Props) {
  const navInput = { students, dormitories, gradeExams, seatOrder, savedSeatHistoryCount };
  const navRef = useRef<HTMLElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);
  const [activeIndicator, setActiveIndicator] = useState({ top: 0, height: 40, ready: false });

  const updateActiveIndicator = useCallback(() => {
    const nav = navRef.current;
    const activeButton = activeButtonRef.current;
    if (!nav || !activeButton) return;

    const navRect = nav.getBoundingClientRect();
    const buttonRect = activeButton.getBoundingClientRect();

    setActiveIndicator(current => {
      const next = {
        top: buttonRect.top - navRect.top + nav.scrollTop,
        height: buttonRect.height,
        ready: true,
      };
      if (current.top === next.top && current.height === next.height && current.ready) return current;
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    updateActiveIndicator();
  }, [activeTab, updateActiveIndicator]);

  useEffect(() => {
    updateActiveIndicator();

    // 分组标题会随侧栏宽度一起收放；动画结束后再校准一次滑块位置。
    const timer = window.setTimeout(updateActiveIndicator, 340);
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateActiveIndicator);

    if (navRef.current) observer?.observe(navRef.current);
    if (activeButtonRef.current) observer?.observe(activeButtonRef.current);
    window.addEventListener("resize", updateActiveIndicator);

    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("resize", updateActiveIndicator);
    };
  }, [activeTab, collapsed, updateActiveIndicator]);

  return (
    <aside className="flex h-full w-full flex-col border-r border-[var(--app-border)] bg-white">
      <div className="flex h-14 shrink-0 items-center gap-3 overflow-hidden border-b border-[var(--app-border)] px-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-sm)] bg-gray-900 text-white">
          <PanelsTopLeft className="h-[18px] w-[18px]" />
        </span>
        <span className={`min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? "max-w-0 translate-x-2 opacity-0" : "max-w-32 translate-x-0 opacity-100"}`}>
          <span className="block text-xs font-semibold text-gray-400">工作台</span>
          <span className="block truncate text-sm font-bold text-[var(--app-text)]">班级管理</span>
        </span>
      </div>

      <nav
        ref={navRef}
        className={`relative min-h-0 flex-1 overflow-y-auto py-3 transition-[padding] duration-300 ${collapsed ? "px-2" : "px-3"}`}
        aria-label="主导航"
      >
        <span
          data-testid="sidebar-active-indicator"
          aria-hidden="true"
          className={`pointer-events-none absolute top-0 z-0 rounded-[var(--app-radius-sm)] bg-gray-900 shadow-sm transition-[left,right,height,transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${collapsed ? "left-2 right-2" : "left-3 right-3"} ${activeIndicator.ready ? "opacity-100" : "opacity-0"}`}
          style={{
            height: activeIndicator.height,
            transform: `translate3d(0, ${activeIndicator.top}px, 0)`,
          }}
        />
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={`relative z-10 ${groupIndex ? "mt-3" : ""}`}>
            <div className={`grid transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? "mb-0 grid-rows-[0fr] opacity-0" : "mb-1.5 grid-rows-[1fr] opacity-100"}`}>
              <div className="overflow-hidden px-2 text-[11px] font-bold tracking-wide text-gray-400">{group.label}</div>
            </div>
            <div className="space-y-1">
              {group.items.map(item => {
                const active = item.key !== "comments" && activeTab === item.key;
                const badge = item.getBadge?.(navInput);
                return (
                  <button
                    key={item.key}
                    ref={active ? activeButtonRef : undefined}
                    type="button"
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={() => item.key === "comments" ? onOpenCommentWorkbench() : onTabChange(item.key)}
                    className={`group relative flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-[var(--app-radius-sm)] px-2.5 text-sm font-semibold [-webkit-tap-highlight-color:transparent] transition-[color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 motion-reduce:transition-none ${active ? "text-white" : item.key === "comments" ? "text-violet-600 hover:translate-x-px hover:bg-violet-50" : "text-gray-600 hover:translate-x-px hover:bg-gray-100 hover:text-gray-900"}`}
                  >
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-[background-color,transform] duration-200 group-hover:scale-[1.03] ${active ? "bg-white/12" : item.key === "comments" ? "bg-violet-50 group-hover:bg-violet-100" : "bg-gray-50 group-hover:bg-white"}`}>
                      {item.icon}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-left whitespace-nowrap transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${collapsed ? "max-w-0 translate-x-2 opacity-0" : "max-w-28 translate-x-0 opacity-100"}`}>{item.label}</span>
                    {badge !== undefined && (
                      <span className={`min-w-5 shrink-0 rounded-full px-1.5 py-0.5 text-center text-[10px] font-bold transition-[max-width,opacity,transform,padding] duration-300 ${collapsed ? "max-w-0 translate-x-2 overflow-hidden px-0 opacity-0" : "max-w-10 translate-x-0 opacity-100"} ${active ? "bg-white/15 text-white" : "bg-gray-100 text-gray-500"}`}>{badge}</span>
                    )}
                    <span className={`absolute -left-2 h-5 w-1 rounded-r-full bg-blue-500 transition-[opacity,transform] duration-300 ${collapsed && active ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0"}`} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
