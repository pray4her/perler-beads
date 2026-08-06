export function createArtifactFileName(projectName: string, suffix: string, fallbackBase: string): string {
  const base = projectName.replace(/[\\/:*?"<>|]/g, "-").trim() || fallbackBase;
  return `${base}-${suffix}`;
}
