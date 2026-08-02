import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("拼豆底稿生成器 | Perler Beads Generator");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});

test("sample opens the keyboard-accessible editor and updates preview text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例", exact: true }).click();
  await page.getByRole("button", { name: "进入编辑工作台", exact: true }).click();
  const grid = page.getByRole("grid", { name: "可编辑拼豆网格", exact: true });
  await grid.focus();
  await grid.press("ArrowRight");
  await grid.press("Enter");
  await expect(page.getByRole("button", { name: "上一步", exact: true })).toBeEnabled();
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  const title = page.getByLabel("作品标题", { exact: true });
  await title.fill("我的拼豆作品");
  await expect(title).toHaveValue("我的拼豆作品");
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
});
