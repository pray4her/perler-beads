import type { EditorDocumentV1 } from "@/editor/types";

export interface FocusProgressSettings {
  guidanceMode: "nearest" | "largest" | "edge-first";
  gridSectionInterval: number;
  showSectionLines: boolean;
  sectionLineColor: string;
  enableCelebration: boolean;
  progressMode: "color" | "row";
  showCoordinates: boolean;
  wakeLockEnabled: boolean;
  showGridLines?: boolean;
  boardInterval?: number;
  autoLocateNext?: boolean;
}

export interface FocusProgressRecord {
  projectId: string;
  revision: number;
  completedCells: number[];
  updatedAt: number;
  contentHash?: string;
  settings?: FocusProgressSettings;
  timer?: { totalElapsedTime: number; isPaused: boolean };
  currentColor?: string;
  currentRow?: number;
}

export interface LegacyFocusData {
  pixelData: string;
  colorSystem: string | null;
}

export function hashEditorContent(
  document: Pick<EditorDocumentV1, "cells" | "width" | "height">,
): string {
  let hash = 0x811c9dc5;
  const mix = (value: number) => {
    hash = Math.imul(hash ^ (value & 0xff), 0x01000193);
    hash = Math.imul(hash ^ ((value >>> 8) & 0xff), 0x01000193);
  };
  mix(document.width);
  mix(document.height);
  for (const cell of document.cells) mix(cell);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
