import { expect, test } from "@playwright/test";

const SUCCESS = {
  token: "e2e-commercial-token",
  expiresAt: Date.now() + 60_000,
  licenseId: "e2e-license",
  maxDevices: 3,
  aiEnabled: true,
};

test("commercial login uses the real product-login UI with a test-only mocked response", async ({ page }) => {
  await page.route("**/license/auth", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SUCCESS) }));
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "班级座位管理器" })).toBeVisible();
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-CODE");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByRole("button", { name: /新增学生/ })).toBeVisible();
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
