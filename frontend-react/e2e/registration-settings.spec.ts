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
  await expect.poll(async () => (await data(page)).settings?.followupTypes).toEqual(["常规跟进", "阅读反馈"]);
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

test("cross-day leave remains visible until the teacher confirms return", async ({ page }) => {
  await login(page); await nav(page, /^出勤/);
  await page.getByRole("group", { name: "出勤登记视图", exact: true }).getByRole("button", { name: "详细", exact: true }).click();
  const student = page.locator('[data-attendance-student-id="s1"]');
  await student.getByRole("button", { name: "编辑 张三 详情" }).click();
  await page.getByRole("button", { name: "预计返校日期" }).click();
  await page.getByRole("dialog", { name: "预计返校日期" }).getByRole("button", { name: "2026-09-24" }).click();
  await student.getByRole("button", { name: "保存请假时段" }).click();
  await expect.poll(async () => (await data(page)).attendanceRecords.find((record: { studentId: string; date: string }) => record.studentId === "s1" && record.date === "2026-09-22")?.leaveEnd).toBe("2026-09-24T18:00");
  await page.getByRole("button", { name: "出勤日期" }).click();
  await page.getByRole("dialog", { name: "出勤日期" }).getByRole("button", { name: "2026-09-25" }).click();
  await expect(student).toContainText("待确认返校");
  await student.getByRole("button", { name: "确认 2026-09-25 已返校" }).click();
  await expect(student).toContainText("正常");
  await expect.poll(async () => (await data(page)).attendanceRecords.find((record: { studentId: string; date: string }) => record.studentId === "s1" && record.date === "2026-09-22")?.leaveReturnedAt).toBe("2026-09-25T00:00");
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


test("creating and deleting the final dormitory animate the list and detail in place", async ({ page }) => {
  await login(page); await nav(page, /^宿舍/);
  await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
  const list = page.locator(".dormitory-list-motion");
  await expect(list.getByText("暂无宿舍")).toBeVisible();
  await expect(page.locator(".vt-dorm-detail")).toHaveCount(1);
  await page.evaluate(() => {
    const state = window as typeof window & { __dormTransitions?: number; __dormListAnimations?: string[]; __dormDetailFlights?: number[] };
    state.__dormTransitions = 0;
    state.__dormListAnimations = [];
    state.__dormDetailFlights = [];
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((update) => {
      state.__dormTransitions! += 1;
      const transition = start(update);
      void transition.ready.then(() => {
        state.__dormDetailFlights!.push(document.getAnimations().filter(animation =>
          (animation.effect as KeyframeEffect | null)?.pseudoElement?.includes("vt-dorm-detail"),
        ).length);
      });
      return transition;
    }) as typeof document.startViewTransition;
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this instanceof HTMLElement && this.closest(".dormitory-list-motion")) {
        state.__dormListAnimations!.push(this.textContent?.trim() || "");
      }
      return animate.apply(this, args);
    };
  });
  await page.getByPlaceholder("新宿舍名称").fill("101 室");
  await expect(page.getByPlaceholder("新宿舍名称")).toHaveValue("101 室");
  await expect(page.getByRole("button", { name: "新增宿舍" })).toBeEnabled();
  await page.getByRole("button", { name: "新增宿舍" }).click();
  await expect(page.getByRole("heading", { name: "101 室" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __dormTransitions?: number }).__dormTransitions)).toBe(1);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __dormDetailFlights?: number[] }).__dormDetailFlights?.[0])).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __dormListAnimations?: string[] }).__dormListAnimations?.some(label => label.includes("101 室")))).toBe(true);
  await expect.poll(async () => (await data(page)).dormitories.length).toBe(1);

  await page.getByTitle("删除宿舍", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "确认删除宿舍", exact: true }).click();
  await expect(page.getByText("请先选择或创建一个宿舍", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __dormTransitions?: number }).__dormTransitions)).toBe(2);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __dormListAnimations?: string[] }).__dormListAnimations?.some(label => label.includes("暂无宿舍")))).toBe(true);
  await expect.poll(async () => (await data(page)).dormitories.length).toBe(0);

  await page.getByRole("status").getByRole("button", { name: "撤销" }).click();
  await expect(page.getByRole("heading", { name: "101 室" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __dormTransitions?: number }).__dormTransitions)).toBe(3);
  await expect.poll(async () => (await data(page)).dormitories.length).toBe(1);

  await page.getByPlaceholder("新宿舍名称").fill("102 室");
  await page.getByRole("button", { name: "新增宿舍" }).click();
  await expect(page.getByRole("heading", { name: "102 室" })).toBeVisible();
  await page.evaluate(() => { (window as typeof window & { __dormListAnimations?: string[] }).__dormListAnimations = []; });
  await page.getByTitle("删除宿舍", { exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "确认删除宿舍", exact: true }).click();
  await expect(page.getByRole("heading", { name: "101 室" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __dormTransitions?: number }).__dormTransitions)).toBe(5);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __dormListAnimations?: string[] }).__dormListAnimations?.some(label => label.includes("102 室")))).toBe(true);
  await expect.poll(async () => (await data(page)).dormitories.length).toBe(1);
});

test("switching dormitories keeps the AI launcher above the transition", async ({ page }) => {
  await login(page, true);
  await page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    const slice = book.slices.find((item: { id: string }) => item.id === book.currentSliceId);
    slice.data.dormitories.push({ ...slice.data.dormitories[0], id: "d2", name: "第二间宿舍" });
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify(book));
  });
  await page.reload(); await nav(page, /^宿舍/);
  await page.locator(".dormitory-list-motion").getByRole("button", { name: /第二间宿舍/ }).click();
  await expect(page.getByRole("heading", { name: "第二间宿舍" })).toBeVisible();
  await page.evaluate(() => {
    const state = window as typeof window & { __aiTransitionLayer?: { name: string; zIndex: string; animations: number } };
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = ((update) => {
      const transition = start(update);
      void transition.ready.then(() => {
        state.__aiTransitionLayer = {
          name: getComputedStyle(document.getElementById("ai-assistant-launcher")!).viewTransitionName,
          zIndex: getComputedStyle(document.documentElement, "::view-transition-group(vt-ai-launcher)").zIndex,
          animations: document.getAnimations().filter(animation => (animation.effect as KeyframeEffect | null)?.pseudoElement?.includes("vt-dorm-detail")).length,
        };
      });
      return transition;
    }) as typeof document.startViewTransition;
  });
  await page.locator(".dormitory-list-motion").getByRole("button", { name: /最后一间宿舍/ }).click();
  await expect(page.getByRole("heading", { name: "最后一间宿舍" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __aiTransitionLayer?: { name: string; zIndex: string; animations: number } }).__aiTransitionLayer?.name)).toBe("vt-ai-launcher");
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __aiTransitionLayer?: { name: string; zIndex: string; animations: number } }).__aiTransitionLayer?.zIndex)).toBe("100");
  expect(await page.evaluate(() => (window as typeof window & { __aiTransitionLayer?: { name: string; zIndex: string; animations: number } }).__aiTransitionLayer?.animations)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "打开 AI 助手" })).toBeVisible();
});

test("dormitory names can be edited in place without replacing their data", async ({ page }) => {
  await login(page, true); await nav(page, /^宿舍/);
  const original = (await data(page)).dormitories[0];
  const shell = page.locator(".app-inline-name-editor");
  const viewWidth = (await shell.boundingBox())!.width;
  await shell.evaluate(element => { element.dataset.motionProbe = "same-element"; });
  await page.getByRole("button", { name: "重命名宿舍" }).click();
  const name = page.getByRole("textbox", { name: "宿舍名称", exact: true });
  await expect(name).toBeFocused();
  await expect(shell).toHaveAttribute("data-motion-probe", "same-element");
  await expect.poll(async () => (await shell.boundingBox())!.width).toBeGreaterThan(viewWidth + 15);
  await name.fill("101 室");
  await page.getByRole("button", { name: "取消改名" }).click();
  await expect(shell).toHaveAttribute("data-motion-probe", "same-element");
  await expect.poll(async () => (await shell.boundingBox())!.width).toBeLessThan(viewWidth + 5);
  await expect(page.getByRole("heading", { name: "最后一间宿舍" })).toBeVisible();
  await page.getByRole("button", { name: "重命名宿舍" }).click();
  await name.fill("101 室");
  await name.press("Enter");
  await expect(page.getByRole("heading", { name: "101 室" })).toBeVisible();
  await expect.poll(async () => { const dormitory = (await data(page)).dormitories[0]; return { id: dormitory.id, memberIds: dormitory.memberIds, events: dormitory.events, history: dormitory.history, name: dormitory.name }; }).toEqual({ id: original.id, memberIds: original.memberIds, events: original.events, history: original.history, name: "101 室" });
  await page.reload(); await nav(page, /^宿舍/);
  await expect(page.getByRole("heading", { name: "101 室" })).toBeVisible();
  await page.getByPlaceholder("新宿舍名称").fill("102 室");
  await page.getByRole("button", { name: "新增宿舍" }).click();
  await page.getByRole("button", { name: "重命名宿舍" }).click();
  await name.fill("101 室");
  await page.getByRole("button", { name: "保存宿舍名称" }).click();
  await expect(page.getByRole("alert").getByText("已有同名宿舍")).toBeVisible();
  await expect.poll(async () => (await data(page)).dormitories.map((dormitory: { name: string }) => dormitory.name)).toEqual(["102 室", "101 室"]);
});

test("dormitory and fund editors morph in their original list rows", async ({ page }) => {
  await login(page, true);
  await page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
    const slice = book.slices.find((item: { id: string }) => item.id === book.currentSliceId);
    slice.data.dormitories[0].events = [{ id: "dorm-event-1", dormId: "d1", type: "reward", score: 2, reason: "卫生优秀", note: "", date: "2026-09-22", createdAt: "2026-09-22T00:00:00Z" }];
    slice.data.fundTransactions = [{ id: "fund-1", type: "income", amount: 12, category: "活动费", note: "", date: "2026-09-22", createdAt: "2026-09-22T00:00:00Z", status: "active" }];
    slice.data.savedExams = [{ id: "exam-1", name: "期中考试", date: "2026-09-22", savedAt: "2026-09-22T00:00:00Z", studentCount: 1, subjectCount: 1, subjects: ["数学"], entries: [{ studentId: "s1", name: "张三", scores: { 数学: { score: 90 } }, total: { score: 90 } }], importSource: { filename: "score.csv", rows: [["姓名", "数学"], ["张三", "90"]], mapping: { headers: ["姓名", "数学"], nameCol: 0, studentNoCol: -1, subjectMappings: [{ subject: "数学", scoreCol: 1, rawScoreCol: -1, assignedScoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 }], totalMapping: { scoreCol: -1, rawScoreCol: -1, assignedScoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 }, warnings: [] } } }];
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify(book));
  });
  await page.reload(); await nav(page, /^宿舍/);
  const dormRow = page.locator(".dorm-event-edit-morph:not(.app-motion-snapshot)");
  await dormRow.evaluate(element => { element.dataset.motionProbe = "dorm"; });
  await page.getByRole("button", { name: "编辑宿舍事件：卫生优秀" }).click();
  await expect(dormRow).toHaveAttribute("data-motion-probe", "dorm");
  await expect(dormRow).toHaveAttribute("data-moving", "true");
  await page.getByRole("button", { name: "取消宿舍事件修改" }).click();
  await expect(dormRow).toHaveAttribute("data-motion-probe", "dorm");
  await expect(dormRow).toHaveAttribute("data-moving", "true");

  await nav(page, /^班费/);
  const fundRow = page.locator(".fund-transaction-edit-morph:not(.app-motion-snapshot)");
  await fundRow.evaluate(element => { element.dataset.motionProbe = "fund"; });
  await page.getByRole("button", { name: "编辑流水：活动费" }).click();
  await expect(fundRow).toHaveAttribute("data-motion-probe", "fund");
  await expect(fundRow).toHaveAttribute("data-moving", "true");
  await fundRow.getByRole("button", { name: "取消" }).click();
  await expect(fundRow).toHaveAttribute("data-motion-probe", "fund");
  await expect(fundRow).toHaveAttribute("data-moving", "true");


});

test("student profile fields morph in place and retain save and cancel semantics", async ({ page }) => {
  await login(page); await nav(page, /^座位/);
  await page.locator('[data-student-id="s1"]').click();
  const dialog = page.getByRole("dialog", { name: "张三学生详情" });
  await dialog.getByRole("tab", { name: "档案" }).click();
  const profile = dialog.locator(".student-profile-sheet");
  const name = dialog.getByRole("textbox", { name: "姓名" });
  const phone = dialog.getByRole("textbox", { name: "家长电话" });
  await expect(profile).toHaveAttribute("data-editing", "false");
  await expect(dialog.getByRole("region", { name: "基本资料" })).toBeVisible();
  await expect(dialog.getByRole("region", { name: "联系与住宿" })).toBeVisible();
  await expect(name).toBeDisabled();
  await name.evaluate(element => { element.dataset.motionProbe = "same-field"; });
  const animated = await dialog.getByRole("button", { name: "编辑资料", exact: true }).evaluate(button => new Promise<boolean>(resolve => {
    (button as HTMLButtonElement).click();
    requestAnimationFrame(() => resolve(Boolean(document.querySelector('.student-profile-input')?.getAnimations().some(animation => animation.playState === "running"))));
  }));
  expect(animated).toBe(true);
  await expect(profile).toHaveAttribute("data-editing", "true");
  await expect(name).toHaveAttribute("data-motion-probe", "same-field");
  await expect(name).toBeFocused();
  await name.fill("尚未保存的姓名");
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(profile).toHaveAttribute("data-editing", "false");
  await expect(name).toHaveValue("张三");
  await expect(name).toBeDisabled();
  await dialog.getByRole("button", { name: "编辑资料", exact: true }).click();
  await phone.fill("13800000000");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(profile).toHaveAttribute("data-editing", "false");
  await expect(phone).toHaveValue("13800000000");
  await expect.poll(async () => (await data(page)).students.find((item: { id: string }) => item.id === "s1")?.parentPhone).toBe("13800000000");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await dialog.getByRole("button", { name: "编辑资料", exact: true }).click();
  await expect(name).toBeEnabled();
  expect(await name.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThan(0.001);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "编辑资料", exact: true })).toBeVisible();
  const bounds = await profile.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
});

test("seat snapshot rename morphs on the same title surface", async ({ page }) => {
  await login(page); await nav(page, /^历史/);
  await page.getByRole("button", { name: "座位快照" }).click();
  await page.getByPlaceholder("记录名称，例如：期中后调整").fill("旧快照");
  await page.getByRole("button", { name: "保存座位" }).click();
  await page.getByRole("button", { name: "关闭历史座位详情" }).click();
  const editor = page.locator(".app-inline-name-editor");
  await expect(editor).toBeVisible();
  await editor.evaluate(element => { element.dataset.motionProbe = "snapshot"; });
  await page.getByRole("button", { name: "重命名座位快照" }).click();
  await expect(editor).toHaveAttribute("data-motion-probe", "snapshot");
  await expect(editor).toHaveAttribute("data-editing", "true");
  await expect(editor.locator("input")).toBeFocused();
  await editor.locator("input").fill("新快照");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(editor).toHaveAttribute("data-motion-probe", "snapshot");
  await expect(editor).toHaveAttribute("data-editing", "false");
  await expect(editor).toContainText("新快照");
  await page.getByRole("button", { name: "重命名座位快照" }).click();
  await editor.locator("input").fill("放弃的名称");
  await page.getByRole("button", { name: "取消重命名" }).click();
  await expect(editor).toContainText("新快照");
  await page.getByRole("button", { name: "班级动态" }).click();
  await page.getByRole("button", { name: "自定义" }).click();
  await expect(page.getByRole("button", { name: "开始日期" })).toBeVisible();
  await page.getByRole("button", { name: "近 30 天" }).click();
  await expect(page.getByRole("button", { name: "开始日期" })).toBeHidden();
});
