import { useEffect, useRef, useState } from "react";

import { AppShell } from "./components/AppShell";
import { LoginScreen } from "./components/LoginScreen";
import { MainTabs } from "./components/MainTabs";
import { Sidebar } from "./components/Sidebar";
import { SeatBoard } from "./components/SeatBoard";
import { StudentDetail } from "./components/StudentDetail";
import { CommentWorkbench } from "./components/CommentWorkbench";
import { GradesPage } from "./components/GradesPage";
import { TopHeader } from "./components/TopHeader";
import {
  buildSeatOrderByStudentList,
  placeStudentInFirstEmptySeat,
  shuffleUnlockedSeats,
  swapSeatOrder,
  type SeatOrder,
} from "./state/seatActions";
import { clearAuth, isAuthenticated } from "./state/authStorage";
import { createStudent } from "./state/studentActions";
import { saveLegacySnapshot } from "./state/legacyWriteAdapter";
import { useSeatManagerState } from "./state/store";
import type { AppStudent, Gender } from "./state/types";

type AppTab = "common" | "import" | "scores" | "history";
type MainView = "seat" | "grades";

export default function App() {
  const seatManagerState = useSeatManagerState();
  const [loggedIn, setLoggedIn] = useState(() => isAuthenticated());
  const [sidebarTab, setSidebarTab] = useState<AppTab>("common");
  const [mainView, setMainView] = useState<MainView>("seat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [students, setStudents] = useState<AppStudent[]>(() => seatManagerState.students);
  const [selectedStudent, setSelectedStudent] = useState<AppStudent | null>(null);
  const [showCommentWorkbench, setShowCommentWorkbench] = useState(false);
  const [seatOrder, setSeatOrder] = useState<SeatOrder>(() => seatManagerState.seatOrder);
  const [seatHistory, setSeatHistory] = useState<SeatOrder[]>([]);
  const [lockedSeats, setLockedSeats] = useState<Set<number>>(() => new Set(seatManagerState.lockedSeats));
  const [accountOpen, setAccountOpen] = useState(false);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (!loggedIn) {
      return;
    }
    saveLegacySnapshot({
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
    });
  }, [students, seatOrder, lockedSeats, loggedIn]);

  function toggleLock(idx: number) {
    setLockedSeats(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function commitSeatOrder(next: SeatOrder) {
    setSeatHistory(prev => [seatOrder, ...prev].slice(0, 20));
    setSeatOrder(next);
  }

  function handleMoveSeat(fromIndex: number, toIndex: number) {
    const next = swapSeatOrder(seatOrder, fromIndex, toIndex, lockedSeats);
    if (next !== seatOrder) {
      commitSeatOrder(next);
    }
  }

  function handleRandomizeSeats() {
    commitSeatOrder(shuffleUnlockedSeats(seatOrder, lockedSeats));
  }

  function handleOrderSeatsByList() {
    commitSeatOrder(buildSeatOrderByStudentList(students));
  }

  function handleUndoSeatOrder() {
    setSeatHistory(prev => {
      const [last, ...rest] = prev;
      if (last) {
        setSeatOrder(last);
      }
      return rest;
    });
  }

  function handleAddStudent(name: string, gender: Gender, alias?: string) {
    const student = createStudent({ name, gender, alias });
    setStudents(prev => [...prev, student]);
    commitSeatOrder(placeStudentInFirstEmptySeat(seatOrder, student.id, students.length + 1));
  }

  const studentCount = students.length;
  const seatCount = seatOrder.length;

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
          onLogout={() => {
            clearAuth();
            setLoggedIn(false);
          }}
        />
      }
      sidebar={
        <Sidebar
          activeTab={sidebarTab}
          students={students}
          gradeExams={seatManagerState.gradeExams}
          canUndoSeatOrder={seatHistory.length > 0}
          onRandomizeSeats={handleRandomizeSeats}
          onOrderSeatsByList={handleOrderSeatsByList}
          onUndoSeatOrder={handleUndoSeatOrder}
          onAddStudent={handleAddStudent}
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
              students={students}
              onClose={() => setSelectedStudent(null)}
            />
          )}

          {showCommentWorkbench && (
            <CommentWorkbench students={students} onClose={() => setShowCommentWorkbench(false)} />
          )}
        </>
      }
    >
      {mainView === "seat" && (
        <div className="h-full bg-white overflow-hidden flex flex-col px-6 py-4">
          <SeatBoard
            students={students}
            seatOrder={seatOrder}
            onSelectStudent={setSelectedStudent}
            onMoveSeat={handleMoveSeat}
            lockedSeats={lockedSeats}
            onToggleLock={toggleLock}
          />
        </div>
      )}

      {mainView === "grades" && (
        <div className="h-full overflow-auto">
          <GradesPage exams={seatManagerState.gradeExams} />
        </div>
      )}
    </AppShell>
  );
}
