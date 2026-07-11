import { describe, expect, it } from "vitest";

import { calcBalance, createFundTransaction, filterFundTransactionsByPeriod, getFundPeriodRange, normalizeFundTransactions, shiftFundPeriod } from "./classFundActions";
import { calculateDormScore, closeDormitoryPeriod, createDormEvent, createDormStudentRecord } from "./dormitoryActions";
import { createStudent, createStudentRecord, updateStudentProfile } from "./studentActions";
import { createTestStudent } from "./testFixtures";

describe("student, dormitory and fund actions", () => {
  it("normalizes student profile inputs and preserves derived records", () => {
    const student = createStudent({ name: " 张三 ", gender: "男", alias: " 小张 " });
    const updated = updateStudentProfile(student, {
      name: "张三",
      gender: "男",
      aliases: ["小张", "小张", ""],
      manualTagIds: [],
      isBoarding: true,
    });
    expect(updated.aliases).toEqual(["小张"]);
    expect(updated.isBoarding).toBe(true);
    expect(createStudentRecord("reward", " 表扬 ").note).toBe("表扬");
  });

  it("links a dorm event to every valid responsible student", () => {
    const students = [createTestStudent("s1", "张三"), createTestStudent("s2", "李四")];
    const event = createDormEvent({ dormId: "d1", score: -2, reason: "纪律", responsibleStudentIds: ["s1", "s2", "missing"] }, students);
    const dorm = { id: "d1", name: "101", memberIds: ["s1", "s2"], baseScore: 10, currentScore: 8, events: [event], periodStart: "2026-01-01", history: [] };
    expect(event.responsibleStudentNames).toEqual(["张三", "李四"]);
    expect(calculateDormScore(dorm)).toBe(8);
    expect(createDormStudentRecord(event, dorm, "s2")?.id).toContain("-s2");
    const closed = closeDormitoryPeriod(dorm, { carryOver: true });
    expect(closed.baseScore).toBe(8);
    expect(closed.events).toEqual([]);
    expect(closed.history).toHaveLength(1);
  });

  it("normalizes fund transactions and calculates the balance", () => {
    const students = [createTestStudent("s1", "张三")];
    const income = createFundTransaction({ type: "income", amount: 20.126, category: "班费", relatedStudentIds: ["s1"] }, students);
    const expense = createFundTransaction({ type: "expense", amount: -5, category: "文具" }, students);
    expect(income.amount).toBe(20.13);
    expect(income.relatedStudentNames).toEqual(["张三"]);
    expect(calcBalance([income, expense])).toBeCloseTo(15.13);
    expect(normalizeFundTransactions([{ type: "expense", amount: -3, category: "纸" }])[0].amount).toBe(3);
    expect(normalizeFundTransactions(null)).toEqual([]);
    expect(normalizeFundTransactions([null, { type: "income", amount: "bad" }])).toEqual([
      expect.objectContaining({ type: "income", amount: 0 }),
    ]);
  });

  it("uses calendar weeks and months for fund periods", () => {
    expect(getFundPeriodRange("week", "2026-07-11")).toMatchObject({ start: "2026-07-06", end: "2026-07-12" });
    expect(getFundPeriodRange("month", "2026-07-11")).toMatchObject({ start: "2026-07-01", end: "2026-07-31" });
    expect(shiftFundPeriod("week", "2026-07-11", 1)).toBe("2026-07-18");
    const transactions = normalizeFundTransactions([{ id: "a", type: "expense", amount: 1, date: "2026-07-01" }, { id: "b", type: "expense", amount: 2, date: "2026-08-01" }]);
    expect(filterFundTransactionsByPeriod(transactions, "month", "2026-07-11").map(tx => tx.id)).toEqual(["a"]);
  });

  it("handles note-only dorm events without creating student records", () => {
    const student = createTestStudent();
    const event = createDormEvent({ dormId: "d1", score: Number.NaN, reason: "" }, [student]);
    const dorm = { id: "d1", name: "101", memberIds: [], baseScore: 0, currentScore: 0, events: [event], periodStart: "", history: [] };
    expect(event.type).toBe("note");
    expect(event.reason).toBe("宿舍记录");
    expect(createDormStudentRecord(event, dorm, student.id)).toBeNull();
    expect(closeDormitoryPeriod(dorm).baseScore).toBe(0);
  });
});
