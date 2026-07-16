import { createActivityEvent } from "./activityEvents";
import type { ActivityEvent, AttendanceRecord, AttendanceStatus, FollowupTask, SeatManagerState, StudentId } from "./types";

export function completeFollowupTask(task: FollowupTask, resolutionNote = ""): { task: FollowupTask; event: ActivityEvent } {
  const now = new Date().toISOString();
  const next = { ...task, status: "completed" as const, completedAt: now, updatedAt: now, resolutionNote: resolutionNote.trim() || task.resolutionNote, resolutionUpdatedAt: resolutionNote.trim() ? now : task.resolutionUpdatedAt };
  return { task: next, event: createActivityEvent({ action: "status_changed", ref: { domain: "followup", entityId: task.id, studentId: task.studentId || undefined }, studentIds: task.studentId ? [task.studentId] : [], title: `完成跟进：${task.title}`, detail: resolutionNote.trim() || "已完成" }) };
}

export function updateFollowupResolution(task: FollowupTask, resolutionNote: string): { task: FollowupTask; event: ActivityEvent } {
  const now = new Date().toISOString();
  const note = resolutionNote.trim();
  return { task: { ...task, resolutionNote: note || undefined, resolutionUpdatedAt: now, updatedAt: now }, event: createActivityEvent({ action: "updated", ref: { domain: "followup", entityId: task.id, studentId: task.studentId || undefined }, studentIds: task.studentId ? [task.studentId] : [], title: `更新处理结果：${task.title}`, detail: note || "清空处理结果" }) };
}

export function normalizeAttendancePatch(current: AttendanceRecord | undefined, status: AttendanceStatus): Pick<AttendanceRecord, "status" | "late" | "earlyLeave" | "leaveStart" | "leaveEnd"> {
  if (status === "normal") return { status, late: false, earlyLeave: false, leaveStart: undefined, leaveEnd: undefined };
  if (status === "absent") return { status, late: false, earlyLeave: false, leaveStart: undefined, leaveEnd: undefined };
  return { status, late: false, earlyLeave: false, leaveStart: current?.status === "leave" ? current.leaveStart : undefined, leaveEnd: current?.status === "leave" ? current.leaveEnd : undefined };
}

export function archiveStudent(state: SeatManagerState, studentId: StudentId): SeatManagerState {
  const student = state.students.find(item => item.id === studentId);
  if (!student || student.enrollmentStatus === "archived") return state;
  const now = new Date().toISOString();
  const event = createActivityEvent({ action: "archived", ref: { domain: "student", entityId: studentId, studentId }, studentIds: [studentId], title: `移出当前班级：${student.name}`, detail: "历史数据已保留", occurredAt: now });
  return {
    ...state,
    students: state.students.map(item => item.id === studentId ? { ...item, enrollmentStatus: "archived", archivedAt: now } : item),
    seatOrder: state.seatOrder.map(id => id === studentId ? null : id),
    dormitories: state.dormitories.map(dorm => ({ ...dorm, memberIds: dorm.memberIds.filter(id => id !== studentId) })),
    activityEvents: [event, ...state.activityEvents],
  };
}

export function restoreStudent(state: SeatManagerState, studentId: StudentId): SeatManagerState {
  const student = state.students.find(item => item.id === studentId);
  if (!student || student.enrollmentStatus !== "archived") return state;
  const event = createActivityEvent({ action: "restored", ref: { domain: "student", entityId: studentId, studentId }, studentIds: [studentId], title: `恢复到当前班级：${student.name}`, detail: "已恢复为在班学生" });
  return { ...state, students: state.students.map(item => item.id === studentId ? { ...item, enrollmentStatus: "active", archivedAt: undefined } : item), activityEvents: [event, ...state.activityEvents] };
}

export function permanentlyDeleteStudent(state: SeatManagerState, studentId: StudentId): SeatManagerState {
  const remove = (ids?: StudentId[]) => ids?.filter(id => id !== studentId);
  return {
    ...state,
    students: state.students.filter(student => student.id !== studentId),
    seatOrder: state.seatOrder.map(id => id === studentId ? null : id),
    seatSettings: { ...state.seatSettings, constraints: { ...state.seatSettings.constraints, lockedDeskmatePairs: state.seatSettings.constraints.lockedDeskmatePairs.filter(pair => pair.a !== studentId && pair.b !== studentId), noDeskmatePairs: state.seatSettings.constraints.noDeskmatePairs.filter(pair => pair.a !== studentId && pair.b !== studentId), frontRowStudentIds: state.seatSettings.constraints.frontRowStudentIds.filter(id => id !== studentId) } },
    attendanceRecords: state.attendanceRecords.filter(record => record.studentId !== studentId),
    followupTasks: state.followupTasks.filter(task => task.studentId !== studentId),
    communicationDrafts: state.communicationDrafts.filter(draft => draft.studentId !== studentId),
    homeworkAssignments: state.homeworkAssignments.map(assignment => { const studentStates = { ...assignment.studentStates }; delete studentStates[studentId]; return { ...assignment, studentStates, participantStudentIds: remove(assignment.participantStudentIds) }; }),
    drawSessions: state.drawSessions.map(session => ({ ...session, studentIds: session.studentIds.filter(id => id !== studentId) })).filter(session => session.studentIds.length > 0),
    fundTransactions: state.fundTransactions.map(tx => ({ ...tx, relatedStudentIds: remove(tx.relatedStudentIds), relatedStudentId: tx.relatedStudentId === studentId ? undefined : tx.relatedStudentId })),
    dormitories: state.dormitories.map(dorm => ({ ...dorm, memberIds: dorm.memberIds.filter(id => id !== studentId), events: dorm.events.map(event => ({ ...event, responsibleStudentIds: remove(event.responsibleStudentIds), responsibleStudentId: event.responsibleStudentId === studentId ? undefined : event.responsibleStudentId })), history: dorm.history.map(archive => ({ ...archive, events: archive.events.map(event => ({ ...event, responsibleStudentIds: remove(event.responsibleStudentIds), responsibleStudentId: event.responsibleStudentId === studentId ? undefined : event.responsibleStudentId })) })) })),
    gradeExams: state.gradeExams.map(exam => ({ ...exam, rows: exam.rows.filter(row => row.studentId !== studentId), itemAnalysis: exam.itemAnalysis ? { ...exam.itemAnalysis, rows: exam.itemAnalysis.rows.filter(row => row.studentId !== studentId) } : undefined })),
    activityEvents: state.activityEvents.flatMap(event => {
      if (event.ref.domain === "student" && event.ref.entityId === studentId) return [];
      const remainingStudentIds = event.studentIds.filter(id => id !== studentId);
      if ((event.ref.studentId === studentId || event.studentIds.includes(studentId)) && !remainingStudentIds.length) return [];
      return [{ ...event, studentIds: remainingStudentIds, ref: event.ref.studentId === studentId ? { ...event.ref, studentId: undefined } : event.ref }];
    }),
  };
}
