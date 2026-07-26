import type { GradeScoreCell, SavedGradeExamRecord, ScoreImportDraft } from "./types";
import { toLocalDateKey } from "./dateKey";

export const SUBJECT_ORDER = ["语文", "数学", "英语", "物理", "化学", "地理", "历史", "政治", "生物"];

type XlsxCell = string | number | boolean | null | undefined;
type XlsxRows = XlsxCell[][];
type XlsxWorkbook = { SheetNames: string[]; Sheets: Record<string, unknown> };
export type XlsxWorksheet = unknown;
export type XlsxApi = {
  read: (buffer: ArrayBuffer, options: { type: "array" }) => XlsxWorkbook;
  writeFile: (workbook: XlsxWorkbook, filename: string) => void;
  utils: {
    aoa_to_sheet: (rows: XlsxRows) => XlsxWorksheet;
    book_new: () => XlsxWorkbook;
    book_append_sheet: (workbook: XlsxWorkbook, sheet: XlsxWorksheet, name: string) => void;
    sheet_to_json: (sheet: unknown, options: { header: 1; defval: string }) => XlsxRows;
  };
};

declare global {
  interface Window {
    XLSX?: XlsxApi;
  }
}

export interface ScoreMapping {
  headers: string[];
  nameCol: number;
  studentNoCol: number;
  subjectMappings: Array<{ subject: string; scoreCol: number; rankClassCol: number; rankSchoolCol: number }>;
  totalMapping: { scoreCol: number; rankClassCol: number; rankSchoolCol: number };
  warnings: string[];
}

let xlsxLoadPromise: Promise<XlsxApi> | null = null;

function normalizeHeader(text: unknown): string {
  return String(text ?? "")
    .trim()
    .toLowerCase()
    .replace(/\u3000/g, "")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "");
}

function detectSubjectFromHeader(header: unknown): string {
  const normalized = normalizeHeader(header);
  const mapping = [
    { subject: "语文", pattern: /语文|chinese|^cn$/ },
    { subject: "数学", pattern: /数学|math|mathematics/ },
    { subject: "英语", pattern: /英语|英文|english|^en$/ },
    { subject: "物理", pattern: /物理|physics/ },
    { subject: "化学", pattern: /化学|chemistry/ },
    { subject: "地理", pattern: /地理|geography/ },
    { subject: "历史", pattern: /历史|history/ },
    { subject: "政治", pattern: /政治|思政|道法|politics/ },
    { subject: "生物", pattern: /生物|biology/ },
  ];
  return mapping.find(item => item.pattern.test(normalized))?.subject || "";
}

function isNameHeader(header: unknown): boolean {
  const normalized = normalizeHeader(header);
  return /姓名|名字|学生姓名|studentname|^name$|^学生$/.test(normalized);
}

function isScoreHeader(header: unknown): boolean {
  const normalized = normalizeHeader(header);
  const hasSubject = Boolean(detectSubjectFromHeader(header));
  const isTotal = /总分|总成绩|totalscore|overall/.test(normalized);
  if (!normalized || (!hasSubject && !isTotal)) {
    return false;
  }
  return !/班排|班级排名|班级名次|校排|校排名|校级排名|schoolrank|classrank|名次|位次/.test(normalized);
}

function isClassRankHeader(header: unknown): boolean {
  return /班名|班排|班级排名|班级名次|classrank/.test(normalizeHeader(header));
}

function isSchoolRankHeader(header: unknown): boolean {
  return /校名|校排|校级|校排名|校级排名|schoolrank/.test(normalizeHeader(header));
}

function parseScoreNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = Number.parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRankNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const match = String(value).replace(/,/g, "").match(/-?\d+/);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[0], 10);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseDelimitedText(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === "\"") {
      if (inQuotes && nextChar === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(cell.trim());
      if (row.length > 1 || row[0] !== "") {
        rows.push(row);
      }
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }

  return rows;
}

function pickDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const candidates = [",", "\t", ";"];
  return candidates
    .map(delimiter => ({ delimiter, count: firstLine.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
}

function toStringRows(rows: XlsxRows): string[][] {
  return rows
    .map(row => row.map(cell => String(cell ?? "").trim()))
    .filter(row => row.some(Boolean));
}

function looksLikeScoreHeader(row: string[]): boolean {
  const hasName = row.findIndex(isNameHeader) !== -1;
  const hasScore = row.some(header => isScoreHeader(header));
  return hasName && hasScore;
}

export function prepareScoreRows(rows: string[][]): string[][] {
  const headerIndex = rows.slice(0, 20).findIndex(looksLikeScoreHeader);
  return headerIndex > 0 ? rows.slice(headerIndex) : rows;
}

function getXlsxScriptUrl(): string {
  const baseUrl = typeof document === "undefined" ? "/" : document.baseURI || window.location.href;
  return new URL("vendor/xlsx.full.min.js", baseUrl).toString();
}

// xlsx 不进 Service Worker precache（见 vite.config.ts），改为进入成绩/名单页时空闲预热：
// 请求经过 SW 的 CacheFirst 规则落入运行时缓存，之后离线导入仍可用。
export function prefetchXlsxAsset(): () => void {
  if (typeof window === "undefined" || window.XLSX) return () => undefined;
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  const warm = () => {
    void fetch(getXlsxScriptUrl()).catch(() => undefined);
  };
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(warm, { timeout: 4_000 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }
  const handle = window.setTimeout(warm, 1_500);
  return () => window.clearTimeout(handle);
}

export async function loadXlsx(): Promise<XlsxApi> {
  if (window.XLSX) {
    return window.XLSX;
  }
  xlsxLoadPromise ||= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = getXlsxScriptUrl();
    script.async = true;
    script.onload = () => {
      if (window.XLSX) {
        resolve(window.XLSX);
      } else {
        reject(new Error("xlsx_unavailable"));
      }
    };
    script.onerror = () => reject(new Error("xlsx_unavailable"));
    document.head.appendChild(script);
  });
  return xlsxLoadPromise;
}

export async function readRowsFromFile(file: File): Promise<string[][]> {
  const filename = file.name.toLowerCase();
  if (filename.endsWith(".csv") || filename.endsWith(".tsv")) {
    const text = await file.text();
    return parseDelimitedText(text, filename.endsWith(".tsv") ? "\t" : pickDelimiter(text));
  }
  if (filename.endsWith(".xlsx") || filename.endsWith(".xls") || filename.endsWith(".xlsm")) {
    const xlsx = await loadXlsx();
    const workbook = xlsx.read(await file.arrayBuffer(), { type: "array" });
    const firstSheet = workbook.SheetNames[0];
    if (!firstSheet) {
      throw new Error("empty_file");
    }
    return toStringRows(xlsx.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1, defval: "" }));
  }
  throw new Error("unsupported_file");
}

export function detectScoreMapping(rows: string[][]): ScoreMapping {
  const headers = rows[0]?.map(cell => String(cell || "").trim()) || [];
  const normalizedHeaders = headers.map(normalizeHeader);
  const nameCol = headers.findIndex(isNameHeader);
  const studentNoCol = normalizedHeaders.findIndex(cell => /学号|学生编号|学生号|考号|准考证号|准考证|studentid|studentno|studentnumber|schoolid/.test(cell));
  const warnings: string[] = [];
  const subjectMappingsMap = new Map(
    SUBJECT_ORDER.map(subject => [subject, { subject, scoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 }]),
  );
  const totalMapping = { scoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 };
  let currentScope = "";

  headers.forEach((header, index) => {
    if (!header || index === nameCol || index === studentNoCol) {
      return;
    }
    if (/学号|考号|准考证|考场|座位|组别|年级|性别|备注|缺考|缺席/.test(normalizedHeaders[index])) {
      return;
    }
    const subject = detectSubjectFromHeader(header);
    const isTotal = /总分|总成绩|totalscore|overall/.test(normalizedHeaders[index]);

    if ((subject || isTotal) && isScoreHeader(header)) {
      if (subject) {
        const item = subjectMappingsMap.get(subject);
        if (item && item.scoreCol !== -1) {
          warnings.push(`${subject}分数列重复，已使用靠后的列。`);
        }
        if (item) {
          item.scoreCol = index;
        }
        currentScope = subject;
      } else {
        if (totalMapping.scoreCol !== -1) {
          warnings.push("总分列重复，已使用靠后的列。");
        }
        totalMapping.scoreCol = index;
        currentScope = "__total__";
      }
      return;
    }

    if (isClassRankHeader(header)) {
      if (currentScope === "__total__") {
        totalMapping.rankClassCol = totalMapping.rankClassCol === -1 ? index : totalMapping.rankClassCol;
      } else if (currentScope && subjectMappingsMap.has(currentScope)) {
        const item = subjectMappingsMap.get(currentScope);
        if (item && item.rankClassCol === -1) item.rankClassCol = index;
      }
      return;
    }

    if (isSchoolRankHeader(header)) {
      if (currentScope === "__total__") {
        totalMapping.rankSchoolCol = totalMapping.rankSchoolCol === -1 ? index : totalMapping.rankSchoolCol;
      } else if (currentScope && subjectMappingsMap.has(currentScope)) {
        const item = subjectMappingsMap.get(currentScope);
        if (item && item.rankSchoolCol === -1) item.rankSchoolCol = index;
      }
    }
  });

  const subjectMappings = Array.from(subjectMappingsMap.values()).filter(item => item.scoreCol !== -1);
  if (nameCol === -1) warnings.push("未识别到姓名列。");
  if (!subjectMappings.length) warnings.push("未识别到可用科目列。");
  return { headers, nameCol, studentNoCol, subjectMappings, totalMapping, warnings };
}

function readScoreCell(row: string[], scoreCol: number, rankClassCol: number, rankSchoolCol: number): GradeScoreCell {
  return {
    score: scoreCol >= 0 ? parseScoreNumber(row[scoreCol]) : null,
    rankClass: rankClassCol >= 0 ? parseRankNumber(row[rankClassCol]) : null,
    rankSchool: rankSchoolCol >= 0 ? parseRankNumber(row[rankSchoolCol]) : null,
  };
}

export function parseRowsWithMapping(rows: string[][], mapping: ScoreMapping): ScoreImportDraft {
  if (mapping.nameCol === -1 || !mapping.subjectMappings.length) {
    throw new Error("mapping_failed");
  }

  const entries = rows.slice(1).flatMap(row => {
    const name = String(row[mapping.nameCol] || "").trim();
    if (!name) {
      return [];
    }
    const studentNo = mapping.studentNoCol >= 0 ? String(row[mapping.studentNoCol] || "").trim() : "";
    const scores = mapping.subjectMappings.reduce<Record<string, GradeScoreCell>>((map, item) => {
      map[item.subject] = readScoreCell(row, item.scoreCol, item.rankClassCol, item.rankSchoolCol);
      return map;
    }, {});
    const total = readScoreCell(
      row,
      mapping.totalMapping.scoreCol,
      mapping.totalMapping.rankClassCol,
      mapping.totalMapping.rankSchoolCol,
    );
    return [{ name, studentNo: studentNo || undefined, scores, total }];
  });

  if (!entries.length) {
    throw new Error("empty_file");
  }

  return {
    filename: "",
    subjects: mapping.subjectMappings.map(item => item.subject),
    entries,
    rowCount: rows.length - 1,
    warnings: mapping.warnings.filter(Boolean),
  };
}

export function buildScoreImportDraftFromRows(rows: string[][], filename: string, mapping: ScoreMapping): ScoreImportDraft {
  const draft = parseRowsWithMapping(rows, mapping);
  return { ...draft, filename };
}

function makeId(): string {
  return `exam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function parseScoreFile(file: File): Promise<ScoreImportDraft> {
  const rows = prepareScoreRows(await readRowsFromFile(file));
  if (!rows.length) {
    throw new Error("empty_file");
  }
  const draft = parseRowsWithMapping(rows, detectScoreMapping(rows));
  return { ...draft, filename: file.name };
}

export function createSavedGradeExamRecord(
  draft: ScoreImportDraft,
  input: { id?: string; name: string; date: string; rows?: string[][]; mapping?: ScoreMapping },
): SavedGradeExamRecord {
  const name = input.name.trim() || draft.filename.replace(/\.[^.]+$/, "") || "考试";
  const date = input.date || toLocalDateKey();
  const entries = draft.entries.map(entry => ({
    name: entry.name,
    studentNo: entry.studentNo,
    scores: Object.fromEntries(draft.subjects.map(subject => [subject, entry.scores[subject] || { score: null }])),
    total: entry.total || { score: null, rankClass: null, rankSchool: null },
  }));
  return {
    id: input.id || makeId(),
    name,
    date,
    savedAt: new Date().toISOString(),
    studentCount: entries.length,
    subjectCount: draft.subjects.length,
    subjects: [...draft.subjects],
    entries,
    importSource: input.rows?.length && input.mapping ? {
      filename: draft.filename,
      rows: input.rows.map(row => row.map(cell => String(cell ?? ""))),
      mapping: {
        ...input.mapping,
        headers: [...input.mapping.headers],
        subjectMappings: input.mapping.subjectMappings.map(item => ({ ...item })),
        totalMapping: { ...input.mapping.totalMapping },
        warnings: [...input.mapping.warnings],
      },
    } : undefined,
  };
}
