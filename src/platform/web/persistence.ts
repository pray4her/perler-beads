import {
  openDB,
  wrap,
  type DBSchema,
  type IDBPDatabase,
  type OpenDBCallbacks,
} from "idb";
import { cloneEditorDocument } from "@/editor/document";
import type { FocusProgressRecord, LegacyFocusData } from "@/editor/focusProgress";
import type { PaletteSelections } from "@/editor/paletteSettings";
import type { EditorDocumentV1, EditorProjectSummary } from "@/editor/types";
import { PlatformError, type Persistence } from "@/platform/contracts";

const PALETTE_KEY = "customPerlerPaletteSelections";
const LEGACY_FOCUS_PIXELS_KEY = "focusMode_pixelData";
const LEGACY_FOCUS_COLOR_SYSTEM_KEY = "focusMode_selectedColorSystem";

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

interface PerlerDatabase extends DBSchema {
  projects: { key: string; value: EditorDocumentV1; indexes: { "by-updated": number } };
  summaries: { key: string; value: EditorProjectSummary; indexes: { "by-updated": number } };
  recoveries: { key: string; value: RecoveryRecord; indexes: { "by-project": string; "by-created": number } };
  snapshots: { key: string; value: SnapshotRecord; indexes: { "by-project": string; "by-created": number } };
  focusProgress: { key: string; value: FocusProgressRecord };
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface WebPersistenceOptions {
  databaseName?: string;
  now?: () => number;
  indexedDB?: IDBFactory;
  keyValueStore?: KeyValueStore;
  openDatabase?: typeof openDB;
}

function storageError(error: unknown): PlatformError {
  return error instanceof PlatformError
    ? error
    : new PlatformError("storage-unavailable", "Web persistence is unavailable", { cause: error });
}

type UpgradeTransaction<Schema extends DBSchema> = Parameters<
  NonNullable<OpenDBCallbacks<Schema>["upgrade"]>
>[3];

function openDatabaseWithFactory<Schema extends DBSchema>(
  factory: IDBFactory,
  name: string,
  version: number,
  callbacks: OpenDBCallbacks<Schema>,
): Promise<IDBPDatabase<Schema>> {
  const request = factory.open(name, version);
  return new Promise((resolve, reject) => {
    request.addEventListener("upgradeneeded", (event) => {
      callbacks.upgrade?.(
        wrap(request.result) as IDBPDatabase<Schema>,
        event.oldVersion,
        event.newVersion,
        wrap(request.transaction!) as unknown as UpgradeTransaction<Schema>,
        event,
      );
    });
    request.addEventListener("blocked", (event) => callbacks.blocked?.(event.oldVersion, event.newVersion, event));
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("success", () => {
      const nativeDatabase = request.result;
      nativeDatabase.addEventListener("versionchange", (event) => {
        callbacks.blocking?.(event.oldVersion, event.newVersion, event);
      });
      nativeDatabase.addEventListener("close", () => callbacks.terminated?.());
      resolve(wrap(nativeDatabase) as IDBPDatabase<Schema>);
    });
  });
}

export function createWebPersistence(options: WebPersistenceOptions = {}): Persistence {
  const databaseName = options.databaseName ?? "perler-editor";
  const now = options.now ?? Date.now;
  let databasePromise: Promise<IDBPDatabase<PerlerDatabase>> | undefined;
  let terminalError: PlatformError | undefined;

  const getKeyValueStore = (): KeyValueStore => {
    if (options.keyValueStore) return options.keyValueStore;
    if (typeof window === "undefined" || !window.localStorage) {
      throw new PlatformError("storage-unavailable", "Web key-value storage is unavailable");
    }
    return window.localStorage;
  };

  const getDatabase = async () => {
    if (terminalError) throw terminalError;
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory && !options.openDatabase) {
      throw new PlatformError("storage-unavailable", "IndexedDB is unavailable");
    }
    if (!databasePromise) {
      let rejectBlocked: ((reason: PlatformError) => void) | undefined;
      const blockedFailure = new Promise<IDBPDatabase<PerlerDatabase>>((_, reject) => {
        rejectBlocked = reject;
      });
      const callbacks: OpenDBCallbacks<PerlerDatabase> = {
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
      blocked() {
        terminalError = new PlatformError("storage-blocked", "IndexedDB upgrade was blocked");
        rejectBlocked?.(terminalError);
      },
      blocking(_currentVersion, _blockedVersion, event) {
        (event.target as IDBDatabase | null)?.close();
        databasePromise = undefined;
      },
      terminated() {
        terminalError = new PlatformError("storage-terminated", "IndexedDB connection terminated unexpectedly");
        databasePromise = undefined;
      },
      };
      const opening = options.openDatabase
        ? options.openDatabase<PerlerDatabase>(databaseName, 1, callbacks)
        : options.indexedDB
          ? openDatabaseWithFactory(options.indexedDB, databaseName, 1, callbacks)
          : openDB<PerlerDatabase>(databaseName, 1, callbacks);
      databasePromise = Promise.race([opening, blockedFailure]);
    }
    try {
      return await databasePromise;
    } catch (error) {
      databasePromise = undefined;
      throw storageError(error);
    }
  };

  const listProjects = async (): Promise<EditorProjectSummary[]> => {
    const database = await getDatabase();
    const summaries = await database.getAllFromIndex("summaries", "by-updated");
    return summaries.sort((left, right) => right.updatedAt - left.updatedAt);
  };

  const deleteProject = async (projectId: string): Promise<void> => {
    const database = await getDatabase();
    const transaction = database.transaction(
      ["projects", "summaries", "recoveries", "snapshots", "focusProgress"],
      "readwrite",
    );
    await Promise.all([
      transaction.objectStore("projects").delete(projectId),
      transaction.objectStore("summaries").delete(projectId),
      transaction.objectStore("focusProgress").delete(projectId),
    ]);
    const recoveries = await transaction.objectStore("recoveries").index("by-project").getAll(projectId);
    const snapshots = await transaction.objectStore("snapshots").index("by-project").getAll(projectId);
    await Promise.all([
      ...recoveries.map((record) => transaction.objectStore("recoveries").delete(record.key)),
      ...snapshots.map((record) => transaction.objectStore("snapshots").delete(record.key)),
    ]);
    await transaction.done;
  };

  const pruneProjects = async (limit: number) => {
    const projects = await listProjects();
    if (projects.length <= limit) return;
    const database = await getDatabase();
    const protectedIds = new Set(await database.getAllKeys("focusProgress"));
    const deletable = projects.filter((project) => !protectedIds.has(project.id));
    const excess = projects.length - limit;
    await Promise.all(deletable.slice(-excess).map((project) => deleteProject(project.id)));
  };

  return {
    async saveProject(document, thumbnail) {
      const database = await getDatabase();
      const saved = cloneEditorDocument(document);
      saved.updatedAt = now();
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
          thumbnail: thumbnail?.slice(),
          saveState: "saved",
        }),
        transaction.done,
      ]);
      await pruneProjects(20);
      return cloneEditorDocument(saved);
    },
    async loadProject(projectId) {
      const database = await getDatabase();
      const document = await database.get("projects", projectId);
      return document ? cloneEditorDocument(document) : undefined;
    },
    listProjects,
    deleteProject,
    async saveRecovery(document) {
      const database = await getDatabase();
      const createdAt = now();
      await database.put("recoveries", {
        key: `${document.id}:${createdAt}`,
        projectId: document.id,
        createdAt,
        document: cloneEditorDocument(document),
      });
      const records = (await database.getAllFromIndex("recoveries", "by-project", document.id))
        .sort((left, right) => right.createdAt - left.createdAt);
      await Promise.all(records.slice(10).map((record) => database.delete("recoveries", record.key)));
    },
    async saveNamedSnapshot(document, name) {
      const database = await getDatabase();
      const createdAt = now();
      await database.put("snapshots", {
        key: `${document.id}:${createdAt}`,
        projectId: document.id,
        name: name.trim() || `快照 ${new Date(createdAt).toLocaleString("zh-CN")}`,
        createdAt,
        document: cloneEditorDocument(document),
      });
      const records = (await database.getAllFromIndex("snapshots", "by-project", document.id))
        .sort((left, right) => right.createdAt - left.createdAt);
      await Promise.all(records.slice(20).map((record) => database.delete("snapshots", record.key)));
    },
    async saveFocusProgress(progress) {
      const database = await getDatabase();
      await database.put("focusProgress", structuredClone(progress));
    },
    async loadFocusProgress(projectId) {
      const database = await getDatabase();
      const progress = await database.get("focusProgress", projectId);
      return progress ? structuredClone(progress) : undefined;
    },
    async loadPaletteSelections() {
      try {
        const storage = getKeyValueStore();
        const value = storage.getItem(PALETTE_KEY);
        if (!value) return null;
        const parsed = JSON.parse(value) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid palette settings");
        return { ...(parsed as PaletteSelections) };
      } catch (error) {
        try {
          getKeyValueStore().removeItem(PALETTE_KEY);
        } catch {
          // Preserve the original storage error.
        }
        throw storageError(error);
      }
    },
    async savePaletteSelections(selections) {
      try {
        getKeyValueStore().setItem(PALETTE_KEY, JSON.stringify(selections));
      } catch (error) {
        throw storageError(error);
      }
    },
    async clearPaletteSelections() {
      try {
        getKeyValueStore().removeItem(PALETTE_KEY);
      } catch (error) {
        throw storageError(error);
      }
    },
    async loadLegacyFocusData(): Promise<LegacyFocusData | undefined> {
      try {
        const storage = getKeyValueStore();
        const pixelData = storage.getItem(LEGACY_FOCUS_PIXELS_KEY);
        if (!pixelData) return undefined;
        return { pixelData, colorSystem: storage.getItem(LEGACY_FOCUS_COLOR_SYSTEM_KEY) };
      } catch (error) {
        throw storageError(error);
      }
    },
    async clearLegacyFocusData() {
      try {
        const storage = getKeyValueStore();
        storage.removeItem(LEGACY_FOCUS_PIXELS_KEY);
        storage.removeItem(LEGACY_FOCUS_COLOR_SYSTEM_KEY);
      } catch (error) {
        throw storageError(error);
      }
    },
  };
}
