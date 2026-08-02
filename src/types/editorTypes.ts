export type EditorTool =
  | "move"
  | "brush"
  | "eyedropper"
  | "fill"
  | "line"
  | "rectangle"
  | "ellipse"
  | "stamp"
  | "select"
  | "eraser";

export type PaletteSortMode = "usage" | "hue" | "saturation" | "lightness" | "code" | "similarity";
export type RectangleMode = "outline" | "filled";

export interface GridPoint {
  row: number;
  col: number;
}

export interface GridSelection {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export type { EditorPreviewSettings as PreviewSettings } from "@/editor/types";
