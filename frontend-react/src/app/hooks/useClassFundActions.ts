import { useCallback } from "react";
import { createFundTransaction, type NewFundTxInput } from "../state/classFundActions";
import type { SeatManagerController } from "../state/seatManagerController";
import type { AppStudent, FundTransaction } from "../state/types";

export function useClassFundActions({ students, fundTransactions, setFundTransactions }: {
  students: AppStudent[];
  fundTransactions: FundTransaction[];
  setFundTransactions: SeatManagerController["setFundTransactions"];
}) {
  const handleAddFundTransaction = useCallback((input: NewFundTxInput) => {
    const tx = createFundTransaction(input, students);
    setFundTransactions((current) => [tx, ...current]);
    return tx;
  }, [setFundTransactions, students]);

  const handleRemoveCreatedFundTransaction = useCallback((id: string) => {
    setFundTransactions((current) => current.filter((tx) => tx.id !== id));
  }, [setFundTransactions]);

  const handleUpdateFundTransaction = useCallback((id: string, patch: Partial<Pick<FundTransaction, "type" | "amount" | "category" | "note" | "date" | "relatedStudentIds" | "collectionId">>) => {
    setFundTransactions((current) => current.map((tx) => {
      if (tx.id !== id) return tx;
      const nextAmount = patch.amount !== undefined && Number.isFinite(patch.amount) ? Math.abs(patch.amount) : tx.amount;
      const relatedIds = patch.relatedStudentIds !== undefined ? patch.relatedStudentIds : tx.relatedStudentIds ?? (tx.relatedStudentId ? [tx.relatedStudentId] : []);
      const relatedNames = relatedIds.map((relatedId) => students.find(student => student.id === relatedId)?.name || (relatedId === tx.relatedStudentId ? tx.relatedStudentName : tx.relatedStudentNames?.[tx.relatedStudentIds?.indexOf(relatedId) ?? -1]) || "已移出学生");
      return {
        ...tx,
        type: patch.type ?? tx.type,
        collectionId: relatedIds.length === 1 ? patch.collectionId !== undefined ? patch.collectionId || undefined : tx.collectionId : undefined,
        amount: nextAmount,
        category: patch.category !== undefined ? patch.category : tx.category,
        note: patch.note !== undefined ? patch.note : tx.note,
        date: patch.date !== undefined ? patch.date : tx.date,
        relatedStudentId: relatedIds[0],
        relatedStudentName: relatedNames[0],
        relatedStudentIds: relatedIds.length ? relatedIds : undefined,
        relatedStudentNames: relatedNames.length ? relatedNames : undefined,
      };
    }));
  }, [setFundTransactions, students]);

  const handleDeleteFundTransaction = useCallback((id: string) => {
    const previous = fundTransactions.find(tx => tx.id === id);
    setFundTransactions((current) => current.map((tx) => tx.id === id ? { ...tx, status: "void", voidedAt: new Date().toISOString(), voidReason: "教师手动作废" } : tx));
    return () => {
      if (previous) setFundTransactions(current => current.map(tx => tx.id === id ? previous : tx));
    };
  }, [fundTransactions, setFundTransactions]);

  const handleClearFundTransactions = useCallback(() => {
    const previousById = new Map(fundTransactions.map(transaction => [transaction.id, transaction]));
    setFundTransactions(current => current.map(tx => ({ ...tx, status: "void", voidedAt: new Date().toISOString(), voidReason: "批量作废" })));
    return () => setFundTransactions(current => current.map(transaction => previousById.get(transaction.id) || transaction));
  }, [fundTransactions, setFundTransactions]);

  return { handleAddFundTransaction, handleRemoveCreatedFundTransaction, handleUpdateFundTransaction, handleDeleteFundTransaction, handleClearFundTransactions };
}
