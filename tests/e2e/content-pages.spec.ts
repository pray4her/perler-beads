import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const SITE_URL = "https://perlerbeads.pray4her.xyz";
const SITE_NAME = "拼豆底稿生成器";

interface ContentPageMeta {
  path: string;
  title: string;
  navLabel: string;
}

const tutorialPage: ContentPageMeta = {
  path: "/pattern-tutorial/",
  title: "拼豆图纸怎么画？手绘、表格、在线生成全教程",
  navLabel: "图纸教程",
};
const colorChartPage: ContentPageMeta = {
  path: "/color-chart/",
  title: "拼豆色号对照表：MARD、COCO、漫漫、盼盼、咪小窝",
  navLabel: "色号对照表",
};
const ironingGuidePage: ContentPageMeta = {
  path: "/ironing-guide/",
  title: "拼豆熨烫指南：温度、时间与常见问题",
  navLabel: "熨烫指南",
};
const allContentHrefs = [tutorialPage.path, colorChartPage.path, ironingGuidePage.path];

type JsonLdDoc = Record<string, unknown> & { "@type"?: string };

async function readJsonLd(page: Page): Promise<JsonLdDoc[]> {
  const scripts = page.locator('script[type="application/ld+json"]');
  const docs: JsonLdDoc[] = [];
  for (const text of await scripts.allInnerTexts()) {
    docs.push(JSON.parse(text) as JsonLdDoc);
  }
  return docs;
}

/** 三个内容页共享的骨架断言：标题、唯一 h1、canonical、面包屑与导航 aria-current。 */
async function expectContentChrome(page: Page, meta: ContentPageMeta) {
  await expect(page).toHaveTitle(`${meta.title} | ${SITE_NAME}`);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${SITE_URL}${meta.path}`);

  const breadcrumb = page.getByRole("navigation", { name: "面包屑导航", exact: true });
  const homeLink = breadcrumb.getByRole("link", { name: "返回首页", exact: true });
  await expect(homeLink).toBeVisible();
  await expect(homeLink).toHaveAttribute("href", "/");

  const guidesNav = page.getByRole("navigation", { name: "实用指南导航", exact: true });
  const currentLink = guidesNav.locator('a[aria-current="page"]');
  await expect(currentLink).toHaveCount(1);
  await expect(currentLink).toHaveAttribute("href", meta.path);
  await expect(currentLink).toHaveText(meta.navLabel);
}

test("pattern-tutorial page loads with HowTo JSON-LD and five step screenshots", async ({ page }) => {
  const response = await page.goto("/pattern-tutorial/");
  expect(response?.status()).toBe(200);
  await expectContentChrome(page, tutorialPage);

  const stepImages = page.locator('article img[src^="/tutorial/step-"]');
  await expect(stepImages).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    const image = stepImages.nth(index);
    await image.scrollIntoViewIfNeeded();
    // 懒加载截图在全套件并行运行时可能超过默认 5s 断言超时，放宽到 15s
    await expect
      .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), { timeout: 15_000 })
      .toBeGreaterThan(0);
  }

  const howTo = (await readJsonLd(page)).find((doc) => doc["@type"] === "HowTo");
  expect(howTo).toBeDefined();
  const howToSteps = howTo?.step as { "@type": string }[];
  expect(howToSteps).toHaveLength(5);
  for (const step of howToSteps) {
    expect(step["@type"]).toBe("HowToStep");
  }

  const article = page.locator("article");
  expect(await article.locator('a[href="/color-chart/"]').count()).toBeGreaterThan(0);
  expect(await article.locator('a[href="/ironing-guide/"]').count()).toBeGreaterThan(0);
});

test("color-chart page filters the table by color code and stays accessible", async ({ page }) => {
  const response = await page.goto("/color-chart/");
  expect(response?.status()).toBe(200);
  await expectContentChrome(page, colorChartPage);

  const count = page.locator(".cc-count");
  const fullCountText = await count.innerText();
  expect(fullCountText).toMatch(/^共 \d+ 色$/);

  // 色值只渲染为色块，单元格文本不得出现 HEX 字符串
  const cellTexts = await page.locator(".cc-table td").allInnerTexts();
  expect(cellTexts.length).toBeGreaterThan(0);
  for (const text of cellTexts) {
    expect(text).not.toMatch(/#[0-9A-Fa-f]{6}/);
  }

  const search = page.getByRole("searchbox", { name: "搜索色号", exact: true });
  await search.fill("A01");
  await expect(count).toContainText("匹配");
  await expect(count).not.toHaveText(fullCountText);
  await expect(page.locator(".cc-table tbody tr", { hasText: "A01" }).first()).toBeVisible();

  await page.getByRole("button", { name: "清除搜索", exact: true }).click();
  await expect(count).toHaveText(fullCountText);

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(results.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))).toEqual([]);
});

test("ironing-guide page exposes FAQPage JSON-LD matching the visible accordion", async ({ page }) => {
  const response = await page.goto("/ironing-guide/");
  expect(response?.status()).toBe(200);
  await expectContentChrome(page, ironingGuidePage);

  const faq = (await readJsonLd(page)).find((doc) => doc["@type"] === "FAQPage");
  expect(faq).toBeDefined();
  const questions = faq?.mainEntity as { name: string }[];
  expect(questions.length).toBeGreaterThan(0);

  const summaries = await page.locator("article summary").allInnerTexts();
  for (const question of questions) {
    expect(summaries).toContain(question.name);
  }

  const firstDetails = page.locator("article details").first();
  await firstDetails.locator("summary").click();
  await expect(firstDetails).toHaveJSProperty("open", true);
  await expect(firstDetails.locator("p")).toBeVisible();
});

test("homepage guides section links to the three content pages", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  const guides = page.locator("#guides");
  await guides.scrollIntoViewIfNeeded();
  const cards = guides.locator("a.guide-card");
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(0)).toHaveAttribute("href", "/pattern-tutorial/");
  await expect(cards.nth(1)).toHaveAttribute("href", "/color-chart/");
  await expect(cards.nth(2)).toHaveAttribute("href", "/ironing-guide/");
});

test("english homepage hides every link to the Chinese-only content pages", async ({ page }) => {
  const response = await page.goto("/en/");
  expect(response?.status()).toBe(200);

  await expect(page.locator("#guides")).toHaveCount(0);
  for (const href of allContentHrefs) {
    await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
  }
});
