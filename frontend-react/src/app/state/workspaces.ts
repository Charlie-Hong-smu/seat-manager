// 文件柜(多班级 / 学期)管理。
//
// 设计目标:在不改动现有各功能读写逻辑的前提下,支持"多个班级 × 多个学期"。
// 做法:把原来单一的 localStorage 键 `homeroom-seat-manager-v1` 的完整内容,
// 收进文件柜的一个"切片"(WorkspaceSlice.data)里。文件柜自己存在新键
// `seat-manager-workspaces-v1`。storage.ts 的 read/writeLegacyRootState 会被
// 重定向到"当前选中切片"的 data,所以上层代码(App.tsx、成绩、座位、AI 等)无感。
//
// 首次运行时,若发现旧的单一键里有数据,会自动搬进第一个切片(默认班级 / 当前学期),
// 保证已有数据不丢。

import type {
  TermSeason,
  WorkspaceBook,
  WorkspaceClassView,
  WorkspaceSlice,
  WorkspaceTerm,
} from "./types";

const LEGACY_STORAGE_KEY = "homeroom-seat-manager-v1";
const WORKSPACES_KEY = "seat-manager-workspaces-v1";
const SCHOOL_STAGE_KEY = "seat-manager-last-school-stage";

function hasStorage(): boolean {
  return typeof window !== "undefined" && Boolean(window.localStorage);
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ── 学期辅助 ─────────────────────────────────────────────────────────────

/** 根据当前日期猜一个默认学期:2-7 月算春季,其余算秋季。 */
export function guessCurrentTerm(): { year: number; season: TermSeason } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const season: TermSeason = month >= 2 && month <= 7 ? "spring" : "autumn";
  // 春季学期通常跨年初,归属上一自然年的学年;这里简单用当年年份即可,老师可手动改。
  return { year: now.getFullYear(), season };
}

export function seasonLabel(season: TermSeason): string {
  if (season === "spring") return "春";
  if (season === "autumn") return "秋";
  return "自定义";
}

export function makeTerm(input: { year: number; season: TermSeason; label?: string }): WorkspaceTerm {
  const label = input.label?.trim()
    || (input.season === "custom" ? "自定义学期" : `${input.year} ${seasonLabel(input.season)}`);
  return {
    id: makeId("term"),
    year: input.year,
    season: input.season,
    label,
    createdAt: nowIso(),
  };
}

// ── 学段 / 年级(班级名预选) ────────────────────────────────────────────────
// 使用者可能是小学、初中、高中老师。选一次学段后记住,下次默认同一学段。
// 年级数字、班号都可手动输入;也允许完全自定义班级名。

export type SchoolStage = "primary" | "junior" | "senior";

const STAGE_LABEL: Record<SchoolStage, string> = {
  primary: "小学",
  junior: "初中",
  senior: "高中",
};

// 各学段的年级中文写法。小学一到六;初中/高中用"初/高" + 一二三。
const PRIMARY_GRADES = ["一", "二", "三", "四", "五", "六"];
const JUNIOR_SENIOR_GRADES = ["一", "二", "三"];

export function stageLabel(stage: SchoolStage): string {
  return STAGE_LABEL[stage];
}

export function stageGradeOptions(stage: SchoolStage): string[] {
  return stage === "primary" ? PRIMARY_GRADES : JUNIOR_SENIOR_GRADES;
}

/** 该学段最高年级序号:小学 6,初中/高中 3。 */
export function stageMaxGrade(stage: SchoolStage): number {
  return stage === "primary" ? 6 : 3;
}

/** 年级序号 → 中文,如 1→"一"。超出范围返回数字字符串。 */
export function gradeNumberToLabel(n: number): string {
  const list = ["一", "二", "三", "四", "五", "六"];
  return list[n - 1] || String(n);
}

/** 中文年级 → 序号,如 "一"→1。 */
export function gradeLabelToNumber(label: string): number {
  const list = ["一", "二", "三", "四", "五", "六"];
  const index = list.indexOf(label.trim());
  return index >= 0 ? index + 1 : (Number.parseInt(label, 10) || 1);
}

/** 把学段 + 年级序号 + 班号拼成班级名,如 高一(3)班 / 五年级(2)班。 */
export function composeClassNameByNumber(stage: SchoolStage, gradeNumber: number, classNo: string): string {
  const g = gradeNumberToLabel(gradeNumber);
  const no = (classNo || "").trim();
  if (stage === "primary") {
    const base = `${g}年级`;
    return no ? `${base}(${no})班` : base;
  }
  const prefix = stage === "junior" ? "初" : "高";
  const base = `${prefix}${g}`;
  return no ? `${base}(${no})班` : base;
}

/** 旧签名:接受中文年级。保留给需要的地方。 */
export function composeClassName(stage: SchoolStage, grade: string, classNo: string): string {
  const g = grade.trim();
  if (!g) {
    return "";
  }
  return composeClassNameByNumber(stage, gradeLabelToNumber(g), classNo);
}

/**
 * 一个切片的显示班名。优先用户自定义名;否则用结构化的"学段+年级+班号"动态拼;
 * 都没有时回退到存量的 className 字符串。
 */
export function sliceDisplayName(slice: {
  stage?: SchoolStage;
  gradeNumber?: number;
  classNo?: string;
  customName?: string;
  className?: string;
}): string {
  if (slice.customName && slice.customName.trim()) {
    return slice.customName.trim();
  }
  if (slice.stage && slice.gradeNumber) {
    return composeClassNameByNumber(slice.stage, slice.gradeNumber, slice.classNo || "");
  }
  return slice.className || "未命名班级";
}

/**
 * 按中国习惯计算进入某学期后的年级:
 * 春季→秋季(进入新学年)年级 +1;秋季→春季年级不变。
 * 自定义学期不改年级。返回新的年级序号(不超过该学段最高年级)。
 */
export function nextGradeNumber(
  stage: SchoolStage,
  currentGrade: number,
  fromSeason: TermSeason,
  toSeason: TermSeason,
): number {
  if (fromSeason === "spring" && toSeason === "autumn") {
    return Math.min(currentGrade + 1, stageMaxGrade(stage));
  }
  return currentGrade;
}

export function getLastSchoolStage(): SchoolStage {
  if (!hasStorage()) {
    return "senior";
  }
  const raw = window.localStorage.getItem(SCHOOL_STAGE_KEY);
  return raw === "primary" || raw === "junior" || raw === "senior" ? raw : "senior";
}

export function setLastSchoolStage(stage: SchoolStage): void {
  if (hasStorage()) {
    window.localStorage.setItem(SCHOOL_STAGE_KEY, stage);
  }
}

// ── 读写文件柜 ────────────────────────────────────────────────────────────

function readRawLegacy(): Record<string, unknown> | null {
  if (!hasStorage()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readBookRaw(): WorkspaceBook | null {
  if (!hasStorage()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(WORKSPACES_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.slices)) {
      return null;
    }
    return parsed as unknown as WorkspaceBook;
  } catch {
    return null;
  }
}

function writeBook(book: WorkspaceBook): boolean {
  if (!hasStorage()) {
    return false;
  }
  try {
    window.localStorage.setItem(WORKSPACES_KEY, JSON.stringify(book));
    return true;
  } catch (error) {
    console.warn("无法保存文件柜数据", error);
    return false;
  }
}

function createSlice(input: {
  classId?: string;
  className: string;
  term: WorkspaceTerm;
  stage?: SchoolStage;
  gradeNumber?: number;
  classNo?: string;
  customName?: string;
  data?: Record<string, unknown>;
}): WorkspaceSlice {
  const timestamp = nowIso();
  return {
    id: makeId("slice"),
    classId: input.classId || makeId("class"),
    className: input.className,
    term: input.term,
    stage: input.stage,
    gradeNumber: input.gradeNumber,
    classNo: input.classNo,
    customName: input.customName,
    createdAt: timestamp,
    updatedAt: timestamp,
    data: input.data || { students: [], seatOrder: [] },
  };
}

/**
 * 保证文件柜已初始化并返回它。
 * 首次运行:若旧单一键有数据 → 搬进默认切片;否则建一个空的默认班级/当前学期切片。
 */
export function ensureWorkspaceBook(): WorkspaceBook {
  const existing = readBookRaw();
  if (existing && existing.slices.length) {
    // 修正 currentSliceId 指向失效的情况。
    if (!existing.slices.some(slice => slice.id === existing.currentSliceId)) {
      existing.currentSliceId = existing.slices[0].id;
      writeBook(existing);
    }
    return existing;
  }

  const term = makeTerm(guessCurrentTerm());
  const legacyData = readRawLegacy();
  const slice = createSlice({
    className: "默认班级",
    term,
    data: legacyData || { students: [], seatOrder: [] },
  });
  const book: WorkspaceBook = {
    version: 1,
    currentSliceId: slice.id,
    slices: [slice],
  };
  writeBook(book);
  return book;
}

export function getCurrentSlice(): WorkspaceSlice {
  const book = ensureWorkspaceBook();
  return book.slices.find(slice => slice.id === book.currentSliceId) || book.slices[0];
}

/** storage.ts 用:读当前切片的数据(等同旧的 readLegacyRootState 内容)。 */
export function readCurrentSliceData(): Record<string, unknown> | null {
  const slice = getCurrentSlice();
  return slice?.data ?? null;
}

/** storage.ts 用:写当前切片的数据(等同旧的 writeLegacyRootState)。 */
export function writeCurrentSliceData(data: unknown): boolean {
  const book = ensureWorkspaceBook();
  const index = book.slices.findIndex(slice => slice.id === book.currentSliceId);
  if (index < 0) {
    return false;
  }
  book.slices[index] = {
    ...book.slices[index],
    data: isRecord(data) ? data : { students: [], seatOrder: [] },
    updatedAt: nowIso(),
  };
  return writeBook(book);
}

// ── 切换 / 新建 / 升学期 ───────────────────────────────────────────────────

export function switchSlice(sliceId: string): boolean {
  const book = ensureWorkspaceBook();
  if (!book.slices.some(slice => slice.id === sliceId)) {
    return false;
  }
  book.currentSliceId = sliceId;
  return writeBook(book);
}

export function createClass(input: {
  className?: string;
  stage?: SchoolStage;
  gradeNumber?: number;
  classNo?: string;
  customName?: string;
  term?: WorkspaceTerm;
}): WorkspaceSlice {
  const book = ensureWorkspaceBook();
  const term = input.term || makeTerm(guessCurrentTerm());
  const displayName = input.customName?.trim()
    || (input.stage && input.gradeNumber
      ? composeClassNameByNumber(input.stage, input.gradeNumber, input.classNo || "")
      : "")
    || input.className?.trim()
    || "新班级";
  const slice = createSlice({
    className: displayName,
    term,
    stage: input.stage,
    gradeNumber: input.gradeNumber,
    classNo: input.classNo,
    customName: input.customName?.trim() || undefined,
    data: { students: [], seatOrder: [] },
  });
  book.slices.push(slice);
  book.currentSliceId = slice.id;
  writeBook(book);
  return slice;
}

/** 把一个班级(classId)已有切片按创建时间返回,供 UI 展示同班多个学期。 */
export function getClassViews(): WorkspaceClassView[] {
  const book = ensureWorkspaceBook();
  const byClass = new Map<string, WorkspaceClassView>();
  book.slices.forEach(slice => {
    const view = byClass.get(slice.classId);
    if (view) {
      view.slices.push(slice);
    } else {
      byClass.set(slice.classId, {
        classId: slice.classId,
        // 班级组标题用最新切片的显示名(能反映当前年级)。
        className: sliceDisplayName(slice),
        slices: [slice],
      });
    }
  });
  // 组标题用该班最新(createdAt 最大)切片的显示名,反映当前年级。
  byClass.forEach(view => {
    const latest = [...view.slices].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (latest) {
      view.className = sliceDisplayName(latest);
    }
  });
  return [...byClass.values()];
}

export function getBookSnapshot(): WorkspaceBook {
  return ensureWorkspaceBook();
}

/**
 * 复制学生名单但清空成绩/记录等,用于"进入下一学期"。
 * 保留:姓名、性别、别名、宿舍归属、标签 id。
 * 清空:奖惩记录、考试成绩、AI 评语。
 */
function copyRosterForNewTerm(data: Record<string, unknown>): Record<string, unknown> {
  const rawStudents = Array.isArray(data.students) ? data.students : [];
  const students = rawStudents.map(item => {
    if (!isRecord(item)) {
      return item;
    }
    return {
      id: item.id,
      name: item.name,
      gender: item.gender,
      aliases: item.aliases,
      dormitoryId: item.dormitoryId,
      manualTags: item.manualTags,
      autoTags: item.autoTags,
      // 清空的字段:
      records: [],
      exams: [],
      aiComments: undefined,
    };
  });
  // 保留宿舍成员归属,但清空宿舍事件与历史(新学期重新计分)。
  const rawDorms = Array.isArray(data.dormitories) ? data.dormitories : [];
  const dormitories = rawDorms.map(item => {
    if (!isRecord(item)) {
      return item;
    }
    return {
      ...item,
      events: [],
      history: [],
      currentScore: item.baseScore ?? 0,
      periodStart: new Date().toISOString().slice(0, 10),
    };
  });
  return {
    students,
    seatOrder: [],
    lockedSeats: [],
    seatSettings: isRecord(data.settings) ? data.settings : (data.seatSettings ?? {}),
    settings: isRecord(data.settings) ? data.settings : {},
    dormitories,
    seatHistory: [],
    savedExams: [],
    exams: [],
    manualTags: Array.isArray(data.manualTags) ? data.manualTags : [],
    autoTags: Array.isArray(data.autoTags) ? data.autoTags : [],
    commentRubric: data.commentRubric ?? null,
  };
}

/**
 * 从某个切片"进入下一学期":在同一个班级(classId 不变)下新建一个新学期切片,
 * 可选复制上学期名单(清空成绩/记录)。
 * 若该班有结构化年级信息,按中国习惯自动升年级:春→秋 +1,秋→春不变。
 * 班名(customName 除外)会随新年级动态变化。
 */
export function advanceToNextTerm(input: {
  fromSliceId: string;
  term: WorkspaceTerm;
  copyRoster: boolean;
}): WorkspaceSlice | null {
  const book = ensureWorkspaceBook();
  const from = book.slices.find(slice => slice.id === input.fromSliceId);
  if (!from) {
    return null;
  }
  const data = input.copyRoster
    ? copyRosterForNewTerm(isRecord(from.data) ? from.data : {})
    : { students: [], seatOrder: [] };
  const timestamp = nowIso();

  // 计算新学期的年级(仅当有结构化年级信息时)。
  let nextGrade = from.gradeNumber;
  if (from.stage && from.gradeNumber) {
    nextGrade = nextGradeNumber(from.stage, from.gradeNumber, from.term.season, input.term.season);
  }
  // 班名:若用户自定义过就沿用;否则按新年级重新拼。
  const className = from.customName?.trim()
    || (from.stage && nextGrade
      ? composeClassNameByNumber(from.stage, nextGrade, from.classNo || "")
      : from.className);

  const slice: WorkspaceSlice = {
    id: makeId("slice"),
    classId: from.classId,
    className,
    term: input.term,
    stage: from.stage,
    gradeNumber: nextGrade,
    classNo: from.classNo,
    customName: from.customName,
    createdAt: timestamp,
    updatedAt: timestamp,
    data,
  };
  book.slices.push(slice);
  book.currentSliceId = slice.id;
  writeBook(book);
  return slice;
}

export function renameClass(classId: string, nextName: string): boolean {
  const book = ensureWorkspaceBook();
  const name = nextName.trim();
  if (!name) {
    return false;
  }
  let changed = false;
  book.slices = book.slices.map(slice => {
    if (slice.classId === classId) {
      changed = true;
      return { ...slice, className: name };
    }
    return slice;
  });
  return changed ? writeBook(book) : false;
}

/**
 * 编辑班级身份信息:更新同一个 classId 下所有学期切片的学段、班号和自定义名。
 * 每个切片的年级会在原有基础上重新计算（保持相对年级不变，但基于新学段调整上限）。
 * customName 非空时所有切片沿用该名字；空时各切片按自己的年级动态拼接。
 */
export function updateClassInfo(classId: string, input: {
  stage: SchoolStage;
  gradeNumber: number;
  classNo: string;
  customName: string;
}): boolean {
  const book = ensureWorkspaceBook();
  const classSlices = book.slices.filter(s => s.classId === classId);
  if (!classSlices.length) {
    return false;
  }
  // 找该班最早的切片,用它的年级作为基准;其他切片年级相对偏移。
  const sorted = [...classSlices].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const baseGrade = sorted[0].gradeNumber || input.gradeNumber;
  const gradeOffset = input.gradeNumber - baseGrade;
  const max = stageMaxGrade(input.stage);
  const customName = input.customName.trim() || undefined;

  book.slices = book.slices.map(slice => {
    if (slice.classId !== classId) {
      return slice;
    }
    const originalGrade = slice.gradeNumber || input.gradeNumber;
    const newGrade = Math.max(1, Math.min(max, originalGrade + gradeOffset));
    const className = customName || composeClassNameByNumber(input.stage, newGrade, input.classNo);
    return {
      ...slice,
      stage: input.stage,
      gradeNumber: newGrade,
      classNo: input.classNo.trim() || undefined,
      customName,
      className,
      updatedAt: nowIso(),
    };
  });
  return writeBook(book);
}

/** 删除一个切片(某班某学期)。不允许删到一个都不剩。 */
export function deleteSlice(sliceId: string): boolean {
  const book = ensureWorkspaceBook();
  if (book.slices.length <= 1) {
    return false;
  }
  const next = book.slices.filter(slice => slice.id !== sliceId);
  if (next.length === book.slices.length) {
    return false;
  }
  book.slices = next;
  if (book.currentSliceId === sliceId) {
    book.currentSliceId = next[0].id;
  }
  return writeBook(book);
}

// ── 云同步 / 备份用:整柜读写 ──────────────────────────────────────────────

/** 云同步用:导出整个文件柜(所有班级所有学期)。 */
export function exportWholeBook(): WorkspaceBook {
  return ensureWorkspaceBook();
}

/** 云同步恢复用:整柜写入。兼容旧的"单班数据"格式(自动包成一个切片)。 */
export function importWholeBook(payload: unknown): boolean {
  // 新格式:本身就是文件柜。
  if (isRecord(payload) && Array.isArray(payload.slices) && payload.slices.length) {
    const book = payload as unknown as WorkspaceBook;
    if (!book.slices.some(slice => slice.id === book.currentSliceId)) {
      book.currentSliceId = book.slices[0].id;
    }
    return writeBook(book);
  }
  // 旧格式:单班数据(带 students / seatOrder)→ 包成默认切片。
  if (isRecord(payload) && Array.isArray(payload.students)) {
    const slice = createSlice({
      className: "默认班级",
      term: makeTerm(guessCurrentTerm()),
      data: payload,
    });
    return writeBook({ version: 1, currentSliceId: slice.id, slices: [slice] });
  }
  return false;
}
