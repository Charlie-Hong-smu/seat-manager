import { expect, test, type Page } from "@playwright/test";

// Observe demand loading without service-worker precaching fetching chunks first.
test.use({ serviceWorkers: "block", viewport: { width: 1310, height: 800 } });

async function login(page: Page) {
  await page.route("**/license/auth", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ token: "e2e-lazy-workspace", expiresAt: Date.now() + 600_000 }),
  }));
  await page.goto("./");
  await page.getByPlaceholder("请输入授权码").fill("TEST-ONLY-LAZY-WORKSPACE");
  await page.getByRole("button", { name: "进入工作台", exact: true }).click();
  await expect(page.getByRole("heading", { name: "今日班务", exact: true })).toBeVisible();
}

test("secondary workspaces load on demand and remain available on warm offline navigation", async ({ page, context }) => {
  const chunks: string[] = [];
  page.on("request", request => {
    if (/\/(Dormitory|ClassFund|History|Data)Workspace-[^/]+\.js/.test(request.url())) chunks.push(request.url());
  });
  await login(page);
  expect(chunks).toHaveLength(0);
  const navigation = page.getByRole("navigation", { name: "主导航" });
  const targets = [
    { name: "宿舍", chunk: "Dormitory", content: () => page.getByRole("textbox").and(page.getByPlaceholder("新宿舍名称")) },
    { name: "班费", chunk: "ClassFund", content: () => page.getByRole("toolbar", { name: "班费视图", exact: true }) },
    { name: "历史", chunk: "History", content: () => page.getByRole("heading", { name: "历史", exact: true }) },
    { name: "名单 / 备份", chunk: "Data", content: () => page.getByRole("heading", { name: "数据健康检查", exact: true }) },
  ];
  for (const target of targets) {
    await navigation.getByRole("button", { name: target.name, exact: true }).click();
    await expect(target.content()).toBeVisible();
    expect(chunks.filter(url => url.includes(`/${target.chunk}Workspace-`))).toHaveLength(1);
  }
  await navigation.getByRole("button", { name: "今日", exact: true }).click();
  await context.setOffline(true);
  for (const target of targets) {
    await navigation.getByRole("button", { name: target.name, exact: true }).click();
    await expect(target.content()).toBeVisible();
  }
  expect(chunks).toHaveLength(4);
  await expect(page.getByText("功能模块加载失败", { exact: true })).toBeHidden();
});

test("leaving a cold workspace while its chunk loads preserves the chosen page and class data", async ({ page }) => {
  let releaseChunk!: () => void;
  const gate = new Promise<void>(resolve => { releaseChunk = resolve; });
  let requested = false;
  await page.route("**/assets/DormitoryWorkspace-*.js", async route => {
    requested = true;
    await gate;
    await route.continue();
  });
  try {
    await login(page);
    const navigation = page.getByRole("navigation", { name: "主导航" });
    await navigation.getByRole("button", { name: "宿舍", exact: true }).click();
    await expect.poll(() => requested).toBe(true);
    await expect(page.locator('[data-motion-pending="true"]')).toBeAttached();
    await navigation.getByRole("button", { name: "今日", exact: true }).click();
    await expect(page.getByRole("heading", { name: "今日班务", exact: true })).toBeVisible();
    const response = page.waitForResponse(response => /\/DormitoryWorkspace-[^/]+\.js/.test(response.url()));
    releaseChunk();
    await response;
    await expect(page.getByRole("heading", { name: "今日班务", exact: true })).toBeVisible();
    await navigation.getByRole("button", { name: "宿舍", exact: true }).click();
    // Role lookup excludes the inert, aria-hidden transition snapshot.
    await page.getByRole("textbox").and(page.getByPlaceholder("新宿舍名称")).fill("加载后保留宿舍");
    await page.getByRole("button", { name: "新增宿舍", exact: true }).click();
    await expect(page.getByRole("heading", { name: "加载后保留宿舍", exact: true })).toBeVisible();
    await navigation.getByRole("button", { name: "今日", exact: true }).click();
    await navigation.getByRole("button", { name: "宿舍", exact: true }).click();
    await expect(page.getByRole("heading", { name: "加载后保留宿舍", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const book = JSON.parse(localStorage.getItem("seat-manager-workspaces-v1") || "{}");
      return book.slices?.find((slice: { id: string }) => slice.id === book.currentSliceId)?.data.dormitories?.some((dorm: { name: string }) => dorm.name === "加载后保留宿舍");
    })).toBe(true);
  } finally {
    releaseChunk();
  }
});
