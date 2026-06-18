// ── Types ─────────────────────────────────────────────────────────────────────
export type Gender = '男' | '女' | '';

export interface Student {
  id: number;
  name: string;
  gender: Gender;
  alias?: string;
  tags: string[];
  academicTags: string[];
}

export interface ExamScore {
  studentId: number;
  scores: Record<string, number>;
  total: number;
  classRank: number;
}

export interface Exam {
  id: string;
  name: string;
  date: string;
  subjects: string[];
  scores: ExamScore[];
}

export interface WeekRecord {
  id: string;
  studentId: number;
  type: 'reward' | 'punish' | 'note';
  note: string;
  date: string;
}

// ── Students ───────────────────────────────────────────────────────────────────
export const STUDENTS: Student[] = [
  { id: 1,  name: '王佳瑶', gender: '女', tags: [],           academicTags: ['数学强'] },
  { id: 2,  name: '蔡元',   gender: '男', tags: [],           academicTags: ['数学强', '英语强'] },
  { id: 3,  name: '成子轩', gender: '男', tags: [],           academicTags: ['语文强', '地理弱'] },
  { id: 4,  name: '林文彬', gender: '男', tags: [],           academicTags: [] },
  { id: 5,  name: '李文通', gender: '男', tags: [],           academicTags: [] },
  { id: 6,  name: '曾伟祺', gender: '男', tags: [],           academicTags: ['语文强', '英语强'] },
  { id: 7,  name: '梅希瑶', gender: '女', tags: [],           academicTags: [] },
  { id: 8,  name: '王佳鑫', gender: '女', tags: [],           academicTags: [] },
  { id: 9,  name: '邓正盈', gender: '女', tags: [],           academicTags: ['英语强'] },
  { id: 10, name: '谭雨桐', gender: '女', tags: [],           academicTags: [] },
  { id: 11, name: '梁浩宇', gender: '男', tags: [],           academicTags: ['物理强', '化学强'] },
  { id: 12, name: '叶棕瑞', gender: '男', tags: [],           academicTags: [] },
  { id: 13, name: '周智成', gender: '男', tags: [],           academicTags: [] },
  { id: 14, name: '林雨甜', gender: '女', tags: [],           academicTags: ['英语强'] },
  { id: 15, name: '伍尚本', gender: '男', tags: [],           academicTags: [] },
  { id: 16, name: '沈芳妮', gender: '女', tags: [],           academicTags: ['物理弱'] },
  { id: 17, name: '杨燕智', gender: '女', tags: [],           academicTags: [] },
  { id: 18, name: '林俊楠', gender: '男', tags: [],           academicTags: ['数学强'] },
  { id: 19, name: '张家伟', gender: '男', tags: [],           academicTags: [] },
  { id: 20, name: '单韦涵', gender: '男', tags: [],           academicTags: [] },
  { id: 21, name: '莫子健', gender: '男', tags: [],           academicTags: ['语文强'] },
  { id: 22, name: '卢履宇', gender: '男', tags: [],           academicTags: [] },
  { id: 23, name: '邹璟',   gender: '女', tags: [],           academicTags: ['英语强'] },
  { id: 24, name: '李翠瑞', gender: '女', tags: [],           academicTags: [] },
  { id: 25, name: '黄橘',   gender: '女', tags: [],           academicTags: ['化学强'] },
  { id: 26, name: '卢柯重', gender: '男', tags: [],           academicTags: ['数学弱'] },
  { id: 27, name: '郑宇静', gender: '女', tags: [],           academicTags: [] },
  { id: 28, name: '邱君浩', gender: '男', tags: [],           academicTags: [] },
  { id: 29, name: '邵浚铭', gender: '男', tags: [],           academicTags: [] },
  { id: 30, name: '陈智源', gender: '男', tags: [],           academicTags: [] },
  { id: 31, name: '梁睿超', gender: '男', tags: [],           academicTags: ['物理强'] },
  { id: 32, name: '何悦',   gender: '女', tags: [],           academicTags: ['英语强', '语文强'] },
  { id: 33, name: '曾涵锐', gender: '男', tags: [],           academicTags: ['物理强', '化学强'] },
  { id: 34, name: '杨恩然', gender: '女', tags: [],           academicTags: ['语文强'] },
  { id: 35, name: '王梓通', gender: '男', tags: [],           academicTags: [] },
  { id: 36, name: '黄杰诚', gender: '男', tags: [],           academicTags: [] },
  { id: 37, name: '蔡柠欢', gender: '女', tags: [],           academicTags: ['物理强', '化学强'] },
  { id: 38, name: '陈科墙', gender: '男', tags: [],           academicTags: ['英语强'] },
  { id: 39, name: '陈晓彤', gender: '女', tags: [],           academicTags: ['英语强'] },
  { id: 40, name: '余子嘉', gender: '男', tags: [],           academicTags: [] },
  { id: 41, name: '吴浩轩', gender: '男', tags: [],           academicTags: ['数学强'] },
  { id: 42, name: '张思雨', gender: '女', tags: [],           academicTags: [] },
  { id: 43, name: '刘梦琪', gender: '女', tags: [],           academicTags: ['语文强'] },
  { id: 44, name: '陈俊辉', gender: '男', tags: [],           academicTags: [] },
  { id: 45, name: '林梓晴', gender: '女', tags: [],           academicTags: ['英语强'] },
  { id: 46, name: '赵明轩', gender: '男', tags: [],           academicTags: ['数学强'] },
  { id: 47, name: '孙雅婷', gender: '女', tags: [],           academicTags: [] },
  { id: 48, name: '郑浩然', gender: '男', tags: [],           academicTags: ['物理强'] },
  { id: 49, name: '黄思琪', gender: '女', tags: [],           academicTags: [] },
  { id: 50, name: '王俊杰', gender: '男', tags: [],           academicTags: ['化学强'] },
  { id: 51, name: '李雨桐', gender: '女', tags: [],           academicTags: [] },
  { id: 52, name: '吴梦瑶', gender: '女', tags: [],           academicTags: ['语文强'] },
  { id: 53, name: '张浩然', gender: '男', tags: [],           academicTags: [] },
  { id: 54, name: '刘佳怡', gender: '女', tags: [],           academicTags: [] },
  { id: 55, name: '赵雨欣', gender: '女', tags: [],           academicTags: ['英语强'] },
  { id: 56, name: '孙浩宇', gender: '男', tags: [],           academicTags: [] },
  { id: 57, name: '张梓晴', gender: '女', tags: [],           academicTags: ['语文强', '英语强'] },
  { id: 58, name: '陈雨欣', gender: '女', tags: [],           academicTags: [] },
  { id: 59, name: '林思远', gender: '男', tags: [],           academicTags: ['数学强'] },
  { id: 60, name: '黄梦洁', gender: '女', tags: [],           academicTags: [] },
];

// ── Seat Layout: 8 cols, 8 rows = 64 seats. null = empty ─────────────────────
export const INITIAL_SEATS: (number | null)[] = [
  1,  2,  3,  4,  null, null, null, null, // row 1 — 4 empty at right
  5,  6,  7,  8,  9,   10,  11,  12,     // row 2
  13, 14, 15, 16, 17,  18,  19,  20,     // row 3
  21, 22, 23, 24, 25,  26,  27,  28,     // row 4
  29, 30, 31, 32, 33,  34,  35,  36,     // row 5
  37, 38, 39, 40, 41,  42,  43,  44,     // row 6
  45, 46, 47, 48, 49,  50,  51,  52,     // row 7
  53, 54, 55, 56, 57,  58,  59,  60,     // row 8
];

// ── Exam Score Generator ───────────────────────────────────────────────────────
const SUBJECTS = ['语文', '数学', '英语', '物理', '化学', '地理'];

function pseudoScore(studentId: number, examIdx: number, subIdx: number): number {
  const v = Math.sin(studentId * 127 + examIdx * 53 + subIdx * 37) * 10000;
  const frac = v - Math.floor(v);
  return Math.round((55 + frac * 44) * 2) / 2; // 55.0 – 99.0
}

function buildExamScores(examIdx: number, overrides?: Record<number, Record<string, number>>): ExamScore[] {
  const raw = STUDENTS.map(s => {
    const scores: Record<string, number> = {};
    SUBJECTS.forEach((sub, si) => {
      scores[sub] = overrides?.[s.id]?.[sub] ?? pseudoScore(s.id, examIdx, si);
    });
    const total = Math.round(Object.values(scores).reduce((a, b) => a + b, 0) * 10) / 10;
    return { studentId: s.id, scores, total, classRank: 0 };
  });
  raw.sort((a, b) => b.total - a.total);
  raw.forEach((r, i) => (r.classRank = i + 1));
  return raw;
}

// 王佳瑶 (id=1) scores match the screenshot
const MID_2026_OVERRIDES: Record<number, Record<string, number>> = {
  1: { 语文: 96, 数学: 90, 英语: 63.5, 物理: 53, 化学: 64, 地理: 78 },
};

export const EXAMS: Exam[] = [
  {
    id: 'mid-2026',
    name: '期中考试成绩',
    date: '2026-05-09',
    subjects: SUBJECTS,
    scores: buildExamScores(0, MID_2026_OVERRIDES),
  },
  {
    id: 'mar-2026',
    name: '3月小考',
    date: '2026-05-04',
    subjects: SUBJECTS,
    scores: buildExamScores(1),
  },
  {
    id: 'final-2025',
    name: '期末考试成绩',
    date: '2025-12-20',
    subjects: SUBJECTS,
    scores: buildExamScores(2),
  },
];

// ── Sample Records ─────────────────────────────────────────────────────────────
export const SAMPLE_RECORDS: WeekRecord[] = [
  { id: 'r1', studentId: 1, type: 'reward', note: '课堂积极发言', date: '2026-06-10' },
  { id: 'r2', studentId: 1, type: 'punish', note: '作业未完成', date: '2026-06-12' },
  { id: 'r3', studentId: 2, type: 'reward', note: '数学竞赛第一名', date: '2026-06-09' },
  { id: 'r4', studentId: 6, type: 'reward', note: '语文写作优秀', date: '2026-06-11' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
export function getStudentById(id: number): Student | undefined {
  return STUDENTS.find(s => s.id === id);
}

export function getExamScore(examId: string, studentId: number): ExamScore | undefined {
  const exam = EXAMS.find(e => e.id === examId);
  return exam?.scores.find(s => s.studentId === studentId);
}

export function getStudentExamScores(studentId: number): Array<{ exam: Exam; score: ExamScore }> {
  return EXAMS.map(exam => {
    const score = exam.scores.find(s => s.studentId === studentId);
    return score ? { exam, score } : null;
  }).filter(Boolean) as Array<{ exam: Exam; score: ExamScore }>;
}

export function getBestSubject(scores: Record<string, number>): string {
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

export function getWeakSubject(scores: Record<string, number>): string {
  return Object.entries(scores).sort((a, b) => a[1] - b[1])[0]?.[0] ?? '';
}
