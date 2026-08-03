import { describe, expect, it, vi } from "vitest";
import { createEditorDocument, resizeEditorDocument } from "@/editor/document";
import { moveSelectionPatches } from "@/editor/operations";
import { rectangularSelection, translateSelection } from "@/editor/selection";
import { EditorStore } from "@/editor/store";
import type { EditorCommitResult } from "@/editor/types";
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

  it("keeps the revision consistent when undoing structural commands", () => {
    const document = createEditorDocument([[blank]], "MARD");
    const store = new EditorStore(document);
    store.execute({ label: "调整画布", beforeDocument: store.getSnapshot().document, afterDocument: resizeEditorDocument(store.getSnapshot().document, 5, 5, "center") });
    store.execute({ label: "调整画布", beforeDocument: store.getSnapshot().document, afterDocument: resizeEditorDocument(store.getSnapshot().document, 9, 9, "center") });
    expect(store.getSnapshot().revision).toBe(2);
    expect(store.undo()).toBe(true);
    expect(store.getSnapshot().revision).toBe(1);
    expect(store.getSnapshot().document.width).toBe(5);
    expect(store.undo()).toBe(true);
    // Used to drift to -1; undoing both structural commands must land back at revision 0.
    expect(store.getSnapshot().revision).toBe(0);
    expect(store.getSnapshot().document.width).toBe(1);
    expect(store.redo()).toBe(true);
    expect(store.getSnapshot().revision).toBe(1);
    expect(store.getSnapshot().document.width).toBe(5);
  });

  it("does not clear the redo future for no-op commands", () => {
    const document = createEditorDocument([[blank]], "MARD");
    document.palette.push({ key: "A1", color: "#ff0000" });
    const store = new EditorStore(document);
    store.execute({ label: "画笔", patches: [{ index: 0, before: 0, after: 1 }] });
    store.undo();
    expect(store.getSnapshot().canRedo).toBe(true);
    expect(store.execute({ label: "画笔", patches: [{ index: 0, before: 0, after: 0 }] })).toBe(false);
    expect(store.getSnapshot().canRedo).toBe(true);
    expect(store.redo()).toBe(true);
    expect(store.getSnapshot().document.cells[0]).toBe(1);
  });

  it("restores selection snapshots through execute, undo and redo", () => {
    const document = createEditorDocument([[blank]], "MARD");
    document.palette.push({ key: "A1", color: "#ff0000" });
    const commits: EditorCommitResult[] = [];
    const store = new EditorStore(document, (result) => commits.push(result));
    const selectionBefore = rectangularSelection(1, 1, { startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    store.execute({ label: "移动选区", patches: [{ index: 0, before: 0, after: 1 }], selectionBefore, selectionAfter: null });
    expect(commits.at(-1)?.selection).toBeNull();
    store.undo();
    expect(commits.at(-1)?.selection?.bounds).toEqual({ startRow: 0, startCol: 0, endRow: 0, endCol: 0 });
    store.redo();
    expect(commits.at(-1)?.selection).toBeNull();
  });

  it("does not clobber the selection on undo for commands without selection info", () => {
    const document = createEditorDocument([[blank]], "MARD");
    document.palette.push({ key: "A1", color: "#ff0000" });
    const commits: EditorCommitResult[] = [];
    const store = new EditorStore(document, (result) => commits.push(result));
    store.execute({ label: "画笔", patches: [{ index: 0, before: 0, after: 1 }] });
    expect(commits.at(-1)?.selection).toBeUndefined();
    store.undo();
    expect(commits.at(-1)?.selection).toBeUndefined();
  });

  it("coalesces consecutive nudges into one entry that undoes as a single step", () => {
    const colored: MappedPixel = { key: "A1", color: "#ff0000" };
    const document = createEditorDocument([[blank, colored, blank, blank]], "MARD");
    const store = new EditorStore(document);
    const first = rectangularSelection(4, 1, { startRow: 0, startCol: 1, endRow: 0, endCol: 1 });
    const second = translateSelection(first, 0, 1);
    const third = translateSelection(second, 0, 1);
    store.execute({ label: "移动选区", patches: moveSelectionPatches(document, first, 0, 1, false), selectionBefore: first, selectionAfter: second, coalesceKey: "selection-nudge" });
    store.execute({ label: "移动选区", patches: moveSelectionPatches(store.getSnapshot().document, second, 0, 1, false), selectionBefore: second, selectionAfter: third, coalesceKey: "selection-nudge" });
    expect(store.getSnapshot().history).toHaveLength(1);
    expect(Array.from(store.getSnapshot().document.cells)).toEqual([0, 0, 0, 1]);
    const commits: EditorCommitResult[] = [];
    store.setCommitListener((result) => commits.push(result));
    expect(store.undo()).toBe(true);
    // Both nudges revert at once: earliest cell state and the original selection come back.
    expect(Array.from(store.getSnapshot().document.cells)).toEqual([0, 1, 0, 0]);
    expect(commits.at(-1)?.selection?.bounds).toEqual({ startRow: 0, startCol: 1, endRow: 0, endCol: 1 });
    expect(store.getSnapshot().canUndo).toBe(false);
    expect(store.redo()).toBe(true);
    expect(Array.from(store.getSnapshot().document.cells)).toEqual([0, 0, 0, 1]);
  });

  it("starts a new entry once the coalesce window expires", () => {
    const document = createEditorDocument([[blank]], "MARD");
    const store = new EditorStore(document);
    store.execute({ label: "移动选区", timestamp: 1000, patches: [{ index: 0, before: 0, after: 1 }], coalesceKey: "selection-nudge" });
    store.execute({ label: "移动选区", timestamp: 1500, patches: [{ index: 0, before: 1, after: 2 }], coalesceKey: "selection-nudge" });
    expect(store.getSnapshot().history).toHaveLength(1);
    store.execute({ label: "移动选区", timestamp: 3000, patches: [{ index: 0, before: 2, after: 1 }], coalesceKey: "selection-nudge" });
    expect(store.getSnapshot().history).toHaveLength(2);
  });
});
