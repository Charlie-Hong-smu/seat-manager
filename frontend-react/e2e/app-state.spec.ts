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
  await expect(dialog).toHaveAttribute("data-transition-state", "open");
  await expect(page.getByPlaceholder("AI 授权码")).toHaveCount(0);
  const shellStyle = await dialog.evaluate((element) => ({
    animationName: getComputedStyle(element).animationName,
    animationDuration: getComputedStyle(element).animationDuration,
    opacity: getComputedStyle(element).opacity,
  }));
  expect(shellStyle).toEqual({ animationName: "comment-workbench-panel-enter", animationDuration: "0.44s", opacity: "1" });
  const contentStyle = await dialog.locator(":scope > .comment-workbench-enter-item").first().evaluate((element) => ({
    animationName: getComputedStyle(element).animationName,
    opacity: getComputedStyle(element).opacity,
  }));
  expect(contentStyle).toEqual({ animationName: "none", opacity: "1" });
  await dialog.getByRole("button", { name: "关闭评语工作台" }).click();
  await expect(dialog).toHaveAttribute("data-transition-state", "closing");
  await expect(dialog).toBeHidden();
});

test("dormitory periods, custom settings and event dates work together", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /^宿舍/ }).click();

  await expect(page.getByRole("group", { name: "宿舍统计周期" })).toBeVisible();
  await expect(page.getByRole("button", { name: "宿舍统计日期" })).toBeVisible();
  await expect(page.getByRole("button", { name: "批量结算" })).toHaveCount(0);
  await expect(page.getByText("当前结算分")).toHaveCount(0);

  const dormName = page.getByPlaceholder("新宿舍名称");
  await dormName.fill("E2E 301");
  await dormName.locator("..").getByRole("button").click();
  await page.getByRole("button", { name: /卫生优秀/ }).click();
  await expect(page.getByRole("button", { name: "宿舍事件发生日期" })).toBeVisible();
  await page.getByRole("button", { name: "保存事件" }).click();
  const savedToast = page.getByRole("status").filter({ hasText: "宿舍事件已保存" });
  await expect(savedToast).toBeVisible();
  await expect(page.getByRole("button", { name: "保存事件" })).toBeHidden();
  await expect(page.getByRole("button", { name: /卫生优秀/ }).first()).toHaveAttribute("aria-pressed", "false");
  await savedToast.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByText("所选周期暂无事件")).toBeVisible();
  await page.getByRole("button", { name: /卫生优秀/ }).first().click();
  await page.getByRole("button", { name: "保存事件" }).click();
  await expect(page.getByText("卫生优秀", { exact: true }).last()).toBeVisible();
  const secondSavedToast = page.getByRole("status").filter({ hasText: "宿舍事件已保存" });
  await secondSavedToast.getByRole("button", { name: "关闭提示" }).click();
  await expect(secondSavedToast).toHaveAttribute("data-phase", "closing");
  await expect(secondSavedToast).toBeHidden();

  await page.getByRole("button", { name: "设置自定义周期" }).click();
  await page.getByText("每 N 个单位").locator("..").getByRole("spinbutton").fill("3");
  await page.getByRole("button", { name: "保存周期" }).click();
  await expect(page.getByRole("group", { name: "宿舍统计周期" }).getByRole("button", { name: "自定义周期" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "null");
    return book?.slices?.find((slice: { id: string }) => slice.id === book.currentSliceId)?.data?.settings?.dormitoryPeriod?.intervalCount;
  })).toBe(3);
});

test("creates a class-level followup without a student and supports undo", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /^跟进任务/ }).click();

  await expect(page.getByText("不指定学生")).toBeVisible();
  await page.getByPlaceholder("跟进事项，例如：确认处罚执行情况").fill("准备下周班会材料");
  await page.getByRole("button", { name: /创建\s+任务/ }).click();

  await expect(page.getByText("准备下周班会材料", { exact: true })).toBeVisible();
  await expect(page.getByText(/班级事项 · 截止/)).toBeVisible();
  const toast = page.getByRole("status").filter({ hasText: "跟进任务已创建" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByText("准备下周班会材料", { exact: true })).toHaveCount(0);
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
