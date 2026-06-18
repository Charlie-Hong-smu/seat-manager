import type { AppStudent, StudentId } from "./types";

const COLS = 8;

export type SeatOrder = Array<StudentId | null>;

export function getSeatCapacityForStudents(studentCount: number): number {
  return studentCount ? Math.ceil(studentCount / COLS) * COLS : 0;
}

export function buildSeatOrderByStudentList(students: AppStudent[]): SeatOrder {
  const seatOrder = new Array<StudentId | null>(getSeatCapacityForStudents(students.length)).fill(null);
  students.forEach((student, index) => {
    if (index < seatOrder.length) {
      seatOrder[index] = student.id;
    }
  });
  return seatOrder;
}

export function swapSeatOrder(seatOrder: SeatOrder, fromIndex: number, toIndex: number, lockedSeats: Set<number>): SeatOrder {
  if (fromIndex === toIndex || lockedSeats.has(fromIndex) || lockedSeats.has(toIndex)) {
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
