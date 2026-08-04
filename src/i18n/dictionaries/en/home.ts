import type { home as homeZh } from "../zh/home";

export const home: typeof homeZh = {
  common: {
    undo: "Undo",
    unknownError: "Unknown error",
    unknownFileType: "unknown",
  },
  backgroundRemoval: {
    failure: {
      "empty-grid": "The pattern is empty — there's no background to remove",
      "no-candidate": "No recognizable background found around the edges",
      "low-confidence": "The edges aren't consistent enough — background left unchanged",
      "excessive-removal": "Skipped to avoid removing part of the subject",
    },
    cleanedAuto: (count: string) => `Auto-removed ${count} background cells`,
    cleanedManual: (count: string) => `Removed ${count} background cells`,
    undone: "Background removal undone",
  },
  alerts: {
    unsupportedFileType: (fileType: string, fileName: string) =>
      `Unsupported file type: ${fileType}. Please choose a JPG, PNG, or GIF image, or a CSV data file.\nFile name: ${fileName}`,
    csvImportFailed: (message: string) => `CSV import failed: ${message}`,
    csvImportSuccess: (sourceLabel: string, width: number, height: number, colorCount: number) =>
      `Imported ${sourceLabel} successfully! Pattern size: ${width}x${height}, using ${colorCount} colors.`,
    csvSourceV2: "color-code grid CSV",
    csvSourceLegacy: "legacy HEX CSV",
    csvReadFailed: "Could not read the file",
    gifReadFailed: "Could not read the GIF file.",
    fileReadFailed: "Could not read the file.",
    emptyPalette:
      "Error: the active palette is empty (every color may be excluded), so the image can't be processed. Try restoring some colors.",
    imageLoadFailed: "Could not load the image.",
    excludeNotReady: "Can't exclude this color yet — the initial color data isn't ready. Please wait a moment.",
    excludeNoRemapTarget: (hexKey: string) =>
      `Can't exclude ${hexKey}: every other color originally in the pattern is excluded too. Restore some other colors first.`,
    excludeMissingData: "Can't exclude this color — required data is missing.",
    removeBackgroundNeedsPattern: "Generate a pattern first before using one-click background removal.",
  },
  confirms: {
    excludeColor:
      "Excluding a color applies immediately and rebuilds the editing canvas, clearing your undo history. Continue?",
    applyGenerationParams:
      "Applying will regenerate the pattern and overwrite your current canvas edits. Continue?",
    changeColorSystem:
      "Switching the color system rebuilds the editing canvas and clears your undo history. Continue?",
  },
  generation: {
    canvasNotReady: "The canvas isn't ready yet — please try again",
    emptyPaletteForPattern: "The active palette is empty, so the pattern can't be generated",
    noAvailableColors: "No colors available — restore some excluded colors",
  },
  paletteTransfer: {
    nothingToExport: "No colors selected — nothing to export.",
    invalidFileFormat: "Invalid file format: the file must contain a 'selectedHexValues' array.",
    invalidColorsIgnored: (hexList: string) =>
      `Import finished, but these invalid colors were ignored:\n${hexList}`,
    noValidColors: "The imported file doesn't contain any valid colors.",
    importSuccess: (count: number) => `Imported ${count} ${count === 1 ? "color" : "colors"}!`,
    importFailed: (message: string) => `Import failed: ${message}`,
    readFailed: "Could not read the file.",
  },
  editor: {
    defaultProjectName: "Fuse Bead Project",
    preparing: "Preparing the editor…",
  },
  paramsSheet: {
    title: "Adjust Generation Settings",
    description: "Applying regenerates the pattern with the new settings and overwrites your current canvas edits.",
    granularityLabel: "Horizontal cell count",
    granularityHelp:
      "Splits the image into N equal columns — one bead per cell — with rows calculated automatically from the image's aspect ratio. Higher: sharper outlines and detail, but a larger piece, more beads, and possible stray specks. Lower: easier to build, but the original may become unrecognizable. To control the finished size, check the physical size estimate in the Making panel too.",
    granularityHint:
      "Range 10–300, default 100. The value is the finished width in beads: 60–100 works well for people and pets — larger means finer detail but more beads.",
    similarityLabel: "Color merge threshold",
    similarityHelp:
      "How forgiving the tool is when deciding whether two colors count as the same. Higher: more similar colors merge into one code — fewer bead types to buy and a cleaner picture, though shading and gradient detail may be lost. Lower: keeps more color depth at the cost of more color codes. Outlines and strong contrast are protected automatically. Lower it if colors band noticeably; raise it if there's too much noise.",
    similarityHint:
      "Range 0–100, default 12. Higher uses fewer colors and produces a cleaner pattern; lower preserves more of the original color depth.",
    modeLabel: "Processing mode",
    modeHelp:
      "Cartoon (dominant): each cell takes its most frequent color — clean blocks and crisp edges, great for cartoons, logos, and flat illustrations. Realistic (average): each cell takes the average of all its pixels — softer transitions, better for photos and gradients.",
    modeDominant: "Cartoon (dominant)",
    modeAverage: "Realistic (average)",
    colorSystemLabel: "Color system",
    colorSystemHelp:
      "Pick the color chart that matches your bead brand. The pattern, in-cell codes, and bead counts all use that brand's numbering, so it's easy to buy beads and check stock. Codes aren't interchangeable between brands — regenerate after switching.",
    removeBackground: "Remove background",
    undoRemoveBackground: "Undo background removal",
    excludeColorsTitle: "Remove stray colors",
    excludeColorsHint: "Click a color to exclude or restore it; exclusions take effect after you hit Apply.",
    apply: "Apply & regenerate",
  },
  support: {
    railAriaLabel: "Support the tool's maintainer",
    expand: "Expand support button",
    collapse: "Collapse support button",
    trigger: "Support this free tool",
    dialogTitle: "Support Perler Pattern Maker",
    dialogDescription:
      "If this tool saved you time, you can buy the maintainer a coffee. Support is completely voluntary and doesn't affect any features.",
    wechatQrAlt: "WeChat payment QR code",
    alipayQrAlt: "Alipay payment QR code",
    wechat: "WeChat",
    alipay: "Alipay",
    donationNote:
      "Donations go directly to the tool's maintainer and fund ongoing maintenance, compatibility fixes, and new features.",
  },
  paletteEditor: {
    title: "Palette Manager",
    colorCount: (count: number) => `(${count} ${count === 1 ? "color" : "colors"})`,
    searchPlaceholder: "Search color codes...",
    description:
      "Choose the bead colors to use here. You can start from a preset palette, then add or remove specific codes as needed. When you're done, click \"Save & apply\" at the bottom.",
    selectAll: "Select all",
    selectNone: "Select none",
    importConfig: "Import config",
    exportConfig: "Export config",
    groupTitle: (prefix: string) => prefix,
    otherGroup: "Other",
    cancel: "Cancel",
    saveAndApply: "Save & apply",
  },
  imagePrepare: {
    title: "Prepare Image",
    subtitle: "The whole image is pre-selected — drag the corners or edges to adjust",
    cancelAriaLabel: "Cancel preparing",
    imageAlt: "Original image to prepare",
    generating: "Generating your pattern…",
    generatingHint: "You'll head straight into the editor next",
    aspectAriaLabel: "Crop aspect ratio",
    aspectFree: "Free",
    toolbarAriaLabel: "Image transforms and done",
    rotate: "Rotate",
    flipHorizontal: "Flip H",
    flipVertical: "Flip V",
    reset: "Reset",
    complete: "Done",
    transformFailed: "Couldn't apply the transform — please try again",
    cropTooSmall: "The crop area is too small — drag the frame larger and try again",
    prepareFailed: "Couldn't prepare the image — please try again",
  },
};
