import { describe, expect, it } from "vitest";
import { removeExternalBackground } from "@/utils/backgroundRemoval";
import type { MappedPixel } from "@/utils/pixelation";

function bead(key: string, color: string): MappedPixel {
  return { key, color, isExternal: false };
}

function grid(width: number, height: number, create: (row: number, col: number) => MappedPixel): MappedPixel[][] {
  return Array.from({ length: height }, (_, row) =>
    Array.from({ length: width }, (_, col) => create(row, col)),
  );
}

describe("removeExternalBackground", () => {
  it("removes a high-confidence multi-tone background automatically", () => {
    // Given: a centered foreground surrounded by two perceptually similar shades.
    const source = grid(7, 7, (row, col) => {
      const isForeground = row >= 2 && row <= 4 && col >= 2 && col <= 4;
      if (isForeground) return bead("R1", "#C84343");
      return (row + col) % 2 === 0 ? bead("W1", "#F7F7F4") : bead("W2", "#EAEAE6");
    });

    // When: automatic cleanup evaluates the generated grid.
    const result = removeExternalBackground(source, "automatic");

    // Then: all 40 connected background cells are removed and the subject remains.
    expect(result.kind).toBe("removed");
    if (result.kind !== "removed") return;
    expect(result.removedCount).toBe(40);
    expect(result.grid[0]?.[0]?.isExternal).toBe(true);
    expect(result.grid[3]?.[3]).toMatchObject({ key: "R1", isExternal: false });
  });

  it("keeps a low-confidence border unchanged automatically", () => {
    // Given: unrelated colors compete around the border without a background consensus.
    const colors = ["#F2F2F2", "#D64848", "#3278C8", "#48A868"] as const;
    const source = grid(6, 6, (row, col) => bead(`C${(row + col) % colors.length}`, colors[(row + col) % colors.length]));

    // When: automatic cleanup evaluates the ambiguous grid.
    const result = removeExternalBackground(source, "automatic");

    // Then: no cells are removed.
    expect(result).toMatchObject({ kind: "unchanged", reason: "low-confidence" });
  });

  it("uses a more permissive confidence threshold for an explicit manual cleanup", () => {
    // Given: half the border supports a light background while the other half is unrelated.
    const source = grid(7, 7, (row, col) => {
      if (row >= 2 && row <= 4 && col >= 2 && col <= 4) return bead("F1", "#354D8C");
      if (row === 0 || col === 0) return bead("BG", "#F1F0EC");
      if (row === 6 || col === 6) return bead("EDGE", "#B53B3B");
      return bead("BG", "#F1F0EC");
    });

    // When: the same grid is evaluated automatically and then by explicit user action.
    const automatic = removeExternalBackground(source, "automatic");
    const manual = removeExternalBackground(source, "manual");

    // Then: automatic mode abstains while manual mode removes the connected light region.
    expect(automatic.kind).toBe("unchanged");
    expect(manual.kind).toBe("removed");
    if (manual.kind !== "removed") return;
    expect(manual.removedCount).toBeGreaterThan(0);
    expect(manual.grid[3]?.[3]?.isExternal).toBe(false);
  });

  it("preserves matching colors that are enclosed away from the boundary", () => {
    // Given: a white center is separated from the white border by a dark ring.
    const source = grid(7, 7, (row, col) => {
      const inRing = row >= 1 && row <= 5 && col >= 1 && col <= 5;
      const inCenter = row >= 2 && row <= 4 && col >= 2 && col <= 4;
      if (inCenter) return bead("BG", "#F4F4F1");
      if (inRing) return bead("OUTLINE", "#252525");
      return bead("BG", "#F4F4F1");
    });

    // When: the background is removed.
    const result = removeExternalBackground(source, "automatic");

    // Then: only the boundary-connected white cells are external.
    expect(result.kind).toBe("removed");
    if (result.kind !== "removed") return;
    expect(result.grid[0]?.[0]?.isExternal).toBe(true);
    expect(result.grid[3]?.[3]).toMatchObject({ key: "BG", isExternal: false });
  });

  it("does not erase an almost uniform image automatically", () => {
    // Given: an image containing only one mapped color.
    const source = grid(8, 8, () => bead("A1", "#EFEFEB"));

    // When: automatic cleanup would otherwise remove every cell.
    const result = removeExternalBackground(source, "automatic");

    // Then: the maximum-removal guard keeps the pattern intact.
    expect(result).toMatchObject({ kind: "unchanged", reason: "excessive-removal" });
  });
});
