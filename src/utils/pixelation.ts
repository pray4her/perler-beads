import { transparentColorData, TRANSPARENT_KEY } from './pixelEditingUtils';

// 定义像素化模式
export enum PixelationMode {
  Dominant = 'dominant', // 卡通模式（主色）
  Average = 'average',   // 真实模式（平均色）
}

// 定义色号系统类型
export type ColorSystem = 'MARD' | 'COCO' | '漫漫' | '盼盼' | '咪小窝';

/** 默认横轴切割数量：中大型底稿的常用甜点区 */
export const DEFAULT_GRANULARITY = 100;

/** 默认相似色合并阈值（Oklab×100）。略低于旧值 32，保留更多色阶细节 */
export const DEFAULT_SIMILARITY_THRESHOLD = 12;

/** 稀有色占比低于此值时并入邻近高频色（约 0.4%） */
export const RARE_COLOR_MIN_RATIO = 0.004;

/** 稀有色绝对数量下限（同时满足占比与绝对数量才清理） */
export const RARE_COLOR_MIN_ABSOLUTE = 3;

/** 去噪时视为「孤立岛」的最大连通像素数 */
export const DESPECKLE_MAX_ISLAND_SIZE = 2;

/** Dominant 模式在大格内的 RGB 分桶步进（抑制抗锯齿碎色） */
const DOMINANT_BUCKET_STEP = 8;

// --- 必要的类型定义 ---
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

interface OklabColor {
  l: number;
  a: number;
  b: number;
}

export interface PaletteColor {
  key: string;
  hex: string;
  rgb: RgbColor;
}

export interface MappedPixel {
  key: string;
  color: string;
  isExternal?: boolean;
}

export interface PostProcessOptions {
  similarityThreshold: number;
  rareColorMinRatio?: number;
  rareColorMinAbsolute?: number;
  despeckleMaxIslandSize?: number;
}

// --- 辅助函数 ---

// 转换 Hex 到 RGB
export function hexToRgb(hex: string): RgbColor | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function srgbChannelToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function rgbToOklab(rgb: RgbColor): OklabColor {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.7936177850 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.4285922050 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.8086757660 * sRoot,
  };
}

const oklabCache = new Map<string, OklabColor>();

function getOklabColor(rgb: RgbColor): OklabColor {
  const cacheKey = `${rgb.r},${rgb.g},${rgb.b}`;
  const cached = oklabCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const oklab = rgbToOklab(rgb);
  oklabCache.set(cacheKey, oklab);
  return oklab;
}

// 使用 Oklab 空间计算颜色距离，并保持与现有 0-100 阈值输入兼容。
export function colorDistance(rgb1: RgbColor, rgb2: RgbColor): number {
  const oklab1 = getOklabColor(rgb1);
  const oklab2 = getOklabColor(rgb2);

  const dl = oklab1.l - oklab2.l;
  const da = oklab1.a - oklab2.a;
  const db = oklab1.b - oklab2.b;

  return Math.sqrt(dl * dl + da * da + db * db) * 100;
}

/**
 * 亮度差较大时收紧合并阈值，避免轮廓/阴影被错误并入邻近色。
 */
export function effectiveMergeThreshold(
  rgb1: RgbColor,
  rgb2: RgbColor,
  baseThreshold: number
): number {
  const oklab1 = getOklabColor(rgb1);
  const oklab2 = getOklabColor(rgb2);
  const lumDiff = Math.abs(oklab1.l - oklab2.l);

  if (lumDiff >= 0.35) return baseThreshold * 0.45;
  if (lumDiff >= 0.22) return baseThreshold * 0.7;
  return baseThreshold;
}

function bucketRgbChannel(value: number, step: number): number {
  return Math.min(255, Math.round(value / step) * step);
}

function bucketRgb(rgb: RgbColor, step: number): RgbColor {
  return {
    r: bucketRgbChannel(rgb.r, step),
    g: bucketRgbChannel(rgb.g, step),
    b: bucketRgbChannel(rgb.b, step),
  };
}

// 查找最接近的颜色
export function findClosestPaletteColor(
  targetRgb: RgbColor,
  palette: PaletteColor[]
): PaletteColor {
  if (!palette || palette.length === 0) {
      console.error("findClosestPaletteColor: Palette is empty or invalid!");
      // 提供一个健壮的回退
      return { key: 'ERR', hex: '#000000', rgb: { r: 0, g: 0, b: 0 } };
  }

  let minDistance = Infinity;
  let closestColor = palette[0];

  for (const paletteColor of palette) {
    const distance = colorDistance(targetRgb, paletteColor.rgb);
    if (distance < minDistance) {
      minDistance = distance;
      closestColor = paletteColor;
    }
    if (distance === 0) break; // 完全匹配，提前退出
  }
  return closestColor;
}

function isBeadCell(cell: MappedPixel | undefined | null): cell is MappedPixel {
  return Boolean(cell && cell.key && !cell.isExternal && cell.key !== TRANSPARENT_KEY);
}

function cloneGrid(grid: MappedPixel[][]): MappedPixel[][] {
  return grid.map((row) => row.map((cell) => ({ ...cell })));
}

function buildPaletteMaps(palette: PaletteColor[]) {
  const keyToRgb = new Map<string, RgbColor>();
  const keyToColor = new Map<string, PaletteColor>();
  for (const color of palette) {
    keyToRgb.set(color.key, color.rgb);
    keyToColor.set(color.key, color);
  }
  return { keyToRgb, keyToColor };
}

function countNonExternalCells(grid: MappedPixel[][]): { counts: Map<string, number>; total: number } {
  const counts = new Map<string, number>();
  let total = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (!isBeadCell(cell)) continue;
      counts.set(cell.key, (counts.get(cell.key) || 0) + 1);
      total++;
    }
  }
  return { counts, total };
}

function replaceKeyInGrid(
  grid: MappedPixel[][],
  fromKey: string,
  toColor: PaletteColor
): void {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c].key === fromKey) {
        row[c] = {
          key: toColor.key,
          color: toColor.hex,
          isExternal: false,
        };
      }
    }
  }
}

/**
 * 按出现频率合并相似色：高频色吸收距离小于阈值的低频色。
 * 亮度差大时使用更严阈值，保护描边对比。
 */
export function mergeSimilarColorsByFrequency(
  grid: MappedPixel[][],
  palette: PaletteColor[],
  threshold: number
): MappedPixel[][] {
  if (threshold <= 0) return cloneGrid(grid);

  const result = cloneGrid(grid);
  const { keyToRgb, keyToColor } = buildPaletteMaps(palette);
  const { counts } = countNonExternalCells(result);
  const colorsByFrequency = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);

  const replacedColors = new Set<string>();

  for (let i = 0; i < colorsByFrequency.length; i++) {
    const currentKey = colorsByFrequency[i];
    if (replacedColors.has(currentKey)) continue;

    const currentRgb = keyToRgb.get(currentKey);
    const currentColor = keyToColor.get(currentKey);
    if (!currentRgb || !currentColor) continue;

    for (let j = i + 1; j < colorsByFrequency.length; j++) {
      const lowerFreqKey = colorsByFrequency[j];
      if (replacedColors.has(lowerFreqKey)) continue;

      const lowerFreqRgb = keyToRgb.get(lowerFreqKey);
      if (!lowerFreqRgb) continue;

      const dist = colorDistance(currentRgb, lowerFreqRgb);
      const mergeLimit = effectiveMergeThreshold(currentRgb, lowerFreqRgb, threshold);
      if (dist < mergeLimit) {
        replacedColors.add(lowerFreqKey);
        replaceKeyInGrid(result, lowerFreqKey, currentColor);
      }
    }
  }

  return result;
}

/**
 * 将过少出现的颜色并入最近的高频色，减少「一颗一色」杂色。
 */
export function cleanupRareColors(
  grid: MappedPixel[][],
  palette: PaletteColor[],
  options: {
    minRatio?: number;
    minAbsolute?: number;
  } = {}
): MappedPixel[][] {
  const minRatio = options.minRatio ?? RARE_COLOR_MIN_RATIO;
  const minAbsolute = options.minAbsolute ?? RARE_COLOR_MIN_ABSOLUTE;
  const result = cloneGrid(grid);
  const { keyToRgb, keyToColor } = buildPaletteMaps(palette);
  const { counts, total } = countNonExternalCells(result);
  if (total === 0) return result;

  const minCount = Math.max(minAbsolute, Math.ceil(total * minRatio));
  const rareKeys = [...counts.entries()]
    .filter(([, count]) => count < minCount)
    .sort((a, b) => a[1] - b[1])
    .map(([key]) => key);

  if (rareKeys.length === 0) return result;

  const keepKeys = [...counts.entries()]
    .filter(([key, count]) => count >= minCount && !rareKeys.includes(key))
    .map(([key]) => key);

  if (keepKeys.length === 0) return result;

  for (const rareKey of rareKeys) {
    const rareRgb = keyToRgb.get(rareKey);
    if (!rareRgb) continue;

    let bestKey = keepKeys[0];
    let bestDist = Infinity;
    for (const keepKey of keepKeys) {
      const keepRgb = keyToRgb.get(keepKey);
      if (!keepRgb) continue;
      const dist = colorDistance(rareRgb, keepRgb);
      if (dist < bestDist) {
        bestDist = dist;
        bestKey = keepKey;
      }
    }

    const target = keyToColor.get(bestKey);
    if (target) {
      replaceKeyInGrid(result, rareKey, target);
      // 已并入的稀有色不再作为后续目标，但 keepKeys 维持稳定集合即可
    }
  }

  return result;
}

/**
 * 去除小连通域噪点：孤立/极小色块替换为邻域众数色。
 * 保留与邻域感知距离较大的细节（描边、高光）。
 */
export function despeckleIsolatedPixels(
  grid: MappedPixel[][],
  palette: PaletteColor[],
  maxIslandSize: number = DESPECKLE_MAX_ISLAND_SIZE
): MappedPixel[][] {
  if (maxIslandSize <= 0 || grid.length === 0) return cloneGrid(grid);

  const result = cloneGrid(grid);
  const rows = result.length;
  const cols = result[0]?.length ?? 0;
  if (cols === 0) return result;

  const { keyToRgb, keyToColor } = buildPaletteMaps(palette);
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));
  const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (visited[r][c] || !isBeadCell(result[r][c])) continue;

      const key = result[r][c].key;
      const queue: Array<[number, number]> = [[r, c]];
      const component: Array<[number, number]> = [];
      visited[r][c] = true;

      while (queue.length > 0) {
        const [cr, cc] = queue.pop()!;
        component.push([cr, cc]);
        for (const [dr, dc] of dirs) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          if (visited[nr][nc]) continue;
          if (!isBeadCell(result[nr][nc]) || result[nr][nc].key !== key) continue;
          visited[nr][nc] = true;
          queue.push([nr, nc]);
        }
      }

      if (component.length > maxIslandSize) continue;

      const neighborCounts = new Map<string, number>();
      for (const [cr, cc] of component) {
        for (const [dr, dc] of dirs) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          const neighbor = result[nr][nc];
          if (!isBeadCell(neighbor) || neighbor.key === key) continue;
          neighborCounts.set(neighbor.key, (neighborCounts.get(neighbor.key) || 0) + 1);
        }
      }

      if (neighborCounts.size === 0) continue;

      let majorityKey = "";
      let majorityCount = -1;
      for (const [neighborKey, count] of neighborCounts) {
        if (count > majorityCount) {
          majorityCount = count;
          majorityKey = neighborKey;
        }
      }

      const islandRgb = keyToRgb.get(key);
      const majorityRgb = keyToRgb.get(majorityKey);
      const majorityColor = keyToColor.get(majorityKey);
      if (!islandRgb || !majorityRgb || !majorityColor) continue;

      // 与邻域差异很大时保留（通常是描边/关键细节）
      if (colorDistance(islandRgb, majorityRgb) > 28) continue;

      for (const [cr, cc] of component) {
        result[cr][cc] = {
          key: majorityColor.key,
          color: majorityColor.hex,
          isExternal: false,
        };
      }
    }
  }

  return result;
}

/**
 * 映射后处理流水线：相似色合并 → 稀有色清理 → 孤立像素去噪。
 */
export function postProcessMappedGrid(
  grid: MappedPixel[][],
  palette: PaletteColor[],
  options: PostProcessOptions
): MappedPixel[][] {
  const merged = mergeSimilarColorsByFrequency(grid, palette, options.similarityThreshold);
  const rareCleaned = cleanupRareColors(merged, palette, {
    minRatio: options.rareColorMinRatio,
    minAbsolute: options.rareColorMinAbsolute,
  });
  return despeckleIsolatedPixels(
    rareCleaned,
    palette,
    options.despeckleMaxIslandSize ?? DESPECKLE_MAX_ISLAND_SIZE
  );
}

// --- 核心像素化计算逻辑 ---

/**
 * 计算图像指定区域的代表色（根据所选模式）
 */
function calculateCellRepresentativeColor(
    imageData: ImageData,
    startX: number,
    startY: number,
    width: number,
    height: number,
    mode: PixelationMode
): RgbColor | null {
    const data = imageData.data;
    const imgWidth = imageData.width;
    let rSum = 0, gSum = 0, bSum = 0;
    let pixelCount = 0;
    const colorCountsInCell: { [key: string]: number } = {};
    let dominantColorRgb: RgbColor | null = null;
    let maxCount = 0;

    // 格内像素较多时分桶，避免抗锯齿产生大量唯一 RGB 导致主色不稳定
    const useBuckets = mode === PixelationMode.Dominant && width * height >= 16;
    const bucketStep = DOMINANT_BUCKET_STEP;

    const endX = startX + width;
    const endY = startY + height;

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            const index = (y * imgWidth + x) * 4;
            // 检查 alpha 通道，忽略完全透明的像素
            if (data[index + 3] < 128) continue;

            const r = data[index];
            const g = data[index + 1];
            const b = data[index + 2];

            pixelCount++;

            if (mode === PixelationMode.Average) {
                rSum += r;
                gSum += g;
                bSum += b;
            } else { // Dominant mode
                const sample = useBuckets ? bucketRgb({ r, g, b }, bucketStep) : { r, g, b };
                const colorKey = `${sample.r},${sample.g},${sample.b}`;
                colorCountsInCell[colorKey] = (colorCountsInCell[colorKey] || 0) + 1;
                if (colorCountsInCell[colorKey] > maxCount) {
                    maxCount = colorCountsInCell[colorKey];
                    dominantColorRgb = sample;
                }
            }
        }
    }

    if (pixelCount === 0) {
        return null; // 区域内没有不透明像素
    }

    if (mode === PixelationMode.Average) {
        return {
            r: Math.round(rSum / pixelCount),
            g: Math.round(gSum / pixelCount),
            b: Math.round(bSum / pixelCount),
        };
    } else { // Dominant mode
        return dominantColorRgb; // 可能为 null 如果只有一个透明像素
    }
}

/**
 * 根据原始图像数据、网格尺寸、调色板和模式计算像素化网格数据。
 */
export function calculatePixelGrid(
    originalCtx: CanvasRenderingContext2D,
    imgWidth: number,
    imgHeight: number,
    N: number,
    M: number,
    palette: PaletteColor[],
    mode: PixelationMode,
    t1FallbackColor: PaletteColor // 传入备用色
): MappedPixel[][] {
    console.log(`Calculating pixel grid with mode: ${mode}`);
    const mappedData: MappedPixel[][] = Array(M).fill(null).map(() => Array(N).fill({ key: t1FallbackColor.key, color: t1FallbackColor.hex }));
    const cellWidthOriginal = imgWidth / N;
    const cellHeightOriginal = imgHeight / M;

    let fullImageData: ImageData | null = null;
    try {
        fullImageData = originalCtx.getImageData(0, 0, imgWidth, imgHeight);
    } catch (e) {
        console.error("Failed to get full image data:", e);
        // 如果无法获取图像数据，返回一个空的或默认的网格
        return mappedData;
    }

    for (let j = 0; j < M; j++) {
        for (let i = 0; i < N; i++) {
            const startXOriginal = Math.floor(i * cellWidthOriginal);
            const startYOriginal = Math.floor(j * cellHeightOriginal);
            // 计算精确的单元格结束位置，避免超出图像边界
            const endXOriginal = Math.min(imgWidth, Math.ceil((i + 1) * cellWidthOriginal));
            const endYOriginal = Math.min(imgHeight, Math.ceil((j + 1) * cellHeightOriginal));
            // 计算实际的单元格宽高
            const currentCellWidth = Math.max(1, endXOriginal - startXOriginal);
            const currentCellHeight = Math.max(1, endYOriginal - startYOriginal);

            // 使用提取的函数计算代表色
            const representativeRgb = calculateCellRepresentativeColor(
                fullImageData,
                startXOriginal,
                startYOriginal,
                currentCellWidth,
                currentCellHeight,
                mode
            );

            let finalCellColorData: MappedPixel;
            if (representativeRgb) {
                const closestBead = findClosestPaletteColor(representativeRgb, palette);
                finalCellColorData = { key: closestBead.key, color: closestBead.hex };
            } else {
                // 如果单元格为空或全透明，标记为透明/外部
                finalCellColorData = { ...transparentColorData };
            }
            mappedData[j][i] = finalCellColorData;
        }
    }
    console.log(`Pixel grid calculation complete for mode: ${mode}`);
    return mappedData;
}
