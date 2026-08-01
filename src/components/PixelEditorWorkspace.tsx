"use client";

import {
  ClipboardPaste,
  Copy,
  Crop,
  Download,
  Eraser,
  Eye,
  Hand,
  Minus,
  MousePointer2,
  PaintBucket,
  Pencil,
  Pipette,
  Redo2,
  Square,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, {
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ResultPreviewPanel from "@/components/ResultPreviewPanel";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  EditorTool,
  GridPoint,
  GridSelection,
  PaletteSortMode,
  PreviewSettings,
  RectangleMode,
} from "@/types/editorTypes";
import { ColorSystem, getColorKeyByHex, sortColorsByHue } from "@/utils/colorSystemUtils";
import {
  clearSelection,
  cloneGrid,
  copySelectionData,
  cropToSelection,
  drawRectangle,
  fillRegion,
  fillSelection,
  getLinePoints,
  gridsEqual,
  moveContent,
  normalizeSelection,
  paintPoints,
  pasteSelectionData,
  resizeGridCentered,
} from "@/utils/gridEditorUtils";
import { MappedPixel } from "@/utils/pixelation";
import { TRANSPARENT_KEY, transparentColorData } from "@/utils/pixelEditingUtils";

interface PaletteItem {
  key: string;
  color: string;
}

interface PixelEditorWorkspaceProps {
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
  paletteColors: PaletteItem[];
  currentColors: PaletteItem[];
  selectedColorSystem: ColorSystem;
  onChange: (grid: MappedPixel[][]) => void;
  onExit: () => void;
  onDownloadPattern: () => void;
}

interface GestureState {
  tool: EditorTool;
  start: GridPoint;
  last: GridPoint;
  pointerId: number;
  workingGrid?: MappedPixel[][];
  panStart?: { x: number; y: number; left: number; top: number };
}

interface PinchState {
  startDistance: number;
  startCenter: { x: number; y: number };
  startZoom: number;
  currentZoom: number;
  startScrollLeft: number;
  startScrollTop: number;
}

const CELL_SIZE = 14;
const MAX_HISTORY = 80;

const defaultPreviewSettings: PreviewSettings = {
  title: "可更改此文字",
  subtitle: "perler beads studio",
  fontFamily: "sans",
  fontWeight: "600",
  titleSize: 34,
  textColor: "#777772",
  textOpacity: 0.45,
  backgroundColor: "#f4f3ee",
  imageScale: 0.9,
  imageOffsetY: 0,
  aspectRatio: "1:1",
};

const toolDefinitions: Array<{
  id: EditorTool;
  label: string;
  shortcut: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "move", label: "移动", shortcut: "V", icon: Hand },
  { id: "brush", label: "画笔", shortcut: "B", icon: Pencil },
  { id: "eraser", label: "橡皮", shortcut: "E", icon: Eraser },
  { id: "eyedropper", label: "取色", shortcut: "I", icon: Pipette },
  { id: "fill", label: "填充", shortcut: "G", icon: PaintBucket },
  { id: "line", label: "直线", shortcut: "L", icon: Minus },
  { id: "rectangle", label: "矩形", shortcut: "R", icon: Square },
  { id: "select", label: "框选", shortcut: "S", icon: MousePointer2 },
];

function sortByCode(a: PaletteItem, b: PaletteItem, colorSystem: ColorSystem) {
  const left = getColorKeyByHex(a.color, colorSystem);
  const right = getColorKeyByHex(b.color, colorSystem);
  const leftMatch = left.match(/^([^0-9]*)(\d+)$/);
  const rightMatch = right.match(/^([^0-9]*)(\d+)$/);
  if (leftMatch && rightMatch && leftMatch[1] === rightMatch[1]) {
    return Number(leftMatch[2]) - Number(rightMatch[2]);
  }
  return left.localeCompare(right, "zh-CN", { numeric: true });
}

function getCellFromPointer(
  event: ReactPointerEvent<HTMLCanvasElement>,
  columns: number,
  rows: number,
): GridPoint | null {
  const rect = event.currentTarget.getBoundingClientRect();
  const col = Math.floor(((event.clientX - rect.left) / rect.width) * columns);
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * rows);
  if (row < 0 || row >= rows || col < 0 || col >= columns) return null;
  return { row, col };
}

function drawCell(
  context: CanvasRenderingContext2D,
  cell: MappedPixel,
  point: GridPoint,
  showCode: boolean,
  colorSystem: ColorSystem,
  dark: boolean,
) {
  const x = point.col * CELL_SIZE;
  const y = point.row * CELL_SIZE;
  context.fillStyle = cell.isExternal ? (dark ? "#242422" : "#f5f4f0") : cell.color;
  context.fillRect(x, y, CELL_SIZE, CELL_SIZE);
  context.strokeStyle = dark ? "rgba(250,249,245,0.15)" : "rgba(20,20,19,0.16)";
  context.lineWidth = 0.5;
  context.strokeRect(x + 0.25, y + 0.25, CELL_SIZE - 0.5, CELL_SIZE - 0.5);

  if (showCode && !cell.isExternal) {
    const hex = cell.color.replace("#", "");
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    context.fillStyle = luma > 145 ? "rgba(20,20,19,0.82)" : "rgba(255,255,255,0.9)";
    context.font = "600 3.4px ui-monospace, monospace";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(
      getColorKeyByHex(cell.color, colorSystem),
      x + CELL_SIZE / 2,
      y + CELL_SIZE / 2,
      CELL_SIZE - 1,
    );
  }
}

function drawSelectionOverlay(
  context: CanvasRenderingContext2D,
  selection: GridSelection,
  rowOffset = 0,
  colOffset = 0,
) {
  const normalized = normalizeSelection(selection);
  const x = (normalized.startCol + colOffset) * CELL_SIZE;
  const y = (normalized.startRow + rowOffset) * CELL_SIZE;
  const width = (normalized.endCol - normalized.startCol + 1) * CELL_SIZE;
  const height = (normalized.endRow - normalized.startRow + 1) * CELL_SIZE;
  context.save();
  context.fillStyle = "rgba(180, 62, 43, 0.11)";
  context.fillRect(x, y, width, height);
  context.strokeStyle = "#b43e2b";
  context.lineWidth = 1.5;
  context.setLineDash([5, 3]);
  context.strokeRect(x + 0.75, y + 0.75, width - 1.5, height - 1.5);
  context.restore();
}

export default function PixelEditorWorkspace({
  mappedPixelData,
  gridDimensions,
  paletteColors,
  currentColors,
  selectedColorSystem,
  onChange,
  onExit,
  onDownloadPattern,
}: PixelEditorWorkspaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const dataRef = useRef(mappedPixelData);
  const gestureRef = useRef<GestureState | null>(null);
  const spacePressedRef = useRef(false);
  const clipboardRef = useRef<MappedPixel[][] | null>(null);
  const cursorLabelRef = useRef<HTMLSpanElement>(null);
  const touchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<PinchState | null>(null);
  const [tool, setTool] = useState<EditorTool>("brush");
  const [selectedColor, setSelectedColor] = useState<MappedPixel>(() => {
    const first = currentColors[0] ?? paletteColors[0];
    return first ? { ...first, isExternal: false } : { ...transparentColorData };
  });
  const [zoom, setZoom] = useState(1);
  const [selection, setSelection] = useState<GridSelection | null>(null);
  const [rectangleMode, setRectangleMode] = useState<RectangleMode>("outline");
  const [paletteSort, setPaletteSort] = useState<PaletteSortMode>("hue");
  const [paletteSource, setPaletteSource] = useState<"current" | "all">("current");
  const [paletteSearch, setPaletteSearch] = useState("");
  const [inspectorTab, setInspectorTab] = useState<"color" | "selection" | "canvas" | "preview">("color");
  const [past, setPast] = useState<MappedPixel[][][]>([]);
  const [future, setFuture] = useState<MappedPixel[][][]>([]);
  const [resizeWidth, setResizeWidth] = useState(gridDimensions.N);
  const [resizeHeight, setResizeHeight] = useState(gridDimensions.M);
  const [darkMode, setDarkMode] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<PreviewSettings>(defaultPreviewSettings);

  useEffect(() => {
    dataRef.current = mappedPixelData;
  }, [mappedPixelData]);

  useEffect(() => {
    setResizeWidth(gridDimensions.N);
    setResizeHeight(gridDimensions.M);
  }, [gridDimensions.M, gridDimensions.N]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("perler-preview-settings");
      if (saved) setPreviewSettings({ ...defaultPreviewSettings, ...JSON.parse(saved) });
    } catch {
      // A private browsing session may reject storage. Defaults remain usable.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("perler-preview-settings", JSON.stringify(previewSettings));
    } catch {
      // Preview settings still work for the current mounted editor.
    }
  }, [previewSettings]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setDarkMode(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  const renderOverlay = useCallback((activeSelection = selection, rowOffset = 0, colOffset = 0) => {
    const canvas = overlayRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (activeSelection) drawSelectionOverlay(context, activeSelection, rowOffset, colOffset);
  }, [selection]);

  const drawGrid = useCallback((grid = dataRef.current) => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const showCode = zoom >= 1.7;
    for (let row = 0; row < grid.length; row++) {
      for (let col = 0; col < (grid[row]?.length ?? 0); col++) {
        drawCell(context, grid[row][col], { row, col }, showCode, selectedColorSystem, darkMode);
      }
    }
  }, [darkMode, selectedColorSystem, zoom]);

  useEffect(() => {
    const width = gridDimensions.N * CELL_SIZE;
    const height = gridDimensions.M * CELL_SIZE;
    if (canvasRef.current) {
      canvasRef.current.width = width;
      canvasRef.current.height = height;
    }
    if (overlayRef.current) {
      overlayRef.current.width = width;
      overlayRef.current.height = height;
    }
    drawGrid(mappedPixelData);
    renderOverlay();
  }, [drawGrid, gridDimensions.M, gridDimensions.N, mappedPixelData, renderOverlay]);

  useEffect(() => {
    drawGrid();
  }, [drawGrid]);

  useEffect(() => {
    renderOverlay();
  }, [renderOverlay, selection]);

  const commit = useCallback((next: MappedPixel[][]) => {
    const current = dataRef.current;
    if (gridsEqual(current, next)) return;
    setPast((items) => [...items.slice(-(MAX_HISTORY - 1)), cloneGrid(current)]);
    setFuture([]);
    dataRef.current = next;
    onChange(next);
  }, [onChange]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast((items) => items.slice(0, -1));
    setFuture((items) => [cloneGrid(dataRef.current), ...items].slice(0, MAX_HISTORY));
    dataRef.current = cloneGrid(previous);
    onChange(cloneGrid(previous));
    setSelection(null);
  }, [onChange, past]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture((items) => items.slice(1));
    setPast((items) => [...items.slice(-(MAX_HISTORY - 1)), cloneGrid(dataRef.current)]);
    dataRef.current = cloneGrid(next);
    onChange(cloneGrid(next));
    setSelection(null);
  }, [future, onChange]);

  const selectPaintColor = useCallback((color: PaletteItem) => {
    setSelectedColor({ ...color, isExternal: false });
    setTool("brush");
  }, []);

  const drawWorkingCell = useCallback((grid: MappedPixel[][], point: GridPoint) => {
    const context = canvasRef.current?.getContext("2d");
    const cell = grid[point.row]?.[point.col];
    if (!context || !cell) return;
    drawCell(context, cell, point, zoom >= 1.7, selectedColorSystem, darkMode);
  }, [darkMode, selectedColorSystem, zoom]);

  const paintGestureSegment = useCallback((gesture: GestureState, point: GridPoint) => {
    if (!gesture.workingGrid) return;
    const color = gesture.tool === "eraser" ? transparentColorData : selectedColor;
    const points = getLinePoints(gesture.last, point);
    for (const current of points) {
      if (!gesture.workingGrid[current.row]?.[current.col]) continue;
      gesture.workingGrid[current.row][current.col] = color.key === TRANSPARENT_KEY
        ? { ...transparentColorData }
        : { ...color, isExternal: false };
      drawWorkingCell(gesture.workingGrid, current);
    }
    gesture.last = point;
  }, [drawWorkingCell, selectedColor]);

  const previewShape = useCallback((start: GridPoint, end: GridPoint, shape: "line" | "rectangle") => {
    const canvas = overlayRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (selection) drawSelectionOverlay(context, selection);
    context.save();
    context.fillStyle = selectedColor.color;
    context.globalAlpha = 0.72;
    const points = shape === "line"
      ? getLinePoints(start, end)
      : (() => {
          const normalized = normalizeSelection({
            startRow: start.row,
            startCol: start.col,
            endRow: end.row,
            endCol: end.col,
          });
          const rectanglePoints: GridPoint[] = [];
          for (let row = normalized.startRow; row <= normalized.endRow; row++) {
            for (let col = normalized.startCol; col <= normalized.endCol; col++) {
              if (
                rectangleMode === "filled" ||
                row === normalized.startRow ||
                row === normalized.endRow ||
                col === normalized.startCol ||
                col === normalized.endCol
              ) {
                rectanglePoints.push({ row, col });
              }
            }
          }
          return rectanglePoints;
        })();
    for (const point of points) {
      context.fillRect(point.col * CELL_SIZE, point.row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
    context.restore();
  }, [rectangleMode, selectedColor, selection]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = getCellFromPointer(event, gridDimensions.N, gridDimensions.M);
    if (event.pointerType === "touch") {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointersRef.current.size === 2 && viewportRef.current) {
        const [first, second] = Array.from(touchPointersRef.current.values());
        const startDistance = Math.hypot(second.x - first.x, second.y - first.y);
        const startCenter = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        pinchRef.current = {
          startDistance,
          startCenter,
          startZoom: zoom,
          currentZoom: zoom,
          startScrollLeft: viewportRef.current.scrollLeft,
          startScrollTop: viewportRef.current.scrollTop,
        };
        gestureRef.current = null;
        drawGrid();
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    const shouldPan = event.button === 1 || spacePressedRef.current;
    if (shouldPan && viewportRef.current) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      gestureRef.current = {
        tool,
        start: point ?? { row: 0, col: 0 },
        last: point ?? { row: 0, col: 0 },
        pointerId: event.pointerId,
        panStart: {
          x: event.clientX,
          y: event.clientY,
          left: viewportRef.current.scrollLeft,
          top: viewportRef.current.scrollTop,
        },
      };
      return;
    }
    if (!point || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (tool === "eyedropper") {
      const cell = dataRef.current[point.row][point.col];
      if (cell && !cell.isExternal) {
        setSelectedColor({ ...cell, isExternal: false });
        setTool("brush");
        setInspectorTab("color");
      }
      return;
    }

    if (tool === "fill") {
      commit(fillRegion(dataRef.current, point, selectedColor));
      return;
    }

    const gesture: GestureState = {
      tool,
      start: point,
      last: point,
      pointerId: event.pointerId,
    };
    if (tool === "brush" || tool === "eraser") {
      gesture.workingGrid = cloneGrid(dataRef.current);
      paintGestureSegment(gesture, point);
    } else if (tool === "select") {
      renderOverlay({ startRow: point.row, startCol: point.col, endRow: point.row, endCol: point.col });
    }
    gestureRef.current = gesture;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "touch" && touchPointersRef.current.has(event.pointerId)) {
      touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (pinchRef.current && touchPointersRef.current.size >= 2 && viewportRef.current && canvasWrapRef.current) {
      const [first, second] = Array.from(touchPointersRef.current.values());
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const nextZoom = Math.min(4, Math.max(0.35, pinchRef.current.startZoom * (distance / pinchRef.current.startDistance)));
      pinchRef.current.currentZoom = nextZoom;
      canvasWrapRef.current.style.width = `${gridDimensions.N * CELL_SIZE * nextZoom}px`;
      canvasWrapRef.current.style.height = `${gridDimensions.M * CELL_SIZE * nextZoom}px`;
      viewportRef.current.scrollLeft = pinchRef.current.startScrollLeft - (center.x - pinchRef.current.startCenter.x);
      viewportRef.current.scrollTop = pinchRef.current.startScrollTop - (center.y - pinchRef.current.startCenter.y);
      return;
    }
    const point = getCellFromPointer(event, gridDimensions.N, gridDimensions.M);
    if (cursorLabelRef.current) {
      cursorLabelRef.current.textContent = point
        ? `行 ${point.row + 1}，列 ${point.col + 1}`
        : "指针位于画布外";
    }
    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.panStart && viewportRef.current) {
      viewportRef.current.scrollLeft = gesture.panStart.left - (event.clientX - gesture.panStart.x);
      viewportRef.current.scrollTop = gesture.panStart.top - (event.clientY - gesture.panStart.y);
      return;
    }
    if (!point) return;

    if (gesture.tool === "brush" || gesture.tool === "eraser") {
      paintGestureSegment(gesture, point);
    } else if (gesture.tool === "line") {
      previewShape(gesture.start, point, "line");
    } else if (gesture.tool === "rectangle") {
      previewShape(gesture.start, point, "rectangle");
    } else if (gesture.tool === "select") {
      renderOverlay({
        startRow: gesture.start.row,
        startCol: gesture.start.col,
        endRow: point.row,
        endCol: point.col,
      });
    } else if (gesture.tool === "move") {
      renderOverlay(selection, point.row - gesture.start.row, point.col - gesture.start.col);
    }
    gesture.last = point;
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.pointerType === "touch") touchPointersRef.current.delete(event.pointerId);
    if (pinchRef.current) {
      if (touchPointersRef.current.size < 2) {
        const finalZoom = pinchRef.current.currentZoom;
        pinchRef.current = null;
        setZoom(finalZoom);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      return;
    }
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (gesture.panStart) return;

    if ((gesture.tool === "brush" || gesture.tool === "eraser") && gesture.workingGrid) {
      commit(gesture.workingGrid);
    } else if (gesture.tool === "line") {
      commit(paintPoints(dataRef.current, getLinePoints(gesture.start, gesture.last), selectedColor));
    } else if (gesture.tool === "rectangle") {
      commit(drawRectangle(dataRef.current, {
        startRow: gesture.start.row,
        startCol: gesture.start.col,
        endRow: gesture.last.row,
        endCol: gesture.last.col,
      }, selectedColor, rectangleMode === "filled"));
    } else if (gesture.tool === "select") {
      const nextSelection = normalizeSelection({
        startRow: gesture.start.row,
        startCol: gesture.start.col,
        endRow: gesture.last.row,
        endCol: gesture.last.col,
      });
      setSelection(nextSelection);
      setInspectorTab("selection");
    } else if (gesture.tool === "move") {
      const rowDelta = gesture.last.row - gesture.start.row;
      const colDelta = gesture.last.col - gesture.start.col;
      if (rowDelta !== 0 || colDelta !== 0) {
        commit(moveContent(dataRef.current, rowDelta, colDelta, selection));
        if (selection) {
          const normalized = normalizeSelection(selection);
          setSelection({
            startRow: Math.max(0, Math.min(gridDimensions.M - 1, normalized.startRow + rowDelta)),
            startCol: Math.max(0, Math.min(gridDimensions.N - 1, normalized.startCol + colDelta)),
            endRow: Math.max(0, Math.min(gridDimensions.M - 1, normalized.endRow + rowDelta)),
            endCol: Math.max(0, Math.min(gridDimensions.N - 1, normalized.endCol + colDelta)),
          });
        }
      }
    }
    clearOverlay();
    requestAnimationFrame(() => renderOverlay());
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    setZoom((value) => Math.min(4, Math.max(0.35, value + (event.deltaY > 0 ? -0.1 : 0.1))));
  };

  const copySelection = useCallback(() => {
    if (!selection) return;
    clipboardRef.current = copySelectionData(dataRef.current, selection);
  }, [selection]);

  const pasteSelection = useCallback(() => {
    if (!clipboardRef.current) return;
    const origin = selection
      ? { row: Math.min(gridDimensions.M - 1, selection.startRow + 1), col: Math.min(gridDimensions.N - 1, selection.startCol + 1) }
      : { row: 0, col: 0 };
    commit(pasteSelectionData(dataRef.current, clipboardRef.current, origin));
    setSelection({
      startRow: origin.row,
      startCol: origin.col,
      endRow: Math.min(gridDimensions.M - 1, origin.row + clipboardRef.current.length - 1),
      endCol: Math.min(gridDimensions.N - 1, origin.col + (clipboardRef.current[0]?.length ?? 1) - 1),
    });
  }, [commit, gridDimensions.M, gridDimensions.N, selection]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (event.code === "Space") {
        spacePressedRef.current = true;
        event.preventDefault();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") {
        event.preventDefault();
        copySelection();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        event.preventDefault();
        pasteSelection();
        return;
      }
      const shortcutMap: Record<string, EditorTool> = {
        v: "move",
        b: "brush",
        e: "eraser",
        i: "eyedropper",
        g: "fill",
        l: "line",
        r: "rectangle",
        s: "select",
      };
      const nextTool = shortcutMap[event.key.toLowerCase()];
      if (nextTool) setTool(nextTool);
      if ((event.key === "Delete" || event.key === "Backspace") && selection) {
        event.preventDefault();
        commit(clearSelection(dataRef.current, selection));
      }
      if (event.key === "Escape") setSelection(null);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "Space") spacePressedRef.current = false;
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [commit, copySelection, pasteSelection, redo, selection, undo]);

  const visiblePalette = useMemo(() => {
    const source = paletteSource === "all" ? paletteColors : currentColors;
    const query = paletteSearch.trim().toLowerCase();
    const filtered = source.filter((color) => {
      const code = getColorKeyByHex(color.color, selectedColorSystem);
      return !query || code.toLowerCase().includes(query) || color.color.toLowerCase().includes(query);
    });
    return paletteSort === "hue"
      ? sortColorsByHue(filtered)
      : filtered.slice().sort((a, b) => sortByCode(a, b, selectedColorSystem));
  }, [currentColors, paletteColors, paletteSearch, paletteSort, paletteSource, selectedColorSystem]);

  const selectionSize = selection
    ? `${Math.abs(selection.endCol - selection.startCol) + 1} × ${Math.abs(selection.endRow - selection.startRow) + 1}`
    : "未选择";

  const cursorName = gestureRef.current?.panStart || spacePressedRef.current
    ? "grabbing"
    : tool === "move"
      ? "move"
      : tool === "eyedropper"
        ? "copy"
        : "crosshair";

  return (
    <section className="pixel-editor-shell" aria-label="拼豆编辑工作台">
      <header className="pixel-editor-topbar">
        <div className="pixel-editor-brand">
          <span className="pixel-editor-mark" aria-hidden="true" />
          <div>
            <strong>编辑工作台</strong>
            <span>{gridDimensions.N} × {gridDimensions.M} 格</span>
          </div>
        </div>
        <div className="pixel-editor-history" aria-label="编辑历史">
          <button type="button" onClick={undo} disabled={past.length === 0} title="撤销 Ctrl+Z">
            <Undo2 className="h-4 w-4" />
            <span>上一步</span>
          </button>
          <button type="button" onClick={redo} disabled={future.length === 0} title="重做 Ctrl+Y">
            <Redo2 className="h-4 w-4" />
            <span>下一步</span>
          </button>
        </div>
        <div className="pixel-editor-top-actions">
          <button type="button" onClick={() => setInspectorTab("preview")}>
            <Eye className="h-4 w-4" />
            展示预览
          </button>
          <button type="button" onClick={onDownloadPattern}>
            <Download className="h-4 w-4" />
            制作底稿
          </button>
          <Button size="sm" variant="outline" onClick={onExit}>完成编辑</Button>
        </div>
      </header>

      <div className="pixel-editor-layout">
        <aside className="pixel-editor-tools" aria-label="画布工具">
          {toolDefinitions.map((definition) => {
            const Icon = definition.icon;
            return (
              <button
                key={definition.id}
                type="button"
                className={tool === definition.id ? "is-active" : ""}
                onClick={() => setTool(definition.id)}
                title={`${definition.label} (${definition.shortcut})`}
                aria-label={definition.label}
              >
                <Icon className="h-5 w-5" />
                <span>{definition.label}</span>
                <kbd>{definition.shortcut}</kbd>
              </button>
            );
          })}
        </aside>

        <div className="pixel-editor-canvas-column">
          <div
            ref={viewportRef}
            className="pixel-editor-viewport"
            onWheel={handleWheel}
          >
            <div
              ref={canvasWrapRef}
              className="pixel-editor-canvas-wrap"
              style={{
                width: gridDimensions.N * CELL_SIZE * zoom,
                height: gridDimensions.M * CELL_SIZE * zoom,
              }}
            >
              <canvas
                ref={canvasRef}
                className="pixel-editor-canvas"
                style={{ cursor: cursorName }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onPointerLeave={() => {
                  if (cursorLabelRef.current) cursorLabelRef.current.textContent = "指针位于画布外";
                }}
                aria-label="可编辑拼豆网格"
              />
              <canvas ref={overlayRef} className="pixel-editor-overlay" aria-hidden="true" />
            </div>
          </div>
          <div className="pixel-editor-statusbar">
            <span>{toolDefinitions.find((item) => item.id === tool)?.label}</span>
            <span ref={cursorLabelRef}>指针位于画布外</span>
            <span>选区 {selectionSize}</span>
            <div className="pixel-editor-zoom">
              <button type="button" onClick={() => setZoom((value) => Math.max(0.35, value - 0.15))} aria-label="缩小">
                <ZoomOut className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
              <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.15))} aria-label="放大">
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <aside className="pixel-editor-inspector">
          <nav className="pixel-editor-tabs" aria-label="属性面板">
            {([
              ["color", "颜色"],
              ["selection", "选区"],
              ["canvas", "画布"],
              ["preview", "预览"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={inspectorTab === id ? "is-active" : ""}
                onClick={() => setInspectorTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="pixel-editor-inspector-body">
            {inspectorTab === "color" && (
              <>
                <div className="editor-current-color">
                  <span style={{ backgroundColor: selectedColor.color }} />
                  <div>
                    <strong>{selectedColor.key === TRANSPARENT_KEY ? "透明" : getColorKeyByHex(selectedColor.color, selectedColorSystem)}</strong>
                    <small>{selectedColor.color.toUpperCase()}</small>
                  </div>
                </div>
                <div className="editor-segmented">
                  <button type="button" className={paletteSource === "current" ? "is-active" : ""} onClick={() => setPaletteSource("current")}>图案用色</button>
                  <button type="button" className={paletteSource === "all" ? "is-active" : ""} onClick={() => setPaletteSource("all")}>完整色板</button>
                </div>
                <input
                  value={paletteSearch}
                  onChange={(event) => setPaletteSearch(event.target.value)}
                  className="editor-input"
                  placeholder="搜索色号或 HEX"
                  aria-label="搜索颜色"
                />
                <div className="editor-segmented">
                  <button type="button" className={paletteSort === "hue" ? "is-active" : ""} onClick={() => setPaletteSort("hue")}>按色相</button>
                  <button type="button" className={paletteSort === "code" ? "is-active" : ""} onClick={() => setPaletteSort("code")}>按色号</button>
                </div>
                <div className="editor-palette-grid">
                  {visiblePalette.map((color) => {
                    const code = getColorKeyByHex(color.color, selectedColorSystem);
                    const active = selectedColor.color.toUpperCase() === color.color.toUpperCase();
                    return (
                      <button
                        key={`${code}-${color.color}`}
                        type="button"
                        className={active ? "is-active" : ""}
                        onClick={() => selectPaintColor(color)}
                        title={`${code} ${color.color}`}
                      >
                        <span style={{ backgroundColor: color.color }} />
                        <small>{code}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {inspectorTab === "selection" && (
              <div className="editor-inspector-section">
                <div>
                  <strong>当前选区</strong>
                  <p>{selection ? `${selectionSize} 格，可移动、复制、删除、填色或裁切。` : "使用框选工具拖出一个矩形区域。"}</p>
                </div>
                <div className="editor-action-grid">
                  <button type="button" disabled={!selection} onClick={copySelection}><Copy className="h-4 w-4" />复制</button>
                  <button type="button" disabled={!clipboardRef.current} onClick={pasteSelection}><ClipboardPaste className="h-4 w-4" />粘贴</button>
                  <button type="button" disabled={!selection} onClick={() => selection && commit(fillSelection(dataRef.current, selection, selectedColor))}><PaintBucket className="h-4 w-4" />填色</button>
                  <button type="button" disabled={!selection} onClick={() => selection && commit(clearSelection(dataRef.current, selection))}><Trash2 className="h-4 w-4" />删除</button>
                  <button
                    type="button"
                    disabled={!selection}
                    onClick={() => {
                      if (!selection) return;
                      commit(cropToSelection(dataRef.current, selection));
                      setSelection(null);
                    }}
                  >
                    <Crop className="h-4 w-4" />裁切到选区
                  </button>
                  <button type="button" disabled={!selection} onClick={() => setSelection(null)}>取消选区</button>
                </div>
              </div>
            )}

            {inspectorTab === "canvas" && (
              <div className="editor-inspector-section">
                <div>
                  <strong>画布尺寸</strong>
                  <p>从中心扩展或裁切。新增区域保持留白。</p>
                </div>
                <div className="editor-field-row">
                  <div className="editor-field">
                    <Label htmlFor="canvas-width">宽</Label>
                    <input
                      id="canvas-width"
                      type="number"
                      min="1"
                      max="500"
                      value={resizeWidth}
                      onChange={(event) => setResizeWidth(Number(event.target.value))}
                      className="editor-input"
                    />
                  </div>
                  <div className="editor-field">
                    <Label htmlFor="canvas-height">高</Label>
                    <input
                      id="canvas-height"
                      type="number"
                      min="1"
                      max="500"
                      value={resizeHeight}
                      onChange={(event) => setResizeHeight(Number(event.target.value))}
                      className="editor-input"
                    />
                  </div>
                </div>
                <Button
                  onClick={() => {
                    commit(resizeGridCentered(dataRef.current, resizeWidth, resizeHeight));
                    setSelection(null);
                  }}
                  className="w-full"
                >
                  应用画布尺寸
                </Button>
                <div>
                  <strong>矩形工具</strong>
                  <p>选择只画边框，或填满整个矩形。</p>
                </div>
                <div className="editor-segmented">
                  <button type="button" className={rectangleMode === "outline" ? "is-active" : ""} onClick={() => setRectangleMode("outline")}>描边</button>
                  <button type="button" className={rectangleMode === "filled" ? "is-active" : ""} onClick={() => setRectangleMode("filled")}>填充</button>
                </div>
                <div className="editor-shortcuts">
                  <strong>快捷操作</strong>
                  <span><kbd>Space</kbd> 拖动画布</span>
                  <span><kbd>Ctrl Z</kbd> 撤销</span>
                  <span><kbd>Ctrl Y</kbd> 重做</span>
                  <span><kbd>Delete</kbd> 删除选区</span>
                </div>
              </div>
            )}

            {inspectorTab === "preview" && (
              <ResultPreviewPanel
                grid={mappedPixelData}
                settings={previewSettings}
                onSettingsChange={setPreviewSettings}
              />
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
