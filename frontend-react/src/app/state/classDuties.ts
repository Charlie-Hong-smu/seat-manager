import { resolveSeatLayout } from "./seatLayout";
import { normalizeSubjectCatalog } from "./teacherWorkbench";
import type { AppStudent, Dormitory, SeatManagerState } from "./types";

export type ClassDutyCategory = "class" | "subject";
export interface ClassDuty { id: string; name: string; category: ClassDutyCategory }
export interface ClassDuties {
  version: 1;
  roles: ClassDuty[];
  assignments: Record<string, string[]>;
  groupLeaders: Record<string, string>;
  dormitoryLeaders: Record<string, string>;
}
export interface DutyGroup { id: string; name: string; memberIds: string[] }
export interface ClassDutiesBinding {
  value: ClassDuties;
  groups: DutyGroup[];
  students: AppStudent[];
  dormitories: Dormitory[];
  notify: (message: string) => void;
  onChange: (update: (current: ClassDuties) => ClassDuties) => void;
}
type DutyState = Pick<SeatManagerState, "students" | "settings" | "seatSettings" | "seatOrder" | "dormitories">;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const cleanName = (value: unknown) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 30) : "";
const strings = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && Boolean(id)))] : [];
const CLASS_ROLES = ["班长", "副班长", "学习委员", "纪律委员", "劳动委员", "生活委员", "体育委员", "文艺委员", "宣传委员", "团支书", "组织委员", "心理委员", "电教管理员"];

export function defaultClassDutyRoles(subjects?: unknown): ClassDuty[] {
  return [
    ...CLASS_ROLES.map((name, index): ClassDuty => ({ id: `class-duty-${index}`, name, category: "class" })),
    ...normalizeSubjectCatalog(subjects).map((subject): ClassDuty => ({ id: `subject-duty-${subject}`, name: `${subject}课代表`, category: "subject" })),
  ];
}

/** An explicit empty catalog stays empty; defaults are only for older, unconfigured books. */
function readCatalog(value: unknown, subjects?: unknown): ClassDuty[] {
  if (!Array.isArray(value)) return defaultClassDutyRoles(subjects);
  const ids = new Set<string>();
  const names = new Set<string>();
  return value.flatMap(item => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id || ids.has(item.id)) return [];
    const name = cleanName(item.name);
    if (!name || names.has(name)) return [];
    ids.add(item.id); names.add(name);
    return [{ id: item.id, name, category: item.category === "subject" ? "subject" as const : "class" as const }];
  });
}

export function getDutyGroups(state: Pick<DutyState, "seatSettings" | "seatOrder">): DutyGroup[] {
  const layout = resolveSeatLayout(state.seatSettings.layout, state.seatOrder.length);
  const occupants = new Map(layout.seats.map((seat, index) => [seat.id, state.seatOrder[index]]));
  return layout.groups.map(group => ({ id: group.id, name: group.name, memberIds: strings(group.seatIds.map(id => occupants.get(id))) }));
}

export function readClassDuties(state: DutyState): ClassDuties {
  const raw = isRecord(state.settings.classDuties) ? state.settings.classDuties : {};
  const roles = readCatalog(raw.roles, state.settings.subjectCatalog);
  const active = new Set(state.students.filter(student => student.enrollmentStatus !== "archived").map(student => student.id));
  const assignments = isRecord(raw.assignments) ? raw.assignments : {};
  const leaders = (value: unknown, groups: DutyGroup[]): Record<string, string> => {
    const source = isRecord(value) ? value : {};
    return Object.fromEntries(groups.flatMap(group => {
      const id = source[group.id];
      return typeof id === "string" && active.has(id) && group.memberIds.includes(id) ? [[group.id, id]] : [];
    }));
  };
  return {
    version: 1, roles,
    assignments: Object.fromEntries(roles.flatMap(role => {
      const ids = strings(assignments[role.id]).filter(id => active.has(id));
      return ids.length ? [[role.id, ids]] : [];
    })),
    groupLeaders: leaders(raw.groupLeaders, getDutyGroups(state)),
    dormitoryLeaders: leaders(raw.dormitoryLeaders, state.dormitories),
  };
}

/** Normalize at the state boundary so invalid appointments cannot reappear on restore or undo. */
export function reconcileClassDuties(state: SeatManagerState): SeatManagerState {
  if (state.settings.classDuties === undefined) return state;
  const classDuties = readClassDuties(state);
  return JSON.stringify(classDuties) === JSON.stringify(state.settings.classDuties)
    ? state : { ...state, settings: { ...state.settings, classDuties } };
}

export function resetClassDutiesForNewTerm(settings: Record<string, unknown>): Record<string, unknown> {
  if (settings.classDuties === undefined) return settings;
  const raw = isRecord(settings.classDuties) ? settings.classDuties : {};
  return { ...settings, classDuties: { version: 1, roles: readCatalog(raw.roles, settings.subjectCatalog), assignments: {}, groupLeaders: {}, dormitoryLeaders: {} } satisfies ClassDuties };
}

export function classDutyNameError(name: string, roles: ClassDuty[], exceptId?: string): string {
  if (!name.trim()) return "请输入职务名称";
  if (name.trim().length > 30) return "职务名称最多 30 个字";
  if (roles.some(role => role.id !== exceptId && cleanName(role.name) === cleanName(name))) return "已有同名职务";
  return "";
}

export function setStudentClassDuties(current: ClassDuties, studentId: string, roleIds: string[]): ClassDuties {
  return { ...current, assignments: Object.fromEntries(current.roles.map(role => {
    const others = (current.assignments[role.id] || []).filter(id => id !== studentId);
    return [role.id, roleIds.includes(role.id) ? [...others, studentId] : others];
  })) };
}

export function studentDutyLabels(binding: ClassDutiesBinding, studentId: string): string[] {
  const { value, groups, dormitories } = binding;
  return [
    ...value.roles.filter(role => value.assignments[role.id]?.includes(studentId)).map(role => role.name),
    ...groups.filter(group => value.groupLeaders[group.id] === studentId).map(group => `${group.name}组长`),
    ...dormitories.filter(dorm => value.dormitoryLeaders[dorm.id] === studentId).map(dorm => `${dorm.name}宿舍长`),
  ];
}
