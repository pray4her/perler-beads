/// <reference lib="webworker" />

import { analyzeManufacturingRisks, countColors } from "@/editor/analysis";
import { floodFillPatches } from "@/editor/operations";
import type { EditorDocumentV1, SelectionMask } from "@/editor/types";

type WorkerRequest =
  | { id: string; type: "fill"; document: EditorDocumentV1; row: number; col: number; paletteIndex: number; mode: "connected" | "all"; scope: "canvas" | "selection"; selection?: SelectionMask | null }
  | { id: string; type: "stats"; document: EditorDocumentV1 }
  | { id: string; type: "risks"; document: EditorDocumentV1 };

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = request.type === "fill"
      ? floodFillPatches(
          request.document,
          { row: request.row, col: request.col },
          request.paletteIndex,
          request.mode,
          request.scope,
          request.selection,
        )
      : request.type === "stats"
        ? countColors(request.document)
        : analyzeManufacturingRisks(request.document);
    self.postMessage({ id: request.id, result });
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
