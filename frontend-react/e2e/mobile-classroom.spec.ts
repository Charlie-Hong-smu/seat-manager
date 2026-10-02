import { expect, test } from "@playwright/test";
import { classroomData, classroomNav as nav, classroomSaved as saved, inViewport, nativeSwipe, setupClassroom } from "./mobile-classroom-fixtures";
import { openSeatTool } from "./seatTools";
const edition = process.env.E2E_EDITION || "zhang";
test.use({ isMobile: true, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block" });

for (const width of [360, 390, 430]) test(`classroom ${width}: waiting touch scroll, roster, fund, exam and modal focus`, async ({ page }) => {
  test.setTimeout(90_000); await setupClassroom(page, width);
  await nav(page, "座位"); const before = (await saved(page)).seatOrder;
  await page.getByRole("button", { name: "展开等待区" }).tap();
  const list = page.locator(".seat-waiting-dock__list");
  await expect.poll(() => list.evaluate(element => element.clientWidth)).toBeGreaterThan(width - 90);
  await nativeSwipe(page, list); await expect.poll(() => list.evaluate(element => element.scrollLeft)).toBeGreaterThan(40);
  const waitingScroll = await list.evaluate(element => element.scrollLeft);
  const seatScroll = page.locator("[data-seat-scroll-surface]");
  await nativeSwipe(page, seatScroll); await expect.poll(() => seatScroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(40);
  expect(await list.evaluate(element => element.scrollLeft)).toBe(waitingScroll);
  await nativeSwipe(page, seatScroll, "y"); await expect.poll(() => seatScroll.evaluate(element => element.scrollTop)).toBeGreaterThan(20);
  await seatScroll.evaluate(element => element.scrollTo(0, 0));
  await page.getByRole("button", { name: "收起等待区" }).tap(); await inViewport(page, seatScroll);
  const longNameSeat = page.locator('[data-seat-board-layer] [data-student-id="s0"]');
  await longNameSeat.tap(); const studentDetails = page.getByRole("dialog", { name: "合成长姓名测试同学甲学生详情" });
  await expect(studentDetails).toBeVisible(); await studentDetails.getByRole("tab", { name: "档案", exact: true }).tap();
  await expect(studentDetails.locator(".app-motion-switch[data-moving]")).toHaveCount(0);
  await expect(studentDetails.getByRole("textbox", { name: "姓名", exact: true })).toHaveValue("合成长姓名测试同学甲"); await inViewport(page, studentDetails.getByRole("textbox", { name: "姓名", exact: true }));
  await page.screenshot({ path: `output/playwright/mobile-workflow/${edition}-seat-information-${width}.png` }); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "点选调座", exact: true }).tap();
  await page.locator('[data-seat-board-layer] [data-student-id="s1"]').tap();
  const unlock = page.getByRole("button", { name: "解锁当前座位", exact: true }); await inViewport(page, unlock); expect((await unlock.boundingBox())!.height).toBeGreaterThanOrEqual(44); await unlock.tap();
  await expect.poll(async () => (await saved(page)).lockedSeats.includes(1)).toBe(false);
  await page.getByRole("button", { name: "锁定当前座位", exact: true }).tap(); await expect.poll(async () => (await saved(page)).lockedSeats.includes(1)).toBe(true);
  await page.getByRole("button", { name: "完成调座", exact: true }).tap(); await page.getByRole("button", { name: "展开等待区" }).tap();
  expect((await saved(page)).seatOrder).toEqual(before); await expect(page.locator('[data-drag-student-id]')).toHaveCount(0);
  await page.screenshot({ path: `output/playwright/mobile-workflow/${edition}-waiting-${width}.png` });
  await nav(page, "名单 / 备份"); await page.locator('input[type=file]').first().setInputFiles({ name: "合成.csv", mimeType: "text/csv", buffer: Buffer.from("姓名,学号,性别\n合成学生1,001,男\n合成学生2,002,女") });
  await page.getByRole("button", { name: /映射设置/ }).tap(); const roster = page.getByRole("dialog", { name: "名单列映射" });
  await inViewport(page, roster); expect(await page.locator(".roster-mapping-grid").evaluate(element => element.clientWidth)).toBeGreaterThan(width - 20);
  await page.screenshot({ path: `output/playwright/mobile-workflow/${edition}-roster-${width}.png` }); await page.keyboard.press("Escape"); expect((await saved(page)).students).toHaveLength(60);
  await nav(page, "出勤"); await page.getByRole("button", { name: "详细", exact: true }).tap();
  const attendance = page.locator('[data-attendance-student-id="s0"]'); await expect(attendance).toHaveCount(1); await attendance.scrollIntoViewIfNeeded(); await inViewport(page, attendance);
  expect((await attendance.boundingBox())!.height).toBeLessThan(190); await attendance.getByRole("button", { name: "迟到", exact: true }).tap();
  await expect.poll(async () => (await saved(page)).attendanceRecords.find((record: { studentId: string }) => record.studentId === "s0")?.late).toBe(true);
  await page.screenshot({ path: `output/playwright/mobile-workflow/${edition}-attendance-${width}.png` });
  if (width === 360) {
    await page.getByRole("button", { name: "快速", exact: true }).tap(); await page.getByRole("button", { name: /^正常 60/ }).tap();
    const retained = page.locator('[data-attendance-student-id="s0"]'); await expect(retained).toHaveCount(1); await retained.tap(); await expect(retained).toBeVisible(); await retained.tap();
    await expect.poll(async () => (await saved(page)).attendanceRecords.find((record: { studentId: string }) => record.studentId === "s0")?.status).toBe("normal");
    expect((await saved(page)).attendanceRecords.some((record: { studentId: string }) => record.studentId === "s1")).toBe(false);
  }
  await nav(page, "班费"); await page.getByRole("button", { name: "登记汇总", exact: true }).tap();
  const fund = page.locator('[data-fund-summary-student="s0"]'); await fund.scrollIntoViewIfNeeded(); await inViewport(page, fund);
  await expect(fund).toContainText("¥123.45"); await expect(fund).toContainText("最近登记");
  expect(await fund.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: `output/playwright/mobile-workflow/${edition}-fund-${width}.png` });
  if (width === 360) {
    await page.getByRole("button", { name: "收费事项", exact: true }).tap(); await page.getByRole("button", { name: "新建收费事项", exact: true }).tap();
    const collection = page.getByRole("complementary", { name: "新建收费事项", exact: true }); await collection.getByRole("button", { name: "选择全班", exact: true }).tap();
    await expect(collection.getByRole("button", { name: /参与学生 已选 60 人/ })).toBeVisible();
    await inViewport(page, collection.getByRole("button", { name: "创建收费事项", exact: true }));
    await expect(collection.getByRole("textbox", { name: "每人应交金额", exact: true })).toHaveAttribute("inputmode", "decimal");
    await page.keyboard.press("Escape"); expect((await saved(page)).fundCollections || []).toHaveLength(0);
  }
  await nav(page, "成绩"); await page.getByRole("button", { name: "考试与导入", exact: true }).tap(); await page.getByRole("button", { name: "查看成绩表格" }).first().tap();
  const exam = page.getByRole("dialog", { name: "合成手机长名称考试一" }); await inViewport(page, exam);
  await inViewport(page, exam.getByRole("textbox", { name: "搜索学生姓名" }));
  expect((await exam.getByRole("heading").boundingBox())!.width).toBeGreaterThan(200);
  await expect(page.getByRole("button", { name: "打开 AI 助手", exact: true })).toBeHidden();
  await page.screenshot({ path: `output/playwright/mobile-workflow/${edition}-exam-${width}.png` }); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "搜索学生", exact: true }).tap(); const search = page.getByRole("dialog", { name: "搜索学生", exact: true });
  await search.getByRole("option").last().focus(); await page.keyboard.press("Escape"); await expect(search).toHaveCount(0); await expect(page.getByRole("button", { name: "搜索学生", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
});

test("classroom mode preselects one student, isolates drafts, blocks drag and duplicate save, and undoes activity", async ({ page }) => {
  const fullRoster = [...classroomData().students, ...Array.from({ length: 4 }, (_, i) => ({ ...classroomData().students[i], id: `s${i + 60}`, name: `满座合成学生${i + 61}` }))];
  await setupClassroom(page, 360, { students: fullRoster, seatOrder: fullRoster.map(student => student.id) }); await page.getByRole("button", { name: "快捷记录", exact: true }).tap();
  const general = page.getByRole("complementary", { name: "快捷记录", exact: true }); await general.getByPlaceholder("记录客观事实").fill("尚未保存的多人草稿"); await page.keyboard.press("Escape");
  await nav(page, "座位"); const before = (await saved(page)).seatOrder;
  expect(before).toHaveLength(64); expect(before.every(Boolean)).toBe(true);
  await page.getByRole("button", { name: "课堂记录", exact: true }).tap(); const seat = page.locator('[data-seat-board-layer] [data-student-id="s0"]'); await seat.scrollIntoViewIfNeeded();
  await nativeSwipe(page, seat); await expect(page.getByRole("complementary", { name: "课堂记录", exact: true })).toHaveCount(0); expect((await saved(page)).seatOrder).toEqual(before);
  await seat.tap(); const drawer = page.getByRole("complementary", { name: "课堂记录", exact: true });
  await expect(drawer).toContainText("合成长姓名测试同学甲"); await expect(drawer.getByPlaceholder("记录客观事实")).toHaveValue("");
  await drawer.getByRole("button", { name: "主动回答", exact: true }).tap(); const save = drawer.getByRole("button", { name: "保存到 合成长姓名测试同学甲", exact: true });
  await save.evaluate(element => { (element as HTMLButtonElement).click(); (element as HTMLButtonElement).click(); });
  await expect.poll(async () => (await saved(page)).students[0].records.length).toBe(1); expect((await saved(page)).seatOrder).toEqual(before);
  await expect(page.getByRole("status").filter({ hasText: "合成长姓名测试同学甲的快捷记录已保存" })).toBeVisible();
  await page.getByRole("button", { name: "撤销", exact: true }).tap(); await expect.poll(async () => (await saved(page)).students[0].records.length).toBe(0);
  expect((await saved(page)).activityEvents.filter((event: { detail: string }) => event.detail === "快捷记录")).toHaveLength(0);
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "点选调座", exact: true }).tap(); await expect(page.getByRole("button", { name: "课堂记录", exact: true })).toHaveAttribute("aria-pressed", "false");
  await nav(page, "今日"); await page.getByRole("button", { name: "快捷记录", exact: true }).tap(); await expect(page.getByPlaceholder("记录客观事实")).toHaveValue("尚未保存的多人草稿"); await page.keyboard.press("Escape");
  await nav(page, "座位"); await page.getByRole("button", { name: "课堂记录", exact: true }).tap(); await seat.tap();
  await drawer.getByRole("button", { name: "主动回答", exact: true }).tap(); await save.tap(); await page.keyboard.press("Escape");
  await page.locator(".app-workspace-trigger").tap(); await page.getByRole("button", { name: "删除 合成空班 2026 秋", exact: true }).tap();
  await expect(page.getByRole("status").filter({ hasText: "快捷记录已保存" })).toHaveCount(0);
  expect((await saved(page)).students[0].records).toHaveLength(1);
});

test("phone homework prioritizes registration and retains identities under filtering and consecutive edits", async ({ page }) => {
  await setupClassroom(page); await nav(page, "任务与作业"); await page.getByRole("tab", { name: "作业", exact: true }).tap();
  await expect(page.getByPlaceholder("作业名称")).toHaveCount(0); const first = page.locator('[data-homework-student-id="s0"]'); await inViewport(page, first);
  await page.screenshot({ path: `output/playwright/mobile-workflow/${edition}-homework-390.png` });
  for (let i = 0; i < 20; i++) await page.locator(`[data-homework-student-id="s${i}"]`).tap();
  await expect.poll(async () => Object.values((await saved(page)).homeworkAssignments[0].studentStates).filter(value => (value as { status: string }).status === "submitted").length).toBe(20);
  await page.getByRole("button", { name: /筛选作业状态$/ }).tap(); await page.getByRole("option", { name: "待登记 40", exact: true }).tap(); const student = page.locator('[data-homework-student-id="s20"]'); await student.tap(); await expect(student).toBeVisible(); await student.tap();
  await expect.poll(async () => (await saved(page)).homeworkAssignments[0].studentStates.s20.status).toBe("unrecorded"); expect((await saved(page)).homeworkAssignments[0].studentStates.s21.status).toBe("unrecorded");
  await page.getByRole("button", { name: "作业操作", exact: true }).tap(); await page.getByRole("menuitem", { name: "布置作业", exact: true }).tap(); const create = page.getByRole("complementary", { name: "布置作业", exact: true }); await create.getByPlaceholder("作业名称").fill("手机未保存草稿"); await page.keyboard.press("Escape");
  await page.reload(); await nav(page, "任务与作业"); await page.getByRole("tab", { name: "作业", exact: true }).tap(); await page.getByRole("button", { name: "作业操作", exact: true }).tap(); await page.getByRole("menuitem", { name: "布置作业", exact: true }).tap(); await expect(page.getByPlaceholder("作业名称")).toHaveValue("手机未保存草稿"); await page.keyboard.press("Escape");
  expect((await saved(page)).homeworkAssignments).toHaveLength(10);
});

test("today urgency remains visible and source return restores queue surface and page position", async ({ page }) => {
  await setupClassroom(page, 430); await expect(page.getByText("已逾期", { exact: true }).first()).toBeVisible(); await expect(page.getByText("今日截止", { exact: true }).first()).toBeVisible();
  const today = page.locator("[data-today-workspace]"); await today.evaluate(element => { element.scrollTop = 200; }); const scroll = await today.evaluate(element => element.scrollTop);
  await page.getByRole("button", { name: /查看全部/ }).tap(); const queue = page.getByRole("complementary", { name: /^全部待处理/ }); await queue.getByRole("button", { name: /^合成作业10 / }).scrollIntoViewIfNeeded(); const queueScroll = await queue.locator(".tool-drawer-body").evaluate(element => element.scrollTop); await queue.getByRole("button", { name: /^合成作业10 / }).tap();
  await expect(page.getByRole("button", { name: "当前作业", exact: true })).toContainText("合成作业10"); await page.getByRole("button", { name: "返回今日待处理", exact: true }).tap();
  await expect(page.getByRole("complementary", { name: /^全部待处理/ })).toBeVisible(); expect(await today.evaluate(element => element.scrollTop)).toBe(scroll); expect(await queue.locator(".tool-drawer-body").evaluate(element => element.scrollTop)).toBe(queueScroll); await page.keyboard.press("Escape");
  await page.screenshot({ path: `output/playwright/mobile-workflow/${edition}-today-430.png` });
  await page.getByRole("button", { name: /查看全部/ }).tap(); await queue.getByRole("button", { name: /^合成作业10 / }).tap();
  await page.locator(".app-workspace-trigger").tap();
  await page.getByRole("button", { name: "删除 合成空班 2026 秋", exact: true }).tap();
  await expect(page.locator(".app-workspace-trigger")).toContainText("合成空班");
  await expect(page.getByRole("button", { name: "返回今日待处理", exact: true })).toHaveCount(0);
  const book = await page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!));
  expect(book.slices[0].data.homeworkAssignments).toHaveLength(10); expect(book.slices[1].data.students).toHaveLength(0);
});

test("touch layout has a cumulative selection path, podium/axis actions, cancel and persistent grouping", async ({ page }) => {
  await setupClassroom(page); await nav(page, "座位"); const before = (await saved(page)).seatOrder; await openSeatTool(page, "编辑布局");
  await page.getByRole("button", { name: "选择座位", exact: true }).tap();
  for (const column of [1, 2]) await page.getByRole("button", { name: `第 1 行第 ${column} 列，已启用`, exact: true }).tap();
  await expect(page.getByText("已选 2 座", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "组成小组", exact: true }).tap();
  const confirm = page.getByRole("alertdialog", { name: "覆盖现有小组？" }); await confirm.getByRole("button", { name: "取消", exact: true }).tap(); await expect(page.getByText("已选 2 座", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "组成小组", exact: true }).tap(); await confirm.getByRole("button", { name: "确认覆盖", exact: true }).tap();
  await page.screenshot({ path: `output/playwright/mobile-workflow/${edition}-layout-390.png` });
  await page.getByRole("button", { name: "应用布局", exact: true }).tap(); await expect(page.locator("[data-seat-layout-editor]")).toHaveCount(0); expect((await saved(page)).seatOrder).toEqual(before);
  await page.reload(); await nav(page, "座位"); await openSeatTool(page, "编辑布局"); await page.getByRole("button", { name: "取消", exact: true }).tap(); expect((await saved(page)).seatOrder).toEqual(before);
});

test("empty roster and landscape keep creation, footer, and date controls reachable", async ({ page }) => {
  await setupClassroom(page, 390, { students: [], seatOrder: [], homeworkAssignments: [], followupTasks: [] }); await nav(page, "座位"); await expect(page.getByText("还没有学生可以排座")).toBeVisible();
  await nav(page, "任务与作业"); await page.getByRole("tab", { name: "作业", exact: true }).tap(); await page.getByRole("button", { name: "作业操作", exact: true }).tap(); await page.getByRole("menuitem", { name: "布置作业", exact: true }).tap(); await page.setViewportSize({ width: 844, height: 390 });
  const drawer = page.getByRole("complementary", { name: "布置作业", exact: true }); await inViewport(page, drawer.getByRole("button", { name: "保存作业", exact: true }));
  await drawer.getByRole("button", { name: "作业截止日期", exact: true }).tap(); const date = page.getByRole("dialog", { name: "作业截止日期", exact: true }); await date.getByRole("button", { name: "今天", exact: true }).scrollIntoViewIfNeeded(); await inViewport(page, date.getByRole("button", { name: "今天", exact: true })); await page.keyboard.press("Escape"); await expect(drawer).toBeVisible(); await page.keyboard.press("Escape");
});

test("many exams can select the last item on a narrow screen", async ({ page }) => {
  const template = classroomData().savedExams[0]; await setupClassroom(page, 360, { savedExams: Array.from({ length: 25 }, (_, i) => ({ ...template, id: `exam-${i}`, name: `第${i + 1}场合成长名称考试` })) });
  await nav(page, "成绩"); const chart = page.locator(".grade-main-chart [data-chart-viewport]"); await chart.scrollIntoViewIfNeeded();
  const examSelect = page.getByRole("button", { name: "选择考试", exact: true }); const operations = page.getByRole("button", { name: "成绩操作", exact: true });
  const selectBox = (await examSelect.boundingBox())!, operationsBox = (await operations.boundingBox())!;
  expect(Math.abs(selectBox.y + selectBox.height / 2 - operationsBox.y - operationsBox.height / 2)).toBeLessThan(1);
  expect(await chart.evaluate(element => element.scrollWidth)).toBeGreaterThan(await chart.evaluate(element => element.clientWidth)); await nativeSwipe(page, chart); await expect.poll(() => chart.evaluate(element => element.scrollLeft)).toBeGreaterThan(100);
  await page.getByRole("button", { name: "选择考试", exact: true }).tap();
  const last = page.getByRole("option", { name: /第25场合成长名称考试/ }); await last.scrollIntoViewIfNeeded(); await inViewport(page, last); await last.tap(); await expect(page.getByRole("button", { name: "选择考试", exact: true })).toContainText("第25场合成长名称考试");
});
