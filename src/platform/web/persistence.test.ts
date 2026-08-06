import "fake-indexeddb/auto";

import { openDB, type OpenDBCallbacks } from "idb";
import { describe, expect, it } from "vitest";
import { createEditorDocument } from "@/editor/document";
import { createWebPersistence, type KeyValueStore } from "@/platform/web/persistence";
import type { MappedPixel } from "@/utils/pixelation";

class MapStorage implements KeyValueStore {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const red: MappedPixel = { key: "A1", color: "#ff0000" };

describe("Web persistence adapter", () => {
  it("atomically stores a cloned project and summary, then cascades deletion", async () => {
    const databaseName = `perler-test-${crypto.randomUUID()}`;
    const persistence = createWebPersistence({ databaseName, indexedDB, now: () => 42 });
    const document = createEditorDocument([[red]], "MARD", "Stored");
    await persistence.saveProject(document);
    document.cells[0] = 0;

    const restored = await persistence.loadProject(document.id);
    expect(restored?.cells[0]).toBe(1);
    expect(await persistence.listProjects()).toMatchObject([{ id: document.id, updatedAt: 42 }]);
    await persistence.saveFocusProgress({ projectId: document.id, revision: 0, completedCells: [0], updatedAt: 42 });
    await persistence.deleteProject(document.id);
    expect(await persistence.loadProject(document.id)).toBeUndefined();
    expect(await persistence.loadFocusProgress(document.id)).toBeUndefined();
  });

  it("keeps at most 20 projects while protecting projects with focus progress", async () => {
    const persistence = createWebPersistence({
      databaseName: `perler-prune-${crypto.randomUUID()}`,
      indexedDB,
      now: (() => { let value = 0; return () => ++value; })(),
    });
    const protectedProject = createEditorDocument([[red]], "MARD", "Protected");
    await persistence.saveProject(protectedProject);
    await persistence.saveFocusProgress({ projectId: protectedProject.id, revision: 0, completedCells: [0], updatedAt: 1 });
    for (let index = 0; index < 21; index++) {
      await persistence.saveProject(createEditorDocument([[red]], "MARD", `Project ${index}`));
    }
    const projects = await persistence.listProjects();
    expect(projects).toHaveLength(20);
    expect(projects.some((project) => project.id === protectedProject.id)).toBe(true);
  });

  it("prunes recovery points to 10 and snapshots to 20", async () => {
    const databaseName = `perler-history-${crypto.randomUUID()}`;
    let timestamp = 0;
    const persistence = createWebPersistence({ databaseName, indexedDB, now: () => ++timestamp });
    const document = createEditorDocument([[red]], "MARD", "History");
    for (let index = 0; index < 12; index++) await persistence.saveRecovery(document);
    for (let index = 0; index < 22; index++) await persistence.saveNamedSnapshot(document, `Snapshot ${index}`);
    const database = await openDB(databaseName, 1);
    expect(await database.count("recoveries")).toBe(10);
    expect(await database.count("snapshots")).toBe(20);
    database.close();
  });

  it("stores palette settings and leaves legacy focus data intact until explicitly cleared", async () => {
    const storage = new MapStorage();
    storage.setItem("focusMode_pixelData", "[[null]]");
    storage.setItem("focusMode_selectedColorSystem", "MARD");
    const persistence = createWebPersistence({
      databaseName: `perler-kv-${crypto.randomUUID()}`,
      indexedDB,
      keyValueStore: storage,
    });
    await persistence.savePaletteSelections({ "#FFFFFF": true });
    expect(await persistence.loadPaletteSelections()).toEqual({ "#FFFFFF": true });
    expect(await persistence.loadLegacyFocusData()).toEqual({ pixelData: "[[null]]", colorSystem: "MARD" });
    expect(storage.getItem("focusMode_pixelData")).toBe("[[null]]");
    await persistence.clearLegacyFocusData();
    expect(await persistence.loadLegacyFocusData()).toBeUndefined();
  });

  it("surfaces blocked and terminated database states as coded platform errors", async () => {
    const blockedOpen = ((_name: string, _version?: number, callbacks?: OpenDBCallbacks<unknown>) => {
      callbacks?.blocked?.(1, 2, new IDBVersionChangeEvent("blocked", { oldVersion: 1, newVersion: 2 }));
      return new Promise(() => undefined);
    }) as typeof openDB;
    const blocked = createWebPersistence({ indexedDB, openDatabase: blockedOpen });
    await expect(blocked.listProjects()).rejects.toMatchObject({ code: "storage-blocked" });

    let callbacks: OpenDBCallbacks<unknown> | undefined;
    const databaseName = `perler-terminated-${crypto.randomUUID()}`;
    const capturingOpen = ((name: string, version?: number, next?: OpenDBCallbacks<unknown>) => {
      callbacks = next;
      return openDB(name, version, next);
    }) as typeof openDB;
    const terminated = createWebPersistence({ databaseName, indexedDB, openDatabase: capturingOpen });
    await terminated.listProjects();
    callbacks?.terminated?.();
    await expect(terminated.listProjects()).rejects.toMatchObject({ code: "storage-terminated" });
  });
});
