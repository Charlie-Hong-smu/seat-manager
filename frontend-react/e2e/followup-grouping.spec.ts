import { expect, test, type Page } from "@playwright/test";

const commercial = process.env.E2E_EDITION === "commercial";

async function start(page: Page) {
  await page.route("**/license/auth", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "e2e-grouping", expiresAt: Date.now() + 600_000, licenseId: "e2e-grouping", edition: commercial ? "commercial" : "zhang" }) }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-GROUPING");
  await page.getByRole("button", { name: /^进入/ }).click();
  await page.getByRole("button", { name: "座位", exact: true }).click();
  await page.getByRole("button", { name: "新增学生", exact: true }).click();
  for (const name of ["关联甲", "关联乙", "关联丙"]) {
    await page.getByRole("textbox", { name: "姓名", exact: true }).fill(name);
    await page.getByRole("button", { name: "添加到班级", exact: true }).click();
  }
  await page.getByRole("button", { name: "关闭工具面板", exact: true }).last().click();
}

async function storedTasks(page: Page) {
  return page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    return (book.slices?.find((slice: { id: string }) => slice.id === book.activeSliceId) || book.slices?.[0])?.data.followupTasks || [];
  });
}

test("shared followup creates one task, edits every participant, survives reload and supports undo", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: /^任务与作业/ }).click();
  await page.getByRole("button", { name: /关联学生（可选）/ }).click();
  await page.getByRole("button", { name: "关联甲 加入", exact: true }).click();
  await page.getByRole("button", { name: "关联乙 加入", exact: true }).click();
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("共同返校打扫");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  const cards = page.locator("[data-followup-task-id]");
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("关联甲、关联乙");
  await cards.getByRole("button", { name: "编辑任务", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "编辑跟进任务" });
  await expect(drawer.getByRole("button", { name: "移除 关联乙", exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "移除 关联甲", exact: true }).click();
  await drawer.getByRole("button", { name: /关联学生（可选）/ }).click();
  await drawer.getByRole("button", { name: "关联丙 加入", exact: true }).click();
  await drawer.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect(cards).toContainText("关联乙、关联丙");
  await expect.poll(async () => (await storedTasks(page))[0]?.studentIds?.length).toBe(2);
  await page.reload();
  await page.getByRole("button", { name: /^任务与作业/ }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("关联乙、关联丙");
  await page.getByPlaceholder("搜索学生、事项或说明").fill("关联丙");
  await expect(cards).toHaveCount(1);
  await cards.getByRole("button", { name: "完成任务", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "任务状态已更新" }).getByRole("button", { name: "撤销", exact: true }).click();
  await expect(cards.getByRole("button", { name: "完成任务", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
  const description = cards.getByText(/关联乙、关联丙/);
  await expect.poll(async () => (await description.boundingBox())?.width || 0).toBeGreaterThan(150);
  const labelBox = await description.boundingBox();
  const actionBox = await cards.getByRole("button", { name: "编辑任务", exact: true }).boundingBox();
  expect(labelBox?.width).toBeGreaterThan(150);
  expect(actionBox!.y).toBeGreaterThanOrEqual(labelBox!.y + labelBox!.height);
});

test("today entry shares one task, counts once and preserves all students when continuing", async ({ page }) => {
  await start(page);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "今日", exact: true }).click();
  await page.getByRole("button", { name: "新建任务", exact: true }).click();
  await page.getByRole("button", { name: /关联学生（可选）/ }).click();
  await page.getByRole("button", { name: "关联甲 加入", exact: true }).click();
  await page.getByRole("button", { name: "关联乙 加入", exact: true }).click();
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("共同班务");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.getByRole("button", { name: "完成跟进：共同班务", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "完成跟进：共同班务", exact: true }).click();
  await page.getByRole("button", { name: "继续跟进", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "创建跟进任务" });
  await expect(drawer.getByRole("button", { name: "移除 关联乙", exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "创建任务", exact: true }).click();
  await expect.poll(async () => (await storedTasks(page)).length).toBe(2);
  const tasks = await storedTasks(page);
  expect(tasks[0].studentIds).toEqual(tasks[1].studentIds);
  expect(tasks[0].continuedFromTaskId).toBe(tasks[1].id);
});

test("collection followups retain separate students, statuses and history records", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "班费", exact: true }).click();
  await page.getByRole("group", { name: "班费视图" }).getByRole("button", { name: "收缴情况", exact: true }).click();
  await page.getByRole("button", { name: "为未交 3 人建跟进", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "创建跟进任务" });
  await expect(drawer.getByRole("button", { name: "分别创建 3 项", exact: true })).toBeVisible();
  await drawer.getByRole("button", { name: "分别创建 3 项", exact: true }).click();
  await page.getByRole("button", { name: /^任务与作业/ }).click();
  const cards = page.locator("[data-followup-task-id]");
  await expect(cards).toHaveCount(3);
  const first = cards.filter({ hasText: "关联甲" });
  await first.getByRole("button", { name: "编辑任务", exact: true }).click();
  const edit = page.getByRole("complementary", { name: "编辑跟进任务" });
  await expect(edit.getByText("关联学生：关联甲", { exact: true })).toBeVisible();
  await edit.getByRole("button", { name: "保存修改", exact: true }).click();
  await first.getByRole("button", { name: "完成任务", exact: true }).click();
  await expect(cards.filter({ hasText: "关联乙" }).getByRole("button", { name: "完成任务", exact: true })).toBeVisible();
  await expect.poll(async () => (await storedTasks(page)).filter((task: { status: string }) => task.status === "completed").length).toBe(1);
  const history = await page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    return book.slices[0].data.activityEvents.filter((event: { action: string; ref: { domain: string } }) => event.ref.domain === "followup" && event.action === "created");
  });
  expect(history).toHaveLength(3);
  expect(new Set(history.map((event: { ref: { entityId: string } }) => event.ref.entityId)).size).toBe(3);
});
