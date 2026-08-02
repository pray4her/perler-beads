import { describe, expect, it } from "vitest";
import { createEditorDocument } from "@/editor/document";
import { exportPerlerProject, importPerlerProject } from "@/editor/projectArchive";
import type { MappedPixel } from "@/utils/pixelation";
import { strToU8, zipSync } from "fflate";

describe(".perler project archives", () => {
  it("round-trips typed cell data and metadata", async () => {
    const grid: MappedPixel[][] = [[{ key: "A1", color: "#ff0000" }, { key: "ERASE", color: "#ffffff", isExternal: true }]];
    const document = createEditorDocument(grid, "MARD", "测试项目");
    const blob = await exportPerlerProject(document);
    const restored = await importPerlerProject(blob);
    expect(restored.name).toBe("测试项目");
    expect(Array.from(restored.cells)).toEqual(Array.from(document.cells));
    expect(restored.palette).toEqual(document.palette);
  });

  it("rejects non-archive input", async () => {
    await expect(importPerlerProject(new Blob(["not a zip"]))).rejects.toThrow();
  });

  it("rejects archive path traversal", async () => {
    const archive = zipSync({
      "../outside.txt": strToU8("blocked"),
      "manifest.json": strToU8(JSON.stringify({ format: "perler-project", version: 1 })),
      "cells.bin": new Uint8Array(2),
    });
    await expect(importPerlerProject(new Blob([archive as BlobPart]))).rejects.toThrow("不允许的文件");
  });
});
