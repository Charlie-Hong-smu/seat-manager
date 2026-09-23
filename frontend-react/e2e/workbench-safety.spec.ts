import { expect, test, type Page } from "@playwright/test";

const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
test.use({ reducedMotion: "reduce", timezoneId: "Asia/Shanghai" });
async function login(page: Page, customLayout = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(custom => {
    if (localStorage.getItem("seat-manager-workspaces-v1")) return;
    const createdAt = "2026-01-01T00:00:00Z";
    const profile = { generatedComment: "已经保存的原评语", teacherNote: "课堂积极", style: "warm", lengthMode: "standard", targetWordCount: 120, updatedAt: createdAt };
    const students = ["张三", "李四", "王五"].map((name, index) => ({ id: `s${index + 1}`, name, gender: "男", manualTags: [], autoTags: [], records: [], exams: [], aiComments: index === 0 ? { profile } : {} }));
    const layout = { version: 1, template: "freeform", frontEdge: "top", canvas: { width: 1000, height: 700 }, seats: [{ id: "custom-1", x: 200, y: 200, rotation: 0, label: "1" }, { id: "custom-2", x: 400, y: 200, rotation: 0, label: "2" }], groups: [], neighborEdges: [] };
    const data = { students, seatOrder: custom ? ["s3", "s2"] : ["s3", "s2", "s1", null, null, null, null, null], lockedSeats: [0], settings: custom ? { seatLayout: layout } : {}, seatHistory: custom ? [{ id: "snapshot", note: "改名前快照", time: createdAt, rows: 1, seats: ["旧名", "旧名", "旧王五", "", "", "", "", ""], studentIds: ["s2", "s1", "s3", null, null, null, null, null], lockedSeats: [1] }] : [] };
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify({ version: 1, currentSliceId: "audit-slice", slices: [{ id: "audit-slice", classId: "audit-class", className: "流程测试班", term: { id: "audit-term", year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data }] }));
  }, customLayout);
  await page.route("**/license/auth", route => route.fulfill({ json: { token: "e2e-workbench-audit", expiresAt: Date.now() + 600000, licenseId: "e2e-workbench-audit", edition } }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-WORKBENCH");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
}
async function data(page: Page) {
  return page.evaluate(() => { const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}"); return book.slices.find((slice: { id: string }) => slice.id === book.currentSliceId).data; });
}
const nav = (page: Page, name: RegExp) => page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name }).click();
const workbench = (page: Page) => page.getByRole("region", { name: "评语工作台" });
const editor = (page: Page) => workbench(page).getByRole("textbox", { name: "评语正文编辑器" });
const select = (page: Page, name: string) => workbench(page).locator('aside').first().getByRole("button").filter({ hasText: name }).click();

test("roster reordering respects locks and saved snapshots retain student IDs", async ({ page }) => {
  await login(page); await nav(page, /^座位/);
  await page.getByRole("button", { name: /^排座/ }).click();
  await page.getByRole("button", { name: "按名单立即重排", exact: true }).click();
  await expect.poll(async () => (await data(page)).seatOrder.slice(0, 3)).toEqual(["s3", "s1", "s2"]);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect.poll(async () => (await data(page)).seatOrder.slice(0, 3)).toEqual(["s3", "s2", "s1"]);
  await nav(page, /^历史/); await page.getByRole("button", { name: "座位快照", exact: true }).click();
  await page.getByPlaceholder("记录名称，例如：期中后调整").fill("核对后保存");
  await page.getByRole("button", { name: "保存座位", exact: true }).click();
  await expect.poll(async () => (await data(page)).seatHistory[0].studentIds.slice(0, 3)).toEqual(["s3", "s2", "s1"]);
  expect((await data(page)).seatHistory[0].lockedSeats).toEqual([0]);
});

test("restoring a snapshot matches stable IDs and undo restores the previous layout and locks", async ({ page }) => {
  await login(page, true);
  const before = await data(page);
  expect(before.seatOrder).toHaveLength(2);
  await nav(page, /^历史/); await page.getByRole("button", { name: "座位快照", exact: true }).click();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await expect.poll(async () => (await data(page)).seatOrder.slice(0, 3)).toEqual(["s2", "s1", "s3"]);
  expect((await data(page)).settings?.seatLayout ?? null).toBeNull();
  expect((await data(page)).lockedSeats).toEqual([1]);
  await nav(page, /^座位/); await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect.poll(async () => (await data(page)).seatOrder).toEqual(before.seatOrder);
  expect((await data(page)).settings?.seatLayout).toMatchObject(before.settings.seatLayout);
  expect((await data(page)).lockedSeats).toEqual(before.lockedSeats);
});

test("per-student draft settings survive material edits and reload and bulk save requires confirmation", async ({ page }) => {
  await login(page); await nav(page, /^评语工作台/);
  await workbench(page).getByRole("button", { name: /生成设置/ }).click();
  await workbench(page).getByRole("button", { name: "自定义评语字数" }).click();
  const wordCount = workbench(page).getByRole("spinbutton", { name: "自定义字数" });
  await wordCount.fill("");
  await wordCount.pressSequentially("230");
  await expect(wordCount).toHaveValue("230");
  await editor(page).fill("张三待确认草稿");
  await workbench(page).getByRole("button", { name: "学习认真", exact: true }).click();
  await select(page, "李四"); await editor(page).fill("李四待确认草稿");
  await select(page, "张三");
  await expect(editor(page)).toHaveValue("张三待确认草稿");
  await expect(workbench(page).getByRole("spinbutton", { name: "自定义字数" })).toHaveValue("230");
  expect((await data(page)).students[0].aiComments.profile.generatedComment).toBe("已经保存的原评语");
  await page.reload(); await nav(page, /^评语工作台/);
  expect((await data(page)).students[0].aiComments.profile.criteriaValues.study_attitude).toContain("serious");
  await expect(editor(page)).toHaveValue("张三待确认草稿");
  await workbench(page).getByRole("button", { name: /生成设置/ }).click();
  await expect(workbench(page).getByRole("spinbutton", { name: "自定义字数" })).toHaveValue("230");
  await workbench(page).getByRole("button", { name: /保存待确认评语 2/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "取消", exact: true }).click();
  expect((await data(page)).students[0].aiComments.profile.generatedComment).toBe("已经保存的原评语");
  await page.screenshot({ path: `/tmp/workbench-audit-${edition}.png` });
  await workbench(page).getByRole("button", { name: /保存待确认评语 2/ }).click();
  await page.getByRole("button", { name: "确认保存评语", exact: true }).click();
  await expect.poll(async () => (await data(page)).students[0].aiComments.profile.generatedComment).toBe("张三待确认草稿");
  expect((await data(page)).students[1].aiComments.profile.generatedComment).toBe("李四待确认草稿");
  await expect(workbench(page).getByRole("button", { name: /保存待确认评语/ })).toBeDisabled();
  await workbench(page).getByRole("button", { name: "返回上一页面", exact: true }).click();
  await nav(page, /^座位/);
  await page.getByRole("button", { name: "解锁 王五 的座位", exact: true }).click();
  await page.reload();
  expect((await data(page)).students[0].aiComments.profile.generatedComment).toBe("张三待确认草稿");
  expect((await data(page)).students[1].aiComments.profile.generatedComment).toBe("李四待确认草稿");
});

test("late single-generation results cannot overwrite the next student or saved records", async ({ page }) => {
  let requested = false; let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/generate-comment", async route => { requested = true; await gate; await route.fulfill({ json: { comment: "张三迟到的生成结果" } }).catch(() => {}); });
  await login(page); await nav(page, /^评语工作台/);
  await workbench(page).getByRole("button", { name: "重新生成", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await select(page, "李四"); await editor(page).fill("李四手动输入");
  release();
  await expect(editor(page)).toHaveValue("李四手动输入");
  await select(page, "张三");
  await expect(editor(page)).toHaveValue("已经保存的原评语");
  expect((await data(page)).students[0].aiComments.profile.generatedComment).toBe("已经保存的原评语");
});

test("batch candidates preserve edits made during generation and stop when leaving the workbench", async ({ page }) => {
  let requested = false; let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route("**/generate-comment", async route => { calls += 1; requested = true; await gate; await route.fulfill({ json: { comment: "批量生成候选" } }).catch(() => {}); });
  await login(page); await nav(page, /^评语工作台/);
  await workbench(page).getByRole("button", { name: "批量", exact: true }).click();
  await workbench(page).getByRole("button", { name: "批量生成", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await select(page, "李四"); await editor(page).fill("生成期间手动修订");
  await workbench(page).getByRole("button", { name: "暂停", exact: true }).click();
  release();
  await expect(workbench(page).getByRole("status")).toContainText("已暂停");
  await expect(editor(page)).toHaveValue("生成期间手动修订");
  expect((await data(page)).students[1].aiComments?.profile?.generatedComment || "").toBe("");
  requested = false;
  const secondGate = new Promise<void>(resolve => { release = resolve; });
  await page.unroute("**/generate-comment");
  await page.route("**/generate-comment", async route => { calls += 1; requested = true; await secondGate; await route.fulfill({ json: { comment: "离开后返回的结果" } }).catch(() => {}); });
  await workbench(page).getByRole("button", { name: "继续生成", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await workbench(page).getByRole("button", { name: "返回上一页面", exact: true }).click();
  await expect(workbench(page)).not.toBeVisible();
  release();
  await nav(page, /^评语工作台/); await select(page, "王五");
  await expect(editor(page)).toHaveValue("");
  expect(calls).toBe(2);
  expect((await data(page)).students[2].aiComments?.profile?.generatedComment || "").toBe("");
});

test("student drawer keeps generated text as a draft and cancels requests when closed", async ({ page }) => {
  let calls = 0; let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/generate-comment", async route => { calls += 1; const current = calls; if (current > 1) await gate; await route.fulfill({ json: { comment: current === 1 ? "抽屉待确认评语" : "关闭后过期结果" } }).catch(() => {}); });
  await login(page); await nav(page, /^座位/);
  await page.locator('[data-student-id="s1"]').click();
  await page.getByRole("button", { name: "AI评语", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "AI 期末评语 · 张三" });
  const text = drawer.getByPlaceholder("生成后可在这里继续编辑评语草稿。");
  await drawer.getByRole("button", { name: "重新生成", exact: true }).click();
  await expect(text).toHaveValue("抽屉待确认评语");
  expect((await data(page)).students[0].aiComments.profile.generatedComment).toBe("已经保存的原评语");
  await drawer.getByRole("button", { name: "重新生成", exact: true }).click();
  await expect.poll(() => calls).toBe(2);
  await drawer.getByRole("button", { name: "关闭工具面板", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  release();
  await page.getByRole("button", { name: "AI评语", exact: true }).click();
  await expect(text).toHaveValue("抽屉待确认评语");
  await drawer.getByRole("button", { name: "保存评语草稿", exact: true }).click();
  await expect.poll(async () => (await data(page)).students[0].aiComments.profile.generatedComment).toBe("抽屉待确认评语");
  await page.reload();
  expect((await data(page)).students[0].aiComments.profile.generatedComment).toBe("抽屉待确认评语");
});
