import { expect, test } from "@playwright/test";

test("publishes a scoped installable manifest", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "小张专用座位管理器" })).toBeVisible();

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe("/seat-manager/manifest.webmanifest");
  const manifest = await page.evaluate(async href => fetch(href).then(response => response.json()), manifestHref!);
  expect(manifest.start_url).toBe("/seat-manager/");
  expect(manifest.scope).toBe("/seat-manager/");
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: "192x192" }),
    expect.objectContaining({ sizes: "512x512", purpose: "maskable" }),
  ]));
});

test("serves the core login screen after the network goes offline", async ({ context, page }) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await context.setOffline(true);
  const cachedShell = await page.evaluate(async () => fetch(window.location.href).then(response => response.text()));
  expect(cachedShell).toContain('<div id="root"></div>');
  await page.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "小张专用座位管理器" })).toBeVisible();
});
