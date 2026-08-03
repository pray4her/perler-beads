import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { cloneEditorDocument } from "@/editor/document";
import type { EditorDocumentV1, EditorProjectSummary } from "@/editor/types";

interface RecoveryRecord {
  key: string;
  projectId: string;
  createdAt: number;
  document: EditorDocumentV1;
}

interface SnapshotRecord {
  key: string;
  projectId: string;
  name: string;
  createdAt: number;
  document: EditorDocumentV1;
}

export interface FocusProgressRecord {
  projectId: string;
  revision: number;
  completedCells: number[];
  updatedAt: number;
  /** 内容哈希（FNV-1a）；旧记录没有该字段，恢复时回退到 revision 校验 */
  contentHash?: string;
}

interface PerlerDatabase extends DBSchema {
  projects: { key: string; value: EditorDocumentV1; indexes: { "by-updated": number } };
  summaries: { key: string; value: EditorProjectSummary; indexes: { "by-updated": number } };
  recoveries: { key: string; value: RecoveryRecord; indexes: { "by-project": string; "by-created": number } };
  snapshots: { key: string; value: SnapshotRecord; indexes: { "by-project": string; "by-created": number } };
  focusProgress: { key: string; value: FocusProgressRecord };
}

let databasePromise: Promise<IDBPDatabase<PerlerDatabase>> | null = null;

function getDatabase() {
  if (typeof indexedDB === "undefined") throw new Error("当前浏览器不支持 IndexedDB");
  databasePromise ??= openDB<PerlerDatabase>("perler-editor", 1, {
    upgrade(database) {
      const projects = database.createObjectStore("projects", { keyPath: "id" });
      projects.createIndex("by-updated", "updatedAt");
      const summaries = database.createObjectStore("summaries", { keyPath: "id" });
      summaries.createIndex("by-updated", "updatedAt");
      const recoveries = database.createObjectStore("recoveries", { keyPath: "key" });
      recoveries.createIndex("by-project", "projectId");
      recoveries.createIndex("by-created", "createdAt");
      const snapshots = database.createObjectStore("snapshots", { keyPath: "key" });
      snapshots.createIndex("by-project", "projectId");
      snapshots.createIndex("by-created", "createdAt");
      database.createObjectStore("focusProgress", { keyPath: "projectId" });
    },
  });
  return databasePromise;
}

export async function saveProject(document: EditorDocumentV1, thumbnail?: Blob) {
  const database = await getDatabase();
  const saved = cloneEditorDocument(document);
  saved.updatedAt = Date.now();
  const transaction = database.transaction(["projects", "summaries"], "readwrite");
  await Promise.all([
    transaction.objectStore("projects").put(saved),
    transaction.objectStore("summaries").put({
      id: saved.id,
      name: saved.name,
      width: saved.width,
      height: saved.height,
      revision: saved.revision,
      updatedAt: saved.updatedAt,
      thumbnail,
      saveState: "saved",
    }),
    transaction.done,
  ]);
  await pruneProjects(20);
  return saved;
}

export async function loadProject(projectId: string) {
  const database = await getDatabase();
  const document = await database.get("projects", projectId);
  return document ? cloneEditorDocument(document) : undefined;
}

export async function listProjects(): Promise<EditorProjectSummary[]> {
  const database = await getDatabase();
  const summaries = await database.getAllFromIndex("summaries", "by-updated");
  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(projectId: string) {
  const database = await getDatabase();
  const transaction = database.transaction(["projects", "summaries", "recoveries", "snapshots", "focusProgress"], "readwrite");
  await Promise.all([
    transaction.objectStore("projects").delete(projectId),
    transaction.objectStore("summaries").delete(projectId),
    transaction.objectStore("focusProgress").delete(projectId),
  ]);
  for (const record of await transaction.objectStore("recoveries").index("by-project").getAll(projectId)) {
    await transaction.objectStore("recoveries").delete(record.key);
  }
  for (const record of await transaction.objectStore("snapshots").index("by-project").getAll(projectId)) {
    await transaction.objectStore("snapshots").delete(record.key);
  }
  await transaction.done;
}

export async function saveRecovery(document: EditorDocumentV1) {
  const database = await getDatabase();
  const createdAt = Date.now();
  await database.put("recoveries", {
    key: `${document.id}:${createdAt}`,
    projectId: document.id,
    createdAt,
    document: cloneEditorDocument(document),
  });
  const records = (await database.getAllFromIndex("recoveries", "by-project", document.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  await Promise.all(records.slice(10).map((record) => database.delete("recoveries", record.key)));
}

export async function saveNamedSnapshot(document: EditorDocumentV1, name: string) {
  const database = await getDatabase();
  const createdAt = Date.now();
  await database.put("snapshots", {
    key: `${document.id}:${createdAt}`,
    projectId: document.id,
    name: name.trim() || `快照 ${new Date(createdAt).toLocaleString("zh-CN")}`,
    createdAt,
    document: cloneEditorDocument(document),
  });
  const records = (await database.getAllFromIndex("snapshots", "by-project", document.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  await Promise.all(records.slice(20).map((record) => database.delete("snapshots", record.key)));
}

export async function saveFocusProgress(progress: FocusProgressRecord) {
  const database = await getDatabase();
  await database.put("focusProgress", progress);
}

export async function loadFocusProgress(projectId: string) {
  const database = await getDatabase();
  return database.get("focusProgress", projectId);
}

/** 项目内容的确定性哈希（FNV-1a，覆盖宽高与 cells），用于专心模式进度与内容匹配 */
export function hashEditorContent(document: Pick<EditorDocumentV1, "cells" | "width" | "height">): string {
  let hash = 0x811c9dc5;
  const mix = (value: number) => {
    hash = Math.imul(hash ^ (value & 0xff), 0x01000193);
    hash = Math.imul(hash ^ ((value >>> 8) & 0xff), 0x01000193);
  };
  mix(document.width);
  mix(document.height);
  for (const cell of document.cells) mix(cell);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

async function pruneProjects(limit: number) {
  const projects = await listProjects();
  if (projects.length <= limit) return;
  // 有专心模式进度的项目不清理，避免删除正在专心模式中打开的项目
  const database = await getDatabase();
  const protectedIds = new Set(await database.getAllKeys("focusProgress"));
  const deletable = projects.filter((project) => !protectedIds.has(project.id));
  const excess = projects.length - limit;
  // projects 按更新时间倒序，取尾部（最旧）的项目删除
  await Promise.all(deletable.slice(-excess).map((project) => deleteProject(project.id)));
}
