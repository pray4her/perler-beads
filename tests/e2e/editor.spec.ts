import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("home page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("拼豆底稿生成器");
  await expect(page.getByRole("heading", { name: "把图片变成能拼的底稿", exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: "拖动比较示例原图和拼豆珠板底稿", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "戴着小动物发饰的 Q 版人物示例原图", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "由示例原图生成的 48 × 48 拼豆珠板底稿", exact: true })).toBeVisible();
  await expect(page.getByText("图片仅在本机处理", { exact: true })).toBeVisible();
  await expect(page.locator('script[src*="busuanzi"]')).toHaveCount(0);
  await expect(page.locator(".support-rail")).toHaveCount(0);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});

test("sample opens the keyboard-accessible editor and updates preview text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例", exact: true }).click();
  const grid = page.getByRole("grid", { name: "可编辑拼豆网格", exact: true });
  await expect(grid).toBeVisible();
  await expect(page.getByRole("gridcell", { name: "行 1，列 1，#A58767", exact: true })).toHaveCount(1);
  await grid.focus();
  await grid.press("ArrowRight");
  await grid.press("Enter");
  await expect(page.getByRole("button", { name: "上一步", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "生成参数", exact: true }).click();
  await expect(page.getByRole("heading", { name: "调整生成参数", exact: true })).toBeVisible();
  await expect(page.getByLabel("横轴切割数量 (10-300，默认 100)", { exact: true })).toHaveValue("48");
  await expect(page.getByRole("button", { name: "应用并重新生成", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  const title = page.getByLabel("作品标题", { exact: true });
  await title.fill("我的拼豆作品");
  await expect(title).toHaveValue("我的拼豆作品");
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
});

test("finishing the editor returns home without discarding the current pattern", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例", exact: true }).click();
  await expect(page.getByRole("grid", { name: "可编辑拼豆网格", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  const hero = page.locator(".home-hero");
  await expect(hero.getByRole("button", { name: "继续当前底稿", exact: true })).toBeVisible();
  await hero.getByRole("button", { name: "继续当前底稿", exact: true }).click();
  await expect(page.getByRole("grid", { name: "可编辑拼豆网格", exact: true })).toBeVisible();
});
