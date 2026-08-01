export type EditorTool =
  | "move"
  | "brush"
  | "eyedropper"
  | "fill"
  | "line"
  | "rectangle"
  | "select"
  | "eraser";

export type PaletteSortMode = "hue" | "code";
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

export interface PreviewSettings {
  title: string;
  subtitle: string;
  fontFamily: "sans" | "serif" | "mono" | "handwriting";
  fontWeight: "400" | "600" | "700";
  titleSize: number;
  textColor: string;
  textOpacity: number;
  backgroundColor: string;
  imageScale: number;
  imageOffsetY: number;
  aspectRatio: "1:1" | "4:5" | "9:16";
}
