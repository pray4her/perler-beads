import { analyzeManufacturingRisks, countColors } from "@/editor/analysis";
import { floodFillPatches, type FillMode, type FillScope } from "@/editor/operations";
import type { EditorDocumentV1, SelectionMask } from "@/editor/types";

let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();

function getWorker() {
  if (typeof Worker === "undefined") return null;
  if (!worker) {
    worker = new Worker(new URL("./editor.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: string; result?: unknown; error?: string }>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.error) request.reject(new Error(event.data.error));
      else request.resolve(event.data.result);
    };
    worker.onerror = () => {
      pending.forEach(({ reject }) => reject(new Error("编辑器 Worker 执行失败")));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

function requestWorker<T>(payload: Record<string, unknown>): Promise<T> | null {
  const activeWorker = getWorker();
  if (!activeWorker) return null;
  const id = `worker-${++sequence}`;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    activeWorker.postMessage({ ...payload, id });
  });
}

export async function fillInWorker(
  document: EditorDocumentV1,
  row: number,
  col: number,
  paletteIndex: number,
  mode: FillMode,
  scope: FillScope,
  selection?: SelectionMask | null,
) {
  return requestWorker<ReturnType<typeof floodFillPatches>>({ type: "fill", document, row, col, paletteIndex, mode, scope, selection })
    ?? floodFillPatches(document, { row, col }, paletteIndex, mode, scope, selection);
}

export async function statsInWorker(document: EditorDocumentV1) {
  return requestWorker<ReturnType<typeof countColors>>({ type: "stats", document }) ?? countColors(document);
}

export async function risksInWorker(document: EditorDocumentV1) {
  return requestWorker<ReturnType<typeof analyzeManufacturingRisks>>({ type: "risks", document }) ?? analyzeManufacturingRisks(document);
}
