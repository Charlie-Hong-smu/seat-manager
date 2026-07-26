import type { AppStudent, FundTransaction, FundTxType, StudentId } from "./types";
import { toLocalDateKey } from "./dateKey";

export const FUND_INCOME_PRESETS: Array<{ category: string; note: string }> = [
  { category: "班费收缴", note: "收取班费" },
  { category: "捐款", note: "" },
  { category: "退款返还", note: "" },
  { category: "其他收入", note: "" },
];

export const FUND_EXPENSE_PRESETS: Array<{ category: string; note: string }> = [
  { category: "活动支出", note: "" },
  { category: "文具采购", note: "" },
  { category: "奖品", note: "" },
  { category: "其他支出", note: "" },
];

export type FundPeriodMode = "all" | "week" | "month";

function parseDateKey(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year || 1970, Math.max(0, (month || 1) - 1), day || 1);
}

function dateKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function getFundPeriodRange(mode: FundPeriodMode, anchor: string): { start: string; end: string; label: string } | null {
  if (mode === "all") return null;
  const date = parseDateKey(anchor);
  if (mode === "week") {
    const start = new Date(date); start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { start: dateKey(start), end: dateKey(end), label: `${dateKey(start)} 至 ${dateKey(end)}` };
  }
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: dateKey(start), end: dateKey(end), label: `${date.getFullYear()} 年 ${date.getMonth() + 1} 月` };
}

export function filterFundTransactionsByPeriod(transactions: FundTransaction[], mode: FundPeriodMode, anchor: string): FundTransaction[] {
  const range = getFundPeriodRange(mode, anchor);
  return range ? transactions.filter(tx => tx.date >= range.start && tx.date <= range.end) : transactions;
}

export function shiftFundPeriod(mode: FundPeriodMode, anchor: string, amount: number): string {
  const date = parseDateKey(anchor);
  if (mode === "week") date.setDate(date.getDate() + amount * 7);
  if (mode === "month") date.setMonth(date.getMonth() + amount, 1);
  return dateKey(date);
}

export interface NewFundTxInput {
  type: FundTxType;
  amount: number;
  category: string;
  note?: string;
  /** 多个关联学生 ID（支持多人）。 */
  relatedStudentIds?: StudentId[];
  date?: string;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayString(): string {
  return toLocalDateKey();
}

export function calcIncomeTotal(transactions: FundTransaction[]): number {
  return transactions
    .filter(tx => tx.status !== "void" && tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function calcExpenseTotal(transactions: FundTransaction[]): number {
  return transactions
    .filter(tx => tx.status !== "void" && tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function calcBalance(transactions: FundTransaction[]): number {
  return calcIncomeTotal(transactions) - calcExpenseTotal(transactions);
}

export interface StudentFundCollectionSummary {
  count: number;
  individualTotal: number;
  sharedCount: number;
  latest: string;
}

function transactionMatchesStudent(transaction: FundTransaction, student: AppStudent): boolean {
  if (transaction.relatedStudentIds?.length) {
    return transaction.relatedStudentIds.includes(student.id);
  }
  if (transaction.relatedStudentId) {
    return transaction.relatedStudentId === student.id;
  }
  if (transaction.relatedStudentNames?.length) {
    return transaction.relatedStudentNames.includes(student.name);
  }
  return transaction.relatedStudentName === student.name;
}

function relatedStudentCount(transaction: FundTransaction): number {
  if (transaction.relatedStudentIds?.length) {
    return new Set(transaction.relatedStudentIds).size;
  }
  if (transaction.relatedStudentNames?.length) {
    return new Set(transaction.relatedStudentNames).size;
  }
  return transaction.relatedStudentId || transaction.relatedStudentName ? 1 : 0;
}

export function summarizeStudentFundCollection(
  transactions: FundTransaction[],
  student: AppStudent,
): StudentFundCollectionSummary {
  return transactions.reduce<StudentFundCollectionSummary>((summary, transaction) => {
    if (!transactionMatchesStudent(transaction, student)) {
      return summary;
    }
    const shared = relatedStudentCount(transaction) > 1;
    return {
      count: summary.count + 1,
      individualTotal: summary.individualTotal + (shared ? 0 : transaction.amount),
      sharedCount: summary.sharedCount + (shared ? 1 : 0),
      latest: transaction.date > summary.latest ? transaction.date : summary.latest,
    };
  }, { count: 0, individualTotal: 0, sharedCount: 0, latest: "" });
}

export function createFundTransaction(input: NewFundTxInput, students: AppStudent[]): FundTransaction {
  const amount = Number.isFinite(input.amount) ? Math.round(input.amount * 100) / 100 : 0;
  const ids = (input.relatedStudentIds ?? []).filter(Boolean);
  const resolved = ids
    .map(id => students.find(student => student.id === id))
    .filter((student): student is AppStudent => Boolean(student));
  const relatedIds = resolved.map(student => student.id);
  const relatedNames = resolved.map(student => student.name);
  return {
    id: createId("fund-tx"),
    type: input.type,
    amount: Math.abs(amount),
    category: input.category.trim() || (input.type === "income" ? "其他收入" : "其他支出"),
    note: input.note?.trim() || "",
    relatedStudentId: relatedIds[0],
    relatedStudentName: relatedNames[0],
    relatedStudentIds: relatedIds.length ? relatedIds : undefined,
    relatedStudentNames: relatedNames.length ? relatedNames : undefined,
    date: input.date || todayString(),
    createdAt: new Date().toISOString(),
    status: "active",
  };
}

/**
 * 反序列化 + 校验班费交易列表。
 * 老数据没有 fundTransactions 字段时返回 []，保证向后兼容。
 */
export function normalizeFundTransactions(raw: unknown): FundTransaction[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item, index): FundTransaction | null => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const type: FundTxType = record.type === "expense" ? "expense" : "income";
      const amount = Number(record.amount);
      return {
        id: typeof record.id === "string" ? record.id : `fund-tx-${index}`,
        type,
        amount: Number.isFinite(amount) ? Math.abs(amount) : 0,
        category: typeof record.category === "string" ? record.category : "",
        note: typeof record.note === "string" ? record.note : "",
        relatedStudentId: typeof record.relatedStudentId === "string" ? record.relatedStudentId : undefined,
        relatedStudentName: typeof record.relatedStudentName === "string" ? record.relatedStudentName : undefined,
        relatedStudentIds: Array.isArray(record.relatedStudentIds)
          ? record.relatedStudentIds.filter((id: unknown): id is string => typeof id === "string" && Boolean(id))
          : undefined,
        relatedStudentNames: Array.isArray(record.relatedStudentNames)
          ? record.relatedStudentNames.filter((n: unknown): n is string => typeof n === "string" && Boolean(n))
          : undefined,
        date: typeof record.date === "string" ? record.date : todayString(),
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
        status: record.status === "void" ? "void" : "active",
        voidedAt: typeof record.voidedAt === "string" ? record.voidedAt : undefined,
        voidReason: typeof record.voidReason === "string" ? record.voidReason : undefined,
      };
    })
    .filter((item): item is FundTransaction => Boolean(item));
}
