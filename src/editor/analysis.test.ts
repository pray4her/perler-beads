import { describe, expect, it } from "vitest";
import { analyzeManufacturingRisks, getBoardSummary } from "@/editor/analysis";
import { createEditorDocument } from "@/editor/document";
import type { MappedPixel } from "@/utils/pixelation";

const blank: MappedPixel = { key: "ERASE", color: "#fff", isExternal: true };
const red: MappedPixel = { key: "A1", color: "#ff0000" };

describe("manufacturing analysis", () => {
  it("finds isolated beads and calculates board usage", () => {
    const document = createEditorDocument([[red, blank], [blank, red]], "MARD");
    expect(analyzeManufacturingRisks(document).filter((warning) => warning.kind === "isolated")).toHaveLength(2);
    const summary = getBoardSummary(document);
    expect(summary.total).toBe(2);
    expect(summary.physicalWidthMm).toBe(10);
  });
});
