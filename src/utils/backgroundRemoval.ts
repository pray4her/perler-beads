import { colorDistance, hexToRgb, type MappedPixel } from "@/utils/pixelation";
import { TRANSPARENT_KEY, transparentColorData } from "@/utils/pixelEditingUtils";

export type BackgroundRemovalMode = "automatic" | "manual";
export type BackgroundRemovalUnchangedReason =
  | "empty-grid"
  | "no-candidate"
  | "low-confidence"
  | "excessive-removal";

export type BackgroundRemovalResult =
  | {
      readonly kind: "removed";
      readonly grid: MappedPixel[][];
      readonly removedCount: number;
      readonly confidence: number;
    }
  | {
      readonly kind: "unchanged";
      readonly reason: BackgroundRemovalUnchangedReason;
      readonly confidence: number;
    };

type RemovalPolicy = {
  readonly colorDistance: number;
  readonly minimumBorderSupport: number;
  readonly minimumCornerSupport: number;
  readonly maximumRemovalRatio: number;
};

const POLICIES: Readonly<Record<BackgroundRemovalMode, RemovalPolicy>> = {
  automatic: {
    colorDistance: 8,
    minimumBorderSupport: 0.68,
    minimumCornerSupport: 0.5,
    maximumRemovalRatio: 0.96,
  },
  manual: {
    colorDistance: 14,
    minimumBorderSupport: 0.35,
    minimumCornerSupport: 0,
    maximumRemovalRatio: 0.995,
  },
};

function isPatternCell(cell: MappedPixel | undefined): cell is MappedPixel {
  return Boolean(cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY && hexToRgb(cell.color));
}

function uniqueBorderIndexes(width: number, height: number): number[] {
  const indexes = new Set<number>();
  for (let col = 0; col < width; col++) {
    indexes.add(col);
    indexes.add((height - 1) * width + col);
  }
  for (let row = 0; row < height; row++) {
    indexes.add(row * width);
    indexes.add(row * width + width - 1);
  }
  return [...indexes];
}

function cornerIndexes(width: number, height: number): number[] {
  return [...new Set([0, width - 1, (height - 1) * width, height * width - 1])];
}

function cellAt(grid: readonly (readonly MappedPixel[])[], width: number, index: number): MappedPixel | undefined {
  return grid[Math.floor(index / width)]?.[index % width];
}

function distanceBetween(left: MappedPixel, right: MappedPixel): number {
  const leftRgb = hexToRgb(left.color);
  const rightRgb = hexToRgb(right.color);
  if (!leftRgb || !rightRgb) return Number.POSITIVE_INFINITY;
  return colorDistance(leftRgb, rightRgb);
}

function findDominantBorderCell(
  borderCells: readonly MappedPixel[],
  maximumDistance: number,
): { readonly cell: MappedPixel; readonly support: number } | null {
  let bestCell: MappedPixel | null = null;
  let bestSupport = 0;
  for (const candidate of borderCells) {
    let support = 0;
    for (const borderCell of borderCells) {
      if (distanceBetween(candidate, borderCell) <= maximumDistance) support++;
    }
    if (support > bestSupport) {
      bestCell = candidate;
      bestSupport = support;
    }
  }
  return bestCell ? { cell: bestCell, support: bestSupport } : null;
}

function roundConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1_000) / 1_000;
}

export function removeExternalBackground(
  grid: readonly (readonly MappedPixel[])[],
  mode: BackgroundRemovalMode,
): BackgroundRemovalResult {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (width === 0 || height === 0 || grid.some((row) => row.length !== width)) {
    return { kind: "unchanged", reason: "empty-grid", confidence: 0 };
  }

  const policy = POLICIES[mode];
  const borderIndexes = uniqueBorderIndexes(width, height);
  const borderCells = borderIndexes
    .map((index) => cellAt(grid, width, index))
    .filter(isPatternCell);
  if (borderCells.length === 0) {
    return { kind: "unchanged", reason: "no-candidate", confidence: 0 };
  }

  const dominant = findDominantBorderCell(borderCells, policy.colorDistance);
  if (!dominant) {
    return { kind: "unchanged", reason: "no-candidate", confidence: 0 };
  }

  const borderSupport = dominant.support / borderCells.length;
  const corners = cornerIndexes(width, height)
    .map((index) => cellAt(grid, width, index))
    .filter(isPatternCell);
  const supportedCorners = corners.filter(
    (cell) => distanceBetween(dominant.cell, cell) <= policy.colorDistance,
  ).length;
  const cornerSupport = corners.length === 0 ? 0 : supportedCorners / corners.length;
  const confidence = roundConfidence(borderSupport * 0.75 + cornerSupport * 0.25);
  if (
    borderSupport < policy.minimumBorderSupport
    || cornerSupport < policy.minimumCornerSupport
  ) {
    return { kind: "unchanged", reason: "low-confidence", confidence };
  }

  const activeCellCount = grid.reduce(
    (total, row) => total + row.reduce((rowTotal, cell) => rowTotal + (isPatternCell(cell) ? 1 : 0), 0),
    0,
  );
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];
  let queueHead = 0;

  const enqueueCandidate = (index: number): void => {
    if (index < 0 || index >= width * height || visited[index] === 1) return;
    const cell = cellAt(grid, width, index);
    if (!isPatternCell(cell) || distanceBetween(dominant.cell, cell) > policy.colorDistance) return;
    visited[index] = 1;
    queue.push(index);
  };

  for (const index of borderIndexes) enqueueCandidate(index);
  while (queueHead < queue.length) {
    const index = queue[queueHead];
    queueHead++;
    if (index === undefined) continue;
    const row = Math.floor(index / width);
    const col = index % width;
    if (row > 0) enqueueCandidate(index - width);
    if (row + 1 < height) enqueueCandidate(index + width);
    if (col > 0) enqueueCandidate(index - 1);
    if (col + 1 < width) enqueueCandidate(index + 1);
  }

  const removedCount = queue.length;
  if (removedCount === 0) {
    return { kind: "unchanged", reason: "no-candidate", confidence };
  }
  if (activeCellCount === 0 || removedCount / activeCellCount > policy.maximumRemovalRatio) {
    return { kind: "unchanged", reason: "excessive-removal", confidence };
  }

  const result = grid.map((row) => row.map((cell) => ({ ...cell })));
  for (const index of queue) {
    const row = Math.floor(index / width);
    const col = index % width;
    result[row][col] = { ...transparentColorData };
  }
  return { kind: "removed", grid: result, removedCount, confidence };
}
