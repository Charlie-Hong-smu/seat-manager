import { loadXlsx, SUBJECT_ORDER } from "./scoreImport";
import type { AppStudent, GradeExam, GradeRow, GradeScoreCell, StudentId } from "./types";
import { toLocalDateKey } from "./dateKey";

type CellValue = string | number | boolean | null;
type SheetRows = CellValue[][];

export type GradeExportObject = "class" | "students";
export type GradeExportRange = "all" | "specific" | "date";
export type GradeExportContentKey =
  | "rawScores"
  | "classStats"
  | "classTrend"
  | "studentTrend"
  | "rankChanges"
  | "distribution"
  | "missing";

export interface GradeExportOptions {
  object: GradeExportObject;
  range: GradeExportRange;
  selectedExamIds: string[];
  selectedStudentIds: string[];
  startDate: string;
  endDate: string;
  contents: Record<GradeExportContentKey, boolean>;
}

const THRESHOLDS = { pass: 60, good: 75, excellent: 90 };
const CONTENT_KEYS: GradeExportContentKey[] = [
  "rawScores",
  "classStats",
  "classTrend",
  "studentTrend",
  "rankChanges",
  "distribution",
  "missing",
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getCellScore(cell?: GradeScoreCell): number | null {
  return isNumber(cell?.score) ? cell.score : null;
}

function getRowTotal(row: GradeRow): number | null {
  if (isNumber(row.total)) {
    return row.total;
  }
  const scores = Object.values(row.scores).map(getCellScore).filter(isNumber);
  return scores.length ? round1(scores.reduce((sum, score) => sum + score, 0)) : null;
}

function getRowAverage(row: GradeRow, subjects: string[]): number | null {
  const scores = subjects.map(subject => getCellScore(row.scores[subject])).filter(isNumber);
  return scores.length ? round1(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
}

function getGradeLabel(percentValue: number | null): string {
  if (percentValue === null) return "缺考";
  if (percentValue >= THRESHOLDS.excellent) return "优秀";
  if (percentValue >= THRESHOLDS.good) return "良好";
  if (percentValue >= THRESHOLDS.pass) return "及格";
  return "不及格";
}

function getTotalPercent(total: number | null, subjects: string[]): number | null {
  if (total === null) return null;
  const fullScore = Math.max(1, subjects.length * 100);
  return round1((total / fullScore) * 100);
}

function getExamSortKey(exam: GradeExam, index: number): string {
  return exam.date ? `0-${exam.date}-${index}` : `1-${String(index).padStart(6, "0")}`;
}

function sortExams(exams: GradeExam[]): GradeExam[] {
  return exams
    .map((exam, index) => ({ exam, index }))
    .sort((a, b) => getExamSortKey(a.exam, a.index).localeCompare(getExamSortKey(b.exam, b.index)))
    .map(item => item.exam);
}

function filterExams(exams: GradeExam[], options: GradeExportOptions): GradeExam[] {
  const sorted = sortExams(exams);
  if (options.range === "specific") {
    const selected = new Set(options.selectedExamIds);
    return selected.size ? sorted.filter(exam => selected.has(exam.id)) : sorted;
  }
  if (options.range === "date") {
    return sorted.filter(exam => {
      if (options.startDate && (!exam.date || exam.date < options.startDate)) return false;
      if (options.endDate && (!exam.date || exam.date > options.endDate)) return false;
      return true;
    });
  }
  return sorted;
}

function filterExamsToStudents(exams: GradeExam[], students: AppStudent[]): GradeExam[] {
  if (!students.length) {
    return exams.map(exam => ({ ...exam, rows: [] }));
  }
  const ids = new Set(students.map(student => student.id));
  const names = new Set(students.flatMap(student => [student.name, ...student.aliases]).map(normalizeName));
  return exams.map(exam => ({
    ...exam,
    rows: exam.rows.filter(row => {
      if (row.studentId && ids.has(row.studentId)) {
        return true;
      }
      return names.has(normalizeName(row.name));
    }),
  }));
}

function collectSubjects(exams: GradeExam[]): string[] {
  const set = new Set<string>();
  exams.forEach(exam => {
    exam.subjects.forEach(subject => set.add(subject));
    exam.rows.forEach(row => Object.keys(row.scores).forEach(subject => set.add(subject)));
  });
  return [...set].sort((a, b) => {
    const ai = SUBJECT_ORDER.indexOf(a);
    const bi = SUBJECT_ORDER.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    return a.localeCompare(b, "zh-Hans-CN");
  });
}

function studentMaps(students: AppStudent[]) {
  const byId = new Map<StudentId, AppStudent>();
  const byName = new Map<string, AppStudent>();
  students.forEach(student => {
    byId.set(student.id, student);
    [student.name, ...student.aliases].forEach(name => {
      const key = normalizeName(name);
      if (key && !byName.has(key)) byName.set(key, student);
    });
  });
  return { byId, byName };
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, "").toLocaleLowerCase("zh-Hans-CN");
}

function matchStudent(row: GradeRow, maps: ReturnType<typeof studentMaps>): AppStudent | null {
  return (row.studentId ? maps.byId.get(row.studentId) : null) || maps.byName.get(normalizeName(row.name)) || null;
}

function getRowStudentNo(row: GradeRow, student?: AppStudent | null): string {
  return row.studentNo || student?.studentNo || "";
}

function getStudentRows(exams: GradeExam[], student: AppStudent): Array<{ exam: GradeExam; row: GradeRow | null }> {
  const aliases = new Set([student.name, ...student.aliases].map(normalizeName));
  return exams.map(exam => ({
    exam,
    row: exam.rows.find(row => row.studentId === student.id || aliases.has(normalizeName(row.name))) || null,
  }));
}

function getStudentNoFromRows(student: AppStudent, examRows: Array<{ exam: GradeExam; row: GradeRow | null }>): string {
  return student.studentNo || examRows.find(item => item.row?.studentNo)?.row?.studentNo || "";
}

function countBands(values: Array<number | null>, fullScore: number) {
  const passLine = fullScore * (THRESHOLDS.pass / 100);
  const goodLine = fullScore * (THRESHOLDS.good / 100);
  const excellentLine = fullScore * (THRESHOLDS.excellent / 100);
  const valid = values.filter(isNumber);
  const missing = values.length - valid.length;
  const excellent = valid.filter(value => value >= excellentLine).length;
  const good = valid.filter(value => value >= goodLine && value < excellentLine).length;
  const pass = valid.filter(value => value >= passLine && value < goodLine).length;
  const fail = valid.filter(value => value < passLine).length;
  const rate = (count: number) => values.length ? `${round1((count / values.length) * 100)}%` : "0%";
  return { fail, pass, good, excellent, missing, rate };
}

function examOverviewSheet(exams: GradeExam[]): SheetRows {
  const rows: SheetRows = [[
    "考试名称", "考试日期", "参考人数", "科目数", "科目列表", "总分满分", "总分平均分", "总分最高分", "总分最低分",
    "及格人数", "及格率", "良好人数", "良好率", "优秀人数", "优秀率", "缺考/无成绩人数",
  ]];
  exams.forEach(exam => {
    const totals = exam.rows.map(getRowTotal);
    const validTotals = totals.filter(isNumber);
    const fullScore = Math.max(1, exam.subjects.length * 100);
    const bands = countBands(totals, fullScore);
    rows.push([
      exam.name,
      exam.date,
      exam.rows.length,
      exam.subjects.length,
      exam.subjects.join("、"),
      fullScore,
      validTotals.length ? round1(validTotals.reduce((sum, value) => sum + value, 0) / validTotals.length) : null,
      validTotals.length ? Math.max(...validTotals) : null,
      validTotals.length ? Math.min(...validTotals) : null,
      bands.pass + bands.good + bands.excellent,
      bands.rate(bands.pass + bands.good + bands.excellent),
      bands.good + bands.excellent,
      bands.rate(bands.good + bands.excellent),
      bands.excellent,
      bands.rate(bands.excellent),
      bands.missing,
    ]);
  });
  return rows;
}

function allExamTableSheet(exams: GradeExam[], students: AppStudent[], subjects: string[]): SheetRows {
  const maps = studentMaps(students);
  const subjectHeaders = subjects.flatMap(subject => [`${subject}成绩`, `${subject}班排`, `${subject}校排`]);
  const rows: SheetRows = [[
    "学号", "姓名", "性别", "考试ID", "考试名称", "考试日期", ...subjectHeaders,
    "总分", "总分班排", "总分校排", "平均分", "等级", "缺失科目数",
  ]];
  exams.forEach(exam => {
    exam.rows.forEach(row => {
      const student = matchStudent(row, maps);
      const total = getRowTotal(row);
      const average = getRowAverage(row, exam.subjects);
      const missingCount = subjects.filter(subject => getCellScore(row.scores[subject]) === null).length;
      rows.push([
        getRowStudentNo(row, student),
        student?.name || row.name,
        student?.gender || "",
        exam.id,
        exam.name,
        exam.date,
        ...subjects.flatMap(subject => {
          const cell = row.scores[subject] || { score: null, rankClass: null, rankSchool: null };
          return [cell.score ?? null, cell.rankClass ?? null, cell.rankSchool ?? null];
        }),
        total,
        row.rankClass ?? null,
        row.rankSchool ?? null,
        average,
        getGradeLabel(getTotalPercent(total, exam.subjects)),
        missingCount,
      ]);
    });
  });
  return rows;
}

function subjectDetailSheet(exams: GradeExam[], students: AppStudent[], subjects: string[]): SheetRows {
  const maps = studentMaps(students);
  const rows: SheetRows = [["学号", "姓名", "性别", "考试ID", "考试名称", "考试日期", "科目", "分数", "班排", "校排", "是否缺考/无成绩"]];
  exams.forEach(exam => {
    exam.rows.forEach(row => {
      const student = matchStudent(row, maps);
      subjects.forEach(subject => {
        const cell = row.scores[subject] || { score: null, rankClass: null, rankSchool: null };
        rows.push([
          getRowStudentNo(row, student),
          student?.name || row.name,
          student?.gender || "",
          exam.id,
          exam.name,
          exam.date,
          subject,
          cell.score ?? null,
          cell.rankClass ?? null,
          cell.rankSchool ?? null,
          cell.score === null || cell.score === undefined ? "是" : "否",
        ]);
      });
    });
  });
  return rows;
}

function classTrendSheet(exams: GradeExam[], subjects: string[]): SheetRows {
  const header = ["考试名称", "考试日期", ...subjects.map(subject => `${subject}平均分`), "总分平均分", "较上一场总分均分变化", ...subjects.map(subject => `${subject}较上一场变化`)];
  const rows: SheetRows = [header];
  let previous: { totalAvg: number | null; subjectAvg: Record<string, number | null> } | null = null;
  exams.forEach(exam => {
    const subjectAvg = Object.fromEntries(subjects.map(subject => {
      const values = exam.rows.map(row => getCellScore(row.scores[subject])).filter(isNumber);
      return [subject, values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null];
    })) as Record<string, number | null>;
    const totals = exam.rows.map(getRowTotal).filter(isNumber);
    const totalAvg = totals.length ? round1(totals.reduce((sum, value) => sum + value, 0) / totals.length) : null;
    rows.push([
      exam.name,
      exam.date,
      ...subjects.map(subject => subjectAvg[subject]),
      totalAvg,
      previous && totalAvg !== null && previous.totalAvg !== null ? round1(totalAvg - previous.totalAvg) : null,
      ...subjects.map(subject => previous && subjectAvg[subject] !== null && previous.subjectAvg[subject] !== null ? round1((subjectAvg[subject] || 0) - (previous.subjectAvg[subject] || 0)) : null),
    ]);
    previous = { totalAvg, subjectAvg };
  });
  return rows;
}

function rankChangesSheet(exams: GradeExam[], students: AppStudent[]): SheetRows {
  const header = ["学号", "姓名", ...exams.flatMap(exam => [`${exam.name}总分`, `${exam.name}班级排名`]), "首次排名", "末次排名", "排名变化", "最好排名", "最差排名", "排名波动幅度"];
  const rows: SheetRows = [header];
  students.forEach(student => {
    const examRows = getStudentRows(exams, student);
    const ranks = examRows.map(item => item.row?.rankClass ?? null).filter(isNumber);
    const firstRank = ranks[0] ?? null;
    const lastRank = ranks.length ? ranks[ranks.length - 1] : null;
    rows.push([
      getStudentNoFromRows(student, examRows),
      student.name,
      ...examRows.flatMap(({ row }) => [row ? getRowTotal(row) : null, row?.rankClass ?? null]),
      firstRank,
      lastRank,
      firstRank !== null && lastRank !== null ? firstRank - lastRank : null,
      ranks.length ? Math.min(...ranks) : null,
      ranks.length ? Math.max(...ranks) : null,
      ranks.length ? Math.max(...ranks) - Math.min(...ranks) : null,
    ]);
  });
  return rows;
}

function distributionSheet(exams: GradeExam[], subjects: string[]): SheetRows {
  const rows: SheetRows = [["考试名称", "考试日期", "统计对象", "不及格人数", "不及格率", "及格人数", "及格率", "良好人数", "良好率", "优秀人数", "优秀率", "缺考/无成绩人数"]];
  exams.forEach(exam => {
    const metrics = [
      { label: "总分", fullScore: Math.max(1, exam.subjects.length * 100), values: exam.rows.map(getRowTotal) },
      ...subjects.map(subject => ({ label: subject, fullScore: 100, values: exam.rows.map(row => getCellScore(row.scores[subject])) })),
    ];
    metrics.forEach(metric => {
      const bands = countBands(metric.values, metric.fullScore);
      rows.push([
        exam.name,
        exam.date,
        metric.label,
        bands.fail,
        bands.rate(bands.fail),
        bands.pass,
        bands.rate(bands.pass),
        bands.good,
        bands.rate(bands.good),
        bands.excellent,
        bands.rate(bands.excellent),
        bands.missing,
      ]);
    });
  });
  return rows;
}

function subjectAveragesForStudent(examRows: Array<{ exam: GradeExam; row: GradeRow | null }>, subjects: string[]) {
  return subjects.map(subject => {
    const values = examRows.map(item => item.row ? getCellScore(item.row.scores[subject]) : null).filter(isNumber);
    const avg = values.length ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    const range = values.length ? round1(Math.max(...values) - Math.min(...values)) : null;
    return { subject, avg, range };
  }).filter(item => item.avg !== null);
}

function studentSummary(student: AppStudent, exams: GradeExam[], subjects: string[]) {
  const examRows = getStudentRows(exams, student);
  const totals = examRows.map(item => item.row ? getRowTotal(item.row) : null).filter(isNumber);
  const rankedRows = examRows.filter(item => item.row && getRowTotal(item.row) !== null);
  const ranks = examRows.map(item => item.row?.rankClass ?? null).filter(isNumber);
  const subjectStats = subjectAveragesForStudent(examRows, subjects);
  const byAvgDesc = [...subjectStats].sort((a, b) => (b.avg || 0) - (a.avg || 0));
  const byAvgAsc = [...subjectStats].sort((a, b) => (a.avg || 0) - (b.avg || 0));
  const byRangeDesc = [...subjectStats].sort((a, b) => (b.range || 0) - (a.range || 0));
  return {
    examRows,
    attended: rankedRows.length,
    latestExam: rankedRows[rankedRows.length - 1]?.exam.name || "",
    firstTotal: totals[0] ?? null,
    lastTotal: totals.length ? totals[totals.length - 1] : null,
    avgTotal: totals.length ? round1(totals.reduce((sum, value) => sum + value, 0) / totals.length) : null,
    bestTotal: totals.length ? Math.max(...totals) : null,
    worstTotal: totals.length ? Math.min(...totals) : null,
    bestRank: ranks.length ? Math.min(...ranks) : null,
    worstRank: ranks.length ? Math.max(...ranks) : null,
    strengths: byAvgDesc.slice(0, 3).map(item => item.subject).join("、"),
    weaknesses: byAvgAsc.slice(0, 3).map(item => item.subject).join("、"),
    mostVolatile: byRangeDesc.slice(0, 3).map(item => item.subject).join("、"),
  };
}

function studentSummarySheet(exams: GradeExam[], students: AppStudent[], subjects: string[]): SheetRows {
  const rows: SheetRows = [["学号", "姓名", "性别", "参加考试次数", "最近一次考试名称", "首次总分", "末次总分", "总分变化", "平均总分", "最好总分", "最低总分", "最好班排", "最差班排", "优势科目", "薄弱科目", "波动最大科目"]];
  students.forEach(student => {
    const summary = studentSummary(student, exams, subjects);
    rows.push([
      getStudentNoFromRows(student, summary.examRows),
      student.name,
      student.gender,
      summary.attended,
      summary.latestExam,
      summary.firstTotal,
      summary.lastTotal,
      summary.firstTotal !== null && summary.lastTotal !== null ? round1(summary.lastTotal - summary.firstTotal) : null,
      summary.avgTotal,
      summary.bestTotal,
      summary.worstTotal,
      summary.bestRank,
      summary.worstRank,
      summary.strengths,
      summary.weaknesses,
      summary.mostVolatile,
    ]);
  });
  return rows;
}

function studentPersonalSheet(student: AppStudent, exams: GradeExam[], subjects: string[]): SheetRows {
  const summary = studentSummary(student, exams, subjects);
  const studentNo = getStudentNoFromRows(student, summary.examRows);
  const rows: SheetRows = [
    ["基本信息"],
    ["姓名", student.name],
    ["性别", student.gender],
    ...(studentNo ? [["学号", studentNo] as SheetRows[number]] : []),
    ["导出时间", new Date().toLocaleString("zh-CN")],
    [],
    ["历次考试总览"],
    ["考试名称", "考试日期", "总分", "平均分", "班排", "校排", "等级", "较上次总分变化", "较上次排名变化"],
  ];
  let previousTotal: number | null = null;
  let previousRank: number | null = null;
  summary.examRows.forEach(({ exam, row }) => {
    const total = row ? getRowTotal(row) : null;
    const rank = row?.rankClass ?? null;
    rows.push([
      exam.name,
      exam.date,
      total,
      row ? getRowAverage(row, exam.subjects) : null,
      rank,
      row?.rankSchool ?? null,
      getGradeLabel(getTotalPercent(total, exam.subjects)),
      previousTotal !== null && total !== null ? round1(total - previousTotal) : null,
      previousRank !== null && rank !== null ? previousRank - rank : null,
    ]);
    previousTotal = total;
    previousRank = rank;
  });
  rows.push([], ["各科历次成绩"], ["考试名称", "考试日期", ...subjects]);
  summary.examRows.forEach(({ exam, row }) => {
    rows.push([exam.name, exam.date, ...subjects.map(subject => row?.scores[subject]?.score ?? null)]);
  });
  rows.push([], ["各科排名"], ["考试名称", "考试日期", ...subjects.flatMap(subject => [`${subject}班排`, `${subject}校排`])]);
  summary.examRows.forEach(({ exam, row }) => {
    rows.push([exam.name, exam.date, ...subjects.flatMap(subject => [row?.scores[subject]?.rankClass ?? null, row?.scores[subject]?.rankSchool ?? null])]);
  });
  rows.push(
    [],
    ["个人分析摘要"],
    ["总分趋势", getScoreTrend(summary.firstTotal, summary.lastTotal)],
    ["优势科目", summary.strengths || "—"],
    ["薄弱科目", summary.weaknesses || "—"],
    ["波动最大科目", summary.mostVolatile || "—"],
    ["缺失成绩提示", buildMissingHint(summary.examRows, subjects)],
  );
  return rows;
}

function getScoreTrend(first: number | null, last: number | null): string {
  if (first === null || last === null) return "数据不足";
  const diff = round1(last - first);
  if (diff >= 5) return "上升";
  if (diff <= -5) return "下降";
  return "稳定";
}

function buildMissingHint(examRows: Array<{ exam: GradeExam; row: GradeRow | null }>, subjects: string[]): string {
  const missing = examRows.flatMap(({ exam, row }) => {
    if (!row) return [`${exam.name}: 无成绩`];
    const missingSubjects = subjects.filter(subject => getCellScore(row.scores[subject]) === null);
    return missingSubjects.length ? [`${exam.name}: ${missingSubjects.join("、")}`] : [];
  });
  return missing.length ? missing.join("；") : "无明显缺失";
}

function safeSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, "").trim() || "Sheet";
  let base = cleaned.slice(0, 31);
  let name = base;
  let index = 2;
  while (used.has(name)) {
    const suffix = `_${index}`;
    base = cleaned.slice(0, Math.max(1, 31 - suffix.length));
    name = `${base}${suffix}`;
    index += 1;
  }
  used.add(name);
  return name;
}

function todayString(): string {
  return toLocalDateKey();
}

function getExportScope(exams: GradeExam[], students: AppStudent[], options: GradeExportOptions) {
  const selectedExams = filterExams(exams, options);
  if (!selectedExams.length) {
    throw new Error("no_exams");
  }
  const selectedStudentSet = new Set(options.selectedStudentIds);
  const exportStudents = options.object === "students"
    ? students.filter(student => selectedStudentSet.has(student.id))
    : students;
  if (options.object === "students" && !exportStudents.length) {
    throw new Error("no_students");
  }
  const scopedExams = options.object === "class" ? selectedExams : filterExamsToStudents(selectedExams, exportStudents);
  const subjects = collectSubjects(selectedExams);
  return { selectedExams, scopedExams, exportStudents, subjects };
}

function appendSheet(workbook: ReturnType<Awaited<ReturnType<typeof loadXlsx>>["utils"]["book_new"]>, xlsx: Awaited<ReturnType<typeof loadXlsx>>, name: string, rows: SheetRows, used: Set<string>) {
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, sheet, safeSheetName(name, used));
}

export function getDefaultGradeExportOptions(exams: GradeExam[]): GradeExportOptions {
  return {
    object: "class",
    range: "all",
    selectedExamIds: exams.map(exam => exam.id),
    selectedStudentIds: [],
    startDate: "",
    endDate: "",
    contents: Object.fromEntries(CONTENT_KEYS.map(key => [key, true])) as Record<GradeExportContentKey, boolean>,
  };
}

export async function exportGradeWorkbook(exams: GradeExam[], students: AppStudent[], options: GradeExportOptions): Promise<void> {
  const { selectedExams, scopedExams, exportStudents, subjects } = getExportScope(exams, students, options);

  const xlsx = await loadXlsx();
  const workbook = xlsx.utils.book_new();
  const used = new Set<string>();
  const include = (key: GradeExportContentKey) => options.contents[key];

  if (include("classStats")) appendSheet(workbook, xlsx, "01_班级总览", examOverviewSheet(scopedExams), used);
  if (include("rawScores")) appendSheet(workbook, xlsx, "02_历次考试总表", allExamTableSheet(scopedExams, exportStudents, subjects), used);
  if (include("rawScores") || include("missing")) appendSheet(workbook, xlsx, "03_学生科目明细", subjectDetailSheet(scopedExams, exportStudents, subjects), used);
  if (include("classTrend")) appendSheet(workbook, xlsx, "04_班级趋势", classTrendSheet(scopedExams, subjects), used);
  if (include("rankChanges")) appendSheet(workbook, xlsx, "05_排名变化", rankChangesSheet(scopedExams, exportStudents), used);
  if (include("distribution")) appendSheet(workbook, xlsx, "06_分数段分布", distributionSheet(scopedExams, subjects), used);
  if (include("studentTrend")) appendSheet(workbook, xlsx, "07_学生个人汇总", studentSummarySheet(scopedExams, exportStudents, subjects), used);

  if (options.object === "students") {
    exportStudents.forEach(student => {
      appendSheet(workbook, xlsx, `学生_${student.name}`, studentPersonalSheet(student, selectedExams, subjects), used);
    });
  }

  if (!workbook.SheetNames.length) {
    appendSheet(workbook, xlsx, "导出说明", [["未选择导出内容"]], used);
  }

  xlsx.writeFile(workbook, `班级成绩导出_${todayString()}.xlsx`);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayValue(value: unknown): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

function tableHtml(rows: SheetRows, limit?: number): string {
  const body = typeof limit === "number" ? rows.slice(0, limit) : rows;
  return `
    <table>
      ${body.map((row, rowIndex) => `
        <tr>
          ${row.map(cell => rowIndex === 0
            ? `<th>${escapeHtml(displayValue(cell))}</th>`
            : `<td>${escapeHtml(displayValue(cell))}</td>`).join("")}
        </tr>
      `).join("")}
    </table>
  `;
}

const CHART_COLORS = ["#2563eb", "#0f766e", "#b45309", "#be123c", "#7c3aed", "#15803d", "#0891b2"];

interface TrendSeries {
  name: string;
  values: Array<number | null>;
}

function trendChartHtml(examRows: Array<{ exam: GradeExam; row: GradeRow | null }>, series: TrendSeries[], label: string, lowerIsBetter = false): string {
  const labels = examRows.map(({ exam }) => ({ name: exam.name, date: exam.date }));
  const validSeries = series
    .map(item => ({
      ...item,
      values: item.values.map(value => isNumber(value) ? value : null),
    }))
    .filter(item => item.values.filter(isNumber).length >= 2);
  if (!validSeries.length) {
    return `<div class="trend-empty">趋势数据不足，至少需要 2 次有效成绩。</div>`;
  }

  const width = 760;
  const height = validSeries.length > 1 ? 300 : 264;
  const paddingLeft = 68;
  const paddingRight = 66;
  const paddingTop = 36;
  const paddingBottom = validSeries.length > 1 ? 74 : 68;
  const values = validSeries.flatMap(item => item.values).filter(isNumber);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = lowerIsBetter ? 3 : 14;
  const yMin = Math.max(0, Math.floor((min - pad) / 10) * 10);
  const yMax = Math.ceil((max + pad) / 10) * 10 || 100;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const xFor = (index: number) => paddingLeft + (labels.length === 1 ? plotWidth / 2 : (plotWidth * index) / (labels.length - 1));
  const yFor = (value: number) => paddingTop + (lowerIsBetter
    ? ((value - yMin) / Math.max(1, yMax - yMin)) * plotHeight
    : ((yMax - value) / Math.max(1, yMax - yMin)) * plotHeight);
  const gridValues = [yMax, round1((yMax + yMin) / 2), yMin];
  const labelXFor = (x: number) => Math.min(width - 36, Math.max(36, x));
  const labelYFor = (y: number, index: number) => {
    if (y <= paddingTop + 18) {
      return y + 20;
    }
    if (y >= height - paddingBottom - 18) {
      return y - 12;
    }
    const offset = index % 2 === 0 ? -12 : 20;
    return y + offset;
  };

  return `
    <div class="trend-wrap">
      <svg class="trend-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(label)}折线图">
        ${gridValues.map(value => {
          const y = yFor(value);
          return `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" class="trend-grid" />
            <text x="${paddingLeft - 18}" y="${y + 4}" text-anchor="end" class="trend-axis">${escapeHtml(value)}</text>
          `;
        }).join("")}
        ${validSeries.map((item, seriesIndex) => {
          const color = CHART_COLORS[seriesIndex % CHART_COLORS.length];
          const pointString = item.values
            .map((value, index) => isNumber(value) ? `${xFor(index)},${yFor(value)}` : "")
            .filter(Boolean)
            .join(" ");
          return `
            <polyline points="${pointString}" class="trend-line" style="stroke:${color}" />
            ${item.values.map((value, index) => {
              if (!isNumber(value)) return "";
              const x = xFor(index);
              const y = yFor(value);
              return `
                <circle cx="${x}" cy="${y}" r="${validSeries.length > 1 ? 3.5 : 4.5}" class="trend-point" style="stroke:${color}" />
                ${validSeries.length === 1 ? `<text x="${labelXFor(x)}" y="${labelYFor(y, index)}" text-anchor="middle" class="trend-score" style="fill:${color}">${escapeHtml(value)}</text>` : ""}
              `;
            }).join("")}
          `;
        }).join("")}
        ${labels.map((item, index) => `
          <text x="${xFor(index)}" y="${height - 48}" text-anchor="middle" class="trend-label">${escapeHtml(item.date || item.name)}</text>
          <text x="${xFor(index)}" y="${height - 30}" text-anchor="middle" class="trend-label">${escapeHtml(item.name)}</text>
        `).join("")}
        ${validSeries.length > 1 ? validSeries.map((item, index) => {
          const x = paddingLeft + (index % 4) * 150;
          const y = height - 10 - Math.floor(index / 4) * 16;
          const color = CHART_COLORS[index % CHART_COLORS.length];
          return `
            <line x1="${x}" y1="${y - 4}" x2="${x + 18}" y2="${y - 4}" class="trend-line" style="stroke:${color}" />
            <text x="${x + 24}" y="${y}" class="trend-label">${escapeHtml(item.name)}</text>
          `;
        }).join("") : ""}
      </svg>
    </div>
  `;
}

function totalTrendChartHtml(examRows: Array<{ exam: GradeExam; row: GradeRow | null }>): string {
  return trendChartHtml(examRows, [{ name: "总分", values: examRows.map(({ row }) => row ? getRowTotal(row) : null) }], "总分趋势");
}

function subjectScoreTrendChartHtml(examRows: Array<{ exam: GradeExam; row: GradeRow | null }>, subjects: string[]): string {
  return `
    <div class="chart-grid">
      ${subjects.map(subject => `
        <div class="subject-chart">
          <h4>${escapeHtml(subject)}分数趋势</h4>
          ${trendChartHtml(
            examRows,
            [{ name: subject, values: examRows.map(({ row }) => row ? getCellScore(row.scores[subject]) : null) }],
            `${subject}分数趋势`,
          )}
        </div>
      `).join("")}
    </div>
  `;
}

function rankTrendChartHtml(examRows: Array<{ exam: GradeExam; row: GradeRow | null }>, subjects: string[]): string {
  const rankSeries: TrendSeries[] = [
    { name: "总分班排", values: examRows.map(({ row }) => row?.rankClass ?? null) },
    ...subjects.map(subject => ({
      name: `${subject}班排`,
      values: examRows.map(({ row }) => row?.scores[subject]?.rankClass ?? null),
    })),
  ];
  return `
    <div class="chart-grid">
      ${rankSeries.map(item => `
        <div class="subject-chart">
          <h4>${escapeHtml(item.name)}趋势</h4>
          ${trendChartHtml(examRows, [item], `${item.name}趋势`, true)}
        </div>
      `).join("")}
    </div>
  `;
}

function studentPrintSection(student: AppStudent, exams: GradeExam[], subjects: string[], forcePageBreak: boolean): string {
  const summary = studentSummary(student, exams, subjects);
  const studentNo = getStudentNoFromRows(student, summary.examRows);
  const overviewRows: SheetRows = [["考试", "日期", "总分", "平均分", "总分班排", "总分校排", "等级", "较上次总分"]];
  let previousTotal: number | null = null;
  summary.examRows.forEach(({ exam, row }) => {
    const total = row ? getRowTotal(row) : null;
    overviewRows.push([
      exam.name,
      exam.date,
      total,
      row ? getRowAverage(row, exam.subjects) : null,
      row?.rankClass ?? null,
      row?.rankSchool ?? null,
      getGradeLabel(getTotalPercent(total, exam.subjects)),
      previousTotal !== null && total !== null ? round1(total - previousTotal) : null,
    ]);
    previousTotal = total;
  });
  const subjectRows: SheetRows = [["考试", "日期", ...subjects.flatMap(subject => [`${subject}分数`, `${subject}班排`, `${subject}校排`])]];
  summary.examRows.forEach(({ exam, row }) => {
    subjectRows.push([
      exam.name,
      exam.date,
      ...subjects.flatMap(subject => {
        const cell = row?.scores[subject];
        return [cell?.score ?? null, cell?.rankClass ?? null, cell?.rankSchool ?? null];
      }),
    ]);
  });
  return `
    <section class="${forcePageBreak ? "page-break " : ""}student-report">
      <h2>${escapeHtml(student.name)} 个人成绩单</h2>
      <div class="meta-grid">
        <div><strong>性别</strong><span>${escapeHtml(student.gender || "—")}</span></div>
        ${studentNo ? `<div><strong>学号</strong><span>${escapeHtml(studentNo)}</span></div>` : ""}
        <div><strong>参加考试</strong><span>${summary.attended} 次</span></div>
        <div><strong>总分趋势</strong><span>${escapeHtml(getScoreTrend(summary.firstTotal, summary.lastTotal))}</span></div>
      </div>
      <div class="summary-line">
        优势科目：${escapeHtml(summary.strengths || "—")}　
        薄弱科目：${escapeHtml(summary.weaknesses || "—")}　
        波动最大科目：${escapeHtml(summary.mostVolatile || "—")}
      </div>
      <h3>总分趋势</h3>
      ${totalTrendChartHtml(summary.examRows)}
      <h3>各科分数趋势</h3>
      ${subjectScoreTrendChartHtml(summary.examRows, subjects)}
      <h3>排名趋势</h3>
      ${rankTrendChartHtml(summary.examRows, subjects)}
      <h3>历次考试总览</h3>
      ${tableHtml(overviewRows)}
      <h3>各科分数与排名</h3>
      ${tableHtml(subjectRows)}
      <p class="note">缺失成绩提示：${escapeHtml(buildMissingHint(summary.examRows, subjects))}</p>
    </section>
  `;
}

export function buildGradePrintPreviewHtml(exams: GradeExam[], students: AppStudent[], options: GradeExportOptions): string {
  const { selectedExams, scopedExams, exportStudents, subjects } = getExportScope(exams, students, options);
  const overview = examOverviewSheet(scopedExams);
  const trend = classTrendSheet(scopedExams, subjects);
  const distribution = distributionSheet(scopedExams, subjects);
  const isStudentOnly = options.object === "students";
  const studentSections = options.object === "students"
    ? exportStudents.map((student, index) => studentPrintSection(student, selectedExams, subjects, !isStudentOnly || index > 0)).join("")
    : "";
  const title = `${isStudentOnly ? "学生成绩报告" : "班级成绩报告"}_${todayString()}`;
  const classSections = isStudentOnly ? "" : `
          <section>
            <h2>班级总览</h2>
            ${tableHtml(overview)}
          </section>
          <section>
            <h2>班级趋势</h2>
            ${tableHtml(trend)}
          </section>
          <section>
            <h2>分数段分布</h2>
            ${tableHtml(distribution)}
          </section>
  `;
  return `<!doctype html>
    <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title)}</title>
        <style>
          * { box-sizing: border-box; }
          body { margin: 0; padding: 28px; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f8fafc; }
          main { max-width: 1120px; margin: 0 auto; }
          section { margin-bottom: 24px; padding: 22px; border: 1px solid #e5e7eb; border-radius: 16px; background: white; }
          h1 { margin: 0 0 8px; font-size: 28px; }
          h2 { margin: 0 0 14px; font-size: 20px; }
          h3 { margin: 18px 0 8px; font-size: 15px; }
          .muted, .note { color: #6b7280; font-size: 12px; }
          .meta-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 14px 0; }
          .meta-grid div { padding: 10px 12px; border-radius: 12px; background: #f3f4f6; }
          .meta-grid strong { display: block; margin-bottom: 4px; color: #6b7280; font-size: 12px; }
          .meta-grid span { font-size: 16px; font-weight: 800; }
          .summary-line { margin: 10px 0; padding: 10px 12px; border-radius: 12px; background: #eff6ff; color: #1d4ed8; font-size: 13px; font-weight: 700; }
          .chart-grid { display: grid; grid-template-columns: 1fr; gap: 18px; margin-top: 10px; }
          .subject-chart { min-width: 0; break-inside: avoid; page-break-inside: avoid; }
          .subject-chart h4 { margin: 0 0 10px; color: #374151; font-size: 14px; font-weight: 800; }
          .trend-wrap { margin-top: 10px; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 14px; background: #ffffff; }
          .trend-svg { display: block; width: 100%; height: auto; }
          .trend-grid { stroke: #e5e7eb; stroke-width: 1; }
          .trend-axis, .trend-label { fill: #6b7280; font-size: 11px; }
          .trend-score { fill: #1d4ed8; font-size: 12px; font-weight: 800; }
          .trend-line { fill: none; stroke: #2563eb; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
          .trend-point { fill: #ffffff; stroke: #2563eb; stroke-width: 3; }
          .trend-empty { margin-top: 10px; padding: 14px; border-radius: 12px; background: #f3f4f6; color: #6b7280; font-size: 13px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 7px 8px; text-align: left; vertical-align: top; }
          th { background: #f3f4f6; color: #374151; font-weight: 900; }
          tr:nth-child(even) td { background: #fafafa; }
          .page-break { break-before: page; page-break-before: always; }
          .student-report { break-inside: avoid; page-break-inside: avoid; }
          @media print {
            body { padding: 0; background: white; }
            main { max-width: none; }
            section { border: 0; border-radius: 0; padding: 0; margin: 0 0 18px; }
            .chart-grid { gap: 12px; }
            .page-break { break-before: page; page-break-before: always; }
          }
        </style>
      </head>
      <body>
        <main>
          ${isStudentOnly ? "" : `
            <section>
              <h1>班级成绩报告</h1>
              <p class="muted">导出日期：${todayString()}　考试范围：${selectedExams.length} 场　学生范围：全班</p>
              <div class="meta-grid">
                <div><strong>考试数量</strong><span>${selectedExams.length}</span></div>
                <div><strong>学生数量</strong><span>${students.length}</span></div>
                <div><strong>科目数量</strong><span>${subjects.length}</span></div>
                <div><strong>导出格式</strong><span>打印/PDF</span></div>
              </div>
            </section>
          `}
          ${classSections}
          ${studentSections}
        </main>
      </body>
    </html>`;
}
