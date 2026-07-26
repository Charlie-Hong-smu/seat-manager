import { describe, expect, it } from "vitest";

import { calcBalance, createFundTransaction, filterFundTransactionsByPeriod, getFundPeriodRange, normalizeFundTransactions, shiftFundPeriod, summarizeStudentFundCollection } from "./classFundActions";
import { calculateDormScore, closeDormitoryPeriod, createDormEvent, createDormStudentRecord, deleteDormitoryEventFromLedger, restoreDeletedDormitory, updateDormitoryEventInLedger } from "./dormitoryActions";
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

  it("does not duplicate a shared fund transaction as every student's personal amount", () => {
    const students = [createTestStudent("s1", "张三"), createTestStudent("s2", "李四")];
    const individual = createFundTransaction({ type: "income", amount: 20, category: "班费", relatedStudentIds: ["s1"] }, students);
    const shared = createFundTransaction({ type: "income", amount: 100, category: "捐款", relatedStudentIds: ["s1", "s2"] }, students);
    individual.date = "2026-07-01";
    shared.date = "2026-07-02";

    expect(summarizeStudentFundCollection([individual, shared], students[0])).toEqual({
      count: 2,
      individualTotal: 20,
      sharedCount: 1,
      latest: "2026-07-02",
    });
    expect(summarizeStudentFundCollection([individual, shared], students[1])).toEqual({
      count: 1,
      individualTotal: 0,
      sharedCount: 1,
      latest: "2026-07-02",
    });
  });

  it("summarizes legacy fund associations without losing name-based records", () => {
    const student = createTestStudent("s1", "张三");
    const transactions = normalizeFundTransactions([
      { id: "legacy-id", type: "income", amount: 15, relatedStudentId: "s1", date: "2026-06-01" },
      { id: "legacy-names", type: "income", amount: 30, relatedStudentNames: ["张三", "李四"], date: "2026-06-02" },
      { id: "legacy-name", type: "income", amount: 8, relatedStudentName: "王五", date: "2026-06-03" },
    ]);

    expect(summarizeStudentFundCollection(transactions, student)).toEqual({
      count: 2,
      individualTotal: 15,
      sharedCount: 1,
      latest: "2026-06-02",
    });
    expect(summarizeStudentFundCollection(transactions, createTestStudent("s9", "赵六")).count).toBe(0);
  });

  it("restores deleted dorm members without leaving them in another dormitory", () => {
    const deletedDormitory = {
      id: "d1", name: "101", memberIds: ["s1"], baseScore: 0, currentScore: 0, events: [], periodStart: "2026-07-01", history: [],
    };
    const currentDormitories = [{
      id: "d2", name: "102", memberIds: ["s1", "s2"], baseScore: 0, currentScore: 0, events: [], periodStart: "2026-07-01", history: [],
    }];

    const restored = restoreDeletedDormitory(currentDormitories, deletedDormitory, 0, ["s1"]);

    expect(restored.map(dormitory => dormitory.id)).toEqual(["d1", "d2"]);
    expect(restored[0].memberIds).toEqual(["s1"]);
    expect(restored[1].memberIds).toEqual(["s2"]);
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

  it("edits and deletes legacy archived events through the unified ledger", () => {
    const archived = createDormEvent({ dormId: "d1", score: 2, reason: "旧记录", date: "2026-01-03" }, []);
    const dorm = {
      id: "d1", name: "101", memberIds: [], baseScore: 0, currentScore: 0, events: [], periodStart: "2026-01-10",
      history: [{ id: "old", label: "旧周期", startDate: "2026-01-01", endDate: "2026-01-07", baseScore: 0, finalScore: 2, events: [archived] }],
    };
    const updated = updateDormitoryEventInLedger(dorm, archived.id, { score: -1, date: "2026-01-04" });
    expect(updated.history[0].events[0]).toMatchObject({ score: -1, date: "2026-01-04", type: "punish" });
    expect(updated.history[0].finalScore).toBe(-1);
    const deleted = deleteDormitoryEventFromLedger(updated, archived.id);
    expect(deleted.history[0].events).toEqual([]);
    expect(deleted.history[0].finalScore).toBe(0);
  });

});
