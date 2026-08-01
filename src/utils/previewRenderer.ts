import { PreviewSettings } from "@/types/editorTypes";
import { MappedPixel } from "@/utils/pixelation";

const fontFamilies: Record<PreviewSettings["fontFamily"], string> = {
  sans: '"Microsoft YaHei", "PingFang SC", system-ui, sans-serif',
  serif: '"Songti SC", "STSong", Georgia, serif',
  mono: '"Cascadia Mono", "SFMono-Regular", monospace',
  handwriting: '"KaiTi", "STKaiti", cursive',
};

export function getPreviewDimensions(aspectRatio: PreviewSettings["aspectRatio"]) {
  const width = 1080;
  if (aspectRatio === "4:5") return { width, height: 1350 };
  if (aspectRatio === "9:16") return { width, height: 1920 };
  return { width, height: 1080 };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export function renderDisplayPreview(
  canvas: HTMLCanvasElement,
  grid: MappedPixel[][],
  settings: PreviewSettings,
) {
  const dimensions = getPreviewDimensions(settings.aspectRatio);
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, dimensions.width, dimensions.height);
  context.fillStyle = settings.backgroundColor;
  context.fillRect(0, 0, dimensions.width, dimensions.height);

  const rows = grid.length;
  const columns = grid[0]?.length ?? 0;
  if (rows === 0 || columns === 0) return;

  const availableWidth = dimensions.width * 0.72 * settings.imageScale;
  const availableHeight = dimensions.height * 0.54 * settings.imageScale;
  const cellSize = Math.max(1, Math.floor(Math.min(availableWidth / columns, availableHeight / rows)));
  const patternWidth = cellSize * columns;
  const patternHeight = cellSize * rows;
  const patternX = Math.round((dimensions.width - patternWidth) / 2);
  const basePatternY = dimensions.height * (settings.aspectRatio === "9:16" ? 0.08 : 0.09);
  const patternY = Math.round(basePatternY + settings.imageOffsetY * dimensions.height * 0.18);

  context.save();
  context.shadowColor = "rgba(20, 20, 19, 0.18)";
  context.shadowBlur = Math.max(16, dimensions.width * 0.035);
  context.shadowOffsetY = Math.max(10, dimensions.width * 0.015);
  roundedRect(context, patternX - 4, patternY - 4, patternWidth + 8, patternHeight + 8, 6);
  context.fillStyle = "rgba(255,255,255,0.94)";
  context.fill();
  context.restore();

  context.imageSmoothingEnabled = false;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const cell = grid[row][col];
      context.fillStyle = cell && !cell.isExternal ? cell.color : "rgba(255,255,255,0)";
      context.fillRect(patternX + col * cellSize, patternY + row * cellSize, cellSize, cellSize);
    }
  }

  const titleY = Math.max(
    patternY + patternHeight + dimensions.height * 0.11,
    dimensions.height * 0.76,
  );
  context.globalAlpha = settings.textOpacity;
  context.fillStyle = settings.textColor;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${settings.fontWeight} ${settings.titleSize * 2.4}px ${fontFamilies[settings.fontFamily]}`;
  context.fillText(settings.title || "未命名作品", dimensions.width / 2, titleY, dimensions.width * 0.78);

  context.font = `400 ${Math.max(28, settings.titleSize * 0.95)}px ${fontFamilies[settings.fontFamily]}`;
  context.fillText(settings.subtitle, dimensions.width / 2, titleY + settings.titleSize * 2.5, dimensions.width * 0.76);
  context.globalAlpha = 1;
}

export function downloadCanvasPng(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  link.remove();
}
