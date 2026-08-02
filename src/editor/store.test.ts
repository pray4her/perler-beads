import { describe, expect, it, vi } from "vitest";
import { createEditorDocument, resizeEditorDocument } from "@/editor/document";
import { EditorStore } from "@/editor/store";
import type { MappedPixel } from "@/utils/pixelation";

const blank: MappedPixel = { key: "ERASE", color: "#ffffff", isExternal: true };

describe("EditorStore", () => {
  it("executes patch commands and supports undo and redo", () => {
    const document = createEditorDocument([[blank]], "MARD");
    document.palette.push({ key: "A1", color: "#ff0000" });
    const listener = vi.fn();
    const store = new EditorStore(document, listener);
    expect(store.execute({ label: "画笔", patches: [{ index: 0, before: 0, after: 1 }] })).toBe(true);
    expect(store.getSnapshot().document.cells[0]).toBe(1);
    expect(store.undo()).toBe(true);
    expect(store.getSnapshot().document.cells[0]).toBe(0);
    expect(store.redo()).toBe(true);
    expect(store.getSnapshot().history[0].affectedCells).toBe(1);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("stores structural resize commands without full-grid patch expansion", () => {
    const document = createEditorDocument([[blank]], "MARD");
    const resized = resizeEditorDocument(document, 29, 29, "center");
    const store = new EditorStore(document);
    store.execute({ label: "调整画布", beforeDocument: document, afterDocument: resized });
    expect(store.getSnapshot().document.width).toBe(29);
    store.undo();
    expect(store.getSnapshot().document.width).toBe(1);
  });
});
