import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import sharp from "sharp";

test("home page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("拼豆底稿生成器 - 把图片变成能照着拼的拼豆图纸");
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
  await expect(page.getByRole("gridcell", { name: /^行 1，列 1，#[0-9A-F]{6}$/ })).toHaveCount(1);
  await grid.focus();
  await grid.press("ArrowRight");
  await grid.press("Enter");
  await expect(page.getByRole("button", { name: "上一步", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "生成参数", exact: true }).click();
  await expect(page.getByRole("heading", { name: "调整生成参数", exact: true })).toBeVisible();
  await expect(page.getByLabel("横轴切割数量", { exact: true })).toHaveValue("48");
  await expect(page.getByRole("button", { name: "应用并重新生成", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "预览", exact: true }).click();
  const title = page.getByLabel("作品标题", { exact: true });
  await title.fill("我的拼豆作品");
  await expect(title).toHaveValue("我的拼豆作品");
  const dimensions = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
});

test("export center prioritizes the making sheet and keeps making options together", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例", exact: true }).click();
  await page.getByRole("button", { name: "导出", exact: true }).click();

  const exportSheet = page.getByRole("dialog", { name: "导出作品", exact: true });
  await expect(exportSheet).toBeVisible();
  const closeExport = exportSheet.getByRole("button", { name: "关闭导出面板", exact: true });
  const displayExport = exportSheet.getByRole("button", { name: "下载展示图 PNG", exact: true });
  const makingImageExport = exportSheet.getByRole("button", { name: "下载制作底稿图片", exact: true });
  await expect(closeExport).toBeVisible();
  await expect(closeExport).toBeFocused();
  await expect(makingImageExport).toBeVisible();
  await expect(displayExport).toBeVisible();
  await expect(exportSheet.getByText("实际制作", { exact: true })).toBeVisible();
  await expect(exportSheet.getByText("分享 / 保存作品", { exact: true })).toBeVisible();
  await expect(exportSheet.getByText("备份 / 交换", { exact: true })).toBeVisible();
  await expect(makingImageExport).toHaveCSS("height", "44px");
  // The making section leads the sheet: its primary action sits above share/export actions.
  const [makingBounds, displayBounds] = await Promise.all([makingImageExport.boundingBox(), displayExport.boundingBox()]);
  expect(makingBounds?.y ?? 0).toBeLessThan(displayBounds?.y ?? 0);
  if (testInfo.project.name === "mobile") {
    const [sheetBounds, viewportWidth] = await Promise.all([
      exportSheet.boundingBox(),
      page.evaluate(() => window.innerWidth),
    ]);
    expect(sheetBounds?.width).toBeCloseTo(viewportWidth, 0);
  }
  await page.screenshot({ path: testInfo.outputPath("export-center-initial.png"), fullPage: true });

  // Preview reflects the chart style toggle before anything is downloaded.
  await exportSheet.getByRole("button", { name: "预览制作底稿", exact: true }).click();
  const previewImage = exportSheet.getByRole("img", { name: /制作底稿预览/ });
  await expect(previewImage).toBeVisible();
  await exportSheet.getByRole("button", { name: "符号", exact: true }).click();
  await expect(previewImage).toBeVisible();
  await exportSheet.getByRole("button", { name: "彩色", exact: true }).click();
  await expect(previewImage).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("export-center-preview.png"), fullPage: true });

  const imageDownload = page.waitForEvent("download");
  await makingImageExport.click();
  expect((await imageDownload).suggestedFilename()).toMatch(/制作底稿-A4\.png$/);

  const displayDownload = page.waitForEvent("download");
  await displayExport.click();
  expect((await displayDownload).suggestedFilename()).toMatch(/展示图\.png$/);

  await exportSheet.getByRole("button", { name: "A3", exact: true }).click();
  const pdfDownload = page.waitForEvent("download");
  await exportSheet.getByRole("button", { name: "下载制作底稿 PDF（A3）", exact: true }).click();
  const pdfFile = await pdfDownload;
  expect(pdfFile.suggestedFilename()).toMatch(/制作底稿-A3\.pdf$/);

  await page.screenshot({ path: testInfo.outputPath("export-center.png"), fullPage: true });
  await exportSheet.getByRole("button", { name: "编辑展示样式", exact: true }).click();
  await expect(page.getByRole("tab", { name: "预览", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await exportSheet.locator(".overflow-y-auto").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(closeExport).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(exportSheet).toHaveCount(0);
  await expect(page.getByRole("button", { name: "导出", exact: true })).toBeFocused();
});

test("export center explains why an empty canvas cannot be downloaded", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入示例", exact: true }).click();
  await page.getByRole("tab", { name: "选择", exact: true }).click();
  await page.getByRole("button", { name: "非透明内容", exact: true }).click();
  await page.getByRole("button", { name: "删除", exact: true }).click();
  await page.getByRole("button", { name: "导出", exact: true }).click();

  const exportSheet = page.getByRole("dialog", { name: "导出作品", exact: true });
  await expect(exportSheet.getByRole("alert")).toHaveText("先添加至少一颗拼豆，再导出作品。");
  await expect(exportSheet.getByRole("button", { name: "下载展示图 PNG", exact: true })).toBeDisabled();
});

test("color-code CSV v2 and legacy HEX CSV both import in the editor", async ({ page }) => {
  const importMessages: string[] = [];
  page.on("dialog", (dialog) => {
    importMessages.push(dialog.message());
    void dialog.accept();
  });
  await page.goto("/");
  const fileInput = page.locator('input[type="file"]').first();

  await fileInput.setInputFiles({
    name: "color-codes-v2.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(["format,version,colorSystem,width,height", "perler-pattern,2,MARD,2,2", "grid", "A01,", "B01,A01"].join("\n")),
  });
  await expect(page.getByRole("grid", { name: "可编辑拼豆网格", exact: true })).toBeVisible();
  await expect.poll(() => importMessages.at(-1)).toContain("成功导入色号网格 CSV");

  await fileInput.setInputFiles({
    name: "legacy-hex.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("#FF0000,TRANSPARENT\n,#00FF00"),
  });
  await expect.poll(() => importMessages.at(-1)).toContain("成功导入历史 HEX CSV");
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

test("bitmap import automatically cleans a confident background and expires undo after editing", async ({ page }, testInfo) => {
  // Given: a PNG with a uniform light background and a centered foreground subject.
  const image = await sharp({
    create: { width: 120, height: 120, channels: 4, background: "#F4F3EE" },
  })
    .composite([
      {
        input: {
          create: { width: 48, height: 48, channels: 4, background: "#C84343" },
        },
        left: 36,
        top: 36,
      },
    ])
    .png()
    .toBuffer();
  await page.goto("/");

  // When: the bitmap is imported, confirmed, and automatically converted to a pattern.
  await page.locator('input[type="file"][accept*="image/jpeg"]').setInputFiles({
    name: "confident-background.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.getByRole("dialog", { name: "整理图片" })).toBeVisible();
  await page.getByRole("button", { name: "完成", exact: true }).click();

  // Then: cleanup is reported with undo, and the first tool operation expires that snapshot.
  const grid = page.getByRole("grid", { name: "可编辑拼豆网格", exact: true });
  await expect(grid).toBeVisible();
  const cleanupStatus = page.getByRole("status").filter({ hasText: "已自动清理背景" });
  await expect(cleanupStatus).toBeVisible();
  await expect(cleanupStatus.getByRole("button", { name: "撤回", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("automatic-background-cleanup.png"), fullPage: true });
  await grid.focus();
  await grid.press("ArrowRight");
  await grid.press("Enter");
  await expect(cleanupStatus).toHaveCount(0);
  await page.getByRole("button", { name: "生成参数", exact: true }).click();
  await expect(page.getByRole("button", { name: "回撤去背景", exact: true })).toBeDisabled();
});
