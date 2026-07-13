import { useCallback } from "react";
import { createFundTransaction, type NewFundTxInput } from "../state/classFundActions";
import type { SeatManagerController } from "../state/seatManagerController";
import type { AppStudent, FundTransaction } from "../state/types";

export function useClassFundActions({ students, setFundTransactions }: {
  students: AppStudent[];
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

  const handleUpdateFundTransaction = useCallback((id: string, patch: Partial<Pick<FundTransaction, "type" | "amount" | "category" | "note" | "date" | "relatedStudentIds">>) => {
    setFundTransactions((current) => current.map((tx) => {
      if (tx.id !== id) return tx;
      const nextAmount = patch.amount !== undefined && Number.isFinite(patch.amount) ? Math.abs(patch.amount) : tx.amount;
      const nextRelatedIds = patch.relatedStudentIds !== undefined ? patch.relatedStudentIds : tx.relatedStudentIds;
      const resolved = (nextRelatedIds ?? []).map((relatedId) => students.find((student) => student.id === relatedId)).filter((student): student is AppStudent => Boolean(student));
      const relatedIds = resolved.map((student) => student.id);
      const relatedNames = resolved.map((student) => student.name);
      return {
        ...tx,
        type: patch.type ?? tx.type,
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
    setFundTransactions((current) => current.map((tx) => tx.id === id ? { ...tx, status: "void", voidedAt: new Date().toISOString(), voidReason: "教师手动作废" } : tx));
  }, [setFundTransactions]);

  const handleClearFundTransactions = useCallback(() => setFundTransactions(current => current.map(tx => ({ ...tx, status: "void", voidedAt: new Date().toISOString(), voidReason: "批量作废" }))), [setFundTransactions]);

  return { handleAddFundTransaction, handleRemoveCreatedFundTransaction, handleUpdateFundTransaction, handleDeleteFundTransaction, handleClearFundTransactions };
}
