import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

async function login(page: import("@playwright/test").Page) {
  await page.route("**/license/auth", async route => {
    const body = route.request().postDataJSON() as { edition?: string };
    expect(body.edition).toBe("zhang");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "e2e-zhang-token", expiresAt: Date.now() + 60_000, licenseId: "e2e-zhang", edition: "zhang" }),
    });
  });
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ZHANG-CODE");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByRole("button", { name: /新增学生/ })).toBeVisible();
}

test("license login and student edits survive a reload", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: /新增学生/ }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("测试学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await expect(page.getByRole("button", { name: /测试学生/ }).last()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /测试学生/ }).last()).toBeVisible();
  const storedBook = await page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "null"));
  expect(storedBook.slices[0].data.students.some((student: { name: string }) => student.name === "测试学生")).toBe(true);
});

test("preloads the comment workbench and keeps its full-screen background stable", async ({ page }) => {
  await login(page);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("CommentWorkbench-")))).toBe(true);

  await page.getByRole("button", { name: "评语工作台" }).click();
  const dialog = page.getByRole("dialog", { name: "评语工作台" });
  await expect(dialog).toBeVisible();
  await expect(page.getByPlaceholder("AI 授权码")).toHaveCount(0);
  const shellStyle = await dialog.evaluate((element) => ({
    animationName: getComputedStyle(element).animationName,
    opacity: getComputedStyle(element).opacity,
  }));
  expect(shellStyle).toEqual({ animationName: "none", opacity: "1" });
  const contentDuration = await dialog.locator(":scope > .comment-workbench-enter-item").first().evaluate((element) => getComputedStyle(element).animationDuration);
  expect(contentDuration).toBe("0.16s");
});

test("roster, exam, cloud sync and workspace switching keep data isolated", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page);

  await page.getByRole("button", { name: /名单 \/ 备份/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "roster.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("姓名,性别\n甲同学,男\n乙同学,女"),
  });
  await expect(page.getByText(/已读取 2 行名单/)).toBeVisible();
  await page.getByRole("button", { name: "导入名单" }).click();
  await expect(page.getByText(/导入成功：2 名学生/)).toBeVisible();

  await page.getByRole("button", { name: /^成绩/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "scores.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("姓名,语文,数学\n甲同学,90,95\n乙同学,88,92"),
  });
  await page.getByPlaceholder("考试名称").fill("E2E 期中测试");
  await page.getByRole("button", { name: "保存考试" }).click();
  await expect(page.getByText("E2E 期中测试", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "云同步" }).click();
  const syncHeading = page.getByRole("heading", { name: "云端备份与恢复" });
  await expect(syncHeading).toBeVisible();
  await syncHeading.locator("../..").getByRole("button").click();

  const workspaceButton = page.locator("header button").filter({ hasText: "·" }).first();
  const originalWorkspace = (await workspaceButton.innerText()).split("·")[0].trim();
  await workspaceButton.click();
  await page.getByRole("button", { name: "新建班级" }).click();
  await page.getByRole("button", { name: "高中" }).click();
  await page.getByRole("button", { name: "一", exact: true }).click();
  await page.getByPlaceholder("例如：高二(1)班").fill("E2E 新班级");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(workspaceButton).toContainText("E2E 新班级");
  await expect(page.getByText("暂无考试数据")).toBeVisible();
  await expect(page.getByText("E2E 期中测试", { exact: true })).toHaveCount(0);

  await workspaceButton.click();
  await page.getByRole("button", { name: new RegExp(originalWorkspace) }).last().click();
  await page.getByRole("button", { name: /^成绩/ }).click();
  await expect(page.getByText("E2E 期中测试", { exact: true }).first()).toBeVisible();
});
