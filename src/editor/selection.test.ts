import { describe, expect, it } from "vitest";
import { combineSelections, invertSelection, rectangularSelection, selectSameColor } from "@/editor/selection";

describe("selection masks", () => {
  it("combines masks using add, subtract and intersection", () => {
    const left = rectangularSelection(4, 4, { startRow: 0, startCol: 0, endRow: 1, endCol: 1 });
    const right = rectangularSelection(4, 4, { startRow: 1, startCol: 1, endRow: 2, endCol: 2 });
    expect(combineSelections(left, right, "add").mask.reduce((a, b) => a + b, 0)).toBe(7);
    expect(combineSelections(left, right, "subtract").mask.reduce((a, b) => a + b, 0)).toBe(3);
    expect(combineSelections(left, right, "intersect").mask.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("selects same-color cells and inverts them", () => {
    const selection = selectSameColor(3, 1, Uint16Array.from([1, 2, 1]), 1);
    expect(Array.from(selection.mask)).toEqual([1, 0, 1]);
    expect(Array.from(invertSelection(selection).mask)).toEqual([0, 1, 0]);
  });
});
