import { PlatformError, type ArtifactRef, type ArtifactSave } from "@/platform/contracts";

export interface WebArtifactSave extends ArtifactSave {
  createFromBlob(blob: Blob): ArtifactRef;
  createFromDataUrl(dataUrl: string): Promise<ArtifactRef>;
  getBlob(artifact: ArtifactRef): Blob;
  share(artifact: ArtifactRef, fileName: string, title: string): Promise<boolean>;
}

export function createWebArtifactSave(): WebArtifactSave {
  const blobs = new WeakMap<object, Blob>();
  const previewUrls = new WeakMap<object, Set<string>>();

  const createFromBlob = (blob: Blob): ArtifactRef => {
    const artifact = { mimeType: blob.type, size: blob.size } as ArtifactRef;
    blobs.set(artifact, blob);
    return artifact;
  };

  const getBlob = (artifact: ArtifactRef): Blob => {
    const blob = blobs.get(artifact);
    if (!blob) throw new PlatformError("save-failed", "The generated artifact is no longer available");
    return blob;
  };

  return {
    create(bytes, mimeType) {
      return createFromBlob(new Blob([bytes as BlobPart], { type: mimeType }));
    },
    createFromBlob,
    async createFromDataUrl(dataUrl) {
      return createFromBlob(await (await fetch(dataUrl)).blob());
    },
    getBlob,
    async share(artifact, fileName, title) {
      const file = new File([getBlob(artifact)], fileName, { type: artifact.mimeType });
      if (!navigator.canShare?.({ files: [file] })) return false;
      await navigator.share({ files: [file], title });
      return true;
    },
    async save(artifact, fileName) {
      if (typeof document === "undefined") {
        throw new PlatformError("unsupported", "Artifact downloads require a browser document");
      }
      const url = URL.createObjectURL(getBlob(artifact));
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (error) {
        throw new PlatformError("save-failed", "Unable to save the generated artifact", { cause: error });
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
    },
    createPreviewUrl(artifact) {
      const url = URL.createObjectURL(getBlob(artifact));
      const urls = previewUrls.get(artifact) ?? new Set<string>();
      urls.add(url);
      previewUrls.set(artifact, urls);
      return url;
    },
    release(artifact) {
      for (const url of previewUrls.get(artifact) ?? []) URL.revokeObjectURL(url);
      previewUrls.delete(artifact);
      blobs.delete(artifact);
    },
  };
}
