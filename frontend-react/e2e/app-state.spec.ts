import { expect, test } from "@playwright/test";

test("first login and student edits survive a reload", async ({ page }) => {
  await page.goto("./");
  await page.getByPlaceholder("请设置密码").fill("codex-test-password");
  await page.getByPlaceholder("再次输入密码").fill("codex-test-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("button", { name: /新增学生/ })).toBeVisible();

  await page.getByRole("button", { name: /新增学生/ }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("测试学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await expect(page.getByRole("button", { name: /测试学生/ }).last()).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: /测试学生/ }).last()).toBeVisible();
  const storedBook = await page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "null"));
  expect(storedBook.slices[0].data.students.some((student: { name: string }) => student.name === "测试学生")).toBe(true);
});
