import { useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  Cloud,
  KeyRound,
  Link2Off,
  LogOut,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  UserRound,
} from "lucide-react";

import { APP_NAME } from "../config";
import type { AppStudent } from "../state/types";
import { AnimatedPopover, IconButton } from "./ui";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

interface TopHeaderProps {
  students: AppStudent[];
  sidebarCollapsed: boolean;
  accountOpen: boolean;
  onToggleSidebar: () => void;
  onToggleAccount: () => void;
  onCloseAccount: () => void;
  onSelectStudent: (student: AppStudent) => void;
  onInstallApp: () => void;
  onChangePassword?: () => void;
  onOpenCloudSync: () => void;
  onUnbindDevice?: () => void;
  onLogout: () => void;
  onWorkspaceChanged: () => void;
}

function normalizeSearch(value: string): string {
  return value.trim().toLocaleLowerCase("zh-Hans-CN").replace(/\s+/g, "");
}

export function TopHeader({
  students,
  sidebarCollapsed,
  accountOpen,
  onToggleSidebar,
  onToggleAccount,
  onCloseAccount,
  onSelectStudent,
  onInstallApp,
  onChangePassword,
  onOpenCloudSync,
  onUnbindDevice,
  onLogout,
  onWorkspaceChanged,
}: TopHeaderProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = normalizeSearch(query);
  const results = useMemo(() => {
    if (!normalizedQuery) return students.slice(0, 6);
    return students.filter(student =>
      [student.name, ...student.aliases].some(name => normalizeSearch(name).includes(normalizedQuery))
    ).slice(0, 8);
  }, [normalizedQuery, students]);

  const accountItems = [
    { key: "install", icon: <Monitor className="h-4 w-4" />, label: "安装到桌面" },
    ...(onChangePassword ? [{ key: "password", icon: <KeyRound className="h-4 w-4" />, label: "修改密码" }] : []),
    ...(onUnbindDevice ? [{ key: "unbind", icon: <Link2Off className="h-4 w-4" />, label: "解绑本机" }] : []),
    { key: "logout", icon: <LogOut className="h-4 w-4" />, label: "退出登录", danger: true },
  ];

  function openSearch() {
    setSearchOpen(true);
    window.setTimeout(() => searchRef.current?.focus(), 0);
  }

  function closeSearch() {
    setSearchOpen(false);
    setQuery("");
  }

  function chooseStudent(student: AppStudent) {
    closeSearch();
    onSelectStudent(student);
  }

  return (
    <>
      <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--app-border)] bg-white px-3 sm:px-4">
        <IconButton label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} onClick={onToggleSidebar}>
          {sidebarCollapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
        </IconButton>

        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--app-radius-sm)] bg-blue-600 text-white">
            <BookOpen className="h-[18px] w-[18px]" />
          </div>
          <span className="hidden whitespace-nowrap text-sm font-bold text-[var(--app-text)] min-[1180px]:block">{APP_NAME}</span>
          <WorkspaceSwitcher onChanged={onWorkspaceChanged} />
        </div>

        <div className="relative ml-auto hidden w-full max-w-sm min-[1100px]:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <button
            type="button"
            onClick={openSearch}
            className="flex h-10 w-full items-center rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 pl-9 pr-3 text-left text-sm text-gray-400 transition-colors hover:border-gray-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
          >
            搜索学生姓名或别名
            <span className="ml-auto rounded-md border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-400">搜索</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <IconButton label="搜索学生" className="min-[1100px]:hidden" onClick={openSearch}>
            <Search className="h-[18px] w-[18px]" />
          </IconButton>
          <IconButton label="云同步" onClick={onOpenCloudSync}>
            <Cloud className="h-[18px] w-[18px]" />
          </IconButton>

          <div className="relative">
            <button
              type="button"
              onClick={onToggleAccount}
              aria-expanded={accountOpen}
              className="inline-flex h-10 items-center gap-2 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30"
            >
              <span className="grid h-6 w-6 place-items-center rounded-lg bg-gray-100"><UserRound className="h-3.5 w-3.5" /></span>
              <span className="hidden sm:inline">账户</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${accountOpen ? "rotate-180" : ""}`} />
            </button>
            <AnimatedPopover
              open={accountOpen}
              className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white p-1.5 shadow-[var(--app-shadow-float)]"
            >
                {accountItems.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      onCloseAccount();
                      if (item.key === "install") onInstallApp();
                      if (item.key === "password") onChangePassword?.();
                      if (item.key === "unbind") onUnbindDevice?.();
                      if (item.key === "logout") onLogout();
                    }}
                    className={`flex h-10 w-full items-center gap-2.5 rounded-[var(--app-radius-sm)] px-3 text-sm transition-colors hover:bg-gray-50 ${item.danger ? "text-red-500" : "text-gray-600"}`}
                  >
                    {item.icon}{item.label}
                  </button>
                ))}
            </AnimatedPopover>
          </div>
        </div>
      </header>

      {searchOpen && (
        <div className="soft-backdrop-enter fixed inset-0 z-50 flex items-start justify-center bg-gray-950/20 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={event => event.currentTarget === event.target && closeSearch()}>
          <div className="modal-panel-enter w-full max-w-xl overflow-hidden rounded-[var(--app-radius-lg)] border border-white bg-white shadow-[var(--app-shadow-float)]" role="dialog" aria-label="搜索学生">
            <div className="flex items-center gap-3 border-b border-[var(--app-border)] px-4">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Escape") closeSearch();
                  if (event.key === "Enter" && results.length === 1) chooseStudent(results[0]);
                }}
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-gray-900 outline-none placeholder:text-gray-400"
                placeholder="输入学生姓名或别名"
              />
              <button type="button" onClick={closeSearch} className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100">ESC</button>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {results.map(student => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => chooseStudent(student)}
                  className="flex w-full items-center gap-3 rounded-[var(--app-radius-sm)] px-3 py-2.5 text-left transition-colors hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-sm font-bold text-blue-600">{student.name.slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-800">{student.name}</span>
                    <span className="block truncate text-xs text-gray-400">{student.aliases.length ? student.aliases.join(" · ") : student.gender || "未填写别名"}</span>
                  </span>
                </button>
              ))}
              {results.length === 0 && <div className="px-4 py-10 text-center text-sm text-gray-400">没有找到匹配的学生</div>}
            </div>
          </div>
        </div>
      )}

      {accountOpen && <button type="button" aria-label="关闭账户菜单" className="fixed inset-0 z-30" onClick={onCloseAccount} />}
    </>
  );
}
