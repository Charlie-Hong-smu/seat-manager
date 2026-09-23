import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 8, 22, 12);
const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
const rememberLabel = "在此浏览器保持登录 90 天";

async function mockLogin(context: BrowserContext, remembered: boolean) {
  await context.route("**/license/auth", async route => {
    expect(route.request().postDataJSON()).toMatchObject({ edition, rememberDays: remembered ? 90 : 0 });
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ token: "e2e-remembered-login", expiresAt: START + (remembered ? 90 * DAY : DAY / 2) }),
    });
  });
}

async function login(page: Page, url: string, remembered: boolean) {
  await page.clock.setFixedTime(START);
  await page.goto(url);
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-REMEMBER-CODE");
  if (remembered) await page.getByText(rememberLabel, { exact: true }).click();
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page.getByText("今日班务", { exact: true })).toBeVisible();
}

test("remembered login survives a real browser restart and day 30, then expires at day 90", async ({ baseURL }, testInfo) => {
  const profile = await mkdtemp(join(tmpdir(), "seat-manager-auth-e2e-"));
  let context: BrowserContext | undefined;
  try {
    context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1310, height: 690 } });
    await mockLogin(context, true);
    const first = await context.newPage();
    await first.goto(baseURL!);
    await expect(first.getByRole("checkbox", { name: rememberLabel })).toBeVisible();
    await first.screenshot({ path: testInfo.outputPath("login-90-days.png"), animations: "disabled" });
    await login(first, baseURL!, true);
    await first.reload();
    await expect(first.getByText("今日班务", { exact: true })).toBeVisible();
    await context.close();
    context = undefined;

    context = await chromium.launchPersistentContext(profile, { headless: true });
    let authRequests = 0;
    await context.route("**/license/auth", route => { authRequests += 1; return route.abort(); });
    const reopened = await context.newPage();
    await reopened.clock.setFixedTime(START + 89 * DAY);
    await reopened.goto(baseURL!);
    await expect(reopened.getByText("今日班务", { exact: true })).toBeVisible();
    expect(authRequests).toBe(0);
    await reopened.clock.setFixedTime(START + 90 * DAY);
    await reopened.reload();
    await expect(reopened.getByRole("button", { name: "进入工作台", exact: true })).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("unchecked login survives refresh but ends with the tab session", async ({ context, page, baseURL }) => {
  await mockLogin(context, false);
  await login(page, baseURL!, false);
  await page.reload();
  await expect(page.getByText("今日班务", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("seat-manager-product-auth-token"))).toBeNull();
  await page.close();
  const next = await context.newPage();
  await next.clock.setFixedTime(START);
  await next.goto(baseURL!);
  await expect(next.getByRole("button", { name: "进入工作台", exact: true })).toBeVisible();
});

test("explicit logout cancels remembered login without removing the workspace", async ({ context, page, baseURL }) => {
  await mockLogin(context, true);
  await login(page, baseURL!, true);
  await page.getByRole("button", { name: "账户", exact: true }).click();
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page.getByRole("button", { name: "进入工作台", exact: true })).toBeVisible();
  const afterLogout = await page.evaluate(() => ({
    token: localStorage.getItem("seat-manager-product-auth-token"),
    book: localStorage.getItem("seat-manager-workspaces-v1"),
  }));
  expect(afterLogout.token).toBeNull();
  expect(afterLogout.book).not.toBeNull();
  await page.reload();
  await expect(page.getByRole("button", { name: "进入工作台", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"))).toBe(afterLogout.book);
});
