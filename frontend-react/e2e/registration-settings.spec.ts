import { expect, test, type Page } from "@playwright/test";

const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
test.use({ timezoneId: "Asia/Shanghai" });
async function login(page: Page, seedDormitory = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date("2026-09-22T10:00:00+08:00"));
  await page.addInitScript(seedDorm => {
    if (localStorage.getItem("seat-manager-workspaces-v1")) return;
    const createdAt = "2026-09-22T00:00:00Z";
    const data = { students: ["张三", "李四"].map((name, index) => ({ id: `s${index + 1}`, name, gender: "男", manualTags: [], autoTags: [], records: [], exams: [] })), seatOrder: ["s1", "s2"], dormitories: seedDorm ? [{ id: "d1", name: "最后一间宿舍", memberIds: [], baseScore: 100, events: [], history: [] }] : [], attendanceRecords: [{ id: "prior", studentId: "s1", date: "2026-09-22", status: "absent", late: false, earlyLeave: false, note: "保留原备注", createdAt, updatedAt: createdAt }], homeworkAssignments: [{ id: "h1", title: "数学练习", subject: "数学", assignedDate: "2026-09-22", dueDate: "2026-09-22", note: "", lifecycle: "active", participantStudentIds: ["s1", "s2"], studentStates: { s1: { status: "pending", note: "补充说明", updatedAt: createdAt }, s2: { status: "unrecorded", note: "", updatedAt: createdAt } }, createdAt, updatedAt: createdAt }] };
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify({ version: 1, currentSliceId: "registration-slice", slices: [{ id: "registration-slice", classId: "registration-class", className: "登记测试班", term: { id: "registration-term", year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data }] }));
  }, seedDormitory);
  await page.route("**/license/auth", route => route.fulfill({ json: { token: "e2e-registration", expiresAt: Date.now() + 600000, licenseId: "e2e-registration", edition } }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-REGISTRATION");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
}
async function data(page: Page) {
  return page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    return book.slices.find((slice: { id: string }) => slice.id === book.currentSliceId).data;
  });
}
const nav = (page: Page, name: RegExp) => page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name }).click();

test("task type editing is shared, persistent and keeps historical task types", async ({ page }) => {
  await login(page); await nav(page, /^任务与作业/);
  await page.getByRole("button", { name: "编辑类型", exact: true }).click();
  const catalog = page.getByRole("textbox", { name: "可选任务类型", exact: true });
  await catalog.fill("常规跟进\n阅读跟进\n阅读跟进");
  await page.getByRole("button", { name: "保存类型", exact: true }).click();
  await expect(page.getByText("类型名称不能重复。", { exact: true })).toBeVisible();
  await catalog.fill("常规跟进\n阅读跟进");
  await page.screenshot({ path: `/tmp/registration-${edition}-types.png` });
  await page.getByRole("button", { name: "收起类型编辑", exact: true }).click();
  await page.getByRole("button", { name: "编辑类型", exact: true }).click();
  await expect(catalog).toHaveValue("常规跟进\n阅读跟进");
  await page.getByRole("button", { name: "保存类型", exact: true }).click();
  await expect.poll(async () => (await data(page)).settings?.followupTypes).toEqual(["常规跟进", "阅读跟进"]);
  await page.getByRole("button", { name: /跟进类型/ }).click();
  await page.getByRole("option", { name: "阅读跟进", exact: true }).click();
  await page.getByRole("textbox", { name: "标题", exact: true }).fill("阅读检查");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  const card = page.locator("[data-followup-task-id]").filter({ hasText: "阅读检查" });
  await card.getByRole("button", { name: "编辑任务", exact: true }).click();
  const drawer = page.getByRole("complementary", { name: "编辑跟进任务" });
  await drawer.getByRole("button", { name: "编辑类型", exact: true }).click();
  await drawer.getByRole("textbox", { name: "可选任务类型", exact: true }).fill("常规跟进\n阅读反馈");
  await drawer.getByRole("button", { name: "保存类型", exact: true }).click();
  await expect(drawer.getByRole("button", { name: /跟进类型/ })).toContainText("阅读跟进（原类型）");
  await drawer.getByRole("button", { name: "关闭工具面板" }).click();
  await page.getByRole("button", { name: "编辑类型", exact: true }).click();
  await expect(catalog).toHaveValue("常规跟进\n阅读反馈");
  await page.reload(); await nav(page, /^任务与作业/);
  await expect(card).toContainText("阅读跟进");
  await expect.poll(async () => (await data(page)).settings?.followupTypes).toEqual(["常规跟进", "阅读反馈"]);
});

test("attendance repeat clicks restore one student, expire at six seconds and work in detail view", async ({ page }) => {
  await login(page); await nav(page, /^出勤/);
  const a = page.locator('[data-attendance-student-id="s1"]');
  const b = page.locator('[data-attendance-student-id="s2"]');
  await a.click(); await b.click(); await a.click();
  await expect(a).toContainText("缺勤"); await expect(b).toContainText("请假");
  await expect.poll(async () => (await data(page)).attendanceRecords.find((r: { studentId: string }) => r.studentId === "s1").note).toBe("保留原备注");
  await page.getByRole("button", { name: "撤销上一步", exact: true }).click();
  await expect(b).toContainText("正常");
  await a.click();
  await page.clock.setFixedTime(new Date("2026-09-22T10:00:06+08:00"));
  await a.click(); await expect(a).toContainText("请假");
  await page.getByRole("group", { name: "快速出勤状态", exact: true }).getByRole("button", { name: "缺勤", exact: true }).click();
  await a.click(); await expect(a).toContainText("缺勤");
  await a.click(); await expect(a).toContainText("请假");
  await page.getByRole("group", { name: "出勤登记视图", exact: true }).getByRole("button", { name: "详细", exact: true }).click();
  await a.getByRole("group", { name: "主要出勤状态", exact: true }).getByRole("button", { name: "正常", exact: true }).click();
  await a.getByRole("group", { name: "主要出勤状态", exact: true }).getByRole("button", { name: "正常", exact: true }).click();
  await expect.poll(async () => (await data(page)).attendanceRecords.find((r: { studentId: string }) => r.studentId === "s1").status).toBe("leave");
});

test("homework repeat clicks preserve other students and notes, explicit undo stays scoped", async ({ page }) => {
  await login(page); await nav(page, /^任务与作业/);
  await page.getByRole("tab", { name: "作业", exact: true }).click();
  const a = page.locator('[data-homework-student-id="s1"]');
  const b = page.locator('[data-homework-student-id="s2"]');
  await a.click(); await b.click(); await a.click();
  await expect(a).toContainText("未交"); await expect(b).toContainText("已交");
  await expect.poll(async () => (await data(page)).homeworkAssignments[0].studentStates.s1.note).toBe("补充说明");
  await page.getByRole("button", { name: "撤销上一步", exact: true }).click();
  await expect(b).toContainText("待登记"); await expect(a).toContainText("未交");
  await a.click();
  await page.clock.setFixedTime(new Date("2026-09-22T10:00:06+08:00"));
  await a.click(); await expect(a).toContainText("已交");
});


test("student profile uses the same repeat-press rule, including keyboard presses", async ({ page }) => {
  await login(page); await nav(page, /^座位/);
  await page.locator('[data-student-id="s1"]').click();
  const modal = page.getByRole("dialog", { name: "张三学生详情" });
  await modal.getByRole("tab", { name: "出勤", exact: true }).click();
  const leave = modal.getByRole("group", { name: "主要出勤状态", exact: true }).getByRole("button", { name: "请假", exact: true });
  await leave.click();
  await expect.poll(async () => (await data(page)).attendanceRecords.find((r: { studentId: string }) => r.studentId === "s1").status).toBe("leave");
  await leave.focus(); await page.keyboard.press("Space");
  await expect.poll(async () => (await data(page)).attendanceRecords.find((r: { studentId: string }) => r.studentId === "s1").status).toBe("absent");
  await modal.getByRole("group", { name: "主要出勤状态", exact: true }).getByRole("button", { name: "正常", exact: true }).click();
  await modal.getByRole("button", { name: "迟到", exact: true }).click();
  await modal.getByRole("button", { name: "迟到", exact: true }).click();
  await expect.poll(async () => (await data(page)).attendanceRecords.find((r: { studentId: string }) => r.studentId === "s1").late).toBe(false);
});

test("an empty dormitory workspace stays usable with class duties enabled", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page);
  await nav(page, /^宿舍/);
  await expect(page.getByText("请先选择或创建一个宿舍", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});


test("deleting the final dormitory returns safely to an empty workspace", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await login(page, true); await nav(page, /^宿舍/);
  await expect(page.getByRole("heading", { name: "最后一间宿舍", exact: true })).toBeVisible();
  await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
  await page.getByTitle("删除宿舍", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "确认删除宿舍", exact: true }).click();
  await expect(page.getByText("请先选择或创建一个宿舍", { exact: true })).toBeVisible();
  await expect.poll(async () => (await data(page)).dormitories).toEqual([]);
  expect(errors).toEqual([]);
});
