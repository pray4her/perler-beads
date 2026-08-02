import { cloneEditorDocument } from "@/editor/document";
import type {
  EditorCommand,
  EditorCommitResult,
  EditorDocumentV1,
  EditorHistoryEntry,
  EditorSnapshot,
} from "@/editor/types";

const MAX_HISTORY_COMMANDS = 100;
const MAX_HISTORY_BYTES = 64 * 1024 * 1024;

interface StoredCommand {
  command: EditorCommand;
  entry: EditorHistoryEntry;
}

function commandBytes(command: EditorCommand): number {
  if (command.patches) return command.patches.length * 12 + 128;
  if (command.beforeDocument && command.afterDocument) {
    return command.beforeDocument.cells.byteLength + command.afterDocument.cells.byteLength + 1024;
  }
  return 128;
}

function commandId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `command-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class EditorStore {
  private document: EditorDocumentV1;
  private history: StoredCommand[] = [];
  private historyIndex = 0;
  private listeners = new Set<() => void>();
  private snapshot: EditorSnapshot;
  private onCommit?: (result: EditorCommitResult) => void;

  constructor(document: EditorDocumentV1, onCommit?: (result: EditorCommitResult) => void) {
    this.document = cloneEditorDocument(document);
    this.onCommit = onCommit;
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): EditorSnapshot => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setCommitListener(listener?: (result: EditorCommitResult) => void) {
    this.onCommit = listener;
  }

  replaceDocument(document: EditorDocumentV1) {
    this.document = cloneEditorDocument(document);
    this.history = [];
    this.historyIndex = 0;
    this.emit();
  }

  execute(command: EditorCommand): boolean {
    const clearedFuture = this.historyIndex < this.history.length;
    if (clearedFuture) this.history = this.history.slice(0, this.historyIndex);
    const normalized: EditorCommand = {
      ...command,
      id: command.id ?? commandId(),
      timestamp: command.timestamp ?? Date.now(),
      patches: command.patches?.filter((patch) => patch.before !== patch.after),
    };
    if ((!normalized.patches || normalized.patches.length === 0) && !normalized.afterDocument) return false;

    this.apply(normalized, "forward");
    const entry: EditorHistoryEntry = {
      id: normalized.id!,
      label: normalized.label,
      timestamp: normalized.timestamp!,
      affectedCells: normalized.patches?.length ?? normalized.afterDocument?.cells.length ?? 0,
      bytes: commandBytes(normalized),
    };
    this.history.push({ command: normalized, entry });
    this.historyIndex = this.history.length;
    this.trimHistory();
    this.emit();
    this.onCommit?.({ document: cloneEditorDocument(this.document), command: entry, clearedFuture });
    return true;
  }

  undo(): boolean {
    if (this.historyIndex === 0) return false;
    const stored = this.history[this.historyIndex - 1];
    this.apply(stored.command, "backward");
    this.historyIndex -= 1;
    this.emit();
    this.onCommit?.({ document: cloneEditorDocument(this.document), command: stored.entry, clearedFuture: false });
    return true;
  }

  redo(): boolean {
    if (this.historyIndex >= this.history.length) return false;
    const stored = this.history[this.historyIndex];
    this.apply(stored.command, "forward");
    this.historyIndex += 1;
    this.emit();
    this.onCommit?.({ document: cloneEditorDocument(this.document), command: stored.entry, clearedFuture: false });
    return true;
  }

  rollbackTo(index: number): boolean {
    const target = Math.max(0, Math.min(this.history.length, index));
    let changed = false;
    while (this.historyIndex > target) changed = this.undo() || changed;
    while (this.historyIndex < target) changed = this.redo() || changed;
    return changed;
  }

  private apply(command: EditorCommand, direction: "forward" | "backward") {
    if (command.beforeDocument && command.afterDocument) {
      this.document = cloneEditorDocument(direction === "forward" ? command.afterDocument : command.beforeDocument);
    } else if (command.patches) {
      const cells = this.document.cells.slice();
      for (const patch of command.patches) cells[patch.index] = direction === "forward" ? patch.after : patch.before;
      this.document = { ...this.document, cells };
    }
    this.document.revision += direction === "forward" ? 1 : -1;
    this.document.updatedAt = Date.now();
  }

  private trimHistory() {
    let bytes = this.history.reduce((sum, item) => sum + item.entry.bytes, 0);
    while (this.history.length > MAX_HISTORY_COMMANDS || bytes > MAX_HISTORY_BYTES) {
      const removed = this.history.shift();
      if (!removed) break;
      bytes -= removed.entry.bytes;
      this.historyIndex = Math.max(0, this.historyIndex - 1);
    }
  }

  private buildSnapshot(): EditorSnapshot {
    return {
      document: this.document,
      revision: this.document.revision,
      canUndo: this.historyIndex > 0,
      canRedo: this.historyIndex < this.history.length,
      history: this.history.map((item) => item.entry),
      historyIndex: this.historyIndex,
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach((listener) => listener());
  }
}
