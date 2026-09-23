import { getNeighborIndexPairs, resolveSeatLayout } from "./seatLayout";
import type { AppStudent, SeatHistorySnapshot, SeatLayoutV1, SeatManagerState, StudentId } from "./types";

type SeatOrder = Array<StudentId | null>;
type Observation = { order: SeatOrder; layout?: SeatLayoutV1; weight: number };

export interface SeatRotationContext {
  seatWeights: Map<StudentId, Map<string, number>>;
  neighborWeights: Map<string, number>;
  /** The number of saved snapshots with stable student IDs used in the comparison. */
  savedCount: number;
}

export interface SeatRotationResult {
  penalty: number;
  sameSeatStudents: StudentId[];
  repeatedNeighborPairs: Array<[StudentId, StudentId]>;
}

function seatKey(layout: SeatLayoutV1 | undefined, index: number): string {
  return layout ? `layout:${layout.seats[index]?.id || index}` : `default:${index}`;
}

function pairKey(a: StudentId, b: StudentId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function observationKey(order: SeatOrder, layout?: SeatLayoutV1): string {
  return JSON.stringify([order, layout?.seats.map(seat => seat.id) || null]);
}

/** Legacy name-only snapshots are deliberately skipped: duplicate names cannot be matched safely. */
export function buildSeatRotationContext(current: SeatOrder, layout: SeatLayoutV1 | undefined, history: SeatHistorySnapshot[], activeStudents: AppStudent[]): SeatRotationContext {
  const activeIds = new Set(activeStudents.map(student => student.id));
  const observations: Observation[] = [];
  const seen = new Set<string>();
  const append = (order: SeatOrder, entryLayout: SeatLayoutV1 | undefined, weight: number) => {
    const key = observationKey(order, entryLayout);
    if (seen.has(key)) return;
    seen.add(key);
    observations.push({ order: order.map(id => id && activeIds.has(id) ? id : null), layout: entryLayout, weight });
  };
  append(current, layout, 6);
  history.filter(item => Array.isArray(item.studentIds)).slice(0, 8).forEach((snapshot, index) => {
    if (observations.length >= 6) return;
    append(snapshot.studentIds!, snapshot.layout, Math.max(1, 5 - index));
  });
  const seatWeights = new Map<StudentId, Map<string, number>>();
  const neighborWeights = new Map<string, number>();
  observations.forEach(observation => {
    observation.order.forEach((id, index) => {
      if (!id) return;
      const seats = seatWeights.get(id) || new Map<string, number>();
      const key = seatKey(observation.layout, index);
      seats.set(key, (seats.get(key) || 0) + observation.weight);
      seatWeights.set(id, seats);
    });
    const oldLayout = resolveSeatLayout(observation.layout, observation.order.length);
    getNeighborIndexPairs(oldLayout).forEach(([a, b]) => {
      const left = observation.order[a]; const right = observation.order[b];
      if (left && right && left !== right) {
        const key = pairKey(left, right);
        neighborWeights.set(key, (neighborWeights.get(key) || 0) + observation.weight);
      }
    });
  });
  return { seatWeights, neighborWeights, savedCount: observations.length - 1 };
}

export function evaluateSeatRotation(order: SeatOrder, layout: SeatLayoutV1 | undefined, context: SeatRotationContext, lockedSeats: Set<number> = new Set()): SeatRotationResult {
  const sameSeatStudents: StudentId[] = [];
  const repeatedNeighborPairs: Array<[StudentId, StudentId]> = [];
  let penalty = 0;
  order.forEach((id, index) => {
    if (!id || lockedSeats.has(index)) return;
    const repeat = context.seatWeights.get(id)?.get(seatKey(layout, index)) || 0;
    if (repeat) { sameSeatStudents.push(id); penalty += repeat * 2; }
  });
  getNeighborIndexPairs(resolveSeatLayout(layout, order.length)).forEach(([a, b]) => {
    const left = order[a]; const right = order[b];
    if (!left || !right || left === right) return;
    const repeat = context.neighborWeights.get(pairKey(left, right)) || 0;
    if (repeat) { repeatedNeighborPairs.push([left, right]); penalty += repeat; }
  });
  return { penalty, sameSeatStudents, repeatedNeighborPairs };
}

export function createRotationSnapshot(state: SeatManagerState, note: string): SeatHistorySnapshot {
  const names = new Map(state.students.map(student => [student.id, student.name]));
  return {
    id: `seat-rotation-${crypto.randomUUID()}`,
    time: new Date().toISOString(), note, source: "rotation",
    rows: state.seatSettings.layout ? 1 : Math.max(1, Math.ceil(state.seatOrder.length / 8)),
    seats: state.seatOrder.map(id => id ? names.get(id) || "" : ""),
    studentIds: [...state.seatOrder],
    lockedSeats: [...state.lockedSeats],
    layout: state.seatSettings.layout,
  };
}
