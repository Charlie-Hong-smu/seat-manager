import type { AppStudent, DormEvent, DormEventType, DormPeriodArchive, Dormitory, StudentId, StudentRecord } from "./types";
import { localDateKey } from "./dormitoryPeriods";

export const DORM_EVENT_PRESETS: Array<{ label: string; score: number; type: DormEventType }> = [
  { label: "晚上讲话", score: -2, type: "punish" },
  { label: "卫生优秀", score: 2, type: "reward" },
  { label: "按时熄灯", score: 1, type: "reward" },
  { label: "纪律提醒", score: -1, type: "punish" },
  { label: "内务扣分", score: -2, type: "punish" },
  { label: "主动协助", score: 1, type: "reward" },
];

export interface NewDormEventInput {
  dormId: string;
  score: number;
  reason: string;
  /** 多个责任人 ID（支持多人）。 */
  responsibleStudentIds?: StudentId[];
  note?: string;
  date?: string;
  /** 老师拟定的处罚措施（可选）。 */
  punishment?: string;
  /** 是否同时把这条事件写入责任人的个人奖惩档案。默认 true。 */
  recordToStudent?: boolean;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function calculateDormScore(dormitory: Pick<Dormitory, "baseScore" | "events">): number {
  return dormitory.baseScore + dormitory.events.reduce((sum, event) => sum + event.score, 0);
}

export function normalizeDormitoryScore(dormitory: Dormitory): Dormitory {
  return {
    ...dormitory,
    memberIds: Array.from(new Set(dormitory.memberIds)),
    currentScore: calculateDormScore(dormitory),
  };
}

export type DormitoryEventPatch = {
  reason?: string;
  score?: number;
  note?: string;
  punishment?: string;
  punishmentDone?: boolean;
  followupTaskIds?: string[];
  date?: string;
};

function applyDormitoryEventPatch(event: DormEvent, eventId: string, patch: DormitoryEventPatch): DormEvent {
  if (event.id !== eventId) return event;
  const score = patch.score !== undefined && Number.isFinite(patch.score) ? Math.round(patch.score * 10) / 10 : event.score;
  return {
    ...event,
    reason: patch.reason !== undefined ? patch.reason.trim() || event.reason : event.reason,
    score,
    type: score > 0 ? "reward" : score < 0 ? "punish" : "note",
    note: patch.note !== undefined ? patch.note.trim() : event.note,
    punishment: patch.punishment !== undefined ? patch.punishment.trim() : event.punishment,
    punishmentDone: patch.punishmentDone !== undefined ? patch.punishmentDone : event.punishmentDone,
    followupTaskIds: patch.followupTaskIds !== undefined ? patch.followupTaskIds : event.followupTaskIds,
    date: patch.date || event.date,
  };
}

export function updateDormitoryEventInLedger(dormitory: Dormitory, eventId: string, patch: DormitoryEventPatch): Dormitory {
  const events = dormitory.events.map(event => applyDormitoryEventPatch(event, eventId, patch));
  const history = dormitory.history.map(archive => {
    if (!archive.events.some(event => event.id === eventId)) return archive;
    const archiveEvents = archive.events.map(event => applyDormitoryEventPatch(event, eventId, patch));
    return { ...archive, events: archiveEvents, finalScore: archive.baseScore + archiveEvents.reduce((sum, event) => sum + event.score, 0) };
  });
  return normalizeDormitoryScore({ ...dormitory, events, history });
}

export function deleteDormitoryEventFromLedger(dormitory: Dormitory, eventId: string): Dormitory {
  const history = dormitory.history.map(archive => {
    const events = archive.events.filter(event => event.id !== eventId);
    return events.length === archive.events.length
      ? archive
      : { ...archive, events, finalScore: archive.baseScore + events.reduce((sum, event) => sum + event.score, 0) };
  });
  return normalizeDormitoryScore({ ...dormitory, events: dormitory.events.filter(event => event.id !== eventId), history });
}

export function createDormitory(name: string, baseScore = 0): Dormitory {
  const trimmedName = name.trim();
  return {
    id: createId("dorm"),
    name: trimmedName || "新宿舍",
    memberIds: [],
    baseScore,
    currentScore: baseScore,
    events: [],
    periodStart: localDateKey(),
    history: [],
  };
}

function formatPeriodLabel(startDate: string, endDate: string): string {
  if (startDate && endDate && startDate !== endDate) {
    return `${startDate} ~ ${endDate}`;
  }
  return endDate || startDate || localDateKey();
}

/**
 * 结算当前周期：把当前分和事件归档进 history，清空事件、刷新周期起点。
 * carryOver=true 时把结算分作为下一周期起始分，否则归零。
 */
export function closeDormitoryPeriod(dormitory: Dormitory, options: { carryOver?: boolean } = {}): Dormitory {
  const finalScore = calculateDormScore(dormitory);
  const endDate = localDateKey();
  const startDate = dormitory.periodStart || endDate;
  const archive: DormPeriodArchive = {
    id: createId("dorm-period"),
    label: formatPeriodLabel(startDate, endDate),
    startDate,
    endDate,
    baseScore: dormitory.baseScore,
    finalScore,
    events: dormitory.events,
  };
  const nextBaseScore = options.carryOver ? finalScore : 0;
  return {
    ...dormitory,
    baseScore: nextBaseScore,
    currentScore: nextBaseScore,
    events: [],
    periodStart: endDate,
    history: [archive, ...dormitory.history].slice(0, 50),
  };
}

export function createDormEvent(input: NewDormEventInput, students: AppStudent[]): DormEvent {
  const score = Number.isFinite(input.score) ? Math.round(input.score * 10) / 10 : 0;
  const ids = (input.responsibleStudentIds ?? []).filter(Boolean);
  const resolved = ids
    .map(id => students.find(student => student.id === id))
    .filter((student): student is AppStudent => Boolean(student));
  const responsibleIds = resolved.map(student => student.id);
  const responsibleNames = resolved.map(student => student.name);
  return {
    id: createId("dorm-event"),
    dormId: input.dormId,
    type: score > 0 ? "reward" : score < 0 ? "punish" : "note",
    score,
    reason: input.reason.trim() || "宿舍记录",
    // 向后兼容：保留单值字段（取第一个）
    responsibleStudentId: responsibleIds[0],
    responsibleStudentName: responsibleNames[0],
    responsibleStudentIds: responsibleIds.length ? responsibleIds : undefined,
    responsibleStudentNames: responsibleNames.length ? responsibleNames : undefined,
    note: input.note?.trim() || "",
    punishment: input.punishment?.trim() || "",
    punishmentDone: false,
    date: input.date || localDateKey(),
    createdAt: new Date().toISOString(),
  };
}

export function createDormStudentRecord(event: DormEvent, dormitory: Dormitory, studentId: StudentId): StudentRecord | null {
  if (!studentId || event.score === 0) {
    return null;
  }
  const action = event.score > 0 ? "加分" : "扣分";
  const noteParts = [`宿舍${action}：${event.reason}（影响 ${dormitory.name}）`];
  if (event.note) {
    noteParts.push(event.note);
  }
  return {
    id: `record-${event.id}-${studentId}`,
    type: event.score > 0 ? "reward" : "punish",
    note: noteParts.join(" · "),
    date: event.date,
  };
}
