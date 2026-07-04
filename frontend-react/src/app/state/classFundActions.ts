import type { AppStudent, FundTransaction, FundTxType, StudentId } from "./types";

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

export interface NewFundTxInput {
  type: FundTxType;
  amount: number;
  category: string;
  note?: string;
  relatedStudentId?: StudentId;
  date?: string;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function calcIncomeTotal(transactions: FundTransaction[]): number {
  return transactions
    .filter(tx => tx.type === "income")
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function calcExpenseTotal(transactions: FundTransaction[]): number {
  return transactions
    .filter(tx => tx.type === "expense")
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function calcBalance(transactions: FundTransaction[]): number {
  return calcIncomeTotal(transactions) - calcExpenseTotal(transactions);
}

export function createFundTransaction(input: NewFundTxInput, students: AppStudent[]): FundTransaction {
  const amount = Number.isFinite(input.amount) ? Math.round(input.amount * 100) / 100 : 0;
  const related = input.relatedStudentId
    ? students.find(student => student.id === input.relatedStudentId)
    : undefined;
  return {
    id: createId("fund-tx"),
    type: input.type,
    amount: Math.abs(amount),
    category: input.category.trim() || (input.type === "income" ? "其他收入" : "其他支出"),
    note: input.note?.trim() || "",
    relatedStudentId: related?.id,
    relatedStudentName: related?.name,
    date: input.date || todayString(),
    createdAt: new Date().toISOString(),
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
        date: typeof record.date === "string" ? record.date : todayString(),
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date().toISOString(),
      };
    })
    .filter((item): item is FundTransaction => Boolean(item));
}
