import { expect, test } from "@playwright/test";

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`seat mode preserves geometry and data (${reducedMotion})`, async ({ page }) => {
    await page.setViewportSize({ width: 1310, height: 690 });
    await page.emulateMedia({ reducedMotion });
    const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
    await page.route("**/license/auth", route => route.fulfill({ json: { token: "seat-mode-test", expiresAt: Date.now() + 600_000, licenseId: "seat-mode-test", edition } }));
    await page.goto("./");
    await page.getByPlaceholder("请输入授权码").fill("TEST-SEAT-MODE");
    await page.getByRole("button", { name: "进入工作台", exact: true }).click();
    await page.getByRole("button", { name: "座位", exact: true }).click();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "新增学生", exact: true }).click();
    await page.getByPlaceholder("姓名", { exact: true }).fill("过渡测试学生");
    await page.getByRole("button", { name: "添加到班级", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "编辑布局", exact: true }).click();
    await page.getByRole("button", { name: "批量框选", exact: true }).click();
    await page.locator('[data-seat-layout-slot="7:7"] .seat-layout-slot__face').click();
    for (const cell of ["8:2", "8:3"]) await page.locator(`[data-seat-layout-slot="${cell}"] .seat-layout-slot__face`).click();
    await page.getByRole("button", { name: "在第 8 列后新增一列", exact: true }).click();
    await page.getByRole("button", { name: "在第 9 行后新增一行", exact: true }).click();
    await page.getByRole("button", { name: "应用布局", exact: true }).click();
    await expect(page.locator("[data-seat-layout-node]")).toHaveCount(66);
    await expect(page.getByRole("button", { name: "已保存", exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion });
    const before = await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"));
    const toolbar = page.locator(".seat-mode-toolbar");
    const initialToolbar = await toolbar.boundingBox();
    // Pause at the first rendered frame: destination must start exactly at the
    // source rectangle and move monotonically to its final rectangle.
    for (const mode of ["简洁", "详细"]) {
      await page.getByRole("button", { name: mode, exact: true }).click();
      await page.waitForTimeout(550);
      const source = await page.locator("[data-seat-layout-node]").first().boundingBox();
      await page.evaluate(() => {
        document.getElementById("seat-layout-editor-trigger")!.click();
        requestAnimationFrame(() => document.getAnimations().forEach(animation => {
          if (animation.effect instanceof KeyframeEffect && animation.effect.target?.closest("[data-seat-mode-transition]")) {
            animation.pause(); animation.currentTime = 0;
          }
        }));
      });
      const destination = page.locator("[data-seat-designer-layer] [data-seat-grid-seat]").first();
      await expect(destination).toBeVisible();
      let endpoint: { x: number; y: number; width: number } | undefined;
      if (reducedMotion === "no-preference") {
        const first = await destination.boundingBox();
        expect(Math.abs(first!.x - source!.x)).toBeLessThan(1);
        expect(Math.abs(first!.y - source!.y)).toBeLessThan(1);
        expect(Math.abs(first!.width - source!.width)).toBeLessThan(1);
        const samples = [];
        for (const time of [110, 220, 330, 439]) {
          samples.push(await page.evaluate(time => {
            document.getAnimations().forEach(animation => {
              if (animation.playState === "paused") animation.currentTime = time;
            });
            const box = document.querySelector("[data-seat-designer-layer] [data-seat-grid-seat]")!.getBoundingClientRect();
            return { x: box.x, y: box.y, width: box.width };
          }, time));
        }
        for (let i = 1; i < samples.length; i++) expect(samples[i].width).toBeLessThanOrEqual(samples[i - 1].width + 0.1);
        endpoint = samples.at(-1);
        await page.screenshot({ path: `../output/seat-mode-${edition}-${mode}.png` });
        await page.evaluate(() => document.getAnimations().forEach(animation => { if (animation.playState === "paused") animation.finish(); }));
      } else {
        await expect(page.locator(".seat-mode-flight")).toHaveCount(0);
      }
      await expect(page.locator("[data-seat-mode-transition]")).toHaveCount(0);
      expect(await toolbar.boundingBox()).toEqual(initialToolbar);
      const settled = await destination.boundingBox();
      if (endpoint) {
        expect(Math.abs(settled!.x - endpoint.x)).toBeLessThan(0.1);
        expect(Math.abs(settled!.y - endpoint.y)).toBeLessThan(0.1);
        expect(Math.abs(settled!.width - endpoint.width)).toBeLessThan(0.1);
      }
      await page.waitForTimeout(500);
      expect(await destination.boundingBox()).toEqual(settled);
      expect(await destination.locator(".seat-layout-slot__face").evaluate(element => element.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
      await page.getByRole("button", { name: "取消", exact: true }).click();
      await expect(page.locator("[data-seat-layout-editor]")).toHaveCount(0);
      await expect(page.locator(".seat-mode-flight")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "编辑布局", exact: true })).toBeFocused();
      const returned = page.locator("[data-seat-board-layer] .seat-card-enter").first();
      expect(await returned.evaluate(element => element.getAnimations().filter(animation => animation.playState === "running").length)).toBe(0);
      expect(await returned.evaluate(element => getComputedStyle(element).opacity)).toBe("1");
      expect(await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"))).toBe(before);
    }
    await page.getByRole("button", { name: "编辑布局", exact: true }).click();
    await page.getByRole("button", { name: "应用布局", exact: true }).click();
    await expect(page.locator("[data-seat-layout-editor]")).toHaveCount(0);
    await expect(page.locator(".seat-mode-flight")).toHaveCount(0);
  });
}
