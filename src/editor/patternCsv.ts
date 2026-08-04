import { MAX_CANVAS_SIZE, type EditorDocumentV1 } from "@/editor/types";
import {
  convertColorKeyToHex,
  isValidColorInSystem,
  type ColorSystem,
} from "@/utils/colorSystemUtils";
import type { MappedPixel } from "@/utils/pixelation";

const CSV_HEADER = ["format", "version", "colorSystem", "width", "height"] as const;
const CSV_FORMAT = "perler-pattern";
const CSV_VERSION = "2";
const COLOR_SYSTEMS = ["MARD", "COCO", "漫漫", "盼盼", "咪小窝"] as const satisfies readonly ColorSystem[];

export type PatternCsvImport = {
  readonly kind: "success";
  readonly source: "v2" | "legacy-hex";
  readonly colorSystem: ColorSystem | null;
  readonly mappedPixelData: MappedPixel[][];
  readonly gridDimensions: { readonly N: number; readonly M: number };
};

export type PatternCsvImportFailure = {
  readonly kind: "error";
  readonly message: string;
};

export type PatternCsvImportResult = PatternCsvImport | PatternCsvImportFailure;

function quoteCsvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function parseCsvRow(line: string): readonly string[] | null {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  let afterQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = false;
          afterQuote = true;
        }
      } else {
        value += character;
      }
      continue;
    }

    if (afterQuote) {
      if (character === ",") {
        cells.push(value);
        value = "";
        afterQuote = false;
        continue;
      }
      return null;
    }

    if (character === ",") {
      cells.push(value);
      value = "";
    } else if (character === '"' && value.length === 0) {
      quoted = true;
    } else {
      value += character;
    }
  }

  if (quoted) return null;
  cells.push(value);
  return cells;
}

function parsePositiveDimension(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_CANVAS_SIZE) return null;
  return parsed;
}

function isColorSystem(value: string): value is ColorSystem {
  return COLOR_SYSTEMS.some((colorSystem) => colorSystem === value);
}

function success(
  source: PatternCsvImport["source"],
  colorSystem: ColorSystem | null,
  mappedPixelData: MappedPixel[][],
): PatternCsvImport {
  return {
    kind: "success",
    source,
    colorSystem,
    mappedPixelData,
    gridDimensions: {
      N: mappedPixelData[0]?.length ?? 0,
      M: mappedPixelData.length,
    },
  };
}

function error(message: string): PatternCsvImportFailure {
  return { kind: "error", message };
}

function transparentCell(): MappedPixel {
  return { key: "TRANSPARENT", color: "#FFFFFF", isExternal: true };
}

function parseV2(lines: readonly string[]): PatternCsvImportResult {
  const header = parseCsvRow(lines[0] ?? "");
  const metadata = parseCsvRow(lines[1] ?? "");
  if (!header || header.length !== CSV_HEADER.length || !header.every((value, index) => value === CSV_HEADER[index])) {
    return error("CSV v2 表头无效");
  }
  if (!metadata || metadata.length !== CSV_HEADER.length) return error("CSV v2 元数据无效");
  if (metadata[0] !== CSV_FORMAT || metadata[1] !== CSV_VERSION) return error("不支持的 CSV 版本");
  if (!isColorSystem(metadata[2])) return error(`不支持的色号体系：${metadata[2] || "空值"}`);
  const width = parsePositiveDimension(metadata[3]);
  const height = parsePositiveDimension(metadata[4]);
  if (!width || !height) return error(`CSV v2 尺寸必须是 1 到 ${MAX_CANVAS_SIZE} 的整数`);
  if (lines[2] !== "grid") return error("CSV v2 缺少色号网格标记");
  if (lines.length - 3 !== height) return error(`CSV v2 行数不匹配：声明 ${height} 行，实际 ${lines.length - 3} 行`);

  const mappedPixelData: MappedPixel[][] = [];
  for (let row = 0; row < height; row += 1) {
    const values = parseCsvRow(lines[row + 3] ?? "");
    if (!values) return error(`第 ${row + 1} 行 CSV 格式无效`);
    if (values.length !== width) return error(`第 ${row + 1} 行列数不匹配：应为 ${width} 列，实际 ${values.length} 列`);
    const mappedRow: MappedPixel[] = [];
    for (let column = 0; column < width; column += 1) {
      const code = values[column]?.trim() ?? "";
      if (!code) {
        mappedRow.push(transparentCell());
        continue;
      }
      const color = convertColorKeyToHex(code, metadata[2]);
      if (!/^#[\dA-F]{6}$/i.test(color) || !isValidColorInSystem(color.toUpperCase(), metadata[2])) {
        return error(`第 ${row + 1} 行第 ${column + 1} 列的色号无效：${code}`);
      }
      mappedRow.push({ key: code, color: color.toUpperCase(), isExternal: false });
    }
    mappedPixelData.push(mappedRow);
  }

  return success("v2", metadata[2], mappedPixelData);
}

function parseLegacyHex(lines: readonly string[]): PatternCsvImportResult {
  const firstRow = parseCsvRow(lines[0] ?? "");
  if (!firstRow || firstRow.length === 0) return error("CSV 文件格式无效");
  if (firstRow.length > MAX_CANVAS_SIZE || lines.length > MAX_CANVAS_SIZE) {
    return error(`CSV 尺寸不能超过 ${MAX_CANVAS_SIZE} × ${MAX_CANVAS_SIZE}`);
  }
  const mappedPixelData: MappedPixel[][] = [];
  for (let row = 0; row < lines.length; row += 1) {
    const values = parseCsvRow(lines[row] ?? "");
    if (!values) return error(`第 ${row + 1} 行 CSV 格式无效`);
    if (values.length !== firstRow.length) {
      return error(`第 ${row + 1} 行列数不匹配：应为 ${firstRow.length} 列，实际 ${values.length} 列`);
    }
    const mappedRow: MappedPixel[] = [];
    for (let column = 0; column < values.length; column += 1) {
      const value = values[column]?.trim() ?? "";
      if (!value || value.toUpperCase() === "TRANSPARENT") {
        mappedRow.push(transparentCell());
        continue;
      }
      if (!/^#[\dA-F]{6}$/i.test(value)) {
        return error(`第 ${row + 1} 行第 ${column + 1} 列的颜色值无效：${value}`);
      }
      const color = value.toUpperCase();
      mappedRow.push({ key: color, color, isExternal: false });
    }
    mappedPixelData.push(mappedRow);
  }
  return success("legacy-hex", null, mappedPixelData);
}

export function parsePatternCsv(source: string): PatternCsvImportResult {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalized.trim()) return error("CSV 文件为空");
  const lines = normalized.split("\n");
  while (lines.at(-1) === "") lines.pop();
  const firstRow = parseCsvRow(lines[0] ?? "");
  if (firstRow?.[0] === "format") return parseV2(lines);
  return parseLegacyHex(lines);
}

export function createPatternCsv(document: EditorDocumentV1): Blob {
  const metadata = [CSV_FORMAT, CSV_VERSION, document.colorSystem, String(document.width), String(document.height)];
  const rows = [CSV_HEADER.join(","), metadata.map(quoteCsvCell).join(","), "grid"];
  for (let row = 0; row < document.height; row += 1) {
    const values: string[] = [];
    for (let column = 0; column < document.width; column += 1) {
      const paletteIndex = document.cells[row * document.width + column];
      const entry = document.palette[paletteIndex];
      values.push(paletteIndex && entry && !entry.isExternal ? entry.key : "");
    }
    rows.push(values.map(quoteCsvCell).join(","));
  }
  return new Blob(["\uFEFF", rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
}
