import { useMemo, useState } from "react";
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
} from "lucide-react";

import { SeatSettingsModal } from "../SeatSettingsModal";
import { SeatLayoutDesigner } from "../SeatLayoutDesigner";
import { Checkbox, Button, DialogPresence, MetricStrip, SegmentedControl, SelectMenu, ToolDrawer, Input } from "../ui";
import type {
  AppStudent,
  Gender,
  SeatSettings,
  StudentId,
} from "../../state/types";
import { matchesStudentSearch } from "../../state/studentSearch";
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
  onMoveStudentToWaiting,
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
  onMoveStudentToWaiting: (fromIndex: number) => void;
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
  const [editingLayout, setEditingLayout] = useState(false);
  const [activeTool, setActiveTool] = useState<"student" | "draw" | null>(null);
  const [cardMode, setCardMode] = useState<"compact" | "detail">("compact");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<Gender>("");
  const [alias, setAlias] = useState("");
  const [drawerSearch, setDrawerSearch] = useState("");
  const [drawCount, setDrawCount] = useState(1);
  const [noRepeat, setNoRepeat] = useState(false);
  const [drawResult, setDrawResult] = useState<string[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  // 抽签历史直接读持久化的 drawSessions，切页或刷新后仍然可见。
  const drawHistory = useMemo(() => {
    const studentById = new Map(students.map(student => [student.id, student]));
    return drawSessions.slice(0, 10).map(session => ({
      id: session.id,
      time: `${session.date === todayKey() ? "" : `${session.date} `}${new Date(session.createdAt).toLocaleTimeString("zh-CN", { hour12: false })}`,
      names: session.studentIds.map(id => studentById.get(id)?.name || "已移出学生"),
    }));
  }, [drawSessions, students]);
  const drawerStudents = students.filter(student => matchesStudentSearch(student, drawerSearch)).slice(0, 8);
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
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background-primary-default">
      <div className="daily-toolbar flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--app-border)] bg-background-primary-default px-4 py-3">
        <div className="daily-toolbar-primary flex flex-1 items-center gap-3">
          <MetricStrip size="sm" items={[
            { key: "students", label: "学生", value: students.length },
            { key: "seats", label: "座位", value: seatOrder.length },
            { key: "abnormal", label: "今日异常", value: abnormalAttendance, dot: "bg-status-warning-500", onOpen: onOpenAttendance },
            { key: "tasks", label: "待跟进", value: dueTasks, dot: "bg-accent-500", onOpen: onOpenFollowups },
          ]} />
        </div>

        <div className="daily-toolbar-actions ml-auto flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
          {!editingLayout && <SegmentedControl
            value={cardMode}
            ariaLabel="座位卡显示方式"
            onChange={value => setCardMode(value as "compact" | "detail")}
            options={[
              { value: "compact", label: "简洁", icon: <Minimize2 className="h-3.5 w-3.5" /> },
              { value: "detail", label: "详细", icon: <Maximize2 className="h-3.5 w-3.5" /> },
            ]}
          />}
          {!editingLayout && <Button id="seat-layout-editor-trigger" size="sm" variant="ghost" onClick={() => { setActiveTool(null); setEditingLayout(true); }}>
            <LayoutGrid className="h-4 w-4" />编辑布局
          </Button>}
          {!editingLayout && <Button size="sm" variant="ghost" disabled={!canUndoSeatOrder} onClick={onUndoSeatOrder}>
            <Undo2 className="h-4 w-4" />撤销
          </Button>}
          {!editingLayout && <Button id="daily-student-tool-trigger" size="sm" variant={activeTool === "student" ? "secondary" : "ghost"} onClick={() => setActiveTool(activeTool === "student" ? null : "student")}>
            <UserPlus className="h-4 w-4" />新增学生
          </Button>}
          {!editingLayout && <Button id="daily-draw-tool-trigger" size="sm" variant={activeTool === "draw" ? "secondary" : "ghost"} onClick={() => setActiveTool(activeTool === "draw" ? null : "draw")}>
            <Dices className="h-4 w-4" />抽签
          </Button>}
          {!editingLayout && <Button size="sm" onClick={() => setShowSeatSettings(true)}>
            <Shuffle className="h-4 w-4" />排座
            {activeConstraintCount > 0 && <span className="text-[11px] font-medium text-accent-100">· {activeConstraintCount} 条规则</span>}
          </Button>}
        </div>
      </div>

      <div className="min-h-0 flex-1 p-4">
        <div className={`h-full min-h-0 overflow-hidden rounded-[var(--app-radius-lg)] border border-[var(--app-border)] bg-background-primary-default shadow-[var(--app-shadow-card)] ${editingLayout ? "" : "p-4"}`}>
          {editingLayout
            ? <SeatLayoutDesigner current={seatSettings.layout} seatCount={seatOrder.length} onApply={onApplySeatLayout} onCancel={() => setEditingLayout(false)} />
            : <SeatBoard cardMode={cardMode} students={students} seatOrder={seatOrder} seatSettings={seatSettings} onSelectStudent={onSelectStudent} onOpenStudentFollowup={onOpenStudentFollowup} onMoveSeat={onMoveSeat} onMoveStudentToWaiting={onMoveStudentToWaiting} onAssignStudentToSeat={onAssignStudentToSeat} lockedSeats={lockedSeats} onToggleLock={onToggleLock} />}
        </div>
      </div>

      <ToolDrawer open={activeTool === "student"} title="学生工具" returnFocusId="daily-student-tool-trigger" onClose={() => setActiveTool(null)}>
        <div className="space-y-5">
          <div>
            <h3 className="text-body-semibold text-text-primary">新增学生</h3>
            <p className="mt-1 text-caption-1-regular leading-5 text-text-tertiary">新学生会自动安排到第一个空座位。</p>
          </div>
          <div className="space-y-3">
            <Input value={name} onChange={setName} placeholder="姓名"   />
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Input value={alias} onChange={setAlias} placeholder="别名 / 拼音（可选）"  className="min-w-0" />
              <SelectMenu value={gender} onChange={value => setGender(value as Gender)} ariaLabel="学生性别" options={[{ value: "", label: "未知" }, { value: "男", label: "男" }, { value: "女", label: "女" }]} />
            </div>
            <Button className="w-full" disabled={!name.trim()} onClick={addStudent}><Plus className="h-4 w-4" />添加到班级</Button>
          </div>

          <div>
            <h3 className="mb-2 text-body-semibold text-text-primary">查找已有学生</h3>
            <Input value={drawerSearch} onChange={setDrawerSearch} leadingIcon={Search} placeholder="姓名或别名" className="" />
            {drawerSearch && (
              <div className="mt-2 divide-y divide-separator-border overflow-hidden rounded-[var(--app-radius-sm)] border border-[var(--app-border)]">
                {drawerStudents.map(student => (
                  <button key={student.id} type="button" onClick={() => onSelectStudent(student)} className="flex w-full items-center justify-between px-3 py-2.5 text-body-regular hover:bg-accent-50">
                    <span className="font-semibold text-text-primary">{student.name}</span><span className="text-caption-1-regular text-text-tertiary">{student.gender || "未知"}</span>
                  </button>
                ))}
                {drawerStudents.length === 0 && <div className="px-3 py-5 text-center text-body-regular text-text-tertiary">无匹配结果</div>}
              </div>
            )}
          </div>
        </div>
      </ToolDrawer>

      <ToolDrawer open={activeTool === "draw"} title="课堂抽签" returnFocusId="daily-draw-tool-trigger" onClose={() => setActiveTool(null)}>
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-body-regular text-text-secondary">
                人数
                <input type="number" min={1} max={Math.max(1, students.length)} value={drawCount} onChange={event => setDrawCount(Number(event.target.value) || 1)} className="h-9 w-16 rounded-[var(--app-radius-sm)] border border-border-button-default bg-background-primary-default px-2 text-center outline-none focus:border-accent-300" />
              </label>
              <Checkbox isSelected={noRepeat} onChange={setNoRepeat} className="ml-auto">去重</Checkbox>
            </div>
            <Button className="mt-4 w-full" onClick={draw}><Dices className="h-4 w-4" />开始抽签</Button>
          </div>
          {drawResult.length > 0 && (
            <div className="surface-enter rounded-[var(--app-radius-md)] border border-accent-100 bg-accent-50 p-4">
              <div className="mb-2 text-caption-1-semibold text-accent-500">本次结果</div>
              <div className="flex flex-wrap gap-2">{drawResult.map(resultName => <span key={resultName} className="rounded-full bg-accent-600 px-3 py-1.5 text-body-semibold text-text-white">{resultName}</span>)}</div>
            </div>
          )}
          {drawHistory.length > 0 && (
            <div className="overflow-hidden rounded-[var(--app-radius-md)] border border-[var(--app-border)] bg-background-primary-default">
              <button type="button" onClick={() => setHistoryOpen(value => !value)} className="flex h-11 w-full items-center justify-between px-3 text-body-semibold text-text-secondary hover:bg-background-secondary-default">
                最近 {drawHistory.length} 次<ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
              </button>
              {historyOpen && <div className="divide-y divide-separator-border border-t border-[var(--app-border)]">{drawHistory.map(item => (
                <div key={item.id} className="px-3 py-3"><div className="text-caption-1-regular text-text-tertiary">{item.time}</div><div className="mt-1.5 flex flex-wrap gap-1.5">{item.names.map(resultName => <span key={`${item.id}-${resultName}`} className="rounded-full bg-background-tertiary-default px-2 py-0.5 text-caption-1-regular text-text-primary">{resultName}</span>)}</div></div>
              ))}</div>}
            </div>
          )}
        </div>
      </ToolDrawer>

      <DialogPresence open={showSeatSettings}>
        <SeatSettingsModal
          open={showSeatSettings}
          students={students}
          settings={seatSettings}
          canUndo={canUndoSeatOrder}
          onUpdate={onUpdateSeatSettings}
          onRandomize={onRandomizeSeats}
          onOrderByList={onOrderSeatsByList}
          onUndo={onUndoSeatOrder}
          onClose={() => setShowSeatSettings(false)}
        />
      </DialogPresence>
    </div>
  );
}
