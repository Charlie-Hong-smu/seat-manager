import type { FundTransaction } from "./types";
export interface FundCollection {
  id: string; title: string; dueDate: string; createdAt: string; closedAt?: string;
  targets: Record<string, number>; studentNames: Record<string, string>; adjustmentNotes?: Record<string, string>;
}
export const money = (value: number) => Math.round(value * 100) / 100;
export function readFundCollections(settings: Record<string, unknown>): FundCollection[] {
  if (!Array.isArray(settings.fundCollections)) return [];
  return settings.fundCollections.flatMap(value => {
    if (!value || typeof value !== "object" || typeof value.id !== "string" || typeof value.title !== "string" || !value.targets || typeof value.targets !== "object") return [];
    const targets = Object.fromEntries(Object.entries(value.targets).filter(([, amount]) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0).map(([id, amount]) => [id, money(amount as number)]));
    const strings = (input: unknown) => input && typeof input === "object" ? Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : {};
    return [{ id: value.id, title: value.title, dueDate: typeof value.dueDate === "string" ? value.dueDate : "", createdAt: typeof value.createdAt === "string" ? value.createdAt : "", closedAt: typeof value.closedAt === "string" ? value.closedAt : undefined, targets, studentNames: strings(value.studentNames), adjustmentNotes: strings(value.adjustmentNotes) }];
  });
}
export function collectionBalance(collection: FundCollection, studentId: string, transactions: FundTransaction[]) {
  const target = collection.targets[studentId] ?? 0;
  const paid = money(transactions.filter(tx => tx.collectionId === collection.id && tx.status !== "void" && (tx.relatedStudentIds?.length === 1 ? tx.relatedStudentIds[0] === studentId : !tx.relatedStudentIds?.length && tx.relatedStudentId === studentId)).reduce((sum, tx) => sum + (tx.type === "income" ? tx.amount : -tx.amount), 0));
  return { target, paid, remaining: money(Math.max(0, target - paid)), status: target === 0 ? "减免" : paid >= target ? "已交齐" : paid > 0 ? "部分缴纳" : "未交" };
}

export function resetFundCollectionsForNewTerm(settings: Record<string, unknown>): Record<string, unknown> {
  const next = { ...settings }; delete next.fundCollections; return next;
}
