import { BookOpen, ChevronRight, Cloud, Grid3x3, KeyRound, LogOut, Monitor, Users } from "lucide-react";

interface TopHeaderProps {
  studentCount: number;
  seatCount: number;
  sidebarCollapsed: boolean;
  accountOpen: boolean;
  onToggleSidebar: () => void;
  onToggleAccount: () => void;
  onCloseAccount: () => void;
  onInstallApp: () => void;
  onChangePassword: () => void;
  onOpenCloudSync: () => void;
  onLogout: () => void;
}

export function TopHeader({
  studentCount,
  seatCount,
  sidebarCollapsed,
  accountOpen,
  onToggleSidebar,
  onToggleAccount,
  onCloseAccount,
  onInstallApp,
  onChangePassword,
  onOpenCloudSync,
  onLogout,
}: TopHeaderProps) {
  return (
    <>
      <header className="shrink-0 bg-white border-b border-gray-100 px-6 py-0 h-14 flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="text-gray-800" style={{ fontWeight: 700, fontSize: "0.9375rem" }}>小张专用座位管理器</span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
            <Users className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs text-gray-500">学生人数</span>
            <span className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{studentCount}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-xl border border-gray-100">
            <Grid3x3 className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs text-gray-500">座位总数</span>
            <span className="text-sm text-gray-800" style={{ fontWeight: 700 }}>{seatCount}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={onToggleSidebar}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            style={{ fontWeight: 600 }}
          >
            {sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          </button>

          <div className="relative">
            <button
              onClick={onToggleAccount}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-xl transition-colors border border-gray-200"
              style={{ fontWeight: 600 }}
            >
              账户 <ChevronRight className="w-3.5 h-3.5" />
            </button>
            {accountOpen && (
              <div className="absolute right-0 top-full mt-1.5 bg-white border border-gray-100 rounded-2xl shadow-lg overflow-hidden z-30 w-44">
                {[
                  { icon: <Monitor className="w-3.5 h-3.5" />, label: "安装到桌面" },
                  { icon: <KeyRound className="w-3.5 h-3.5" />, label: "修改密码" },
                  { icon: <Cloud className="w-3.5 h-3.5" />, label: "云同步" },
                  { icon: <LogOut className="w-3.5 h-3.5 text-red-400" />, label: "退出登录", danger: true },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => {
                      onCloseAccount();
                      if (item.label === "安装到桌面") onInstallApp();
                      if (item.label === "修改密码") onChangePassword();
                      if (item.label === "云同步") onOpenCloudSync();
                      if (item.label === "退出登录") onLogout();
                    }}
                    className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${item.danger ? "text-red-500" : "text-gray-600"}`}
                  >
                    {item.icon}{item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {accountOpen && (
        <div className="fixed inset-0 z-10" onClick={onCloseAccount} />
      )}
    </>
  );
}
