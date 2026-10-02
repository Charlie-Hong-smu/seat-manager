import { expect, type Page, type Locator } from "@playwright/test";
const createdAt = "2026-10-01T00:00:00Z";
export const mobileStudents = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, name: i === 0 || i === 59 ? `合成长姓名测试同学${i ? "乙" : "甲"}` : `合成学生${i + 1}`, gender: i % 2 ? "女" : "男", manualTags: [], autoTags: [], records: [], exams: [] }));
const subjects = ["语文", "数学", "英语", "物理", "化学", "生物", "历史", "政治", "信息技术"];
const cell = (score: number) => ({ score, rankClass: null, rankSchool: null });
export function classroomData() {
  const today = new Date().toLocaleDateString("sv-SE");
  return { students: mobileStudents, seatOrder: [...mobileStudents.slice(0, 48).map(student => student.id), ...Array<null>(16).fill(null)], lockedSeats: [1],
    fundTransactions: [{ id: "f1", date: today, type: "income", amount: 123.45, category: "合成班费", note: "测试", relatedStudentIds: ["s0"], createdAt, status: "active" }],
    savedExams: [{ id: "ex1", name: "合成手机长名称考试一", date: today, savedAt: createdAt, studentCount: 60, subjectCount: subjects.length, subjects, entries: mobileStudents.map((student, i) => ({ name: student.name, studentId: student.id, scores: Object.fromEntries(subjects.map((subject, j) => [subject, cell(60 + (i + j) % 40)])), total: cell(600) })) }],
    homeworkAssignments: Array.from({ length: 10 }, (_, i) => ({ id: `h${i}`, title: `合成作业${i + 1}`, subject: "数学", assignedDate: today, dueDate: i === 0 ? "2020-01-01" : today, note: "", createdAt, updatedAt: createdAt, lifecycle: "active", participantStudentIds: mobileStudents.map(student => student.id), studentStates: Object.fromEntries(mobileStudents.map(student => [student.id, { status: "unrecorded", note: "", updatedAt: createdAt }])) })),
    followupTasks: [{ id: "t1", studentId: "s0", title: "合成逾期跟进", type: "常规跟进", description: "保留来源", plannedDate: "2020-01-01", dueDate: "2020-01-02", status: "pending", createdAt, updatedAt: createdAt }],
    quickRecordPresets: [{ id: "p1", label: "主动回答", type: "reward", note: "主动回答课堂问题", enabled: true, order: 0 }],
  };
}
export async function setupClassroom(page: Page, width = 390, extra: Record<string, unknown> = {}) {
  await page.setViewportSize({ width, height: width > 1000 ? 900 : 844 });
  await page.addInitScript(({ data, createdAt }) => {
    if (localStorage.getItem("seat-manager-workspaces-v1")) return;
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify({ version: 1, currentSliceId: "mobile", slices: ["mobile", "empty"].map(id => ({ id, classId: id, className: id === "mobile" ? "合成手机测试班" : "合成空班", term: { id: `term-${id}`, year: 2026, season: "autumn", label: "2026 秋", createdAt }, createdAt, updatedAt: createdAt, data: id === "mobile" ? data : { students: [], seatOrder: [] } })) }));
  }, { data: { ...classroomData(), ...extra }, createdAt });
  await page.route("**/license/auth", route => route.fulfill({ json: { token: "test-only-classroom", expiresAt: Date.now() + 600000, licenseId: "test-only-classroom", edition: process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang" } }));
  await page.goto("./");
  if (await page.getByRole("button", { name: "进入本地预览", exact: true }).isVisible()) await page.getByRole("button", { name: "进入本地预览", exact: true }).click();
  else { await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-CLASSROOM"); await page.getByRole("button", { name: "进入工作台", exact: true }).click(); }
  await expect(page.getByRole("heading", { name: "今日班务" })).toBeVisible();
}
export async function classroomNav(page: Page, name: string) {
  if (await page.getByRole("button", { name: "展开侧栏", exact: true }).isVisible() && (page.viewportSize()!.width < 768 || page.viewportSize()!.height <= 500)) await page.getByRole("button", { name: "展开侧栏", exact: true }).click();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
}
export const classroomSaved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!).slices[0].data);
export async function inViewport(page: Page, locator: Locator) {
  // Mobile viewport changes settle after the resize event and React's layout update.
  await expect.poll(async () => {
    const box = await locator.boundingBox(), viewport = page.viewportSize()!;
    return Boolean(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
  }).toBe(true);
  const box = await locator.boundingBox(); expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
}
export async function nativeSwipe(page: Page, locator: Locator, axis: "x" | "y" = "x") {
  const box = (await locator.boundingBox())!;
  const cdp = await page.context().newCDPSession(page);
  const x = box.x + (axis === "x" ? box.width - 25 : box.width / 2), y = box.y + (axis === "y" ? box.height - 25 : box.height / 2);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - (axis === "x" ? i * 24 : 0), y: y - (axis === "y" ? i * 24 : 0) }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  // Chromium continues kinetic scrolling after touchEnd; measure the settled region.
  await locator.evaluate(element => new Promise<void>(resolve => {
    let left = element.scrollLeft, top = element.scrollTop, stable = 0, frames = 0;
    const sample = () => {
      stable = left === element.scrollLeft && top === element.scrollTop ? stable + 1 : 0;
      left = element.scrollLeft; top = element.scrollTop;
      if (stable >= 5 || ++frames >= 180) resolve(); else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
}
