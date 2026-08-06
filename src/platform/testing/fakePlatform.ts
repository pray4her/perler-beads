import { cloneEditorDocument } from "@/editor/document";
import type { FocusProgressRecord, LegacyFocusData } from "@/editor/focusProgress";
import type { PaletteSelections } from "@/editor/paletteSettings";
import type { EditorDocumentV1, EditorProjectSummary } from "@/editor/types";
import type {
  ArtifactRef,
  CanvasExportRequest,
  FileIntent,
  PlatformAdapter,
  SelectedFileRef,
} from "@/platform/contracts";

interface FakeFile {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  decodedImage?: string;
}

export interface SavedArtifact {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export class FakePlatformAdapter implements PlatformAdapter {
  private readonly projects = new Map<string, EditorDocumentV1>();
  private readonly summaries = new Map<string, EditorProjectSummary>();
  private readonly focusProgress = new Map<string, FocusProgressRecord>();
  private readonly filesByIntent = new Map<FileIntent, FakeFile[]>();
  private readonly filesByRef = new WeakMap<object, FakeFile>();
  private readonly artifactsByRef = new WeakMap<object, { bytes: Uint8Array; mimeType: string }>();
  private paletteSelections: PaletteSelections | null = null;
  private legacyFocusData: LegacyFocusData | undefined;

  readonly savedArtifacts: SavedArtifact[] = [];
  readonly canvasRequests: Array<{ document: EditorDocumentV1; request: CanvasExportRequest }> = [];

  queueFile(intent: FileIntent, file: FakeFile): void {
    const queue = this.filesByIntent.get(intent) ?? [];
    queue.push({ ...file, bytes: file.bytes.slice() });
    this.filesByIntent.set(intent, queue);
  }

  setLegacyFocusData(data: LegacyFocusData | undefined): void {
    this.legacyFocusData = data ? { ...data } : undefined;
  }

  readonly persistence: PlatformAdapter["persistence"] = {
    saveProject: async (document, thumbnail) => {
      const saved = cloneEditorDocument(document);
      this.projects.set(saved.id, saved);
      this.summaries.set(saved.id, {
        id: saved.id,
        name: saved.name,
        width: saved.width,
        height: saved.height,
        revision: saved.revision,
        updatedAt: saved.updatedAt,
        thumbnail: thumbnail?.slice(),
        saveState: "saved",
      });
      return cloneEditorDocument(saved);
    },
    loadProject: async (projectId) => {
      const document = this.projects.get(projectId);
      return document ? cloneEditorDocument(document) : undefined;
    },
    listProjects: async () => Array.from(this.summaries.values(), (summary) => ({
      ...summary,
      thumbnail: summary.thumbnail?.slice(),
    })).sort((left, right) => right.updatedAt - left.updatedAt),
    deleteProject: async (projectId) => {
      this.projects.delete(projectId);
      this.summaries.delete(projectId);
      this.focusProgress.delete(projectId);
    },
    saveRecovery: async () => undefined,
    saveNamedSnapshot: async () => undefined,
    saveFocusProgress: async (progress) => {
      this.focusProgress.set(progress.projectId, structuredClone(progress));
    },
    loadFocusProgress: async (projectId) => {
      const progress = this.focusProgress.get(projectId);
      return progress ? structuredClone(progress) : undefined;
    },
    loadPaletteSelections: async () => this.paletteSelections ? { ...this.paletteSelections } : null,
    savePaletteSelections: async (selections) => {
      this.paletteSelections = { ...selections };
    },
    clearPaletteSelections: async () => {
      this.paletteSelections = null;
    },
    loadLegacyFocusData: async () => this.legacyFocusData ? { ...this.legacyFocusData } : undefined,
    clearLegacyFocusData: async () => {
      this.legacyFocusData = undefined;
    },
  };

  readonly files: PlatformAdapter["files"] = {
    select: async (intent) => {
      const file = this.filesByIntent.get(intent)?.shift();
      if (!file) return null;
      const reference = {
        name: file.name,
        mimeType: file.mimeType,
        size: file.bytes.byteLength,
      } as SelectedFileRef;
      this.filesByRef.set(reference, file);
      return reference;
    },
    readText: async (reference) => new TextDecoder().decode(this.getFile(reference).bytes),
    readBytes: async (reference) => this.getFile(reference).bytes.slice(),
    decodeImage: async (reference) => this.getFile(reference).decodedImage ?? "data:image/png;base64,",
  };

  readonly artifacts: PlatformAdapter["artifacts"] = {
    create: (bytes, mimeType) => this.createArtifact(bytes, mimeType),
    save: async (artifact, fileName) => {
      const value = this.getArtifact(artifact);
      this.savedArtifacts.push({ fileName, mimeType: value.mimeType, bytes: value.bytes.slice() });
    },
    createPreviewUrl: () => "fake://artifact",
    release: (artifact) => {
      this.artifactsByRef.delete(artifact);
    },
  };

  readonly canvas: PlatformAdapter["canvas"] = {
    render: async (document, request) => {
      this.canvasRequests.push({ document: cloneEditorDocument(document), request: structuredClone(request) });
      return this.createArtifact(new TextEncoder().encode(request.kind), request.kind === "pattern-pdf" ? "application/pdf" : "image/png");
    },
  };

  private getFile(reference: SelectedFileRef): FakeFile {
    const file = this.filesByRef.get(reference);
    if (!file) throw new Error("Unknown fake file reference");
    return file;
  }

  private createArtifact(bytes: Uint8Array, mimeType: string): ArtifactRef {
    const artifact = { mimeType, size: bytes.byteLength } as ArtifactRef;
    this.artifactsByRef.set(artifact, { bytes: bytes.slice(), mimeType });
    return artifact;
  }

  private getArtifact(reference: ArtifactRef) {
    const artifact = this.artifactsByRef.get(reference);
    if (!artifact) throw new Error("Unknown fake artifact reference");
    return artifact;
  }
}
