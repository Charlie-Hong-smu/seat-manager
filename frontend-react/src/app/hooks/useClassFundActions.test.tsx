import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTestStudent } from "../state/testFixtures";
import type { FundTransaction } from "../state/types";
import { useClassFundActions } from "./useClassFundActions";

describe("fund transaction edits", () => {
  it("preserves a legacy student link when attaching an existing payment to a collection", () => {
    const student = createTestStudent();
    let transactions: FundTransaction[] = [{ id: "legacy-payment", type: "income", amount: 50, category: "班费", note: "", date: "2026-09-22", createdAt: "2026-09-22T08:00:00", status: "active", relatedStudentId: student.id, relatedStudentName: student.name }];
    const setFundTransactions = (update: FundTransaction[] | ((current: FundTransaction[]) => FundTransaction[])) => {
      transactions = typeof update === "function" ? update(transactions) : update;
    };
    const { result } = renderHook(() => useClassFundActions({ students: [student], fundTransactions: transactions, setFundTransactions }));

    act(() => result.current.handleUpdateFundTransaction("legacy-payment", { collectionId: "collection-1" }));

    expect(transactions[0]).toMatchObject({ collectionId: "collection-1", relatedStudentId: student.id, relatedStudentIds: [student.id], relatedStudentName: student.name });
  });
});
