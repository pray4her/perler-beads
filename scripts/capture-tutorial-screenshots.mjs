#!/usr/bin/env node
/**
 * 教程页（/pattern-tutorial/）步骤截图脚本（ADR 0005）。
 *
 * 对静态导出目录 out/ 跑一遍真实流程（上传图片 → 原图整理 → 生成参数 →
 * 编辑工作台 → 导出），重拍教程页引用的 5 张步骤图，写入 public/tutorial/：
 *   step-1-upload.png    首页 hero：「上传图片」「载入示例」+ 原图↔底稿对比组件
 *   step-2-prepare.png   「整理图片」对话框：裁剪框、旋转/水平/垂直、「完成」
 *   step-3-generate.png  「调整生成参数」面板：横轴切割数量/颜色合并阈值/处理模式/色号体系
 *   step-4-edit.png      编辑工作台：画布 + 工具栏（画笔/橡皮/填充）+ 颜色面板
 *   step-5-export.png    「导出作品」面板：纸张大小/图纸样式/下载制作底稿图片
 *
 * 用法：
 *   node scripts/capture-tutorial-screenshots.mjs              # 重拍 5 张步骤图
 *   node scripts/capture-tutorial-screenshots.mjs --page-shot <输出.png>
 *                                                           # 只截 /pattern-tutorial/ 整页（自检用）
 *
 * 前置条件：out/ 已由 `npm run build` 生成（脚本内置零依赖静态服务器，不用 dev server）。
 * UI 改动后重跑本脚本即可让截图保持不过期；重跑后需重新 `npm run build`，
 * 让 out/tutorial/ 同步最新截图。
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "out");
const targetDir = path.join(rootDir, "public", "tutorial");

const VIEWPORT = { width: 1600, height: 1000 }; // 教程页 figure 框为 16:10
const DEVICE_SCALE_FACTOR = 2; // 文字清晰

const SHOTS = [
  "step-1-upload.png",
  "step-2-prepare.png",
  "step-3-generate.png",
  "step-4-edit.png",
  "step-5-export.png",
];

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webmanifest": "application/manifest+json",
};

function fail(message) {
  console.error(`capture-tutorial-screenshots: ${message}`);
  process.exit(1);
}

/** 零依赖静态服务器：托管 out/，处理 trailingSlash 目录的 index.html。 */
function startStaticServer() {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      response.writeHead(400).end("Bad Request");
      return;
    }
    let filePath = path.normalize(path.join(outDir, pathname));
    if (!filePath.startsWith(outDir)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    } else if (!existsSync(filePath) && !path.extname(filePath)) {
      // trailingSlash 静态导出：/pattern-tutorial → /pattern-tutorial/index.html
      const asDirectory = path.join(filePath, "index.html");
      if (existsSync(asDirectory)) filePath = asDirectory;
    }
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      const notFound = path.join(outDir, "404.html");
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      if (existsSync(notFound)) createReadStream(notFound).pipe(response);
      else response.end("Not Found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseURL: `http://127.0.0.1:${port}` });
    });
  });
}

/** 优先用本机 Chrome（与 playwright.config.ts 一致），没有则退回内置 Chromium。 */
async function launchBrowser() {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch (error) {
    console.warn(`未找到本机 Chrome，改用 Playwright 内置 Chromium（${String(error.message).split("\n")[0]}）`);
    return await chromium.launch();
  }
}

/** 生成一张主体清晰、背景单一的示例图（蘑菇），触发与 tests/e2e/editor.spec.ts 相同的整理→生成流程。 */
async function buildSampleImage() {
  return sharp({
    create: { width: 240, height: 240, channels: 4, background: "#F5F3EC" },
  })
    .composite([
      { input: { create: { width: 160, height: 74, channels: 4, background: "#D23B3B" } }, left: 40, top: 48 },
      { input: { create: { width: 26, height: 26, channels: 4, background: "#FFFFFF" } }, left: 66, top: 68 },
      { input: { create: { width: 26, height: 26, channels: 4, background: "#FFFFFF" } }, left: 148, top: 86 },
      { input: { create: { width: 52, height: 76, channels: 4, background: "#4A2F1B" } }, left: 94, top: 122 },
    ])
    .png()
    .toBuffer();
}

/** 等内容画布真正画出非透明像素，再等两帧让网格层也绘制完成（不用固定 sleep）。 */
async function waitForCanvasPaint(page) {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector("canvas.pixel-editor-content-layer");
      if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
      const context = canvas.getContext("2d");
      if (!context) return false;
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let painted = 0;
      for (let index = 3; index < data.length; index += 4000) {
        if (data[index] > 0) painted += 1;
        if (painted > 40) return true;
      }
      return false;
    },
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/** 等自动清理背景 / 重新生成等 toast 自己消失，避免遮挡截图。 */
async function waitForToastGone(page, timeout = 15_000) {
  const toast = page.locator('div.fixed[role="status"]');
  // toast 在生成完成后才出现：先给它一次出现的机会，再等它消失。
  await toast.waitFor({ state: "visible", timeout: 3_000 }).catch(() => {});
  await toast.waitFor({ state: "hidden", timeout }).catch(() => {});
}

/**
 * 等 base-ui Sheet 的滑入动画结束：Playwright 的 visible 不考虑 transform，
 * 面板刚打开时可能还在视口外（translateX(100%)），直接截图会拍不到。
 */
async function waitForSheetSettled(page) {
  await page.locator('[data-slot="sheet-content"]').waitFor({ state: "visible" });
  await page.waitForFunction(
    () => {
      const sheet = document.querySelector('[data-slot="sheet-content"]');
      if (!sheet) return false;
      if (getComputedStyle(sheet).transform !== "none") return false;
      const currentX = sheet.getBoundingClientRect().x;
      const previousX = sheet.__shotSettleX;
      sheet.__shotSettleX = currentX;
      return previousX !== undefined && Math.abs(currentX - previousX) < 0.5;
    },
    null,
    { timeout: 10_000, polling: 100 },
  );
}

async function logWritten(filePath) {
  const metadata = await sharp(filePath).metadata();
  console.log(`已写入 ${path.relative(rootDir, filePath)}（${metadata.width} × ${metadata.height}）`);
}

async function captureStepShots(page, baseURL) {
  mkdirSync(targetDir, { recursive: true });
  for (const name of SHOTS) {
    const filePath = path.join(targetDir, name);
    if (existsSync(filePath)) rmSync(filePath);
  }

  // 第 1 步：首页 hero（上传图片 / 载入示例 + 原图↔底稿对比组件）。
  await page.goto(`${baseURL}/`, { waitUntil: "networkidle" });
  await page
    .getByRole("slider", { name: "拖动比较示例原图和拼豆珠板底稿", exact: true })
    .waitFor({ state: "visible" });
  // framer-motion 入场动画结束（透明度归 1）+ 字体就绪后再截，避免半成品画面。
  await page.waitForFunction(() =>
    [".home-hero-copy", "#home-title", ".home-hero-summary", ".home-hero-actions", ".hero-pattern-demo"].every(
      (selector) => {
        const element = document.querySelector(selector);
        return element !== null && getComputedStyle(element).opacity === "1";
      },
    ),
  );
  await page.evaluate(() => document.fonts.ready);
  const step1 = path.join(targetDir, "step-1-upload.png");
  await page.locator("section.home-hero").screenshot({ path: step1 });
  await logWritten(step1);

  // 第 2 步：上传示例图，进入「整理图片」对话框（载入示例会跳过该界面，所以走真实上传）。
  const sampleImage = await buildSampleImage();
  await page.locator('input[type="file"][accept*="image/jpeg"]').setInputFiles({
    name: "tutorial-sample.png",
    mimeType: "image/png",
    buffer: sampleImage,
  });
  const prepareDialog = page.getByRole("dialog", { name: "整理图片" });
  await prepareDialog.waitFor({ state: "visible" });
  // 等对话框内的预览图加载完（若无 <img> 则立即通过）。
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[role="dialog"] img')).every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  const step2 = path.join(targetDir, "step-2-prepare.png");
  await page.screenshot({ path: step2 });
  await logWritten(step2);

  // 确认整理 → 按默认参数生成底稿并进入编辑工作台。
  await prepareDialog.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("grid", { name: "可编辑拼豆网格", exact: true }).waitFor({ state: "visible" });
  await waitForCanvasPaint(page);
  await waitForToastGone(page); // 「已自动清理背景」toast 约 6 秒后自行消失

  // 第 3 步：打开「生成参数」面板（右侧 Sheet，带遮罩）。
  await page.getByRole("button", { name: "生成参数", exact: true }).click();
  await page.getByRole("heading", { name: "调整生成参数", exact: true }).waitFor({ state: "visible" });
  await page.getByLabel("横轴切割数量", { exact: true }).waitFor({ state: "visible" });
  await waitForSheetSettled(page); // 等滑入动画结束，否则面板可能还在视口外
  const step3 = path.join(targetDir, "step-3-generate.png");
  await page.screenshot({ path: step3 });
  await logWritten(step3);
  // 「应用并重新生成」后面板保持打开（产品设计如此，e2e 同样用 Escape 关闭）。
  await page.getByRole("button", { name: "应用并重新生成", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("heading", { name: "调整生成参数", exact: true }).waitFor({ state: "hidden" });
  await page.getByRole("grid", { name: "可编辑拼豆网格", exact: true }).waitFor({ state: "visible" });
  await waitForCanvasPaint(page);
  await waitForToastGone(page);

  // 第 4 步：编辑工作台（画布 + 左侧工具栏 + 右侧颜色面板，默认即「颜色」页签）。
  // 默认适配缩放（100×100 格约 23%）画面太空，放大几档让图案更清晰。
  const zoomInButton = page.getByRole("button", { name: "放大", exact: true });
  for (let click = 0; click < 4; click += 1) await zoomInButton.click();
  // 初始适配是顶左对齐，以视口中心为锚点放大会让图案偏到角落；点小地图中心把图纸重新居中。
  await page.locator("canvas.pixel-editor-minimap").click();
  await waitForCanvasPaint(page);
  // Escape 关闭面板后焦点留在「生成参数」按钮上（有 focus-visible 红框），
  // 点一下顶栏品牌区把焦点移到 body，同时把鼠标带离画布避免悬停高亮。
  await page.locator(".pixel-editor-brand").click();
  const step4 = path.join(targetDir, "step-4-edit.png");
  await page.screenshot({ path: step4 });
  await logWritten(step4);

  // 第 5 步：导出面板（纸张大小 / 图纸样式 / 下载制作底稿图片）。
  await page.getByRole("button", { name: "导出", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "导出作品", exact: true });
  await exportDialog.waitFor({ state: "visible" });
  await exportDialog.getByRole("button", { name: "下载制作底稿图片", exact: true }).waitFor({ state: "visible" });
  await exportDialog.getByRole("img", { name: /作品缩略图/ }).waitFor({ state: "visible" });
  await waitForSheetSettled(page);
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  const step5 = path.join(targetDir, "step-5-export.png");
  await page.screenshot({ path: step5 });
  await logWritten(step5);
}

async function captureTutorialPage(page, baseURL, outputPath) {
  await page.goto(`${baseURL}/pattern-tutorial/`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // 图片 loading="lazy"：先滚到底再滚回顶，强制五张图全部加载。
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        y += window.innerHeight;
        window.scrollTo(0, y);
        if (y < document.body.scrollHeight) setTimeout(step, 60);
        else resolve();
      };
      step();
    });
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll(".tutorial-figure-frame img")).every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  const absoluteOutput = path.resolve(rootDir, outputPath);
  mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  await page.screenshot({ path: absoluteOutput, fullPage: true });
  await logWritten(absoluteOutput);
}

async function main() {
  if (!existsSync(path.join(outDir, "index.html"))) {
    fail("未找到 out/index.html —— 请先运行 npm run build 生成静态导出，再运行本脚本。");
  }
  const pageShotIndex = process.argv.indexOf("--page-shot");
  const pageShotPath = pageShotIndex === -1 ? null : process.argv[pageShotIndex + 1];
  if (pageShotIndex !== -1 && !pageShotPath) fail("--page-shot 需要一个输出文件路径参数。");

  const { server, baseURL } = await startStaticServer();
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      locale: "zh-CN",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    if (pageShotPath) {
      await captureTutorialPage(page, baseURL, pageShotPath);
    } else {
      await captureStepShots(page, baseURL);
    }
    await context.close();
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => fail(error instanceof Error ? (error.stack ?? error.message) : String(error)));
