import { describe, expect, it } from "vitest";
import { createEditorDocument } from "@/editor/document";
import { FakePlatformAdapter } from "@/platform/testing/fakePlatform";
import { migrateLegacyFocusProject, saveByteArtifact, saveEditorCheckpoint, selectTextFile } from "@/editor/platformUseCases";
import type { MappedPixel } from "@/utils/pixelation";

const red: MappedPixel = { key: "A1", color: "#ff0000" };

describe("FakePlatformAdapter", () => {
  it("supports import, project persistence, canvas export, and save through the platform seam", async () => {
    const platform = new FakePlatformAdapter();
    platform.queueFile("source", {
      name: "pattern.csv",
      mimeType: "text/csv",
      bytes: new TextEncoder().encode("grid"),
    });
    expect(await selectTextFile(platform.files, "source")).toBe("grid");

    const document = createEditorDocument([[red]], "MARD", "Fake project");
    await saveEditorCheckpoint(platform.persistence, document);
    const restored = await platform.persistence.loadProject(document.id);
    expect(restored).toEqual(document);
    expect(restored).not.toBe(document);

    const artifact = await platform.canvas.render(document, { kind: "display-png" });
    await platform.artifacts.save(artifact, "fake.png");
    expect(platform.canvasRequests).toHaveLength(1);
    expect(platform.savedArtifacts[0]).toMatchObject({ fileName: "fake.png", mimeType: "image/png" });
    await saveByteArtifact(platform.artifacts, new TextEncoder().encode("backup"), "application/json", "backup.json");
    expect(platform.savedArtifacts[1]?.fileName).toBe("backup.json");
  });

  it("returns null for a cancelled selection", async () => {
    const platform = new FakePlatformAdapter();
    await expect(selectTextFile(platform.files, "reference")).resolves.toBeNull();
  });

  it("migrates legacy focus data once and only clears it after a successful save", async () => {
    const platform = new FakePlatformAdapter();
    platform.setLegacyFocusData({ pixelData: "[]", colorSystem: "MARD" });
    const create = () => createEditorDocument([[red]], "MARD", "Migrated");
    await expect(migrateLegacyFocusProject(platform.persistence, create)).resolves.toMatchObject({ name: "Migrated" });
    await expect(migrateLegacyFocusProject(platform.persistence, create)).resolves.toBeUndefined();

    let cleared = false;
    await expect(migrateLegacyFocusProject({
      loadLegacyFocusData: async () => ({ pixelData: "[]", colorSystem: "MARD" }),
      saveProject: async () => { throw new Error("quota exceeded"); },
      clearLegacyFocusData: async () => { cleared = true; },
    }, create)).rejects.toThrow("quota exceeded");
    expect(cleared).toBe(false);
  });
});
