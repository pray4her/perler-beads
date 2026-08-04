/**
 * 生成 public/og-image.png（1200×630，og/twitter 分享图）。
 * 用 SVG 排版 + sharp 栅格化；文案用英文以避免栅格化环境缺中文字体。
 * 用法：node scripts/generate-og-image.mjs
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";

const WIDTH = 1200;
const HEIGHT = 630;

// 从 favicon 风格的图标取一颗“豆子”视觉：直接用 192 图标作为品牌标记
const icon = readFileSync(new URL("../public/icon-192x192.png", import.meta.url));
const iconBase64 = icon.toString("base64");

// 拼豆点阵装饰：右侧一片规则圆点，呼应 bead pattern
const dotColors = ["#e25563", "#f2a541", "#4f8fdd", "#5fb878", "#9b72cf", "#f2d14b"];
const dots = [];
const dotR = 14;
const gap = 44;
let i = 0;
for (let y = 90; y < HEIGHT - 60; y += gap) {
  for (let x = 820; x < WIDTH - 60; x += gap) {
    const color = dotColors[(i + Math.floor(y / gap)) % dotColors.length];
    dots.push(
      `<circle cx="${x}" cy="${y}" r="${dotR}" fill="${color}"/>` +
        `<circle cx="${x - 4}" cy="${y - 4}" r="4" fill="rgba(255,255,255,0.35)"/>`,
    );
    i++;
  }
}

const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#faf9f5"/>
  <rect x="0" y="${HEIGHT - 12}" width="${WIDTH}" height="12" fill="#141413"/>
  ${dots.join("\n  ")}
  <image x="96" y="200" width="150" height="150" xlink:href="data:image/png;base64,${iconBase64}"/>
  <text x="96" y="440" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#141413">Perler Bead Pattern</text>
  <text x="96" y="516" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="700" fill="#141413">Generator</text>
  <text x="96" y="572" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#6b675f">Turn photos into patterns you can actually bead</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile("public/og-image.png");
console.log("public/og-image.png generated (1200x630)");
