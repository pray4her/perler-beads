import {
  copyDisplayToClipboard,
  exportPatternPdf,
  renderDisplayPng,
  renderProductPng,
  renderProductionPng,
} from "@/platform/web/renderers";
import type { EditorDocumentV1 } from "@/editor/types";
import { PlatformError, type CanvasExport } from "@/platform/contracts";
import type { WebArtifactSave } from "@/platform/web/artifactSave";

export interface WebCanvasExport extends CanvasExport {
  copyDisplayToClipboard(document: EditorDocumentV1): Promise<void>;
}

export function createWebCanvasExport(artifacts: WebArtifactSave): WebCanvasExport {
  return {
    async render(document, request) {
      try {
        const blob = request.kind === "product-png"
          ? await renderProductPng(document, { scale: request.scale })
          : request.kind === "display-png"
            ? await renderDisplayPng(document)
            : request.kind === "production-png"
              ? await renderProductionPng(document, request.options)
              : await exportPatternPdf(document, request.options);
        return artifacts.createFromBlob(blob);
      } catch (error) {
        throw new PlatformError("export-failed", "Unable to render the requested artifact", { cause: error });
      }
    },
    copyDisplayToClipboard,
  };
}
