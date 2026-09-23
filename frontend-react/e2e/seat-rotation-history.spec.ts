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
  await page.locator("[data-seat-board-layer]").evaluate(element => { element.setAttribute("data-stable-board-check", "same"); });
  await page.getByRole("button", { name: "排座" }).click();
  await expect(page.locator("#seat-rules-intro")).toBeFocused();
  await expect(page.getByLabel("轮换时尽量避开最近的座位和同桌")).toBeChecked();
  const waitingBefore = await page.locator("[data-seat-board-layer] .seat-waiting-dock").boundingBox();
  await page.evaluate(() => {
    const originalAnimate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      const animation = originalAnimate.apply(this, args);
      if (this instanceof HTMLElement && (this.dataset.seatShuffleMorphing === "true" || this.classList.contains("seat-shuffle-morph-ghost"))) {
        const state = window as typeof window & { __seatShuffleAnimations?: Animation[] };
        (state.__seatShuffleAnimations ||= []).push(animation);
        animation.pause();
        animation.currentTime = 0;
      }
      return animation;
    };
  });
  await page.getByRole("button", { name: "生成方案", exact: true }).click();
  const changingCard = page.locator("[data-seat-shuffle-morphing]").first();
  await expect(changingCard).toBeVisible();
  await expect(page.locator(".seat-shuffle-morph-ghost").first()).toBeVisible();
  const opacity = await changingCard.evaluate(card => {
    const animation = (window as typeof window & { __seatShuffleAnimations?: Animation[] }).__seatShuffleAnimations?.find(item => (item.effect as KeyframeEffect)?.target === card);
    if (!animation) throw new Error("Missing seat face transition");
    const start = Number(getComputedStyle(card).opacity);
    const delay = Number((animation.effect as KeyframeEffect).getTiming().delay);
    animation.currentTime = delay + 195;
    const middle = Number(getComputedStyle(card).opacity);
    animation.currentTime = delay + 390;
    const end = Number(getComputedStyle(card).opacity);
    return { start, middle, end };
  });
  expect(opacity.start).toBeLessThan(0.01);
  expect(opacity.middle).toBeGreaterThan(0.1);
  expect(opacity.middle).toBeLessThan(1);
  expect(opacity.end).toBeCloseTo(1, 2);
  await page.evaluate(() => {
    (window as typeof window & { __seatShuffleAnimations?: Animation[] }).__seatShuffleAnimations?.forEach(animation => animation.finish());
  });
  const waitingAfter = await page.locator("[data-seat-board-layer] .seat-waiting-dock").boundingBox();
  expect(waitingAfter?.height).toBe(waitingBefore?.height);
  await expect(page.locator("[data-seat-board-layer] .seat-waiting-dock")).toBeVisible();
  const preview = page.locator("[data-seat-preview-layer]");
  await expect(page.locator("[data-seat-board-layer]")).toHaveAttribute("data-stable-board-check", "same");
  await expect(page.locator("#seat-preview-title")).toBeFocused();
  await expect(page.getByRole("dialog", { name: "随机排座预览" })).toHaveCount(0);
  await page.getByRole("button", { name: "评估详情" }).click();
  await expect(preview.getByText("近期轮换")).toBeVisible();
  await page.getByRole("button", { name: "返回规则" }).click();
  await expect(page.getByRole("button", { name: "生成方案", exact: true })).toBeFocused();
  await expect(page.getByLabel("轮换时尽量避开最近的座位和同桌")).toBeVisible();
  await page.getByRole("button", { name: "生成方案", exact: true }).click();
  await page.getByRole("button", { name: "返回座位" }).click();
  await expect(page.getByRole("button", { name: "排座" })).toBeVisible();
  expect(await page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    const slice = book.slices?.find((item: { id: string }) => item.id === book.activeSliceId) || book.slices?.[0];
    return slice?.data.seatOrder;
  })).toEqual(savedSeatOrder);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "排座" }).click();
  await page.getByRole("button", { name: "生成方案", exact: true }).click();
  await expect(page.locator(".seat-shuffle-morph-layer")).toHaveCount(0);
  await page.getByRole("button", { name: "返回座位" }).click();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "排座" }).click();
  await page.getByRole("button", { name: "生成方案", exact: true }).click();
  await page.getByRole("button", { name: "采用方案" }).click();
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

test("phone shuffle rules keep generate action above the persistent board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    const createdAt = "2026-09-22T00:00:00Z";
    const students = Array.from({ length: 60 }, (_, index) => ({ id: `s${index}`, name: `学生${index + 1}`, gender: index % 2 ? "女" : "男", manualTags: [], autoTags: [], records: [], exams: [] }));
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify({ version: 1, currentSliceId: "phone-shuffle", slices: [{ id: "phone-shuffle", classId: "phone-shuffle-class", className: "手机排座班", term: { id: "term", year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data: { students, seatOrder: [...students.map(student => student.id), null, null, null, null] } }] }));
  });
  await page.route("**/license/auth", route => route.fulfill({ json: { token: "phone-shuffle", expiresAt: Date.now() + 600_000, licenseId: "phone-shuffle", edition: process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang" } }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-PHONE-SHUFFLE");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await page.getByRole("button", { name: "展开侧栏" }).click();
  await page.getByRole("dialog", { name: "切换工作区" }).getByRole("button", { name: /^座位/ }).click();
  await expect(page.locator(".app-motion-switch[data-moving]")).toHaveCount(0);
  await page.getByRole("button", { name: "排座", exact: true }).click();
  await page.getByRole("button", { name: "生成方案", exact: true }).click();
  await expect(page.locator(".seat-workflow-panel")).toHaveAttribute("data-seat-flow", "preview");
  await expect(page.locator("[data-seat-board-layer] .seat-waiting-dock")).toBeVisible();
  const metrics = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll("button")).find(item => item.textContent?.trim() === "采用方案");
    const rect = button?.getBoundingClientRect();
    return { scrollWidth: document.documentElement.scrollWidth, buttonLeft: rect?.left, buttonRight: rect?.right };
  });
  expect(metrics.scrollWidth).toBe(390);
  expect(metrics.buttonLeft).toBeGreaterThanOrEqual(0);
  expect(metrics.buttonRight).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "返回座位" }).click();
  await expect(page.getByRole("button", { name: "排座", exact: true })).toBeVisible();
});
