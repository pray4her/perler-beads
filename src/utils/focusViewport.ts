/** 专心模式画布视口：与 FocusCanvas 的 scale + translate（origin=center）一致 */

export type FocusGridCell = { row: number; col: number };

export interface FocusViewportMetrics {
  N: number;
  M: number;
  showCoordinates: boolean;
  canvasScale: number;
  canvasOffset: { x: number; y: number };
  viewWidth: number;
  viewHeight: number;
}

export interface FocusViewportTransform {
  canvasScale: number;
  canvasOffset: { x: number; y: number };
}

/** 与 FocusCanvas / handleLocateRecommended 同一套格子尺寸 */
export function getFocusCellSize(N: number, M: number): number {
  return Math.max(15, Math.min(40, 300 / Math.max(N, M)));
}

export function getFocusCoordMargins(showCoordinates: boolean): { left: number; top: number } {
  return {
    left: showCoordinates ? 18 : 0,
    top: showCoordinates ? 14 : 0,
  };
}

export function getFocusCanvasSize(
  N: number,
  M: number,
  showCoordinates: boolean
): { cellSize: number; canvasWidth: number; canvasHeight: number; coordLeft: number; coordTop: number } {
  const cellSize = getFocusCellSize(N, M);
  const { left: coordLeft, top: coordTop } = getFocusCoordMargins(showCoordinates);
  return {
    cellSize,
    coordLeft,
    coordTop,
    canvasWidth: coordLeft + N * cellSize,
    canvasHeight: coordTop + M * cellSize,
  };
}

export function getCellsBounds(cells: FocusGridCell[]): {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
} | null {
  if (cells.length === 0) return null;
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  for (const { row, col } of cells) {
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
  }
  return { minRow, maxRow, minCol, maxCol };
}

/** 格子区域中心在未缩放画布上的真实像素位置（含坐标标尺边距） */
export function getRegionCanvasCenter(
  cells: FocusGridCell[],
  N: number,
  M: number,
  showCoordinates: boolean
): { x: number; y: number } | null {
  const bounds = getCellsBounds(cells);
  if (!bounds) return null;
  const { cellSize, coordLeft, coordTop } = getFocusCanvasSize(N, M, showCoordinates);
  const { minRow, maxRow, minCol, maxCol } = bounds;
  return {
    x: coordLeft + ((minCol + maxCol + 1) / 2) * cellSize,
    y: coordTop + ((minRow + maxRow + 1) / 2) * cellSize,
  };
}

/**
 * CSS: scale(s) translate(ox, oy), transform-origin center。
 * 容器 flex 居中：画布中心对齐视口中心后再变换。
 */
export function canvasPointToScreen(
  localX: number,
  localY: number,
  metrics: FocusViewportMetrics
): { x: number; y: number } {
  const { canvasWidth, canvasHeight } = getFocusCanvasSize(
    metrics.N,
    metrics.M,
    metrics.showCoordinates
  );
  const { canvasScale: scale, canvasOffset: offset, viewWidth, viewHeight } = metrics;
  return {
    x: viewWidth / 2 + scale * (localX + offset.x - canvasWidth / 2),
    y: viewHeight / 2 + scale * (localY + offset.y - canvasHeight / 2),
  };
}

/**
 * if-needed：目标区域中心是否已在视口内（留 8% 边距）。
 * 用中心而非整区包围盒，避免大色块/整行在放大时反复强制回中。
 */
export function isRegionCenterInViewport(
  cells: FocusGridCell[],
  metrics: FocusViewportMetrics,
  marginRatio = 0.08
): boolean {
  if (metrics.viewWidth <= 0 || metrics.viewHeight <= 0) return true;
  const center = getRegionCanvasCenter(
    cells,
    metrics.N,
    metrics.M,
    metrics.showCoordinates
  );
  if (!center) return true;
  const screen = canvasPointToScreen(center.x, center.y, metrics);
  const mx = metrics.viewWidth * marginRatio;
  const my = metrics.viewHeight * marginRatio;
  return (
    screen.x >= mx &&
    screen.x <= metrics.viewWidth - mx &&
    screen.y >= my &&
    screen.y <= metrics.viewHeight - my
  );
}

/** 将目标区域居中；区域超过视口 70% 时只缩不放。始终返回新变换（手动定位用）。 */
export function computeLocateTransform(
  cells: FocusGridCell[],
  metrics: FocusViewportMetrics
): FocusViewportTransform | null {
  const bounds = getCellsBounds(cells);
  if (!bounds) return null;

  const { cellSize, canvasWidth, canvasHeight } = getFocusCanvasSize(
    metrics.N,
    metrics.M,
    metrics.showCoordinates
  );
  const { minRow, maxRow, minCol, maxCol } = bounds;
  const { viewWidth, viewHeight } = metrics;

  let scale = metrics.canvasScale;
  if (viewWidth > 0 && viewHeight > 0) {
    const regionWidth = (maxCol - minCol + 1) * cellSize;
    const regionHeight = (maxRow - minRow + 1) * cellSize;
    const fitScale = Math.min(
      (viewWidth * 0.7) / regionWidth,
      (viewHeight * 0.7) / regionHeight
    );
    if (fitScale < scale) {
      scale = Math.max(0.3, fitScale);
    }
  }

  // 与历史 handleLocateRecommended 一致（target 不含 coord 边距）
  const targetX = ((minCol + maxCol + 1) / 2) * cellSize;
  const targetY = ((minRow + maxRow + 1) / 2) * cellSize;
  let offsetX = canvasWidth / 2 - targetX;
  let offsetY = canvasHeight / 2 - targetY;

  if (viewWidth > 0 && viewHeight > 0) {
    const clampOffset = (offset: number, canvasSize: number, viewSize: number) => {
      const minOffset = -viewSize / (2 * scale) - canvasSize * 0.25;
      const maxOffset = viewSize / (2 * scale) + canvasSize * 0.25;
      return Math.min(maxOffset, Math.max(minOffset, offset));
    };
    offsetX = clampOffset(offsetX, canvasWidth, viewWidth);
    offsetY = clampOffset(offsetY, canvasHeight, viewHeight);
  }

  return {
    canvasScale: scale,
    canvasOffset: { x: offsetX, y: offsetY },
  };
}

/** 仅当中心不在视口内时返回新变换，否则 null */
export function computeLocateTransformIfNeeded(
  cells: FocusGridCell[],
  metrics: FocusViewportMetrics
): FocusViewportTransform | null {
  if (isRegionCenterInViewport(cells, metrics)) return null;
  return computeLocateTransform(cells, metrics);
}
