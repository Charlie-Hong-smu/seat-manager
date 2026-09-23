import { describe, expect, it } from "vitest";
import { collectionBalance, readFundCollections, type FundCollection } from "./fundCollections";
import { createFundTransaction, normalizeFundTransactions } from "./classFundActions";
import { prepareFollowupTasks } from "./dailyManagement";
import { createTestStudent } from "./testFixtures";
const student = createTestStudent();
const collection: FundCollection = { id: "collection-1", title: "班费", dueDate: "", createdAt: "2026-09-22", targets: { s1: 100 }, studentNames: { s1: "张三" } };
const transaction = (amount: number, type: "income" | "expense" = "income") => createFundTransaction({ amount, type, category: "班费", collectionId: collection.id, relatedStudentIds: [student.id] }, [student]);
describe("fund collection workflow", () => {
  it("distinguishes partial payment, full payment, refunds, waived fees and void records", () => {
    const income = transaction(40);
    expect(collectionBalance(collection, "s1", [income])).toMatchObject({ remaining: 60, status: "部分缴纳" });
    const full = [income, transaction(60)];
    expect(collectionBalance(collection, "s1", full)).toMatchObject({ remaining: 0, status: "已交齐" });
    expect(collectionBalance(collection, "s1", [...full, transaction(10, "expense")])).toMatchObject({ remaining: 10, status: "部分缴纳" });
    expect(collectionBalance(collection, "s1", [{ ...income, status: "void" }])).toMatchObject({ paid: 0, status: "未交" });
    expect(collectionBalance({ ...collection, targets: { s1: 0 } }, "s1", [])).toMatchObject({ status: "减免" });
  });
  it("does not count unrelated income and preserves project links in persistence normalization", () => {
    const tx = transaction(100);
    expect(collectionBalance(collection, "s1", [{ ...tx, collectionId: "another" }]).paid).toBe(0);
    expect(normalizeFundTransactions([tx])[0].collectionId).toBe(collection.id);
    expect(readFundCollections({ fundCollections: [collection] })[0]).toMatchObject(collection);
  });
  it("reuses an open reminder for the same collection and student", () => {
    const input = { studentId: "s1", studentIds: ["s1"], studentMode: "individual" as const, title: "班费催缴", sourceRef: { domain: "fund" as const, entityId: collection.id } };
    const first = prepareFollowupTasks(input);
    const again = prepareFollowupTasks(input, first.created);
    expect(again.created).toHaveLength(0);
    expect(again.taskIds).toEqual(first.taskIds);
  });
});
