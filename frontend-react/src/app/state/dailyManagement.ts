import type { AppStudent, AttendanceRecord, AttendanceStatus, DrawSession, FollowupTask, FollowupTaskSource, FollowupTaskStatus, StudentId } from "./types";

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function todayKey(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function normalizeAttendanceRecords(raw: unknown): AttendanceRecord[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<string, AttendanceRecord>();
  raw.forEach((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const item = value as Record<string, unknown>;
    const studentId = typeof item.studentId === "string" ? item.studentId : "";
    const date = typeof item.date === "string" ? item.date : "";
    if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const status: AttendanceStatus = item.status === "leave" || item.status === "absent" ? item.status : "normal";
    const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();
    byKey.set(`${date}:${studentId}`, {
      id: typeof item.id === "string" ? item.id : `attendance-${index}`,
      studentId, date, status,
      late: item.late === true,
      earlyLeave: item.earlyLeave === true,
      note: typeof item.note === "string" ? item.note : "",
      leaveStart: typeof item.leaveStart === "string" ? item.leaveStart : undefined,
      leaveEnd: typeof item.leaveEnd === "string" ? item.leaveEnd : undefined,
      createdAt,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : createdAt,
    });
  });
  return [...byKey.values()];
}

export function upsertAttendance(records: AttendanceRecord[], input: Omit<AttendanceRecord, "id" | "createdAt" | "updatedAt">): AttendanceRecord[] {
  const existing = records.find(item => item.studentId === input.studentId && item.date === input.date);
  const isDefault = input.status === "normal" && !input.late && !input.earlyLeave && !input.note.trim() && !input.leaveStart && !input.leaveEnd;
  if (isDefault) return records.filter(item => item !== existing);
  const now = new Date().toISOString();
  const next: AttendanceRecord = { ...input, note: input.note.trim(), id: existing?.id || id("attendance"), createdAt: existing?.createdAt || now, updatedAt: now };
  return existing ? records.map(item => item === existing ? next : item) : [next, ...records];
}

export function normalizeFollowupTasks(raw: unknown): FollowupTask[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value, index): FollowupTask[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    if (typeof item.studentId !== "string" || typeof item.title !== "string" || !item.title.trim()) return [];
    const status: FollowupTaskStatus = item.status === "completed" || item.status === "cancelled" ? item.status : "pending";
    const source: FollowupTaskSource = ["ai", "score", "attendance", "dormitory", "homework"].includes(String(item.source)) ? item.source as FollowupTaskSource : "manual";
    const createdAt = typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString();
    const sourceRef = item.sourceRef && typeof item.sourceRef === "object" && !Array.isArray(item.sourceRef) ? item.sourceRef as Record<string, unknown> : null;
    return [{ id: typeof item.id === "string" ? item.id : `followup-${index}`, studentId: item.studentId, title: item.title.trim(), type: typeof item.type === "string" ? item.type : "常规跟进", description: typeof item.description === "string" ? item.description : "", plannedDate: typeof item.plannedDate === "string" ? item.plannedDate : "", dueDate: typeof item.dueDate === "string" ? item.dueDate : "", status, source, createdAt, updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : createdAt, completedAt: typeof item.completedAt === "string" ? item.completedAt : undefined, lastNotifiedAt: typeof item.lastNotifiedAt === "string" ? item.lastNotifiedAt : undefined, sourceRef: sourceRef && ["dormitory", "attendance", "ai", "homework", "score"].includes(String(sourceRef.domain)) && typeof sourceRef.entityId === "string" ? { domain: sourceRef.domain as "dormitory" | "attendance" | "ai" | "homework" | "score", entityId: sourceRef.entityId } : undefined }];
  });
}

export function createFollowupTask(input: { studentId: StudentId; title: string; type?: string; description?: string; plannedDate?: string; dueDate?: string; source?: FollowupTaskSource; sourceRef?: FollowupTask["sourceRef"] }): FollowupTask {
  const now = new Date().toISOString();
  return { id: id("followup"), studentId: input.studentId, title: input.title.trim(), type: input.type?.trim() || "常规跟进", description: input.description?.trim() || "", plannedDate: input.plannedDate || todayKey(), dueDate: input.dueDate || input.plannedDate || todayKey(), status: "pending", source: input.source || "manual", sourceRef: input.sourceRef, createdAt: now, updatedAt: now };
}

export function findOpenLinkedTask(tasks: FollowupTask[], studentId: StudentId, sourceRef: NonNullable<FollowupTask["sourceRef"]>): FollowupTask | undefined {
  return tasks.find(task => task.studentId === studentId && task.status === "pending" && task.sourceRef?.domain === sourceRef.domain && task.sourceRef.entityId === sourceRef.entityId);
}

export function batchUpsertAttendance(records: AttendanceRecord[], studentIds: StudentId[], date: string, patch: Partial<Pick<AttendanceRecord, "status" | "late" | "earlyLeave" | "note" | "leaveStart" | "leaveEnd">>): AttendanceRecord[] {
  return studentIds.reduce((current, studentId) => {
    const existing = current.find(item => item.studentId === studentId && item.date === date);
    return upsertAttendance(current, { studentId, date, status: patch.status ?? existing?.status ?? "normal", late: patch.late ?? existing?.late ?? false, earlyLeave: patch.earlyLeave ?? existing?.earlyLeave ?? false, note: patch.note ?? existing?.note ?? "", leaveStart: patch.leaveStart ?? existing?.leaveStart, leaveEnd: patch.leaveEnd ?? existing?.leaveEnd });
  }, records);
}

export function getTaskUrgency(task: FollowupTask, today = todayKey()): "overdue" | "today" | "upcoming" | "none" {
  if (task.status !== "pending" || !task.dueDate) return "none";
  if (task.dueDate < today) return "overdue";
  if (task.dueDate === today) return "today";
  return "upcoming";
}

export function normalizeDrawSessions(raw: unknown): DrawSession[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value, index): DrawSession[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const studentIds = Array.isArray(item.studentIds) ? item.studentIds.filter((v): v is string => typeof v === "string") : [];
    return studentIds.length ? [{ id: typeof item.id === "string" ? item.id : `draw-${index}`, date: typeof item.date === "string" ? item.date : todayKey(), studentIds, createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString() }] : [];
  }).slice(0, 50);
}

export function drawStudents(students: AppStudent[], count: number, excludedIds: Set<StudentId> = new Set()): AppStudent[] {
  const pool = students.filter(student => !excludedIds.has(student.id));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[other]] = [pool[other], pool[index]];
  }
  return pool.slice(0, Math.max(0, Math.min(Math.floor(count), pool.length)));
}
