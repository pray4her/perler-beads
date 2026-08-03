import { cloneEditorDocument } from "@/editor/document";
import type {
  CellPatch,
  EditorCommand,
  EditorCommitResult,
  EditorDocumentV1,
  EditorHistoryEntry,
  EditorSnapshot,
  SelectionMask,
} from "@/editor/types";

const MAX_HISTORY_COMMANDS = 100;
const MAX_HISTORY_BYTES = 64 * 1024 * 1024;
/** Consecutive commands with the same coalesceKey inside this window merge into one entry. */
const COALESCE_WINDOW_MS = 1000;

interface StoredCommand {
  command: EditorCommand;
  entry: EditorHistoryEntry;
}

function cloneSelectionMask(selection: SelectionMask | null): SelectionMask | null {
  if (!selection) return null;
  return { ...selection, mask: selection.mask.slice(), bounds: selection.bounds ? { ...selection.bounds } : null };
}

/** Merge an incoming patch set onto a stored one, keeping the earliest `before` per cell. */
function mergePatches(base: CellPatch[], incoming: CellPatch[]): CellPatch[] {
  const merged = new Map<number, CellPatch>();
  for (const patch of base) merged.set(patch.index, { ...patch });
  for (const patch of incoming) {
    const existing = merged.get(patch.index);
    if (existing) existing.after = patch.after;
    else merged.set(patch.index, { index: patch.index, before: patch.before, after: patch.after });
  }
  return Array.from(merged.values()).filter((patch) => patch.before !== patch.after);
}

function commandBytes(command: EditorCommand): number {
  let bytes = 128;
  if (command.patches) bytes += command.patches.length * 12;
  if (command.beforeDocument && command.afterDocument) {
    bytes += command.beforeDocument.cells.byteLength + command.afterDocument.cells.byteLength + 1024;
  }
  if (command.selectionBefore) bytes += command.selectionBefore.mask.byteLength + 64;
  if (command.selectionAfter) bytes += command.selectionAfter.mask.byteLength + 64;
  return bytes;
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
    const normalized: EditorCommand = {
      ...command,
      id: command.id ?? commandId(),
      timestamp: command.timestamp ?? Date.now(),
      patches: command.patches?.filter((patch) => patch.before !== patch.after),
      selectionBefore: command.selectionBefore === undefined ? undefined : cloneSelectionMask(command.selectionBefore),
      selectionAfter: command.selectionAfter === undefined ? undefined : cloneSelectionMask(command.selectionAfter),
    };
    // Determine no-ops before touching history so they never discard the redo future.
    if ((!normalized.patches || normalized.patches.length === 0) && !normalized.afterDocument) return false;
    const clearedFuture = this.historyIndex < this.history.length;
    if (clearedFuture) this.history = this.history.slice(0, this.historyIndex);

    // Coalesce rapid same-key commands (e.g. held arrow-key nudges) into the top entry:
    // keep the earliest before/selectionBefore, replace the after, push nothing new.
    if (normalized.coalesceKey && normalized.patches && this.historyIndex > 0) {
      const top = this.history[this.historyIndex - 1];
      if (top.command.coalesceKey === normalized.coalesceKey && top.command.patches && normalized.timestamp! - top.command.timestamp! <= COALESCE_WINDOW_MS) {
        this.apply(normalized, "forward");
        const mergedPatches = mergePatches(top.command.patches, normalized.patches);
        top.command = {
          ...top.command,
          timestamp: normalized.timestamp,
          patches: mergedPatches,
          selectionAfter: normalized.selectionAfter === undefined ? top.command.selectionAfter : normalized.selectionAfter,
        };
        top.entry = {
          ...top.entry,
          timestamp: normalized.timestamp!,
          affectedCells: mergedPatches.length,
          bytes: commandBytes(top.command),
        };
        this.emit();
        this.onCommit?.({
          document: cloneEditorDocument(this.document),
          command: top.entry,
          clearedFuture,
          selection: top.command.selectionAfter === undefined ? undefined : cloneSelectionMask(top.command.selectionAfter),
        });
        return true;
      }
    }

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
    this.onCommit?.({
      document: cloneEditorDocument(this.document),
      command: entry,
      clearedFuture,
      selection: normalized.selectionAfter === undefined ? undefined : cloneSelectionMask(normalized.selectionAfter),
    });
    return true;
  }

  undo(): boolean {
    if (this.historyIndex === 0) return false;
    const stored = this.history[this.historyIndex - 1];
    this.apply(stored.command, "backward");
    this.historyIndex -= 1;
    this.emit();
    this.onCommit?.({
      document: cloneEditorDocument(this.document),
      command: stored.entry,
      clearedFuture: false,
      selection: stored.command.selectionBefore === undefined ? undefined : cloneSelectionMask(stored.command.selectionBefore),
    });
    return true;
  }

  redo(): boolean {
    if (this.historyIndex >= this.history.length) return false;
    const stored = this.history[this.historyIndex];
    this.apply(stored.command, "forward");
    this.historyIndex += 1;
    this.emit();
    this.onCommit?.({
      document: cloneEditorDocument(this.document),
      command: stored.entry,
      clearedFuture: false,
      selection: stored.command.selectionAfter === undefined ? undefined : cloneSelectionMask(stored.command.selectionAfter),
    });
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
      const snapshot = direction === "forward" ? command.afterDocument : command.beforeDocument;
      this.document = cloneEditorDocument(snapshot);
      // Snapshots carry the revision they were captured at; trust it so undoing
      // structural commands restores the pre-command revision instead of drifting negative.
      this.document.revision = direction === "forward" ? snapshot.revision + 1 : snapshot.revision;
    } else if (command.patches) {
      const cells = this.document.cells.slice();
      for (const patch of command.patches) cells[patch.index] = direction === "forward" ? patch.after : patch.before;
      this.document = { ...this.document, cells };
      this.document.revision += direction === "forward" ? 1 : -1;
    }
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
