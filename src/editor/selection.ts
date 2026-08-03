import type {
  SelectionBounds,
  SelectionCombineMode,
  SelectionMask,
} from "@/editor/types";

export function createSelectionMask(width: number, height: number): SelectionMask {
  return { width, height, mask: new Uint8Array(width * height), bounds: null };
}

export function boundsFromMask(selection: SelectionMask): SelectionBounds | null {
  let startRow = selection.height;
  let startCol = selection.width;
  let endRow = -1;
  let endCol = -1;
  for (let index = 0; index < selection.mask.length; index++) {
    if (!selection.mask[index]) continue;
    const row = Math.floor(index / selection.width);
    const col = index % selection.width;
    startRow = Math.min(startRow, row);
    startCol = Math.min(startCol, col);
    endRow = Math.max(endRow, row);
    endCol = Math.max(endCol, col);
  }
  return endRow < 0 ? null : { startRow, startCol, endRow, endCol };
}

export function rectangularSelection(
  width: number,
  height: number,
  bounds: SelectionBounds,
): SelectionMask {
  const selection = createSelectionMask(width, height);
  const normalized = {
    startRow: Math.max(0, Math.min(bounds.startRow, bounds.endRow)),
    startCol: Math.max(0, Math.min(bounds.startCol, bounds.endCol)),
    endRow: Math.min(height - 1, Math.max(bounds.startRow, bounds.endRow)),
    endCol: Math.min(width - 1, Math.max(bounds.startCol, bounds.endCol)),
  };
  for (let row = normalized.startRow; row <= normalized.endRow; row++) {
    selection.mask.fill(1, row * width + normalized.startCol, row * width + normalized.endCol + 1);
  }
  selection.bounds = normalized;
  return selection;
}

export function combineSelections(
  current: SelectionMask,
  incoming: SelectionMask,
  mode: SelectionCombineMode,
): SelectionMask {
  if (current.width !== incoming.width || current.height !== incoming.height) {
    throw new Error("不能组合尺寸不同的选区");
  }
  const mask = new Uint8Array(current.mask.length);
  for (let index = 0; index < mask.length; index++) {
    const left = current.mask[index] === 1;
    const right = incoming.mask[index] === 1;
    mask[index] = Number(
      mode === "replace" ? right
        : mode === "add" ? left || right
          : mode === "subtract" ? left && !right
            : left && right,
    );
  }
  const selection: SelectionMask = { width: current.width, height: current.height, mask, bounds: null };
  selection.bounds = boundsFromMask(selection);
  return selection;
}

export function invertSelection(selection: SelectionMask): SelectionMask {
  const mask = Uint8Array.from(selection.mask, (value) => Number(value === 0));
  const next: SelectionMask = { ...selection, mask, bounds: null };
  next.bounds = boundsFromMask(next);
  return next;
}

export function selectNonTransparent(width: number, height: number, cells: Uint16Array): SelectionMask {
  const mask = Uint8Array.from(cells, (value) => Number(value !== 0));
  const selection: SelectionMask = { width, height, mask, bounds: null };
  selection.bounds = boundsFromMask(selection);
  return selection;
}

export function selectSameColor(
  width: number,
  height: number,
  cells: Uint16Array,
  paletteIndex: number,
): SelectionMask {
  const mask = Uint8Array.from(cells, (value) => Number(value === paletteIndex));
  const selection: SelectionMask = { width, height, mask, bounds: null };
  selection.bounds = boundsFromMask(selection);
  return selection;
}

/**
 * Clamp a requested move so the selection bounds stay fully inside the grid.
 * Nudge semantics: pushing against an edge stops at the edge instead of cropping cells.
 */
export function clampSelectionDelta(
  selection: SelectionMask,
  rowDelta: number,
  colDelta: number,
): { rowDelta: number; colDelta: number } {
  const bounds = selection.bounds;
  if (!bounds) return { rowDelta: 0, colDelta: 0 };
  return {
    rowDelta: Math.min(selection.height - 1 - bounds.endRow, Math.max(-bounds.startRow, rowDelta)),
    colDelta: Math.min(selection.width - 1 - bounds.endCol, Math.max(-bounds.startCol, colDelta)),
  };
}

export function translateSelection(selection: SelectionMask, rowDelta: number, colDelta: number): SelectionMask {
  const mask = new Uint8Array(selection.mask.length);
  for (let row = 0; row < selection.height; row++) {
    for (let col = 0; col < selection.width; col++) {
      if (!selection.mask[row * selection.width + col]) continue;
      const targetRow = row + rowDelta;
      const targetCol = col + colDelta;
      if (targetRow < 0 || targetRow >= selection.height || targetCol < 0 || targetCol >= selection.width) continue;
      mask[targetRow * selection.width + targetCol] = 1;
    }
  }
  const next: SelectionMask = { ...selection, mask, bounds: null };
  next.bounds = boundsFromMask(next);
  return next;
}
