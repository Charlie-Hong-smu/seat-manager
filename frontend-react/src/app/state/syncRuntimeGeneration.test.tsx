// @vitest-environment node
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare, Log, LogLevel } from "../../../../cloudflare-worker/node_modules/miniflare/dist/src/index.js";
import { contentHash, sha256 } from "../../../../shared/sync-content.mjs";
import { SnapshotSync, snapshotOf, SyncProtocolError, type CloudHead, type CloudSnapshot } from "./syncProtocol";
import { exportWholeBook, importPreparedWorkspace, prepareWorkspaceImport, setWorkspaceWriteEnabled } from "./workspaces";
import { getEditVersion, getRemoteGeneration } from "./workspaceSyncEvents";
import { useScopedRequest } from "../hooks/useScopedRequest";
import { hasWorkspaceDrafts, useWorkspaceDraftState } from "../hooks/useWorkspaceDraftState";
import { useRegistrationUndo } from "../hooks/useRegistrationUndo";
import { generateStudentFollowup, readLastStudentFollowup } from "./aiStudentFollowupService";
import { createTestStudent } from "./testFixtures";

it("real SQLite remote replacement isolates old AI replies, active drafts and undo callbacks", async () => {
  const directory = await mkdtemp(join(tmpdir(), "seat-sync-ai-runtime-"));
  const mf = new Miniflare({ name: "sync-ai-runtime", scriptPath: resolve("../cloudflare-worker/test/fixtures/sync-runtime.js"), modules: true,
    modulesRoot: resolve(".."), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR),
    kvNamespaces: ["SEAT_MANAGER_KV"], durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } },
    bindings: { PRODUCT_TOKEN_SECRET: "synthetic-ai-runtime-secret", SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "true", SYNC_AUTOMATIC_SPACES: JSON.stringify(["synthetic-ai-generation"]) },
  });
  let engine: SnapshotSync | undefined;
  try {
    await (await mf.getKVNamespace("SEAT_MANAGER_KV")).put(`seat-manager:license:${await sha256("SYNTHETIC-AI-GENERATION")}`, JSON.stringify({ licenseId: "synthetic-ai-generation", status: "active", allowedEditions: ["zhang"], maxDevices: 3, devices: [] }));
    const auth = await (await mf.dispatchFetch("https://worker.test/license/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productCode: "SYNTHETIC-AI-GENERATION", deviceId: "synthetic-ai-device", edition: "zhang" }) })).json() as { token: string; expiresAt: number };
    await mf.dispatchFetch("https://worker.test/_test/migrate?key=seat-manager%3Alicense%3Asynthetic-ai-generation%3Astate");
    // Install only DOM surfaces after the Node runtime proxy has been initialized.
    const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis } };
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://synthetic.test" });
    for (const name of ["window", "document", "navigator", "localStorage", "sessionStorage", "HTMLElement", "Element", "Node", "Event", "CustomEvent", "MutationObserver"]) vi.stubGlobal(name, name === "window" ? dom.window : Reflect.get(dom.window, name));
    setWorkspaceWriteEnabled(true); localStorage.setItem("seat-manager-product-auth-token", auth.token); localStorage.setItem("seat-manager-product-auth-expires", String(auth.expiresAt));
    const entries = new Map<string, unknown>();
    async function api<T>(path: string, token: string, body?: unknown): Promise<T> {
      const response = await mf.dispatchFetch(`https://worker.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const result = await response.json() as T & { error?: string }; if (!response.ok) throw new SyncProtocolError(result.error || "failed", response.status); return result;
    }
    engine = new SnapshotSync({ releaseEnabled: true, token: () => auth.token, book: exportWholeBook, device: () => "synthetic-ai-device", flush: () => true, writable: () => true, editing: hasWorkspaceDrafts, unsaved: () => false, editVersion: getEditVersion, generation: getRemoteGeneration,
      storage: localStorage, journal: { async get<T>(key: string) { return entries.get(key) as T | undefined; }, async put(key, value) { entries.set(key, structuredClone(value)); }, async remove(key) { entries.delete(key); } }, api,
      apply(snapshot: CloudSnapshot) { return importPreparedWorkspace(prepareWorkspaceImport(snapshot.workspaceBook!), "remote"); },
    });
    expect((await engine.sync()).choice).toBe("bind"); expect((await engine.choose("local")).phase).toBe("synced"); expect((await engine.enableAutomatic(true)).automatic).toBe(true);
    const hook = renderHook(() => ({ request: useScopedRequest("same-student"), draft: useWorkspaceDraftState("synthetic-ai-runtime-note", ""), undo: useRegistrationUndo({ scope: "same-student", entries: { a: "new" }, onRestore: vi.fn() }) }));
    const request = hook.result.current.request.start(); const oldSet = hook.result.current.draft[1]; let undo: (() => boolean) | undefined;
    act(() => { oldSet("old active draft"); undo = hook.result.current.undo.record({ a: "old" }); });
    const oldDraftKey = Object.keys(localStorage).find(key => key.includes("synthetic-ai-runtime-note"))!;
    let respond!: (response: Response) => void; const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", (...args: Parameters<typeof fetch>) => String(args[0]).includes("/student-followup") ? new Promise<Response>(resolve => { respond = resolve; }) : originalFetch(...args));
    const pendingAI = generateStudentFollowup(createTestStudent("synthetic-late-ai"), {}, { force: true }); await vi.waitFor(() => expect(respond).toBeTypeOf("function"));
    const head = await api<CloudHead>("/sync/status?protocol=2", auth.token); const remote = snapshotOf(exportWholeBook(), "other-synthetic-device"); remote.workspaceBook.slices[0].data.remoteMarker = "new-generation"; remote.data = structuredClone(remote.workspaceBook.slices[0].data);
    await api("/sync/save", auth.token, { ...remote, protocol: 2, epoch: head.epoch, baseRevision: head.revision, clientMutationId: crypto.randomUUID(), hash: await contentHash(remote) });
    expect((await engine.sync()).phase).toBe("draft");
    await act(async () => { await engine!.reviewManual("cloud"); expect((await engine!.choose("cloud")).phase).toBe("synced"); });
    expect(request.isCurrent()).toBe(false); expect(undo?.()).toBe(false); act(() => { oldSet("late setter"); hook.rerender(); });
    expect(hook.result.current.draft[0]).toBe(""); expect(localStorage.getItem(oldDraftKey)).toBe(JSON.stringify("old active draft"));
    respond(Response.json({ summary: "旧代际合成建议", actions: ["老师确认后才可应用"], disclaimer: "合成" })); expect((await pendingAI).summary).toBe("旧代际合成建议");
    expect(readLastStudentFollowup("synthetic-late-ai")).toBeNull(); expect(exportWholeBook().slices[0].data.remoteMarker).toBe("new-generation"); hook.unmount();
  } finally { engine?.suspend(); vi.unstubAllGlobals(); await mf.dispose(); await rm(directory, { recursive: true, force: true }); }
}, 15_000);
