import { expect, test, type Page } from "@playwright/test";

const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
async function login(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    if (localStorage.getItem("seat-manager-workspaces-v1")) return;
    const createdAt = "2026-09-22T00:00:00Z";
    const data = { students: ["张三", "李四", "王五"].map((name, index) => ({ id: `s${index + 1}`, name, gender: "男", dormitoryId: index < 2 ? "d1" : "d2", manualTags: [], autoTags: [], records: [], exams: [] })), seatOrder: ["s1", "s2", "s3"], dormitories: [{ id: "d1", name: "101室", memberIds: ["s1", "s2"], baseScore: 100, events: [], history: [] }, { id: "d2", name: "102室", memberIds: ["s3"], baseScore: 100, events: [], history: [] }] };
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify({ version: 1, currentSliceId: "duties-slice", slices: [{ id: "duties-slice", classId: "duties-class", className: "职务测试班", term: { id: "duties-term", year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data }] }));
  });
  await page.route("**/license/auth", route => route.fulfill({ json: { token: "e2e-duties", expiresAt: Date.now() + 600000, licenseId: "e2e-duties", edition } }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-DUTIES");
  await page.getByRole("button", { name: /^进入/ }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
}
async function duties(page: Page) {
  return page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    return book.slices?.find((slice: { id: string }) => slice.id === book.currentSliceId)?.data.settings?.classDuties;
  });
}
async function openDuties(page: Page) {
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^座位/ }).click();
  await page.getByRole("button", { name: "班级职务", exact: true }).click();
  return page.getByRole("complementary", { name: "班级职务" });
}
async function choose(page: Page, label: string, name: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.getByRole("listbox", { name: label }).getByRole("option", { name, exact: true }).click();
}

test("custom roles support shared holders, persistent drafts, rename and confirmed deletion", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page);
  const drawer = await openDuties(page);
  await drawer.getByRole("textbox", { name: "新增职务名称" }).fill("图书管理员");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "班级职务", exact: true }).click();
  await expect(drawer.getByRole("textbox", { name: "新增职务名称" })).toHaveValue("图书管理员");
  await drawer.getByRole("button", { name: "添加", exact: true }).click();
  await choose(page, "添加图书管理员人选", "张三");
  await choose(page, "添加图书管理员人选", "李四");
  await drawer.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(async () => { const value = await duties(page); const role = value?.roles.find((item: { name: string }) => item.name === "图书管理员"); return role && value.assignments[role.id]; }).toEqual(["s1", "s2"]);
  await drawer.getByRole("button", { name: "编辑图书管理员", exact: true }).click();
  await drawer.getByRole("textbox", { name: "职务名称", exact: true }).fill("图书与阅读委员");
  await drawer.getByRole("button", { name: "保存", exact: true }).click();
  await page.reload();
  await openDuties(page);
  const row = drawer.locator("section").filter({ has: page.getByRole("heading", { name: "图书与阅读委员", exact: true }) });
  await expect(row).toContainText("张三、李四");
  await drawer.getByRole("textbox", { name: "新增职务名称" }).fill("班长");
  await drawer.getByRole("button", { name: "添加", exact: true }).click();
  await expect(drawer.getByRole("alert")).toHaveText("已有同名职务");
  await drawer.getByRole("button", { name: "编辑图书与阅读委员" }).click();
  await drawer.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "删除职务", exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`student roles, group and dorm leaders stay consistent (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await login(page);
    const drawer = await openDuties(page);
    await drawer.getByRole("tab", { name: "小组长", exact: true }).click();
    const groupPicker = drawer.getByRole("button", { name: /组长$/ }).first();
    const groupLabel = await groupPicker.getAttribute("aria-label");
    await groupPicker.click();
    await expect(page.getByRole("listbox", { name: groupLabel! }).getByRole("option", { name: "王五" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(drawer).toBeVisible();
    await expect(groupPicker).toBeFocused();
    await choose(page, groupLabel!, "张三");
    await expect.poll(async () => Object.values((await duties(page))?.groupLeaders || {})).toContain("s1");
    await page.screenshot({ path: `../output/class-duties-${edition}-groups-${reducedMotion}.png` });
    await drawer.getByRole("button", { name: "关闭工具面板", exact: true }).click();
    await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^宿舍/ }).click();
    await choose(page, "宿舍长", "张三");
    await expect.poll(async () => (await duties(page))?.dormitoryLeaders.d1).toBe("s1");
    await page.screenshot({ path: `../output/class-duties-${edition}-dorm-${reducedMotion}.png` });
    await page.getByRole("button", { name: /张三.*宿舍长/ }).click();
    const modal = page.getByRole("dialog", { name: "张三学生详情" });
    await modal.getByRole("tab", { name: "档案", exact: true }).click();
    const section = modal.getByRole("region", { name: "学生职务" });
    await expect(section).toContainText("101室宿舍长");
    await section.getByRole("button", { name: "调整职务" }).click();
    await section.getByRole("checkbox", { name: "班长", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(section.getByRole("checkbox", { name: "班长", exact: true })).toBeChecked();
    await section.getByText("语文课代表", { exact: true }).click();
    await expect(section.getByRole("checkbox", { name: "语文课代表", exact: true })).toBeChecked();
    await section.getByText("数学课代表", { exact: true }).click();
    await expect(section.getByRole("checkbox", { name: "数学课代表", exact: true })).toBeChecked();
    await section.getByRole("button", { name: "保存职务" }).click();
    await expect.poll(async () => (await duties(page))?.assignments["class-duty-0"]).toEqual(["s1"]);
    await expect(section).toContainText("数学课代表");
    await expect(section.getByRole("button", { name: "调整职务" })).toBeFocused();
    await section.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `../output/class-duties-${edition}-student-${reducedMotion}.png` });
    await page.keyboard.press("Escape");
    await page.getByTitle("删除宿舍", { exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "确认删除宿舍", exact: true }).click();
    await expect.poll(async () => (await duties(page))?.dormitoryLeaders.d1).toBeUndefined();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect.poll(async () => (await duties(page))?.dormitoryLeaders.d1).toBe("s1");
    await page.getByRole("button", { name: /101室.*人/ }).click();
    await page.getByRole("button", { name: "将 张三 移出宿舍" }).click();
    await expect.poll(async () => (await duties(page))?.dormitoryLeaders.d1).toBeUndefined();
    await page.reload();
    await expect.poll(async () => (await duties(page))?.assignments["subject-duty-语文"]).toEqual(["s1"]);
    await expect.poll(async () => (await duties(page))?.dormitoryLeaders.d1).toBeUndefined();
  });
}
