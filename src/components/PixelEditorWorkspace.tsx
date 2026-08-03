"use client";

import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Circle,
  ClipboardPaste,
  Copy,
  Crop,
  Download,
  Eraser,
  FileArchive,
  FlipHorizontal,
  FlipVertical,
  Focus,
  Hand,
  Minus,
  MousePointer2,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  RotateCw,
  Save,
  Scissors,
  Square,
  Stamp,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import ResultPreviewPanel from "@/components/ResultPreviewPanel";
import FieldHelp from "@/components/FieldHelp";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { countColors, getBoardSummary, type ManufacturingWarning } from "@/editor/analysis";
import {
  cloneEditorDocument,
  cropEditorDocument,
  editorDocumentToGrid,
  ensurePaletteEntry,
  resizeEditorDocument,
  trimTransparent,
} from "@/editor/document";
import { copyProductToClipboard, createPatternCsv, exportPatternPdf, renderProductPng } from "@/editor/exporters";
import {
  getBrushPoints,
  getEllipsePoints,
  getLinePoints,
  getRectanglePoints,
  moveSelectionPatches,
  patchesForPoints,
  transformSelectionDocument,
  withSymmetry,
  type BrushShape,
  type CellPoint,
  type FillMode,
  type FillScope,
} from "@/editor/operations";
import { downloadBlob, exportPerlerProject, importPerlerProject } from "@/editor/projectArchive";
import { deleteProject, listProjects, loadProject, saveNamedSnapshot, saveProject, saveRecovery } from "@/editor/projectStorage";
import { getColorMetrics, oklabDistance, uniquePaletteEntries } from "@/editor/palette";
import {
  clampSelectionDelta,
  combineSelections,
  createSelectionMask,
  invertSelection,
  rectangularSelection,
  selectNonTransparent,
  selectSameColor,
  translateSelection,
} from "@/editor/selection";
import { EditorStore } from "@/editor/store";
import type {
  CanvasAnchor,
  CellPatch,
  EditorCommand,
  EditorCommitResult,
  EditorDocumentV1,
  EditorPaletteEntry,
  EditorProjectSummary,
  SelectionBounds,
  SelectionCombineMode,
  SelectionMask,
} from "@/editor/types";
import { fillInWorker, risksInWorker } from "@/editor/workerClient";
import type { EditorTool, PaletteSortMode, RectangleMode } from "@/types/editorTypes";
import { getColorKeyByHex, type ColorSystem } from "@/utils/colorSystemUtils";
import { TRANSPARENT_KEY } from "@/utils/pixelEditingUtils";

interface PaletteItem {
  key: string;
  color: string;
}

interface PixelEditorWorkspaceProps {
  initialDocument: EditorDocumentV1;
  paletteColors: PaletteItem[];
  currentColors: PaletteItem[];
  onCommit: (result: EditorCommitResult) => void;
  onExit: () => void;
  onDownloadPattern: () => void;
  onEnterFocus?: (projectId: string, revision: number) => void;
  onOpenGenerationParams?: () => void;
  onOpenCustomPalette?: () => void;
}

interface Camera {
  x: number;
  y: number;
  zoom: number;
  previousZoom: number;
}

interface Gesture {
  pointerId: number;
  tool: EditorTool;
  start: CellPoint;
  last: CellPoint;
  moved: boolean;
  fromPending: boolean;
  patches: Map<number, CellPatch>;
  /** Every cell under the stroke, including no-op same-color hits (preview only). */
  touched: Set<number>;
  pan?: { x: number; y: number; cameraX: number; cameraY: number };
  /** Select-tool drag that moves the selection content instead of re-selecting. */
  moveSelection?: boolean;
}

interface ClipboardPayload {
  width: number;
  height: number;
  cells: Uint16Array;
  mask: Uint8Array;
}

type InspectorTab = "color" | "selection" | "canvas" | "make" | "preview" | "history";
type ShapeTool = "line" | "rectangle" | "ellipse" | "select";

const BASE_CELL_SIZE = 22;
const MIN_ZOOM = 0.18;
const MAX_ZOOM = 8;
/** Pixel-delta multiplier for exponential wheel zoom (mouse notches + trackpad). */
const WHEEL_ZOOM_SENSITIVITY = 0.0018;
const MINOR_GRID_ZOOM = 0.42;
const EDITOR_ACCENT = "#b43e2b";
const SHAPE_TOOLS = new Set<EditorTool>(["line", "rectangle", "ellipse", "select"]);

/** Snap a CSS length/position onto an integer device-pixel boundary (MDN crisp-line practice). */
function snapDevice(value: number, dpr: number): number {
  return Math.round(value * dpr) / dpr;
}

/** CSS coordinate through the center of a device pixel for 1-device-px strokes. */
function hairline(value: number, dpr: number): number {
  return (Math.round(value * dpr) + 0.5) / dpr;
}

/**
 * Shared paint/hit-test metrics. Snapping cellSize + origin keeps adjacent grid lines
 * equally spaced and 1px strokes from anti-aliasing unevenly across fractional zooms.
 */
function getViewTransform(camera: Camera, dpr: number) {
  const safeDpr = Math.max(1, dpr);
  return {
    dpr: safeDpr,
    cellSize: Math.max(1 / safeDpr, snapDevice(BASE_CELL_SIZE * camera.zoom, safeDpr)),
    originX: snapDevice(camera.x, safeDpr),
    originY: snapDevice(camera.y, safeDpr),
    lineWidth: 1 / safeDpr,
  };
}

const toolDefinitions: Array<{ id: EditorTool; label: string; shortcut: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "move", label: "移动", shortcut: "V", icon: Hand },
  { id: "brush", label: "画笔", shortcut: "B", icon: Pencil },
  { id: "eraser", label: "橡皮", shortcut: "E", icon: Eraser },
  { id: "eyedropper", label: "取色", shortcut: "I", icon: Pipette },
  { id: "fill", label: "填充", shortcut: "G", icon: PaintBucket },
  { id: "line", label: "直线", shortcut: "L", icon: Minus },
  { id: "rectangle", label: "矩形", shortcut: "R", icon: Square },
  { id: "ellipse", label: "椭圆", shortcut: "O", icon: Circle },
  { id: "select", label: "选择", shortcut: "S", icon: MousePointer2 },
  { id: "stamp", label: "图章", shortcut: "T", icon: Stamp },
];

function toolLabel(tool: EditorTool) {
  return toolDefinitions.find((item) => item.id === tool)?.label ?? tool;
}

function sortCode(left: EditorPaletteEntry, right: EditorPaletteEntry, system: ColorSystem) {
  const a = getColorKeyByHex(left.color, system);
  const b = getColorKeyByHex(right.color, system);
  return a.localeCompare(b, "zh-CN", { numeric: true });
}

function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']");
}

function normalizeBounds(start: CellPoint, end: CellPoint): SelectionBounds {
  return {
    startRow: Math.min(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endRow: Math.max(start.row, end.row),
    endCol: Math.max(start.col, end.col),
  };
}

/** Border cells of a bounds rect shifted by a delta; cheap drag-move preview. */
function shiftedOutlinePoints(bounds: SelectionBounds, rowDelta: number, colDelta: number): CellPoint[] {
  const startRow = bounds.startRow + rowDelta;
  const endRow = bounds.endRow + rowDelta;
  const startCol = bounds.startCol + colDelta;
  const endCol = bounds.endCol + colDelta;
  const points: CellPoint[] = [];
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      if (row === startRow || row === endRow || col === startCol || col === endCol) points.push({ row, col });
    }
  }
  return points;
}

function downloadNamedBlob(blob: Blob, name: string) {
  downloadBlob(blob, name);
}

/** Stock input that stays responsive locally and commits a single history entry on blur. */
function InventoryStockInput({ value, onCommit }: { value: number | undefined; onCommit: (next: number) => void }) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  useEffect(() => setDraft(value === undefined ? "" : String(value)), [value]);
  const commit = () => {
    const next = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(next) && Math.max(0, next) !== value) onCommit(Math.max(0, next));
    else setDraft(value === undefined ? "" : String(value));
  };
  return (
    <input
      type="number"
      min="0"
      placeholder="未设置"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    />
  );
}

function drawBlankCell(
  context: CanvasRenderingContext2D,
  point: CellPoint,
  camera: Camera,
  cellSize: number,
) {
  const x = camera.x + point.col * cellSize;
  const y = camera.y + point.row * cellSize;
  context.fillStyle = (point.row + point.col) % 2 === 0 ? "#f7f6f2" : "#eeece6";
  context.fillRect(x, y, cellSize, cellSize);
}

/** Draw collapsed top + left hairlines; adjacent cells never double-paint a border. */
function drawCellGridLines(
  context: CanvasRenderingContext2D,
  point: CellPoint,
  camera: Camera,
  cellSize: number,
  zoom: number,
  dpr: number,
) {
  if (zoom < MINOR_GRID_ZOOM && point.row % 5 !== 0 && point.col % 5 !== 0) return;
  const x = snapDevice(camera.x + point.col * cellSize, dpr);
  const y = snapDevice(camera.y + point.row * cellSize, dpr);
  const stroke = 1 / dpr;
  context.fillStyle = point.row % 5 === 0 || point.col % 5 === 0 ? "rgba(20,20,19,.42)" : "rgba(20,20,19,.18)";
  context.fillRect(x, y, cellSize, stroke);
  context.fillRect(x, y, stroke, cellSize);
}

function drawCell(
  context: CanvasRenderingContext2D,
  point: CellPoint,
  color: string | null,
  camera: Camera,
  cellSize: number,
  zoom: number,
  showGrid: boolean,
  dpr = 1,
) {
  if (color) {
    context.fillStyle = color;
    context.fillRect(camera.x + point.col * cellSize, camera.y + point.row * cellSize, cellSize, cellSize);
  } else {
    drawBlankCell(context, point, camera, cellSize);
  }
  if (showGrid) drawCellGridLines(context, point, camera, cellSize, zoom, dpr);
}

function addExposedCellEdges(
  context: CanvasRenderingContext2D,
  point: CellPoint,
  keys: Set<string>,
  camera: Camera,
  cellSize: number,
) {
  const x = camera.x + point.col * cellSize;
  const y = camera.y + point.row * cellSize;
  const has = (row: number, col: number) => keys.has(`${row},${col}`);
  if (!has(point.row - 1, point.col)) { context.moveTo(x, y); context.lineTo(x + cellSize, y); }
  if (!has(point.row, point.col + 1)) { context.moveTo(x + cellSize, y); context.lineTo(x + cellSize, y + cellSize); }
  if (!has(point.row + 1, point.col)) { context.moveTo(x + cellSize, y + cellSize); context.lineTo(x, y + cellSize); }
  if (!has(point.row, point.col - 1)) { context.moveTo(x, y + cellSize); context.lineTo(x, y); }
}

// Kept for regression contract + shared outline path; stroke overlay inlines a tinted variant.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- referenced by check-frontend-regressions.mjs
function drawCellSetOutline(
  context: CanvasRenderingContext2D,
  points: CellPoint[],
  camera: Camera,
  cellSize: number,
  fillColor: string,
) {
  const keys = new Set(points.map((point) => `${point.row},${point.col}`));
  context.save();
  context.fillStyle = fillColor;
  for (const point of points) context.fillRect(camera.x + point.col * cellSize, camera.y + point.row * cellSize, cellSize, cellSize);
  context.beginPath();
  for (const point of points) addExposedCellEdges(context, point, keys, camera, cellSize);
  context.strokeStyle = "rgba(250,249,245,.96)";
  context.lineWidth = 3;
  context.stroke();
  context.strokeStyle = EDITOR_ACCENT;
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

function renderPaintStrokeOverlay(
  context: CanvasRenderingContext2D,
  paintedKeys: Set<string>,
  camera: Camera,
  cellSize: number,
  color: string,
) {
  if (paintedKeys.size === 0) return;
  const points = Array.from(paintedKeys, (key) => {
    const [row, col] = key.split(",").map(Number);
    return { row, col };
  });
  const keys = new Set(points.map((point) => `${point.row},${point.col}`));
  context.save();
  // Intent color first (may vanish on same-color cells).
  context.fillStyle = color.length === 7 ? `${color}66` : color;
  for (const point of points) {
    context.fillRect(camera.x + point.col * cellSize, camera.y + point.row * cellSize, cellSize, cellSize);
  }
  // Accent wash on top so same-color targets still read as "in stroke".
  context.fillStyle = "rgba(180,62,43,.20)";
  for (const point of points) {
    context.fillRect(camera.x + point.col * cellSize, camera.y + point.row * cellSize, cellSize, cellSize);
  }
  context.beginPath();
  for (const point of points) addExposedCellEdges(context, point, keys, camera, cellSize);
  context.strokeStyle = "rgba(250,249,245,.96)";
  context.lineWidth = 3;
  context.stroke();
  context.strokeStyle = EDITOR_ACCENT;
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

export default function PixelEditorWorkspace({
  initialDocument,
  paletteColors,
  currentColors,
  onCommit,
  onExit,
  onDownloadPattern,
  onEnterFocus,
  onOpenGenerationParams,
  onOpenCustomPalette,
}: PixelEditorWorkspaceProps) {
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const storeRef = useRef<EditorStore | null>(null);
  if (!storeRef.current) storeRef.current = new EditorStore(initialDocument, (result) => {
    // Undo/redo of selection-aware commands (nudge, transform, …) restores the mask here.
    if (result.selection !== undefined) setSelectionRef.current(result.selection);
    onCommitRef.current(result);
  });
  const store = storeRef.current;
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const document = snapshot.document;

  const viewportRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);
  const contentCanvasRef = useRef<HTMLCanvasElement>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<Camera>({ x: 72, y: 72, zoom: 1, previousZoom: 1 });
  const viewportSizeRef = useRef({ width: 800, height: 600 });
  const hoverRef = useRef<CellPoint | null>(null);
  const activeGestureRef = useRef<Gesture | null>(null);
  const pendingShapeRef = useRef<{ tool: ShapeTool; start: CellPoint } | null>(null);
  const previewPointsRef = useRef<CellPoint[]>([]);
  const pointerQueueRef = useRef<{ x: number; y: number; shift: boolean; alt: boolean } | null>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const drawFrameRef = useRef<number | null>(null);
  const spacePressedRef = useRef(false);
  const selectionAnchorRef = useRef<CellPoint>({ row: 0, col: 0 });
  const lastSelectionRef = useRef<SelectionMask | null>(null);
  const clipboardRef = useRef<ClipboardPayload | null>(null);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number; center: { x: number; y: number } } | null>(null);
  const referenceBitmapRef = useRef<ImageBitmap | null>(null);
  const cursorLabelRef = useRef<HTMLSpanElement>(null);
  const fillInFlightRef = useRef(false);
  const risksRequestRef = useRef(0);

  const [tool, setTool] = useState<EditorTool>("move");
  const [toolbarIndex, setToolbarIndex] = useState(0);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("color");
  const [activeCell, setActiveCell] = useState<CellPoint>({ row: 0, col: 0 });
  const [selection, setSelection] = useState<SelectionMask | null>(null);
  // Stable handle so the store commit callback (created before this state exists) can restore selections.
  const setSelectionRef = useRef(setSelection);
  const [selectionMode, setSelectionMode] = useState<SelectionCombineMode>("replace");
  const [selectedColor, setSelectedColor] = useState<EditorPaletteEntry>(() => {
    const first = currentColors[0] ?? paletteColors[0];
    return first ? { ...first, isExternal: false } : document.palette[0];
  });
  const [backgroundColor, setBackgroundColor] = useState<EditorPaletteEntry>(() => document.palette[0]);
  const [recentColors, setRecentColors] = useState<EditorPaletteEntry[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [paletteSearch, setPaletteSearch] = useState("");
  const [paletteSource, setPaletteSource] = useState<"current" | "all">("current");
  const [paletteSort, setPaletteSort] = useState<PaletteSortMode>("usage");
  const [sortAscending, setSortAscending] = useState(false);
  const [replaceSourceIndex, setReplaceSourceIndex] = useState(0);
  const [brushSize, setBrushSize] = useState(1);
  const [brushShape, setBrushShape] = useState<BrushShape>("square");
  const [symmetryHorizontal, setSymmetryHorizontal] = useState(false);
  const [symmetryVertical, setSymmetryVertical] = useState(false);
  const [symmetryCol, setSymmetryCol] = useState((document.width - 1) / 2);
  const [symmetryRow, setSymmetryRow] = useState((document.height - 1) / 2);
  const [rectangleMode, setRectangleMode] = useState<RectangleMode>("outline");
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [fillMode, setFillMode] = useState<FillMode>("connected");
  const [fillScope, setFillScope] = useState<FillScope>("canvas");
  const [shortcutsEnabled, setShortcutsEnabled] = useState(true);
  const [resizeWidth, setResizeWidth] = useState(document.width);
  const [resizeHeight, setResizeHeight] = useState(document.height);
  const [resizeAnchor, setResizeAnchor] = useState<CanvasAnchor>("center");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "recovered">("saved");
  const [projects, setProjects] = useState<EditorProjectSummary[]>([]);
  const [warnings, setWarnings] = useState<ManufacturingWarning[]>([]);
  const [ignoredWarnings, setIgnoredWarnings] = useState<Set<string>>(() => new Set());
  const [statusMessage, setStatusMessage] = useState("编辑器已就绪");
  const [cameraVersion, setCameraVersion] = useState(0);
  const [namedSnapshot, setNamedSnapshot] = useState("");

  const grid = useMemo(() => editorDocumentToGrid(document), [document]);
  const usage = useMemo(() => countColors(document), [document]);
  const usageMap = useMemo(() => new Map(usage.map((item) => [item.palette.color.toUpperCase(), item.count])), [usage]);
  const boardSummary = useMemo(() => getBoardSummary(document), [document]);

  const selectionCount = useMemo(() => selection ? selection.mask.reduce((sum, value) => sum + value, 0) : 0, [selection]);

  const selectedPaletteIndex = useCallback(() => ensurePaletteEntry(document, selectedColor), [document, selectedColor]);

  const executeStructural = useCallback((label: string, next: EditorDocumentV1) => {
    store.execute({ label, beforeDocument: cloneEditorDocument(document), afterDocument: next });
  }, [document, store]);

  const clearSelectionState = useCallback(() => {
    setSelection(null);
    lastSelectionRef.current = null;
    pendingShapeRef.current = null;
    previewPointsRef.current = [];
  }, []);

  // Deselect but remember the mask so 重选 can bring it back (Esc / Ctrl+D path).
  const deselect = useCallback(() => {
    if (selection) {
      lastSelectionRef.current = selection;
      setSelection(null);
    }
  }, [selection]);

  const invertCurrentSelection = useCallback(() => {
    setSelection(invertSelection(selection ?? createSelectionMask(document.width, document.height)));
  }, [document.height, document.width, selection]);

  const executePatches = useCallback((label: string, patches: CellPatch[], selectionAfter?: SelectionMask | null, coalesceKey?: string) => {
    // Skip no-ops up front: they must neither prompt nor discard redoable history.
    const effective = patches.filter((patch) => patch.before !== patch.after);
    if (effective.length === 0) return;
    if (snapshot.canRedo && !window.confirm("继续编辑会清除尚未重做的历史。是否继续？")) return;
    const command: EditorCommand = { label, patches: effective };
    if (selectionAfter !== undefined) {
      command.selectionBefore = selection;
      command.selectionAfter = selectionAfter;
    }
    if (coalesceKey) command.coalesceKey = coalesceKey;
    if (store.execute(command)) setStatusMessage(`${label} · ${effective.length} 格`);
  }, [selection, snapshot.canRedo, store]);

  const drawEditor = useCallback(() => {
    const current = store.getSnapshot().document;
    const { width: viewWidth, height: viewHeight } = viewportSizeRef.current;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const canvases = [gridCanvasRef.current, contentCanvasRef.current, interactionCanvasRef.current];
    for (const canvas of canvases) {
      if (!canvas) continue;
      const pixelWidth = Math.max(1, Math.round(viewWidth * dpr));
      const pixelHeight = Math.max(1, Math.round(viewHeight * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${viewWidth}px`;
        canvas.style.height = `${viewHeight}px`;
      }
    }
    const gridContext = gridCanvasRef.current?.getContext("2d");
    const content = contentCanvasRef.current?.getContext("2d");
    const interaction = interactionCanvasRef.current?.getContext("2d");
    if (!gridContext || !content || !interaction) return;
    for (const context of [gridContext, content, interaction]) {
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, viewWidth, viewHeight);
      context.imageSmoothingEnabled = false;
    }

    const liveCamera = cameraRef.current;
    const { cellSize, originX, originY, lineWidth } = getViewTransform(liveCamera, dpr);
    // Paint with snapped origin so cells and grid share the same device-pixel lattice.
    const camera: Camera = { ...liveCamera, x: originX, y: originY };
    const startCol = Math.max(0, Math.floor(-camera.x / cellSize));
    const startRow = Math.max(0, Math.floor(-camera.y / cellSize));
    const endCol = Math.min(current.width - 1, Math.ceil((viewWidth - camera.x) / cellSize));
    const endRow = Math.min(current.height - 1, Math.ceil((viewHeight - camera.y) / cellSize));
    const gridVisible = current.display.gridVisibility === "always" || (current.display.gridVisibility === "auto" && camera.zoom >= 0.42);
    const codesVisible = current.display.codeVisibility === "always" || (current.display.codeVisibility === "auto" && camera.zoom >= 1.35);
    const checker = Math.max(3, cellSize / 2);

    gridContext.fillStyle = "#faf9f5";
    gridContext.fillRect(camera.x, camera.y, current.width * cellSize, current.height * cellSize);
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const index = row * current.width + col;
        if (current.cells[index] !== 0) continue;
        const x = camera.x + col * cellSize;
        const y = camera.y + row * cellSize;
        drawBlankCell(gridContext, { row, col }, camera, cellSize);
        if (cellSize > 16) {
          gridContext.fillStyle = "rgba(20,20,19,0.025)";
          gridContext.fillRect(x, y, checker, checker);
          gridContext.fillRect(x + checker, y + checker, checker, checker);
        }
      }
    }

    if (referenceBitmapRef.current && current.reference?.mode !== "hidden") {
      content.save();
      content.globalAlpha = current.reference?.opacity ?? 0.35;
      content.drawImage(referenceBitmapRef.current, camera.x, camera.y, current.width * cellSize, current.height * cellSize);
      content.restore();
    }
    if (current.display.tiledPreview) {
      content.save();
      content.globalAlpha = 0.26;
      for (const rowOffset of [-current.height, 0, current.height]) {
        for (const colOffset of [-current.width, 0, current.width]) {
          if (rowOffset === 0 && colOffset === 0) continue;
          const tileStartRow = Math.max(0, Math.floor(-camera.y / cellSize - rowOffset));
          const tileEndRow = Math.min(current.height - 1, Math.ceil((viewHeight - camera.y) / cellSize - rowOffset));
          const tileStartCol = Math.max(0, Math.floor(-camera.x / cellSize - colOffset));
          const tileEndCol = Math.min(current.width - 1, Math.ceil((viewWidth - camera.x) / cellSize - colOffset));
          for (let row = tileStartRow; row <= tileEndRow; row++) {
            for (let col = tileStartCol; col <= tileEndCol; col++) {
              const paletteIndex = current.cells[row * current.width + col];
              if (!paletteIndex) continue;
              const x = camera.x + (col + colOffset) * cellSize;
              const y = camera.y + (row + rowOffset) * cellSize;
              content.fillStyle = current.palette[paletteIndex]?.color ?? "transparent";
              content.fillRect(x, y, cellSize, cellSize);
            }
          }
        }
      }
      content.restore();
    }
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        const index = row * current.width + col;
        const paletteIndex = current.cells[index];
        if (!paletteIndex) continue;
        const entry = current.palette[paletteIndex];
        if (!entry) continue;
        const x = camera.x + col * cellSize;
        const y = camera.y + row * cellSize;
        drawCell(content, { row, col }, entry.color, camera, cellSize, camera.zoom, false);
        if (codesVisible && cellSize >= 19) {
          const metrics = getColorMetrics(entry.color);
          content.fillStyle = metrics.lightness > 58 ? "rgba(20,20,19,.82)" : "rgba(255,255,255,.92)";
          content.font = `600 ${Math.max(7, Math.min(12, cellSize * 0.35))}px ui-monospace, monospace`;
          content.textAlign = "center";
          content.textBaseline = "middle";
          content.fillText(entry.key, x + cellSize / 2, y + cellSize / 2, cellSize - 2);
        }
      }
    }

    if (gridVisible) {
      const interval = Math.max(1, current.display.majorGridInterval);
      const gridTop = camera.y + startRow * cellSize;
      const gridBottom = camera.y + (endRow + 1) * cellSize;
      const gridLeft = camera.x + startCol * cellSize;
      const gridRight = camera.x + (endCol + 1) * cellSize;
      gridContext.beginPath();
      for (let col = startCol; col <= endCol + 1; col++) {
        const x = hairline(camera.x + col * cellSize, dpr);
        gridContext.moveTo(x, gridTop);
        gridContext.lineTo(x, gridBottom);
      }
      for (let row = startRow; row <= endRow + 1; row++) {
        const y = hairline(camera.y + row * cellSize, dpr);
        gridContext.moveTo(gridLeft, y);
        gridContext.lineTo(gridRight, y);
      }
      gridContext.strokeStyle = "rgba(20,20,19,.18)";
      gridContext.lineWidth = lineWidth;
      gridContext.stroke();
      gridContext.beginPath();
      for (let col = Math.ceil(startCol / interval) * interval; col <= endCol + 1; col += interval) {
        const x = hairline(camera.x + col * cellSize, dpr);
        gridContext.moveTo(x, gridTop);
        gridContext.lineTo(x, gridBottom);
      }
      for (let row = Math.ceil(startRow / interval) * interval; row <= endRow + 1; row += interval) {
        const y = hairline(camera.y + row * cellSize, dpr);
        gridContext.moveTo(gridLeft, y);
        gridContext.lineTo(gridRight, y);
      }
      gridContext.strokeStyle = "rgba(20,20,19,.42)";
      gridContext.stroke();
      if (cellSize >= 8) {
        gridContext.fillStyle = "rgba(20,20,19,.62)";
        gridContext.font = "10px ui-monospace, monospace";
        gridContext.textAlign = "center";
        gridContext.textBaseline = "bottom";
        for (let col = Math.ceil(startCol / interval) * interval; col <= endCol; col += interval) {
          gridContext.fillText(String(col + 1), camera.x + (col + 0.5) * cellSize, camera.y - 5);
        }
        gridContext.textAlign = "right";
        gridContext.textBaseline = "middle";
        for (let row = Math.ceil(startRow / interval) * interval; row <= endRow; row += interval) {
          gridContext.fillText(String(row + 1), camera.x - 5, camera.y + (row + 0.5) * cellSize);
        }
      }
    }
    gridContext.strokeStyle = "rgba(20,20,19,.58)";
    gridContext.lineWidth = lineWidth;
    gridContext.strokeRect(
      hairline(camera.x, dpr),
      hairline(camera.y, dpr),
      current.width * cellSize,
      current.height * cellSize,
    );

    if (current.board.columns > 0 && current.board.rows > 0) {
      gridContext.save();
      gridContext.strokeStyle = "rgba(180,62,43,.65)";
      gridContext.lineWidth = 2 / dpr;
      for (let col = current.board.columns; col < current.width; col += current.board.columns) {
        const x = hairline(camera.x + col * cellSize, dpr);
        gridContext.beginPath(); gridContext.moveTo(x, camera.y); gridContext.lineTo(x, camera.y + current.height * cellSize); gridContext.stroke();
      }
      for (let row = current.board.rows; row < current.height; row += current.board.rows) {
        const y = hairline(camera.y + row * cellSize, dpr);
        gridContext.beginPath(); gridContext.moveTo(camera.x, y); gridContext.lineTo(camera.x + current.width * cellSize, y); gridContext.stroke();
      }
      gridContext.restore();
    }

    const drawCellOutline = (point: CellPoint, fill: string, stroke = EDITOR_ACCENT) => {
      const x = camera.x + point.col * cellSize;
      const y = camera.y + point.row * cellSize;
      interaction.fillStyle = fill;
      interaction.fillRect(x, y, cellSize, cellSize);
      const inset = 1.5 / dpr;
      const halo = 3 / dpr;
      interaction.strokeStyle = "rgba(250,249,245,.96)";
      interaction.lineWidth = halo;
      interaction.strokeRect(x + inset, y + inset, cellSize - inset * 2, cellSize - inset * 2);
      interaction.strokeStyle = stroke;
      interaction.lineWidth = lineWidth;
      interaction.strokeRect(
        hairline(x + inset, dpr),
        hairline(y + inset, dpr),
        cellSize - inset * 2,
        cellSize - inset * 2,
      );
    };
    if (selection) {
      interaction.save();
      interaction.fillStyle = "rgba(180,62,43,.10)";
      interaction.strokeStyle = EDITOR_ACCENT;
      interaction.lineWidth = lineWidth;
      interaction.setLineDash([6, 4]);
      for (let index = 0; index < selection.mask.length; index++) {
        if (!selection.mask[index]) continue;
        const row = Math.floor(index / current.width);
        const col = index % current.width;
        const x = camera.x + col * cellSize;
        const y = camera.y + row * cellSize;
        interaction.fillRect(x, y, cellSize, cellSize);
        const selected = (candidate: number) => candidate >= 0 && candidate < selection.mask.length && selection.mask[candidate] === 1;
        interaction.beginPath();
        if (row === 0 || !selected(index - current.width)) { interaction.moveTo(x, y); interaction.lineTo(x + cellSize, y); }
        if (col + 1 === current.width || !selected(index + 1)) { interaction.moveTo(x + cellSize, y); interaction.lineTo(x + cellSize, y + cellSize); }
        if (row + 1 === current.height || !selected(index + current.width)) { interaction.moveTo(x + cellSize, y + cellSize); interaction.lineTo(x, y + cellSize); }
        if (col === 0 || !selected(index - 1)) { interaction.moveTo(x, y + cellSize); interaction.lineTo(x, y); }
        interaction.stroke();
      }
      interaction.restore();
    }
    const paintedKeys = new Set(previewPointsRef.current.map((point) => `${point.row},${point.col}`));
    renderPaintStrokeOverlay(interaction, paintedKeys, camera, cellSize, selectedColor.color);
    if (hoverRef.current && tool !== "move") drawCellOutline(hoverRef.current, "rgba(180,62,43,.08)");
    drawCellOutline(activeCell, "transparent", "rgba(20,20,19,.9)");
    if (symmetryHorizontal || symmetryVertical) {
      interaction.save();
      interaction.strokeStyle = "rgba(180,62,43,.7)";
      interaction.setLineDash([4, 4]);
      if (symmetryHorizontal) {
        const x = camera.x + (symmetryCol + 0.5) * cellSize;
        interaction.beginPath(); interaction.moveTo(x, camera.y); interaction.lineTo(x, camera.y + current.height * cellSize); interaction.stroke();
      }
      if (symmetryVertical) {
        const y = camera.y + (symmetryRow + 0.5) * cellSize;
        interaction.beginPath(); interaction.moveTo(camera.x, y); interaction.lineTo(camera.x + current.width * cellSize, y); interaction.stroke();
      }
      interaction.restore();
    }
    if (current.reference?.mode === "difference" && current.baseline?.length === current.cells.length) {
      interaction.fillStyle = "rgba(180,62,43,.25)";
      for (let index = 0; index < current.cells.length; index++) {
        if (current.cells[index] === current.baseline[index]) continue;
        const row = Math.floor(index / current.width);
        const col = index % current.width;
        interaction.fillRect(camera.x + col * cellSize, camera.y + row * cellSize, cellSize, cellSize);
      }
    }

    const minimap = minimapRef.current;
    const mini = minimap?.getContext("2d");
    if (minimap && mini) {
      const miniDpr = Math.max(1, window.devicePixelRatio || 1);
      const width = 150;
      const height = 100;
      minimap.width = width * miniDpr;
      minimap.height = height * miniDpr;
      minimap.style.width = `${width}px`;
      minimap.style.height = `${height}px`;
      mini.setTransform(miniDpr, 0, 0, miniDpr, 0, 0);
      mini.clearRect(0, 0, width, height);
      mini.fillStyle = "#faf9f5";
      mini.fillRect(0, 0, width, height);
      const scale = Math.min(width / current.width, height / current.height);
      const offsetX = (width - current.width * scale) / 2;
      const offsetY = (height - current.height * scale) / 2;
      for (let row = 0; row < current.height; row++) for (let col = 0; col < current.width; col++) {
        const paletteIndex = current.cells[row * current.width + col];
        if (!paletteIndex) continue;
        mini.fillStyle = current.palette[paletteIndex]?.color ?? "transparent";
        mini.fillRect(offsetX + col * scale, offsetY + row * scale, Math.max(1, scale), Math.max(1, scale));
      }
      const visibleX = (-camera.x / cellSize) * scale + offsetX;
      const visibleY = (-camera.y / cellSize) * scale + offsetY;
      mini.strokeStyle = EDITOR_ACCENT;
      mini.lineWidth = 1.5;
      mini.strokeRect(visibleX, visibleY, Math.min(current.width * scale, viewWidth / cellSize * scale), Math.min(current.height * scale, viewHeight / cellSize * scale));
    }
  }, [activeCell, selectedColor.color, selection, store, symmetryCol, symmetryHorizontal, symmetryRow, symmetryVertical, tool]);

  const requestDraw = useCallback(() => {
    if (drawFrameRef.current !== null) return;
    drawFrameRef.current = requestAnimationFrame(() => {
      drawFrameRef.current = null;
      drawEditor();
    });
  }, [drawEditor]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(([entry]) => {
      viewportSizeRef.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      drawEditor();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [drawEditor]);

  useEffect(() => drawEditor(), [cameraVersion, document, drawEditor, selection]);

  useEffect(() => {
    const reference = document.reference?.blob;
    referenceBitmapRef.current?.close();
    referenceBitmapRef.current = null;
    if (!reference || typeof createImageBitmap === "undefined") {
      requestDraw();
      return;
    }
    let cancelled = false;
    void createImageBitmap(reference).then((bitmap) => {
      if (cancelled) return bitmap.close();
      referenceBitmapRef.current = bitmap;
      requestDraw();
    });
    return () => { cancelled = true; };
  }, [document.reference?.blob, requestDraw]);

  useEffect(() => {
    setResizeWidth(document.width);
    setResizeHeight(document.height);
    setSymmetryCol((document.width - 1) / 2);
    setSymmetryRow((document.height - 1) / 2);
  }, [document.height, document.width]);

  useEffect(() => {
    if (document.revision === 0) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void Promise.all([saveProject(document), saveRecovery(document)]).then(() => {
        setSaveState("saved");
        return listProjects();
      }).then(setProjects).catch(() => setSaveState("recovered"));
    }, 750);
    return () => window.clearTimeout(timer);
  }, [document]);

  useEffect(() => {
    // Ignore stale worker responses: only the latest request may update warnings.
    const requestId = ++risksRequestRef.current;
    void risksInWorker(document)
      .then((result) => { if (risksRequestRef.current === requestId) setWarnings(result); })
      .catch(() => { if (risksRequestRef.current === requestId) setWarnings([]); });
  }, [document]);

  useEffect(() => {
    // Ignored warning ids stop being meaningful once the underlying cells change.
    setIgnoredWarnings(new Set());
  }, [document.cells, document.id]);

  useEffect(() => {
    if (inspectorTab === "make") void listProjects().then(setProjects).catch(() => setProjects([]));
  }, [inspectorTab, document.revision]);

  useEffect(() => () => {
    if (pointerFrameRef.current !== null) cancelAnimationFrame(pointerFrameRef.current);
    if (drawFrameRef.current !== null) cancelAnimationFrame(drawFrameRef.current);
    referenceBitmapRef.current?.close();
  }, []);

  const fitCanvas = useCallback((mode: "canvas" | "selection" = "canvas") => {
    const { width: viewWidth, height: viewHeight } = viewportSizeRef.current;
    const bounds = mode === "selection" ? selection?.bounds : null;
    const columns = bounds ? bounds.endCol - bounds.startCol + 1 : document.width;
    const rows = bounds ? bounds.endRow - bounds.startRow + 1 : document.height;
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min((viewWidth - 96) / (columns * BASE_CELL_SIZE), (viewHeight - 96) / (rows * BASE_CELL_SIZE))));
    const dpr = Math.max(1, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
    const { cellSize } = getViewTransform({ x: 0, y: 0, zoom, previousZoom: zoom }, dpr);
    const startCol = bounds?.startCol ?? 0;
    const startRow = bounds?.startRow ?? 0;
    cameraRef.current = {
      previousZoom: cameraRef.current.zoom,
      zoom,
      x: (viewWidth - columns * cellSize) / 2 - startCol * cellSize,
      y: (viewHeight - rows * cellSize) / 2 - startRow * cellSize,
    };
    setCameraVersion((value) => value + 1);
  }, [document.height, document.width, selection?.bounds]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => fitCanvas("canvas"));
    return () => cancelAnimationFrame(frame);
  // Initial fit only when the document identity changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id]);

  const zoomAt = useCallback((nextZoom: number, centerX?: number, centerY?: number) => {
    const camera = cameraRef.current;
    const { width, height } = viewportSizeRef.current;
    const x = centerX ?? width / 2;
    const y = centerY ?? height / 2;
    const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom));
    const ratio = clamped / camera.zoom;
    cameraRef.current = { previousZoom: camera.zoom, zoom: clamped, x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio };
    setCameraVersion((value) => value + 1);
  }, []);

  // Native non-passive wheel listener so preventDefault reliably blocks page scroll
  // and plain wheel (not only Ctrl/Meta) zooms toward the cursor.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= rect.height;
      const factor = Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY);
      zoomAt(cameraRef.current.zoom * factor, event.clientX - rect.left, event.clientY - rect.top);
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleWheel);
  }, [zoomAt]);

  const pointFromClient = useCallback((clientX: number, clientY: number): CellPoint | null => {
    const rect = interactionCanvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const { cellSize, originX, originY } = getViewTransform(cameraRef.current, dpr);
    const col = Math.floor((clientX - rect.left - originX) / cellSize);
    const row = Math.floor((clientY - rect.top - originY) / cellSize);
    if (row < 0 || row >= document.height || col < 0 || col >= document.width) return null;
    return { row, col };
  }, [document.height, document.width]);

  const addPatch = useCallback((gesture: Gesture, point: CellPoint, paletteIndex: number) => {
    const normalizedPoint = document.display.tiledPreview
      ? { row: (point.row + document.height) % document.height, col: (point.col + document.width) % document.width }
      : point;
    if (normalizedPoint.row < 0 || normalizedPoint.row >= document.height || normalizedPoint.col < 0 || normalizedPoint.col >= document.width) return;
    const index = normalizedPoint.row * document.width + normalizedPoint.col;
    if (selection && !selection.mask[index]) return;
    // Always record for stroke preview; only enqueue a patch when color actually changes.
    gesture.touched.add(index);
    const before = document.cells[index];
    const existing = gesture.patches.get(index);
    if (existing) existing.after = paletteIndex;
    else if (before !== paletteIndex) gesture.patches.set(index, { index, before, after: paletteIndex });
  }, [document, selection]);

  const brushSegment = useCallback((gesture: Gesture, point: CellPoint) => {
    const paletteIndex = gesture.tool === "eraser" ? 0 : selectedPaletteIndex();
    const origins = getLinePoints(gesture.last, point);
    for (const origin of origins) {
      const footprint = getBrushPoints(origin, brushSize, brushShape);
      for (const painted of withSymmetry(footprint, document.width, document.height, symmetryHorizontal, symmetryVertical, symmetryCol, symmetryRow)) {
        addPatch(gesture, painted, paletteIndex);
      }
    }
    gesture.last = point;
    previewPointsRef.current = Array.from(gesture.touched, (index) => ({
      row: Math.floor(index / document.width),
      col: index % document.width,
    }));
    requestDraw();
  }, [addPatch, brushShape, brushSize, document.height, document.width, requestDraw, selectedPaletteIndex, symmetryCol, symmetryHorizontal, symmetryRow, symmetryVertical]);

  const shapePoints = useCallback((shape: ShapeTool, start: CellPoint, rawEnd: CellPoint, shift: boolean, alt: boolean) => {
    let end = { ...rawEnd };
    if (shift) {
      const rowDelta = rawEnd.row - start.row;
      const colDelta = rawEnd.col - start.col;
      if (shape === "line") {
        if (Math.abs(rowDelta) > Math.abs(colDelta) * 2) end.col = start.col;
        else if (Math.abs(colDelta) > Math.abs(rowDelta) * 2) end.row = start.row;
        else {
          const distance = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
          end = { row: start.row + Math.sign(rowDelta || 1) * distance, col: start.col + Math.sign(colDelta || 1) * distance };
        }
      } else {
        const distance = Math.max(Math.abs(rowDelta), Math.abs(colDelta));
        end = { row: start.row + Math.sign(rowDelta || 1) * distance, col: start.col + Math.sign(colDelta || 1) * distance };
      }
    }
    const actualStart = alt && (shape === "rectangle" || shape === "ellipse")
      ? { row: start.row * 2 - end.row, col: start.col * 2 - end.col }
      : start;
    if (shape === "line") return getLinePoints(actualStart, end);
    if (shape === "rectangle") return getRectanglePoints(actualStart, end, rectangleMode === "filled", strokeWidth);
    if (shape === "ellipse") return getEllipsePoints(actualStart, end, rectangleMode === "filled", strokeWidth);
    const bounds = normalizeBounds(actualStart, end);
    const points: CellPoint[] = [];
    for (let row = bounds.startRow; row <= bounds.endRow; row++) for (let col = bounds.startCol; col <= bounds.endCol; col++) points.push({ row, col });
    return points;
  }, [rectangleMode, strokeWidth]);

  // Combine an incoming mask with the current selection; empty results auto-clear
  // so the brush is never silently blocked by an invisible 0-cell selection.
  const applyCombinedSelection = useCallback((incoming: SelectionMask) => {
    const next = selection ? combineSelections(selection, incoming, selectionMode) : incoming;
    if (selection) lastSelectionRef.current = selection;
    const count = next.mask.reduce((sum, value) => sum + value, 0);
    if (count === 0) {
      setSelection(null);
      setStatusMessage("选区为空，已清除");
    } else {
      setSelection(next);
      setStatusMessage(`已选择 ${count} 格`);
    }
  }, [selection, selectionMode]);

  const applySelectionBounds = useCallback((start: CellPoint, end: CellPoint) => {
    applyCombinedSelection(rectangularSelection(document.width, document.height, normalizeBounds(start, end)));
    setInspectorTab("selection");
  }, [applyCombinedSelection, document.height, document.width]);

  const processPointerMove = useCallback((x: number, y: number, shift: boolean, alt: boolean) => {
    const point = pointFromClient(x, y);
    hoverRef.current = point;
    if (cursorLabelRef.current) cursorLabelRef.current.textContent = point ? `行 ${point.row + 1} · 列 ${point.col + 1}` : "指针位于画布外";
    const gesture = activeGestureRef.current;
    if (!gesture) {
      // Rubber-band feedback while a two-step shape/selection waits for its endpoint.
      const pending = pendingShapeRef.current;
      if (pending && point) {
        previewPointsRef.current = shapePoints(pending.tool, pending.start, point, shift, alt);
      }
      return requestDraw();
    }
    if (gesture.pan) {
      cameraRef.current.x = gesture.pan.cameraX + x - gesture.pan.x;
      cameraRef.current.y = gesture.pan.cameraY + y - gesture.pan.y;
      gesture.moved = true;
      return requestDraw();
    }
    if (!point) return;
    if (gesture.moveSelection) {
      // Drag-move: preview the selection bounds shifted by the clamped delta.
      gesture.last = point;
      gesture.moved ||= point.row !== gesture.start.row || point.col !== gesture.start.col;
      if (selection?.bounds) {
        const clamped = clampSelectionDelta(selection, point.row - gesture.start.row, point.col - gesture.start.col);
        previewPointsRef.current = shiftedOutlinePoints(selection.bounds, clamped.rowDelta, clamped.colDelta);
      }
      return requestDraw();
    }
    gesture.moved ||= point.row !== gesture.start.row || point.col !== gesture.start.col;
    if (gesture.tool === "brush" || gesture.tool === "eraser") brushSegment(gesture, point);
    else if (SHAPE_TOOLS.has(gesture.tool)) {
      previewPointsRef.current = shapePoints(gesture.tool as ShapeTool, gesture.start, point, shift, alt);
      gesture.last = point;
      requestDraw();
    }
  }, [brushSegment, pointFromClient, requestDraw, selection, shapePoints]);

  const handlePointerDown = async (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.focus();
    if (event.pointerType === "touch") {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointersRef.current.size === 2) {
        const [a, b] = Array.from(touchPointersRef.current.values());
        pinchRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: cameraRef.current.zoom, center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
        activeGestureRef.current = null;
        return;
      }
    }
    const point = pointFromClient(event.clientX, event.clientY);
    const shouldPan = event.button === 1 || tool === "move" || spacePressedRef.current;
    if (shouldPan) {
      event.currentTarget.setPointerCapture(event.pointerId);
      activeGestureRef.current = { pointerId: event.pointerId, tool: "move", start: point ?? activeCell, last: point ?? activeCell, moved: false, fromPending: false, patches: new Map(), touched: new Set(), pan: { x: event.clientX, y: event.clientY, cameraX: cameraRef.current.x, cameraY: cameraRef.current.y } };
      return;
    }
    if (!point || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (tool === "eyedropper") {
      const entry = document.palette[document.cells[point.row * document.width + point.col]];
      if (entry && entry.key !== TRANSPARENT_KEY) {
        setSelectedColor(entry);
        setRecentColors((items) => uniquePaletteEntries([entry, ...items]).slice(0, 12));
        setTool("brush");
      }
      return;
    }
    if (tool === "fill") {
      if (fillInFlightRef.current) return;
      fillInFlightRef.current = true;
      setStatusMessage("正在分析填充区域…");
      const startRevision = document.revision;
      try {
        const patches = await fillInWorker(document, point.row, point.col, selectedPaletteIndex(), fillMode, fillScope, selection);
        // The document may have changed (edit/undo) while the worker ran; stale patches would corrupt it.
        if (store.getSnapshot().document.revision !== startRevision) setStatusMessage("填充期间文档已修改，结果已丢弃");
        else executePatches(fillMode === "all" ? "替换全部同色" : "填充连通区域", patches);
      } finally {
        fillInFlightRef.current = false;
      }
      return;
    }
    if (tool === "stamp" && document.stamps[0]) {
      const stamp = document.stamps[0];
      const points: CellPatch[] = [];
      for (let row = 0; row < stamp.height; row++) for (let col = 0; col < stamp.width; col++) {
        const targetRow = point.row + row;
        const targetCol = point.col + col;
        if (targetRow >= document.height || targetCol >= document.width) continue;
        const index = targetRow * document.width + targetCol;
        const after = stamp.cells[row * stamp.width + col];
        if (after !== document.cells[index]) points.push({ index, before: document.cells[index], after });
      }
      executePatches(`图章：${stamp.name}`, points);
      return;
    }
    const pending = pendingShapeRef.current;
    if (tool === "select" && selection && !pending && selection.mask[point.row * document.width + point.col]) {
      // Pointerdown inside the selection starts a content-move drag (Alt = copy on release);
      // outside the selection keeps the current behavior of starting a new selection.
      activeGestureRef.current = { pointerId: event.pointerId, tool: "select", start: point, last: point, moved: false, fromPending: false, patches: new Map(), touched: new Set(), moveSelection: true };
      return;
    }
    const fromPending = Boolean(pending && pending.tool === tool);
    const start = fromPending ? pending!.start : point;
    activeGestureRef.current = { pointerId: event.pointerId, tool, start, last: point, moved: false, fromPending, patches: new Map(), touched: new Set() };
    if (tool === "brush" || tool === "eraser") brushSegment(activeGestureRef.current, point);
    else if (SHAPE_TOOLS.has(tool)) previewPointsRef.current = shapePoints(tool as ShapeTool, start, point, event.shiftKey, event.altKey);
    requestDraw();
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "touch" && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchRef.current && touchPointersRef.current.size >= 2) {
      const [a, b] = Array.from(touchPointersRef.current.values());
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const rect = event.currentTarget.getBoundingClientRect();
      zoomAt(pinchRef.current.zoom * distance / pinchRef.current.distance, pinchRef.current.center.x - rect.left, pinchRef.current.center.y - rect.top);
      return;
    }
    const coalesced = event.nativeEvent.getCoalescedEvents?.();
    const last = coalesced?.[coalesced.length - 1] ?? event.nativeEvent;
    pointerQueueRef.current = { x: last.clientX, y: last.clientY, shift: event.shiftKey, alt: event.altKey };
    if (pointerFrameRef.current !== null) return;
    pointerFrameRef.current = requestAnimationFrame(() => {
      pointerFrameRef.current = null;
      const queued = pointerQueueRef.current;
      if (queued) processPointerMove(queued.x, queued.y, queued.shift, queued.alt);
    });
  };

  const finishPointer = (event: ReactPointerEvent<HTMLCanvasElement>, cancelled = false) => {
    if (event.pointerType === "touch") touchPointersRef.current.delete(event.pointerId);
    if (pinchRef.current) {
      if (touchPointersRef.current.size < 2) pinchRef.current = null;
      return;
    }
    const gesture = activeGestureRef.current;
    activeGestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!gesture || cancelled || gesture.pan) {
      previewPointsRef.current = [];
      if (cancelled) setStatusMessage("已取消未完成的操作");
      return requestDraw();
    }
    if (gesture.tool === "brush" || gesture.tool === "eraser") {
      executePatches(toolLabel(gesture.tool), Array.from(gesture.patches.values()));
    } else if (gesture.moveSelection) {
      if (gesture.moved) {
        // Same command path as nudge: clamps at edges, coalesces, snapshots the selection.
        nudgeSelection(gesture.last.row - gesture.start.row, gesture.last.col - gesture.start.col, event.altKey);
      } else {
        // Plain click inside the selection: fall back to starting a two-step selection here.
        pendingShapeRef.current = { tool: "select", start: gesture.start };
        setStatusMessage("选择起点已设置；点击终点或按 Enter 确认");
      }
    } else if (SHAPE_TOOLS.has(gesture.tool)) {
      if (!gesture.moved && !gesture.fromPending) {
        pendingShapeRef.current = { tool: gesture.tool as ShapeTool, start: gesture.start };
        setStatusMessage(`${toolLabel(gesture.tool)}起点已设置；点击终点或按 Enter 确认`);
      } else if (gesture.tool === "select") {
        applySelectionBounds(gesture.start, gesture.last);
        pendingShapeRef.current = null;
      } else {
        const points = shapePoints(gesture.tool as ShapeTool, gesture.start, gesture.last, event.shiftKey, event.altKey);
        executePatches(toolLabel(gesture.tool), patchesForPoints(document, withSymmetry(points, document.width, document.height, symmetryHorizontal, symmetryVertical, symmetryCol, symmetryRow), selectedPaletteIndex(), selection));
        pendingShapeRef.current = null;
      }
    }
    previewPointsRef.current = [];
    requestDraw();
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => finishPointer(event, true);

  const copySelection = useCallback(() => {
    if (!selection?.bounds) return;
    const bounds = selection.bounds;
    const width = bounds.endCol - bounds.startCol + 1;
    const height = bounds.endRow - bounds.startRow + 1;
    const cells = new Uint16Array(width * height);
    const mask = new Uint8Array(width * height);
    for (let row = 0; row < height; row++) for (let col = 0; col < width; col++) {
      const source = (bounds.startRow + row) * document.width + bounds.startCol + col;
      if (!selection.mask[source]) continue;
      cells[row * width + col] = document.cells[source];
      mask[row * width + col] = 1;
    }
    clipboardRef.current = { width, height, cells, mask };
    setStatusMessage(`已复制 ${selectionCount} 格`);
  }, [document, selection, selectionCount]);

  const pasteSelection = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard) return;
    const patches: CellPatch[] = [];
    for (let row = 0; row < clipboard.height; row++) for (let col = 0; col < clipboard.width; col++) {
      const sourceIndex = row * clipboard.width + col;
      if (!clipboard.mask[sourceIndex]) continue;
      const targetRow = activeCell.row + row;
      const targetCol = activeCell.col + col;
      if (targetRow >= document.height || targetCol >= document.width) continue;
      const index = targetRow * document.width + targetCol;
      const after = clipboard.cells[sourceIndex];
      if (after !== document.cells[index]) patches.push({ index, before: document.cells[index], after });
    }
    executePatches("粘贴选区", patches, rectangularSelection(document.width, document.height, {
      startRow: activeCell.row,
      startCol: activeCell.col,
      endRow: Math.min(document.height - 1, activeCell.row + clipboard.height - 1),
      endCol: Math.min(document.width - 1, activeCell.col + clipboard.width - 1),
    }));
  }, [activeCell, document, executePatches]);

  const clearSelected = useCallback(() => {
    if (!selection) return;
    const patches: CellPatch[] = [];
    for (let index = 0; index < selection.mask.length; index++) if (selection.mask[index] && document.cells[index]) patches.push({ index, before: document.cells[index], after: 0 });
    executePatches("删除选区", patches, selection);
  }, [document, executePatches, selection]);

  const cutSelection = useCallback(() => {
    copySelection();
    clearSelected();
  }, [clearSelected, copySelection]);

  const nudgeSelection = useCallback((rowDelta: number, colDelta: number, copy = false) => {
    if (!selection) return;
    // Clamp at document edges so pushing a selection against the border never crops cells.
    const clamped = clampSelectionDelta(selection, rowDelta, colDelta);
    if (!clamped.rowDelta && !clamped.colDelta) return;
    executePatches(
      copy ? "复制并移动选区" : "移动选区",
      moveSelectionPatches(document, selection, clamped.rowDelta, clamped.colDelta, copy),
      translateSelection(selection, clamped.rowDelta, clamped.colDelta),
      "selection-nudge",
    );
  }, [document, executePatches, selection]);

  const transformSelection = useCallback((transform: "flip-horizontal" | "flip-vertical" | "rotate-90" | "rotate-180") => {
    if (!selection) return;
    const result = transformSelectionDocument(document, selection, transform);
    executePatches(transform === "flip-horizontal" ? "水平翻转" : transform === "flip-vertical" ? "垂直翻转" : transform === "rotate-90" ? "旋转 90°" : "旋转 180°", result.patches, result.selection);
  }, [document, executePatches, selection]);

  const createStamp = useCallback(() => {
    if (!selection?.bounds) return;
    copySelection();
    const clipboard = clipboardRef.current;
    if (!clipboard) return;
    const next = cloneEditorDocument(document);
    next.stamps = [{ id: `stamp-${Date.now()}`, name: `图章 ${next.stamps.length + 1}`, width: clipboard.width, height: clipboard.height, cells: clipboard.cells.slice() }, ...next.stamps].slice(0, 20);
    executeStructural("创建图章", next);
    setTool("stamp");
  }, [copySelection, document, executeStructural, selection?.bounds]);

  const handleEditorKeyDown = useCallback((event: KeyboardEvent) => {
    if (isTextInput(event.target)) return;
    // Only while focus is inside the editor shell — dialogs and page chrome keep their keys.
    if (event.target instanceof Node && shellRef.current && !shellRef.current.contains(event.target)) return;
    // Leave Enter/Space to focused buttons and links so panel controls keep native activation.
    if ((event.key === "Enter" || event.code === "Space") && event.target instanceof HTMLElement && event.target.closest("button, a")) return;
    const lower = event.key.toLowerCase();
    const command = event.ctrlKey || event.metaKey;
    if (command && lower === "z") { event.preventDefault(); if (event.shiftKey) store.redo(); else store.undo(); return; }
    if (command && lower === "y") { event.preventDefault(); store.redo(); return; }
    if (command && lower === "a") { event.preventDefault(); setSelection(rectangularSelection(document.width, document.height, { startRow: 0, startCol: 0, endRow: document.height - 1, endCol: document.width - 1 })); return; }
    if (command && lower === "c") { event.preventDefault(); copySelection(); return; }
    if (command && lower === "x") { event.preventDefault(); cutSelection(); return; }
    if (command && lower === "v") { event.preventDefault(); pasteSelection(); return; }
    if (command && lower === "d") { event.preventDefault(); deselect(); return; }
    if (command && event.shiftKey && lower === "i") { event.preventDefault(); invertCurrentSelection(); return; }
    if (event.code === "Space") {
      // Space is hold-to-pan only; Enter remains the paint/confirm key.
      event.preventDefault();
      spacePressedRef.current = true;
      return;
    }
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      const rowDelta = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      const colDelta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      if (selection && !event.shiftKey) nudgeSelection(rowDelta, colDelta, event.altKey);
      else {
        const next = { row: Math.max(0, Math.min(document.height - 1, activeCell.row + rowDelta)), col: Math.max(0, Math.min(document.width - 1, activeCell.col + colDelta)) };
        setActiveCell(next);
        if (event.shiftKey) applyCombinedSelection(rectangularSelection(document.width, document.height, normalizeBounds(selectionAnchorRef.current, next)));
        else selectionAnchorRef.current = next;
      }
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") { event.preventDefault(); clearSelected(); return; }
    if (event.key === "Escape") {
      pendingShapeRef.current = null;
      previewPointsRef.current = [];
      // Abort an in-flight gesture: the pending pointerup finds no gesture and commits nothing.
      activeGestureRef.current = null;
      deselect();
      setStatusMessage("已取消当前操作");
      requestDraw();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const pending = pendingShapeRef.current;
      if (pending) {
        if (pending.tool === "select") applySelectionBounds(pending.start, activeCell);
        else executePatches(toolLabel(pending.tool), patchesForPoints(document, shapePoints(pending.tool, pending.start, activeCell, event.shiftKey, event.altKey), selectedPaletteIndex(), selection));
        pendingShapeRef.current = null;
      } else {
        executePatches(tool === "eraser" ? "橡皮" : "键盘绘制", patchesForPoints(document, getBrushPoints(activeCell, brushSize, brushShape), tool === "eraser" ? 0 : selectedPaletteIndex(), selection));
      }
      return;
    }
    if (shortcutsEnabled && !command && !event.altKey) {
      const shortcuts: Record<string, EditorTool> = { v: "move", b: "brush", e: "eraser", i: "eyedropper", g: "fill", l: "line", r: "rectangle", o: "ellipse", s: "select", t: "stamp" };
      if (shortcuts[lower]) { event.preventDefault(); setTool(shortcuts[lower]); }
    }
  }, [activeCell, applyCombinedSelection, applySelectionBounds, brushShape, brushSize, clearSelected, copySelection, cutSelection, deselect, document, executePatches, invertCurrentSelection, nudgeSelection, pasteSelection, requestDraw, selectedPaletteIndex, selection, shapePoints, shortcutsEnabled, store, tool]);

  // Shortcuts live on window so they keep working after panel buttons take focus.
  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => { if (event.code === "Space") spacePressedRef.current = false; };
    window.addEventListener("keydown", handleEditorKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleEditorKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleEditorKeyDown]);

  const updateDocumentSettings = <Key extends keyof EditorDocumentV1>(key: Key, value: EditorDocumentV1[Key], label: string) => {
    const next = cloneEditorDocument(document);
    next[key] = value;
    executeStructural(label, next);
  };

  const saveNow = async () => {
    setSaveState("saving");
    await saveProject(document);
    setSaveState("saved");
    setProjects(await listProjects());
    setStatusMessage("项目已保存到此浏览器");
  };

  const enterFocus = async () => {
    await saveNow();
    if (onEnterFocus) onEnterFocus(document.id, document.revision);
    else window.location.href = `/focus/?project=${encodeURIComponent(document.id)}&revision=${document.revision}`;
  };

  const visiblePalette = useMemo(() => {
    const source = paletteSource === "current" ? currentColors : paletteColors;
    const query = paletteSearch.trim().toLowerCase();
    const entries = uniquePaletteEntries(source.map((item) => ({ ...item, isExternal: false }))).filter((entry) => {
      const code = getColorKeyByHex(entry.color, document.colorSystem);
      return !query || code.toLowerCase().includes(query) || entry.color.toLowerCase().includes(query);
    });
    const direction = sortAscending ? 1 : -1;
    return entries.sort((left, right) => {
      if (paletteSort === "code") return direction * sortCode(left, right, document.colorSystem);
      if (paletteSort === "usage") return direction * ((usageMap.get(left.color.toUpperCase()) ?? 0) - (usageMap.get(right.color.toUpperCase()) ?? 0));
      if (paletteSort === "similarity") return direction * (oklabDistance(left.color, selectedColor.color) - oklabDistance(right.color, selectedColor.color));
      const a = getColorMetrics(left.color);
      const b = getColorMetrics(right.color);
      return direction * ((paletteSort === "hue" ? a.hue - b.hue : paletteSort === "saturation" ? a.saturation - b.saturation : a.lightness - b.lightness));
    });
  }, [currentColors, document.colorSystem, paletteColors, paletteSearch, paletteSort, paletteSource, selectedColor.color, sortAscending, usageMap]);

  const topExport = async (kind: "product" | "csv" | "pdf" | "project" | "clipboard") => {
    try {
      if (kind === "product") downloadNamedBlob(await renderProductPng(document), `${document.name}.png`);
      if (kind === "csv") downloadNamedBlob(createPatternCsv(document), `${document.name}.csv`);
      if (kind === "pdf") {
        const pages = boardSummary.boardColumns * boardSummary.boardRows;
        if (pages > 64 && !window.confirm(`将生成 ${pages} 个板面页面，是否继续？`)) return;
        downloadNamedBlob(await exportPatternPdf(document), `${document.name}.pdf`);
      }
      if (kind === "project") downloadNamedBlob(await exportPerlerProject(document), `${document.name}.perler`);
      if (kind === "clipboard") await copyProductToClipboard(document);
      setStatusMessage("导出完成");
    } catch (error) {
      if (kind === "clipboard") {
        downloadNamedBlob(await renderProductPng(document), `${document.name}.png`);
        setStatusMessage("剪贴板不可用，已改为下载 PNG");
      } else setStatusMessage(error instanceof Error ? error.message : "导出失败");
    }
  };

  const importProjectFile = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await importPerlerProject(file);
      executeStructural(`导入项目：${imported.name}`, imported);
      clearSelectionState();
      fitCanvas("canvas");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "项目导入失败");
    }
  };

  const duplicateStoredProject = async (projectId: string) => {
    const source = await loadProject(projectId);
    if (!source) return;
    const copy = cloneEditorDocument(source);
    copy.id = crypto.randomUUID();
    copy.name = `${source.name} 副本`;
    copy.revision = 0;
    copy.createdAt = copy.updatedAt = Date.now();
    await saveProject(copy);
    setProjects(await listProjects());
  };

  const renameStoredProject = async (projectId: string) => {
    const source = await loadProject(projectId);
    if (!source) return;
    const name = window.prompt("输入新的项目名称", source.name)?.trim();
    if (!name || name === source.name) return;
    source.name = name;
    await saveProject(source);
    setProjects(await listProjects());
  };

  const exportStoredProject = async (projectId: string) => {
    const source = await loadProject(projectId);
    if (!source) return;
    downloadNamedBlob(await exportPerlerProject(source), `${source.name}.perler`);
  };

  const paletteButton = (entry: EditorPaletteEntry, prefix = "") => {
    const code = getColorKeyByHex(entry.color, document.colorSystem);
    const active = entry.color.toUpperCase() === selectedColor.color.toUpperCase();
    return (
      <button key={`${prefix}${entry.key}-${entry.color}`} type="button" className={active ? "is-active" : ""} onClick={() => {
        setSelectedColor(entry);
        setRecentColors((items) => uniquePaletteEntries([entry, ...items]).slice(0, 12));
        // Picking a color implies painting next — except with the select tool, which keeps its context.
        if (tool !== "select") setTool("brush");
      }} onDoubleClick={() => setFavorites((items) => {
        const next = new Set(items);
        const id = entry.color.toUpperCase();
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      })} title={`${code} ${entry.color} · 双击收藏`}>
        <span style={{ backgroundColor: entry.color }} />
        <small>{favorites.has(entry.color.toUpperCase()) ? "★ " : ""}{code}</small>
      </button>
    );
  };

  const activeWarnings = warnings.filter((warning) => !ignoredWarnings.has(warning.id));
  const currentEntryIndex = document.cells[activeCell.row * document.width + activeCell.col];
  const replaceCount = replaceSourceIndex
    ? document.cells.reduce((count, paletteIndex, index) => count + Number(paletteIndex === replaceSourceIndex && (!selection || selection.mask[index])), 0)
    : 0;

  return (
    <section ref={shellRef} className="pixel-editor-shell" aria-label="拼豆编辑工作台" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) {
        spacePressedRef.current = false;
        if (activeGestureRef.current) {
          activeGestureRef.current = null;
          previewPointsRef.current = [];
          setStatusMessage("窗口失焦，已取消未完成的操作");
          requestDraw();
        }
      }
    }}>
      <header className="pixel-editor-topbar">
        <div className="pixel-editor-brand"><span className="pixel-editor-mark" aria-hidden="true" /><div><strong>{document.name}</strong><span>{document.width} × {document.height} 格 · {saveState === "saving" ? "保存中" : saveState === "saved" ? "已保存" : "待恢复"}</span></div></div>
        <div className="pixel-editor-history" aria-label="编辑历史">
          <button type="button" onClick={() => store.undo()} disabled={!snapshot.canUndo} title="撤销 Ctrl+Z" aria-label="上一步"><Undo2 className="h-4 w-4" /><span>上一步</span></button>
          <button type="button" onClick={() => store.redo()} disabled={!snapshot.canRedo} title="重做 Ctrl+Y" aria-label="下一步"><Redo2 className="h-4 w-4" /><span>下一步</span></button>
        </div>
        <div className="pixel-editor-top-actions">
          {onOpenGenerationParams ? (
            <button type="button" onClick={onOpenGenerationParams} title="调整生成参数">生成参数</button>
          ) : null}
          {onOpenCustomPalette ? (
            <button type="button" onClick={onOpenCustomPalette} title="管理色板">色板</button>
          ) : null}
          <button type="button" onClick={() => void saveNow()}><Save className="h-4 w-4" />保存项目</button>
          <button type="button" onClick={() => setInspectorTab("make")}><Download className="h-4 w-4" />导出</button>
          <button type="button" onClick={() => void enterFocus()}><Focus className="h-4 w-4" />专注制作</button>
          <Button size="sm" variant="outline" onClick={onExit}>完成</Button>
        </div>
      </header>

      <div className="pixel-editor-layout">
        <aside className="pixel-editor-tools" role="toolbar" aria-label="画布工具" aria-orientation="vertical" onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          // Toolbar owns arrow-key roving; keep it from reaching the window-level editor shortcuts.
          event.stopPropagation();
          event.preventDefault();
          const next = (toolbarIndex + (event.key === "ArrowDown" ? 1 : -1) + toolDefinitions.length) % toolDefinitions.length;
          setToolbarIndex(next);
          globalThis.document.getElementById(`editor-tool-${toolDefinitions[next].id}`)?.focus();
        }}>
          {toolDefinitions.map((definition, index) => {
            const Icon = definition.icon;
            return <button id={`editor-tool-${definition.id}`} key={definition.id} type="button" tabIndex={toolbarIndex === index ? 0 : -1} className={tool === definition.id ? "is-active" : ""} aria-pressed={tool === definition.id} onFocus={() => setToolbarIndex(index)} onClick={() => setTool(definition.id)} title={`${definition.label} (${definition.shortcut})`}><Icon className="h-5 w-5" /><span>{definition.label}</span><kbd>{definition.shortcut}</kbd></button>;
          })}
        </aside>

        <div className="pixel-editor-canvas-column">
          <div className="pixel-editor-contextbar" aria-label={`${toolLabel(tool)}选项`}>
            {(tool === "brush" || tool === "eraser") && <><span>笔头</span>{[1, 2, 3, 5].map((size) => <button key={size} type="button" className={brushSize === size ? "is-active" : ""} onClick={() => setBrushSize(size)}>{size}</button>)}<button type="button" className={brushShape === "square" ? "is-active" : ""} onClick={() => setBrushShape("square")}>方</button><button type="button" className={brushShape === "circle" ? "is-active" : ""} onClick={() => setBrushShape("circle")}>圆</button></>}
            {(tool === "rectangle" || tool === "ellipse") && <><button type="button" className={rectangleMode === "outline" ? "is-active" : ""} onClick={() => setRectangleMode("outline")}>描边</button><button type="button" className={rectangleMode === "filled" ? "is-active" : ""} onClick={() => setRectangleMode("filled")}>填充</button><span>线宽</span><input aria-label="形状线宽" type="number" min="1" max="8" value={strokeWidth} onChange={(event) => setStrokeWidth(Math.max(1, Math.min(8, Number(event.target.value))))} /></>}
            {tool === "fill" && <><button type="button" className={fillMode === "connected" ? "is-active" : ""} onClick={() => setFillMode("connected")}>连通区域</button><button type="button" className={fillMode === "all" ? "is-active" : ""} onClick={() => setFillMode("all")}>全部同色</button><button type="button" className={fillScope === "canvas" ? "is-active" : ""} onClick={() => setFillScope("canvas")}>全画布</button><button type="button" className={fillScope === "selection" ? "is-active" : ""} onClick={() => setFillScope("selection")}>选区</button></>}
            {tool === "select" && (["replace", "add", "subtract", "intersect"] as const).map((mode) => <button key={mode} type="button" className={selectionMode === mode ? "is-active" : ""} onClick={() => setSelectionMode(mode)}>{{ replace: "替换", add: "添加", subtract: "减去", intersect: "交集" }[mode]}</button>)}
            <span className="contextbar-spacer" />
            <button type="button" className={symmetryHorizontal ? "is-active" : ""} onClick={() => setSymmetryHorizontal((value) => !value)}>水平对称</button>
            <button type="button" className={symmetryVertical ? "is-active" : ""} onClick={() => setSymmetryVertical((value) => !value)}>垂直对称</button>
          </div>
          <div ref={viewportRef} className="pixel-editor-viewport" style={{ touchAction: "none" }}>
            <canvas ref={gridCanvasRef} className="pixel-editor-layer pixel-editor-grid-layer" aria-hidden="true" />
            <canvas ref={contentCanvasRef} className="pixel-editor-layer pixel-editor-content-layer" aria-hidden="true" />
            <canvas
              ref={interactionCanvasRef}
              className="pixel-editor-layer pixel-editor-interaction-layer"
              tabIndex={0}
              role="grid"
              aria-label="可编辑拼豆网格"
              aria-rowcount={document.height}
              aria-colcount={document.width}
              aria-activedescendant="editor-active-cell"
              aria-describedby="pixel-editor-canvas-help"
              onPointerDown={(event) => void handlePointerDown(event)}
              onPointerMove={handlePointerMove}
              onPointerUp={(event) => finishPointer(event)}
              onPointerCancel={handlePointerCancel}
              onPointerLeave={() => { hoverRef.current = null; requestDraw(); }}
              style={{ cursor: tool === "move" ? "grab" : tool === "eyedropper" ? "copy" : "crosshair" }}
            />
            <span id="editor-active-cell" role="gridcell" aria-rowindex={activeCell.row + 1} aria-colindex={activeCell.col + 1} className="sr-only">行 {activeCell.row + 1}，列 {activeCell.col + 1}，{currentEntryIndex ? document.palette[currentEntryIndex]?.key : "空白"}</span>
            {usage.length === 0 && <div className="pixel-editor-empty-hint" aria-hidden="true"><strong>空白画布</strong><span>选择画笔、填充或图章开始创作</span></div>}
            <canvas ref={minimapRef} className="pixel-editor-minimap" aria-label="画布导航图" onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              const ratioX = (event.clientX - rect.left) / rect.width;
              const ratioY = (event.clientY - rect.top) / rect.height;
              const dpr = Math.max(1, window.devicePixelRatio || 1);
              const { cellSize } = getViewTransform(cameraRef.current, dpr);
              cameraRef.current.x = viewportSizeRef.current.width / 2 - ratioX * document.width * cellSize;
              cameraRef.current.y = viewportSizeRef.current.height / 2 - ratioY * document.height * cellSize;
              setCameraVersion((value) => value + 1);
            }} />
          </div>
          <div className="pixel-editor-statusbar"><span>{toolLabel(tool)}</span><span ref={cursorLabelRef}>行 {activeCell.row + 1} · 列 {activeCell.col + 1}</span><span>选区 {selectionCount || "—"}</span><span role="status" aria-live="polite">{statusMessage}</span><div className="pixel-editor-zoom"><button type="button" onClick={() => zoomAt(cameraRef.current.zoom / 1.2)} aria-label="缩小"><ZoomOut className="h-4 w-4" /></button><button type="button" onClick={() => zoomAt(cameraRef.current.previousZoom)}>{Math.round(cameraRef.current.zoom * 100)}%</button><button type="button" onClick={() => zoomAt(cameraRef.current.zoom * 1.2)} aria-label="放大"><ZoomIn className="h-4 w-4" /></button></div></div>
          <span id="pixel-editor-canvas-help" className="sr-only">滚轮缩放画布；方向键移动活动格或选区；Enter 绘制或确认；按住空格拖动画布；Shift 加方向键扩展选择；Control A、X、C、V 管理选区；Control D 取消选择；Control Shift I 反选；选择工具在选区内拖动可移动内容；Escape 取消。</span>
        </div>

        <aside className="pixel-editor-inspector">
          <nav className="pixel-editor-tabs" role="tablist" aria-label="属性面板">{([['color','颜色'],['selection','选择'],['canvas','画布'],['make','制作'],['preview','预览'],['history','历史']] as const).map(([id,label]) => <button key={id} role="tab" type="button" aria-selected={inspectorTab === id} className={inspectorTab === id ? "is-active" : ""} onClick={() => setInspectorTab(id)}>{label}</button>)}</nav>
          <div className="pixel-editor-inspector-body">
            {inspectorTab === "color" && <div className="editor-inspector-section">
              <div className="editor-current-color"><span style={{ backgroundColor: selectedColor.color }} /><div><strong>{getColorKeyByHex(selectedColor.color, document.colorSystem)}</strong><small>{selectedColor.color.toUpperCase()} · 前景色</small></div><button type="button" title="交换前景色与背景色" onClick={() => { const foreground = selectedColor; setSelectedColor(backgroundColor); setBackgroundColor(foreground); }}>⇄</button><span style={{ backgroundColor: backgroundColor.color }} title="背景色" /></div>
              {recentColors.length > 0 && <><small>最近使用</small><div className="editor-palette-grid compact">{recentColors.map((entry) => paletteButton(entry, "recent-"))}</div></>}
              <div className="editor-segmented"><button type="button" className={paletteSource === "current" ? "is-active" : ""} onClick={() => setPaletteSource("current")}>图案用色</button><button type="button" className={paletteSource === "all" ? "is-active" : ""} onClick={() => setPaletteSource("all")}>完整色板</button></div>
              <input value={paletteSearch} onChange={(event) => setPaletteSearch(event.target.value)} className="editor-input" placeholder="搜索色号或 HEX" aria-label="搜索颜色" />
              <div className="editor-field-row"><select className="editor-input" value={paletteSort} onChange={(event) => setPaletteSort(event.target.value as PaletteSortMode)} aria-label="颜色排序"><option value="usage">使用量</option><option value="hue">色相</option><option value="saturation">饱和度</option><option value="lightness">明度</option><option value="code">色号</option><option value="similarity">与前景色相似度</option></select><button type="button" className="editor-sort-direction" onClick={() => setSortAscending((value) => !value)}>{sortAscending ? "升序 ↑" : "降序 ↓"}</button></div>
              <div className="editor-palette-grid">{visiblePalette.map((entry) => paletteButton(entry))}</div>
              <div><strong>批量替色</strong><p>目标颜色为当前前景色；提交前显示影响范围和库存变化。</p></div>
              <select className="editor-input" aria-label="要替换的颜色" value={replaceSourceIndex} onChange={(event) => setReplaceSourceIndex(Number(event.target.value))}><option value="0">选择源颜色</option>{usage.map((item) => <option key={item.index} value={item.index}>{item.palette.key} · {item.count} 颗</option>)}</select>
              <p>{replaceSourceIndex ? `将把${selection ? "选区内" : "全画布"} ${replaceCount} 格替换为 ${getColorKeyByHex(selectedColor.color, document.colorSystem)}；预计需要增加 ${replaceCount} 颗目标色。` : "选择图案中的一种颜色查看影响。"}</p>
              <Button disabled={!replaceSourceIndex || replaceCount === 0} onClick={() => {
                const target = selectedPaletteIndex();
                const patches: CellPatch[] = [];
                for (let index = 0; index < document.cells.length; index++) {
                  if (document.cells[index] !== replaceSourceIndex || (selection && !selection.mask[index])) continue;
                  patches.push({ index, before: replaceSourceIndex, after: target });
                }
                executePatches("批量替色", patches);
              }}>替换 {replaceCount} 格</Button>
            </div>}

            {inspectorTab === "selection" && <div className="editor-inspector-section">
              <div><strong>当前选区</strong><p>{selection?.bounds ? `${selectionCount} 格 · ${selection.bounds.endCol - selection.bounds.startCol + 1} × ${selection.bounds.endRow - selection.bounds.startRow + 1}` : "拖拽或点击起点和终点建立选择。"}</p></div>
              <div className="editor-action-grid"><button type="button" disabled={!selection} onClick={cutSelection}><Scissors className="h-4 w-4" />剪切</button><button type="button" disabled={!selection} onClick={copySelection}><Copy className="h-4 w-4" />原位复制</button><button type="button" disabled={!clipboardRef.current} onClick={pasteSelection}><ClipboardPaste className="h-4 w-4" />粘贴</button><button type="button" disabled={!selection} onClick={clearSelected}><Trash2 className="h-4 w-4" />删除</button><button type="button" disabled={!selection} onClick={() => transformSelection("flip-horizontal")}><FlipHorizontal className="h-4 w-4" />水平翻转</button><button type="button" disabled={!selection} onClick={() => transformSelection("flip-vertical")}><FlipVertical className="h-4 w-4" />垂直翻转</button><button type="button" disabled={!selection} onClick={() => transformSelection("rotate-90")}><RotateCw className="h-4 w-4" />旋转 90°</button><button type="button" disabled={!selection} onClick={createStamp}><Stamp className="h-4 w-4" />创建图章</button></div>
              <div className="editor-nudge-grid"><span /><button type="button" onClick={() => nudgeSelection(-1,0)}><ArrowUp className="h-4 w-4" /></button><span /><button type="button" onClick={() => nudgeSelection(0,-1)}><ArrowLeft className="h-4 w-4" /></button><button type="button" onClick={() => nudgeSelection(1,0)}><ArrowDown className="h-4 w-4" /></button><button type="button" onClick={() => nudgeSelection(0,1)}><ArrowRight className="h-4 w-4" /></button></div>
              <div className="editor-action-grid"><button type="button" onClick={invertCurrentSelection}>反选</button><button type="button" onClick={() => setSelection(selectNonTransparent(document.width, document.height, document.cells))}>非透明内容</button><button type="button" onClick={() => setSelection(selectSameColor(document.width, document.height, document.cells, currentEntryIndex))}>相同颜色</button><button type="button" disabled={!lastSelectionRef.current} onClick={() => {
                const last = lastSelectionRef.current;
                // A mask captured before a document replace has stale dimensions; ignore it.
                if (!last || last.width !== document.width || last.height !== document.height) return;
                setSelection(last);
              }}>重选</button></div>
              <Button variant="outline" disabled={!selection} onClick={() => { if (!selection?.bounds) return; executeStructural("裁剪到选区", cropEditorDocument(document, selection.bounds)); clearSelectionState(); }}><Crop className="h-4 w-4" />裁剪到选区</Button>
            </div>}

            {inspectorTab === "canvas" && <div className="editor-inspector-section">
              <div><strong>视图</strong><p>网格和色号会按缩放自动降低噪声，也可强制显示或隐藏。</p></div>
              <div className="editor-field-row"><div className="editor-field"><Label>网格</Label><select className="editor-input" value={document.display.gridVisibility} onChange={(event) => updateDocumentSettings("display", { ...document.display, gridVisibility: event.target.value as EditorDocumentV1["display"]["gridVisibility"] }, "调整网格显示")}><option value="auto">自动</option><option value="always">始终</option><option value="hidden">隐藏</option></select></div><div className="editor-field"><Label>色号</Label><select className="editor-input" value={document.display.codeVisibility} onChange={(event) => updateDocumentSettings("display", { ...document.display, codeVisibility: event.target.value as EditorDocumentV1["display"]["codeVisibility"] }, "调整色号显示")}><option value="auto">自动</option><option value="always">始终</option><option value="hidden">隐藏</option></select></div></div>
              <div className="editor-field"><FieldHelp label="主网格间隔" htmlFor="major-grid">每隔 N 格显示一条加粗主线，把画布划分成小区块，编辑和数格定位时更不容易看花。与下载图纸的「网格线间隔」作用类似。</FieldHelp><input id="major-grid" className="editor-input" type="number" min="1" max="50" value={document.display.majorGridInterval} onChange={(event) => updateDocumentSettings("display", { ...document.display, majorGridInterval: Math.max(1, Number(event.target.value)) }, "调整主网格")}/></div>
              <div className="editor-action-grid"><button type="button" onClick={() => fitCanvas("canvas")}>适应画布</button><button type="button" disabled={!selection} onClick={() => fitCanvas("selection")}>适应选区</button><button type="button" onClick={() => zoomAt(1)}>100%</button><button type="button" onClick={() => zoomAt(cameraRef.current.previousZoom)}>上次缩放</button></div>
              <div><strong>画布尺寸</strong><p>九点锚定决定现有内容固定在哪一侧；新增区域保持透明。</p></div>
              <div className="editor-field-row"><div className="editor-field"><Label htmlFor="canvas-width">宽</Label><input id="canvas-width" className="editor-input" type="number" min="1" max="500" value={resizeWidth} onChange={(event) => setResizeWidth(Number(event.target.value))}/></div><div className="editor-field"><Label htmlFor="canvas-height">高</Label><input id="canvas-height" className="editor-input" type="number" min="1" max="500" value={resizeHeight} onChange={(event) => setResizeHeight(Number(event.target.value))}/></div></div>
              <div className="editor-anchor-grid">{(["top-left","top","top-right","left","center","right","bottom-left","bottom","bottom-right"] as CanvasAnchor[]).map((anchor) => <button type="button" key={anchor} aria-label={`锚点 ${anchor}`} className={resizeAnchor === anchor ? "is-active" : ""} onClick={() => setResizeAnchor(anchor)} />)}</div>
              <Button onClick={() => { executeStructural("调整画布尺寸", resizeEditorDocument(document, resizeWidth, resizeHeight, resizeAnchor)); clearSelectionState(); }}>应用尺寸</Button>
              <Button variant="outline" onClick={() => { executeStructural("裁剪透明边缘", trimTransparent(document)); clearSelectionState(); }}>裁剪透明边缘</Button>
              <div><strong>对称轴</strong><p>水平轴列 {symmetryCol + 1} · 垂直轴行 {symmetryRow + 1}</p></div>
              <div className="editor-field-row"><input className="editor-input" type="number" min="0" max={document.width - 1} step="0.5" value={symmetryCol} onChange={(event) => setSymmetryCol(Number(event.target.value))}/><input className="editor-input" type="number" min="0" max={document.height - 1} step="0.5" value={symmetryRow} onChange={(event) => setSymmetryRow(Number(event.target.value))}/></div>
              <label className="editor-check"><input type="checkbox" checked={document.display.tiledPreview} onChange={(event) => updateDocumentSettings("display", { ...document.display, tiledPreview: event.target.checked }, event.target.checked ? "开启平铺预览" : "关闭平铺预览")} />平铺预览与环绕绘制</label>
              <label className="editor-check"><input type="checkbox" checked={shortcutsEnabled} onChange={(event) => setShortcutsEnabled(event.target.checked)} />启用单键工具快捷键</label>
            </div>}

            {inspectorTab === "make" && <div className="editor-inspector-section">
              <div><strong>拼豆板与尺寸</strong><p>{boardSummary.boardColumns} × {boardSummary.boardRows} 块板 · 约 {(boardSummary.physicalWidthMm / 10).toFixed(1)} × {(boardSummary.physicalHeightMm / 10).toFixed(1)} cm · {boardSummary.total} 颗</p></div>
              <div className="editor-field-row"><div className="editor-field"><Label>板规格</Label><select className="editor-input" value={document.board.preset} onChange={(event) => { const preset = event.target.value as EditorDocumentV1["board"]["preset"]; const size = preset === "29x29" ? 29 : preset === "14x14" ? 14 : document.board.columns; updateDocumentSettings("board", { ...document.board, preset, columns: size, rows: size }, "调整拼豆板"); }}><option value="29x29">29 × 29</option><option value="14x14">14 × 14</option><option value="custom">自定义</option></select></div><div className="editor-field"><FieldHelp label="间距 mm">相邻两颗豆子的中心距离，只用于把格数换算成成品物理尺寸，不影响格子数量。标准 5mm 小豆（如 Mard、Perler 中豆）填 5；大豆填 10。</FieldHelp><input className="editor-input" type="number" min="1" max="20" step="0.1" value={document.board.pitchMm} onChange={(event) => updateDocumentSettings("board", { ...document.board, pitchMm: Number(event.target.value) }, "调整物理间距")}/></div></div>
              {document.board.preset === "custom" && <div className="editor-field-row"><input className="editor-input" type="number" min="1" max="100" value={document.board.columns} onChange={(event) => updateDocumentSettings("board", { ...document.board, columns: Number(event.target.value) }, "调整板宽")}/><input className="editor-input" type="number" min="1" max="100" value={document.board.rows} onChange={(event) => updateDocumentSettings("board", { ...document.board, rows: Number(event.target.value) }, "调整板高")}/></div>}
              <div className="editor-board-list">{boardSummary.boards.map((board) => <span key={board.number}><strong>板 {board.number}</strong><small>第 {board.row + 1} 行 / {board.col + 1} 列 · {board.count} 颗</small></span>)}</div>
              <div><strong>库存</strong><p>库存按“{document.colorSystem}＋色号”记录，不与其他品牌合并。</p></div>
              <div className="editor-inventory-list">{usage.map((item) => {
                const inventoryKey = `${document.colorSystem}:${item.palette.key}`;
                const stock = document.inventory[inventoryKey];
                return <label key={item.index}><span style={{ backgroundColor: item.palette.color }} /><strong>{item.palette.key}</strong><small>需要 {item.count}</small><InventoryStockInput value={stock} onCommit={(next) => updateDocumentSettings("inventory", { ...document.inventory, [inventoryKey]: next }, `更新 ${item.palette.key} 库存`)} />{stock !== undefined && stock < item.count ? <em>缺 {item.count - stock}</em> : <em>充足</em>}</label>;
              })}</div>
              <div><strong>制作风险</strong><p>{activeWarnings.length ? `发现 ${activeWarnings.length} 项提示；这些提示不会阻止导出。` : "未发现明显的孤立或脆弱结构。"}</p></div>
              <div className="editor-warning-list">{activeWarnings.slice(0, 8).map((warning) => <button type="button" key={warning.id} onClick={() => { const index = warning.indices[0]; setActiveCell({ row: Math.floor(index / document.width), col: index % document.width }); setIgnoredWarnings((items) => new Set(items).add(warning.id)); }}>{warning.message}<small>定位并忽略</small></button>)}</div>
              <div><strong>导出</strong><p>制作底稿沿用完整坐标、色号和用料清单格式。</p></div>
              <div className="editor-action-grid"><button type="button" onClick={() => void topExport("product")}>产品 PNG</button><button type="button" onClick={onDownloadPattern}>工艺图 PNG</button><button type="button" onClick={() => void topExport("csv")}>CSV</button><button type="button" onClick={() => void topExport("pdf")}>A4 PDF</button><button type="button" onClick={() => void topExport("clipboard")}>复制图片</button><button type="button" onClick={() => void topExport("project")}><FileArchive className="h-4 w-4" />项目包</button></div>
              <input ref={projectInputRef} className="sr-only" type="file" accept=".perler,application/x-perler-project" onChange={(event) => void importProjectFile(event.target.files?.[0])}/><Button variant="outline" onClick={() => projectInputRef.current?.click()}>导入 .perler</Button>
              <div><strong>参考图</strong><p>参考层仅用于对照，不计入用量或产品导出。</p></div>
              <input ref={referenceInputRef} className="sr-only" type="file" accept="image/*" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; updateDocumentSettings("reference", { blob: file, fileName: file.name, mimeType: file.type, opacity: .35, mode: "overlay" }, "设置参考图"); }}/><div className="editor-action-grid"><button type="button" onClick={() => referenceInputRef.current?.click()}>选择参考图</button><select className="editor-input" value={document.reference?.mode ?? "hidden"} onChange={(event) => updateDocumentSettings("reference", { ...document.reference, opacity: document.reference?.opacity ?? .35, mode: event.target.value as NonNullable<EditorDocumentV1["reference"]>["mode"] }, "调整参考图模式")}><option value="hidden">隐藏</option><option value="original">原图</option><option value="grid">网格</option><option value="overlay">叠加</option><option value="difference">差异</option></select></div>
              <div><strong>项目库</strong><p>最近项目保存在当前浏览器中，可打开、复制、重命名或导出。</p></div><div className="editor-project-list">{projects.map((project) => <div key={project.id}><button type="button" onClick={() => void loadProject(project.id).then((loaded) => { if (!loaded) return; executeStructural(`打开项目：${loaded.name}`, loaded); clearSelectionState(); })}><strong>{project.name}</strong><small>{project.width}×{project.height} · {new Date(project.updatedAt).toLocaleString("zh-CN")}</small></button><span className="editor-project-actions"><button type="button" aria-label={`复制 ${project.name}`} onClick={() => void duplicateStoredProject(project.id)}><Copy className="h-4 w-4" /></button><button type="button" aria-label={`重命名 ${project.name}`} onClick={() => void renameStoredProject(project.id)}>改</button><button type="button" aria-label={`导出 ${project.name}`} onClick={() => void exportStoredProject(project.id)}><Download className="h-4 w-4" /></button><button type="button" aria-label={`删除 ${project.name}`} onClick={() => void deleteProject(project.id).then(() => listProjects()).then(setProjects)}><Trash2 className="h-4 w-4" /></button></span></div>)}</div>
            </div>}

            {inspectorTab === "preview" && <ResultPreviewPanel grid={grid} settings={document.preview} onSettingsChange={(preview) => updateDocumentSettings("preview", preview, "调整展示预览")} />}

            {inspectorTab === "history" && <div className="editor-inspector-section">
              <div><strong>编辑历史</strong><p>共 {snapshot.history.length} 条，当前位置 {snapshot.historyIndex}。点击记录可回到对应状态。</p></div>
              <div className="editor-history-list"><button type="button" className={snapshot.historyIndex === 0 ? "is-active" : ""} onClick={() => store.rollbackTo(0)}>初始状态</button>{snapshot.history.map((entry, index) => <button key={entry.id} type="button" className={snapshot.historyIndex === index + 1 ? "is-active" : ""} onClick={() => { if (snapshot.historyIndex < snapshot.history.length && index + 1 < snapshot.historyIndex && !window.confirm("回到较早记录后继续编辑会清除未来历史。是否继续？")) return; store.rollbackTo(index + 1); }}><span>{entry.label}</span><small>{entry.affectedCells} 格 · {new Date(entry.timestamp).toLocaleTimeString("zh-CN")}</small></button>)}</div>
              <div className="editor-field"><Label htmlFor="snapshot-name">命名快照</Label><input id="snapshot-name" className="editor-input" value={namedSnapshot} onChange={(event) => setNamedSnapshot(event.target.value)} placeholder="例如：配色方案 A" /></div><Button variant="outline" onClick={() => void saveNamedSnapshot(document, namedSnapshot).then(() => { setNamedSnapshot(""); setStatusMessage("命名快照已保存"); })}>保存快照</Button>
            </div>}
          </div>
        </aside>
      </div>
    </section>
  );
}
