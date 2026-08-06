import type { FocusProgressRecord, LegacyFocusData } from "@/editor/focusProgress";
import type { ProductionExportOptions } from "@/editor/productionModel";
import type { EditorDocumentV1, EditorProjectSummary } from "@/editor/types";
import type { PaletteSelections } from "@/editor/paletteSettings";

declare const selectedFileBrand: unique symbol;
declare const artifactBrand: unique symbol;

export type FileIntent = "source" | "palette" | "project" | "reference";

export interface SelectedFileRef {
  readonly [selectedFileBrand]: true;
  readonly name: string;
  readonly mimeType: string;
  readonly size: number;
}

export interface ArtifactRef {
  readonly [artifactBrand]: true;
  readonly mimeType: string;
  readonly size: number;
}

export type PlatformErrorCode =
  | "cancelled"
  | "unsupported"
  | "invalid-file"
  | "read-failed"
  | "decode-failed"
  | "storage-unavailable"
  | "storage-blocked"
  | "storage-terminated"
  | "save-failed"
  | "export-failed";

export class PlatformError extends Error {
  constructor(
    public readonly code: PlatformErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PlatformError";
  }
}

export interface Persistence {
  saveProject(document: EditorDocumentV1, thumbnail?: Uint8Array): Promise<EditorDocumentV1>;
  loadProject(projectId: string): Promise<EditorDocumentV1 | undefined>;
  listProjects(): Promise<EditorProjectSummary[]>;
  deleteProject(projectId: string): Promise<void>;
  saveRecovery(document: EditorDocumentV1): Promise<void>;
  saveNamedSnapshot(document: EditorDocumentV1, name: string): Promise<void>;
  saveFocusProgress(progress: FocusProgressRecord): Promise<void>;
  loadFocusProgress(projectId: string): Promise<FocusProgressRecord | undefined>;
  loadPaletteSelections(): Promise<PaletteSelections | null>;
  savePaletteSelections(selections: PaletteSelections): Promise<void>;
  clearPaletteSelections(): Promise<void>;
  loadLegacyFocusData(): Promise<LegacyFocusData | undefined>;
  clearLegacyFocusData(): Promise<void>;
}

export interface FileAccess {
  select(intent: FileIntent): Promise<SelectedFileRef | null>;
  readText(file: SelectedFileRef): Promise<string>;
  readBytes(file: SelectedFileRef): Promise<Uint8Array>;
  decodeImage(file: SelectedFileRef): Promise<string>;
}

export type CanvasExportRequest =
  | { kind: "product-png"; scale?: number }
  | { kind: "display-png" }
  | { kind: "production-png"; options: ProductionExportOptions }
  | { kind: "pattern-pdf"; options: ProductionExportOptions };

export interface CanvasExport {
  render(document: EditorDocumentV1, request: CanvasExportRequest): Promise<ArtifactRef>;
}

export interface ArtifactSave {
  create(bytes: Uint8Array, mimeType: string): ArtifactRef;
  save(artifact: ArtifactRef, fileName: string): Promise<void>;
  createPreviewUrl(artifact: ArtifactRef): string;
  release(artifact: ArtifactRef): void;
}

export interface PlatformAdapter {
  persistence: Persistence;
  files: FileAccess;
  canvas: CanvasExport;
  artifacts: ArtifactSave;
}
