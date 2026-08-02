import { describe, expect, it } from "vitest";
import {
  cleanupRareColors,
  colorDistance,
  despeckleIsolatedPixels,
  effectiveMergeThreshold,
  mergeSimilarColorsByFrequency,
  postProcessMappedGrid,
  type MappedPixel,
  type PaletteColor,
  type RgbColor,
} from "./pixelation";

function rgb(r: number, g: number, b: number): RgbColor {
  return { r, g, b };
}

function hexFromRgb({ r, g, b }: RgbColor): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function paletteColor(rgbValue: RgbColor, key = hexFromRgb(rgbValue)): PaletteColor {
  return { key, hex: key, rgb: rgbValue };
}

function cell(color: PaletteColor): MappedPixel {
  return { key: color.key, color: color.hex, isExternal: false };
}

describe("pixelation post-process", () => {
  const black = paletteColor(rgb(0, 0, 0));
  const nearBlack = paletteColor(rgb(20, 20, 20));
  const white = paletteColor(rgb(255, 255, 255));
  const softGray = paletteColor(rgb(240, 240, 240));
  const red = paletteColor(rgb(220, 40, 40));
  const nearRed = paletteColor(rgb(210, 50, 50));
  const palette = [black, nearBlack, white, softGray, red, nearRed];

  it("tightens merge threshold when luminance differs a lot", () => {
    const base = 32;
    const contrastLimit = effectiveMergeThreshold(black.rgb, white.rgb, base);
    const similarLimit = effectiveMergeThreshold(red.rgb, nearRed.rgb, base);
    expect(contrastLimit).toBeLessThan(base * 0.6);
    expect(similarLimit).toBe(base);
  });

  it("merges similar low-frequency colors into high-frequency neighbors", () => {
    const grid: MappedPixel[][] = [
      [cell(red), cell(red), cell(red), cell(nearRed)],
      [cell(red), cell(red), cell(red), cell(red)],
    ];

    const merged = mergeSimilarColorsByFrequency(grid, palette, 40);
    const keys = merged.flat().map((c) => c.key);
    expect(new Set(keys).size).toBe(1);
    expect(keys.every((key) => key === red.key)).toBe(true);
  });

  it("does not merge high-contrast outline into light fill at moderate thresholds", () => {
    const grid: MappedPixel[][] = [
      [cell(black), cell(white), cell(white)],
      [cell(black), cell(white), cell(white)],
      [cell(black), cell(white), cell(white)],
    ];

    const merged = mergeSimilarColorsByFrequency(grid, palette, 32);
    const blackCount = merged.flat().filter((c) => c.key === black.key).length;
    expect(blackCount).toBe(3);
  });

  it("cleans rare speckles into nearest frequent color", () => {
    const grid: MappedPixel[][] = Array.from({ length: 6 }, () =>
      Array.from({ length: 6 }, () => cell(red))
    );
    grid[2][2] = cell(nearRed);
    grid[4][4] = cell(nearRed);

    const cleaned = cleanupRareColors(grid, palette, { minRatio: 0.1, minAbsolute: 3 });
    expect(cleaned.flat().every((c) => c.key === red.key)).toBe(true);
  });

  it("despeckles isolated islands into neighbor majority", () => {
    const grid: MappedPixel[][] = [
      [cell(white), cell(white), cell(white)],
      [cell(white), cell(red), cell(white)],
      [cell(white), cell(white), cell(white)],
    ];

    // Make red perceptually close enough to be considered noise vs a soft fill
    const softRed = paletteColor(rgb(250, 230, 230));
    const softPalette = [white, softRed];
    grid[1][1] = cell(softRed);

    const cleaned = despeckleIsolatedPixels(grid, softPalette, 1);
    expect(cleaned[1][1].key).toBe(white.key);
  });

  it("keeps high-contrast isolated outline pixels during despeckle", () => {
    const grid: MappedPixel[][] = [
      [cell(white), cell(white), cell(white)],
      [cell(white), cell(black), cell(white)],
      [cell(white), cell(white), cell(white)],
    ];

    const cleaned = despeckleIsolatedPixels(grid, palette, 1);
    expect(cleaned[1][1].key).toBe(black.key);
  });

  it("runs full post-process pipeline", () => {
    const grid: MappedPixel[][] = Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => cell(red))
    );
    grid[0][0] = cell(nearRed);
    grid[4][4] = cell(nearRed);

    const processed = postProcessMappedGrid(grid, palette, { similarityThreshold: 40 });
    expect(processed.flat().every((c) => c.key === red.key)).toBe(true);
  });

  it("keeps colorDistance roughly in 0-100 UI scale for identical colors", () => {
    expect(colorDistance(red.rgb, red.rgb)).toBe(0);
    expect(colorDistance(black.rgb, white.rgb)).toBeGreaterThan(50);
  });
});
