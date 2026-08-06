import type { EditorDocumentV1 } from "@/editor/types";
import type { LegacyFocusData } from "@/editor/focusProgress";
import type { ArtifactSave, FileAccess, FileIntent, Persistence } from "@/platform/contracts";

export async function selectTextFile(files: FileAccess, intent: FileIntent): Promise<string | null> {
  const selected = await files.select(intent);
  return selected ? files.readText(selected) : null;
}

export async function saveEditorCheckpoint(
  persistence: Pick<Persistence, "saveProject" | "saveRecovery">,
  document: EditorDocumentV1,
): Promise<EditorDocumentV1> {
  const [saved] = await Promise.all([
    persistence.saveProject(document),
    persistence.saveRecovery(document),
  ]);
  return saved;
}

export async function migrateLegacyFocusProject(
  persistence: Pick<Persistence, "loadLegacyFocusData" | "saveProject" | "clearLegacyFocusData">,
  createDocument: (legacy: LegacyFocusData) => EditorDocumentV1,
): Promise<EditorDocumentV1 | undefined> {
  const legacy = await persistence.loadLegacyFocusData();
  if (!legacy) return undefined;
  const saved = await persistence.saveProject(createDocument(legacy));
  await persistence.clearLegacyFocusData();
  return saved;
}

export async function saveByteArtifact(
  artifacts: ArtifactSave,
  bytes: Uint8Array,
  mimeType: string,
  fileName: string,
): Promise<void> {
  const artifact = artifacts.create(bytes, mimeType);
  try {
    await artifacts.save(artifact, fileName);
  } finally {
    artifacts.release(artifact);
  }
}
