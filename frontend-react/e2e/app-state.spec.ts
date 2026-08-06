import { expect, test } from "@playwright/test";
import { Buffer } from "node:buffer";

import { seedContextPreviewRecords } from "./contextPreviewFixture";

async function login(page: import("@playwright/test").Page) {
  await page.route("**/license/auth", async route => {
    const body = route.request().postDataJSON() as { edition?: string };
    expect(body.edition).toBe("zhang");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "e2e-zhang-token", expiresAt: Date.now() + 60_000, licenseId: "e2e-zhang", edition: "zhang" }),
    });
  });
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ZHANG-CODE");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByRole("button", { name: "今日" })).toBeVisible();
  await page.getByRole("button", { name: "座位", exact: true }).click();
  await expect(page.getByRole("button", { name: /新增学生/ })).toBeVisible();
}

test("license login and student edits survive a reload", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: /新增学生/ }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("测试学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await expect(page.getByRole("button", { name: /测试学生/ }).last()).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "座位", exact: true }).click();
  await expect(page.getByRole("button", { name: /测试学生/ }).last()).toBeVisible();
  const storedBook = await page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "null"));
  expect(storedBook.slices[0].data.students.some((student: { name: string }) => student.name === "测试学生")).toBe(true);
});

test("quick-record undo preserves archived students", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /新增学生/ }).click();
  for (const name of ["快捷记录学生", "归档保留学生"]) {
    await page.getByPlaceholder("姓名", { exact: true }).fill(name);
    await page.getByRole("button", { name: "添加到班级" }).click();
  }
  await page.getByRole("button", { name: "关闭工具面板" }).last().click();
  await page.getByText("归档保留学生", { exact: true }).click();
  const studentDialog = page.getByRole("dialog", { name: "归档保留学生学生详情" });
  await studentDialog.getByRole("button", { name: "移出当前班级" }).click();
  await page.getByRole("button", { name: "确认移出班级" }).click();

  await page.getByLabel("主导航").getByRole("button", { name: "今日", exact: true }).click();
  await page.getByRole("button", { name: "快捷记录", exact: true }).click();
  await page.getByRole("button", { name: /记录学生/ }).click();
  await page.getByRole("button", { name: /快捷记录学生/ }).click();
  await page.getByPlaceholder("记录客观事实").fill("完成课堂练习");
  await page.getByRole("button", { name: "保存到 1 名学生" }).click();
  const toast = page.getByRole("status").filter({ hasText: "快捷记录已保存" });
  await toast.getByRole("button", { name: "撤销" }).click();

  await expect.poll(() => page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "null");
    const current = book?.slices?.find((slice: { id: string }) => slice.id === book.currentSliceId);
    const archived = current?.data?.students?.find((student: { name: string }) => student.name === "归档保留学生");
    return archived?.enrollmentStatus;
  })).toBe("archived");
});

test("custom round-table layout persists and keeps overflow students waiting", async ({ page }) => {
  await login(page);

  await page.getByRole("button", { name: /新增学生/ }).click();
  for (const name of ["布局学生甲", "布局学生乙", "布局学生丙"]) {
    await page.getByPlaceholder("姓名", { exact: true }).fill(name);
    await page.getByRole("button", { name: "添加到班级" }).click();
  }
  await page.getByRole("button", { name: "关闭工具面板" }).last().click();

  await page.getByRole("button", { name: "排座", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "排座" });
  await dialog.getByRole("button", { name: "布局设计" }).click();
  await dialog.getByRole("button", { name: "座位布局模板" }).click();
  await page.getByRole("option", { name: "围桌布局" }).click();
  await dialog.getByRole("spinbutton", { name: "桌数" }).fill("1");
  await dialog.getByRole("spinbutton", { name: "每桌人数" }).fill("2");
  await dialog.getByRole("button", { name: "生成布局草稿" }).click();
  await dialog.getByRole("button", { name: "应用布局" }).click();
  await dialog.getByRole("button", { name: "关闭排座设置" }).click();

  await expect(page.getByRole("region", { name: "待排学生" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "null");
    const current = book?.slices?.find((slice: { id: string }) => slice.id === book.currentSliceId);
    return current?.data?.settings?.seatLayout?.template;
  })).toBe("round-table");

  await page.reload();
  await page.getByRole("button", { name: "座位", exact: true }).click();
  await expect(page.getByRole("region", { name: "待排学生" })).toBeVisible();
  await expect(page.getByText("第 1 组", { exact: true })).toBeVisible();
});

test("corrupt local workspace stays untouched until an explicit recovery", async ({ page }) => {
  const corruptRaw = "{broken-workspace";
  await page.addInitScript(raw => localStorage.setItem("seat-manager-workspaces-v1", raw), corruptRaw);
  await page.route("**/license/auth", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "e2e-recovery-token", expiresAt: Date.now() + 60_000, licenseId: "e2e-recovery", edition: "zhang" }) }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-RECOVERY-CODE");
  await page.getByRole("button", { name: "进入" }).click();
  await expect(page.getByRole("heading", { name: "检测到本机工作区数据异常" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"))).toBe(corruptRaw);

  await page.locator('input[type="file"]').setInputFiles({
    name: "valid-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, data: { students: [], seatOrder: [] } })),
  });
  await page.getByRole("button", { name: "确认恢复" }).click();
  await expect(page.getByRole("button", { name: "今日" })).toBeVisible();
  await page.getByRole("button", { name: "座位", exact: true }).click();
  await expect(page.getByRole("button", { name: /新增学生/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"))).not.toBe(corruptRaw);
});

test("preloads the comment workbench and keeps its full-screen background stable", async ({ page }) => {
  await login(page);
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType("resource").some((entry) => entry.name.includes("CommentWorkbench-")))).toBe(true);

  await page.getByRole("button", { name: "评语工作台" }).click();
  const dialog = page.getByRole("dialog", { name: "评语工作台" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("data-transition-state", "open");
  await expect(page.getByPlaceholder("AI 授权码")).toHaveCount(0);
  const shellStyle = await dialog.evaluate((element) => ({
    animationName: getComputedStyle(element).animationName,
    animationDuration: getComputedStyle(element).animationDuration,
    opacity: getComputedStyle(element).opacity,
  }));
  expect(shellStyle).toEqual({ animationName: "comment-workbench-panel-enter", animationDuration: "0.44s", opacity: "1" });
  const contentStyle = await dialog.locator(":scope > .comment-workbench-enter-item").first().evaluate((element) => ({
    animationName: getComputedStyle(element).animationName,
    opacity: getComputedStyle(element).opacity,
  }));
  expect(contentStyle).toEqual({ animationName: "none", opacity: "1" });
  await dialog.getByRole("button", { name: "关闭评语工作台" }).click();
  await expect(dialog).toHaveAttribute("data-transition-state", "closing");
  await expect(dialog).toBeHidden();
});

test("opens student detail from the current comment avatar without a separate detail button", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /新增学生/ }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("头像详情学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("详情下一位学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await page.getByRole("button", { name: "评语工作台" }).click();

  const workbench = page.getByRole("dialog", { name: "评语工作台" });
  await expect(workbench.getByRole("button", { name: "查看 头像详情学生 的学生详情" })).toBeVisible();
  await expect(workbench.getByRole("button", { name: "查看详情", exact: true })).toHaveCount(0);
  await workbench.getByRole("button", { name: "查看 头像详情学生 的学生详情" }).click();
  const closeStudentDetail = page.getByRole("button", { name: "关闭学生详情" });
  await expect(workbench).toBeVisible();
  await expect(closeStudentDetail).toBeVisible();
  const currentStudentDialog = page.getByRole("dialog", { name: "头像详情学生学生详情" });
  for (const label of ["AI跟进", "AI评语", "移出当前班级"]) {
    const action = currentStudentDialog.getByRole("button", { name: label, exact: true });
    const layout = await action.evaluate(element => ({
      whiteSpace: getComputedStyle(element).whiteSpace,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(layout.whiteSpace).toBe("nowrap");
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight);
  }
  const followupTab = currentStudentDialog.getByRole("tab", { name: "建议与沟通" });
  await followupTab.click();
  await expect(followupTab).toHaveAttribute("aria-selected", "true");
  await currentStudentDialog.getByRole("button", { name: "下一位学生", exact: true }).click();
  const nextStudentDialog = page.getByRole("dialog", { name: "详情下一位学生学生详情" });
  await expect(nextStudentDialog).toBeVisible();
  await expect(nextStudentDialog.getByRole("tab", { name: "建议与沟通" })).toHaveAttribute("aria-selected", "true");
  await nextStudentDialog.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("dialog", { name: "头像详情学生学生详情" })).toBeVisible();
  const layers = await page.evaluate(() => {
    const workbenchDialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="评语工作台"]');
    const closeButton = document.querySelector<HTMLElement>('button[aria-label="关闭学生详情"]');
    const detailOverlay = closeButton?.closest<HTMLElement>('.fixed.inset-0');
    if (!workbenchDialog || !detailOverlay) return null;
    const panel = closeButton?.closest<HTMLElement>('.modal-panel-enter');
    const rect = panel?.getBoundingClientRect();
    const topElement = rect ? document.elementFromPoint(rect.left + rect.width / 2, rect.top + 12) : null;
    return {
      workbench: Number(getComputedStyle(workbenchDialog).zIndex),
      detail: Number(getComputedStyle(detailOverlay).zIndex),
      detailIsTopmost: Boolean(topElement && detailOverlay.contains(topElement)),
    };
  });
  expect(layers).not.toBeNull();
  expect(layers!.detail).toBeGreaterThan(layers!.workbench);
  expect(layers!.detailIsTopmost).toBe(true);
  await closeStudentDetail.click();
  await expect(workbench).toBeVisible();
});

test("previews attention and timeline records inline without interrupting comment work", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await page.getByRole("button", { name: /新增学生/ }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("上下文预览学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await page.getByRole("button", { name: "关闭工具面板" }).last().click();
  await seedContextPreviewRecords(page, "上下文预览学生");
  await page.reload();
  await page.getByRole("button", { name: "评语工作台" }).click();

  const workbench = page.getByRole("dialog", { name: "评语工作台" });
  await workbench.getByRole("button", { name: /上下文预览学生/ }).first().click();
  const commentEditor = workbench.getByRole("textbox", { name: "评语正文编辑器" });
  await commentEditor.fill("这段评语草稿必须保留。");
  await workbench.getByRole("button", { name: "查看 上下文预览学生 的学生详情" }).click();
  await page.getByRole("tab", { name: "建议与沟通" }).click();

  const dialogCount = await page.getByRole("dialog").count();
  const taskA = page.getByRole("button", { name: "上下文任务甲事项速览", exact: true });
  const taskB = page.getByRole("button", { name: "上下文任务乙事项速览", exact: true });
  await taskA.focus();
  await page.keyboard.press("Enter");
  const taskAPreview = page.getByRole("region", { name: "上下文任务甲事项速览" });
  await expect(taskAPreview).toBeVisible();
  await expect(taskA).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("dialog")).toHaveCount(dialogCount);
  await expect(workbench).toBeVisible();
  await expect(page.getByRole("button", { name: "关闭学生详情" })).toBeVisible();
  await page.setViewportSize({ width: 520, height: 800 });
  const narrowBox = await taskAPreview.boundingBox();
  expect(narrowBox).not.toBeNull();
  expect(narrowBox!.x).toBeGreaterThanOrEqual(0);
  expect(narrowBox!.x + narrowBox!.width).toBeLessThanOrEqual(520);
  await page.setViewportSize({ width: 1280, height: 720 });

  await taskB.click();
  await expect(page.getByRole("region", { name: "上下文任务甲事项速览" })).toHaveCount(0);
  const taskBPreview = page.getByRole("region", { name: "上下文任务乙事项速览" });
  await expect(taskBPreview).toBeVisible();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  expect(await taskBPreview.evaluate(element => getComputedStyle(element).transitionDuration)).toContain("0.26s");
  await taskB.click();
  await expect(taskBPreview).toHaveAttribute("data-phase", "closing");
  await expect(page.getByRole("region", { name: "上下文任务乙事项速览" })).toHaveCount(0);

  await page.getByRole("button", { name: "创建上下文任务甲事项速览", exact: true }).click();
  await expect(page.getByRole("region", { name: "上下文任务甲事项速览" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(dialogCount);
  await page.getByRole("button", { name: "关闭学生详情" }).click();
  await expect(workbench).toBeVisible();
  await expect(commentEditor).toHaveValue("这段评语草稿必须保留。");

  await workbench.getByRole("button", { name: "查看 上下文预览学生 的学生详情" }).click();
  await page.getByRole("tab", { name: "建议与沟通" }).click();
  await page.getByRole("button", { name: "上下文任务甲事项速览", exact: true }).click();
  await page.getByRole("button", { name: "前往任务工作区（离开评语工作台）" }).click();
  await expect(workbench).toBeHidden();
  await expect(page.getByRole("button", { name: "关闭学生详情" })).toHaveCount(0);
  await expect(page.locator('[data-followup-task-id="context-task-a"]')).toBeVisible();
});

test("AI followup actions use clear labels, center confirmation, and close student detail before task editing", async ({ page }) => {
  await page.route("**/student-followup", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      summary: "近期学习状态稳定，需要继续关注数学基础。",
      riskSignals: ["数学基础仍需巩固"],
      strengths: ["语文表现稳定"],
      actions: ["与数学老师沟通近期课堂表现"],
      parentMessageDraft: "家长您好，建议近期共同关注数学基础练习。",
      commentMaterials: ["学习态度认真，愿意持续改进"],
      disclaimer: "AI 跟进建议仅供教师参考。",
    }),
  }));
  await login(page);

  await page.getByRole("button", { name: /新增学生/ }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("跟进测试学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await page.getByRole("button", { name: "关闭工具面板" }).last().click();
  await page.locator('[data-student-id]').filter({ hasText: "跟进测试学生" }).click();
  await page.getByRole("button", { name: "AI跟进" }).click();
  await page.getByRole("button", { name: "生成", exact: true }).click();

  await expect(page.getByRole("button", { name: "存入学生记录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "加入评语补充说明" })).toBeVisible();
  await page.getByRole("button", { name: "转为待办任务" }).click();

  const confirmation = page.getByRole("alertdialog", { name: "转为待办任务？" });
  await expect(confirmation).toBeVisible();
  await confirmation.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  const box = await confirmation.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(Math.abs((box!.x + box!.width / 2) - viewport!.width / 2)).toBeLessThan(2);
  expect(Math.abs((box!.y + box!.height / 2) - viewport!.height / 2)).toBeLessThan(2);

  await confirmation.getByRole("button", { name: "继续填写" }).click();
  await expect(page.getByRole("button", { name: "关闭学生详情" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "创建跟进任务" })).toBeVisible();
});

test("weekly communication surfaces keep only AI polish and copy actions", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /新增学生/ }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("周沟通测试学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await page.getByRole("button", { name: "关闭工具面板" }).last().click();
  await page.locator('[data-student-id]').filter({ hasText: "周沟通测试学生" }).click();
  await page.getByRole("button", { name: "AI跟进" }).click();
  await page.getByRole("tab", { name: "周沟通稿" }).click();

  const studentPolish = page.getByRole("button", { name: "AI 润色" });
  await expect(studentPolish).toBeVisible();
  await expect.poll(() => studentPolish.evaluate(button => ({
    background: getComputedStyle(button).backgroundColor,
    aiToken: getComputedStyle(document.documentElement).getPropertyValue("--app-ai").trim(),
    alignment: getComputedStyle(button.parentElement!).justifyContent,
  }))).toEqual({ background: "rgb(124, 58, 237)", aiToken: "#7c3aed", alignment: "center" });
  await expect(page.getByRole("button", { name: "复制", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /保存沟通稿|标记已分享|创建后续家校沟通任务/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "分享渠道" })).toHaveCount(0);
  await page.getByRole("button", { name: "关闭学生详情" }).click();

  await page.getByRole("button", { name: "今日", exact: true }).click();
  await page.getByRole("button", { name: "本周复盘" }).click();
  const weeklyDrawer = page.getByRole("complementary", { name: "本周班级复盘" });
  const classPolish = weeklyDrawer.getByRole("button", { name: "AI 润色" });
  await expect(classPolish).toBeVisible();
  await expect.poll(() => classPolish.evaluate(button => ({
    background: getComputedStyle(button).backgroundColor,
    alignment: getComputedStyle(button.parentElement!).justifyContent,
  }))).toEqual({ background: "rgb(124, 58, 237)", alignment: "center" });
  await expect(weeklyDrawer.getByRole("button", { name: "复制", exact: true })).toBeVisible();
  await expect(weeklyDrawer.getByRole("button", { name: "保存草稿" })).toHaveCount(0);
});

test("selected comment text is refined only after teacher confirmation", async ({ page }) => {
  await page.route("**/refine-comment", async route => {
    expect(route.request().postDataJSON()).toMatchObject({
      action: "polish",
      selectedText: "她能清楚说明解题过程",
    });
    await new Promise(resolve => setTimeout(resolve, 900));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ replacement: "她能够条理清晰地说明解题思路" }),
    });
  });
  await login(page);
  await page.getByRole("button", { name: /新增学生/ }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill("选区测试学生");
  await page.getByRole("button", { name: "添加到班级" }).click();
  await page.getByRole("button", { name: "评语工作台" }).click();
  const dialog = page.getByRole("dialog", { name: "评语工作台" });
  const editor = dialog.getByRole("textbox", { name: "评语正文编辑器" });
  const contextLines = Array.from({ length: 20 }, (_, index) => `第 ${index + 1} 条课堂观察：能够按要求完成当天任务。`).join("\n");
  const original = `${contextLines}\n在数学学习中，她能清楚说明解题过程，也愿意尝试不同方法。`;
  await editor.fill(original);
  await expect.poll(async () => page.evaluate(() => {
    const key = Object.keys(localStorage).find(item => item.startsWith("seat-manager-ai-comment-draft:"));
    return key ? JSON.parse(localStorage.getItem(key) || "{}").generatedComment : "";
  })).toBe(original);
  await dialog.getByRole("button", { name: "关闭评语工作台" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "评语工作台" }).click();
  await expect(editor).toHaveValue(original);
  await editor.evaluate((element, selectedText) => {
    const textarea = element as HTMLTextAreaElement;
    const start = textarea.value.indexOf(selectedText);
    textarea.focus();
    textarea.setSelectionRange(start, start + selectedText.length);
    textarea.scrollTop = textarea.scrollHeight;
    textarea.dispatchEvent(new Event("select", { bubbles: true }));
    document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
  }, "她能清楚说明解题过程");

  await dialog.getByRole("button", { name: "优化表达", exact: true }).click();
  const glassBar = dialog.locator(".selection-ai-glass-inline");
  await expect(glassBar).toBeVisible();
  await expect(dialog.getByRole("status", { name: "正在优化选中文字" })).toContainText("在数学学习中，她能清楚说明解题过程，也愿意尝试不同方法。");
  const initialGlassY = (await glassBar.boundingBox())?.y || 0;
  const scrollDelta = await glassBar.evaluate(element => {
    const scroller = element.parentElement?.parentElement;
    if (!scroller) throw new Error("comment editor scroller is missing");
    const initialScrollTop = scroller.scrollTop;
    [18, 42, 20, 64, 56].forEach(offset => {
      scroller.scrollTop = Math.max(0, initialScrollTop - offset);
      scroller.dispatchEvent(new Event("scroll"));
    });
    return initialScrollTop - scroller.scrollTop;
  });
  const scrolledGlassY = (await glassBar.boundingBox())?.y || 0;
  expect(Math.abs(scrolledGlassY - initialGlassY - scrollDelta)).toBeLessThan(3);
  await expect(dialog.getByText("正在优化选中文字", { exact: true })).toHaveCount(0);
  const applyAiChange = dialog.getByRole("button", { name: "应用 AI 修改" });
  await expect(applyAiChange).toBeVisible();
  await expect(dialog.getByRole("region", { name: "AI 局部修改建议" })).toHaveCount(0);
  await expect(dialog.getByText(/选中文字后可使用/)).toHaveCount(0);
  await expect(dialog.getByRole("status", { name: "AI 修订预览" })).toContainText("在数学学习中，她能清楚说明解题过程她能够条理清晰地说明解题思路，也愿意尝试不同方法。");
  await expect(dialog.locator(".selection-ai-inline-old")).toHaveText("她能清楚说明解题过程");
  await expect(dialog.locator(".selection-ai-inline-new")).toHaveText("她能够条理清晰地说明解题思路");
  await expect(dialog.locator(".selection-ai-inline-old")).toHaveCSS("text-decoration-line", "line-through");
  await page.waitForTimeout(600);
  await expect(applyAiChange).toBeVisible();
  await expect(dialog.locator(".selection-ai-inline-old")).toHaveCSS("text-decoration-line", "line-through");
  expect(await page.evaluate(() => {
    const key = Object.keys(localStorage).find(item => item.startsWith("seat-manager-ai-comment-draft:"));
    return key ? JSON.parse(localStorage.getItem(key) || "{}").generatedComment : "";
  })).toBe(original);

  await applyAiChange.click();
  const refined = original.replace("她能清楚说明解题过程", "她能够条理清晰地说明解题思路");
  await expect(dialog.getByRole("textbox", { name: "评语正文编辑器" })).toHaveValue(refined);
  expect(await page.evaluate(() => {
    const key = Object.keys(localStorage).find(item => item.startsWith("seat-manager-ai-comment-draft:"));
    return key ? JSON.parse(localStorage.getItem(key) || "{}").generatedComment : "";
  })).toBe(refined);

  await dialog.getByTitle("保存").click();
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith("seat-manager-ai-comment-draft:")))).toBe(true);
});

test("global AI companion keeps one workspace conversation across pages and small screens", async ({ page }) => {
  let assistantCalls = 0;
  await page.route("**/chat-assistant", async route => {
    assistantCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        message: "这是基于当前班级摘要生成的测试建议。",
        disclaimer: "请由教师结合实际情况确认后使用。",
        suggestedPrompts: ["还可以关注哪些学生？"],
      }),
    });
  });
  await login(page);

  const mainNavigation = page.getByRole("navigation", { name: "主导航" });
  await expect(mainNavigation.getByRole("button", { name: "AI 助手", exact: true })).toHaveCount(0);
  const launcher = page.getByRole("button", { name: "打开 AI 助手", exact: true });
  await expect(launcher).toBeVisible();
  await launcher.click();

  const companion = page.getByRole("dialog", { name: "AI助手浮窗" });
  await expect(companion).toBeVisible();
  await expect(companion).toHaveAttribute("aria-modal", "false");
  await expect(companion.getByText("当前上下文 · 座位", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("输入 AI 授权码")).toHaveCount(0);
  expect(assistantCalls).toBe(0);

  const composer = companion.getByPlaceholder("输入问题，Enter 发送，Shift+Enter 换行");
  await composer.fill("请给我一条测试建议");
  await companion.getByRole("button", { name: "发送", exact: true }).click();
  await expect(companion.getByText("这是基于当前班级摘要生成的测试建议。", { exact: true })).toBeVisible();
  expect(assistantCalls).toBe(1);

  await companion.getByRole("button", { name: "关闭AI助手", exact: true }).click();
  await expect(companion).toBeHidden();
  await expect(launcher).toBeFocused();
  await page.getByRole("button", { name: /^成绩/ }).click();
  await launcher.click();
  await expect(companion.getByText("当前上下文 · 成绩", { exact: true })).toBeVisible();
  await expect(companion.getByText("这是基于当前班级摘要生成的测试建议。", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(companion).toBeHidden();
  await expect(launcher).toBeFocused();

  await page.setViewportSize({ width: 480, height: 800 });
  await launcher.click();
  await expect(companion).toBeVisible();
  await expect(companion).toHaveAttribute("data-transition-state", "open");
  const companionBox = await companion.boundingBox();
  expect(companionBox).not.toBeNull();
  expect(companionBox!.x).toBeLessThanOrEqual(8);
  expect(companionBox!.width).toBeGreaterThanOrEqual(464);
  expect(companionBox!.x + companionBox!.width).toBeLessThanOrEqual(480);
});

test("dormitory periods, custom settings and event dates work together", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /^宿舍/ }).click();

  await expect(page.getByRole("group", { name: "宿舍统计周期" })).toBeVisible();
  await expect(page.getByRole("button", { name: "宿舍统计日期" })).toBeVisible();
  await expect(page.getByRole("button", { name: "批量结算" })).toHaveCount(0);
  await expect(page.getByText("当前结算分")).toHaveCount(0);

  const dormName = page.getByPlaceholder("新宿舍名称");
  await dormName.fill("E2E 301");
  await dormName.locator("..").getByRole("button").click();
  await page.getByRole("button", { name: /卫生优秀/ }).click();
  await expect(page.getByRole("button", { name: "宿舍事件发生日期" })).toBeVisible();
  await page.getByRole("button", { name: "保存事件" }).click();
  const savedToast = page.getByRole("status").filter({ hasText: "宿舍事件已保存" });
  await expect(savedToast).toBeVisible();
  await expect(page.getByRole("button", { name: "保存事件" })).toBeHidden();
  await expect(page.getByRole("button", { name: /卫生优秀/ }).first()).toHaveAttribute("aria-pressed", "false");
  await savedToast.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByText("所选周期暂无事件")).toBeVisible();
  await page.getByRole("button", { name: /卫生优秀/ }).first().click();
  await page.getByRole("button", { name: "保存事件" }).click();
  await expect(page.getByText("卫生优秀", { exact: true }).last()).toBeVisible();
  const secondSavedToast = page.getByRole("status").filter({ hasText: "宿舍事件已保存" });
  await secondSavedToast.getByRole("button", { name: "关闭提示" }).click();
  await expect(secondSavedToast).toHaveAttribute("data-phase", "closing");
  await expect(secondSavedToast).toBeHidden();

  const periodGroup = page.getByRole("group", { name: "宿舍统计周期" });
  const settingsEntry = page.getByTestId("dormitory-period-settings-entry");
  const settingsButton = page.getByRole("button", { name: "设置自定义周期" });
  await expect(settingsButton).toBeHidden();
  await periodGroup.getByRole("button", { name: "自定义周期" }).click();
  await expect(settingsButton).toBeVisible();
  await expect.poll(() => settingsEntry.evaluate(element => getComputedStyle(element).opacity)).toBe("1");
  expect(await settingsEntry.evaluate(element => getComputedStyle(element).transitionDuration)).toContain("0.3s");
  await settingsButton.click();
  await periodGroup.getByRole("button", { name: "本周" }).click();
  await expect(settingsButton).toBeHidden();
  await periodGroup.getByRole("button", { name: "自定义周期" }).click();
  await settingsButton.click();
  await page.getByText("每 N 个单位").locator("..").getByRole("spinbutton").fill("3");
  await page.getByRole("button", { name: "保存周期" }).click();
  await expect(periodGroup.getByRole("button", { name: "自定义周期" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "null");
    return book?.slices?.find((slice: { id: string }) => slice.id === book.currentSliceId)?.data?.settings?.dormitoryPeriod?.intervalCount;
  })).toBe(3);
});

test("attendance quick registration keeps student order and detailed tools", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /新增学生/ }).click();
  for (const name of ["出勤学生甲", "出勤学生乙", "出勤学生丙"]) {
    await page.getByPlaceholder("姓名", { exact: true }).fill(name);
    await page.getByRole("button", { name: "添加到班级" }).click();
  }
  await page.getByRole("button", { name: "关闭工具面板" }).last().click();
  await page.getByRole("button", { name: "出勤", exact: true }).click();

  const viewGroup = page.getByRole("group", { name: "出勤登记视图" });
  await expect(viewGroup.getByRole("button", { name: "快速" })).toHaveAttribute("aria-pressed", "true");
  const studentCards = page.locator("[data-attendance-student-id]");
  const initialOrder = await studentCards.evaluateAll(elements => elements.map(element => element.getAttribute("data-attendance-student-id")));

  await expect(page.getByText("默认正常", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /出勤学生甲当前正常，点击设为请假/ }).click();
  await expect(page.locator('p[aria-live="polite"]').filter({ hasText: "出勤学生甲 已设为请假" })).toHaveText("出勤学生甲 已设为请假");
  await expect(page.getByRole("button", { name: /出勤学生甲当前请假，点击设为请假/ })).toBeVisible();
  expect(await studentCards.evaluateAll(elements => elements.map(element => element.getAttribute("data-attendance-student-id")))).toEqual(initialOrder);

  await page.getByRole("group", { name: "快速出勤状态" }).getByRole("button", { name: "迟到" }).click();
  await page.getByRole("button", { name: /出勤学生乙当前正常，点击设为迟到/ }).click();
  await expect(page.locator('p[aria-live="polite"]').filter({ hasText: "出勤学生乙 已设为迟到" })).toHaveText("出勤学生乙 已设为迟到");
  expect(await studentCards.evaluateAll(elements => elements.map(element => element.getAttribute("data-attendance-student-id")))).toEqual(initialOrder);

  await viewGroup.getByRole("button", { name: "详细" }).click();
  await expect(page.getByRole("checkbox", { name: "选择 出勤学生甲" })).toBeVisible();
  await expect(page.getByRole("button", { name: "编辑 出勤学生甲 详情" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "null");
    const current = book?.slices?.find((slice: { id: string }) => slice.id === book.currentSliceId);
    const attendance = current?.data?.attendanceRecords || [];
    return attendance.map((item: { status: string; late?: boolean }) => ({ status: item.status, late: Boolean(item.late) }));
  })).toEqual(expect.arrayContaining([{ status: "leave", late: false }, { status: "normal", late: true }]));
});

test("creates a class-level followup without a student and supports undo", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /^任务与作业/ }).click();

  await expect(page.getByText("不指定学生")).toBeVisible();
  await page.getByPlaceholder("跟进事项，例如：确认处罚执行情况").fill("准备下周班会材料");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();

  await expect(page.getByText("准备下周班会材料", { exact: true })).toBeVisible();
  await expect(page.getByText(/班级事项 · 截止/)).toBeVisible();
  const toast = page.getByRole("status").filter({ hasText: "跟进任务已创建" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "撤销" }).click();
  await expect(page.getByText("准备下周班会材料", { exact: true })).toHaveCount(0);
});

test("today completion uses the shared result workflow", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /^任务与作业/ }).click();
  await page.getByPlaceholder("跟进事项，例如：确认处罚执行情况").fill("今日完成链路测试");
  await page.getByRole("button", { name: "创建任务", exact: true }).click();
  await page.getByLabel("主导航").getByRole("button", { name: "今日", exact: true }).click();
  await page.getByRole("button", { name: "完成跟进：今日完成链路测试" }).click();
  const resultDrawer = page.getByRole("complementary", { name: "补充处理结果" });
  await expect(resultDrawer).toBeVisible();
  await resultDrawer.getByPlaceholder(/例如：已与家长沟通/).fill("已完成当日处理");
  await resultDrawer.getByRole("button", { name: "保存结果" }).click();
  await page.getByRole("button", { name: /^任务与作业/ }).click();
  await page.getByRole("group", { name: "任务筛选" }).getByRole("button", { name: "已完成" }).click();
  await expect(page.getByText("处理结果：已完成当日处理")).toBeVisible();
});

test("today workspace routes into homework and persists the teacher ledger", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: /新增学生/ }).click();
  for (const name of ["作业学生甲", "作业学生乙"]) {
    await page.getByPlaceholder("姓名", { exact: true }).fill(name);
    await page.getByRole("button", { name: "添加到班级" }).click();
  }
  await page.getByRole("button", { name: "关闭工具面板" }).last().click();
  await page.getByRole("button", { name: "今日", exact: true }).click();
  await expect(page.getByText("今日班务", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "布置作业", exact: true }).click();
  await expect(page.getByRole("tab", { name: "作业", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByPlaceholder("作业名称").fill("E2E 今日作业");
  await page.getByRole("button", { name: "作业学科" }).click();
  await page.getByRole("option", { name: "数学", exact: true }).click();
  await page.getByRole("button", { name: "保存作业", exact: true }).click();
  await expect(page.getByText("E2E 今日作业", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "待登记 2", exact: true })).toBeVisible();
  const studentOrderBefore = await page.locator("[data-homework-student-id]").evaluateAll(elements => elements.map(element => element.querySelector("strong")?.textContent));
  await page.getByRole("button", { name: "作业学生甲当前待登记，点击设为已交", exact: true }).click();
  await expect(page.getByRole("button", { name: "作业学生甲当前已交，点击设为已交", exact: true })).toBeVisible();
  const registrationToast = page.getByRole("status").filter({ hasText: "作业学生甲 已设为已交" });
  await expect(registrationToast).toBeVisible();
  await expect(registrationToast.getByRole("button", { name: "撤销" })).toBeVisible();
  const studentOrderAfter = await page.locator("[data-homework-student-id]").evaluateAll(elements => elements.map(element => element.querySelector("strong")?.textContent));
  expect(studentOrderAfter).toEqual(studentOrderBefore);

  await page.getByRole("group", { name: "快速登记状态" }).getByRole("button", { name: "未交" }).click();
  await page.getByRole("button", { name: "作业学生乙当前待登记，点击设为未交", exact: true }).click();
  await page.getByRole("button", { name: "为未交 1 人建跟进" }).click();
  await page.getByRole("tab", { name: "待办", exact: true }).click();
  const linkedTask = page.locator("article").filter({ hasText: "跟进作业：E2E 今日作业" });
  await expect(linkedTask.getByRole("button", { name: "打开作业来源" })).toBeVisible();
  await linkedTask.getByRole("button", { name: "完成任务" }).click();
  await expect(page.getByRole("heading", { name: "同步作业状态？" })).toBeVisible();
  await page.getByRole("button", { name: "同步为已交" }).click();
  await expect(linkedTask.getByText("处理结果（可选）")).toBeVisible();
  await page.getByRole("tab", { name: "作业", exact: true }).click();
  await expect(page.getByRole("button", { name: "作业学生乙当前已交，点击设为已交", exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /^任务与作业/ }).click();
  await page.getByRole("tab", { name: "作业", exact: true }).click();
  await expect(page.getByText("E2E 今日作业", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "待登记 0", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "已交 2", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^历史/ }).click();
  const timelineCard = page.locator(".history-timeline-card");
  const measureTimelineLayout = () => timelineCard.evaluate(card => {
    const [header, body] = Array.from(card.children) as HTMLElement[];
    return { headerHeight: header.offsetHeight, bodyOffset: body.offsetTop };
  });
  const before = await measureTimelineLayout();
  await page.getByRole("group", { name: "事件类型" }).getByRole("button", { name: "作业", exact: true }).click();
  await expect(page.getByRole("button", { name: "清除筛选", exact: true }).first()).toBeVisible();
  const after = await measureTimelineLayout();
  expect(after.headerHeight).toBe(before.headerHeight);
  expect(after.bodyOffset).toBe(before.bodyOffset);
});

test("roster, exam, cloud sync and workspace switching keep data isolated", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page);

  await page.getByRole("button", { name: /名单 \/ 备份/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "roster.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("姓名,性别\n甲同学,男\n乙同学,女"),
  });
  await expect(page.getByText(/已读取 2 行名单/)).toBeVisible();
  await page.getByRole("button", { name: "导入名单" }).click();
  await expect(page.getByRole("status").filter({ hasText: "导入完成：新增 2 名，当前在班 2 名学生" })).toBeVisible();

  await page.getByRole("button", { name: /^成绩/ }).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: "scores.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("姓名,语文,数学\n甲同学,90,95\n乙同学,88,92"),
  });
  await page.getByPlaceholder("考试名称").fill("E2E 期中测试");
  await page.getByRole("button", { name: "保存考试" }).click();
  await expect(page.getByText("E2E 期中测试", { exact: true }).first()).toBeVisible();

  const scoreManagementToggle = page.getByRole("button", { name: "收起成绩管理" });
  const scoreOverviewTab = page.getByRole("tab", { name: "成绩概览" });
  const [toggleBox, overviewTabBox] = await Promise.all([
    scoreManagementToggle.boundingBox(),
    scoreOverviewTab.boundingBox(),
  ]);
  expect(toggleBox).not.toBeNull();
  expect(overviewTabBox).not.toBeNull();
  expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(overviewTabBox!.x);

  await page.getByRole("tab", { name: "题目分析" }).click();
  await expect(page.getByRole("heading", { name: "题目分析怎么用" })).toBeHidden();
  await page.getByRole("button", { name: "题目分析使用说明" }).click();
  await expect(page.getByRole("heading", { name: "题目分析怎么用" })).toBeVisible();
  await expect(page.getByText(/只有学科总分时无法生成/)).toBeVisible();
  await scoreManagementToggle.click();
  await expect(page.getByRole("button", { name: "展开成绩管理" })).toBeVisible();
  await page.getByRole("button", { name: "展开成绩管理" }).click();
  await scoreOverviewTab.click();

  await page.getByRole("button", { name: "云同步" }).click();
  const syncHeading = page.getByRole("heading", { name: "云端备份与恢复" });
  await expect(syncHeading).toBeVisible();
  await syncHeading.locator("../..").getByRole("button").click();

  const workspaceButton = page.locator("header button").filter({ hasText: "·" }).first();
  const originalWorkspace = (await workspaceButton.innerText()).split("·")[0].trim();
  await workspaceButton.click();
  await page.getByRole("button", { name: "新建班级" }).click();
  await page.getByRole("button", { name: "高中" }).click();
  await page.getByRole("button", { name: "一", exact: true }).click();
  await page.getByPlaceholder("例如：高二(1)班").fill("E2E 新班级");
  await page.getByRole("button", { name: "创建", exact: true }).click();
  await expect(workspaceButton).toContainText("E2E 新班级");
  await expect(page.getByText("暂无考试数据")).toBeVisible();
  await expect(page.getByText("E2E 期中测试", { exact: true })).toHaveCount(0);

  await workspaceButton.click();
  await page.getByRole("button", { name: new RegExp(originalWorkspace) }).last().click();
  await page.getByRole("button", { name: /^成绩/ }).click();
  await expect(page.getByText("E2E 期中测试", { exact: true }).first()).toBeVisible();
});
