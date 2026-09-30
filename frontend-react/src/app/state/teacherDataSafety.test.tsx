import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySeatManagerState, createSeatManagerState } from "./legacyStateAdapter";
import { saveLegacySnapshot, saveGradeExamRecord } from "./legacyWriteAdapter";
import { createFollowupTask } from "./dailyManagement";
import { permanentlyDeleteStudent } from "./classManagementCommands";
import { importRosterFile } from "./rosterImport";
import { buildScoreImportDraftFromRows, createSavedGradeExamRecord, detectScoreMapping, type XlsxApi } from "./scoreImport";
import { ensureWorkspaceBook, createClass, getCurrentSlice, switchSlice, exportWholeBook, readCurrentSliceData, writeCurrentSliceData } from "./workspaces";
import { restoreStateFromCloud, uploadCurrentStateToCloud, fetchCloudStatus } from "./syncStorage";
import { useSeatManagerController } from "./seatManagerController";
import { createTestStudent } from "./testFixtures";

vi.mock("./backupStorage", () => ({ exportPreImportBackup: vi.fn() }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); ensureWorkspaceBook(); });

describe("empty roster retains class data", () => {
  it("retains all shared domains through last-student deletion, save, reload and class switches", () => {
    const state = createEmptySeatManagerState();
    state.students = [createTestStudent("s1")];
    state.followupTasks = [createFollowupTask({ title: "开学准备", studentId: "" })];
    state.fundTransactions = [{ id: "f1", type: "income", amount: 50, category: "班费", status: "active", note: "", date: "2026-09-30", createdAt: "2026-09-30T00:00:00Z" }];
    state.dormitories = [{ id: "d1", name: "301", baseScore: 0, currentScore: 0, periodStart: "2026-09-30", memberIds: [], events: [], history: [] }];
    state.savedExams = [{ id: "exam", name: "空班考试", date: "2026-09-30", savedAt: "", studentCount: 0, subjectCount: 1, subjects: ["数学"], entries: [] }];
    expect(saveLegacySnapshot(permanentlyDeleteStudent(state, "s1"))).toBe(true);
    const a = getCurrentSlice().id;
    const b = createClass({ className: "其他班" })!;
    switchSlice(b.id); switchSlice(a);
    const restored = createSeatManagerState(readCurrentSliceData());
    expect(restored.students).toEqual([]);
    expect(restored.followupTasks[0].title).toBe("开学准备");
    expect(restored.fundTransactions[0].amount).toBe(50);
    expect(restored.dormitories[0].name).toBe("301");
    expect(restored.savedExams).toHaveLength(1);
    expect(saveLegacySnapshot(restored)).toBe(true);
    expect(createSeatManagerState(readCurrentSliceData()).followupTasks).toEqual(restored.followupTasks);
  });
});

describe("async roster write scope", () => {
  it("cancels delayed Excel arrayBuffer reading after class switch", async () => {
    const previous = window.XLSX;
    window.XLSX = { read: () => ({ SheetNames: ["Sheet1"], Sheets: { Sheet1: {} } }), utils: { sheet_to_json: () => [["姓名"], ["不应导入"]] } } as unknown as XlsxApi;
    try {
      let finish!: (buffer: ArrayBuffer) => void;
      const file = { name: "名单.xlsx", arrayBuffer: () => new Promise<ArrayBuffer>(resolve => { finish = resolve; }) } as File;
      const pending = importRosterFile(file, { replaceExisting: true, keepHistory: true });
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      switchSlice(createClass({ className: "乙班" })!.id);
      const before = exportWholeBook();
      finish(new ArrayBuffer(0));
      await expect(pending).rejects.toThrow("班级或学期已切换");
      expect(exportWholeBook()).toEqual(before);
    } finally { window.XLSX = previous; }
  });
  it.each([false, true])("cancels delayed CSV reading after class switch (replace=%s)", async replaceExisting => {
    writeCurrentSliceData({ students: [{ id: "a", name: "原甲" }], seatOrder: ["a"] });
    let finish!: (text: string) => void;
    const file = { name: "roster.csv", text: () => new Promise<string>(resolve => { finish = resolve; }) } as File;
    const a = getCurrentSlice().id;
    const pending = importRosterFile(file, { replaceExisting, keepHistory: true });
    const b = createClass({ className: "乙班" })!;
    switchSlice(b.id);
    writeCurrentSliceData({ students: [{ id: "b", name: "原乙" }], seatOrder: ["b"] });
    const before = exportWholeBook();
    finish("姓名\n不应导入\n");
    await expect(pending).rejects.toThrow("班级或学期已切换");
    expect(exportWholeBook()).toEqual(before);
    switchSlice(a);
    expect((readCurrentSliceData()?.students as Array<{ name: string }>)[0].name).toBe("原甲");
  });
});

describe("permanent deletion scrubs score remapping sources", () => {
  it("invalidates uncertain raw ownership while preserving the other student's grades", () => {
    const rows = [["姓名", "数学"], ["旧名", "80"], ["乙", "90"]];
    const mapping = detectScoreMapping(rows);
    const record = createSavedGradeExamRecord(buildScoreImportDraftFromRows(rows, "成绩.csv", mapping), { id: "exam", name: "月考", date: "2026-09-30", rows, mapping });
    record.entries[0].studentId = "a";
    const state = createEmptySeatManagerState();
    state.students = [createTestStudent("a", "改名后"), createTestStudent("b", "乙")];
    state.savedExams = [record];
    const next = permanentlyDeleteStudent(createSeatManagerState({ ...state, seatOrder: [] }), "a");
    const cleaned = next.savedExams[0] as typeof record;
    expect(cleaned.importSource).toBeUndefined();
    expect(cleaned.entries.map(entry => entry.name)).toEqual(["乙"]);
    expect(next.gradeExams[0].importSource).toBeUndefined();
  });
  it("cannot resurrect deleted rows through remap, save, reload or backup", () => {
    const rows = [["学号", "姓名", "数学"], ["001", "甲", "80"], ["002", "乙", "90"]];
    const mapping = detectScoreMapping(rows);
    const record = createSavedGradeExamRecord(buildScoreImportDraftFromRows(rows, "成绩.csv", mapping), { id: "exam", name: "月考", date: "2026-09-30", rows, mapping });
    const state = createEmptySeatManagerState();
    state.students = [{ ...createTestStudent("a", "甲"), studentNo: "001" }, { ...createTestStudent("b", "乙"), studentNo: "002" }];
    state.savedExams = [record];
    const next = permanentlyDeleteStudent(createSeatManagerState({ ...state, seatOrder: [] }), "a");
    const cleaned = next.savedExams[0] as typeof record;
    expect(cleaned.importSource?.rows).toEqual([rows[0], rows[2]]);
    expect(saveLegacySnapshot(next)).toBe(true);
    const source = cleaned.importSource!;
    const remapped = createSavedGradeExamRecord(buildScoreImportDraftFromRows(source.rows, source.filename, mapping), { id: "exam", name: "月考", date: "2026-09-30", rows: source.rows, mapping });
    expect(saveGradeExamRecord({ ...next, record: remapped })).not.toBeNull();
    const loaded = createSeatManagerState(readCurrentSliceData());
    expect((loaded.savedExams[0] as typeof record).entries.map(row => row.name)).toEqual(["乙"]);
    expect(JSON.stringify(exportWholeBook())).not.toContain('"001"');
  });
});

describe("sync metadata is secondary to committed data", () => {
  function quota(key: string) {
    localStorage.setItem("seat-manager-sync-token", "test-sync");
    localStorage.setItem("seat-manager-sync-expires", String(Date.now() + 60_000));
    const original = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, name, value) {
      if (name === key) throw new DOMException("Full", "QuotaExceededError");
      original.call(this, name, value);
    });
  }
  it("reloads committed same-scope cloud data and edits after restore timestamp fails", async () => {
    writeCurrentSliceData({ students: [{ id: "old", name: "旧数据" }], seatOrder: ["old"] });
    const { result } = renderHook(() => useSeatManagerController(createSeatManagerState(readCurrentSliceData())));
    const cloud = exportWholeBook();
    cloud.slices[0].data = { students: [{ id: "new", name: "云端新数据" }], seatOrder: ["new"] };
    quota("seat-manager-sync-last-restore-at");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ workspaceBook: cloud })));
    expect((await restoreStateFromCloud()).exists).toBe(true);
    act(() => { result.current.reload(); });
    expect(result.current.state.students[0].name).toBe("云端新数据");
    act(() => { result.current.setSettings({ testEdit: true }); });
    expect(result.current.persist()).toBe(true);
    expect((readCurrentSliceData()?.students as Array<{ name: string }>)[0].name).toBe("云端新数据");
  });
  it.each(["seat-manager-sync-last-upload-at", "seat-manager-sync-last-cloud-updated-at"])("keeps upload/status success when %s fails", async key => {
    quota(key);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ exists: true, updatedAt: "2026-09-30T00:00:00Z" })));
    expect((await uploadCurrentStateToCloud("测试设备")).exists).toBe(true);
    expect((await fetchCloudStatus()).exists).toBe(true);
  });
});
