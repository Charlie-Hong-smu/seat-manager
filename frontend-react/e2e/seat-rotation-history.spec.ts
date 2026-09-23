import { expect, test } from "@playwright/test";

test("adopted rotation creates a saved snapshot and undo removes it", async ({ page }) => {
  await page.route("**/license/auth", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "e2e-rotation", expiresAt: Date.now() + 600_000, licenseId: "e2e-rotation", edition: process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang" }) }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-ROTATION");
  await page.getByRole("button", { name: /^进入/ }).click();
  await page.getByRole("button", { name: "座位", exact: true }).click();
  await page.getByRole("button", { name: "新增学生", exact: true }).click();
  for (const name of ["轮换甲", "轮换乙", "轮换丙", "轮换丁", "轮换戊", "轮换己"]) {
    await page.getByRole("textbox", { name: "姓名", exact: true }).fill(name);
    await page.getByRole("button", { name: "添加到班级", exact: true }).click();
  }
  await page.getByRole("button", { name: "关闭工具面板", exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    const slice = book.slices?.find((item: { id: string }) => item.id === book.activeSliceId) || book.slices?.[0];
    return slice?.data.seatOrder?.filter(Boolean).length || 0;
  })).toBe(6);
  const savedSeatOrder = await page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    const slice = book.slices?.find((item: { id: string }) => item.id === book.activeSliceId) || book.slices?.[0];
    return slice?.data.seatOrder;
  });
  await page.getByRole("button", { name: "排座" }).click();
  await expect(page.locator("#seat-rules-intro")).toBeFocused();
  await expect(page.getByLabel("轮换时尽量避开最近的座位和同桌")).toBeChecked();
  await page.getByRole("button", { name: "生成方案", exact: true }).click();
  const preview = page.locator("[data-seat-preview-layer]");
  await expect(preview.getByText("近期轮换")).toBeVisible();
  await expect(preview.locator('[tabindex="-1"]').first()).toBeFocused();
  await expect(page.getByRole("dialog", { name: "随机排座预览" })).toHaveCount(0);
  await preview.getByRole("button", { name: "返回规则" }).click();
  await expect(page.getByRole("button", { name: "生成方案", exact: true })).toBeFocused();
  await expect(page.getByLabel("轮换时尽量避开最近的座位和同桌")).toBeVisible();
  await page.getByRole("button", { name: "生成方案", exact: true }).click();
  await preview.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("button", { name: "排座" })).toBeVisible();
  expect(await page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    const slice = book.slices?.find((item: { id: string }) => item.id === book.activeSliceId) || book.slices?.[0];
    return slice?.data.seatOrder;
  })).toEqual(savedSeatOrder);
  await page.getByRole("button", { name: "排座" }).click();
  await page.getByRole("button", { name: "生成方案", exact: true }).click();
  await preview.getByRole("button", { name: "采用方案" }).click();
  await expect(page.locator("#seat-shuffle-trigger")).toBeFocused();
  await expect.poll(() => page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    const slice = book.slices?.find((item: { id: string }) => item.id === book.activeSliceId) || book.slices?.[0];
    return slice?.data.seatHistory?.filter((item: { source?: string }) => item.source === "rotation").length || 0;
  })).toBe(1);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    const slice = book.slices?.find((item: { id: string }) => item.id === book.activeSliceId) || book.slices?.[0];
    return slice?.data.seatHistory?.filter((item: { source?: string }) => item.source === "rotation").length || 0;
  })).toBe(0);
});
