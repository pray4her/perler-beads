import { cloneEditorDocument } from "@/editor/document";
import { EDITOR_DOCUMENT_VERSION, MAX_CANVAS_SIZE, type EditorDocumentV1 } from "@/editor/types";

const MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const ALLOWED_PATHS = new Set([
  "manifest.json",
  "cells.bin",
  "baseline.bin",
  "reference.bin",
  "thumbnail.webp",
  "stamps.json",
]);

interface ArchiveManifest {
  format: "perler-project";
  version: 1;
  document: Omit<EditorDocumentV1, "cells" | "baseline" | "reference" | "stamps"> & {
    reference?: Omit<NonNullable<EditorDocumentV1["reference"]>, "blob">;
  };
}

function uint16ToBytes(values: Uint16Array) {
  return new Uint8Array(values.buffer.slice(values.byteOffset, values.byteOffset + values.byteLength));
}

function bytesToUint16(bytes: Uint8Array) {
  if (bytes.byteLength % 2 !== 0) throw new Error("项目单元数据长度无效");
  const copy = bytes.slice();
  return new Uint16Array(copy.buffer);
}

export async function exportPerlerProject(document: EditorDocumentV1, thumbnail?: Blob): Promise<Blob> {
  const { zip } = await import("fflate");
  const encoder = new TextEncoder();
  const source = cloneEditorDocument(document);
  const referenceMetadata = source.reference
    ? {
        fileName: source.reference.fileName,
        mimeType: source.reference.mimeType,
        opacity: source.reference.opacity,
        mode: source.reference.mode,
      }
    : undefined;
  const manifest: ArchiveManifest = {
    format: "perler-project",
    version: EDITOR_DOCUMENT_VERSION,
    document: {
      ...source,
      reference: referenceMetadata,
    },
  };
  const entries: Record<string, Uint8Array> = {
    "manifest.json": encoder.encode(JSON.stringify(manifest)),
    "cells.bin": uint16ToBytes(source.cells),
    "stamps.json": encoder.encode(JSON.stringify(source.stamps.map((stamp) => ({ ...stamp, cells: Array.from(stamp.cells) })))),
  };
  if (source.baseline) entries["baseline.bin"] = uint16ToBytes(source.baseline);
  if (source.reference?.blob) entries["reference.bin"] = new Uint8Array(await source.reference.blob.arrayBuffer());
  if (thumbnail) entries["thumbnail.webp"] = new Uint8Array(await thumbnail.arrayBuffer());
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 6 }, (error, data) => error ? reject(error) : resolve(data));
  });
  return new Blob([bytes as BlobPart], { type: "application/x-perler-project" });
}

export async function importPerlerProject(file: Blob): Promise<EditorDocumentV1> {
  const { unzip } = await import("fflate");
  const compressed = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
    unzip(compressed, (error, data) => error ? reject(error) : resolve(data));
  });
  let totalBytes = 0;
  for (const [path, value] of Object.entries(entries)) {
    if (!ALLOWED_PATHS.has(path) || path.includes("..") || path.startsWith("/") || path.includes("\\")) {
      throw new Error(`项目包含不允许的文件：${path}`);
    }
    totalBytes += value.byteLength;
  }
  if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new Error("项目解压后超过 64MB 限制");
  if (!entries["manifest.json"] || !entries["cells.bin"]) throw new Error("项目缺少必要文件");
  const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"])) as ArchiveManifest;
  if (manifest.format !== "perler-project" || manifest.version !== EDITOR_DOCUMENT_VERSION) {
    throw new Error("不支持的项目版本");
  }
  const metadata = manifest.document;
  if (
    !Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) ||
    metadata.width < 1 || metadata.height < 1 ||
    metadata.width > MAX_CANVAS_SIZE || metadata.height > MAX_CANVAS_SIZE
  ) throw new Error("项目画布尺寸无效");
  if (!Array.isArray(metadata.palette) || metadata.palette.length < 1 || metadata.palette.length > 65_535) {
    throw new Error("项目色板无效");
  }
  const cells = bytesToUint16(entries["cells.bin"]);
  if (cells.length !== metadata.width * metadata.height) throw new Error("项目单元数量与尺寸不匹配");
  for (const value of cells) if (value >= metadata.palette.length) throw new Error("项目包含无效色板索引");
  const stampsData = entries["stamps.json"]
    ? JSON.parse(new TextDecoder().decode(entries["stamps.json"])) as Array<{ id: string; name: string; width: number; height: number; cells: number[] }>
    : [];
  const referenceBlob = entries["reference.bin"]
    ? new Blob([entries["reference.bin"] as BlobPart], { type: metadata.reference?.mimeType || "application/octet-stream" })
    : undefined;
  return {
    ...metadata,
    version: EDITOR_DOCUMENT_VERSION,
    cells,
    baseline: entries["baseline.bin"] ? bytesToUint16(entries["baseline.bin"]) : undefined,
    reference: metadata.reference ? { ...metadata.reference, blob: referenceBlob } : undefined,
    stamps: stampsData.map((stamp) => ({ ...stamp, cells: Uint16Array.from(stamp.cells) })),
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
