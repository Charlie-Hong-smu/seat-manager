import { expect, test, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Miniflare, Log, LogLevel } from "../../cloudflare-worker/node_modules/miniflare/dist/src/index.js";
import { canonicalJson, contentHash, sha256 } from "../../shared/sync-content.mjs";
import type { WorkspaceBook } from "../src/app/state/types";
import type { CloudHead } from "../src/app/state/syncProtocol";

const KEY = "seat-manager-workspaces-v1";
const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
const space = "synthetic-enabled-browser";
const stateKey = `seat-manager:license:${space}:state`;
const seed = (): WorkspaceBook => ({ version: 1, currentSliceId: "a", slices: ["a", "b"].map(id => ({ id, classId: id, className: `合成${id}班`, createdAt: "2026-10-01", updatedAt: "2026-10-01", term: { id: `term-${id}`, year: 2026, season: "autumn", label: "2026 秋", createdAt: "2026-10-01" }, data: { students: [], seatOrder: [], retainedField: id } })) });
const modal = (page: Page) => page.getByRole("dialog", { name: "云端备份与恢复" });
const stored = (page: Page) => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), KEY) as Promise<WorkspaceBook>;
async function open(page: Page) {
  const bar = page.locator(".app-sync-status-bar");
  if (await bar.isVisible()) await bar.getByRole("button", { name: "立即同步", exact: true }).click();
  else await page.getByRole("button", { name: "云同步", exact: true }).click();
  await expect(modal(page)).toBeVisible();
}
async function taskPage(page: Page) {
  if (await page.getByRole("button", { name: "展开侧栏", exact: true }).isVisible()) {
    await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
    await page.getByRole("dialog", { name: "切换工作区" }).getByRole("button", { name: /^任务与作业/ }).click();
  } else await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^任务与作业/ }).click();
}
async function edit(page: Page, title: string) {
  await taskPage(page); await page.getByRole("textbox", { name: "标题", exact: true }).fill(title);
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect.poll(async () => (await stored(page)).slices[0].data.followupTasks?.[0]?.title).toBe(title);
}
async function harness(automaticSpaces = JSON.stringify([space])) {
  const directory = await mkdtemp(join(tmpdir(), "seat-enabled-browser-"));
  const source = { version: 1, data: seed().slices[0].data, workspaceBook: seed() };
  const manifest = { [space]: { cutoverId: "synthetic-cutover-browser", retiredWorkerVersion: "synthetic-retired-browser", sourceIntegrity: await sha256(canonicalJson(source)), oldWritersRetired: true, backupRetained: true, verifiedAt: new Date().toISOString() } };
  const make = () => new Miniflare({ name: "enabled-browser-runtime", scriptPath: resolve("../cloudflare-worker/test/fixtures/sync-runtime.js"), modules: true,
    modulesRoot: resolve(".."), modulesRules: [{ type: "ESModule", include: ["**/*.js", "**/*.mjs"] }], compatibilityDate: "2026-06-29", log: new Log(LogLevel.ERROR),
    kvNamespaces: ["SEAT_MANAGER_KV"], kvPersist: join(directory, "kv"), durableObjectsPersist: join(directory, "do"),
    durableObjects: { SYNC_COORDINATOR: { className: "FaultSyncCoordinator", useSQLite: true }, ACCOUNT_COORDINATOR: { className: "AccountCoordinator", useSQLite: true } },
    // Commercial readiness here belongs only to this synthetic runtime and staged build.
    bindings: { PRODUCT_TOKEN_SECRET: "synthetic-enabled-browser-secret", SYNC_MIGRATION_ENABLED: "true", SYNC_AUTOMATIC_ENABLED: "true", SYNC_AUTOMATIC_SPACES: automaticSpaces, SYNC_COMMERCIAL_PROTOCOL_READY: edition === "commercial" ? "true" : "false", SYNC_CUTOVER_MANIFESTS: JSON.stringify(manifest) },
  });
  let mf = make(); const kv = await mf.getKVNamespace("SEAT_MANAGER_KV");
  await kv.put(stateKey, JSON.stringify(source));
  await kv.put(`seat-manager:license:${await sha256("SYNTHETIC-ENABLED")}`, JSON.stringify({ licenseId: space, status: "active", allowedEditions: edition === "commercial" ? ["zhang", "commercial"] : ["zhang"], maxDevices: 5, devices: [] }));
  let token = ""; let offline = false; let drop = false; let saves = 0; let modes = 0;
  async function call(path: string, body?: unknown) {
    return mf.dispatchFetch(`https://worker.test${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  }
  return {
    async attach(page: Page) {
      await page.route(/\/(license\/auth|sync\/[^?]+)(\?.*)?$/, async route => {
        const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace(/^\/api/, "");
        if (offline && path.startsWith("/sync/")) { await route.abort("internetdisconnected"); return; }
        if (path === "/sync/save") saves++;
        if (path === "/sync/mode") modes++;
        const response = await mf.dispatchFetch(`https://worker.test${path}${url.search}`, { method: request.method(), headers: request.headers(), ...(request.method() === "POST" ? { body: request.postData()! } : {}) });
        const body = await response.text(); if (path === "/license/auth") token = JSON.parse(body).token;
        if (drop && path === "/sync/save") { drop = false; await route.abort("failed"); return; }
        await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body });
      });
      await page.addInitScript(({ key, book }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(book)); }, { key: KEY, book: seed() });
    },
    async login(page: Page) {
      await page.goto("./"); await page.getByPlaceholder("请输入授权码").fill("SYNTHETIC-ENABLED");
      const remember = page.getByRole("checkbox", { name: /在此浏览器保持登录/ });
      if (!await remember.isChecked()) { await remember.focus(); await page.keyboard.press("Space"); }
      await expect(remember).toBeChecked();
      await page.getByRole("button", { name: "进入工作台", exact: true }).click(); await expect(page.getByRole("heading", { name: "今日班务" })).toBeVisible();
    },
    call, saves: () => saves, modes: () => modes, offline(value: boolean) { offline = value; }, drop() { drop = true; },
    async head() { return await (await call("/sync/status?protocol=2")).json() as CloudHead; },
    async cloudEdit(marker: string) {
      const snapshot = await (await call("/sync/load?protocol=2")).json() as CloudHead & { workspaceBook: WorkspaceBook };
      snapshot.workspaceBook.slices[0].data.remoteMarker = marker;
      const body = { version: 1, workspaceBook: snapshot.workspaceBook, data: snapshot.workspaceBook.slices.find(s => s.id === snapshot.workspaceBook.currentSliceId)!.data, protocol: 2, epoch: snapshot.epoch, baseRevision: snapshot.revision, clientMutationId: crypto.randomUUID(), hash: await contentHash(snapshot) };
      expect((await call("/sync/save", body)).status).toBe(200);
    },
    async restart() { await mf.dispose(); mf = make(); }, async close() { await mf.dispose(); await rm(directory, { recursive: true, force: true }); },
  };
}
async function migrate(page: Page) {
  await open(page); await modal(page).getByRole("button", { name: "准备安全迁移", exact: true }).click();
  const prepare = page.getByRole("alertdialog", { name: "准备此空间的安全迁移？" }); await expect(prepare).toContainText(space); await expect(prepare).toContainText("全部班级和学期");
  await prepare.getByRole("button", { name: "确认冻结并准备备份", exact: true }).click();
  await expect(modal(page).getByRole("button", { name: "确认提交迁移", exact: true })).toBeDisabled();
  const download = page.waitForEvent("download"); await modal(page).getByRole("button", { name: "下载并校验迁移备份", exact: true }).click();
  const file = await download; const chunks: Buffer[] = []; for await (const chunk of (await file.createReadStream())!) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString()); expect(backup.snapshot.workspaceBook.slices).toHaveLength(2); expect(backup.hash).toBe(await contentHash(backup.snapshot)); expect(backup.integrity).toBe(await sha256(JSON.stringify(backup.snapshot)));
  await modal(page).getByRole("button", { name: "确认提交迁移", exact: true }).click();
  await page.getByRole("alertdialog", { name: "确认提交已校验的迁移备份？" }).getByRole("button", { name: "已保留备份，确认迁移", exact: true }).click();
  await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
  await modal(page).getByRole("button", { name: "采用云端版本", exact: true }).click();
  await page.getByRole("alertdialog", { name: "采用云端全部班级学期？" }).getByRole("button", { name: "确认采用云端", exact: true }).click();
  await expect(modal(page).getByText(/已采用云端版本/).first()).toBeVisible();
}
async function enable(page: Page) {
  // Legacy imports may acquire existing frontend defaults; review that formal snapshot first.
  await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
  await expect(modal(page).getByText("云端已同步", { exact: true }).first()).toBeVisible();
  await modal(page).getByRole("button", { name: /^(启用|恢复)自动同步$/ }).click();
  const confirm = page.getByRole("alertdialog", { name: /^(启用|恢复)自动同步？$/ }); await expect(confirm).toContainText(space); await expect(confirm).toContainText("全部班级和学期");
  await confirm.getByRole("button", { name: "确认启用全部班级学期", exact: true }).click();
  await expect(modal(page).getByRole("button", { name: "停用自动同步", exact: true })).toBeVisible();
}

test("phone migration consent, positive public mode, saved upload and explicit disable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); const h = await harness();
  try {
    await h.attach(page); await h.login(page); await migrate(page); expect(h.saves()).toBe(0); expect(h.modes()).toBe(0);
    await enable(page); const baseline = h.saves(); expect(h.modes()).toBe(1); expect((await h.head()).strict).toBe(true); await page.keyboard.press("Escape");
    await edit(page, "自动同步合成事项"); await expect.poll(h.saves, { timeout: 10_000 }).toBe(baseline + 1);
    await open(page); await expect(modal(page)).toContainText("云端已同步"); await modal(page).getByRole("button", { name: "停用自动同步", exact: true }).click();
    await page.keyboard.press("Escape"); await edit(page, "停用后仅本机保存"); await page.waitForTimeout(3400); expect(h.saves()).toBe(baseline + 1);
    await page.reload(); await open(page); await expect(modal(page).getByRole("button", { name: "启用自动同步", exact: true })).toBeVisible();
    await expect(modal(page)).toHaveCSS("opacity", "1");
    expect((await modal(page).getByRole("button", { name: "启用自动同步", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `output/playwright/sync-enabled-phone-${edition}.png`, animations: "disabled" });
  } finally { await h.close(); }
});

test("enabled frontend keeps an excluded migrated space manual", async ({ page }) => {
  const h = await harness("[]");
  try {
    await h.attach(page); await h.login(page); await migrate(page);
    expect((await h.head()).automaticAvailable).toBe(false); expect((await h.head()).strict).toBe(false);
    await expect(modal(page).getByRole("button", { name: /^(启用|恢复)自动同步$/ })).toHaveCount(0);
    await expect(modal(page)).toContainText("自动模式关闭"); expect(h.modes()).toBe(0);
    await page.keyboard.press("Escape"); await edit(page, "名单外仅本机修改");
    await page.waitForTimeout(3400); expect(h.saves()).toBe(0);
    await open(page); await modal(page).getByRole("button", { name: "立即同步", exact: true }).click();
    await expect(modal(page).getByText("云端已同步", { exact: true }).first()).toBeVisible();
    expect(h.saves()).toBe(1); expect(h.modes()).toBe(0); expect((await h.head()).automaticAvailable).toBe(false);
  } finally { await h.close(); }
});

test("automatic drafts, clean pull, offline double edit and durable conflict pause", async ({ page }) => {
  const h = await harness();
  try {
    await h.attach(page); await h.login(page); await migrate(page); await enable(page); const baseline = h.saves(); await page.keyboard.press("Escape");
    await taskPage(page); await page.getByRole("textbox", { name: "标题", exact: true }).fill("活动合成草稿");
    await h.cloudEdit("wait-for-draft"); await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await open(page); await expect(modal(page)).toContainText("草稿"); await page.keyboard.press("Escape"); expect((await stored(page)).slices[0].data.remoteMarker).toBeUndefined();
    await page.getByRole("textbox", { name: "标题", exact: true }).fill(""); await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await open(page);
    await expect.poll(async () => (await stored(page)).slices[0].data.remoteMarker).toBe("wait-for-draft"); await page.keyboard.press("Escape"); expect(h.saves()).toBe(baseline);
    h.offline(true); await edit(page, "离线合成双改"); await page.waitForTimeout(3300); await h.cloudEdit("remote-double-edit"); h.offline(false);
    await h.restart(); await page.reload(); await open(page); await expect(modal(page)).toContainText("双版本已保存");
    expect((await stored(page)).slices[0].data.followupTasks?.[0]?.title).toBe("离线合成双改"); expect(h.saves()).toBe(baseline);
    await expect(modal(page)).toContainText("自动模式已暂停"); await page.keyboard.press("Escape");
    await page.evaluate(() => { window.dispatchEvent(new Event("online")); document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(3400); expect(h.saves()).toBe(baseline);
    await page.reload(); await open(page); await expect(modal(page).getByRole("button", { name: "恢复自动同步", exact: true })).toBeVisible();
  } finally { await h.close(); }
});

test("prepared public migration survives restart and requires a fresh verified download", async ({ page }) => {
  const h = await harness();
  try {
    await h.attach(page); await h.login(page); await open(page); await modal(page).getByRole("button", { name: "准备安全迁移", exact: true }).click();
    await page.getByRole("alertdialog", { name: "准备此空间的安全迁移？" }).getByRole("button", { name: "确认冻结并准备备份", exact: true }).click();
    await expect(modal(page).getByRole("button", { name: "下载并校验迁移备份", exact: true })).toBeVisible();
    expect((await h.call("/sync/save", { version: 1, data: seed().slices[0].data })).status).toBe(503);
    await h.restart(); await page.reload(); await open(page); await expect(modal(page).getByRole("button", { name: "确认提交迁移", exact: true })).toBeDisabled();
    await modal(page).getByRole("button", { name: "取消迁移", exact: true }).click(); await page.getByRole("alertdialog", { name: "取消此次迁移？" }).getByRole("button", { name: "确认取消迁移", exact: true }).click();
    await expect(modal(page)).toContainText("迁移已取消");
    expect((await h.call("/sync/save", { version: 1, data: seed().slices[0].data })).status).toBe(200); expect((await h.head()).ready).toBe(false);
  } finally { await h.close(); }
});
