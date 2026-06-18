import { useState } from "react";

import { AppShell } from "./components/AppShell";
import { LoginScreen } from "./components/LoginScreen";
import { MainTabs } from "./components/MainTabs";
import { Sidebar } from "./components/Sidebar";
import { SeatBoard } from "./components/SeatBoard";
import { StudentDetail } from "./components/StudentDetail";
import { CommentWorkbench } from "./components/CommentWorkbench";
import { GradesPage } from "./components/GradesPage";
import { TopHeader } from "./components/TopHeader";
import { useSeatManagerState } from "./state/store";
import type { AppStudent } from "./state/types";

type AppTab = "common" | "import" | "scores" | "history";
type MainView = "seat" | "grades";

export default function App() {
  const seatManagerState = useSeatManagerState();
  const [loggedIn, setLoggedIn] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<AppTab>("common");
  const [mainView, setMainView] = useState<MainView>("seat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<AppStudent | null>(null);
  const [showCommentWorkbench, setShowCommentWorkbench] = useState(false);
  const [lockedSeats, setLockedSeats] = useState<Set<number>>(() => new Set(seatManagerState.lockedSeats));
  const [accountOpen, setAccountOpen] = useState(false);

  function toggleLock(idx: number) {
    setLockedSeats(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  const studentCount = seatManagerState.students.length;
  const seatCount = seatManagerState.seatOrder.length;

  if (!loggedIn) {
    return <LoginScreen onLogin={() => setLoggedIn(true)} />;
  }

  return (
    <AppShell
      sidebarCollapsed={sidebarCollapsed}
      header={
        <TopHeader
          studentCount={studentCount}
          seatCount={seatCount}
          sidebarCollapsed={sidebarCollapsed}
          accountOpen={accountOpen}
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
          onToggleAccount={() => setAccountOpen(v => !v)}
          onCloseAccount={() => setAccountOpen(false)}
          onLogout={() => setLoggedIn(false)}
        />
      }
      sidebar={
        <Sidebar
          activeTab={sidebarTab}
          students={seatManagerState.students}
          onTabChange={tab => {
            setSidebarTab(tab);
            if (tab === "scores") setMainView("grades");
          }}
          onShowGrades={() => setMainView("grades")}
          onHideGrades={() => setMainView("seat")}
          mainView={mainView}
        />
      }
      mainTabs={
        <MainTabs
          activeView={mainView}
          onChangeView={setMainView}
          onOpenCommentWorkbench={() => setShowCommentWorkbench(true)}
        />
      }
      overlays={
        <>
          {selectedStudent && (
            <StudentDetail
              student={selectedStudent}
              students={seatManagerState.students}
              onClose={() => setSelectedStudent(null)}
            />
          )}

          {showCommentWorkbench && (
            <CommentWorkbench onClose={() => setShowCommentWorkbench(false)} />
          )}
        </>
      }
    >
      {mainView === "seat" && (
        <div className="h-full bg-white overflow-hidden flex flex-col px-6 py-4">
          <SeatBoard
            students={seatManagerState.students}
            seatOrder={seatManagerState.seatOrder}
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
    </AppShell>
  );
}
