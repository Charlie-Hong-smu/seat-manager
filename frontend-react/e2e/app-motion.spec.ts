import { expect, test, type Page } from "@playwright/test";
import { openSeatTool } from "./seatTools";

test("comment custom controls morph in place and keep their values", async ({ page }) => {
  await setup(page);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "评语工作台", exact: true }).click();
  const workbench = page.getByRole("region", { name: "评语工作台" });
  await workbench.getByRole("button", { name: /生成设置/ }).click();
  const lengthMorph = workbench.locator('.app-inline-morph:has(button[aria-label="自定义评语字数"])');
  const initialLengthBox = await lengthMorph.boundingBox();
  await lengthMorph.getByRole("button", { name: "自定义评语字数" }).click();
  await expect(lengthMorph).toHaveAttribute("data-active", "true");
  const lengthInput = lengthMorph.getByRole("spinbutton", { name: "自定义字数" });
  await expect(lengthInput).toBeFocused();
  await lengthInput.fill("180");
  await expect(lengthMorph.getByRole("spinbutton", { name: "自定义字数" })).toHaveValue("180");
  const editedLengthBox = await lengthMorph.boundingBox();
  expect(editedLengthBox?.width).toBe(initialLengthBox?.width);
  expect(editedLengthBox?.height).toBe(initialLengthBox?.height);
  await workbench.getByRole("group", { name: "评语字数预设" }).getByRole("button", { name: "80～100" }).click();
  await expect(lengthMorph).toHaveAttribute("data-active", "false");

  const classroom = workbench.getByRole("button", { name: /^课堂表现/ });
  if (await classroom.getAttribute("aria-expanded") !== "true") await classroom.click();
  const criterion = classroom.locator("xpath=ancestor::article[1]");
  const materialMorph = criterion.locator(".app-inline-morph");
  await materialMorph.getByRole("button", { name: "自定义", exact: true }).click();
  await expect(materialMorph).toHaveAttribute("data-active", "true");
  await expect(materialMorph.getByRole("textbox", { name: "补充课堂表现素材" })).toBeFocused();
  await materialMorph.getByRole("textbox", { name: "补充课堂表现素材" }).fill("善于提问");
  await materialMorph.getByRole("button", { name: "添加课堂表现素材" }).click();
  await expect(materialMorph).toHaveAttribute("data-active", "false");
  await expect(materialMorph.getByRole("button", { name: "自定义", exact: true })).toBeFocused();
  await expect(criterion.getByRole("button", { name: "善于提问" })).toBeVisible();
});

// Motion tests gate lazy chunks directly; service-worker precaching would bypass page routes.
test.use({ serviceWorkers: "block" });

async function setup(page: Page) {
  const edition = process.env.E2E_EDITION === "commercial" ? "commercial" : "zhang";
  await page.route("**/license/auth", route => route.fulfill({ json: { token: "motion-test", expiresAt: Date.now() + 600_000, licenseId: "motion-test", edition } }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-MOTION");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await page.getByRole("button", { name: "座位", exact: true }).click();
  await openSeatTool(page, "新增学生");
  for (const name of ["连续切换甲", "连续切换乙"]) {
    await page.getByPlaceholder("姓名", { exact: true }).fill(name);
    await page.getByRole("button", { name: "添加到班级", exact: true }).click();
  }
  await page.getByRole("button", { name: "关闭工具面板", exact: true }).last().click();
  await expect(page.getByPlaceholder("姓名", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "已保存", exact: true })).toBeVisible();
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`student and workspace transitions adapt height and preserve focus and data (${reducedMotion})`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setViewportSize({ width: 1310, height: 800 });
    await page.emulateMedia({ reducedMotion });
    await setup(page);
    const before = await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"));
    await page.locator('[data-student-id]').filter({ hasText: "连续切换甲" }).click();
    let dialog = page.getByRole("dialog", { name: "连续切换甲学生详情" });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    await expect.poll(() => dialog.evaluate(node => node.getAnimations().every(animation => animation.playState === "finished"))).toBe(true);
    const frame = await dialog.boundingBox();
    const during = await dialog.getByRole("button", { name: "下一位学生", exact: true }).evaluate(button => {
      (button as HTMLElement).focus();
      (button as HTMLElement).click();
      return new Promise<{ count: number; inert: boolean; ids: number }>(resolve => requestAnimationFrame(() => {
        const snapshots = [...document.querySelectorAll<HTMLElement>('.app-motion-overlay > .app-motion-snapshot')];
        resolve({ count: snapshots.length, inert: snapshots.every(node => node.inert), ids: snapshots.reduce((sum, node) => sum + node.querySelectorAll('[id]').length, 0) });
      }));
    });
    dialog = page.getByRole("dialog", { name: "连续切换乙学生详情" });
    await expect(dialog).toBeVisible();
    expect(await dialog.boundingBox()).toEqual(frame);
    await expect(dialog.getByRole("button", { name: "下一位学生", exact: true })).toBeFocused();
    if (reducedMotion === "no-preference") {
      expect(during.count).toBeGreaterThan(0);
      expect(during.inert).toBe(true);
      expect(during.ids).toBe(0);
    }
    // Reverse before the original handoff finishes, then verify that only one live detail remains.
    await dialog.getByRole("button", { name: "上一位学生", exact: true }).click();
    dialog = page.getByRole("dialog", { name: "连续切换甲学生详情" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("tab", { name: "档案", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "编辑资料", exact: true })).toBeVisible();
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    const tall = await dialog.boundingBox();
    expect(tall!.height).toBeGreaterThan(frame!.height + 40);
    expect(tall!.height).toBeLessThanOrEqual(768);
    const viewport = dialog.locator(":scope > .app-motion-switch--scrollable");
    await viewport.evaluate(node => { node.scrollTop = node.scrollHeight; });
    expect(await viewport.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    const changeTab = async (name: string) => dialog.getByRole("tab", { name, exact: true }).evaluate(button => {
      const panel = button.closest<HTMLElement>('[role="dialog"]')!;
      const frames: Array<{ height: number; y: number; width: number }> = [];
      const sample = () => { const rect = panel.getBoundingClientRect(); frames.push({ height: rect.height, y: rect.y, width: rect.width }); };
      sample();
      (button as HTMLElement).click();
      return new Promise<typeof frames>(resolve => {
        const start = performance.now();
        function tick() {
          sample();
          if (performance.now() - start >= 420) resolve(frames);
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    });
    const assertContinuous = (frames: Awaited<ReturnType<typeof changeTab>>) => {
      const start = frames[0].height, end = frames.at(-1)!.height;
      expect(Math.abs(start - end)).toBeGreaterThan(40);
      for (const value of frames) {
        expect(value.width).toBeCloseTo(frame!.width, 0);
        expect(value.y + value.height / 2).toBeCloseTo(400, 0);
      }
      if (reducedMotion === "no-preference") {
        expect(frames.some(value => value.height > Math.min(start, end) + 3 && value.height < Math.max(start, end) - 3)).toBe(true);
        expect(frames[1].height).toBeCloseTo(start, 0);
        for (let i = 1; i < frames.length; i++) expect((frames[i].height - frames[i - 1].height) * Math.sign(end - start)).toBeGreaterThanOrEqual(-1);
        expect(Math.abs(frames.at(-2)!.height - end)).toBeLessThan(1);
      } else expect(frames.slice(1).every(value => Math.abs(value.height - end) < 1)).toBe(true);
    };
    const shrinking = await changeTab("成绩");
    assertContinuous(shrinking);
    expect(await viewport.evaluate(node => node.scrollTop)).toBe(0);
    const short = await dialog.boundingBox();
    assertContinuous(await changeTab("档案"));
    // Interrupt a shrink while it is visibly in progress, then reverse from that exact frame.
    const reversal = await dialog.getByRole("tab", { name: "成绩", exact: true }).evaluate(async button => {
      const panel = button.closest<HTMLElement>('[role="dialog"]')!;
      (button as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const before = panel.getBoundingClientRect().height;
      [...panel.querySelectorAll<HTMLElement>('[role="tab"]')].find(node => node.textContent === "档案")!.click();
      return new Promise<{ before: number; after: number }>(resolve => requestAnimationFrame(() => resolve({ before, after: panel.getBoundingClientRect().height })));
    });
    if (reducedMotion === "no-preference") expect(reversal.after).toBeCloseTo(reversal.before, 0);
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    expect(await dialog.boundingBox()).toEqual(tall);
    await changeTab("成绩");
    expect(await dialog.boundingBox()).toEqual(short);
    await dialog.getByRole("tab", { name: "出勤", exact: true }).click();
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    await page.screenshot({ path: `../output/app-motion-student-${reducedMotion}.png` });
    await dialog.getByRole("button", { name: "关闭学生详情", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "主导航" });
    for (const name of ["出勤", "任务与作业", "班费", "历史", "座位"]) {
      await nav.getByRole("button", { name: new RegExp(`^${name}(?: |$)`) }).click();
      await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
      await expect(page.locator('.app-motion-snapshot')).toHaveCount(0);
    }
    await nav.getByRole("button", { name: /^成绩/ }).click();
    await page.getByRole("tab", { name: "题目分析", exact: true }).click();
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    await page.getByRole("tab", { name: "成绩概览", exact: true }).click();
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"))).toBe(before);
    expect(errors).toEqual([]);
  });
}

test("disclosures retain closing content and list filters release animation styles", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await setup(page);
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "出勤", exact: true }).click();
  await page.getByRole("button", { name: "详细", exact: true }).click();
  const edit = page.getByRole("button", { name: "编辑 连续切换甲 详情", exact: true });
  await edit.click();
  const row = page.locator('[data-attendance-student-id]').filter({ hasText: '连续切换甲' }).filter({ has: edit });
  const collapse = row.locator('.app-motion-collapse');
  await expect(collapse).toHaveAttribute('data-open', 'true');
  await expect(collapse.getByPlaceholder('备注', { exact: true })).toBeVisible();
  await edit.click();
  await expect(collapse).toHaveAttribute('aria-hidden', 'true');
  await expect(collapse.getByPlaceholder('备注', { exact: true })).toBeAttached();
  await expect(collapse.getByPlaceholder('备注', { exact: true })).toHaveCount(0);
  await expect.poll(() => collapse.evaluate(element => element.getBoundingClientRect().height)).toBe(0);
  await page.getByRole("button", { name: "快速", exact: true }).click();
  const search = page.getByPlaceholder("搜索学生", { exact: true });
  await search.fill('乙');
  await expect(page.locator('[data-attendance-student-id]:not(.app-motion-snapshot *)')).toHaveCount(1);
  await search.fill('');
  await expect(page.locator('[data-attendance-student-id]:not(.app-motion-snapshot *)')).toHaveCount(2);
  await expect.poll(() => page.locator('[data-attendance-student-id]').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).transform === 'none'))).toBe(true);
});


test("registration cards continuously reshape into detail rows and survive rapid reversal", async ({ page }) => {
  await page.setViewportSize({ width: 1310, height: 800 });
  await setup(page);
  // Synthetic dense fixture in this test's disposable browser context only.
  await page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!);
    const data = book.slices[0].data;
    const template = data.students[0];
    data.students.push(...Array.from({ length: 58 }, (_, index) => ({ ...template, id: `motion-density-${index}`, name: `密集测试${index + 3}`, aliases: [] })));
    localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify(book));
  });
  await page.reload();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "出勤", exact: true }).click();
  await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
  const beforeData = await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"));
  const card = page.locator('[data-attendance-student-id]').first();
  const initial = await card.boundingBox();
  const samples = await page.getByRole("button", { name: "详细", exact: true }).evaluate(button => {
    (button as HTMLElement).click();
    return new Promise<Array<{ x: number; width: number; textsUnscaled: boolean }>>(resolve => {
      const samples: Array<{ x: number; width: number; textsUnscaled: boolean }> = [];
      let started = 0;
      function sample(now: number) {
        const shell = document.querySelector('.app-motion-surface');
        if (shell) {
          if (!started) started = now;
          const rect = shell.getBoundingClientRect();
          samples.push({ x: rect.x, width: rect.width, textsUnscaled: [...shell.children].every(child => getComputedStyle(child).transform === 'none') });
        }
        if (started && now - started > 180) resolve(samples);
        else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  });
  expect(samples.length).toBeGreaterThan(2);
  expect(samples[0].width).toBeCloseTo(initial!.width, 0);
  expect(samples.every(sample => sample.textsUnscaled)).toBe(true);
  for (let i = 1; i < samples.length; i++) expect(samples[i].width).toBeGreaterThanOrEqual(samples[i - 1].width - 1);
  await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
  const detail = await card.boundingBox();
  expect(samples.at(-1)!.width).toBeLessThanOrEqual(detail!.width + 1);
  await page.screenshot({ path: '../output/app-motion-registration-detail.png' });
  await page.getByRole('button', { name: '快速', exact: true }).evaluate(button => (button as HTMLElement).click());
  await page.getByRole('button', { name: '详细', exact: true }).evaluate(button => (button as HTMLElement).click());
  await page.getByRole('button', { name: '快速', exact: true }).evaluate(button => (button as HTMLElement).click());
  await expect(page.locator('.app-motion-switch[data-moving], .app-motion-snapshot, .app-motion-surface')).toHaveCount(0);
  expect(await card.boundingBox()).toEqual(initial);
  expect(await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"))).toBe(beforeData);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '详细', exact: true }).click();
  await expect(page.locator('.app-motion-surface')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑 连续切换甲 详情', exact: true })).toBeVisible();
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`grade chart geometry and content change in one handoff (${reducedMotion})`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion });
    await setup(page);
    // Exam fixture belongs only to this test's disposable context.
    await page.evaluate(() => {
      const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!);
      const subjects = ["语文", "数学", "英语", "物理", "化学", "地理"];
      const cell = (score: number) => ({ score, rankClass: null, rankSchool: null });
      book.slices[0].data.savedExams = [{
        id: "chart-motion-exam", name: "图表过渡测试", date: "2026-09-22", savedAt: "2026-09-22T00:00:00Z",
        studentCount: 60, subjectCount: subjects.length, subjects,
        entries: Array.from({ length: 60 }, (_, index) => {
          const scores = Object.fromEntries(subjects.map((subject, position) => [subject, cell(30 + (index * 11 + position * 7) % 71)]));
          return { name: `图表学生${index + 1}`, scores, total: cell(Object.values(scores).reduce((sum, item) => sum + item.score, 0)) };
        }),
      }];
      const latest = book.slices[0].data.savedExams[0];
      book.slices[0].data.savedExams.push({ ...latest, id: "chart-motion-older", name: "上次图表测试", date: "2026-09-01", entries: latest.entries.map((entry: { name: string; scores: Record<string, { score: number }> }) => {
        const scores = Object.fromEntries(Object.entries(entry.scores).map(([subject, value]) => [subject, cell(Math.max(0, value.score - 8))]));
        return { name: entry.name, scores, total: cell(Object.values(scores).reduce((sum, item) => sum + item.score, 0)) };
      }) });
      localStorage.setItem("seat-manager-workspaces-v1", JSON.stringify(book));
    });
    await page.reload();
    await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: /^成绩/ }).click();
    const chart = page.locator('.grade-chart-transition');
    const liveMain = chart.locator(':scope > .app-motion-content .grade-main-chart');
    await expect(liveMain.getByRole('heading', { name: '各科平均分对比' })).toBeVisible();
    await expect(liveMain.locator('.recharts-bar-rectangle')).toHaveCount(6);
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    const beforeData = await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!).slices[0].data));
    const control = page.getByRole('toolbar', { name: '成绩学科切换' });
    const sampleChange = async (name: string, reverse?: string) => control.getByRole('button', { name, exact: true }).evaluate(async (button, reverse) => {
      const host = document.querySelector<HTMLElement>('.grade-chart-transition')!;
      const samples: Array<{ time: number; width: number; title: string; barCount: number; plotWidth: number; incomingBars: number; incomingOpacity: number; moving: boolean; barHeights: string }> = [];
      const readWidth = () => (host.querySelector<HTMLElement>(':scope > .app-motion-overlay > .app-motion-surface') || host.querySelector<HTMLElement>(':scope > .app-motion-content .grade-main-chart')!).getBoundingClientRect().width;
      const before = readWidth();
      (button as HTMLElement).click();
      let interrupted = 0, resumed = 0;
      if (reverse) {
        await new Promise(resolve => setTimeout(resolve, 80));
        interrupted = readWidth();
        [...button.closest('[role="toolbar"]')!.querySelectorAll<HTMLElement>('button')].find(node => node.textContent?.trim() === reverse)!.click();
      }
      return new Promise<{ before: number; interrupted: number; resumed: number; samples: typeof samples }>(resolve => {
        let start = 0;
        function tick(now: number) {
          if (!start) start = now;
          const live = host.querySelector<HTMLElement>(':scope > .app-motion-content .grade-main-chart')!;
          const arriving = host.querySelector<HTMLElement>(':scope > .app-motion-overlay > .app-motion-surface > .app-motion-snapshot');
          if (reverse && !resumed) resumed = readWidth();
          samples.push({ time: now - start, width: readWidth(), title: live.querySelector('h3')!.textContent!, barCount: live.querySelectorAll('.recharts-bar-rectangle').length, plotWidth: live.querySelector('svg')?.getBoundingClientRect().width || 0, incomingBars: arriving?.querySelectorAll('.recharts-bar-rectangle').length || 0, incomingOpacity: arriving ? Number(getComputedStyle(arriving).opacity) : 1, moving: host.hasAttribute('data-moving'), barHeights: [...live.querySelectorAll('.recharts-bar-rectangle path')].map(node => node.getAttribute('height')).join(',') });
          if (now - start > 650) resolve({ before, interrupted, resumed, samples });
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }, reverse);
    for (const [name, title, barCount] of [["语文", "语文分数分布", 4], ["全部", "各科平均分对比", 6], ["数学", "数学分数分布", 4], ["英语", "英语分数分布", 4]] as const) {
      const { before, samples } = await sampleChange(name);
      const final = samples.at(-1)!;
      expect(samples.every(sample => sample.title === title)).toBe(true);
      expect(final.barCount).toBe(barCount);
      if (reducedMotion === 'no-preference') {
        expect(samples[0].width).toBeCloseTo(before, 0);
        expect(new Set(samples.filter(sample => sample.time < 370).map(sample => sample.barHeights)).size).toBeGreaterThan(2);
        expect(samples.some(sample => sample.time < 120 && sample.moving && sample.incomingBars === barCount && sample.incomingOpacity > 0.05)).toBe(true);
        if (Math.abs(final.width - before) > 2) {
          expect(samples.some(sample => sample.width > Math.min(before, final.width) + 2 && sample.width < Math.max(before, final.width) - 2)).toBe(true);
          for (let i = 1; i < samples.length; i++) expect((samples[i].width - samples[i - 1].width) * Math.sign(final.width - before)).toBeGreaterThanOrEqual(-1);
        }
      } else expect(samples.every(sample => !sample.moving)).toBe(true);
      expect(samples.filter(sample => sample.time > 370).every(sample => sample.barCount === barCount && !sample.moving && Math.abs(sample.width - final.width) < 1 && Math.abs(sample.plotWidth - final.plotWidth) < 1)).toBe(true);
      await expect(chart.locator('.app-motion-snapshot, .app-motion-surface')).toHaveCount(0);
    }
    const rapid = await sampleChange('全部', '化学');
    if (reducedMotion === 'no-preference') expect(rapid.resumed).toBeCloseTo(rapid.interrupted, 0);
    expect(rapid.samples.at(-1)!.title).toBe('化学分数分布');
    await page.screenshot({ path: `../output/app-motion-grade-${reducedMotion}.png` });
    expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!).slices[0].data))).toBe(beforeData);
    await page.getByRole('button', { name: '多次趋势', exact: true }).click();
    await expect(page.locator('.recharts-line-curve')).toHaveCount(6);
    await page.waitForTimeout(370);
    for (const subject of ['数学', '化学']) {
      const lines = await control.getByRole('button', { name: subject, exact: true }).evaluate(button => {
        (button as HTMLElement).click();
        return new Promise<string[]>(resolve => {
          const paths: string[] = [];
          const start = performance.now();
          function sample() {
            paths.push(document.querySelector('.recharts-line-curve')?.getAttribute('d') || '');
            if (performance.now() - start > 420) resolve(paths);
            else requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
      });
      expect(lines.every(path => path.length > 0)).toBe(true);
      if (reducedMotion === 'no-preference') expect(new Set(lines).size).toBeGreaterThan(2);
      else expect(new Set(lines).size).toBe(1);
    }
    // Warm re-entry must have a measured SVG on its first visible frame, with no empty re-mount.
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '出勤', exact: true }).click();
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    const entry = await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: /^成绩/ }).evaluate(button => {
      (button as HTMLElement).click();
      return new Promise<boolean[]>(resolve => {
        const frames: boolean[] = [];
        const start = performance.now();
        function sample() {
          const card = document.querySelector('.grade-main-chart');
          if (card) frames.push(Boolean(card.querySelector('.recharts-surface')?.getBoundingClientRect().width));
          if (performance.now() - start > 420) resolve(frames);
          else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      });
    });
    expect(entry.length).toBeGreaterThan(2);
    expect(entry.every(Boolean)).toBe(true);
    await page.setViewportSize({ width: 1024, height: 800 });
    await control.getByRole('button', { name: '全部', exact: true }).click();
    await expect(chart.locator('.app-motion-snapshot, .app-motion-surface')).toHaveCount(0);
    await expect(liveMain.locator('.recharts-bar-rectangle')).toHaveCount(6);
    await control.getByRole('button', { name: '语文', exact: true }).click();
    await expect(chart.locator('.app-motion-snapshot, .app-motion-surface')).toHaveCount(0);
    await expect(liveMain.locator('.recharts-bar-rectangle')).toHaveCount(4);
  });
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`dialog scrim and panel stay independent through interrupted exit (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await setup(page);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const seat = page.locator('[data-student-id]').filter({ hasText: '连续切换甲' });
    const opening = await seat.evaluate(button => {
      (button as HTMLElement).click();
      return new Promise<Array<{ outer: number; panel: number; scrim: number; blur: string }>>(resolve => {
        const frames: Array<{ outer: number; panel: number; scrim: number; blur: string }> = [];
        let start = 0;
        function tick(now: number) {
          const panel = document.querySelector<HTMLElement>('[role="dialog"].app-modal-panel');
          if (panel) {
            if (!start) start = now;
            const overlay = panel.closest('.app-modal-overlay')!;
            const scrim = getComputedStyle(overlay, '::before');
            frames.push({ outer: Number(getComputedStyle(overlay).opacity), panel: Number(getComputedStyle(panel).opacity), scrim: Number(scrim.opacity), blur: scrim.backdropFilter });
          }
          if (start && now - start > 370) resolve(frames);
          else requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    });
    expect([...new Set(opening.map(frame => `${frame.outer} ${frame.blur}`))]).toEqual(['1 blur(1px)']);
    expect(opening.at(-1)!.panel).toBe(1);
    expect(opening.at(-1)!.scrim).toBe(1);
    if (reducedMotion === 'no-preference') {
      expect(opening.some(frame => frame.panel > 0.05 && frame.panel < 0.95)).toBe(true);
      expect(opening.every(frame => Math.abs(frame.panel - frame.scrim) < 0.03)).toBe(true);
    }
    const dialog = page.getByRole('dialog', { name: '连续切换甲学生详情' });
    await page.screenshot({ path: `../output/app-motion-dialog-${reducedMotion}.png` });
    const original = await dialog.boundingBox();
    await dialog.getByRole('button', { name: '更多学生操作', exact: true }).click();
    await page.getByRole('menuitem', { name: '移出当前班级', exact: true }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toBeVisible();
    await confirm.getByRole('button', { name: '取消', exact: true }).click();
    await expect(confirm).toHaveCount(0);
    expect(await dialog.boundingBox()).toEqual(original);
    await expect(dialog.getByRole('button', { name: '更多学生操作', exact: true })).toBeFocused();
    await dialog.getByRole('button', { name: '关闭学生详情', exact: true }).click();
    await expect(page.locator('.app-modal-overlay')).toHaveCount(0);
    const interrupted = await seat.evaluate(async button => {
      (button as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 80));
      const panel = document.querySelector<HTMLElement>('[role="dialog"].app-modal-panel')!;
      const overlay = panel.closest<HTMLElement>('.app-modal-overlay')!;
      const read = () => ({ panel: Number(getComputedStyle(panel).opacity), scrim: Number(getComputedStyle(overlay, '::before').opacity), outer: Number(getComputedStyle(overlay).opacity) });
      const before = read();
      panel.querySelector<HTMLElement>('[aria-label="关闭学生详情"]')!.click();
      return new Promise<{ before: ReturnType<typeof read>; after: ReturnType<typeof read>; inert: boolean }>(resolve => requestAnimationFrame(() => resolve({ before, after: read(), inert: overlay.closest<HTMLElement>('.app-presence-motion')?.inert || false })));
    });
    if (reducedMotion === 'no-preference') {
      expect(interrupted.after.panel).toBeCloseTo(interrupted.before.panel, 1);
      expect(interrupted.after.scrim).toBeCloseTo(interrupted.before.scrim, 1);
      expect(interrupted.after.outer).toBe(1);
      expect(interrupted.inert).toBe(true);
    }
    await expect(page.locator('.app-modal-overlay')).toHaveCount(0);
    await seat.click();
    await expect(dialog).toBeVisible();
    await expect.poll(() => dialog.evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1);
    await dialog.getByRole('button', { name: '关闭学生详情', exact: true }).click();
    await expect(page.locator('.app-modal-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}


for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`sidebar selection leads a continuous vertical workspace handoff (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1310, height: 800 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/assets/ScoresWorkspace-*.js", async route => { await gate; await route.continue(); });
    await setup(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const nav = page.getByRole("navigation", { name: "主导航" });
    const workspace = page.locator('.app-work-surface > div > .app-motion-switch');
    // Let the existing dormitory preset initialization settle before comparing teacher data.
    await nav.getByRole("button", { name: /^宿舍/ }).click();
    await expect(workspace).not.toHaveAttribute("data-moving");
    await expect.poll(() => page.evaluate(() => Boolean(JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!).slices[0].data.settings?.dormitoryPreferences))).toBe(true);
    await nav.getByRole("button", { name: /^座位/ }).click();
    await expect(workspace).not.toHaveAttribute("data-moving");
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!).slices[0].data);
    const change = async (name: RegExp) => nav.getByRole("button", { name }).evaluate(button => {
      const root = document.querySelector<HTMLElement>('.app-work-surface > div > .app-motion-switch')!;
      const frame = root.getBoundingClientRect();
      (button as HTMLElement).focus();
      (button as HTMLElement).click();
      const start = performance.now();
      const frames: Array<{ time: number; delay: number; selected: boolean; y: number; opacity: number; incomingY: number; moving: boolean; height: number; width: number }> = [];
      return new Promise<typeof frames>(resolve => {
        function sample() {
          const old = root.querySelector<HTMLElement>(":scope > .app-motion-overlay > .app-motion-snapshot");
          const live = root.querySelector<HTMLElement>(":scope > .app-motion-content")!;
          const rect = root.getBoundingClientRect();
          frames.push({ time: performance.now() - start, delay: Number(live.getAnimations()[0]?.effect?.getTiming().delay || 0), selected: button.getAttribute("aria-current") === "page", y: old ? old.getBoundingClientRect().y - frame.y : 0, opacity: old ? Number(getComputedStyle(old).opacity) : 0, incomingY: live.getBoundingClientRect().y - frame.y, moving: root.hasAttribute("data-moving"), height: rect.height, width: rect.width });
          if (performance.now() - start < 570) requestAnimationFrame(sample); else resolve(frames);
        }
        requestAnimationFrame(sample);
      });
    });
    for (const [name, sign] of [[/^班费/, 1], [/^出勤/, -1]] as const) {
      const frames = await change(name);
      expect(frames.every(frame => frame.selected)).toBe(true);
      expect(frames.every(frame => Math.abs(frame.height - frames[0].height) < 1 && Math.abs(frame.width - frames[0].width) < 1)).toBe(true);
      if (reducedMotion === "no-preference") {
        const hold = frames.filter(frame => frame.time < 65);
        // Busy CI may miss the first 65ms; check the actual navigation lead as well as any sampled held frames.
        expect(frames.some(frame => frame.delay >= 70)).toBe(true);
        expect(hold.every(frame => Math.abs(frame.y) < 1 && frame.opacity > 0.99)).toBe(true);
        const sliding = frames.filter(frame => frame.time > 115 && frame.time < 450);
        expect(sliding.some(frame => frame.y * sign < -2 && frame.incomingY * sign > 0.1)).toBe(true);
        expect(new Set(sliding.map(frame => frame.y.toFixed(1))).size).toBeGreaterThan(3);
      } else expect(frames.every(frame => !frame.moving && frame.incomingY === 0)).toBe(true);
      expect(frames.at(-1)!.moving).toBe(false);
      expect(frames.at(-1)!.incomingY).toBe(0);
      await expect(nav.getByRole("button", { name })).toBeFocused();
    }
    // A newer click continues the composite currently on screen, without queuing old destinations.
    await nav.getByRole("button", { name: /^班费/ }).click();
    await nav.getByRole("button", { name: /^宿舍/ }).click();
    await nav.getByRole("button", { name: /^座位/ }).click();
    await expect(workspace).toHaveAttribute("data-navigation-key", "daily");
    await expect(workspace).not.toHaveAttribute("data-moving");
    await expect(workspace.locator('.app-motion-snapshot')).toHaveCount(0);
    await expect(page.getByRole("button", { name: "管理", exact: true })).toBeEnabled();
    // Hold a real lazy module: the old page remains visually opaque until its replacement is ready.
    await nav.getByRole("button", { name: /^成绩/ }).click();
    if (reducedMotion === "no-preference") {
      await expect(workspace).toHaveAttribute("data-navigation-phase", "preparing");
      await expect(workspace).toHaveAttribute("aria-busy", "true");
      const old = workspace.locator(":scope > .app-motion-overlay > .app-motion-snapshot");
      await expect(old).toHaveCSS("opacity", "1");
      expect(await workspace.locator(":scope > .app-motion-content").evaluate(node => (node as HTMLElement).inert)).toBe(true);
      await page.waitForTimeout(160);
      await expect(old).toHaveCSS("opacity", "1");
    }
    release();
    await expect(page.getByRole("tab", { name: "成绩概览", exact: true })).toBeVisible();
    await expect(workspace).not.toHaveAttribute("data-moving");
    await expect(workspace).not.toHaveAttribute("aria-busy");
    await expect(workspace.locator('.app-motion-snapshot')).toHaveCount(0);
    await page.screenshot({ path: `../output/sidebar-motion-${reducedMotion}.png` });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!).slices[0].data)).toEqual(before);
    expect(errors).toEqual([]);
  });
}


for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`comment workbench stays in the main frame with drafts and accessible overlays (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width: 1310, height: 800 });
    await setup(page);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const nav = page.getByRole("navigation", { name: "主导航" });
    const surface = page.locator('.app-work-surface');
    const frame = await surface.boundingBox();
    await nav.getByRole("button", { name: "评语工作台", exact: true }).click();
    const workbench = page.getByRole("region", { name: "评语工作台", exact: true });
    await expect(workbench).toBeVisible();
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    const roster = workbench.locator(".comment-workbench-roster");
    const row = roster.locator("[data-comment-student-id]").first();
    await expect(row).toHaveAttribute("aria-pressed", "true");
    expect(await row.locator("span").filter({ hasText: /^连续切换甲$/ }).count()).toBe(1);
    const contentBounds = await row.evaluate(node => {
      const name = node.querySelector(".truncate")!.getBoundingClientRect();
      const status = node.lastElementChild!.getBoundingClientRect();
      return { nameY: name.y + name.height / 2, statusY: status.y + status.height / 2, gap: status.x - name.right };
    });
    expect(Math.abs(contentBounds.nameY - contentBounds.statusY)).toBeLessThan(1);
    expect(contentBounds.gap).toBeGreaterThanOrEqual(7);
    await roster.getByRole("button", { name: "批量", exact: true }).click();
    const checkbox = row.getByRole("checkbox");
    await expect(checkbox).toBeVisible();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await roster.getByRole("button", { name: "逐人", exact: true }).click();
    await expect(row.getByRole("checkbox")).toHaveCount(0);
    const expanded = await surface.boundingBox();
    expect(expanded!.y).toBe(frame!.y);
    expect(expanded!.height).toBe(frame!.height);
    expect(expanded!.width).toBeGreaterThan(frame!.width);
    await expect(page.getByRole("button", { name: "展开侧栏", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "评语工作台", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("dialog", { name: "评语工作台" })).toHaveCount(0);
    const editor = workbench.getByRole("textbox", { name: "评语正文编辑器", exact: true });
    await editor.fill("主界面内切换仍保留这份评语草稿。");
    await workbench.getByRole("button", { name: "导出", exact: true }).click();
    const exportDialog = page.getByRole("dialog", { name: "导出评语", exact: true });
    await expect(exportDialog).toBeVisible();
    await expect.poll(() => exportDialog.evaluate(node => node.getAnimations().every(animation => animation.playState === "finished"))).toBe(true);
    const overlay = await exportDialog.evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { centerX: rect.x + rect.width / 2, windowX: innerWidth / 2, inside: Boolean(node.closest('.app-work-surface')), top: node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + 20)) };
    });
    expect(overlay.centerX).toBeCloseTo(overlay.windowX, 0);
    expect(overlay.inside).toBe(false);
    expect(overlay.top).toBe(true);
    await page.keyboard.press("Escape");
    await expect(exportDialog).toHaveCount(0);
    await expect(workbench).toBeVisible();
    await expect(workbench.getByRole("button", { name: "导出", exact: true })).toBeFocused();
    await nav.getByRole("button", { name: /^出勤/ }).click();
    await nav.getByRole("button", { name: "评语工作台", exact: true }).click();
    await expect(editor).toHaveValue("主界面内切换仍保留这份评语草稿。");
    await page.setViewportSize({ width: 1024, height: 800 });
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    expect(await workbench.locator('.comment-workbench-columns').evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: `../output/inline-comments-${reducedMotion}.png` });
    await workbench.getByRole("button", { name: "返回上一页面", exact: true }).focus();
    await page.keyboard.press("Shift+Tab");
    expect(await nav.evaluate(node => node.contains(document.activeElement))).toBe(true);
    await workbench.getByRole("button", { name: "返回上一页面", exact: true }).click();
    await expect(workbench).toHaveCount(0);
    await expect(nav.getByRole("button", { name: /^出勤/ })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByRole("button", { name: /^出勤/ })).toBeFocused();
    await expect(page.getByRole("button", { name: "收起侧栏", exact: true })).toBeVisible();
    // An already collapsed sidebar remains collapsed after returning, too.
    await page.getByRole("button", { name: "收起侧栏", exact: true }).click();
    await nav.getByRole("button", { name: "评语工作台", exact: true }).click();
    await workbench.getByRole("button", { name: "返回上一页面", exact: true }).click();
    await expect(page.getByRole("button", { name: "展开侧栏", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`AI companion enters once, reverses smoothly and leaves the workspace still (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await setup(page);
    const before = await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"));
    const launcher = page.getByRole("button", { name: "打开 AI 助手", exact: true });
    const measure = () => launcher.evaluate(async button => {
      const board = document.querySelector("[data-student-id]")!;
      const start = board.getBoundingClientRect();
      const samples: Array<{ opacity: number; dy: number; fallback: boolean }> = [];
      (button as HTMLElement).click();
      await new Promise<void>(resolve => {
        const began = performance.now();
        function frame() {
          const panel = document.getElementById("ai-assistant-companion");
          samples.push({ opacity: panel ? Number(getComputedStyle(panel).opacity) : 0, dy: board.getBoundingClientRect().y - start.y, fallback: Boolean(document.querySelector('[aria-label="正在打开 AI 助手"]')) });
          if (performance.now() - began < 400) requestAnimationFrame(frame); else resolve();
        }
        requestAnimationFrame(frame);
      });
      return samples;
    });
    for (let round = 0; round < 2; round++) {
      const samples = await measure();
      expect(samples.every(frame => Math.abs(frame.dy) < 0.5 && !frame.fallback)).toBe(true);
      expect(samples.at(-1)!.opacity).toBe(1);
      for (let index = 1; index < samples.length; index++) expect(samples[index].opacity).toBeGreaterThanOrEqual(samples[index - 1].opacity - 0.01);
      if (reducedMotion === "no-preference") expect(samples.some(frame => frame.opacity > 0.05 && frame.opacity < 0.95)).toBe(true);
      await page.getByRole("button", { name: "关闭AI助手", exact: true }).click();
      await expect(page.locator("#ai-assistant-companion")).toHaveCount(0);
      await expect(launcher).toBeFocused();
    }
    // Reverse a partially closed panel: it must resume from its visible pixels.
    await launcher.click();
    const panel = page.locator("#ai-assistant-companion");
    await expect(panel).toHaveCSS("opacity", "1");
    if (reducedMotion === "no-preference") {
    const reversal = await panel.getByRole("button", { name: "关闭AI助手" }).evaluate(async button => {
      (button as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 70));
      const panel = document.getElementById("ai-assistant-companion")!;
      const before = Number(getComputedStyle(panel).opacity);
      document.getElementById("ai-assistant-launcher")!.click();
      await new Promise(requestAnimationFrame);
      return { before, after: Number(getComputedStyle(panel).opacity) };
    });
    expect(Math.abs(reversal.after - reversal.before)).toBeLessThan(0.08);
    }
    await expect(panel).toHaveCSS("opacity", "1");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("seat-manager-workspaces-v1"))).toBe(before);
  });
}

test("cold AI loading has no full-size flash and cancellation cannot open a late panel", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/assets/AiAssistantWorkspace-*.js", async route => { await gate; await route.continue(); });
  try {
    await setup(page);
    await page.getByRole("button", { name: "打开 AI 助手", exact: true }).click();
    const loading = page.getByRole("status", { name: "正在打开 AI 助手" });
    await expect(loading).toBeVisible();
    expect((await loading.boundingBox())!.height).toBeLessThan(90);
    await expect(page.locator("#ai-assistant-companion")).toHaveCount(0);
    await loading.getByRole("button", { name: "取消打开 AI 助手" }).click();
    release();
    await expect(loading).toHaveCount(0);
    await page.waitForTimeout(350);
    await expect(page.locator("#ai-assistant-companion")).toHaveCount(0);
    await page.getByRole("button", { name: "打开 AI 助手", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "AI助手浮窗" })).toBeVisible();
    await expect(page.locator("#ai-assistant-companion")).toHaveCSS("opacity", "1");
  } finally { release(); }
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
  test(`comment student changes slide inside fixed frames without losing drafts (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await setup(page);
    await page.getByRole("navigation", { name: "主导航" }).getByRole("button", { name: "评语工作台", exact: true }).click();
    const workbench = page.getByRole("region", { name: "评语工作台" });
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    const rows = workbench.locator(".comment-workbench-roster [data-comment-student-id]");
    const editor = workbench.getByRole("textbox", { name: "评语正文编辑器" });
    const savedData = await page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!).slices[0].data);
    await rows.nth(1).evaluate(button => (button as HTMLElement).click());
    if (reducedMotion === "no-preference") {
      await expect.poll(() => workbench.locator(".comment-workbench-editor > .app-motion-switch > .app-motion-content [data-motion-shift]").first().evaluate(node => Math.abs(new DOMMatrixReadOnly(getComputedStyle(node).transform).m42))).toBeGreaterThan(0);
    }
    await expect(editor).toHaveValue("");
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    await rows.nth(0).click();
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    await editor.fill("甲同学的独立草稿");
    await rows.nth(1).click();
    await expect(editor).toHaveValue("");
    await expect(page.locator('.app-motion-switch[data-moving]')).toHaveCount(0);
    await editor.fill("乙同学的另一份草稿");
    const change = (index: number) => rows.nth(index).evaluate(async button => {
      const panes = [...document.querySelectorAll<HTMLElement>(".comment-workbench-editor, .comment-workbench-materials")];
      const origins = panes.map(node => node.getBoundingClientRect().toJSON());
      const inputFrame = document.querySelector<HTMLElement>("[data-comment-editor-frame]")!.getBoundingClientRect().toJSON();
      (button as HTMLElement).focus();
      (button as HTMLElement).click();
      const frames: Array<{ selected: boolean; panes: Array<{ old: boolean; opacity: number; liveOpacity: number; shifts: number[]; inputFrame: { x: number; y: number; width: number; height: number } | null; x: number; y: number; width: number; height: number }> }> = [];
      await new Promise<void>(resolve => {
        const began = performance.now();
        function sample() {
          frames.push({ selected: button.getAttribute("aria-pressed") === "true", panes: panes.map(node => {
            const old = node.querySelector<HTMLElement>(":scope > .app-motion-switch > .app-motion-overlay > .app-motion-snapshot");
            const live = node.querySelector<HTMLElement>(":scope > .app-motion-switch > .app-motion-content")!;
            return { ...node.getBoundingClientRect().toJSON(), old: Boolean(old), opacity: old ? Number(getComputedStyle(old).opacity) : 0, liveOpacity: Number(getComputedStyle(live).opacity), shifts: [...live.querySelectorAll<HTMLElement>("[data-motion-shift]")].map(region => new DOMMatrixReadOnly(getComputedStyle(region).transform).m42), inputFrame: live.querySelector("[data-comment-editor-frame]")?.getBoundingClientRect().toJSON() || null };
          }) });
          if (performance.now() - began < 480) requestAnimationFrame(sample); else resolve();
        }
        requestAnimationFrame(sample);
      });
      return { frames, origins, inputFrame };
    });
    for (const index of [0, 1]) {
      const { frames, origins, inputFrame } = await change(index);
      expect(frames.every(frame => frame.selected)).toBe(true);
      for (let pane = 0; pane < 2; pane++) {
        const samples = frames.map(frame => frame.panes[pane]);
        expect(samples.every(frame => frame.x === origins[pane].x && frame.y === origins[pane].y && frame.width === origins[pane].width && frame.height === origins[pane].height && frame.liveOpacity === 1)).toBe(true);
        if (reducedMotion === "no-preference") {
          expect(samples.some(frame => frame.old && frame.opacity > 0.05 && frame.opacity < 0.95)).toBe(true);
          expect(samples.some(frame => frame.shifts.some(y => index ? y > 8 : y < -8))).toBe(true);
          expect(samples.at(-1)!.shifts.every(y => Math.abs(y) < 0.1)).toBe(true);
        } else expect(samples.every(frame => !frame.old && frame.shifts.every(y => y === 0))).toBe(true);
        if (pane === 0) expect(samples.every(frame => frame.inputFrame!.x === inputFrame.x && frame.inputFrame!.y === inputFrame.y && frame.inputFrame!.width === inputFrame.width && frame.inputFrame!.height === inputFrame.height)).toBe(true);
        for (let i = 1; i < samples.length; i++) expect(samples[i].opacity).toBeLessThanOrEqual(samples[i - 1].opacity + 0.01);
      }
      await expect(editor).toHaveValue(index ? "乙同学的另一份草稿" : "甲同学的独立草稿");
      await expect(rows.nth(index)).toBeFocused();
    }
    await rows.nth(0).evaluate(async button => {
      (button as HTMLElement).click();
      await new Promise(resolve => setTimeout(resolve, 75));
      document.querySelectorAll<HTMLElement>(".comment-workbench-roster [data-comment-student-id]")[1].click();
    });
    await expect(page.locator('.app-motion-snapshot')).toHaveCount(0);
    await expect(editor).toHaveValue("乙同学的另一份草稿");
    await expect(workbench.getByRole("heading", { name: "连续切换乙 · 学期评语" })).toBeVisible();
    const ids = await workbench.evaluate(node => [...node.querySelectorAll('[id]')].map(item => item.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("seat-manager-workspaces-v1")!).slices[0].data)).toEqual(savedData);
  });
}
