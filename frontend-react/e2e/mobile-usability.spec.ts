import { expect, test, type Page, type Locator } from "@playwright/test";

const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
test.use({ isMobile: true, hasTouch: true, serviceWorkers: "block" });
async function setup(page: Page, width = 390) {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => {
    if (localStorage.getItem("seat-manager-workspaces-v1")) return;
    const createdAt = "2026-09-22T00:00:00Z";
    const students = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, name: ["张三", "李四", "王五"][i] || `测试学生${i + 1}`, gender: i % 2 ? "女" : "男", manualTags: [], autoTags: [], records: [], exams: [], dormId: i < 2 ? "d1" : undefined }));
    const cell = (score: number) => ({ score, rankClass: null, rankSchool: null });
    const subjects = ["语文", "数学", "英语", "物理", "化学", "地理"];
    const data = { students, seatOrder: [...students.map(student => student.id), null, null, null, null], lockedSeats: [1], dormitories: [{ id: "d1", name: "101室", events: [] }], savedExams: [{ id: "exam1", name: "手机测试考试", date: "2026-09-22", savedAt: createdAt, studentCount: 60, subjectCount: 6, subjects, entries: students.map((student, i) => ({ name: student.name, scores: Object.fromEntries(subjects.map((subject, j) => [subject, cell(60 + (i + j) % 40)])), total: cell(450) })) }] };
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify({ version: 1, currentSliceId: "mobile", slices: [{ id: "mobile", classId: "mobile-class", className: "很长的手机适配测试班级名称", term: { id: "term", year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data }] }));
  });
  await page.route("**/license/auth", route => route.fulfill({ json: { token: "mobile-e2e", expiresAt: Date.now() + 600000, licenseId: "mobile-e2e", edition } }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-MOBILE");
  await page.getByRole("button", { name: "进入工作台", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "今日班务" })).toBeVisible();
}
async function nav(page: Page, name: string) {
  await page.getByRole("button", { name: "展开侧栏", exact: true }).tap();
  const dialog = page.getByRole("dialog", { name: "切换工作区" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: new RegExp(`^${name}`) }).tap();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
}
async function contained(page: Page, locator: Locator) {
  const rect = await locator.boundingBox();
  expect(rect).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(rect!.x).toBeGreaterThanOrEqual(0);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(rect!.y).toBeGreaterThanOrEqual(0);
  expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height + 1);
}
const data = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!).slices[0].data);

for (const width of [320, 390]) test(`phone ${width}: all workspaces, grade controls, dialogs and touch navigation stay usable`, async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await setup(page, width);
  for (const label of ["搜索学生", "账户", "打开 AI 助手"]) await contained(page, page.getByRole("button", { name: label, exact: true }));
  expect((await page.locator('.app-work-surface').boundingBox())!.width).toBeGreaterThan(width - 20);
  await page.getByRole("button", { name: "展开侧栏", exact: true }).tap();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "切换工作区" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "展开侧栏", exact: true })).toBeFocused();
  for (const label of ["座位", "出勤", "任务与作业", "宿舍", "成绩", "评语工作台", "班费", "历史", "名单 / 备份"]) {
    await nav(page, label);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    await contained(page, page.locator('.app-work-surface'));
  }
  await nav(page, "成绩");
  await expect(page.getByRole("heading", { name: "各科平均分对比" })).toBeVisible();
  await page.getByRole("toolbar", { name: "成绩学科切换" }).getByRole("button", { name: "语文", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "语文分数分布" })).toBeVisible();
  await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
  await page.locator('.grade-main-chart').first().scrollIntoViewIfNeeded();
  await contained(page, page.locator('.grade-main-chart').first());
  await page.screenshot({ path: `output/playwright/mobile-grade-${width}.png` });
  await page.getByRole("button", { name: "考试与导入", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "成绩导入" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "语文分数分布" })).toBeHidden();
  await page.getByRole("button", { name: "返回成绩分析", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "语文分数分布" })).toBeVisible();
  await nav(page, "评语工作台");
  await page.getByRole("button", { name: "查看 张三 的学生详情", exact: true }).tap();
  const student = page.getByRole("dialog", { name: "张三学生详情" });
  await contained(page, student);
  await student.getByRole("tab", { name: "档案", exact: true }).tap();
  await student.getByRole("button", { name: "编辑资料", exact: true }).tap();
  await contained(page, student.getByRole("button", { name: "取消", exact: true }));
  await page.setViewportSize({ width, height: 560 });
  await contained(page, student);
  await student.getByRole("button", { name: "取消", exact: true }).tap();
  await student.getByRole("button", { name: "关闭学生详情", exact: true }).tap();
  await page.setViewportSize({ width, height: 844 });
  await page.getByRole("button", { name: "打开 AI 助手", exact: true }).tap();
  await contained(page, page.getByRole("dialog", { name: "AI助手浮窗" }));
  await page.getByRole("button", { name: "关闭AI助手", exact: true }).tap();
  expect(errors).toEqual([]);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) test(`phone comments retain drafts across panes, students and orientation (${reducedMotion})`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion });
  await setup(page);
  await nav(page, "评语工作台");
  const workbench = page.getByRole("region", { name: "评语工作台" });
  const tabs = page.getByRole("toolbar", { name: "评语工作区" });
  const editor = workbench.getByRole("textbox", { name: "评语正文编辑器" });
  await editor.fill("张三手机上还没保存的草稿");
  await tabs.getByRole("button", { name: "素材与 AI", exact: true }).tap();
  await expect(editor).toBeHidden();
  await workbench.getByRole("textbox", { name: "例如：回答问题积极，作业偶尔拖交，数学进步明显。" }).fill("手机补充说明");
  await tabs.getByRole("button", { name: "学生名单", exact: true }).tap();
  await workbench.locator('[data-comment-student-id="s1"]').tap();
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue("");
  await editor.fill("李四独立草稿");
  await tabs.getByRole("button", { name: "学生名单", exact: true }).tap();
  await workbench.locator('[data-comment-student-id="s0"]').tap();
  await expect(editor).toHaveValue("张三手机上还没保存的草稿");
  await page.setViewportSize({ width: 844, height: 390 });
  await workbench.getByRole("button", { name: "保存", exact: true }).scrollIntoViewIfNeeded();
  await contained(page, workbench.getByRole("button", { name: "保存", exact: true }));
  await expect(editor).toHaveValue("张三手机上还没保存的草稿");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(editor).toHaveValue("张三手机上还没保存的草稿");
  await contained(page, editor);
  await workbench.getByRole("button", { name: "保存", exact: true }).tap();
  await expect.poll(async () => (await data(page)).students[0].aiComments.profile.generatedComment).toBe("张三手机上还没保存的草稿");
  await page.screenshot({ path: `output/playwright/mobile-comments-${reducedMotion}.png` });
});

test("phone seat panning does not rearrange, tap move respects locks and undo", async ({ page }) => {
  await setup(page);
  await nav(page, "座位");
  const before = (await data(page)).seatOrder;
  const board = page.locator('[data-seat-board-layer]');
  const source = board.locator('[data-student-id="s0"]');
  // Native touch panning must not arm the mouse-drag transaction.
  await source.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 9, button: 0, clientX: 70, clientY: 330 });
  await source.dispatchEvent("pointermove", { pointerType: "touch", pointerId: 9, clientX: 20, clientY: 330 });
  await source.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 9, clientX: 20, clientY: 330 });
  expect((await data(page)).seatOrder).toEqual(before);
  await expect(page.locator('[data-drag-student-id]')).toHaveCount(0);
  await page.getByRole("button", { name: "点选调座", exact: true }).tap();
  await source.tap();
  await board.locator('[data-student-id="s1"]').tap();
  await expect(page.getByRole("status").filter({ hasText: "该座位已锁定" })).toBeVisible();
  expect((await data(page)).seatOrder).toEqual(before);
  await board.locator('[data-student-id="s2"]').tap();
  await expect.poll(async () => (await data(page)).seatOrder.slice(0, 3)).toEqual(["s2", "s1", "s0"]);
  await expect(page.getByRole("dialog", { name: /学生详情/ })).toHaveCount(0);
  await page.getByRole("button", { name: "撤销", exact: true }).tap();
  await expect.poll(async () => (await data(page)).seatOrder).toEqual(before);
  await source.tap();
  const empty = board.locator('[data-seat-index="63"]');
  await empty.scrollIntoViewIfNeeded();
  await empty.focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await data(page)).seatOrder[63]).toBe("s0");
  await page.getByRole("button", { name: "撤销", exact: true }).tap();
  await expect.poll(async () => (await data(page)).seatOrder).toEqual(before);
  await page.getByRole("button", { name: "完成调座", exact: true }).tap();
  await page.getByRole("button", { name: "编辑布局", exact: true }).tap();
  await page.getByRole("button", { name: "取消", exact: true }).tap();
  expect((await data(page)).seatOrder).toEqual(before);
});

test("phone dormitory panels keep selected room and member actions reachable", async ({ page }) => {
  await setup(page);
  await nav(page, "宿舍");
  await page.getByRole("button", { name: /101室/ }).tap();
  await expect(page.getByRole("heading", { name: "101室", exact: true })).toBeVisible();
  const tabs = page.getByRole("toolbar", { name: "宿舍工作区" });
  await tabs.getByRole("button", { name: "成员", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "宿舍成员" })).toBeVisible();
  await tabs.getByRole("button", { name: "宿舍", exact: true }).tap();
  await expect(page.getByRole("button", { name: /101室/ })).toBeVisible();
  await tabs.getByRole("button", { name: "奖罚记录", exact: true }).tap();
  await expect(page.getByRole("heading", { name: "101室", exact: true })).toBeVisible();
});


test("phone score mapping stays editable and cancel does not import teacher data", async ({ page }) => {
  await setup(page, 320);
  await nav(page, "成绩");
  const before = (await data(page)).savedExams;
  await page.getByRole("button", { name: "考试与导入", exact: true }).tap();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "手机映射.csv", mimeType: "text/csv", buffer: Buffer.from("姓名,语文,数学,英语\n张三,85,92,90\n李四,88,89,93\n") });
  await page.getByRole("dialog", { name: "自动补全班级排名？" }).getByRole("button", { name: "稍后决定", exact: true }).tap();
  await page.getByRole("button", { name: /^映射设置/ }).tap();
  const mapping = page.getByRole("dialog", { name: "成绩列映射" });
  await contained(page, mapping);
  const nameColumn = mapping.getByRole("button", { name: /姓名列/ });
  await nameColumn.scrollIntoViewIfNeeded();
  await contained(page, nameColumn);
  await nameColumn.tap();
  await contained(page, page.getByRole("listbox"));
  await page.keyboard.press("Escape");
  await contained(page, mapping.getByRole("button", { name: "应用映射", exact: true }));
  await mapping.getByRole("button", { name: "先不应用", exact: true }).tap();
  await expect(mapping).toHaveCount(0);
  expect((await data(page)).savedExams).toEqual(before);
});
