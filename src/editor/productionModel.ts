import { countColors, getBoardSummary } from "@/editor/analysis";
import type { EditorDocumentV1, EditorPaletteEntry } from "@/editor/types";
import { getColorKeyByHex } from "@/utils/colorSystemUtils";

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

export interface ProductionExportOptions {
  readonly paper: ProductionPaper;
  readonly chartStyle?: ProductionChartStyle;
}

export interface ProductionSheetColor {
  readonly key: string;
  readonly color: string;
  readonly symbol: string;
  readonly count: number;
  readonly shortage: number | null;
}

export interface ProductionSheetCell { readonly key: string; readonly color: string }
export interface ProductionSheetCoordinate { readonly index: number; readonly label: string }
export interface ProductionSheetPage {
  readonly number: number;
  readonly boardRow: number;
  readonly boardColumn: number;
  readonly startRow: number;
  readonly startColumn: number;
  readonly rows: number;
  readonly columns: number;
  readonly beadCount: number;
}

export interface ProductionSheetModel {
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
}

const CHART_SYMBOLS: readonly string[] = [
  "X", "O", "+", "=", "/", "\\", "#", "@", "%", "&", "*", "?", "$", "~", "^", "<", ">", "!",
  ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
  ...Array.from("abcdefghijklmnopqrstuvwxyz"),
  ...Array.from("0123456789"),
];

function getPaletteEntry(document: EditorDocumentV1, row: number, column: number): EditorPaletteEntry | null {
  const paletteIndex = document.cells[row * document.width + column];
  if (!paletteIndex) return null;
  const entry = document.palette[paletteIndex];
  return entry && !entry.isExternal ? entry : null;
}

function displayColorKey(document: EditorDocumentV1, entry: EditorPaletteEntry): string {
  const mapped = getColorKeyByHex(entry.color, document.colorSystem);
  return mapped === "?" ? entry.key : mapped;
}

export function buildProductionSheetModel(
  document: EditorDocumentV1,
  options: ProductionExportOptions = { paper: "a4" },
): ProductionSheetModel {
  const summary = getBoardSummary(document);
  const grid = Array.from({ length: document.height }, (_, row) =>
    Array.from({ length: document.width }, (_, column) => {
      const entry = getPaletteEntry(document, row, column);
      return entry ? { key: displayColorKey(document, entry), color: entry.color } : null;
    }),
  );
  const coordinates = (length: number) => Array.from({ length }, (_, index) => index)
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
      ? [{ palette: item.palette, count: item.count, key: displayColorKey(document, item.palette) }]
      : [])
    .toSorted((left, right) => left.key.localeCompare(right.key, "zh-CN", { numeric: true }))
    .map((item, index) => {
      const stock = document.inventory[`${document.colorSystem}:${item.palette.key}`];
      return {
        key: item.key,
        color: item.palette.color,
        symbol: CHART_SYMBOLS[index] ?? `#${index + 1}`,
        count: item.count,
        shortage: stock === undefined || stock >= item.count ? null : item.count - stock,
      };
    });
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
    columnCoordinates: coordinates(document.width),
    rowCoordinates: coordinates(document.height),
    pages,
    colors,
    symbolByKey,
  };
}
