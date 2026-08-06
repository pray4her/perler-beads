import type { ColorSystem } from "@/utils/colorSystemUtils";

export const EDITOR_DOCUMENT_VERSION = 1 as const;
export const MAX_CANVAS_SIZE = 500;
export const TRANSPARENT_PALETTE_INDEX = 0;

export interface EditorPaletteEntry {
  key: string;
  color: string;
  isExternal?: boolean;
}

export type GridVisibility = "auto" | "always" | "hidden";
export type CodeVisibility = "auto" | "always" | "hidden";
export type ReferenceMode = "hidden" | "original" | "grid" | "overlay" | "difference";
export type BoardPreset = "29x29" | "14x14" | "custom";
export type PreviewAspectRatio = "1:1" | "4:5" | "9:16";

export interface EditorDisplaySettings {
  gridVisibility: GridVisibility;
  codeVisibility: CodeVisibility;
  majorGridInterval: number;
  tiledPreview: boolean;
}

export interface EditorPreviewSettings {
  title: string;
  subtitle: string;
  fontFamily: "sans" | "serif" | "mono" | "handwriting";
  titleFontWeight: "400" | "600" | "700";
  subtitleFontWeight: "400" | "600" | "700";
  titleSize: number;
  subtitleSize: number;
  titleColor: string;
  subtitleColor: string;
  titleOpacity: number;
  subtitleOpacity: number;
  titleLineHeight: number;
  subtitleLineHeight: number;
  backgroundColor: string;
  backgroundOpacity: number;
  imageOpacity: number;
  imageScale: number;
  imageOffsetX: number;
  imageOffsetY: number;
  titleOffsetX: number;
  titleOffsetY: number;
  subtitleOffsetX: number;
  subtitleOffsetY: number;
  safeArea: number;
  aspectRatio: PreviewAspectRatio;
}

export interface EditorBoardSettings {
  preset: BoardPreset;
  columns: number;
  rows: number;
  beadDiameterMm: number;
  pitchMm: number;
}

export interface EditorReference {
  data?: Uint8Array;
  fileName?: string;
  mimeType?: string;
  opacity: number;
  mode: ReferenceMode;
}

export interface EditorStamp {
  id: string;
  name: string;
  width: number;
  height: number;
  cells: Uint16Array;
}

export interface EditorDocumentV1 {
  version: typeof EDITOR_DOCUMENT_VERSION;
  id: string;
  name: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  width: number;
  height: number;
  colorSystem: ColorSystem;
  palette: EditorPaletteEntry[];
  cells: Uint16Array;
  baseline?: Uint16Array;
  display: EditorDisplaySettings;
  preview: EditorPreviewSettings;
  board: EditorBoardSettings;
  reference?: EditorReference;
  inventory: Record<string, number>;
  stamps: EditorStamp[];
}

export interface CellPatch {
  index: number;
  before: number;
  after: number;
}

export interface EditorCommand {
  id?: string;
  label: string;
  timestamp?: number;
  patches?: CellPatch[];
  beforeDocument?: EditorDocumentV1;
  afterDocument?: EditorDocumentV1;
  /** Selection state around this command so undo/redo can restore it. Absent = command does not touch the selection. */
  selectionBefore?: SelectionMask | null;
  selectionAfter?: SelectionMask | null;
  /** Commands sharing a key within a short window merge into one history entry (e.g. repeated nudges). */
  coalesceKey?: string;
}

export interface EditorHistoryEntry {
  id: string;
  label: string;
  timestamp: number;
  affectedCells: number;
  bytes: number;
}

export interface EditorSnapshot {
  document: EditorDocumentV1;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  history: EditorHistoryEntry[];
  historyIndex: number;
}

export interface EditorCommitResult {
  document: EditorDocumentV1;
  command: EditorHistoryEntry;
  clearedFuture: boolean;
  /** Selection to restore after this commit; undefined = leave the current selection alone. */
  selection?: SelectionMask | null;
}

export interface SelectionBounds {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface SelectionMask {
  width: number;
  height: number;
  mask: Uint8Array;
  bounds: SelectionBounds | null;
}

export type SelectionCombineMode = "replace" | "add" | "subtract" | "intersect";

export type CanvasAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export interface EditorProjectSummary {
  id: string;
  name: string;
  width: number;
  height: number;
  revision: number;
  updatedAt: number;
  thumbnail?: Uint8Array;
  saveState: "saved" | "saving" | "recovered";
}
