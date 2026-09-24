import type { Page } from "@playwright/test";

/** Low-frequency seat tools live in the toolbar "管理" menu. */
export async function openSeatTool(page: Page, name: "新增学生" | "班级职务" | "编辑布局") {
  await page.getByRole("button", { name: "管理", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
