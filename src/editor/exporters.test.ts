import { describe, expect, it } from "vitest";

import { buildProductionSheetModel } from "@/editor/exporters";
import { createEditorDocument } from "@/editor/document";
import { createPatternCsv, parsePatternCsv } from "@/editor/patternCsv";
import type { MappedPixel } from "@/utils/pixelation";

const blank: MappedPixel = { key: "ERASE", color: "#FFFFFF", isExternal: true };
const yellow: MappedPixel = { key: "A01", color: "#FAF4C8" };
const green: MappedPixel = { key: "B01", color: "#E6EE31" };

describe("export contracts", () => {
  it("round-trips v2 color-system CSV without exposing HEX values", async () => {
    const document = createEditorDocument([[yellow, blank], [green, yellow]], "MARD", "CSV 测试");
    const result = parsePatternCsv(createPatternCsv(document));

    expect(result).toMatchObject({
      kind: "success",
      source: "v2",
      colorSystem: "MARD",
      gridDimensions: { N: 2, M: 2 },
    });
    if (result.kind === "success") {
      expect(result.mappedPixelData[0]?.[0]?.key).toBe("A01");
      expect(result.mappedPixelData[0]?.[1]?.isExternal).toBe(true);
      expect(result.mappedPixelData[1]?.[0]?.key).toBe("B01");
    }
  });

  it("accepts legacy HEX CSV input while marking it as a compatibility path", () => {
    const result = parsePatternCsv("#FF0000,TRANSPARENT\n,#00FF00");

    expect(result).toMatchObject({
      kind: "success",
      source: "legacy-hex",
      colorSystem: null,
      gridDimensions: { N: 2, M: 2 },
    });
    if (result.kind === "success") {
      expect(result.mappedPixelData[0]?.[0]).toMatchObject({ key: "#FF0000", color: "#FF0000" });
      expect(result.mappedPixelData[1]?.[0]?.isExternal).toBe(true);
    }
  });

  it("rejects unknown v2 color codes with a cell location", () => {
    const result = parsePatternCsv([
      "format,version,colorSystem,width,height",
      "perler-pattern,2,MARD,1,1",
      "grid",
      "UNKNOWN",
    ].join("\n"));

    expect(result).toEqual({ kind: "error", message: "第 1 行第 1 列的色号无效：UNKNOWN" });
  });

  it("rejects v2 dimensions that do not match the color-code grid", () => {
    const result = parsePatternCsv([
      "format,version,colorSystem,width,height",
      "perler-pattern,2,MARD,2,2",
      "grid",
      "A01,A01",
    ].join("\n"));

    expect(result).toEqual({ kind: "error", message: "CSV v2 行数不匹配：声明 2 行，实际 1 行" });
  });

  it("derives board pages, material summary and shortages from one production model", () => {
    const document = createEditorDocument([
      [yellow, green, blank],
      [yellow, blank, green],
      [blank, yellow, green],
    ], "MARD", "制作测试");
    document.board.columns = 2;
    document.board.rows = 2;
    document.inventory["MARD:A01"] = 2;

    const model = buildProductionSheetModel(document, { paper: "a3" });

    expect(model.paper).toBe("a3");
    expect(model.total).toBe(6);
    expect(model.pages).toHaveLength(4);
    expect(model.grid[0]?.[0]).toMatchObject({ key: "A01", color: "#FAF4C8" });
    expect(model.grid[0]?.[2]).toBeNull();
    expect(model.columnCoordinates.map((coordinate) => coordinate.label)).toEqual(["1", "3"]);
    expect(model.rowCoordinates.map((coordinate) => coordinate.label)).toEqual(["1", "3"]);
    expect(model.pages[0]).toMatchObject({ startRow: 0, startColumn: 0, rows: 2, columns: 2, beadCount: 3 });
    expect(model.colors).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "A01", count: 3, shortage: 1, symbol: "X" }),
      expect.objectContaining({ key: "B01", count: 3, shortage: null, symbol: "O" }),
    ]));
    expect(model.symbolByKey).toMatchObject({ A01: "X", B01: "O" });
    expect(model.boardCellColumns).toBe(2);
    expect(model.boardCellRows).toBe(2);
  });
});
