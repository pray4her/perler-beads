import "client-only";

import type { PlatformAdapter } from "@/platform/contracts";
import { createWebArtifactSave } from "@/platform/web/artifactSave";
import { createWebCanvasExport } from "@/platform/web/canvasExport";
import { createWebFileAccess } from "@/platform/web/fileAccess";
import { createWebPersistence } from "@/platform/web/persistence";

const artifacts = createWebArtifactSave();
const canvas = createWebCanvasExport(artifacts);

export const webPlatform = {
  persistence: createWebPersistence(),
  files: createWebFileAccess(),
  canvas,
  artifacts,
  clipboard: {
    copyDisplay: canvas.copyDisplayToClipboard,
  },
} satisfies PlatformAdapter & {
  files: ReturnType<typeof createWebFileAccess>;
  canvas: ReturnType<typeof createWebCanvasExport>;
  artifacts: typeof artifacts;
  clipboard: { copyDisplay: ReturnType<typeof createWebCanvasExport>["copyDisplayToClipboard"] };
};
