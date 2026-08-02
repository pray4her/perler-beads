import type { MappedPixel } from "@/utils/pixelation";
import { TRANSPARENT_KEY, transparentColorData } from "@/utils/pixelEditingUtils";
import {
  EDITOR_DOCUMENT_VERSION,
  MAX_CANVAS_SIZE,
  TRANSPARENT_PALETTE_INDEX,
  type CanvasAnchor,
  type EditorDocumentV1,
  type EditorPaletteEntry,
  type EditorPreviewSettings,
  type SelectionBounds,
} from "@/editor/types";

export const defaultEditorPreviewSettings: EditorPreviewSettings = {
  title: "可更改此文字",
  subtitle: "perlerbeads.zippland.com",
  fontFamily: "sans",
  titleFontWeight: "600",
  subtitleFontWeight: "400",
  titleSize: 34,
  subtitleSize: 18,
  titleColor: "#777772",
  subtitleColor: "#777772",
  titleOpacity: 0.45,
  subtitleOpacity: 0.45,
  titleLineHeight: 1.2,
  subtitleLineHeight: 1.4,
  backgroundColor: "#f4f3ee",
  backgroundOpacity: 1,
  imageOpacity: 1,
  imageScale: 0.9,
  imageOffsetX: 0,
  imageOffsetY: 0,
  titleOffsetX: 0,
  titleOffsetY: 0,
  subtitleOffsetX: 0,
  subtitleOffsetY: 0,
  safeArea: 0.06,
  aspectRatio: "1:1",
};

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `perler-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function cloneEditorDocument(document: EditorDocumentV1): EditorDocumentV1 {
  return {
    ...document,
    palette: document.palette.map((entry) => ({ ...entry })),
    cells: document.cells.slice(),
    baseline: document.baseline?.slice(),
    display: { ...document.display },
    preview: { ...document.preview },
    board: { ...document.board },
    reference: document.reference ? { ...document.reference } : undefined,
    inventory: { ...document.inventory },
    stamps: document.stamps.map((stamp) => ({ ...stamp, cells: stamp.cells.slice() })),
  };
}

export function createEditorDocument(
  grid: MappedPixel[][],
  colorSystem: EditorDocumentV1["colorSystem"],
  name = "未命名拼豆图",
): EditorDocumentV1 {
  const height = Math.max(1, Math.min(MAX_CANVAS_SIZE, grid.length));
  const width = Math.max(1, Math.min(MAX_CANVAS_SIZE, grid[0]?.length ?? 1));
  const palette: EditorPaletteEntry[] = [{ ...transparentColorData }];
  const paletteIndex = new Map<string, number>([[TRANSPARENT_KEY, TRANSPARENT_PALETTE_INDEX]]);
  const cells = new Uint16Array(width * height);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const cell = grid[row]?.[col] ?? transparentColorData;
      if (cell.isExternal || cell.key === TRANSPARENT_KEY) continue;
      const key = `${cell.key}\u0000${cell.color.toUpperCase()}`;
      let index = paletteIndex.get(key);
      if (index === undefined) {
        index = palette.length;
        paletteIndex.set(key, index);
        palette.push({ key: cell.key, color: cell.color.toUpperCase(), isExternal: false });
      }
      cells[row * width + col] = index;
    }
  }

  const now = Date.now();
  return {
    version: EDITOR_DOCUMENT_VERSION,
    id: createId(),
    name,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    width,
    height,
    colorSystem,
    palette,
    cells,
    baseline: cells.slice(),
    display: {
      gridVisibility: "auto",
      codeVisibility: "auto",
      majorGridInterval: 5,
      tiledPreview: false,
    },
    preview: { ...defaultEditorPreviewSettings },
    board: {
      preset: "29x29",
      columns: 29,
      rows: 29,
      beadDiameterMm: 5,
      pitchMm: 5,
    },
    inventory: {},
    stamps: [],
  };
}

export function editorDocumentToGrid(document: EditorDocumentV1): MappedPixel[][] {
  return Array.from({ length: document.height }, (_, row) =>
    Array.from({ length: document.width }, (_, col) => {
      const entry = document.palette[document.cells[row * document.width + col]];
      return entry && !entry.isExternal && entry.key !== TRANSPARENT_KEY
        ? { ...entry, isExternal: false }
        : { ...transparentColorData };
    }),
  );
}

export function ensurePaletteEntry(document: EditorDocumentV1, entry: EditorPaletteEntry): number {
  const normalizedColor = entry.color.toUpperCase();
  const index = document.palette.findIndex(
    (candidate) => candidate.key === entry.key && candidate.color.toUpperCase() === normalizedColor,
  );
  if (index >= 0) return index;
  if (document.palette.length >= 65_535) throw new Error("色板颜色数量超过 65534 色限制");
  document.palette.push({ ...entry, color: normalizedColor, isExternal: false });
  return document.palette.length - 1;
}

function anchorOffset(oldSize: number, newSize: number, position: "start" | "center" | "end") {
  if (position === "start") return 0;
  if (position === "end") return newSize - oldSize;
  return Math.floor((newSize - oldSize) / 2);
}

export function resizeEditorDocument(
  source: EditorDocumentV1,
  width: number,
  height: number,
  anchor: CanvasAnchor,
): EditorDocumentV1 {
  const nextWidth = Math.max(1, Math.min(MAX_CANVAS_SIZE, Math.round(width)));
  const nextHeight = Math.max(1, Math.min(MAX_CANVAS_SIZE, Math.round(height)));
  const horizontal = anchor.endsWith("left") || anchor === "left"
    ? "start"
    : anchor.endsWith("right") || anchor === "right"
      ? "end"
      : "center";
  const vertical = anchor.startsWith("top") || anchor === "top"
    ? "start"
    : anchor.startsWith("bottom") || anchor === "bottom"
      ? "end"
      : "center";
  const colOffset = anchorOffset(source.width, nextWidth, horizontal);
  const rowOffset = anchorOffset(source.height, nextHeight, vertical);
  const cells = new Uint16Array(nextWidth * nextHeight);

  for (let row = 0; row < source.height; row++) {
    const targetRow = row + rowOffset;
    if (targetRow < 0 || targetRow >= nextHeight) continue;
    for (let col = 0; col < source.width; col++) {
      const targetCol = col + colOffset;
      if (targetCol < 0 || targetCol >= nextWidth) continue;
      cells[targetRow * nextWidth + targetCol] = source.cells[row * source.width + col];
    }
  }

  return {
    ...cloneEditorDocument(source),
    width: nextWidth,
    height: nextHeight,
    cells,
    revision: source.revision,
    updatedAt: Date.now(),
  };
}

export function trimTransparent(document: EditorDocumentV1): EditorDocumentV1 {
  let minRow = document.height;
  let minCol = document.width;
  let maxRow = -1;
  let maxCol = -1;
  for (let row = 0; row < document.height; row++) {
    for (let col = 0; col < document.width; col++) {
      if (document.cells[row * document.width + col] === TRANSPARENT_PALETTE_INDEX) continue;
      minRow = Math.min(minRow, row);
      minCol = Math.min(minCol, col);
      maxRow = Math.max(maxRow, row);
      maxCol = Math.max(maxCol, col);
    }
  }
  if (maxRow < 0 || maxCol < 0) return resizeEditorDocument(document, 1, 1, "top-left");
  const width = maxCol - minCol + 1;
  const height = maxRow - minRow + 1;
  const cells = new Uint16Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      cells[row * width + col] = document.cells[(row + minRow) * document.width + col + minCol];
    }
  }
  return { ...cloneEditorDocument(document), width, height, cells, revision: document.revision, updatedAt: Date.now() };
}

export function cropEditorDocument(document: EditorDocumentV1, bounds: SelectionBounds): EditorDocumentV1 {
  const startRow = Math.max(0, Math.min(bounds.startRow, bounds.endRow));
  const startCol = Math.max(0, Math.min(bounds.startCol, bounds.endCol));
  const endRow = Math.min(document.height - 1, Math.max(bounds.startRow, bounds.endRow));
  const endCol = Math.min(document.width - 1, Math.max(bounds.startCol, bounds.endCol));
  const width = Math.max(1, endCol - startCol + 1);
  const height = Math.max(1, endRow - startRow + 1);
  const cells = new Uint16Array(width * height);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      cells[row * width + col] = document.cells[(startRow + row) * document.width + startCol + col];
    }
  }
  return { ...cloneEditorDocument(document), width, height, cells, updatedAt: Date.now() };
}
