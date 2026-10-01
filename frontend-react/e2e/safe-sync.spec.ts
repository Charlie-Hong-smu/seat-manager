import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare, Log, LogLevel } from "../../cloudflare-worker/node_modules/miniflare/dist/src/index.js";
import { sha256 } from "../../shared/sync-content.mjs";
import { contentHash } from "../../shared/sync-content.mjs";
import type { WorkspaceBook } from "../src/app/state/types";
import type { CloudHead, PendingSnapshot } from "../src/app/state/syncProtocol";

test.use({ serviceWorkers: "block", reducedMotion: "reduce" });
const KEY = "seat-manager-workspaces-v1";
const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
const seed = (): WorkspaceBook => ({ version: 1, currentSliceId: "a", slices: ["a", "b"].map(id => ({ id, classId: id, className: `合成${id}班`, createdAt: "2026-10-01", updatedAt: "2026-10-01", term: { id: `term-${id}`, year: 2026, season: "autumn", label: "2026 秋", createdAt: "2026-10-01" }, data: { students: [], seatOrder: [], futureField: { preserved: id } } })) });
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY) as Promise<WorkspaceBook>;
async function setup(page: Page, ready = true) {
  let saved: PendingSnapshot | undefined; let revision = 0; let lose = false;
  const attempts: PendingSnapshot[] = []; const receipts = new Map<string, CloudHead>();
  const head = async (): Promise<CloudHead> => ({ ready, exists: Boolean(saved), licenseId: "synthetic-browser-space", epoch: "synthetic-epoch", revision, hash: saved ? await contentHash(saved) : "", strict: false, automaticAvailable: false });
  await page.addInitScript(({ key, book }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(book)); }, { key: KEY, book: seed() });
  await page.route("**/license/auth", route => route.fulfill({ json: { token: "synthetic-browser-token", expiresAt: Date.now() + 600000, licenseId: "synthetic-browser-space", edition } }));
  // Protocol transport substitute stays in e2e; SQLite/CAS correctness is exercised by workerd separately.
  await page.route(/\/sync\/(status|save|load)(\?.*)?$/, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("status")) { await route.fulfill({ json: await head() }); return; }
    if (path.endsWith("load")) { await route.fulfill({ json: { ...await head(), workspaceBook: saved?.workspaceBook, data: saved?.data } }); return; }
    const payload = route.request().postDataJSON() as PendingSnapshot; attempts.push(structuredClone(payload));
    const previous = receipts.get(payload.clientMutationId);
    if (previous) { await route.fulfill({ json: previous }); return; }
    if (payload.baseRevision !== revision || payload.epoch !== "synthetic-epoch") { await route.fulfill({ status: 409, json: { error: "conflict", ...await head() } }); return; }
    expect(payload.hash).toBe(await contentHash(payload));
    expect(payload.data).toEqual(payload.workspaceBook.slices.find(slice => slice.id === payload.workspaceBook.currentSliceId)!.data);
    saved = structuredClone(payload); revision++; const receipt = await head(); receipts.set(payload.clientMutationId, receipt);
    if (lose) { lose = false; await route.abort("failed"); return; }
    await route.fulfill({ json: receipt });
  });
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-SNAPSHOT");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page.getByRole("heading", { name: "今日班务" })).toBeVisible();
  return { attempts, saved: () => saved, lose: () => { lose = true; }, changeCloud() { saved!.workspaceBook.slices[0].data.remoteMarker = "other-device"; revision++; } };
}
const modal = (page: Page) => page.getByRole("dialog", { name: "云端备份与恢复" });
async function open(page: Page) { await page.getByRole("button", { name: "云同步", exact: true }).click(); await expect(modal(page)).toBeVisible(); }
async function bind(page: Page) {
  await open(page); await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(modal(page).getByText(/核对目标云空间/).first()).toBeVisible();
  await modal(page).getByRole("button", { name: "保留本机并发布", exact: true }).click();
  const confirm = page.getByRole("alertdialog", { name: "保留本机并发布到云端？" });
  await expect(confirm).toContainText("全部班级和学期"); await expect(confirm).toContainText("synthetic-browser-space");
  await confirm.getByRole("button", { name: "确认保留本机并发布", exact: true }).click();
  await expect(modal(page).getByText("云端已同步", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Escape");
}
async function edit(page: Page, title: string) {
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^任务与作业/ }).click();
  await page.getByRole("textbox", { name: "标题", exact: true }).fill(title);
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect.poll(async () => (await stored(page)).slices[0].data.followupTasks?.[0]?.title).toBe(title);
}

test("explicit whole-book binding, durable lost-response retry and dual-version choice", async ({ page }) => {
  const h = await setup(page); expect(h.attempts).toHaveLength(0); await bind(page);
  expect(h.saved()!.workspaceBook.slices).toHaveLength(2);
  await edit(page, "合成待发送事项"); h.lose(); await open(page);
  await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(modal(page).getByText(/云同步暂时不可用/).first()).toBeVisible();
  const mutation = h.attempts.at(-1)!.clientMutationId;
  await page.reload(); await open(page); await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(modal(page).getByText("云端已同步", { exact: true }).first()).toBeVisible();
  expect(h.attempts.at(-1)!.clientMutationId).toBe(mutation);
  await page.keyboard.press("Escape"); await edit(page, "冲突本机事项"); h.changeCloud(); await open(page);
  await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(modal(page).getByText(/双版本已保存/).first()).toBeVisible();
  const download = page.waitForEvent("download"); await modal(page).getByRole("button", { name: "导出同步恢复点", exact: true }).click();
  const artifact = await download; const chunks: Buffer[] = []; for await (const chunk of (await artifact.createReadStream())!) chunks.push(chunk);
  const recovery = JSON.parse(Buffer.concat(chunks).toString()); expect(recovery.conflict.local.workspaceBook.slices[0].data.followupTasks[0].title).toBe("冲突本机事项"); expect(recovery.conflict.remote.workspaceBook.slices[0].data.remoteMarker).toBe("other-device");
  await modal(page).getByRole("button", { name: "采用云端版本", exact: true }).click();
  await page.getByRole("alertdialog", { name: "采用云端全部班级学期？" }).getByRole("button", { name: "确认采用云端", exact: true }).click();
  await expect.poll(async () => (await stored(page)).slices[0].data.remoteMarker).toBe("other-device");
  expect((await stored(page)).slices[0].data.followupTasks?.[0]?.title).toBe("合成待发送事项");
  expect(await page.evaluate(() => localStorage.getItem("seat-manager-workspace-generation-v2"))).toBeTruthy();
  const count = h.attempts.length; await page.reload(); await open(page); await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(modal(page).getByText("云端已同步", { exact: true }).first()).toBeVisible(); expect(h.attempts).toHaveLength(count);
  await page.screenshot({ path: `output/playwright/safe-sync-desktop-${edition}.png` });
});

test("manual restore and upload preserve their direction and require confirmation", async ({ page }) => {
  const h = await setup(page); await bind(page); await edit(page, "仅在本机的合成事项"); await open(page);
  await modal(page).getByRole("button", { name: "恢复云端", exact: true }).click();
  const restore = page.getByRole("alertdialog", { name: "采用云端全部班级学期？" });
  await expect(restore).toBeVisible(); expect(h.attempts).toHaveLength(1);
  expect((await stored(page)).slices[0].data.followupTasks?.[0]?.title).toBe("仅在本机的合成事项");
  await restore.getByRole("button", { name: "确认采用云端", exact: true }).click();
  await expect.poll(async () => (await stored(page)).slices[0].data.followupTasks?.length || 0).toBe(0); expect(h.attempts).toHaveLength(1);
  h.changeCloud(); await modal(page).getByRole("button", { name: "上传本机", exact: true }).click();
  const upload = page.getByRole("alertdialog", { name: "保留本机并发布到云端？" });
  await expect(upload).toBeVisible(); expect((await stored(page)).slices[0].data.remoteMarker).toBeUndefined(); expect(h.attempts).toHaveLength(1);
  await upload.getByRole("button", { name: "确认保留本机并发布", exact: true }).click();
  await expect.poll(() => h.attempts.length).toBe(2); expect(h.saved()!.workspaceBook.slices[0].data.remoteMarker).toBeUndefined();
});

for (const width of [320, 390]) test(`phone ${width} save/sync status, touch target and closed migration gate`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 }); const h = await setup(page, false);
  const bar = page.locator(".app-sync-status-bar"); await expect(bar).toBeVisible(); await expect(bar).toContainText("本机已保存");
  const action = bar.getByRole("button", { name: "立即同步", exact: true }); const rect = await action.boundingBox(); expect(rect!.height).toBeGreaterThanOrEqual(44); expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
  await action.click(); await expect(modal(page).getByText(/尚待云存储迁移验收/).first()).toBeVisible();
  await modal(page).getByRole("button", { name: "立即同步", exact: true }).click(); expect(h.attempts).toHaveLength(0);
  await expect(modal(page)).toContainText("自动模式关闭");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  await page.screenshot({ path: `output/playwright/safe-sync-phone-${width}-${edition}.png` });
  await page.keyboard.press("Escape"); await expect(modal(page)).toHaveCount(0); await expect(action).toBeFocused();
});

test("phone browser restart retries its durable mutation against real SQLite without a second commit", async ({ playwright, baseURL }) => {
  test.setTimeout(60_000);
  const directory = await mkdtemp(join(tmpdir(), "seat-sync-phone-restart-"));
  const mf = new Miniflare({ name: "phone-sync-runtime", scriptPath: resolve("../cloudflare-worker/test/fixtures/sync-runtime.js"), modules: true,
    modulesRoot: resolve(".."), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR),
    kvNamespaces: ["SEAT_MANAGER_KV"], durableObjectsPersist: join(directory, "do"),
    durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } },
    bindings: { PRODUCT_TOKEN_SECRET: "synthetic-browser-runtime-secret", SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "false" },
  });
  const kv = await mf.getKVNamespace("SEAT_MANAGER_KV");
  await kv.put(`seat-manager:license:${await sha256("SYNTHETIC-RESTART")}`, JSON.stringify({ licenseId: "synthetic-restart-space", status: "active", allowedEditions: ["zhang", "commercial"], maxDevices: 3, devices: [] }));
  const mutations: string[] = []; let drop = false;
  const launch = () => playwright.chromium.launchPersistentContext(join(directory, "browser"), { headless: true, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
  let context = await launch();
  async function attach(page: Page) {
    await page.route(/\/(license\/auth|sync\/(status|save|load))(\?.*)?$/, async route => {
      const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace(/^\/api/, "");
      if (path === "/sync/save") mutations.push(request.postDataJSON().clientMutationId);
      const response = await mf.dispatchFetch(`https://worker.test${path}${url.search}`, { method: request.method(), headers: request.headers(), ...(request.method() === "POST" ? { body: request.postData()! } : {}) });
      if (drop && path === "/sync/save") { drop = false; await route.abort("failed"); return; }
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
  }
  try {
    let page = context.pages()[0]; await attach(page);
    await page.addInitScript(({ key, book }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(book)); }, { key: KEY, book: seed() });
    await page.goto(baseURL!); await page.getByPlaceholder("请输入授权码").fill("SYNTHETIC-RESTART");
    const remember = page.getByRole("checkbox", { name: /在此浏览器保持登录/ });
    await remember.focus(); await page.keyboard.press("Space"); await expect(remember).toBeChecked();
    await page.getByRole("button", { name: "进入工作台", exact: true }).click();
    const action = () => page.locator(".app-sync-status-bar").getByRole("button", { name: "立即同步", exact: true });
    await action().click(); await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
    await modal(page).getByRole("button", { name: "保留本机并发布", exact: true }).click();
    await page.getByRole("alertdialog", { name: "保留本机并发布到云端？" }).getByRole("button", { name: "确认保留本机并发布", exact: true }).click();
    await expect(modal(page).getByText("云端已同步", { exact: true }).first()).toBeVisible(); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
    await page.getByRole("dialog", { name: "切换工作区" }).getByRole("button", { name: /^任务与作业/ }).click();
    await page.getByRole("textbox", { name: "标题", exact: true }).fill("重开合成待同步事项"); await page.getByRole("button", { name: "创建任务", exact: true }).click();
    await expect.poll(async () => (await stored(page)).slices[0].data.followupTasks?.[0]?.title).toBe("重开合成待同步事项");
    drop = true; await action().click(); await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
    await expect(modal(page).getByText(/云同步暂时不可用/).first()).toBeVisible(); const mutation = mutations[mutations.length - 1];
    await context.close(); context = await launch(); page = context.pages()[0]; await attach(page); await page.goto(baseURL!);
    await expect(page.getByRole("heading", { name: "今日班务" })).toBeVisible(); await action().click(); await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
    await expect(modal(page).getByText("云端已同步", { exact: true }).first()).toBeVisible(); expect(mutations[mutations.length - 1]).toBe(mutation);
    const inspect = await (await mf.dispatchFetch("https://worker.test/_test/inspect?key=seat-manager%3Alicense%3Asynthetic-restart-space%3Astate")).json() as { head: { revision: number }; receipts: unknown[] };
    expect(inspect.head.revision).toBe(2); expect(inspect.receipts).toHaveLength(2);
    expect((await stored(page)).slices[0].data.followupTasks?.[0]?.title).toBe("重开合成待同步事项");
    await page.screenshot({ path: `output/playwright/safe-sync-restart-${edition}.png` });
  } finally { await context.close(); await mf.dispose(); await rm(directory, { recursive: true, force: true }); }
});
