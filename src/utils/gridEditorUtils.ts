import { GridPoint, GridSelection } from "@/types/editorTypes";
import { MappedPixel } from "@/utils/pixelation";
import { transparentColorData } from "@/utils/pixelEditingUtils";

export const createBlankCell = (): MappedPixel => ({ ...transparentColorData });

export function cloneGrid(grid: MappedPixel[][]): MappedPixel[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

export function gridsEqual(a: MappedPixel[][], b: MappedPixel[][]): boolean {
  if (a.length !== b.length || a[0]?.length !== b[0]?.length) return false;
  for (let row = 0; row < a.length; row++) {
    for (let col = 0; col < a[row].length; col++) {
      const left = a[row][col];
      const right = b[row][col];
      if (
        left.key !== right.key ||
        left.color !== right.color ||
        Boolean(left.isExternal) !== Boolean(right.isExternal)
      ) {
        return false;
      }
    }
  }
  return true;
}

export function normalizeSelection(selection: GridSelection): GridSelection {
  return {
    startRow: Math.min(selection.startRow, selection.endRow),
    startCol: Math.min(selection.startCol, selection.endCol),
    endRow: Math.max(selection.startRow, selection.endRow),
    endCol: Math.max(selection.startCol, selection.endCol),
  };
}

export function isPointInSelection(point: GridPoint, selection: GridSelection): boolean {
  const normalized = normalizeSelection(selection);
  return (
    point.row >= normalized.startRow &&
    point.row <= normalized.endRow &&
    point.col >= normalized.startCol &&
    point.col <= normalized.endCol
  );
}

export function getLinePoints(start: GridPoint, end: GridPoint): GridPoint[] {
  const points: GridPoint[] = [];
  let x0 = start.col;
  let y0 = start.row;
  const x1 = end.col;
  const y1 = end.row;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;

  while (true) {
    points.push({ row: y0, col: x0 });
    if (x0 === x1 && y0 === y1) break;
    const twiceError = 2 * error;
    if (twiceError >= dy) {
      error += dy;
      x0 += sx;
    }
    if (twiceError <= dx) {
      error += dx;
      y0 += sy;
    }
  }

  return points;
}

export function paintPoints(
  grid: MappedPixel[][],
  points: GridPoint[],
  color: MappedPixel,
): MappedPixel[][] {
  const next = cloneGrid(grid);
  for (const point of points) {
    if (!next[point.row]?.[point.col]) continue;
    next[point.row][point.col] = color.key === "ERASE"
      ? createBlankCell()
      : { ...color, isExternal: false };
  }
  return next;
}

export function fillRegion(
  grid: MappedPixel[][],
  start: GridPoint,
  color: MappedPixel,
): MappedPixel[][] {
  const source = grid[start.row]?.[start.col];
  if (!source) return grid;
  const replacement = color.key === "ERASE" ? createBlankCell() : { ...color, isExternal: false };
  if (
    source.key === replacement.key &&
    source.color === replacement.color &&
    Boolean(source.isExternal) === Boolean(replacement.isExternal)
  ) {
    return grid;
  }

  const next = cloneGrid(grid);
  const stack = [start];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const point = stack.pop()!;
    const id = `${point.row}:${point.col}`;
    if (visited.has(id)) continue;
    visited.add(id);

    const cell = next[point.row]?.[point.col];
    if (
      !cell ||
      cell.key !== source.key ||
      cell.color !== source.color ||
      Boolean(cell.isExternal) !== Boolean(source.isExternal)
    ) {
      continue;
    }

    next[point.row][point.col] = { ...replacement };
    stack.push(
      { row: point.row - 1, col: point.col },
      { row: point.row + 1, col: point.col },
      { row: point.row, col: point.col - 1 },
      { row: point.row, col: point.col + 1 },
    );
  }

  return next;
}

export function drawRectangle(
  grid: MappedPixel[][],
  selection: GridSelection,
  color: MappedPixel,
  filled: boolean,
): MappedPixel[][] {
  const normalized = normalizeSelection(selection);
  const points: GridPoint[] = [];
  for (let row = normalized.startRow; row <= normalized.endRow; row++) {
    for (let col = normalized.startCol; col <= normalized.endCol; col++) {
      if (
        filled ||
        row === normalized.startRow ||
        row === normalized.endRow ||
        col === normalized.startCol ||
        col === normalized.endCol
      ) {
        points.push({ row, col });
      }
    }
  }
  return paintPoints(grid, points, color);
}

export function fillSelection(
  grid: MappedPixel[][],
  selection: GridSelection,
  color: MappedPixel,
): MappedPixel[][] {
  return drawRectangle(grid, selection, color, true);
}

export function clearSelection(
  grid: MappedPixel[][],
  selection: GridSelection,
): MappedPixel[][] {
  return fillSelection(grid, selection, createBlankCell());
}

export function cropToSelection(
  grid: MappedPixel[][],
  selection: GridSelection,
): MappedPixel[][] {
  const normalized = normalizeSelection(selection);
  return grid
    .slice(normalized.startRow, normalized.endRow + 1)
    .map((row) => row.slice(normalized.startCol, normalized.endCol + 1).map((cell) => ({ ...cell })));
}

export function resizeGridCentered(
  grid: MappedPixel[][],
  width: number,
  height: number,
): MappedPixel[][] {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const oldHeight = grid.length;
  const oldWidth = grid[0]?.length ?? 0;
  const sourceStartRow = Math.max(0, Math.floor((oldHeight - safeHeight) / 2));
  const sourceStartCol = Math.max(0, Math.floor((oldWidth - safeWidth) / 2));
  const targetStartRow = Math.max(0, Math.floor((safeHeight - oldHeight) / 2));
  const targetStartCol = Math.max(0, Math.floor((safeWidth - oldWidth) / 2));
  const next = Array.from({ length: safeHeight }, () =>
    Array.from({ length: safeWidth }, createBlankCell),
  );

  const copyHeight = Math.min(oldHeight, safeHeight);
  const copyWidth = Math.min(oldWidth, safeWidth);
  for (let row = 0; row < copyHeight; row++) {
    for (let col = 0; col < copyWidth; col++) {
      next[targetStartRow + row][targetStartCol + col] = {
        ...grid[sourceStartRow + row][sourceStartCol + col],
      };
    }
  }
  return next;
}

export function moveContent(
  grid: MappedPixel[][],
  rowDelta: number,
  colDelta: number,
  selection?: GridSelection | null,
  copy = false,
): MappedPixel[][] {
  if (rowDelta === 0 && colDelta === 0) return grid;
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const normalized = selection ? normalizeSelection(selection) : null;
  const next = cloneGrid(grid);
  const source: Array<{ point: GridPoint; cell: MappedPixel }> = [];

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (normalized && !isPointInSelection({ row, col }, normalized)) continue;
      source.push({ point: { row, col }, cell: { ...grid[row][col] } });
      if (!copy) next[row][col] = createBlankCell();
    }
  }

  for (const item of source) {
    const targetRow = item.point.row + rowDelta;
    const targetCol = item.point.col + colDelta;
    if (targetRow < 0 || targetRow >= height || targetCol < 0 || targetCol >= width) continue;
    next[targetRow][targetCol] = { ...item.cell };
  }

  return next;
}

export function copySelectionData(
  grid: MappedPixel[][],
  selection: GridSelection,
): MappedPixel[][] {
  const normalized = normalizeSelection(selection);
  return grid
    .slice(normalized.startRow, normalized.endRow + 1)
    .map((row) => row.slice(normalized.startCol, normalized.endCol + 1).map((cell) => ({ ...cell })));
}

export function pasteSelectionData(
  grid: MappedPixel[][],
  clipboard: MappedPixel[][],
  origin: GridPoint,
): MappedPixel[][] {
  const next = cloneGrid(grid);
  for (let row = 0; row < clipboard.length; row++) {
    for (let col = 0; col < (clipboard[row]?.length ?? 0); col++) {
      const targetRow = origin.row + row;
      const targetCol = origin.col + col;
      if (!next[targetRow]?.[targetCol]) continue;
      next[targetRow][targetCol] = { ...clipboard[row][col] };
    }
  }
  return next;
}
