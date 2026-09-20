import { createSeatManagerState } from "./legacyStateAdapter";
import { readRowsFromFile } from "./scoreImport";
import { readLegacyRootState, writeLegacyRootState } from "./storage";
import type { SeatManagerState } from "./types";

import { findStudentCandidates, normalizeStudentName, normalizeStudentNo } from "./studentIdentity";

const COLS = 8;

export interface RosterImportOptions {
  replaceExisting: boolean;
  keepHistory: boolean;
  mapping?: RosterMapping;
}

export interface RosterImportResult {
  state: SeatManagerState;
  studentCount: number;
  seatCount: number;
  hasPlacement: boolean;
  mode: "replace" | "append";
  newCount: number;
  matchedCount: number;
  archivedCount: number;
  skippedCount: number;
}

export interface ParsedRoster {
  warnings?: string[];
  names: string[];
  placements: Array<string | null>;
  genders: string[];
  studentNos: string[];
  genderList: string[];
  studentNoList: string[];
  hasPlacement: boolean;
}

export interface RosterMapping {
  headers: string[];
  nameCol: number;
  studentNoCol: number;
  genderCol: number;
  rowCol: number;
  colCol: number;
  hasHeader: boolean;
  warnings: string[];
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

function detectNameColumn(header: string[]): number {
  const normalized = header.map(cell => String(cell || "").trim().toLowerCase().replace(/\s+/g, ""));
  return normalized.findIndex(cell => /姓名|名字|学生姓名|studentname|^name$|^学生$/.test(cell));
}

function looksLikeRosterHeader(row: string[]): boolean {
  return detectNameColumn(row) !== -1
    || detectColumn(row, ["学号", "学生编号", "学生号", "student id", "student no", "student number", "school id"]) !== -1
    || detectColumn(row, ["行", "row"]) !== -1
    || detectColumn(row, ["列", "col"]) !== -1;
}

export function prepareRosterRows(rows: string[][]): string[][] {
  const headerIndex = rows.slice(0, 20).findIndex(looksLikeRosterHeader);
  return headerIndex > 0 ? rows.slice(headerIndex) : rows;
}

export function detectRosterMapping(rows: string[][]): RosterMapping {
  const header = rows[0]?.map(cell => String(cell || "").trim()) || [];
  const hasHeader = looksLikeRosterHeader(header);
  const nameCol = hasHeader ? detectNameColumn(header) : 0;
  const studentNoCol = hasHeader ? detectColumn(header, ["学号", "学生编号", "学生号", "student id", "student no", "student number", "school id"]) : -1;
  const rowCol = hasHeader ? detectColumn(header, ["行", "row"]) : -1;
  const colCol = hasHeader ? detectColumn(header, ["列", "col"]) : -1;
  const genderCol = hasHeader ? detectColumn(header, ["性别", "gender"]) : -1;
  const warnings: string[] = [];
  if (nameCol === -1) {
    warnings.push("未识别到姓名列。");
  }
  if (!hasHeader) {
    warnings.push("未识别表头，默认第一列为姓名。");
  }
  return { headers: header, nameCol, studentNoCol, genderCol, rowCol, colCol, hasHeader, warnings };
}

export function parseRosterRows(rows: string[][], mapping = detectRosterMapping(rows)): ParsedRoster {
  if (!rows.length) {
    return { names: [], placements: [], genders: [], studentNos: [], genderList: [], studentNoList: [], hasPlacement: false };
  }
  const { nameCol, studentNoCol, rowCol, colCol, genderCol } = mapping;
  const startIndex = mapping.hasHeader ? 1 : 0;
  const placements: Array<string | null> = [];
  const genders: string[] = [];
  const studentNos: string[] = [];
  const names: string[] = [];
  const genderList: string[] = [];
  const studentNoList: string[] = [];
  const warnings: string[] = [];
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
    const studentNo = String(studentNoCol !== -1 ? row[studentNoCol] || "" : "").trim();
    const rowIndex = Number.parseInt(String(rowCol !== -1 ? row[rowCol] : ""), 10);
    const colIndex = Number.parseInt(String(colCol !== -1 ? row[colCol] : ""), 10);

    if (Number.isInteger(rowIndex) && Number.isInteger(colIndex) && rowIndex >= 1 && colIndex >= 1 && colIndex <= COLS) {
      const index = (rowIndex - 1) * COLS + (colIndex - 1);
      if (placements[index]) {
        warnings.push(`第 ${rowIndex} 行第 ${colIndex} 列重复：${name} 将排入空座，保留已有学生。`);
        names.push(name); genderList.push(gender); studentNoList.push(studentNo);
        continue;
      }
      placements[index] = name;
      genders[index] = gender;
      studentNos[index] = studentNo;
      hasPlacement = true;
      maxIndex = Math.max(maxIndex, index);
    } else {
      names.push(name);
      genderList.push(gender);
      studentNoList.push(studentNo);
    }
  }

  if (hasPlacement) {
    const seatCount = getSeatCapacityFromCount(maxIndex + 1);
    for (let index = 0; index < seatCount; index += 1) {
      placements[index] ||= null;
      genders[index] ||= "";
      studentNos[index] ||= "";
    }
  }

  return { names, placements, genders, studentNos, genderList, studentNoList, hasPlacement, warnings };
}

function matchStudent(students: Record<string, unknown>[], name: string, studentNo: string): Record<string, unknown> | null {
  const candidates = students.map(raw => ({
    id: String(raw.id), name: String(raw.name || ""), studentNo: String(raw.studentNo || ""),
    aliases: Array.isArray(raw.aliases) ? raw.aliases.map(String) : [],
    enrollmentStatus: raw.enrollmentStatus === "archived" ? "archived" as const : "active" as const, raw,
  }));
  const matches = findStudentCandidates(candidates, { name, studentNo });
  if (matches.length > 1) throw new Error(`“${name}”对应多名学生，请补齐唯一学号后重新导入。`);
  return matches[0]?.raw || null;
}

function makeStudent(name: string, gender: string, studentNo: string, preserved?: Record<string, unknown> | null): Record<string, unknown> {
  return {
    ...(preserved || {}),
    id: preserved?.id || makeId(),
    name,
    studentNo: studentNo || preserved?.studentNo || "",
    gender: gender || preserved?.gender || "",
    aliases: preserved ? cloneJson(preserved.aliases, []) : [],
    records: preserved ? cloneJson(preserved.records, []) : [],
    manualTags: preserved ? cloneJson(preserved.manualTags, []) : [],
    autoTags: preserved ? cloneJson(preserved.autoTags, []) : [],
    exams: preserved ? cloneJson(preserved.exams, []) : [],
    aiComments: preserved ? cloneJson(preserved.aiComments, {}) : {},
    enrollmentStatus: "active",
    archivedAt: undefined,
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

interface AppliedRosterImport {
  next: Record<string, unknown>;
  newCount: number;
  matchedCount: number;
  archivedCount: number;
  skippedCount: number;
}

function applyRosterImport(parsed: ParsedRoster, options: RosterImportOptions): AppliedRosterImport {
  const base = isRecord(readLegacyRootState()) ? readLegacyRootState() as Record<string, unknown> : {};
  const previousStudents = Array.isArray(base.students) ? base.students.filter(isRecord) : [];
  const activePrevious = previousStudents.filter(student => student.enrollmentStatus !== "archived");
  const archivedPrevious = previousStudents.filter(student => student.enrollmentStatus === "archived");
  if (options.replaceExisting) {
    const candidates = options.keepHistory ? previousStudents : [];
    const consumedIds = new Set<string>();
    let matchedCount = 0;
    const takeMatch = (name: string, studentNo: string): Record<string, unknown> | null => {
      const preserved = matchStudent(candidates, name, studentNo);
      if (preserved && preserved.id !== undefined) {
        if (consumedIds.has(String(preserved.id))) throw new Error(`“${name}”重复关联同一学生，请核对学号。`);
        consumedIds.add(String(preserved.id));
        matchedCount += 1;
      }
      return preserved;
    };
    const students: Record<string, unknown>[] = [];
    const placementCount = parsed.placements.filter(Boolean).length;
    const totalCount = placementCount + parsed.names.length;
    const seatOrder: Array<string | null> = new Array(Math.max(parsed.placements.length, getSeatCapacityFromCount(totalCount))).fill(null);

    parsed.placements.forEach((name, index) => {
      if (!name) {
        return;
      }
      const student = makeStudent(name, parsed.genders[index] || "", parsed.studentNos[index] || "", takeMatch(name, parsed.studentNos[index] || ""));
      students.push(student);
      seatOrder[index] = String(student.id);
    });
    parsed.names.forEach((name, index) => {
      const student = makeStudent(name, parsed.genderList[index] || "", parsed.studentNoList[index] || "", takeMatch(name, parsed.studentNoList[index] || ""));
      students.push(student);
      placeFirstEmpty(seatOrder, String(student.id));
    });
    const rosterSize = students.length;

    // 未出现在新名单中的在班学生移入归档而不是删除，历史与跨领域引用保持可用、可恢复。
    const archivedAt = new Date().toISOString();
    const leftBehind = activePrevious
      .filter(student => !consumedIds.has(String(student.id)))
      .map(student => ({ ...student, enrollmentStatus: "archived", archivedAt: typeof student.archivedAt === "string" && student.archivedAt ? student.archivedAt : archivedAt }));
    const keptArchived = archivedPrevious.filter(student => !consumedIds.has(String(student.id))).map(student => ({ ...student }));
    students.push(...leftBehind, ...keptArchived);

    const next = {
      ...base,
      students,
      seatOrder,
      lockedSeats: Array.isArray(base.lockedSeats) ? base.lockedSeats.filter(index => typeof index === "number" && index >= 0 && index < seatOrder.length) : [],
      seatHistory: options.keepHistory && Array.isArray(base.seatHistory) ? base.seatHistory : [],
      exams: options.keepHistory && Array.isArray(base.exams) ? base.exams : [],
      savedExams: options.keepHistory && Array.isArray(base.savedExams) ? base.savedExams : [],
    };
    return { next, newCount: rosterSize - matchedCount, matchedCount, archivedCount: leftBehind.length, skippedCount: 0 };
  }

  // 追加和覆盖共用身份规则；含座位的行也必须进入名单。
  const students = previousStudents.map(student => ({ ...student }));
  const additions: string[] = [];
  let newCount = 0;
  let matchedCount = 0;
  let skippedCount = 0;
  const incoming = [
    ...parsed.placements.flatMap((name, index) => name ? [{ name, gender: parsed.genders[index] || "", studentNo: parsed.studentNos[index] || "" }] : []),
    ...parsed.names.map((name, index) => ({ name, gender: parsed.genderList[index] || "", studentNo: parsed.studentNoList[index] || "" })),
  ];
  incoming.forEach(({ name, gender, studentNo }) => {
    const matched = matchStudent(students, name, studentNo);
    if (matched && matched.enrollmentStatus !== "archived") { skippedCount += 1; return; }
    if (matched) {
      Object.assign(matched, makeStudent(name, gender, studentNo, matched));
      matchedCount += 1;
      additions.push(String(matched.id));
    } else {
      const student = makeStudent(name, gender, studentNo);
      students.push(student); newCount += 1; additions.push(String(student.id));
    }
  });
  const activeCount = students.filter(student => student.enrollmentStatus !== "archived").length;
  const seatOrder = ensureSeatCapacity(Array.isArray(base.seatOrder) ? base.seatOrder.map(item => item ? String(item) : null) : [], activeCount);
  additions.forEach(id => placeFirstEmpty(seatOrder, id));

  return { next: { ...base, students, seatOrder }, newCount, matchedCount, archivedCount: 0, skippedCount };
}

export function applyParsedRoster(parsed: ParsedRoster, options: RosterImportOptions): RosterImportResult {
  if (!parsed.names.length && !parsed.hasPlacement) {
    throw new Error("empty_roster");
  }
  const identities = [
    ...parsed.placements.flatMap((name, index) => name ? [{ name, no: parsed.studentNos[index] }] : []),
    ...parsed.names.map((name, index) => ({ name, no: parsed.studentNoList[index] })),
  ];
  const keys = new Set<string>();
  for (const { name, no } of identities) {
    const key = normalizeStudentNo(no) ? `no:${normalizeStudentNo(no)}` : `name:${normalizeStudentName(name)}`;
    if (keys.has(key)) throw new Error(`“${name}”重复或缺少唯一学号，请核对名单后重新导入。`);
    keys.add(key);
  }
  const { next, newCount, matchedCount, archivedCount, skippedCount } = applyRosterImport(parsed, options);
  if (!writeLegacyRootState(next)) {
    throw new Error("save_failed");
  }
  const nextState = createSeatManagerState(next);
  return {
    state: nextState,
    studentCount: nextState.students.filter(student => student.enrollmentStatus !== "archived").length,
    seatCount: nextState.seatOrder.length,
    hasPlacement: parsed.hasPlacement,
    mode: options.replaceExisting ? "replace" : "append",
    newCount,
    matchedCount,
    archivedCount,
    skippedCount,
  };
}

export async function importRosterFile(file: File, options: RosterImportOptions): Promise<RosterImportResult> {
  const rows = prepareRosterRows(await readRowsFromFile(file));
  return applyParsedRoster(parseRosterRows(rows, options.mapping), options);
}
