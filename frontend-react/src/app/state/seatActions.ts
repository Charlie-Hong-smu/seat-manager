import type { AppStudent, SeatLayoutV1, StudentId } from "./types";

const COLS = 8;

export type SeatOrder = Array<StudentId | null>;

export function getSeatCapacityForStudents(studentCount: number, layout?: SeatLayoutV1): number {
  return layout ? layout.seats.length : studentCount ? Math.ceil(studentCount / COLS) * COLS : 0;
}

export function buildSeatOrderByStudentList(students: AppStudent[], layout?: SeatLayoutV1, currentOrder?: SeatOrder, lockedSeats = new Set<number>()): SeatOrder {
  const capacity = layout?.seats.length ?? (currentOrder?.length || getSeatCapacityForStudents(students.length));
  const seatOrder = new Array<StudentId | null>(capacity).fill(null);
  const valid = new Set(students.map(student => student.id));
  const used = new Set<StudentId>();
  lockedSeats.forEach(index => { const id = currentOrder?.[index]; if (index >= 0 && index < capacity && id && valid.has(id) && !used.has(id)) { seatOrder[index] = id; used.add(id); } });
  const remaining = students.filter(student => !used.has(student.id));
  seatOrder.forEach((_, index) => { if (!lockedSeats.has(index)) seatOrder[index] = remaining.shift()?.id || null; });
  return seatOrder;
}

export function placeStudentInFirstEmptySeat(seatOrder: SeatOrder, studentId: StudentId, studentCount: number, layout?: SeatLayoutV1): SeatOrder {
  const nextCapacity = getSeatCapacityForStudents(studentCount, layout);
  const next = [...seatOrder];

  while (next.length < nextCapacity) {
    next.push(null);
  }

  if (next.includes(studentId)) {
    return next;
  }

  const emptyIndex = next.indexOf(null);
  if (emptyIndex !== -1) {
    next[emptyIndex] = studentId;
  }

  return next;
}

export function swapSeatOrder(seatOrder: SeatOrder, fromIndex: number, toIndex: number, lockedSeats: Set<number>): SeatOrder {
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex) || fromIndex < 0 || toIndex < 0 || fromIndex >= seatOrder.length || toIndex >= seatOrder.length || fromIndex === toIndex || lockedSeats.has(fromIndex) || lockedSeats.has(toIndex)) {
    return seatOrder;
  }

  const next = [...seatOrder];
  const source = next[fromIndex] ?? null;
  next[fromIndex] = next[toIndex] ?? null;
  next[toIndex] = source;
  return next;
}

export function shuffleUnlockedSeats(seatOrder: SeatOrder, lockedSeats: Set<number>): SeatOrder {
  const unlockedIndexes = seatOrder
    .map((_, index) => index)
    .filter(index => !lockedSeats.has(index));
  const students = unlockedIndexes
    .map(index => seatOrder[index])
    .filter((id): id is StudentId => id !== null);

  for (let i = students.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [students[i], students[j]] = [students[j], students[i]];
  }

  const next = [...seatOrder];
  unlockedIndexes.forEach((index, orderIndex) => {
    next[index] = students[orderIndex] ?? null;
  });
  return next;
}
