import { useState } from "react";
import { BookOpen, Users, Grid3x3, ChevronRight, LogOut, KeyRound, Cloud, Monitor, BarChart2, LayoutGrid } from "lucide-react";

import { LoginScreen } from "./components/LoginScreen";
import { Sidebar } from "./components/Sidebar";
import { SeatBoard } from "./components/SeatBoard";
import { StudentModal } from "./components/StudentModal";
import { CommentWorkbench } from "./components/CommentWorkbench";
import { GradesPage } from "./components/GradesPage";
import { Student, STUDENTS, INITIAL_SEATS } from "./components/mockData";

type AppTab = "common" | "import" | "scores" | "history";
type MainView = "seat" | "grades";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<AppTab>("common");
  const [mainView, setMainView] = useState<MainView>("seat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [showCommentWorkbench, setShowCommentWorkbench] = useState(false);
  const [lockedSeats, setLockedSeats] = useState<Set<number>>(new Set());
  const [accountOpen, setAccountOpen] = useState(false);

  function toggleLock(idx: number) {
    setLockedSeats(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  const studentCount = STUDENTS.length;
  const seatCount = INITIAL_SEATS.length;

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="shrink-0 bg-white border-b border-gray-100 px-6 py-0 h-14 flex items-center justify-between gap-4 z-20">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <span className="text-gray-800" style={{ fontWeight: 700, fontSize: "0.9375rem" }}>小张专用座位管理器</span>
        </div>

        {/* Stats */}
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

        {/* Actions */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setSidebarCollapsed(v => !v)}
            className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
            style={{ fontWeight: 600 }}
          >
            {sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          </button>

          {/* Account dropdown */}
          <div className="relative">
            <button
              onClick={() => setAccountOpen(v => !v)}
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
                      setAccountOpen(false);
                      if (item.label === "退出登录") setLoggedIn(false);
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

      {/* ── Main area: Sidebar + Content ───────────────────────────────── */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <Sidebar
            activeTab={sidebarTab}
            onTabChange={tab => {
              setSidebarTab(tab);
              if (tab === "scores") setMainView("grades");
            }}
            onShowGrades={() => setMainView("grades")}
            onHideGrades={() => setMainView("seat")}
            mainView={mainView}
          />
        )}

        {/* Main Content */}
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          {/* View toggle bar */}
          <div className="shrink-0 flex items-center gap-2 px-6 py-3 border-b border-gray-100 bg-white">
            <button
              onClick={() => setMainView("seat")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all ${mainView === "seat" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              style={{ fontWeight: 600 }}
            >
              <LayoutGrid className="w-3.5 h-3.5" />座位布局
            </button>
            <button
              onClick={() => setMainView("grades")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm transition-all ${mainView === "grades" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              style={{ fontWeight: 600 }}
            >
              <BarChart2 className="w-3.5 h-3.5" />成绩看板
            </button>

            {/* Comment workbench shortcut */}
            <button
              onClick={() => setShowCommentWorkbench(true)}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm text-violet-600 border border-violet-200 hover:bg-violet-50 transition-colors"
              style={{ fontWeight: 600 }}
            >
              评语工作台
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {mainView === "seat" && (
              <div className="h-full bg-white overflow-hidden flex flex-col px-6 py-4">
                <SeatBoard
                  onSelectStudent={setSelectedStudent}
                  lockedSeats={lockedSeats}
                  onToggleLock={toggleLock}
                />
              </div>
            )}

            {mainView === "grades" && (
              <div className="h-full overflow-auto">
                <GradesPage />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Overlays ─────────────────────────────────────────────────────── */}
      {selectedStudent && (
        <StudentModal
          student={selectedStudent}
          onClose={() => setSelectedStudent(null)}
        />
      )}

      {showCommentWorkbench && (
        <CommentWorkbench onClose={() => setShowCommentWorkbench(false)} />
      )}

      {/* Click outside to close account menu */}
      {accountOpen && (
        <div className="fixed inset-0 z-25" onClick={() => setAccountOpen(false)} />
      )}
    </div>
  );
}
