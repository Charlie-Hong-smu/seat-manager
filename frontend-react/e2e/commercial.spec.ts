import { expect, test } from "@playwright/test";

import { seedContextPreviewRecords } from "./contextPreviewFixture";

const SUCCESS = {
  token: "e2e-commercial-token",
  expiresAt: Date.now() + 60_000,
  licenseId: "e2e-license",
  maxDevices: 3,
  aiEnabled: true,
};

test("commercial login uses the real product-login UI with a test-only mocked response", async ({ page }) => {
  await page.route("**/license/auth", async route => {
    expect((route.request().postDataJSON() as { edition?: string }).edition).toBe("commercial");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SUCCESS) });
  });
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "班级座位管理器" })).toBeVisible();
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-CODE");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByText("今日班务", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "座位", exact: true }).click();
  await expect(page.getByRole("button", { name: /新增学生/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "AI 助手", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "打开 AI 助手", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "AI助手浮窗" })).toBeVisible();
  await expect(page.getByPlaceholder("输入 AI 授权码")).toHaveCount(0);
});

test("commercial login reports rejected and full-device licenses", async ({ page }) => {
  let status = 403;
  await page.route("**/license/auth", route => route.fulfill({ status, contentType: "application/json", body: JSON.stringify({ error: status === 409 ? "device_limit" : "forbidden" }) }));
  await page.goto("./");
  const input = page.getByPlaceholder("请输入授权码");
  await input.fill("REJECTED");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByText("授权码不正确，请检查后重试")).toBeVisible();
  status = 409;
  await input.fill("FULL-DEVICE");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByText("这个授权码绑定设备已满，请联系我处理")).toBeVisible();
});

test("commercial login reports an expired license without using a real license record", async ({ page }) => {
  await page.route("**/license/auth", route => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "license_expired" }) }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("EXPIRED-LICENSE");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByText("这个授权码已到期，请联系管理员续期")).toBeVisible();
});

test("commercial login explains an edition-scoped rejection", async ({ page }) => {
  await page.route("**/license/auth", route => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "edition_forbidden" }) }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("ZHANG-ONLY");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByText("这个授权码不适用于当前版本，请联系我处理")).toBeVisible();
});

test("commercial keeps comment context while previewing a student task", async ({ page }) => {
  await page.route("**/license/auth", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SUCCESS) }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-CONTEXT-PREVIEW");
  await page.getByRole("button", { name: "进入" }).click();
  await page.getByRole("button", { name: "座位", exact: true }).click();
  await page.getByRole("button", { name: /新增学生/ }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("商用速览学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await page.getByRole("button", { name: "关闭工具面板" }).last().click();
  await seedContextPreviewRecords(page, "商用速览学生");
  await page.reload();
  await page.getByRole("button", { name: "评语工作台" }).click();

  const workbench = page.getByRole("dialog", { name: "评语工作台" });
  await workbench.getByRole("button", { name: /商用速览学生/ }).first().click();
  await workbench.getByRole("button", { name: "查看 商用速览学生 的学生详情" }).click();
  await page.getByRole("tab", { name: "建议与沟通" }).click();
  const before = await page.getByRole("dialog").count();
  await page.getByRole("button", { name: "上下文任务甲事项速览", exact: true }).click();
  await expect(page.getByRole("region", { name: "上下文任务甲事项速览" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(before);
  await expect(workbench).toBeVisible();
});
