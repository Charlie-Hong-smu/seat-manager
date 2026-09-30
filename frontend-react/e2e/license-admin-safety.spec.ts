import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("admin edits customer name while cloud space remains readonly and new spaces are server assigned", async ({ page }) => {
  const origin = "http://127.0.0.1:4198";
  let license = { licenseKey: "seat-manager:license:test-only", licenseId: "legacy-space", displayName: "合成客户", acquisitionChannel: "wechat", acquisitionDetail: "", status: "active", allowedEditions: ["zhang"], maxDevices: 3, deviceCount: 0, devices: [], aiEnabled: false, aiDailyLimit: 30, expiresAt: "", aiExpiresAt: "", createdAt: "", updatedAt: "" };
  const writes: Array<Record<string, unknown>> = [];
  await page.addInitScript(url => {
    localStorage.setItem("seat-manager-license-admin-worker", url);
    localStorage.setItem("seat-manager-license-admin-token", "test-only-admin");
  }, origin);
  // Serve only local static files and test-only API responses. Every other request is blocked.
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/admin/licenses/list") return route.fulfill({ json: { licenses: [license], partial: false } });
    if (url.pathname === "/admin/licenses/upsert") {
      const body = route.request().postDataJSON();
      writes.push(body);
      license = { ...license, displayName: body.displayName };
      return route.fulfill({ json: { license } });
    }
    const filename = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!["index.html", "app.js", "admin-model.js", "styles.css"].includes(filename)) return route.abort();
    return route.fulfill({ body: await readFile(new URL(`../../license-admin/${filename}`, import.meta.url)), contentType: filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".css") ? "text/css" : "text/html" });
  });
  await page.goto(origin);
  await page.getByRole("button", { name: "刷新数据", exact: true }).click();
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.locator("#licenseId")).toHaveValue("legacy-space");
  await expect(page.locator("#licenseId")).toHaveAttribute("readonly", "");
  await expect(page.locator("#displayName")).toBeFocused();
  await page.locator("#displayName").fill("合成客户改名");
  await page.getByRole("button", { name: "保存授权", exact: true }).click();
  await expect(page.locator("#pageStatus")).toHaveText("授权已保存");
  expect(writes[0].licenseId).toBe("legacy-space");
  expect(writes[0].displayName).toBe("合成客户改名");
  await page.getByRole("button", { name: "新建授权", exact: true }).click();
  await page.locator("#displayName").fill("第二位合成客户");
  await page.locator("#productCode").fill("TEST-ONLY-NEW-CODE");
  await page.locator("#acquisitionChannel").selectOption("wechat");
  await expect(page.locator("#editorOverlay")).toHaveCSS("opacity", "1");
  await page.locator(".drawer").evaluate(element => { element.scrollTop = 0; });
  await expect(page.locator("#licenseId")).toBeInViewport();
  await page.screenshot({ path: "/tmp/seat-manager-admin-editor.png" });
  await page.getByRole("button", { name: "保存授权", exact: true }).click();
  await expect(page.locator("#pageStatus")).toHaveText("授权已保存");
  expect(writes[1]).not.toHaveProperty("licenseId");
  expect(writes[1].displayName).toBe("第二位合成客户");
  await page.getByRole("button", { name: "新建授权", exact: true }).click();
  await expect(page.locator("#editorOverlay")).toHaveClass(/open/);
  await page.keyboard.press("Escape");
  await expect(page.locator("#editorOverlay")).toBeHidden();
  await expect(page.getByRole("button", { name: "新建授权", exact: true })).toBeFocused();
});
