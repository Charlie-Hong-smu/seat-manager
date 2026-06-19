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
import { CloudSyncModal } from "./components/CloudSyncModal";
import { InstallHelpModal } from "./components/InstallHelpModal";
import {
  buildSeatOrderByStudentList,
  placeStudentInFirstEmptySeat,
  shuffleUnlockedSeats,
  swapSeatOrder,
  type SeatOrder,
} from "./state/seatActions";
import { clearAuth, isAuthenticated } from "./state/authStorage";
import { createSeatManagerState } from "./state/legacyStateAdapter";
import { createStudent } from "./state/studentActions";
import { saveGradeExamRecord, saveLegacySnapshot } from "./state/legacyWriteAdapter";
import { readLegacyRootState } from "./state/storage";
import { useSeatManagerState } from "./state/store";
import type { AppStudent, Gender, GradeExam, SavedGradeExamRecord } from "./state/types";

type AppTab = "common" | "import" | "scores" | "history";
type MainView = "seat" | "grades";
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export default function App() {
  const initialState = useSeatManagerState();
  const [appState, setAppState] = useState(() => initialState);
  const [loggedIn, setLoggedIn] = useState(() => isAuthenticated());
  const [sidebarTab, setSidebarTab] = useState<AppTab>("common");
  const [mainView, setMainView] = useState<MainView>("seat");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [students, setStudents] = useState<AppStudent[]>(() => initialState.students);
  const [selectedStudent, setSelectedStudent] = useState<AppStudent | null>(null);
  const [showCommentWorkbench, setShowCommentWorkbench] = useState(false);
  const [seatOrder, setSeatOrder] = useState<SeatOrder>(() => initialState.seatOrder);
  const [seatHistory, setSeatHistory] = useState<SeatOrder[]>([]);
  const [lockedSeats, setLockedSeats] = useState<Set<number>>(() => new Set(initialState.lockedSeats));
  const [accountOpen, setAccountOpen] = useState(false);
  const [showCloudSync, setShowCloudSync] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [installMessage, setInstallMessage] = useState("当前浏览器没有直接提供安装确认，请按下面方式手动添加。");
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

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
      setInstallMessage("已安装到桌面。");
      setShowInstallHelp(true);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

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

  function saveCurrentLegacySnapshot() {
    saveLegacySnapshot({
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
    });
  }

  function reloadFromLegacyState() {
    const next = createSeatManagerState(readLegacyRootState());
    setAppState(next);
    setStudents(next.students);
    setSeatOrder(next.seatOrder);
    setLockedSeats(new Set(next.lockedSeats));
    setSeatHistory([]);
    setSelectedStudent(null);
  }

  function handleSaveScoreImport(record: SavedGradeExamRecord): GradeExam | null {
    const next = saveGradeExamRecord({
      record,
      students,
      seatOrder,
      lockedSeats: [...lockedSeats],
    });
    if (!next) {
      return null;
    }
    setAppState(next);
    setStudents(next.students);
    setSeatOrder(next.seatOrder);
    setLockedSeats(new Set(next.lockedSeats));
    setSeatHistory([]);
    setMainView("grades");
    return next.gradeExams.find(exam => exam.id === record.id) || next.gradeExams[0] || null;
  }

  async function handleInstallApp() {
    if (!installPrompt) {
      setInstallMessage("当前浏览器没有直接提供安装确认，请按下面方式手动添加。");
      setShowInstallHelp(true);
      return;
    }

    const promptEvent = installPrompt;
    setInstallPrompt(null);
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "dismissed") {
        setInstallMessage("已取消安装。需要时也可以按下面方式手动添加。");
        setShowInstallHelp(true);
      }
    } catch (error) {
      console.warn("安装确认未能打开", error);
      setInstallMessage("安装确认未能打开，请按下面方式手动添加。");
      setShowInstallHelp(true);
    }
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
          onInstallApp={handleInstallApp}
          onOpenCloudSync={() => setShowCloudSync(true)}
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
          gradeExams={appState.gradeExams}
          canUndoSeatOrder={seatHistory.length > 0}
          onRandomizeSeats={handleRandomizeSeats}
          onOrderSeatsByList={handleOrderSeatsByList}
          onUndoSeatOrder={handleUndoSeatOrder}
          onAddStudent={handleAddStudent}
          onSaveScoreImport={handleSaveScoreImport}
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

          {showCloudSync && (
            <CloudSyncModal
              open={showCloudSync}
              onClose={() => setShowCloudSync(false)}
              onBeforeUpload={saveCurrentLegacySnapshot}
              onRestored={reloadFromLegacyState}
            />
          )}

          {showInstallHelp && (
            <InstallHelpModal message={installMessage} onClose={() => setShowInstallHelp(false)} />
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
          <GradesPage exams={appState.gradeExams} />
        </div>
      )}
    </AppShell>
  );
}
