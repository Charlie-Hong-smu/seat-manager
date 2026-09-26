import { expect, test } from "@playwright/test";
import worker from "../../cloudflare-worker/deepseek-ai-worker.js";
import { sha256Hex } from "../../cloudflare-worker/worker-auth.js";
import type { WorkspaceBook } from "../src/app/state/types";

test.use({ serviceWorkers: "block" });
const STORAGE_KEY = "seat-manager-workspaces-v1";
const SYNC_KEY = "seat-manager:license:e2e-cloud-sync:state";

function makeBook(): WorkspaceBook {
  const createdAt = "2026-09-26T00:00:00.000Z";
  return {
    version: 1, currentSliceId: "a-autumn",
    slices: [
      { id: "a-autumn", classId: "a", className: "同步甲班", season: "autumn" as const },
      { id: "a-spring", classId: "a", className: "同步甲班", season: "spring" as const },
      { id: "b-autumn", classId: "b", className: "同步乙班", season: "autumn" as const },
    ].map(({ season, ...slice }, index) => ({
      ...slice, createdAt, updatedAt: createdAt,
      term: { id: `term-${slice.id}`, year: 2026, season, label: season === "autumn" ? "2026 秋" : "2026 春", createdAt },
      data: {
        students: [{ id: `s${index}`, name: `同步学生${index}`, gender: "男", manualTags: [], autoTags: [], records: [], exams: [] }],
        seatOrder: [`s${index}`], futureField: { marker: slice.id },
      },
    })),
  };
}

test("manual cloud sync preserves every class and term through the real Worker handlers", async ({ page }) => {
  const values = new Map<string, unknown>();
  values.set(`seat-manager:license:${await sha256Hex("TEST-ONLY-CLOUD-SYNC")}`, {
    licenseId: "e2e-cloud-sync", status: "active", allowedEditions: ["zhang", "commercial"], maxDevices: 3, devices: [],
  });
  const env = {
    PRODUCT_TOKEN_SECRET: "test-only-signing-secret",
    SEAT_MANAGER_KV: {
      async get(key: string) { return values.get(key) ?? null; },
      async put(key: string, value: string) { values.set(key, JSON.parse(value)); },
    },
  };
  const syncRequests: string[] = [];
  // Only storage and transport are local test doubles; auth and sync execute production handlers.
  await page.route(/\/(license\/auth|sync\/(status|save|load))$/, async route => {
    const incoming = route.request();
    const path = new URL(incoming.url()).pathname.replace(/^\/api/, "");
    if (path.startsWith("/sync/")) syncRequests.push(path);
    const response = await worker.fetch(new Request(`https://worker.test${path}`, {
      method: incoming.method(), headers: incoming.headers(),
      ...(incoming.method() === "POST" ? { body: incoming.postData() } : {}),
    }), env);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  const initial = makeBook();
  await page.addInitScript(({ key, book }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(book));
  }, { key: STORAGE_KEY, book: initial });
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-CLOUD-SYNC");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await page.getByRole("button", { name: "云同步", exact: true }).click();
  expect(syncRequests).toEqual([]);
  await page.getByRole("button", { name: "上传本机", exact: true }).click();
  await expect(page.getByText(/^已上传到云端：/)).toBeVisible();
  const saved = values.get(SYNC_KEY) as { workspaceBook: WorkspaceBook; data: unknown };
  expect(saved.workspaceBook.slices.map(slice => [slice.id, slice.data.futureField])).toEqual(initial.slices.map(slice => [slice.id, slice.data.futureField]));
  expect(saved.workspaceBook.currentSliceId).toBe(initial.currentSliceId);
  expect(saved.data).toEqual(saved.workspaceBook.slices[0].data);

  // Replace this isolated browser's book to distinguish a real restore from unchanged local data.
  const local = makeBook();
  local.slices = [local.slices[2]];
  local.currentSliceId = local.slices[0].id;
  await page.evaluate(({ key, book }) => localStorage.setItem(key, JSON.stringify(book)), { key: STORAGE_KEY, book: local });
  await page.reload();
  await page.getByRole("button", { name: "云同步", exact: true }).click();
  await page.getByRole("button", { name: "恢复云端", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "从云端恢复数据？" });
  await confirm.getByRole("button", { name: "取消", exact: true }).click();
  expect(syncRequests).toEqual(["/sync/save"]);
  const readBook = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY) as Promise<WorkspaceBook>;
  expect((await readBook()).slices).toHaveLength(1);

  await page.getByRole("button", { name: "恢复云端", exact: true }).click();
  const download = page.waitForEvent("download");
  await confirm.getByRole("button", { name: "确认恢复云端", exact: true }).click();
  const backup = await download;
  expect(backup.suggestedFilename()).toContain("backup");
  const chunks: Buffer[] = [];
  for await (const chunk of (await backup.createReadStream())!) chunks.push(chunk);
  const snapshot = JSON.parse(Buffer.concat(chunks).toString());
  expect(snapshot.reason).toBe("before-import");
  expect(snapshot.workspaceBook.slices.map((slice: { id: string }) => slice.id)).toEqual(["b-autumn"]);
  await expect.poll(async () => (await readBook()).slices.length).toBe(3);
  const restored = await readBook();
  expect(restored.currentSliceId).toBe(initial.currentSliceId);
  expect(restored.slices.map(slice => [slice.id, slice.data.futureField])).toEqual(initial.slices.map(slice => [slice.id, slice.data.futureField]));
  expect(restored.slices.slice(1)).toEqual(saved.workspaceBook.slices.slice(1));
  expect(syncRequests).toEqual(["/sync/save", "/sync/load"]);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  expect((await readBook()).slices).toHaveLength(3);
});
