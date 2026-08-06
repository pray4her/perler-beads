import { countColors, getBoardSummary } from "@/editor/analysis";
import { editorDocumentToGrid } from "@/editor/document";
import { createPatternCsv } from "@/editor/patternCsv";
import type { EditorDocumentV1, EditorPaletteEntry } from "@/editor/types";
import { getColorKeyByHex } from "@/utils/colorSystemUtils";
import { canvasToPngBlob, getPreviewDimensions, renderDisplayPreview } from "@/utils/previewRenderer";
import { buildProductionSheetModel as buildSharedProductionSheetModel } from "@/editor/productionModel";

export const PRODUCTION_PAPERS = ["a4", "a3"] as const;

export type ProductionPaper = (typeof PRODUCTION_PAPERS)[number];

export const PRODUCTION_CHART_STYLES = ["color", "symbol"] as const;

export type ProductionChartStyle = (typeof PRODUCTION_CHART_STYLES)[number];

export type ExportKind =
  | "display-png"
  | "display-clipboard"
  | "product-png"
  | "production-png"
  | "production-pdf"
  | "pattern-csv"
  | "project";

export type ProductionExportOptions = {
  readonly paper: ProductionPaper;
  readonly chartStyle?: ProductionChartStyle;
};

export type ProductionSheetColor = {
  readonly key: string;
  readonly color: string;
  readonly symbol: string;
  readonly count: number;
  readonly shortage: number | null;
};

export type ProductionSheetCell = {
  readonly key: string;
  readonly color: string;
};

export type ProductionSheetCoordinate = {
  readonly index: number;
  readonly label: string;
};

export type ProductionSheetPage = {
  readonly number: number;
  readonly boardRow: number;
  readonly boardColumn: number;
  readonly startRow: number;
  readonly startColumn: number;
  readonly rows: number;
  readonly columns: number;
  readonly beadCount: number;
};

export type ProductionSheetModel = {
  readonly paper: ProductionPaper;
  readonly name: string;
  readonly colorSystem: string;
  readonly width: number;
  readonly height: number;
  readonly majorGridInterval: number;
  readonly total: number;
  readonly boardColumns: number;
  readonly boardRows: number;
  readonly boardCellColumns: number;
  readonly boardCellRows: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly footerNote: string;
  readonly grid: readonly (readonly (ProductionSheetCell | null)[])[];
  readonly columnCoordinates: readonly ProductionSheetCoordinate[];
  readonly rowCoordinates: readonly ProductionSheetCoordinate[];
  readonly pages: readonly ProductionSheetPage[];
  readonly colors: readonly ProductionSheetColor[];
  readonly symbolByKey: Readonly<Record<string, string>>;
};

// Cross-stitch chart convention: ASCII-only symbols stay crisp as native PDF
// vector text and remain unambiguous when printed in black & white.
const CHART_SYMBOLS: readonly string[] = [
  "X", "O", "+", "=", "/", "\\", "#", "@", "%", "&", "*", "?", "$", "~", "^", "<", ">", "!",
  ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
  ...Array.from("abcdefghijklmnopqrstuvwxyz"),
  ...Array.from("0123456789"),
];

function chartSymbol(index: number): string {
  return CHART_SYMBOLS[index] ?? `#${index + 1}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDocumentPaletteEntry(document: EditorDocumentV1, row: number, column: number): EditorPaletteEntry | null {
  const paletteIndex = document.cells[row * document.width + column];
  if (!paletteIndex) return null;
  const entry = document.palette[paletteIndex];
  return entry && !entry.isExternal ? entry : null;
}

// Palette keys are raw HEX values for image-generated documents (see
// fullBeadPalette in app/page.tsx); the code shown on charts must be the
// color-system code (MARD/COCO/…), exactly like the editor canvas does.
function displayColorKey(document: EditorDocumentV1, entry: EditorPaletteEntry): string {
  const mapped = getColorKeyByHex(entry.color, document.colorSystem);
  return mapped === "?" ? entry.key : mapped;
}

function contrastColor(hex: string): string {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
  return luminance > 0.58 ? "#141413" : "#ffffff";
}

function hexToRgb(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function pageTitle(model: ProductionSheetModel, page: ProductionSheetPage): string {
  return `${model.name} · ${model.colorSystem} · 板 ${page.number}/${model.pages.length}`;
}

function statsLine(model: ProductionSheetModel): string {
  return `${model.colorSystem} · ${model.width} × ${model.height} 格 · ${model.boardColumns} × ${model.boardRows} 块板 · ${model.total.toLocaleString("zh-CN")} 颗 · 约 ${(model.physicalWidthMm / 10).toFixed(1)} × ${(model.physicalHeightMm / 10).toFixed(1)} cm`;
}

function modelColor(
  document: EditorDocumentV1,
  palette: EditorPaletteEntry,
  count: number,
  symbol: string,
  displayKey: string,
): ProductionSheetColor {
  const stock = document.inventory[`${document.colorSystem}:${palette.key}`];
  return {
    key: displayKey,
    color: palette.color,
    symbol,
    count,
    shortage: stock === undefined || stock >= count ? null : count - stock,
  };
}

export function buildProductionSheetModel(
  document: EditorDocumentV1,
  options: ProductionExportOptions = { paper: "a4" },
): ProductionSheetModel {
  const summary = getBoardSummary(document);
  const grid = Array.from({ length: document.height }, (_, row) =>
    Array.from({ length: document.width }, (_, column) => {
      const entry = getDocumentPaletteEntry(document, row, column);
      return entry ? { key: displayColorKey(document, entry), color: entry.color } : null;
    }),
  );
  const coordinateIndices = (length: number) => Array.from({ length }, (_, index) => index)
    .filter((index) => index % document.display.majorGridInterval === 0 || index === length - 1)
    .map((index) => ({ index, label: String(index + 1) }));
  const pages = summary.boards.map((board) => {
    const startRow = board.row * document.board.rows;
    const startColumn = board.col * document.board.columns;
    return {
      number: board.number,
      boardRow: board.row,
      boardColumn: board.col,
      startRow,
      startColumn,
      rows: Math.min(document.board.rows, document.height - startRow),
      columns: Math.min(document.board.columns, document.width - startColumn),
      beadCount: board.count,
    };
  });
  const colors = countColors(document)
    .flatMap((item) => item.palette
      ? [{ palette: item.palette, count: item.count, displayKey: displayColorKey(document, item.palette) }]
      : [])
    .toSorted((left, right) => left.displayKey.localeCompare(right.displayKey, "zh-CN", { numeric: true }))
    .map((item, index) => modelColor(document, item.palette, item.count, chartSymbol(index), item.displayKey));
  const symbolByKey: Record<string, string> = {};
  colors.forEach((color) => {
    if (!(color.key in symbolByKey)) symbolByKey[color.key] = color.symbol;
  });
  return {
    paper: options.paper,
    name: document.name,
    colorSystem: document.colorSystem,
    width: document.width,
    height: document.height,
    majorGridInterval: document.display.majorGridInterval,
    total: summary.total,
    boardColumns: summary.boardColumns,
    boardRows: summary.boardRows,
    boardCellColumns: document.board.columns,
    boardCellRows: document.board.rows,
    physicalWidthMm: summary.physicalWidthMm,
    physicalHeightMm: summary.physicalHeightMm,
    footerNote: document.preview.subtitle.trim(),
    grid,
    columnCoordinates: coordinateIndices(document.width),
    rowCoordinates: coordinateIndices(document.height),
    pages,
    colors,
    symbolByKey,
  };
}

export async function renderProductPng(
  document: EditorDocumentV1,
  options: { readonly scale?: number; readonly background?: string | null } = {},
): Promise<Blob> {
  const scale = clamp(Math.round(options.scale ?? 8), 1, 32);
  const canvas = window.document.createElement("canvas");
  canvas.width = document.width * scale;
  canvas.height = document.height * scale;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建导出画布");
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  for (let row = 0; row < document.height; row += 1) {
    for (let column = 0; column < document.width; column += 1) {
      const entry = getDocumentPaletteEntry(document, row, column);
      if (!entry) continue;
      context.fillStyle = entry.color;
      context.fillRect(column * scale, row * scale, scale, scale);
    }
  }
  return canvasToPngBlob(canvas);
}

export async function renderDisplayPng(document: EditorDocumentV1): Promise<Blob> {
  const dimensions = getPreviewDimensions(document.preview.aspectRatio);
  const canvas = window.document.createElement("canvas");
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  renderDisplayPreview(canvas, editorDocumentToGrid(document), document.preview);
  return canvasToPngBlob(canvas);
}

export async function copyDisplayToClipboard(document: EditorDocumentV1): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("浏览器不支持图片剪贴板");
  }
  const blob = await renderDisplayPng(document);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}

function drawCanvasGrid(
  context: CanvasRenderingContext2D,
  model: ProductionSheetModel,
  cellSize: number,
  gridX: number,
  gridY: number,
  chartStyle: ProductionChartStyle,
): void {
  const gridWidth = model.width * cellSize;
  const gridHeight = model.height * cellSize;
  context.fillStyle = "#ffffff";
  context.fillRect(gridX, gridY, gridWidth, gridHeight);
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let row = 0; row < model.height; row += 1) {
    for (let column = 0; column < model.width; column += 1) {
      const entry = model.grid[row]?.[column] ?? null;
      if (!entry) continue;
      const x = gridX + column * cellSize;
      const y = gridY + row * cellSize;
      if (chartStyle === "color") {
        context.fillStyle = entry.color;
        context.fillRect(x, y, cellSize, cellSize);
        if (cellSize >= 16) {
          context.fillStyle = contrastColor(entry.color);
          context.font = `600 ${Math.max(8, Math.min(15, cellSize * 0.42))}px system-ui, sans-serif`;
          context.fillText(entry.key, x + cellSize / 2, y + cellSize / 2, cellSize - 3);
        }
      } else if (cellSize >= 9) {
        context.fillStyle = "#141413";
        context.font = `700 ${Math.max(7, Math.min(16, cellSize * 0.6))}px system-ui, sans-serif`;
        context.fillText(model.symbolByKey[entry.key] ?? entry.key, x + cellSize / 2, y + cellSize / 2, cellSize - 2);
      }
    }
  }
  // Grid lines are drawn once per boundary (fillRect lines, like the editor
  // canvas) so shared edges never get double-stroked by adjacent cells.
  const interval = Math.max(1, model.majorGridInterval);
  const minorColor = chartStyle === "color" ? "#bbb9b2" : "#8a887f";
  const majorColor = chartStyle === "color" ? "#555550" : "#141413";
  for (let index = 1; index < model.width; index += 1) {
    const major = index % interval === 0;
    context.fillStyle = major ? majorColor : minorColor;
    const x = gridX + index * cellSize;
    context.fillRect(major ? x - 1 : x, gridY, major ? 2 : 1, gridHeight);
  }
  for (let index = 1; index < model.height; index += 1) {
    const major = index % interval === 0;
    context.fillStyle = major ? majorColor : minorColor;
    const y = gridY + index * cellSize;
    context.fillRect(gridX, major ? y - 1 : y, gridWidth, major ? 2 : 1);
  }
  // Strong outer frame delimits the whole chart, per chart-drawing convention.
  context.fillStyle = "#141413";
  context.fillRect(gridX - 2, gridY - 2, gridWidth + 4, 3);
  context.fillRect(gridX - 2, gridY + gridHeight - 1, gridWidth + 4, 3);
  context.fillRect(gridX - 2, gridY - 2, 3, gridHeight + 4);
  context.fillRect(gridX + gridWidth - 1, gridY - 2, 3, gridHeight + 4);
}

function drawCanvasCoordinates(
  context: CanvasRenderingContext2D,
  model: ProductionSheetModel,
  cellSize: number,
  gridX: number,
  gridY: number,
  axisSize: number,
): void {
  context.fillStyle = "#555550";
  context.font = "600 12px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  model.columnCoordinates.forEach((coordinate) => {
    const x = gridX + (coordinate.index + 0.5) * cellSize;
    context.fillText(coordinate.label, x, gridY - axisSize / 2);
    context.fillText(coordinate.label, x, gridY + model.height * cellSize + axisSize / 2);
  });
  model.rowCoordinates.forEach((coordinate) => {
    const y = gridY + (coordinate.index + 0.5) * cellSize;
    context.fillText(coordinate.label, gridX - axisSize / 2, y);
    context.fillText(coordinate.label, gridX + model.width * cellSize + axisSize / 2, y);
  });
}

const MATERIALS_MARGIN = 36;
const MATERIALS_GAP = 14;
const MATERIALS_COLOR_HEIGHT = 54;

function materialsLayout(width: number, colorCount: number, chartStyle: ProductionChartStyle) {
  const contentWidth = width - MATERIALS_MARGIN * 2;
  const columnCount = clamp(Math.floor(contentWidth / 150), 2, 6);
  const cardWidth = (contentWidth - MATERIALS_GAP * (columnCount - 1)) / columnCount;
  const cardHeight = MATERIALS_COLOR_HEIGHT + (chartStyle === "symbol" ? 70 : 52);
  const rows = Math.max(1, Math.ceil(colorCount / columnCount));
  // header (34) + cards + footer note (26) + bottom padding (10)
  const height = 34 + rows * cardHeight + (rows - 1) * MATERIALS_GAP + 26 + 10;
  return { columnCount, cardWidth, cardHeight, rows, height };
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.arcTo(x + width, y, x + width, y + radius, radius);
  context.lineTo(x + width, y + height - radius);
  context.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  context.lineTo(x + radius, y + height);
  context.arcTo(x, y + height, x, y + height - radius, radius);
  context.lineTo(x, y + radius);
  context.arcTo(x, y, x + radius, y, radius);
  context.closePath();
}

function drawCanvasMaterials(
  context: CanvasRenderingContext2D,
  model: ProductionSheetModel,
  startY: number,
  width: number,
  chartStyle: ProductionChartStyle,
): number {
  const layout = materialsLayout(width, model.colors.length, chartStyle);
  context.textBaseline = "alphabetic";
  // Header row: legend title on the left, grand total on the right.
  context.fillStyle = "#141413";
  context.font = "700 18px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText("用料清单", MATERIALS_MARGIN, startY + 4);
  context.font = "700 16px system-ui, sans-serif";
  context.textAlign = "right";
  context.fillText(`共 ${model.total.toLocaleString("zh-CN")} 颗`, width - MATERIALS_MARGIN, startY + 4);

  const cardsTop = startY + 34;
  model.colors.forEach((color, index) => {
    const column = index % layout.columnCount;
    const row = Math.floor(index / layout.columnCount);
    const x = MATERIALS_MARGIN + column * (layout.cardWidth + MATERIALS_GAP);
    const y = cardsTop + row * (layout.cardHeight + MATERIALS_GAP);
    // Card: white rounded body, top color chip carries the color-system code
    // (or its chart symbol), bottom white area carries the bead count.
    context.save();
    roundedRectPath(context, x, y, layout.cardWidth, layout.cardHeight, 10);
    context.clip();
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, layout.cardWidth, layout.cardHeight);
    context.fillStyle = color.color;
    context.fillRect(x, y, layout.cardWidth, MATERIALS_COLOR_HEIGHT);
    context.restore();
    roundedRectPath(context, x, y, layout.cardWidth, layout.cardHeight, 10);
    context.strokeStyle = "#e3e1da";
    context.lineWidth = 1;
    context.stroke();

    context.textAlign = "center";
    context.textBaseline = "middle";
    const centerX = x + layout.cardWidth / 2;
    const colorCenterY = y + MATERIALS_COLOR_HEIGHT / 2;
    if (chartStyle === "symbol") {
      context.fillStyle = contrastColor(color.color);
      context.font = "700 20px system-ui, sans-serif";
      context.fillText(color.symbol, centerX, colorCenterY, layout.cardWidth - 16);
      context.fillStyle = "#555550";
      context.font = "600 12px system-ui, sans-serif";
      context.fillText(color.key, centerX, y + MATERIALS_COLOR_HEIGHT + 16, layout.cardWidth - 16);
      context.fillStyle = "#141413";
      context.font = "700 15px system-ui, sans-serif";
      context.fillText(color.count.toLocaleString("zh-CN"), centerX, y + MATERIALS_COLOR_HEIGHT + 38);
      if (color.shortage) {
        context.fillStyle = "#b42318";
        context.font = "600 11px system-ui, sans-serif";
        context.fillText(`缺 ${color.shortage.toLocaleString("zh-CN")}`, centerX, y + MATERIALS_COLOR_HEIGHT + 58);
      }
    } else {
      context.fillStyle = contrastColor(color.color);
      context.font = "700 18px system-ui, sans-serif";
      context.fillText(color.key, centerX, colorCenterY, layout.cardWidth - 16);
      context.fillStyle = "#141413";
      context.font = "700 15px system-ui, sans-serif";
      context.fillText(color.count.toLocaleString("zh-CN"), centerX, y + MATERIALS_COLOR_HEIGHT + 24);
      if (color.shortage) {
        context.fillStyle = "#b42318";
        context.font = "600 11px system-ui, sans-serif";
        context.fillText(`缺 ${color.shortage.toLocaleString("zh-CN")}`, centerX, y + MATERIALS_COLOR_HEIGHT + 42);
      }
    }
  });

  // Footer: the configured site address (preview subtitle), bottom-left.
  if (model.footerNote) {
    const footerY = cardsTop + layout.rows * layout.cardHeight + (layout.rows - 1) * MATERIALS_GAP + 26;
    context.fillStyle = "#8a887f";
    context.font = "500 13px system-ui, sans-serif";
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillText(model.footerNote, MATERIALS_MARGIN, footerY);
  }
  return layout.height;
}

export async function renderProductionPng(
  document: EditorDocumentV1,
  options: ProductionExportOptions = { paper: "a4" },
): Promise<Blob> {
  const chartStyle = options.chartStyle ?? "color";
  const model = buildSharedProductionSheetModel(document, options);
  const cellSize = clamp(Math.floor(4_800 / Math.max(model.width, model.height)), 10, 28);
  const axisSize = 30;
  const titleHeight = 92;
  const gridWidth = model.width * cellSize;
  const gridHeight = model.height * cellSize;
  const width = Math.max(880, gridWidth + axisSize * 2 + 72);
  const materialsHeight = materialsLayout(width, model.colors.length, chartStyle).height;
  const height = titleHeight + axisSize * 2 + gridHeight + materialsHeight + 54;
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建制作底稿画布");
  context.fillStyle = "#faf9f5";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#141413";
  context.font = "700 28px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(chartStyle === "symbol" ? `${model.name}（符号图纸）` : model.name, 36, 40);
  context.fillStyle = "#555550";
  context.font = "500 15px system-ui, sans-serif";
  context.fillText(statsLine(model), 36, 66);
  const gridX = 36 + axisSize;
  const gridY = titleHeight + axisSize;
  drawCanvasGrid(context, model, cellSize, gridX, gridY, chartStyle);
  drawCanvasCoordinates(context, model, cellSize, gridX, gridY, axisSize);
  drawCanvasMaterials(context, model, gridY + gridHeight + axisSize + 24, width, chartStyle);
  return canvasToPngBlob(canvas);
}

// --- PDF (jsPDF, vector, mm) ---

type PdfInstance = import("jspdf").jsPDF;

const PT_TO_MM = 25.4 / 72;

function containsNonAscii(text: string): boolean {
  // jsPDF's 14 standard fonts only cover ASCII; anything beyond (Chinese
  // labels like 制作摘要 / 颗 / 缺, the · separator, …) must be rasterized
  // through a canvas, which renders with the browser's native CJK fonts.
  return /[^\x20-\x7E]/.test(text);
}

type RasterizedPdfText = {
  readonly data: string;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly baselineMm: number;
};

const rasterizedPdfTextCache = new Map<string, RasterizedPdfText>();

function rasterizePdfText(text: string, sizePt: number, weight: number, color: string): RasterizedPdfText {
  const cacheKey = `${text}|${sizePt}|${weight}|${color}`;
  const cached = rasterizedPdfTextCache.get(cacheKey);
  if (cached) return cached;
  const scale = 4;
  const fontPx = sizePt * scale;
  const canvas = window.document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建 PDF 文字画布");
  context.font = `${weight} ${fontPx}px system-ui, sans-serif`;
  const measuredWidth = Math.ceil(context.measureText(text).width);
  const baselinePx = Math.round(fontPx * 1.05);
  canvas.width = Math.max(1, measuredWidth + scale * 2);
  canvas.height = Math.max(1, Math.round(fontPx * 1.45));
  // Resizing the canvas resets its state, so re-apply font and fill the page
  // background (jsPDF cannot be relied on to preserve PNG alpha channels).
  context.font = `${weight} ${fontPx}px system-ui, sans-serif`;
  context.textBaseline = "alphabetic";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = color;
  context.fillText(text, scale, baselinePx);
  const rasterized: RasterizedPdfText = {
    data: canvas.toDataURL("image/png"),
    widthMm: (canvas.width / scale) * PT_TO_MM,
    heightMm: (canvas.height / scale) * PT_TO_MM,
    baselineMm: (baselinePx / scale) * PT_TO_MM,
  };
  if (rasterizedPdfTextCache.size > 500) rasterizedPdfTextCache.clear();
  rasterizedPdfTextCache.set(cacheKey, rasterized);
  return rasterized;
}

type PdfTextOptions = {
  readonly size: number;
  readonly color: string;
  readonly align?: "left" | "center" | "right";
  readonly weight?: number;
  readonly maxWidth?: number;
};

function drawPdfText(pdf: PdfInstance, text: string, x: number, baselineY: number, options: PdfTextOptions): void {
  const align = options.align ?? "left";
  const weight = options.weight ?? 400;
  if (!containsNonAscii(text)) {
    pdf.setFont("helvetica", weight >= 600 ? "bold" : "normal");
    pdf.setFontSize(options.size);
    const [red, green, blue] = hexToRgb(options.color);
    pdf.setTextColor(red, green, blue);
    pdf.text(text, x, baselineY, { align, ...(options.maxWidth ? { maxWidth: options.maxWidth } : {}) });
    return;
  }
  const rasterized = rasterizePdfText(text, options.size, weight, options.color);
  let { widthMm, heightMm, baselineMm } = rasterized;
  if (options.maxWidth && widthMm > options.maxWidth) {
    const ratio = options.maxWidth / widthMm;
    widthMm *= ratio;
    heightMm *= ratio;
    baselineMm *= ratio;
  }
  const left = align === "right" ? x - widthMm : align === "center" ? x - widthMm / 2 : x;
  pdf.addImage(rasterized.data, "PNG", left, baselineY - baselineMm, widthMm, heightMm);
}

function drawPdfGridLines(
  pdf: PdfInstance,
  model: ProductionSheetModel,
  page: ProductionSheetPage,
  cell: number,
  gridX: number,
  gridY: number,
  chartStyle: ProductionChartStyle,
): void {
  // One vector line per boundary: major lines every majorGridInterval
  // boundaries (counting aid), minor lines elsewhere, strong outer frame.
  const interval = Math.max(1, model.majorGridInterval);
  const minorGray = chartStyle === "color" ? 180 : 130;
  const majorGray = chartStyle === "color" ? 85 : 20;
  const gridWidth = page.columns * cell;
  const gridHeight = page.rows * cell;
  for (let index = 1; index < page.columns; index += 1) {
    const major = (page.startColumn + index) % interval === 0;
    pdf.setDrawColor(major ? majorGray : minorGray);
    pdf.setLineWidth(major ? 0.3 : 0.08);
    const x = gridX + index * cell;
    pdf.line(x, gridY, x, gridY + gridHeight);
  }
  for (let index = 1; index < page.rows; index += 1) {
    const major = (page.startRow + index) % interval === 0;
    pdf.setDrawColor(major ? majorGray : minorGray);
    pdf.setLineWidth(major ? 0.3 : 0.08);
    const y = gridY + index * cell;
    pdf.line(gridX, y, gridX + gridWidth, y);
  }
  pdf.setDrawColor(20, 20, 19);
  pdf.setLineWidth(0.6);
  pdf.rect(gridX, gridY, gridWidth, gridHeight);
}

function drawPdfPage(
  pdf: PdfInstance,
  model: ProductionSheetModel,
  page: ProductionSheetPage,
  chartStyle: ProductionChartStyle,
): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const axis = 7;
  const titleHeight = 18;
  const cell = Math.min(
    (pageWidth - margin * 2 - axis * 2) / page.columns,
    (pageHeight - margin * 2 - titleHeight - axis * 2 - 12) / page.rows,
  );
  const gridX = margin + axis;
  const gridY = margin + titleHeight + axis;
  drawPdfText(pdf, pageTitle(model, page), margin, margin + 5, { size: 13, color: "#141413", weight: 700 });
  drawPdfText(pdf, `${page.columns} × ${page.rows} 格 · ${page.beadCount.toLocaleString("zh-CN")} 颗`, pageWidth - margin, margin + 5, { size: 8, color: "#555550", align: "right" });

  for (let row = 0; row < page.rows; row += 1) {
    for (let column = 0; column < page.columns; column += 1) {
      const entry = model.grid[page.startRow + row]?.[page.startColumn + column] ?? null;
      if (!entry) continue;
      const x = gridX + column * cell;
      const y = gridY + row * cell;
      if (chartStyle === "color") {
        pdf.setFillColor(entry.color);
        pdf.rect(x, y, cell, cell, "F");
        if (cell >= 4) {
          drawPdfText(pdf, entry.key, x + cell / 2, y + cell * 0.62, {
            size: clamp(cell * 0.55, 4, 7),
            color: contrastColor(entry.color),
            align: "center",
            maxWidth: Math.max(1, cell - 0.5),
          });
        }
      } else if (cell >= 2.5) {
        drawPdfText(pdf, model.symbolByKey[entry.key] ?? entry.key, x + cell / 2, y + cell * 0.68, {
          size: clamp(cell * 1.7, 4, 9),
          color: "#141413",
          align: "center",
          weight: 700,
          maxWidth: Math.max(1, cell - 0.4),
        });
      }
    }
  }

  drawPdfGridLines(pdf, model, page, cell, gridX, gridY, chartStyle);

  model.columnCoordinates
    .filter((coordinate) => coordinate.index >= page.startColumn && coordinate.index < page.startColumn + page.columns)
    .forEach((coordinate) => {
      const x = gridX + (coordinate.index - page.startColumn + 0.5) * cell;
      drawPdfText(pdf, coordinate.label, x, gridY - 2, { size: 6, color: "#555550", align: "center" });
      drawPdfText(pdf, coordinate.label, x, gridY + page.rows * cell + 4, { size: 6, color: "#555550", align: "center" });
    });
  model.rowCoordinates
    .filter((coordinate) => coordinate.index >= page.startRow && coordinate.index < page.startRow + page.rows)
    .forEach((coordinate) => {
      const y = gridY + (coordinate.index - page.startRow + 0.6) * cell;
      drawPdfText(pdf, coordinate.label, gridX - 2, y, { size: 6, color: "#555550", align: "right" });
      drawPdfText(pdf, coordinate.label, gridX + page.columns * cell + 2, y, { size: 6, color: "#555550" });
    });
}

function drawPdfOverview(pdf: PdfInstance, model: ProductionSheetModel): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  drawPdfText(pdf, `${model.name} · 整体预览`, margin, margin + 6, { size: 15, color: "#141413", weight: 700 });
  drawPdfText(pdf, statsLine(model), margin, margin + 14, { size: 9, color: "#555550" });
  drawPdfText(pdf, "加粗线为拼豆板边界；每块板对应一页分板图纸，用料清单位于最后一页。", margin, margin + 21, { size: 8, color: "#555550" });
  const top = margin + 26;
  const bottom = pageHeight - margin - 10;
  const cell = Math.min((pageWidth - margin * 2) / model.width, (bottom - top) / model.height);
  const gridWidth = model.width * cell;
  const gridHeight = model.height * cell;
  const gridX = margin + (pageWidth - margin * 2 - gridWidth) / 2;
  const gridY = top + (bottom - top - gridHeight) / 2;
  for (let row = 0; row < model.height; row += 1) {
    for (let column = 0; column < model.width; column += 1) {
      const entry = model.grid[row]?.[column] ?? null;
      if (!entry) continue;
      pdf.setFillColor(entry.color);
      pdf.rect(gridX + column * cell, gridY + row * cell, cell, cell, "F");
    }
  }
  // Bold lines at physical pegboard boundaries so boards are easy to locate.
  pdf.setDrawColor(85, 85, 85);
  pdf.setLineWidth(0.3);
  for (let column = model.boardCellColumns; column < model.width; column += model.boardCellColumns) {
    const x = gridX + column * cell;
    pdf.line(x, gridY, x, gridY + gridHeight);
  }
  for (let row = model.boardCellRows; row < model.height; row += model.boardCellRows) {
    const y = gridY + row * cell;
    pdf.line(gridX, y, gridX + gridWidth, y);
  }
  pdf.setDrawColor(20, 20, 19);
  pdf.setLineWidth(0.6);
  pdf.rect(gridX, gridY, gridWidth, gridHeight);
}

function drawPdfMaterials(pdf: PdfInstance, model: ProductionSheetModel, chartStyle: ProductionChartStyle): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 12;
  drawPdfText(pdf, "制作摘要", margin, margin + 5, { size: 15, color: "#141413", weight: 700 });
  drawPdfText(pdf, `共 ${model.total.toLocaleString("zh-CN")} 颗 · ${model.boardColumns} × ${model.boardRows} 块板 · 约 ${(model.physicalWidthMm / 10).toFixed(1)} × ${(model.physicalHeightMm / 10).toFixed(1)} cm`, margin, margin + 13, { size: 9, color: "#555550" });
  drawPdfText(pdf, chartStyle === "symbol" ? "用料清单（符号对照）" : "用料清单", margin, margin + 27, { size: 13, color: "#141413", weight: 700 });
  const columnCount = 3;
  const rowHeight = 9;
  model.colors.forEach((color, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const x = margin + column * ((pageWidth - margin * 2) / columnCount);
    const y = margin + 38 + row * rowHeight;
    let chipX = x;
    if (chartStyle === "symbol") {
      pdf.setDrawColor(115, 115, 110);
      pdf.setLineWidth(0.1);
      pdf.rect(x, y - 4, 6, 6);
      drawPdfText(pdf, color.symbol, x + 3, y + 1, { size: 7, color: "#141413", align: "center", weight: 700 });
      chipX = x + 8.5;
    }
    pdf.setFillColor(color.color);
    pdf.rect(chipX, y - 4, 6, 6, "F");
    pdf.setDrawColor(115, 115, 110);
    pdf.setLineWidth(0.1);
    pdf.rect(chipX, y - 4, 6, 6);
    drawPdfText(pdf, `${color.key}  ${color.count.toLocaleString("zh-CN")}${color.shortage ? ` · 缺 ${color.shortage.toLocaleString("zh-CN")}` : ""}`, chipX + 9, y, { size: 8, color: "#141413" });
  });
  if (model.footerNote) {
    drawPdfText(pdf, model.footerNote, margin, pdf.internal.pageSize.getHeight() - 12, { size: 7.5, color: "#8a887f" });
  }
}

function drawPdfFooter(pdf: PdfInstance, pageNumber: number, totalPages: number): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 12;
  const y = pageHeight - 7;
  drawPdfText(pdf, "请按 100% 比例打印，勿使用「适应页面」。", margin, y, { size: 7.5, color: "#555550" });
  drawPdfText(pdf, `第 ${pageNumber} / ${totalPages} 页`, pageWidth - margin, y, { size: 7.5, color: "#555550", align: "right" });
}

export async function exportPatternPdf(
  document: EditorDocumentV1,
  options: ProductionExportOptions = { paper: "a4" },
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const chartStyle = options.chartStyle ?? "color";
  const model = buildSharedProductionSheetModel(document, options);
  const orientation = model.width >= model.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "mm", format: model.paper });
  // Layout: page 1 overview map, one page per pegboard, final summary page.
  const totalPages = model.pages.length + 2;
  drawPdfOverview(pdf, model);
  drawPdfFooter(pdf, 1, totalPages);
  model.pages.forEach((page, index) => {
    pdf.addPage(model.paper, orientation);
    drawPdfPage(pdf, model, page, chartStyle);
    drawPdfFooter(pdf, index + 2, totalPages);
  });
  pdf.addPage(model.paper, "portrait");
  drawPdfMaterials(pdf, model, chartStyle);
  drawPdfFooter(pdf, totalPages, totalPages);
  return pdf.output("blob");
}

export { createPatternCsv };
