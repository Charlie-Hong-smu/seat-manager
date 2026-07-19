import { useState } from "react";
import {
  ChevronDown,
  Dices,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Shuffle,
  Undo2,
  UserPlus,
  Users,
} from "lucide-react";

import { SeatSettingsModal } from "../SeatSettingsModal";
import { Button, SegmentedControl, SelectMenu, ToolDrawer } from "../ui";
import type {
  AppStudent,
  Gender,
  SeatSettings,
  StudentId,
} from "../../state/types";
import { SeatBoard } from "../SeatBoard";
import { drawStudents, todayKey } from "../../state/dailyManagement";
import type { AttendanceRecord, DrawSession, FollowupTask } from "../../state/types";

export function DailyWorkspace({
  students,
  seatOrder,
  lockedSeats,
  seatSettings,
  canUndoSeatOrder,
  onRandomizeSeats,
  onOrderSeatsByList,
  onUndoSeatOrder,
  onUpdateSeatSettings,
  onApplySeatLayout,
  onAddStudent,
  onSelectStudent,
  onOpenStudentFollowup,
  onMoveSeat,
  onAssignStudentToSeat,
  onToggleLock,
  drawSessions,
  onDrawSessionsChange,
  attendanceRecords,
  followupTasks,
  onOpenAttendance,
  onOpenFollowups,
}: {
  students: AppStudent[];
  seatOrder: Array<StudentId | null>;
  lockedSeats: Set<number>;
  seatSettings: SeatSettings;
  canUndoSeatOrder: boolean;
  onRandomizeSeats: () => void;
  onOrderSeatsByList: () => void;
  onUndoSeatOrder: () => void;
  onUpdateSeatSettings: (updater: (current: SeatSettings) => SeatSettings) => void;
  onApplySeatLayout: (layout: NonNullable<SeatSettings["layout"]>) => void;
  onAddStudent: (name: string, gender: Gender, alias?: string) => void;
  onSelectStudent: (student: AppStudent) => void;
  onOpenStudentFollowup: (student: AppStudent) => void;
  onMoveSeat: (fromIndex: number, toIndex: number) => void;
  onAssignStudentToSeat: (studentId: StudentId, seatIndex: number) => void;
  onToggleLock: (idx: number) => void;
  drawSessions: DrawSession[];
  onDrawSessionsChange: (sessions: DrawSession[]) => void;
  attendanceRecords: AttendanceRecord[];
  followupTasks: FollowupTask[];
  onOpenAttendance: () => void;
  onOpenFollowups: () => void;
}) {
  const [showSeatSettings, setShowSeatSettings] = useState(false);
  const [activeTool, setActiveTool] = useState<"student" | "draw" | null>(null);
  const [cardMode, setCardMode] = useState<"compact" | "detail">("compact");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [alias, setAlias] = useState("");
  const [drawerSearch, setDrawerSearch] = useState("");
  const [drawCount, setDrawCount] = useState(1);
  const [noRepeat, setNoRepeat] = useState(false);
  const [drawResult, setDrawResult] = useState<string[]>([]);
  const [drawHistory, setDrawHistory] = useState<Array<{ id: string; time: string; names: string[] }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const drawerStudents = students.filter(student => !drawerSearch || student.name.includes(drawerSearch) || student.aliases.some(item => item.includes(drawerSearch))).slice(0, 8);
  const constraints = seatSettings.constraints;
  const activeConstraintCount = constraints.lockedDeskmatePairs.length
    + constraints.noDeskmatePairs.length
    + constraints.frontRowStudentIds.length
    + seatSettings.complementRuleIds.length
    + (seatSettings.pairByGender ? 1 : 0);
  const todayAttendance = attendanceRecords.filter(item => item.date === todayKey());
  const abnormalAttendance = todayAttendance.filter(item => item.status !== "normal" || item.late || item.earlyLeave).length;
  const dueTasks = followupTasks.filter(item => item.status === "pending" && item.dueDate <= todayKey()).length;

  function addStudent() {
    if (!name.trim()) return;
    onAddStudent(name, gender, alias);
    setName("");
    setGender("");
    setAlias("");
  }

  function draw() {
    const usedToday = noRepeat ? new Set(drawSessions.filter(item => item.date === todayKey()).flatMap(item => item.studentIds)) : new Set<string>();
    let selected = drawStudents(students, drawCount, usedToday);
    if (!selected.length && noRepeat) selected = drawStudents(students, drawCount);
    const picked = selected.map(student => student.name);
    if (selected.length) onDrawSessionsChange([{ id: `draw-${Date.now()}`, date: todayKey(), studentIds: selected.map(student => student.id), createdAt: new Date().toISOString() }, ...drawSessions].slice(0, 50));
    setDrawResult(picked);
    setDrawHistory(current => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, time: new Date().toLocaleTimeString("zh-CN", { hour12: false }), names: picked },
      ...current,
    ].slice(0, 10));
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--app-bg)]">
      <div className="daily-toolbar flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--app-border)] bg-white px-4 py-3">
        <div className="daily-toolbar-primary flex flex-1 items-center gap-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--app-radius-sm)] bg-gray-100 px-2.5 text-xs font-bold text-gray-600">
              <Users className="h-3.5 w-3.5" />{students.length} 人
            </span>
            <span className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-[var(--app-radius-sm)] bg-gray-100 px-2.5 text-xs font-bold text-gray-600">
              <LayoutGrid className="h-3.5 w-3.5" />{seatOrder.length} 座
            </span>
            <button onClick={onOpenAttendance} className={`h-8 rounded-[var(--app-radius-sm)] px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 ${abnormalAttendance > 0 ? "bg-amber-50 text-amber-700 hover:bg-amber-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>今日异常 {abnormalAttendance}</button>
            <button onClick={onOpenFollowups} className={`h-8 rounded-[var(--app-radius-sm)] px-2.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25 ${dueTasks > 0 ? "bg-blue-50 text-blue-700 hover:bg-blue-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>待跟进 {dueTasks}</button>
          </div>

        </div>

        <div className="daily-toolbar-actions ml-auto flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
          <SegmentedControl
            value={cardMode}
            ariaLabel="座位卡显示方式"
            onChange={value => setCardMode(value as "compact" | "detail")}
            options={[
              { value: "compact", label: "简洁", icon: <Minimize2 className="h-3.5 w-3.5" /> },
              { value: "detail", label: "详细", icon: <Maximize2 className="h-3.5 w-3.5" /> },
            ]}
          />
          <Button size="sm" onClick={() => setShowSeatSettings(true)}>
            <Shuffle className="h-4 w-4" />排座
            {activeConstraintCount > 0 && <span className="text-[11px] font-medium text-blue-100">· {activeConstraintCount} 条规则</span>}
          </Button>
          <Button size="sm" variant="ghost" disabled={!canUndoSeatOrder} onClick={onUndoSeatOrder}>
            <Undo2 className="h-4 w-4" />撤销
          </Button>
          <Button id="daily-student-tool-trigger" size="sm" variant={activeTool === "student" ? "secondary" : "ghost"} onClick={() => setActiveTool(activeTool === "student" ? null : "student")}>
            <UserPlus className="h-4 w-4" />新增学生
          </Button>
          <Button id="daily-draw-tool-trigger" size="sm" variant={activeTool === "draw" ? "secondary" : "ghost"} onClick={() => setActiveTool(activeTool === "draw" ? null : "draw")}>
            <Dices className="h-4 w-4" />抽签
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <div className="h-full min-h-0 overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-white p-4 shadow-[var(--app-shadow-card)]">
          <SeatBoard cardMode={cardMode} students={students} seatOrder={seatOrder} seatSettings={seatSettings} onSelectStudent={onSelectStudent} onOpenStudentFollowup={onOpenStudentFollowup} onMoveSeat={onMoveSeat} onAssignStudentToSeat={onAssignStudentToSeat} lockedSeats={lockedSeats} onToggleLock={onToggleLock} />
        </div>
      </div>

      <ToolDrawer open={activeTool === "student"} title="学生工具" returnFocusId="daily-student-tool-trigger" onClose={() => setActiveTool(null)}>
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-bold text-gray-800">新增学生</h3>
            <p className="mt-1 text-xs leading-5 text-gray-400">新学生会自动安排到第一个空座位。</p>
          </div>
          <div className="space-y-3 rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-gray-50 p-3">
            <input value={name} onChange={event => setName(event.target.value)} className="h-10 w-full rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="姓名" />
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <input value={alias} onChange={event => setAlias(event.target.value)} className="h-10 min-w-0 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-3 text-sm outline-none focus:border-blue-300" placeholder="别名 / 拼音（可选）" />
              <SelectMenu value={gender} onChange={value => setGender(value as Gender)} ariaLabel="学生性别" options={[{ value: "", label: "未知" }, { value: "男", label: "男" }, { value: "女", label: "女" }]} />
            </div>
            <Button className="w-full" disabled={!name.trim()} onClick={addStudent}><Plus className="h-4 w-4" />添加到班级</Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-bold text-gray-800">查找已有学生</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={drawerSearch} onChange={event => setDrawerSearch(event.target.value)} className="h-10 w-full rounded-[var(--app-radius-sm)] border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:border-blue-300 focus:bg-white" placeholder="姓名或别名" />
            </div>
            {drawerSearch && (
              <div className="mt-2 divide-y divide-gray-50 overflow-hidden rounded-[var(--app-radius-sm)] border border-[var(--app-border)]">
                {drawerStudents.map(student => (
                  <button key={student.id} type="button" onClick={() => onSelectStudent(student)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm hover:bg-blue-50">
                    <span className="font-semibold text-gray-700">{student.name}</span><span className="text-xs text-gray-400">{student.gender || "未知"}</span>
                  </button>
                ))}
                {drawerStudents.length === 0 && <div className="px-3 py-5 text-center text-sm text-gray-400">无匹配结果</div>}
              </div>
            )}
          </div>
        </div>
      </ToolDrawer>

      <ToolDrawer open={activeTool === "draw"} title="课堂抽签" returnFocusId="daily-draw-tool-trigger" onClose={() => setActiveTool(null)}>
        <div className="space-y-4">
          <div className="rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-600">
                人数
                <input type="number" min={1} max={Math.max(1, students.length)} value={drawCount} onChange={event => setDrawCount(Number(event.target.value) || 1)} className="h-9 w-16 rounded-[var(--app-radius-sm)] border border-gray-200 bg-white px-2 text-center outline-none focus:border-blue-300" />
              </label>
              <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
                <input type="checkbox" checked={noRepeat} onChange={event => setNoRepeat(event.target.checked)} className="h-4 w-4 accent-blue-600" />去重
              </label>
            </div>
            <Button className="mt-4 w-full" onClick={draw}><Dices className="h-4 w-4" />开始抽签</Button>
          </div>
          {drawResult.length > 0 && (
            <div className="surface-enter rounded-[var(--app-radius-md)] border border-blue-100 bg-blue-50 p-4">
              <div className="mb-2 text-xs font-bold text-blue-500">本次结果</div>
              <div className="flex flex-wrap gap-2">{drawResult.map(resultName => <span key={resultName} className="rounded-full bg-blue-600 px-3 py-1.5 text-sm font-bold text-white">{resultName}</span>)}</div>
            </div>
          )}
          {drawHistory.length > 0 && (
            <div className="overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-white">
              <button type="button" onClick={() => setHistoryOpen(value => !value)} className="flex h-11 w-full items-center justify-between px-3 text-sm font-bold text-gray-600 hover:bg-gray-50">
                最近 {drawHistory.length} 次<ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
              </button>
              {historyOpen && <div className="divide-y divide-gray-50 border-t border-[var(--app-border)]">{drawHistory.map(item => (
                <div key={item.id} className="px-3 py-3"><div className="text-xs text-gray-400">{item.time}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{item.names.map(resultName => <span key={`${item.id}-${resultName}`} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{resultName}</span>)}</div></div>
              ))}</div>}
            </div>
          )}
        </div>
      </ToolDrawer>

      <SeatSettingsModal
        open={showSeatSettings}
        students={students}
        settings={seatSettings}
        seatCount={seatOrder.length}
        canUndo={canUndoSeatOrder}
        onUpdate={onUpdateSeatSettings}
        onApplyLayout={onApplySeatLayout}
        onRandomize={onRandomizeSeats}
        onOrderByList={onOrderSeatsByList}
        onUndo={onUndoSeatOrder}
        onClose={() => setShowSeatSettings(false)}
      />
    </div>
  );
}
