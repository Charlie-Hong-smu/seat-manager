import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block", reducedMotion: "reduce" });
const KEY = "seat-manager-workspaces-v1";
const commercial = process.env.E2E_EDITION === "commercial";
function book(empty = false) {
  const createdAt = "2026-09-30T00:00:00.000Z";
  return { version: 1, currentSliceId: "a", slices: ["a", "b"].map(id => ({ id, classId: id, className: id === "a" ? "审查甲班" : "审查乙班", term: { id: `term-${id}`, year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data: { students: empty ? [] : [{ id: `s-${id}`, name: `${id}原名单`, gender: "男", records: [], exams: [], manualTags: [], autoTags: [] }], seatOrder: empty ? [] : [`s-${id}`] } })) };
}
async function login(page: Page, empty = false) {
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: KEY, data: book(empty) });
  await page.route("**/license/auth", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "test-data-safety", expiresAt: Date.now() + 600000, licenseId: "test-data-safety", edition: commercial ? "commercial" : "zhang" }) }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-DATA-SAFETY");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
}
async function stored(page: Page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || "{}"), KEY); }
async function switchClass(page: Page, name: string) {
  await page.locator(".app-workspace-trigger").click();
  await page.getByRole("button", { name: `删除 ${name} 2026 秋`, exact: true }).click();
  await expect(page.locator(".app-workspace-trigger")).toContainText(name);
}

test("empty class task survives reload and a class round trip", async ({ page }) => {
  await login(page, true);
  const tasks = () => page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^任务与作业/ }).click();
  await tasks();
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("开学前班级事项");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect.poll(async () => (await stored(page)).slices[0].data.followupTasks?.[0]?.title).toBe("开学前班级事项");
  await switchClass(page, "审查乙班");
  await switchClass(page, "审查甲班");
  await tasks();
  await expect(page.getByRole("article")).toContainText("开学前班级事项");
  await page.reload();
  await tasks();
  await expect(page.getByRole("article")).toContainText("开学前班级事项");
  await page.screenshot({ path: `/tmp/seat-manager-empty-class-${commercial ? "commercial" : "zhang"}.png` });
});

for (const replace of [false, true]) test(`slow roster ${replace ? "replace" : "append"} never writes another class`, async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /名单.*备份/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "slow.csv", mimeType: "text/csv", buffer: Buffer.from("姓名\n合成新学生\n") });
  await expect(page.getByText(/^已读取 1 行名单/)).toBeVisible();
  // Delay the import read, after the initial mapping preview has finished.
  await page.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function() {
      return new Promise<string>(resolve => {
        Object.assign(window, { releaseRoster: async () => resolve(await original.call(this)) });
      });
    };
  });
  if (replace) await page.getByRole("checkbox", { name: "覆盖现有名单", exact: true }).check();
  await page.getByRole("button", { name: "导入名单", exact: true }).click();
  if (replace) await page.getByRole("alertdialog", { name: "覆盖现有名单？" }).getByRole("button", { name: "导出备份并覆盖" }).click();
  await expect(page.getByText("正在导入名单...")).toBeVisible();
  await switchClass(page, "审查乙班");
  await page.evaluate(async () => { await (window as Window & { releaseRoster: () => Promise<void> }).releaseRoster(); });
  await expect(page.getByText(/班级或学期已切换，名单导入已取消/)).toBeVisible();
  const result = await stored(page);
  expect(result.slices.map((slice: { data: { students: Array<{ name: string }> } }) => slice.data.students.map(student => student.name))).toEqual([["a原名单"], ["b原名单"]]);
  await page.reload();
  expect((await stored(page)).slices[1].data.students[0].name).toBe("b原名单");
});

test("restore timestamp quota failure still refreshes teacher state before subsequent edits", async ({ page }) => {
  await login(page);
  const cloud = book();
  cloud.slices[0].data.students[0].name = "云端合成新学生";
  await page.route(/\/sync\/load$/, route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ workspaceBook: cloud, updatedAt: "2026-09-30T00:00:00Z" }) }));
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === "seat-manager-sync-last-restore-at") throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "云同步", exact: true }).click();
  await page.getByRole("button", { name: "恢复云端", exact: true }).click();
  await page.getByRole("alertdialog", { name: "从云端恢复数据？" }).getByRole("button", { name: "确认恢复云端", exact: true }).click();
  await expect(page.getByText(/恢复数据已生效/)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^任务与作业/ }).click();
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("恢复后新增班级事项");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect.poll(async () => (await stored(page)).slices[0].data.followupTasks?.[0]?.title).toBe("恢复后新增班级事项");
  expect((await stored(page)).slices[0].data.students[0].name).toBe("云端合成新学生");
  await page.reload();
  expect((await stored(page)).slices[0].data.students[0].name).toBe("云端合成新学生");
});

test("slow timetable import cancels when its class changes", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "管理课表", exact: true }).click();
  await page.evaluate(() => {
    File.prototype.text = function() {
      return new Promise<string>(resolve => {
        Object.assign(window, { releaseSchedule: () => resolve("课节,周一,周二,周三,周四,周五\n第一节,数学,数学,数学,数学,数学") });
      });
    };
  });
  await page.getByRole("complementary", { name: "课表管理" }).locator('input[type="file"]').setInputFiles({ name: "课表.csv", mimeType: "text/csv", buffer: Buffer.from("test") });
  await expect(page.getByText("正在解析课表...")).toBeVisible();
  await page.keyboard.press("Escape");
  await switchClass(page, "审查乙班");
  await page.evaluate(() => { (window as Window & { releaseSchedule: () => void }).releaseSchedule(); });
  await page.getByRole("button", { name: "管理课表", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "课表管理" })).not.toContainText("周一 数学");
  const result = await stored(page);
  expect(result.slices.every((slice: { data: { schedule?: { entries?: unknown[] } } }) => !slice.data.schedule?.entries?.length)).toBe(true);
  await page.reload();
  expect((await stored(page)).slices[1].data.schedule?.entries || []).toEqual([]);
});

test("selecting a new score file cannot relabel an old class draft while parsing", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "成绩", exact: true }).click();
  const scores = () => page.locator('input[type="file"]').first();
  await scores().setInputFiles({ name: "甲成绩.csv", mimeType: "text/csv", buffer: Buffer.from("姓名,数学,数学班排,总分,总分班排\na原名单,80,1,80,1") });
  await expect(page.getByText(/^已解析 1 名学生/)).toBeVisible();
  await switchClass(page, "审查乙班");
  await page.evaluate(() => {
    File.prototype.text = function() {
      return new Promise<string>(resolve => { Object.assign(window, { releaseScores: () => resolve("姓名,数学,数学班排,总分,总分班排\nb原名单,90,1,90,1") }); });
    };
  });
  await scores().setInputFiles({ name: "乙成绩.csv", mimeType: "text/csv", buffer: Buffer.from("test") });
  await expect(page.getByText("正在解析成绩表...")).toBeVisible();
  await expect(page.getByRole("button", { name: "保存考试", exact: true })).toBeHidden();
  await page.evaluate(() => { (window as Window & { releaseScores: () => void }).releaseScores(); });
  await expect(page.getByText(/^已解析 1 名学生/)).toBeVisible();
  await page.getByRole("button", { name: "保存考试", exact: true }).click();
  await expect(page.getByText("已保存「乙成绩」。", { exact: true })).toBeVisible();
  const result = await stored(page);
  expect(result.slices[0].data.savedExams || []).toEqual([]);
  expect(result.slices[1].data.savedExams[0].entries.map((entry: { name: string }) => entry.name)).toEqual(["b原名单"]);
});
