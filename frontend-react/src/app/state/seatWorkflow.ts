import { readClassDuties, reconcileClassDuties } from "./classDuties";
import { resolveSeatLayout } from "./seatLayout";
import type { SeatHistorySnapshot, SeatManagerState, StudentId } from "./types";

function seating(state: SeatManagerState) {
  return { order: [...state.seatOrder], layout: state.seatSettings.layout, locks: [...state.lockedSeats], groupLeaders: { ...readClassDuties(state).groupLeaders } };
}
export interface SeatUndoEntry { before: ReturnType<typeof seating>; after: ReturnType<typeof seating> }
export function captureSeatChange(before: SeatManagerState, after: SeatManagerState): SeatUndoEntry {
  return { before: seating(before), after: seating(reconcileClassDuties(after)) };
}

export function restoreSeatChange(current: SeatManagerState, entry: SeatUndoEntry): SeatManagerState {
  const activeIds = new Set(current.students.filter(student => student.enrollmentStatus !== "archived").map(student => student.id));
  const seen = new Set<StudentId>();
  const seatOrder = entry.before.order.map(id => { if (!id || !activeIds.has(id) || seen.has(id)) return null; seen.add(id); return id; });
  const beforeLayout = resolveSeatLayout(entry.before.layout, seatOrder.length);
  const afterLayout = resolveSeatLayout(entry.after.layout, entry.after.order.length);
  const beforeIndex = new Map(beforeLayout.seats.map((seat, index) => [seat.id, index]));
  const locks = new Set(entry.before.locks);
  // Carry forward later lock changes on surviving seats, including ordinary order-only undo.
  afterLayout.seats.forEach((seat, index) => {
    const previousIndex = beforeIndex.get(seat.id);
    if (previousIndex === undefined || current.lockedSeats.includes(index) === entry.after.locks.includes(index)) return;
    if (current.lockedSeats.includes(index)) locks.add(previousIndex); else locks.delete(previousIndex);
  });
  const duties = readClassDuties(current);
  const groupLeaders = { ...duties.groupLeaders };
  Object.entries(entry.before.groupLeaders).forEach(([groupId, studentId]) => {
    if (!groupLeaders[groupId] && !entry.after.groupLeaders[groupId]) groupLeaders[groupId] = studentId;
  });
  return reconcileClassDuties({ ...current, seatOrder, lockedSeats: [...locks].filter(index => index < seatOrder.length), seatSettings: { ...current.seatSettings, layout: entry.before.layout }, settings: { ...current.settings, classDuties: { ...duties, groupLeaders } } });
}

function normalizedName(name: string) { return name.trim().replace(/\u3000/g, " ").replace(/[()（）][^()（）]*[()（）]/g, "").replace(/(同学|学生)$/g, "").replace(/\s+/g, ""); }

/** New snapshots use IDs; legacy names resolve only when both sides are unambiguous. */
export function restoreSeatSnapshot(current: SeatManagerState, snapshot: SeatHistorySnapshot) {
  const students = current.students.filter(student => student.enrollmentStatus !== "archived");
  const activeIds = new Set(students.map(student => student.id));
  const byName = new Map<string, StudentId[]>();
  students.forEach(student => { const key = normalizedName(student.name); byName.set(key, [...(byName.get(key) || []), student.id]); });
  const nameCounts = new Map<string, number>();
  snapshot.seats.filter(Boolean).forEach(name => { const key = normalizedName(name); nameCounts.set(key, (nameCounts.get(key) || 0) + 1); });
  const used = new Set<StudentId>();
  let unresolved = 0;
  const seatOrder = snapshot.seats.map((name, index) => {
    const ids = byName.get(normalizedName(name)) || [];
    const id = snapshot.studentIds ? snapshot.studentIds[index] : nameCounts.get(normalizedName(name)) === 1 && ids.length === 1 ? ids[0] : null;
    if (!id || !activeIds.has(id) || used.has(id)) { if (name || id) unresolved += 1; return null; }
    used.add(id); return id;
  });
  const state = { ...current, seatOrder, seatSettings: { ...current.seatSettings, layout: snapshot.layout }, lockedSeats: (snapshot.lockedSeats || []).filter(index => index >= 0 && index < seatOrder.length) };
  return { state, unresolved };
}
