import { expect, test, type Page } from "@playwright/test";

test.use({ reducedMotion: "reduce", serviceWorkers: "block", timezoneId: "Asia/Shanghai", viewport: { width: 1440, height: 900 } });
const KEY = "seat-manager-workspaces-v1";
const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
const createdAt = "2026-09-01T00:00:00Z";
const students = ["甲", "乙"].map((name, index) => ({ id: `s${index + 1}`, name, gender: "男", manualTags: [], autoTags: [], records: [], exams: [], aiComments: { profile: { generatedComment: `原评语${name}`, teacherNote: "课堂观察", style: "warm", lengthMode: "standard", targetWordCount: 120, updatedAt: createdAt } } }));
async function login(page: Page, extra: Record<string, unknown> = {}) {
  await page.addInitScript(({ key, data, time }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, currentSliceId: "a", slices: ["a", "b"].map(id => ({ id, classId: id, className: id === "a" ? "流程甲班" : "流程乙班", term: { id: `term-${id}`, year: 2026, season: "autumn", label: "2026 秋", createdAt: time }, createdAt: time, updatedAt: time, data: id === "a" ? data : { students: [], seatOrder: [] } })) }));
  }, { key: KEY, data: { students, seatOrder: ["s1", "s2", null, null, null, null, null, null], ...extra }, time: createdAt });
  await page.route("**/license/auth", route => route.fulfill({ json: { token: "test-workflow-only", expiresAt: Date.now() + 600000, licenseId: "test-workflow-only", edition } }));
  await page.goto("./"); await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-WORKFLOW");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
}
async function data(page: Page) { return page.evaluate(key => JSON.parse(localStorage.getItem(key) || "{}").slices[0].data, KEY); }
const nav = (page: Page, name: RegExp) => page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name }).click();
async function selectOption(page: Page, label: string, option: string) {
  await page.getByRole("button", { name: new RegExp(label) }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function switchClass(page: Page, name: string) {
  await page.locator(".app-workspace-trigger").click();
  await page.getByRole("button", { name: `删除 ${name} 2026 秋`, exact: true }).click();
  await expect(page.locator(".app-workspace-trigger")).toContainText(name);
}

test("opening a homework followup leaves its registration and activity unchanged", async ({ page }) => {
  const assignment = { id: "h", title: "订正", subject: "语文", assignedDate: "2026-09-28", dueDate: "2026-10-01", lifecycle: "active", participantStudentIds: ["s1", "s2"], studentStates: { s1: { status: "pending", note: "未交" } } };
  const task = { id: "t", studentId: "s1", title: "补交跟进", dueDate: "2026-10-01", status: "pending", source: "homework", sourceRef: { domain: "homework", entityId: "h", studentId: "s1" }, createdAt, updatedAt: createdAt };
  await login(page, { students: students.map(student => student.id === "s1" ? { ...student, name: "合成甲同学" } : student), homeworkAssignments: [assignment], followupTasks: [task] });
  await nav(page, /^任务与作业/); await page.getByRole("tab", { name: "作业", exact: true }).click();
  const mark = page.locator('[data-homework-student-id="s1"]');
  await expect(mark).toHaveAttribute("aria-label", /当前未交/);
  expect(await mark.locator("button").count()).toBe(0);
  await page.screenshot({ path: `/tmp/seat-manager-teacher-homework-${edition}-desktop.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  await mark.scrollIntoViewIfNeeded();
  await expect(mark).toBeVisible();
  await expect(page.getByRole("button", { name: "已有跟进", exact: true })).toBeVisible();
  expect(await mark.locator("strong").evaluate(element => element.clientWidth)).toBeGreaterThan(40);
  expect((await page.getByRole("button", { name: "已有跟进", exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `/tmp/seat-manager-teacher-homework-${edition}-mobile.png`, fullPage: true, animations: "disabled" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "已有跟进", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("补交跟进");
  expect((await data(page)).homeworkAssignments[0].studentStates.s1.status).toBe("pending");
  expect((await data(page)).activityEvents || []).toEqual([]);
  await page.reload(); expect((await data(page)).homeworkAssignments[0].studentStates.s1.status).toBe("pending");
});

for (const allBlocked of [false, true]) test(`single and batch comment saves retain retry after ${allBlocked ? "all" : "primary"} storage failure`, async ({ page }) => {
  await login(page); await nav(page, /^评语工作台/);
  const workbench = page.getByRole("region", { name: "评语工作台" });
  await workbench.getByRole("textbox", { name: "评语正文编辑器" }).fill("甲待保存的新正文");
  await page.evaluate(all => {
    const original = Storage.prototype.setItem;
    Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original; } });
    Storage.prototype.setItem = function(key, value) { if (all || key === "seat-manager-workspaces-v1") throw new DOMException("full", "QuotaExceededError"); original.call(this, key, value); };
  }, allBlocked);
  await workbench.getByRole("button", { name: "保存", exact: true }).click();
  await expect(workbench.getByText(/评语未保存成功/)).toBeVisible();
  await expect(workbench.getByRole("button", { name: /保存待确认评语 1/ })).toBeVisible();
  expect((await data(page)).students[0].aiComments.profile.generatedComment).toBe("原评语甲");
  await workbench.locator("aside").first().getByRole("button").filter({ hasText: "乙" }).click();
  await workbench.getByRole("textbox", { name: "评语正文编辑器" }).fill("乙待保存的新正文");
  await workbench.getByRole("button", { name: /保存待确认评语 2/ }).click();
  await page.getByRole("button", { name: "确认保存评语", exact: true }).click();
  await expect(workbench.getByText(/2 人未保存/)).toBeVisible();
  expect((await data(page)).students.map((student: typeof students[number]) => student.aiComments.profile.generatedComment)).toEqual(["原评语甲", "原评语乙"]);
  await page.evaluate(() => (window as Window & { restoreStorage: () => void }).restoreStorage());
  await workbench.getByRole("button", { name: /保存待确认评语 2/ }).click();
  await page.getByRole("button", { name: "确认保存评语", exact: true }).click();
  await expect.poll(async () => (await data(page)).students.map((student: typeof students[number]) => student.aiComments.profile.generatedComment)).toEqual(["甲待保存的新正文", "乙待保存的新正文"]);
  await page.reload(); await nav(page, /^评语工作台/);
  await expect(workbench.getByRole("textbox", { name: "评语正文编辑器" })).toHaveValue("甲待保存的新正文");
  await nav(page, /名单.*备份/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "备份全部班级与学期", exact: true }).click();
  const stream = await (await download).createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.workspaceBook.slices[0].data.students.map((student: typeof students[number]) => student.aiComments.profile.generatedComment)).toEqual(["甲待保存的新正文", "乙待保存的新正文"]);
});

test("class fund selection clears when the next period has only another category", async ({ page }) => {
  const now = new Date(); const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-02`;
  const last = new Date(now.getFullYear(), now.getMonth() - 1, 2); const previous = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-02`;
  const transactions = [{ id: "a", category: "A", date: month, amount: 10 }, { id: "b", category: "B", date: month, amount: 20 }, { id: "old", category: "B", date: previous, amount: 30 }].map(item => ({ ...item, type: "income", relatedStudentIds: ["s1"], note: "合成收入", createdAt, status: "active" }));
  await login(page, { fundTransactions: transactions }); await nav(page, /^班费/);
  await page.getByRole("button", { name: "登记汇总", exact: true }).click();
  await selectOption(page, "收缴分类", "A"); await page.getByRole("button", { name: "上一个周期", exact: true }).click();
  await expect(page.getByText(/统计口径：.*关联收入/)).toBeVisible();
  await expect(page.getByText("¥30.00", { exact: true }).last()).toBeVisible();
  expect((await data(page)).fundTransactions).toHaveLength(3);
});

for (const replace of [false, true]) test(`new roster waits for its own preview and mapping before ${replace ? "replace" : "append"}`, async ({ page }) => {
  await login(page); await nav(page, /名单.*备份/);
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({ name: "a.csv", mimeType: "text/csv", buffer: Buffer.from("姓名,学号\n甲,001\n") });
  await expect(page.getByText(/^已读取 1 行名单/)).toBeVisible();
  await page.evaluate(() => { const original = File.prototype.text; File.prototype.text = function() { return new Promise<string>(resolve => { Object.assign(window, { releasePreview: async () => { File.prototype.text = original; resolve(await original.call(this)); } }); }); }; });
  await input.setInputFiles({ name: "b.csv", mimeType: "text/csv", buffer: Buffer.from("学号,姓名\n002,合成新乙\n") });
  await expect(page.getByText("正在解析名单...")).toBeVisible();
  await expect(page.getByRole("button", { name: "导入名单", exact: true })).toBeDisabled();
  if (replace) await page.getByRole("checkbox", { name: "覆盖现有名单", exact: true }).check();
  await page.evaluate(() => (window as Window & { releasePreview: () => Promise<void> }).releasePreview());
  await expect(page.getByRole("button", { name: "导入名单", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "导入名单", exact: true }).click();
  if (replace) await page.getByRole("button", { name: "导出备份并覆盖", exact: true }).click();
  await expect.poll(async () => (await data(page)).students.find((student: { name: string }) => student.name === "合成新乙")?.studentNo).toBe("002");
  expect((await data(page)).students.some((student: { name: string }) => student.name === "002")).toBe(false);
  await page.reload(); expect((await data(page)).students.find((student: { name: string }) => student.name === "合成新乙").studentNo).toBe("002");
});

test("explicit waiting, locked blanks and archived IDs survive class round trips and reload", async ({ page }) => {
  await login(page, { students: [...students, { ...students[0], id: "archived", name: "归档丙", enrollmentStatus: "archived" }], seatOrder: [null, "s2", "archived", null, null, null, null, null], lockedSeats: [0] });
  await nav(page, /^座位/); await expect(page.getByRole("region", { name: "待排学生" })).toContainText("甲");
  await switchClass(page, "流程乙班"); await switchClass(page, "流程甲班");
  expect((await data(page)).seatOrder).toEqual([null, "s2", null, null, null, null, null, null]);
  expect((await data(page)).lockedSeats).toEqual([0]);
  await page.reload(); await nav(page, /^座位/);
  await expect(page.getByRole("region", { name: "待排学生" })).toContainText("甲");
  expect((await data(page)).seatOrder).toEqual([null, "s2", null, null, null, null, null, null]);
});

for (const returned of [false, true]) test(`leave note edits preserve the original period ${returned ? "after" : "before"} return`, async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-30T10:00:00+08:00"));
  await login(page, { attendanceRecords: [{ id: "leave", studentId: "s1", date: "2026-09-28", status: "leave", late: false, earlyLeave: false, note: "原说明", leaveStart: "2026-09-28T08:00", leaveEnd: "2026-09-29T18:00", leaveTracking: true, leaveReturnedAt: returned ? "2026-09-29T00:00" : undefined, createdAt, updatedAt: createdAt }] });
  await nav(page, /^出勤/);
  await page.getByRole("button", { name: "出勤日期", exact: true }).click();
  await page.getByRole("dialog", { name: "出勤日期" }).getByRole("button", { name: returned ? "2026-09-28" : "2026-09-29", exact: true }).click();
  await page.getByRole("group", { name: "出勤登记视图", exact: true }).getByRole("button", { name: "详细", exact: true }).click();
  const row = page.locator('[data-attendance-student-id="s1"]:not(.app-motion-overlay *)');
  await row.getByRole("button", { name: "编辑 甲 详情", exact: true }).click();
  await row.getByPlaceholder("备注", { exact: true }).fill("补写的真实说明");
  await expect.poll(async () => (await data(page)).attendanceRecords[0].note).toBe("补写的真实说明");
  expect((await data(page)).attendanceRecords).toHaveLength(1);
  if (!returned) await row.getByRole("button", { name: "确认 2026-09-29 已返校", exact: true }).click();
  await expect.poll(async () => (await data(page)).attendanceRecords[0].leaveReturnedAt).toBe("2026-09-29T00:00");
  await page.reload(); await nav(page, /^出勤/);
  await expect(row).toContainText("正常");
  expect((await data(page)).attendanceRecords).toHaveLength(1);
  await page.getByRole("button", { name: "导出出勤", exact: true }).click();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: /导出当日/ }).click();
  const stream = await (await download).createReadStream(); const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString().split("\n").slice(1).join("\n")).not.toContain("请假");
});

test("Sunday timetable aliases save completely and unknown populated columns keep the old schedule", async ({ page }) => {
  await login(page); await nav(page, /^今日/); await page.getByRole("button", { name: "管理课表", exact: true }).click();
  const input = page.locator('input[type="file"]').first();
  await input.setInputFiles({ name: "schedule.csv", mimeType: "text/csv", buffer: Buffer.from("节次,星期一,星期天\n第一节,语文,数学\n") });
  await expect.poll(async () => (await data(page)).schedule?.entries?.map((entry: { weekday: number; subject: string }) => [entry.weekday, entry.subject])).toEqual([[1, "语文"], [7, "数学"]]);
  const before = (await data(page)).schedule;
  await input.setInputFiles({ name: "unknown.csv", mimeType: "text/csv", buffer: Buffer.from("节次,周一,未知日\n第一节,英语,物理\n") });
  await expect(page.getByText(/未替换原课表/)).toBeVisible();
  expect((await data(page)).schedule).toEqual(before);
  await page.reload(); expect((await data(page)).schedule).toEqual(before);
});

async function uploadScore(page: Page, filename: string, csv: string) {
  await page.locator('input[type="file"]').first().setInputFiles({ name: filename, mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByRole("dialog", { name: "自动补全班级排名？" }).getByRole("button", { name: "保留原表", exact: true }).click();
}
test("discarded score mappings never replace the accepted mapping on save, reload and edit", async ({ page }) => {
  await login(page); await nav(page, /^成绩/); await uploadScore(page, "原考试.csv", "姓名,语文,数学\n甲,90,60\n乙,80,70\n");
  await page.getByRole("button", { name: /^映射设置/ }).click();
  await selectOption(page, "第 2 列「语文」用途", "数学 · 成绩");
  await selectOption(page, "第 3 列「数学」用途", "语文 · 成绩");
  await page.getByRole("button", { name: "先不应用", exact: true }).click();
  await page.getByRole("button", { name: "保存考试", exact: true }).click();
  await expect.poll(async () => (await data(page)).savedExams?.[0]?.entries?.[0]?.scores?.语文?.score).toBe(90);
  expect((await data(page)).savedExams[0].importSource.mapping.subjectMappings.find((item: { subject: string }) => item.subject === "语文").scoreCol).toBe(1);
  await page.reload(); await nav(page, /^成绩/);
  await page.getByRole("button", { name: "编辑考试", exact: true }).click();
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  await expect.poll(async () => (await data(page)).savedExams[0].entries[0].scores.语文.score).toBe(90);
});

for (const kind of ["成绩", "名单"]) for (const transition of kind === "成绩" ? ["file", "edit", "cancel"] : ["file", "cancel"]) test(`late AI ${kind} mapping is discarded after ${transition}`, async ({ page }) => {
  const mapping = { headers: ["姓名", "数学", "语文"], nameCol: 0, studentNoCol: -1, subjectMappings: [{ subject: "数学", scoreCol: 1, rawScoreCol: -1, assignedScoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 }, { subject: "语文", scoreCol: 2, rawScoreCol: -1, assignedScoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 }], totalMapping: { scoreCol: -1, rawScoreCol: -1, assignedScoreCol: -1, rankClassCol: -1, rankSchoolCol: -1 }, warnings: [] };
  const saved = { id: "b", name: "另一个考试", date: "2026-09-29", savedAt: createdAt, studentCount: 1, subjectCount: 2, subjects: ["数学", "语文"], rankConfig: { autoClassRank: false, scoreBasis: "effective" }, entries: [{ studentId: "s1", name: "甲", scores: { 数学: { score: 70 }, 语文: { score: 95 } }, total: { score: 165 } }], importSource: { filename: "b.csv", rows: [["姓名", "数学", "语文"], ["甲", "70", "95"]], mapping } };
  await login(page, transition === "edit" ? { savedExams: [saved] } : {}); await nav(page, kind === "成绩" ? /^成绩/ : /名单.*备份/);
  if (kind === "成绩") await uploadScore(page, "a.csv", "姓名,语文,数学\n甲,90,60\n");
  else { await page.locator('input[type="file"]').first().setInputFiles({ name: "a.csv", mimeType: "text/csv", buffer: Buffer.from("姓名,学号\n合成甲,001\n") }); await expect(page.getByText(/^已读取 1 行名单/)).toBeVisible(); }
  await page.getByRole("button", { name: /^映射设置/ }).click();
  // Synthetic delayed service deliberately ignores abort so the UI must also reject stale results.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (...args) => /suggest-(score|roster)-mapping/.test(String(args[0])) ? new Promise<Response>(resolve => { Object.assign(window, { releaseMapping: () => resolve(new Response(JSON.stringify({ nameCol: 0, studentNoCol: 1, subjectMappings: [{ subject: "语文", scoreCol: 1 }, { subject: "数学", scoreCol: 2 }], note: "旧文件的建议" }), { status: 200, headers: { "Content-Type": "application/json" } })) }); }) : original(...args);
  });
  await page.getByRole("button", { name: "AI 识别", exact: true }).click();
  await expect(page.getByText(/AI 正在识别/)).toBeVisible();
  await page.keyboard.press("Escape");
  if (transition === "edit") await page.getByRole("button", { name: "编辑考试", exact: true }).click();
  if (transition === "file" && kind === "成绩") await uploadScore(page, "b.csv", "姓名,数学,语文\n甲,70,95\n");
  else if (transition === "file") { await page.locator('input[type="file"]').first().setInputFiles({ name: "b.csv", mimeType: "text/csv", buffer: Buffer.from("学号,姓名\n002,合成新乙\n") }); await expect(page.getByText(/^已读取 1 行名单/)).toBeVisible(); }
  await page.evaluate(() => (window as Window & { releaseMapping: () => void }).releaseMapping());
  await expect(page.getByRole("dialog", { name: `${kind}列映射` })).toBeHidden();
  if (kind === "成绩") { await page.getByRole("button", { name: transition === "edit" ? "保存修改" : "保存考试", exact: true }).click(); await expect.poll(async () => (await data(page)).savedExams[0].entries[0].scores.语文.score).toBe(transition === "cancel" ? 90 : 95); }
  else { await page.getByRole("button", { name: "导入名单", exact: true }).click(); await expect.poll(async () => (await data(page)).students.find((student: { name: string }) => student.name === (transition === "file" ? "合成新乙" : "合成甲"))?.studentNo).toBe(transition === "file" ? "002" : "001"); }
});

test("event 201 and its linked personal record can be undone without losing the oldest event", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-30T10:00:00+08:00"));
  const events = Array.from({ length: 200 }, (_, index) => ({ id: `e${index}`, dormId: "d", type: "punish", score: -1, reason: `历史记录${index}`, note: "", date: "2026-09-30", responsibleStudentIds: ["s1"], createdAt }));
  const records = events.map(event => ({ id: `record-${event.id}-s1`, type: "punish", note: `宿舍扣分：${event.reason}（影响 101）`, date: event.date }));
  await login(page, { students: [{ ...students[0], dormitoryId: "d", records }, students[1]], dormitories: [{ id: "d", name: "101", memberIds: ["s1"], baseScore: 0, currentScore: -200, periodStart: "2026-09-01", history: [], events }] });
  await nav(page, /^宿舍/);
  await page.getByRole("button", { name: /卫生优秀/ }).first().click();
  await page.getByRole("button", { name: /责任人（可选/ }).click();
  await page.locator('button[data-selection-motion-id="s1"]:not(.app-motion-overlay *)').click();
  await page.getByRole("button", { name: "保存事件", exact: true }).click();
  await expect.poll(async () => (await data(page)).dormitories[0].events.length).toBe(201);
  await expect.poll(async () => (await data(page)).students[0].records.length).toBe(201);
  await page.getByRole("button", { name: "撤销", exact: true }).click();
  await expect.poll(async () => (await data(page)).dormitories[0].events.length).toBe(200);
  expect((await data(page)).dormitories[0].events.map((event: { id: string }) => event.id)).toEqual(events.map(event => event.id));
  expect((await data(page)).students[0].records).toEqual(records);
  await page.reload(); expect((await data(page)).dormitories[0].events).toHaveLength(200);
});

for (const score of [2, 0, -2]) test(`dormitory correction to ${score} updates the linked personal evidence after reload`, async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-30T10:00:00+08:00"));
  const event = { id: "event", dormId: "d", type: "punish", score: -2, reason: "误登记", note: "旧说明", date: "2026-09-30", responsibleStudentIds: ["s1"], createdAt };
  await login(page, { students: [{ ...students[0], dormitoryId: "d", records: [{ id: "record-event-s1", type: "punish", note: "宿舍扣分：误登记（影响 101） · 旧说明", date: event.date }] }, students[1]], dormitories: [{ id: "d", name: "101", memberIds: ["s1"], baseScore: 0, currentScore: -2, periodStart: "2026-09-01", history: [], events: [event] }] });
  await nav(page, /^宿舍/); await page.getByRole("button", { name: "编辑宿舍事件：误登记", exact: true }).click();
  const row = page.locator('[data-dormitory-event-id="event"]:not(.app-motion-overlay *)');
  await row.getByPlaceholder("原因", { exact: true }).fill("核实后更正");
  await row.getByPlaceholder("备注", { exact: true }).fill("最新说明");
  await row.getByRole("textbox", { name: "修改分值", exact: true }).fill(String(score));
  await row.getByRole("button", { name: "保存宿舍事件修改", exact: true }).click();
  await expect.poll(async () => (await data(page)).students[0].records[0].type).toBe(score > 0 ? "reward" : score < 0 ? "punish" : "note");
  await expect.poll(async () => (await data(page)).students[0].records[0].note).toContain("核实后更正");
  const saved = (await data(page)).students[0].records[0];
  expect(saved.note).toContain("核实后更正"); expect(saved.note).toContain("最新说明"); expect(saved.note).not.toContain("误登记");
  await page.reload(); expect((await data(page)).students[0].records[0]).toEqual(saved);
});

for (const [entered, expected] of [[30, 50], [400, 300]]) test(`custom comment length ${entered} is constrained to supported ${expected} for single and batch requests`, async ({ page }) => {
  const targets: number[] = [];
  await login(page);
  await page.route("**/generate-comment", route => { targets.push(route.request().postDataJSON().targetWordCount); return route.fulfill({ json: { comment: "合成评语，仅用于本地测试。" } }); });
  await nav(page, /^评语工作台/);
  const workbench = page.getByRole("region", { name: "评语工作台" });
  await workbench.getByRole("button", { name: /生成设置/ }).click();
  await workbench.getByRole("button", { name: "自定义评语字数", exact: true }).click();
  const count = workbench.getByRole("spinbutton", { name: "自定义字数", exact: true });
  await count.fill(String(entered)); await count.press("Tab"); await expect(count).toHaveValue(String(expected));
  await workbench.getByRole("button", { name: "重新生成", exact: true }).click();
  await expect.poll(() => targets).toEqual([expected]);
  await expect(workbench.getByRole("textbox", { name: "评语正文编辑器" })).toHaveValue("合成评语，仅用于本地测试。");
  await workbench.getByRole("group", { name: "评语处理模式" }).getByRole("button", { name: "批量", exact: true }).click();
  await workbench.getByRole("checkbox", { name: "选择 甲 用于批量生成", exact: true }).check();
  await workbench.getByRole("button", { name: "生成 1 人", exact: true }).last().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "重新生成", exact: true }).click();
  await expect.poll(() => targets).toEqual([expected, expected]);
  expect((await data(page)).students[0].aiComments.profile.generatedComment).toBe("原评语甲");
});

test("moving a student into waiting is saved through an actual drag, reload and class round trip", async ({ page }) => {
  await login(page); await nav(page, /^座位/);
  await page.getByRole("button", { name: "展开等待区", exact: true }).click();
  await expect(page.getByRole("button", { name: "收起等待区", exact: true })).toBeVisible();
  const source = page.locator('[data-student-id="s1"]:not(.app-motion-overlay *)');
  const dock = page.getByRole("region", { name: "待排学生" });
  const sourceBox = await source.boundingBox(); const dockBox = await dock.boundingBox();
  expect(sourceBox).not.toBeNull(); expect(dockBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2); await page.mouse.down();
  await page.mouse.move(dockBox!.x + dockBox!.width / 2, dockBox!.y + dockBox!.height / 2, { steps: 8 });
  await expect(page.locator("[data-drag-student-id]")).toBeVisible();
  await page.mouse.up();
  await expect(dock.getByRole("button", { name: /等待学生 甲/ })).toBeVisible();
  await expect.poll(async () => (await data(page)).seatOrder[0]).toBeNull();
  await page.reload(); await nav(page, /^座位/); await expect(dock).toContainText("甲");
  await switchClass(page, "流程乙班"); await switchClass(page, "流程甲班");
  expect((await data(page)).seatOrder[0]).toBeNull(); await expect(dock).toContainText("甲");
});

test("student detail uses the same word range and keeps a failed comment save pending", async ({ page }) => {
  await login(page); await nav(page, /^座位/); await page.locator('[data-student-id="s1"]:not(.app-motion-overlay *)').click();
  const dialog = page.getByRole("dialog", { name: /甲/ });
  await dialog.getByRole("tab", { name: "AI 评语", exact: true }).click();
  await dialog.getByRole("button", { name: /素材|生成设置/ }).click();
  await dialog.getByRole("group", { name: "评语字数目标", exact: true }).getByRole("button", { name: "自定义", exact: true }).click();
  const count = dialog.getByRole("spinbutton", { name: "自定义评语字数", exact: true });
  await count.fill(""); await count.pressSequentially("230"); await count.press("Tab"); await expect(count).toHaveValue("230");
  await count.fill("400"); await count.press("Tab"); await expect(count).toHaveValue("300");
  const editor = dialog.getByPlaceholder("生成后可在这里继续编辑评语草稿。", { exact: true });
  await editor.fill("详情页待保存正文");
  await page.evaluate(() => { const original = Storage.prototype.setItem; Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original; } }); Storage.prototype.setItem = function(key, value) { if (key === "seat-manager-workspaces-v1") throw new DOMException("full", "QuotaExceededError"); original.call(this, key, value); }; });
  await dialog.getByRole("button", { name: "保存评语草稿", exact: true }).click();
  await expect(dialog.getByText(/评语未保存成功/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "保存评语草稿", exact: true })).toBeEnabled();
  expect((await data(page)).students[0].aiComments.profile.generatedComment).toBe("原评语甲");
  await page.evaluate(() => (window as Window & { restoreStorage: () => void }).restoreStorage());
  await dialog.getByRole("button", { name: "保存评语草稿", exact: true }).click();
  await expect.poll(async () => (await data(page)).students[0].aiComments.profile.generatedComment).toBe("详情页待保存正文");
});
