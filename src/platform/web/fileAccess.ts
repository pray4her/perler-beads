import {
  PlatformError,
  type FileAccess,
  type FileIntent,
  type SelectedFileRef,
} from "@/platform/contracts";

const ACCEPT_BY_INTENT: Record<FileIntent, string> = {
  source: "image/jpeg,image/png,image/gif,text/csv,.csv",
  palette: "application/json,.json",
  project: "application/x-perler-project,.perler",
  reference: "image/jpeg,image/png,image/gif",
};

export interface WebFileAccess extends FileAccess {
  wrap(file: File): SelectedFileRef;
  decodeImageBytes(bytes: Uint8Array, mimeType: string): Promise<ImageBitmap>;
}

export function createWebFileAccess(): WebFileAccess {
  const files = new WeakMap<object, File>();

  const wrap = (file: File): SelectedFileRef => {
    const reference = {
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    } as SelectedFileRef;
    files.set(reference, file);
    return reference;
  };

  const unwrap = (reference: SelectedFileRef): File => {
    const file = files.get(reference);
    if (!file) throw new PlatformError("invalid-file", "The selected file reference is no longer valid");
    return file;
  };

  const decodeImageBytes = async (bytes: Uint8Array, mimeType: string): Promise<ImageBitmap> => {
    try {
      return await createImageBitmap(new Blob([bytes as BlobPart], { type: mimeType }));
    } catch (error) {
      throw new PlatformError("decode-failed", "Unable to decode the selected image", { cause: error });
    }
  };

  return {
    wrap,
    async select(intent) {
      if (typeof document === "undefined") {
        throw new PlatformError("unsupported", "File selection requires a browser document");
      }
      return new Promise<SelectedFileRef | null>((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ACCEPT_BY_INTENT[intent];
        input.style.display = "none";
        document.body.appendChild(input);
        let settled = false;
        const finish = (value: SelectedFileRef | null) => {
          if (settled) return;
          settled = true;
          input.remove();
          resolve(value);
        };
        input.addEventListener("change", () => finish(input.files?.[0] ? wrap(input.files[0]) : null), { once: true });
        input.addEventListener("cancel", () => finish(null), { once: true });
        window.addEventListener("focus", () => setTimeout(() => {
          if (!input.files?.length) finish(null);
        }, 0), { once: true });
        input.click();
      });
    },
    async readText(reference) {
      try {
        return await unwrap(reference).text();
      } catch (error) {
        throw new PlatformError("read-failed", "Unable to read the selected file as text", { cause: error });
      }
    },
    async readBytes(reference) {
      try {
        return new Uint8Array(await unwrap(reference).arrayBuffer());
      } catch (error) {
        throw new PlatformError("read-failed", "Unable to read the selected file", { cause: error });
      }
    },
    async decodeImage(reference) {
      const file = unwrap(reference);
      if (file.type === "image/gif") {
        const bitmap = await decodeImageBytes(new Uint8Array(await file.arrayBuffer()), file.type);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
          return canvas.toDataURL("image/png");
        } finally {
          bitmap.close();
        }
      }
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string"
          ? resolve(reader.result)
          : reject(new PlatformError("decode-failed", "Unable to decode the selected image"));
        reader.onerror = () => reject(new PlatformError("decode-failed", "Unable to decode the selected image", {
          cause: reader.error,
        }));
        reader.readAsDataURL(file);
      });
    },
    decodeImageBytes,
  };
}
