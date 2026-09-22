import { expect, test, type Page } from "@playwright/test";

const commercial = process.env.E2E_EDITION === "commercial";
test.use({ timezoneId: "Asia/Shanghai" });

async function login(page: Page, withTask = false) {
  await page.addInitScript(seedTask => {
    if (localStorage.getItem("seat-manager-workspaces-v1")) return;
    const createdAt = "2026-09-20T16:00:00.000Z";
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify({ version: 1, currentSliceId: "functional-slice", slices: [{ id: "functional-slice", classId: "functional-class", className: "功能测试班", term: { id: "functional-term", year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data: { students: [{ id: "s1", name: "功能测试学生", gender: "男", manualTags: [], autoTags: [], records: [], exams: [] }], seatOrder: ["s1"], followupTasks: seedTask ? [{ id: "midnight-task", studentId: "", title: "凌晨班级待办", plannedDate: "2026-09-21", dueDate: "2026-09-21", status: "pending", source: "manual", createdAt, updatedAt: createdAt }] : [] } }] }));
  }, withTask);
  await page.route("**/license/auth", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "e2e-functional-state", expiresAt: Date.now() + 600_000, licenseId: "e2e-functional-state", edition: commercial ? "commercial" : "zhang" }) }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-FUNCTIONAL-STATE");
  await page.getByRole("button", { name: /^进入/ }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
}

async function currentData(page: Page) {
  return page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    return book.slices?.find((slice: { id: string }) => slice.id === book.currentSliceId)?.data;
  });
}

test("midnight task notification is emitted once and stays acknowledged after reload", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-21T00:30:00+08:00"));
  await page.addInitScript(() => {
    const notifications: string[] = [];
    Object.assign(window, { testNotifications: notifications });
    Object.defineProperty(window, "Notification", { configurable: true, value: class {
      static permission = "granted";
      constructor(title: string) {
        notifications.push(title);
        if (notifications.length > 5) throw new Error("Repeated same-day notification");
      }
    } });
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await login(page, true);
  await expect.poll(async () => (await currentData(page))?.followupTasks?.[0]?.lastNotifiedAt).toBe("2026-09-20T16:30:00.000Z");
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^任务与作业/ }).click();
  expect(await page.evaluate(() => (window as Window & { testNotifications?: string[] }).testNotifications?.length)).toBe(1);
  await page.reload();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^任务与作业/ }).click();
  await expect(page.locator('[data-followup-task-id="midnight-task"]')).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { testNotifications?: string[] }).testNotifications?.length)).toBe(0);
  expect(errors).toEqual([]);
});

test("followup draft survives failed cache writes and cannot return after submission", async ({ page }) => {
  await login(page);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^任务与作业/ }).click();
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("已保存任务");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  const card = page.locator("[data-followup-task-id]");
  const open = () => card.getByRole("button", { name: "编辑任务", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "编辑跟进任务" });
  const title = drawer.getByRole("textbox", { name: "标题", exact: true });
  await open();
  await title.fill("旧草稿");
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("seat-manager-form-draft-v1:")) throw new DOMException("full", "QuotaExceededError");
      return set.call(this, key, value);
    };
    Storage.prototype.removeItem = function(key) {
      if (key.startsWith("seat-manager-form-draft-v1:")) throw new DOMException("denied", "SecurityError");
      return remove.call(this, key);
    };
  });
  await open();
  await title.fill("保留最新草稿");
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await open();
  await expect(title).toHaveValue("保留最新草稿");
  await drawer.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect.poll(async () => (await currentData(page))?.followupTasks?.[0]?.title).toBe("保留最新草稿");
  await open();
  await expect(title).toHaveValue("保留最新草稿");
});
