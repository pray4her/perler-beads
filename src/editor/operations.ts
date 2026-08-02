import type { CellPatch, EditorDocumentV1, SelectionMask } from "@/editor/types";

export interface CellPoint {
  row: number;
  col: number;
}

export type BrushShape = "square" | "circle";
export type FillMode = "connected" | "all";
export type FillScope = "canvas" | "selection";

export function pointIndex(document: Pick<EditorDocumentV1, "width" | "height">, point: CellPoint) {
  if (point.row < 0 || point.row >= document.height || point.col < 0 || point.col >= document.width) return -1;
  return point.row * document.width + point.col;
}

export function getLinePoints(start: CellPoint, end: CellPoint): CellPoint[] {
  const points: CellPoint[] = [];
  let x0 = start.col;
  let y0 = start.row;
  const dx = Math.abs(end.col - x0);
  const sx = x0 < end.col ? 1 : -1;
  const dy = -Math.abs(end.row - y0);
  const sy = y0 < end.row ? 1 : -1;
  let error = dx + dy;
  while (true) {
    points.push({ row: y0, col: x0 });
    if (x0 === end.col && y0 === end.row) break;
    const twice = error * 2;
    if (twice >= dy) {
      error += dy;
      x0 += sx;
    }
    if (twice <= dx) {
      error += dx;
      y0 += sy;
    }
  }
  return points;
}

export function getBrushPoints(origin: CellPoint, size: number, shape: BrushShape): CellPoint[] {
  const safeSize = [1, 2, 3, 5].includes(size) ? size : 1;
  const offset = safeSize === 2 ? 0 : Math.floor(safeSize / 2);
  const points: CellPoint[] = [];
  for (let y = 0; y < safeSize; y++) {
    for (let x = 0; x < safeSize; x++) {
      if (shape === "circle" && safeSize > 2) {
        const center = (safeSize - 1) / 2;
        if (Math.hypot(x - center, y - center) > safeSize / 2) continue;
      }
      points.push({ row: origin.row + y - offset, col: origin.col + x - offset });
    }
  }
  return points;
}

export function getRectanglePoints(
  start: CellPoint,
  end: CellPoint,
  filled: boolean,
  strokeWidth = 1,
): CellPoint[] {
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  const points: CellPoint[] = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const edgeDistance = Math.min(row - minRow, maxRow - row, col - minCol, maxCol - col);
      if (filled || edgeDistance < strokeWidth) points.push({ row, col });
    }
  }
  return points;
}

export function getEllipsePoints(
  start: CellPoint,
  end: CellPoint,
  filled: boolean,
  strokeWidth = 1,
): CellPoint[] {
  const minRow = Math.min(start.row, end.row);
  const maxRow = Math.max(start.row, end.row);
  const minCol = Math.min(start.col, end.col);
  const maxCol = Math.max(start.col, end.col);
  const centerRow = (minRow + maxRow) / 2;
  const centerCol = (minCol + maxCol) / 2;
  const radiusRow = Math.max(0.5, (maxRow - minRow + 1) / 2);
  const radiusCol = Math.max(0.5, (maxCol - minCol + 1) / 2);
  const innerRow = Math.max(0.1, radiusRow - strokeWidth);
  const innerCol = Math.max(0.1, radiusCol - strokeWidth);
  const points: CellPoint[] = [];
  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      const outer = ((row - centerRow) ** 2) / radiusRow ** 2 + ((col - centerCol) ** 2) / radiusCol ** 2;
      const inner = ((row - centerRow) ** 2) / innerRow ** 2 + ((col - centerCol) ** 2) / innerCol ** 2;
      if (outer <= 1.12 && (filled || inner >= 0.78)) points.push({ row, col });
    }
  }
  return points;
}

export function withSymmetry(
  points: CellPoint[],
  width: number,
  height: number,
  horizontal: boolean,
  vertical: boolean,
  axisCol = (width - 1) / 2,
  axisRow = (height - 1) / 2,
): CellPoint[] {
  const unique = new Map<string, CellPoint>();
  const add = (row: number, col: number) => {
    const rounded = { row: Math.round(row), col: Math.round(col) };
    if (rounded.row >= 0 && rounded.row < height && rounded.col >= 0 && rounded.col < width) {
      unique.set(`${rounded.row}:${rounded.col}`, rounded);
    }
  };
  for (const point of points) {
    add(point.row, point.col);
    if (horizontal) add(point.row, axisCol * 2 - point.col);
    if (vertical) add(axisRow * 2 - point.row, point.col);
    if (horizontal && vertical) add(axisRow * 2 - point.row, axisCol * 2 - point.col);
  }
  return Array.from(unique.values());
}

export function patchesForPoints(
  document: EditorDocumentV1,
  points: CellPoint[],
  paletteIndex: number,
  selection?: SelectionMask | null,
): CellPatch[] {
  const patches = new Map<number, CellPatch>();
  for (const point of points) {
    const index = pointIndex(document, point);
    if (index < 0 || (selection && !selection.mask[index])) continue;
    const before = document.cells[index];
    if (before === paletteIndex) continue;
    patches.set(index, { index, before, after: paletteIndex });
  }
  return Array.from(patches.values());
}

export function floodFillPatches(
  document: EditorDocumentV1,
  start: CellPoint,
  paletteIndex: number,
  mode: FillMode,
  scope: FillScope,
  selection?: SelectionMask | null,
): CellPatch[] {
  const startIndex = pointIndex(document, start);
  if (startIndex < 0) return [];
  const source = document.cells[startIndex];
  if (source === paletteIndex) return [];
  const allowed = (index: number) => scope === "canvas" || !selection || selection.mask[index] === 1;
  if (mode === "all") {
    const patches: CellPatch[] = [];
    for (let index = 0; index < document.cells.length; index++) {
      if (document.cells[index] === source && allowed(index)) patches.push({ index, before: source, after: paletteIndex });
    }
    return patches;
  }
  const stack = [startIndex];
  const visited = new Uint8Array(document.cells.length);
  const patches: CellPatch[] = [];
  while (stack.length) {
    const index = stack.pop()!;
    if (visited[index]) continue;
    visited[index] = 1;
    if (!allowed(index) || document.cells[index] !== source) continue;
    patches.push({ index, before: source, after: paletteIndex });
    const row = Math.floor(index / document.width);
    const col = index % document.width;
    if (row > 0) stack.push(index - document.width);
    if (row + 1 < document.height) stack.push(index + document.width);
    if (col > 0) stack.push(index - 1);
    if (col + 1 < document.width) stack.push(index + 1);
  }
  return patches;
}

export function moveSelectionPatches(
  document: EditorDocumentV1,
  selection: SelectionMask,
  rowDelta: number,
  colDelta: number,
  copy: boolean,
): CellPatch[] {
  const final = document.cells.slice();
  const sources: Array<{ index: number; value: number }> = [];
  for (let index = 0; index < selection.mask.length; index++) {
    if (!selection.mask[index]) continue;
    sources.push({ index, value: document.cells[index] });
    if (!copy) final[index] = 0;
  }
  for (const source of sources) {
    const row = Math.floor(source.index / document.width) + rowDelta;
    const col = (source.index % document.width) + colDelta;
    if (row < 0 || row >= document.height || col < 0 || col >= document.width) continue;
    final[row * document.width + col] = source.value;
  }
  const patches: CellPatch[] = [];
  for (let index = 0; index < final.length; index++) {
    if (final[index] !== document.cells[index]) patches.push({ index, before: document.cells[index], after: final[index] });
  }
  return patches;
}

export function transformSelectionDocument(
  document: EditorDocumentV1,
  selection: SelectionMask,
  transform: "flip-horizontal" | "flip-vertical" | "rotate-90" | "rotate-180",
): { patches: CellPatch[]; width: number; height: number } {
  const bounds = selection.bounds;
  if (!bounds) return { patches: [], width: 0, height: 0 };
  const width = bounds.endCol - bounds.startCol + 1;
  const height = bounds.endRow - bounds.startRow + 1;
  const outputWidth = transform === "rotate-90" ? height : width;
  const outputHeight = transform === "rotate-90" ? width : height;
  const final = document.cells.slice();
  for (let row = bounds.startRow; row <= bounds.endRow; row++) {
    for (let col = bounds.startCol; col <= bounds.endCol; col++) {
      const index = row * document.width + col;
      if (selection.mask[index]) final[index] = 0;
    }
  }
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const sourceIndex = (bounds.startRow + row) * document.width + bounds.startCol + col;
      if (!selection.mask[sourceIndex]) continue;
      let targetRow = row;
      let targetCol = col;
      if (transform === "flip-horizontal") targetCol = width - 1 - col;
      if (transform === "flip-vertical") targetRow = height - 1 - row;
      if (transform === "rotate-90") {
        targetRow = col;
        targetCol = height - 1 - row;
      }
      if (transform === "rotate-180") {
        targetRow = height - 1 - row;
        targetCol = width - 1 - col;
      }
      const absoluteRow = bounds.startRow + targetRow;
      const absoluteCol = bounds.startCol + targetCol;
      if (absoluteRow < document.height && absoluteCol < document.width) {
        final[absoluteRow * document.width + absoluteCol] = document.cells[sourceIndex];
      }
    }
  }
  const patches: CellPatch[] = [];
  for (let index = 0; index < final.length; index++) {
    if (final[index] !== document.cells[index]) patches.push({ index, before: document.cells[index], after: final[index] });
  }
  return { patches, width: outputWidth, height: outputHeight };
}
