import { describe, expect, it } from "vitest";
import { createEditorDocument } from "@/editor/document";
import {
  floodFillPatches,
  getBrushPoints,
  getEllipsePoints,
  getLinePoints,
  getRectanglePoints,
  moveSelectionPatches,
  withSymmetry,
} from "@/editor/operations";
import { rectangularSelection } from "@/editor/selection";
import type { MappedPixel } from "@/utils/pixelation";

function cell(key: string, color: string, isExternal = false): MappedPixel {
  return { key, color, isExternal };
}

describe("editor operations", () => {
  it("draws continuous lines, rectangles and discrete ellipses", () => {
    expect(getLinePoints({ row: 0, col: 0 }, { row: 3, col: 3 })).toHaveLength(4);
    expect(getRectanglePoints({ row: 0, col: 0 }, { row: 2, col: 2 }, false)).toHaveLength(8);
    expect(getEllipsePoints({ row: 0, col: 0 }, { row: 6, col: 6 }, false).length).toBeGreaterThan(8);
  });

  it("uses the current cell as the top-left anchor for size two", () => {
    expect(getBrushPoints({ row: 4, col: 5 }, 2, "square")).toEqual([
      { row: 4, col: 5 }, { row: 4, col: 6 }, { row: 5, col: 5 }, { row: 5, col: 6 },
    ]);
  });

  it("mirrors points across configurable axes", () => {
    const points = withSymmetry([{ row: 1, col: 1 }], 5, 5, true, true, 2, 2);
    expect(points).toEqual(expect.arrayContaining([
      { row: 1, col: 1 }, { row: 1, col: 3 }, { row: 3, col: 1 }, { row: 3, col: 3 },
    ]));
  });

  it("fills connected and all-same-color regions", () => {
    const grid = [
      [cell("A", "#ff0000"), cell("A", "#ff0000"), cell("B", "#0000ff")],
      [cell("B", "#0000ff"), cell("A", "#ff0000"), cell("B", "#0000ff")],
    ];
    const document = createEditorDocument(grid, "MARD");
    expect(floodFillPatches(document, { row: 0, col: 0 }, 2, "connected", "canvas")).toHaveLength(3);
    expect(floodFillPatches(document, { row: 0, col: 2 }, 1, "all", "canvas")).toHaveLength(3);
  });

  it("moves only selected cells and keeps history-sized patches", () => {
    const grid = [[cell("A", "#ff0000"), cell("ERASE", "#ffffff", true), cell("ERASE", "#ffffff", true)]];
    const document = createEditorDocument(grid, "MARD");
    const selection = rectangularSelection(3, 1, { startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    const patches = moveSelectionPatches(document, selection, 0, 1, false);
    expect(patches).toEqual(expect.arrayContaining([
      { index: 0, before: 1, after: 0 },
      { index: 1, before: 0, after: 1 },
    ]));
  });
});
