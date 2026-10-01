import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useScopedRequest } from "../hooks/useScopedRequest";
import { hasWorkspaceDrafts, useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { useRegistrationUndo } from "../hooks/useRegistrationUndo";
import { exportWholeBook, importPreparedWorkspace, prepareWorkspaceImport, setWorkspaceWriteEnabled } from "./workspaces";
import { getRemoteGeneration } from "./workspaceSyncEvents";
import { generateStudentFollowup, readLastStudentFollowup } from "./aiStudentFollowupService";
import { createTestStudent } from "./testFixtures";

it("remote replacement invalidates same-slice AI, draft callbacks and undo while retaining old drafts", () => {
  setWorkspaceWriteEnabled(true); const book = exportWholeBook();
  const hook = renderHook(() => ({
    request: useScopedRequest("same-slice:same-student"),
    draft: useWorkspaceDraftState("sync-generation-note", ""),
    undo: useRegistrationUndo({ scope: "same", entries: { a: "new" }, onRestore: vi.fn() }),
  }));
  const request = hook.result.current.request.start();
  const oldSet = hook.result.current.draft[1];
  act(() => { oldSet("old pending draft"); });
  let undo: (() => boolean) | undefined;
  act(() => { undo = hook.result.current.undo.record({ a: "other" }); });
  const oldKeys = Object.keys(localStorage).filter(key => key.includes("sync-generation-note"));
  act(() => { expect(importPreparedWorkspace(prepareWorkspaceImport(book), "remote")).toBe(true); });
  expect(getRemoteGeneration()).not.toBe(""); expect(request.isCurrent()).toBe(false); expect(undo?.()).toBe(false);
  act(() => { oldSet("late callback"); hook.rerender(); });
  expect(hook.result.current.draft[0]).toBe(""); expect(localStorage.getItem(oldKeys[0])).toBe(JSON.stringify("old pending draft"));
});

it("late AI followup is retained under its original generation and never becomes the new last result", async () => {
  setWorkspaceWriteEnabled(true); const book = exportWholeBook();
  localStorage.setItem("seat-manager-product-auth-token", "synthetic-ai-token");
  localStorage.setItem("seat-manager-product-auth-expires", String(Date.now() + 60000));
  let respond!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { respond = resolve; })));
  try {
    const pending = generateStudentFollowup(createTestStudent("synthetic"), {}, { force: true });
    await vi.waitFor(() => expect(respond).toBeTypeOf("function"));
    expect(importPreparedWorkspace(prepareWorkspaceImport(book), "remote")).toBe(true);
    respond(Response.json({ summary: "旧代际合成建议", actions: ["待老师确认"], disclaimer: "合成" }));
    expect((await pending).summary).toBe("旧代际合成建议");
    expect(readLastStudentFollowup("synthetic")).toBeNull();
    expect(localStorage.getItem("seat-manager-ai-student-followup-last-v1")).toContain("旧代际合成建议");
  } finally { vi.unstubAllGlobals(); }
});

it("failed draft writes remain active and a failed clear suppresses stale disk drafts", () => {
  const hook = renderHook(() => useWorkspaceDraftState("sync-quota-draft", ""));
  act(() => hook.result.current[1]("磁盘旧稿"));
  const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
  act(() => hook.result.current[1]("内存新稿")); expect(hasWorkspaceDrafts()).toBe(true); spy.mockRestore();
  const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
  act(() => hook.result.current[2]()); expect(hasWorkspaceDrafts()).toBe(false); remove.mockRestore();
});
