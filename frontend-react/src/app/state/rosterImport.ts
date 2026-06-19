import { createSeatManagerState } from "./legacyStateAdapter";
import { readRowsFromFile } from "./scoreImport";
import { readLegacyRootState, writeLegacyRootState } from "./storage";
import type { SeatManagerState } from "./types";

const COLS = 8;

export interface RosterImportOptions {
  replaceExisting: boolean;
  keepHistory: boolean;
}

export interface RosterImportResult {
  state: SeatManagerState;
  studentCount: number;
  seatCount: number;
  hasPlacement: boolean;
}

interface ParsedRoster {
  names: string[];
  placements: Array<string | null>;
  genders: string[];
  genderList: string[];
  hasPlacement: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson<T>(value: T, fallback: T): T {
  if (value === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return fallback;
  }
}

function normalizeName(value: unknown): string {
  return String(value || "")
    .trim()
    .replace(/\u3000/g, " ")
    .replace(/[()（）][^()（）]*[()（）]/g, "")
    .replace(/(同学|学生)$/g, "")
    .replace(/\s+/g, "");
}

function makeId(): string {
  return `student-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSeatCapacityFromCount(count: number): number {
  return count ? Math.ceil(count / COLS) * COLS : 0;
}

function detectColumn(header: string[], keywords: string[]): number {
  const lower = header.map(cell => String(cell || "").trim().toLowerCase());
  return lower.findIndex(cell => keywords.some(keyword => cell.includes(keyword)));
}

function parseRosterRows(rows: string[][]): ParsedRoster {
  if (!rows.length) {
    return { names: [], placements: [], genders: [], genderList: [], hasPlacement: false };
  }
  const header = rows[0];
  const nameCol = detectColumn(header, ["姓名", "名字", "name", "学生"]);
  const rowCol = detectColumn(header, ["行", "row"]);
  const colCol = detectColumn(header, ["列", "col"]);
  const genderCol = detectColumn(header, ["性别", "gender"]);
  const startIndex = nameCol !== -1 || rowCol !== -1 || colCol !== -1 ? 1 : 0;
  const placements: Array<string | null> = [];
  const genders: string[] = [];
  const names: string[] = [];
  const genderList: string[] = [];
  let hasPlacement = false;
  let maxIndex = -1;

  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i];
    const rawName = nameCol !== -1 ? row[nameCol] : row[0];
    const name = String(rawName || "").trim();
    if (!name) {
      continue;
    }
    const gender = String(genderCol !== -1 ? row[genderCol] || "" : "").trim();
    const rowIndex = Number.parseInt(String(rowCol !== -1 ? row[rowCol] : ""), 10);
    const colIndex = Number.parseInt(String(colCol !== -1 ? row[colCol] : ""), 10);

    if (Number.isInteger(rowIndex) && Number.isInteger(colIndex) && rowIndex >= 1 && colIndex >= 1 && colIndex <= COLS) {
      const index = (rowIndex - 1) * COLS + (colIndex - 1);
      placements[index] = name;
      genders[index] = gender;
      hasPlacement = true;
      maxIndex = Math.max(maxIndex, index);
    } else {
      names.push(name);
      genderList.push(gender);
    }
  }

  if (hasPlacement) {
    const seatCount = getSeatCapacityFromCount(maxIndex + 1);
    for (let index = 0; index < seatCount; index += 1) {
      placements[index] ||= null;
      genders[index] ||= "";
    }
  }

  return { names, placements, genders, genderList, hasPlacement };
}

function buildPreservedLookup(students: unknown[]): Map<string, Record<string, unknown>[]> {
  const lookup = new Map<string, Record<string, unknown>[]>();
  students.forEach(student => {
    if (!isRecord(student)) {
      return;
    }
    [student.name, ...(Array.isArray(student.aliases) ? student.aliases : [])].forEach(name => {
      const key = normalizeName(name);
      if (!key) {
        return;
      }
      const list = lookup.get(key) || [];
      list.push(student);
      lookup.set(key, list);
    });
  });
  return lookup;
}

function takePreserved(lookup: Map<string, Record<string, unknown>[]>, name: string): Record<string, unknown> | null {
  const key = normalizeName(name);
  return key ? lookup.get(key)?.shift() || null : null;
}

function makeStudent(name: string, gender: string, preserved?: Record<string, unknown> | null): Record<string, unknown> {
  return {
    ...(preserved || {}),
    id: preserved?.id || makeId(),
    name,
    gender: gender || preserved?.gender || "",
    aliases: preserved ? cloneJson(preserved.aliases, []) : [],
    records: preserved ? cloneJson(preserved.records, []) : [],
    manualTags: preserved ? cloneJson(preserved.manualTags, []) : [],
    autoTags: preserved ? cloneJson(preserved.autoTags, []) : [],
    exams: preserved ? cloneJson(preserved.exams, []) : [],
    aiComments: preserved ? cloneJson(preserved.aiComments, {}) : {},
  };
}

function ensureSeatCapacity(seatOrder: Array<string | null>, studentCount: number): Array<string | null> {
  const target = getSeatCapacityFromCount(studentCount);
  return target > seatOrder.length ? [...seatOrder, ...new Array(target - seatOrder.length).fill(null)] : seatOrder;
}

function placeFirstEmpty(seatOrder: Array<string | null>, studentId: string): void {
  const index = seatOrder.indexOf(null);
  if (index !== -1) {
    seatOrder[index] = studentId;
  }
}

function applyRosterImport(parsed: ParsedRoster, options: RosterImportOptions): Record<string, unknown> {
  const base = isRecord(readLegacyRootState()) ? readLegacyRootState() as Record<string, unknown> : {};
  const previousStudents = Array.isArray(base.students) ? base.students : [];
  if (options.replaceExisting) {
    const preservedLookup = options.keepHistory ? buildPreservedLookup(previousStudents) : new Map<string, Record<string, unknown>[]>();
    const students: Record<string, unknown>[] = [];
    const placementCount = parsed.placements.filter(Boolean).length;
    const totalCount = placementCount + parsed.names.length;
    const seatOrder: Array<string | null> = new Array(Math.max(parsed.placements.length, getSeatCapacityFromCount(totalCount))).fill(null);

    parsed.placements.forEach((name, index) => {
      if (!name) {
        return;
      }
      const student = makeStudent(name, parsed.genders[index] || "", takePreserved(preservedLookup, name));
      students.push(student);
      seatOrder[index] = String(student.id);
    });
    parsed.names.forEach((name, index) => {
      const student = makeStudent(name, parsed.genderList[index] || "", takePreserved(preservedLookup, name));
      students.push(student);
      placeFirstEmpty(seatOrder, String(student.id));
    });

    const next = {
      ...base,
      students,
      seatOrder,
      lockedSeats: Array.isArray(base.lockedSeats) ? base.lockedSeats.filter(index => typeof index === "number" && index >= 0 && index < seatOrder.length) : [],
      seatHistory: options.keepHistory && Array.isArray(base.seatHistory) ? base.seatHistory : [],
      exams: options.keepHistory && Array.isArray(base.exams) ? base.exams : [],
      savedExams: options.keepHistory && Array.isArray(base.savedExams) ? base.savedExams : [],
    };
    return next;
  }

  const students = previousStudents.filter(isRecord).map(student => ({ ...student }));
  const seatOrder = ensureSeatCapacity(Array.isArray(base.seatOrder) ? base.seatOrder.map(item => item ? String(item) : null) : [], students.length + parsed.names.length);
  parsed.names.forEach((name, index) => {
    const student = makeStudent(name, parsed.genderList[index] || "");
    students.push(student);
    placeFirstEmpty(seatOrder, String(student.id));
  });

  return {
    ...base,
    students,
    seatOrder,
  };
}

export async function importRosterFile(file: File, options: RosterImportOptions): Promise<RosterImportResult> {
  const parsed = parseRosterRows(await readRowsFromFile(file));
  if (!parsed.names.length && !parsed.hasPlacement) {
    throw new Error("empty_roster");
  }
  const next = applyRosterImport(parsed, options);
  if (!writeLegacyRootState(next)) {
    throw new Error("save_failed");
  }
  const nextState = createSeatManagerState(next);
  return {
    state: nextState,
    studentCount: nextState.students.length,
    seatCount: nextState.seatOrder.length,
    hasPlacement: parsed.hasPlacement,
  };
}
