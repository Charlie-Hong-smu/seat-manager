import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare, Log, LogLevel } from "../../cloudflare-worker/node_modules/miniflare/dist/src/index.js";
import { contentHash, sha256 } from "../../shared/sync-content.mjs";
import type { WorkspaceBook } from "../src/app/state/types";

const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
const KEY = "seat-manager-workspaces-v1";
const seed = (): WorkspaceBook => ({ version: 1, currentSliceId: "a", slices: ["a", "b"].map(id => ({ id, classId: id, className: `合成${id}班`, createdAt: "2026-10-02", updatedAt: "2026-10-02", term: { id: `term-${id}`, year: 2026, season: "autumn", label: "合成学期", createdAt: "2026-10-02" }, data: { students: [], seatOrder: [], retainedField: `合成保留${id}` } })) });
const modal = (page: Page) => page.getByRole("dialog", { name: "云端备份与恢复", exact: true });
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!) as WorkspaceBook, KEY);
const hashBook = (book: WorkspaceBook) => contentHash({ workspaceBook: book, data: book.slices.find(slice => slice.id === book.currentSliceId)!.data });
async function login(page: Page) {
  await page.getByPlaceholder("请输入授权码").fill("SYNTHETIC-FRESH-BROWSER"); await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page.getByRole("heading", { name: "今日班务" })).toBeVisible();
  await expect(page.locator(".app-sync-status-bar")).toContainText("本机已保存");
  await expect.poll(async () => (await stored(page)).slices[0].data.followupTasks).toEqual([]);
}
async function open(page: Page) {
  const bar = page.locator(".app-sync-status-bar");
  if (await bar.isVisible()) await bar.getByRole("button", { name: "立即同步", exact: true }).click();
  else await page.getByRole("button", { name: "云同步", exact: true }).click();
  await expect(modal(page)).toBeVisible();
}

async function harness(page: Page) {
  const directory = await mkdtemp(join(tmpdir(), "seat-fresh-browser-"));
  const code = "SYNTHETIC-FRESH-BROWSER"; const digest = await sha256(code); const space = `tenant-${digest}`; const createdAt = new Date(Date.now() - 60_000).toISOString();
  const displayName = "同步合成测试-20261002";
  const mf = new Miniflare({ name: "fresh-browser", scriptPath: resolve("../cloudflare-worker/test/fixtures/sync-runtime.js"), modules: true, modulesRoot: resolve(".."), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR), kvNamespaces: ["SEAT_MANAGER_KV"], kvPersist: join(directory, "kv"), durableObjectsPersist: join(directory, "do"), durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } }, bindings: { PRODUCT_TOKEN_SECRET: "synthetic-fresh-browser-secret", SYNC_FRESH_INITIALIZATION_ENABLED: "true", SYNC_FRESH_TEST_GRANTS: JSON.stringify({ [space]: { purpose: "synthetic-test", displayName, licenseCreatedAt: createdAt, approvedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() } }), SYNC_AUTOMATIC_ENABLED: "false", SYNC_AUTOMATIC_SPACES: "[]" } });
  await (await mf.getKVNamespace("SEAT_MANAGER_KV")).put(`seat-manager:license:${digest}`, JSON.stringify({ licenseId: space, displayName, createdAt, status: "active", allowedEditions: edition === "zhang" ? ["zhang"] : ["zhang", "commercial"], maxDevices: 3, aiEnabled: false, devices: [] }));
  let initializes = 0; let saves = 0; let token = "";
  const call = (path: string) => mf.dispatchFetch(`https://worker.test${path}`, { headers: { Authorization: `Bearer ${token}` } });
  await page.route(/\/(license|sync)\//, async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace(/^\/api/, ""); const body = request.postData();
    if (path === "/sync/migration" && body && JSON.parse(body).action === "initialize") initializes++;
    if (path === "/sync/save") saves++;
    const response = await mf.dispatchFetch(`https://worker.test${path}${url.search}`, { method: request.method(), headers: request.headers(), ...(body ? { body } : {}) });
    const text = await response.text();
    if (path === "/license/auth" && response.ok) token = JSON.parse(text).token;
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: text });
  });
  await page.addInitScript(({ key, book }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(book)); }, { key: KEY, book: seed() });
  return { space, initializes: () => initializes, saves: () => saves, call, async legacy(value: string) { await (await mf.getKVNamespace("SEAT_MANAGER_KV")).put(`seat-manager:license:${space}:state`, value); }, async close() { await mf.dispose(); await rm(directory, { recursive: true, force: true }); } };
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
test.describe(`${viewport.width}x${viewport.height} input context`, () => {
test.use({ hasTouch: viewport.width < 768 || viewport.height <= 500 });
test(`fresh initialization preserves the cabinet and Commercial boundary at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
  await page.setViewportSize(viewport);
  if (viewport.width === 320) await page.emulateMedia({ reducedMotion: "reduce" });
  const h = await harness(page);
  try {
    // Older books acquire normal frontend defaults on the first formal local save.
    await page.goto("./"); await login(page);
    const before = await hashBook(await stored(page));
    await open(page);
    await expect(modal(page).getByText(h.space, { exact: true })).toBeVisible();
    if (edition === "commercial") {
      await expect(modal(page).getByRole("button", { name: "初始化全新测试空间", exact: true })).toHaveCount(0);
      expect(h.initializes()).toBe(0); expect((await (await h.call("/sync/status?protocol=2")).json() as { ready: boolean }).ready).toBe(false);
      await modal(page).getByRole("button", { name: "上传本机", exact: true }).click(); await expect.poll(h.saves).toBe(1);
      expect((await (await h.call("/sync/status?protocol=2")).json() as { ready: boolean }).ready).toBe(false);
      return;
    }
    await modal(page).getByRole("button", { name: "初始化全新测试空间", exact: true }).click();
    const confirm = page.getByRole("alertdialog", { name: "初始化这个新建合成测试空间？" });
    await expect(confirm).toContainText(h.space); await expect(confirm).toContainText("全部班级和学期"); await expect(confirm).toContainText("可能被舍弃");
    expect(await confirm.locator("p").first().evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const button = confirm.getByRole("button", { name: "确认合成测试并初始化", exact: true }); await button.scrollIntoViewIfNeeded(); const bounds = await button.boundingBox(); expect(bounds).not.toBeNull();
    if (viewport.width < 768 || viewport.height <= 500) expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await expect.poll(() => button.evaluate(element => { const r = element.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return element === hit || element.contains(hit); })).toBe(true);
    await button.focus(); await page.keyboard.press("Tab"); expect(await confirm.evaluate(element => element.contains(document.activeElement))).toBe(true);
    if (viewport.width === 390) await page.screenshot({ path: testInfo.outputPath("fresh-consent-phone.png") });
    await page.keyboard.press("Escape"); await expect(confirm).toHaveCount(0); await expect(modal(page)).toBeVisible(); expect(h.initializes()).toBe(0);
    await expect(modal(page).getByRole("button", { name: "初始化全新测试空间", exact: true })).toBeFocused();
    await modal(page).getByRole("button", { name: "初始化全新测试空间", exact: true }).click(); await button.click();
    await expect(modal(page)).toContainText("本机整柜未上传"); expect(h.initializes()).toBe(1); expect(h.saves()).toBe(0); expect(await hashBook(await stored(page))).toBe(before);
    if (viewport.width === 390) {
      await expect(page.locator(".dialog-presence").filter({ hasText: "初始化这个新建合成测试空间？" })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath("fresh-initialized-phone.png") });
    }
    const head = await (await h.call("/sync/status?protocol=2")).json() as Record<string, unknown>; expect(head).toMatchObject({ ready: true, exists: false, revision: 0, strict: true, initializationReady: true, authoritySource: "fresh-test-initialization", automaticAvailable: false });
    await expect(modal(page).getByRole("button", { name: "启用自动同步", exact: true })).toHaveCount(0);
    await modal(page).getByRole("button", { name: "立即同步", exact: true }).click(); await modal(page).getByRole("button", { name: "保留本机并发布", exact: true }).click();
    await page.getByRole("alertdialog", { name: "保留本机并发布到云端？" }).getByRole("button", { name: "确认保留本机并发布", exact: true }).click();
    await expect(modal(page).getByText("云端已同步", { exact: true }).first()).toBeVisible(); expect(h.saves()).toBe(1); expect(await hashBook(await stored(page))).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await h.close(); }
});
});
}

test("malformed old KV does not hide pending initialization cancellation after reopening", async ({ page }) => {
  test.skip(edition === "commercial", "Commercial is not eligible for this Zhang-only initializer");
  await page.setViewportSize({ width: 390, height: 844 }); const h = await harness(page);
  try {
    await page.goto("./"); await login(page); const before = await hashBook(await stored(page)); await open(page);
    await expect(modal(page).getByRole("button", { name: "初始化全新测试空间", exact: true })).toBeVisible(); await h.legacy("synthetic-bad-json");
    await modal(page).getByRole("button", { name: "初始化全新测试空间", exact: true }).click();
    await page.getByRole("alertdialog", { name: "初始化这个新建合成测试空间？" }).getByRole("button", { name: "确认合成测试并初始化", exact: true }).click();
    await expect(modal(page).getByRole("button", { name: "取消空初始化", exact: true })).toBeVisible();
    await page.reload(); if (await page.getByPlaceholder("请输入授权码").isVisible()) await login(page); await open(page);
    await modal(page).getByRole("button", { name: "取消空初始化", exact: true }).click();
    await page.getByRole("alertdialog", { name: "取消未完成的空初始化？" }).getByRole("button", { name: "确认取消空初始化", exact: true }).click();
    await expect(modal(page)).toContainText("冻结已解除"); expect(await hashBook(await stored(page))).toBe(before); expect(h.saves()).toBe(0);
    const status = await (await h.call("/sync/migration")).json() as { freshInitialization: { phase: string } }; expect(status.freshInitialization.phase).toBe("cancelled");
  } finally { await h.close(); }
});
