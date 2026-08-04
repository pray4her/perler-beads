/**
 * Red-capable feedback loop for known UI regressions after shadcn/Base UI + static export.
 * Exit 0 = green, exit 1 = red.
 *
 * Symptoms asserted:
 * 1. Focus navigation must match next.config trailingSlash (avoid /focus 404 on Pages).
 * 2. Sheet panels must use controlled open={...}, not bare `open` + unmount (scroll-lock / stuck UI).
 * 3. Export actions must share the new controlled export center (not the legacy dialog path).
 * 4. Pointer movement must stay off React state in the pixel editor hot path.
 * 5. Editor tools, bidirectional history, centered resize, and both export surfaces remain wired.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// --- 1) trailingSlash vs focus href ---
const nextConfig = read('next.config.ts');
const page = read('src/app/page.tsx');
const trailingSlashOn = /trailingSlash:\s*true/.test(nextConfig);
const focusHrefs = [...page.matchAll(/location\.href\s*=\s*(['"`])([^'"`]+)\1/g)].map((m) => m[2]);
const focusNavs = focusHrefs.filter((h) => h === '/focus' || h.startsWith('/focus'));

if (trailingSlashOn) {
  for (const href of focusNavs) {
    if (href === '/focus' || (href.startsWith('/focus') && !href.startsWith('/focus/'))) {
      failures.push(
        `focus-nav: trailingSlash=true but page navigates to "${href}" (expected "/focus/" to match static export)`,
      );
    }
  }
  if (focusNavs.length === 0) {
    failures.push('focus-nav: no location.href focus navigation found in page.tsx');
  }
}

// --- 2) Sheet controlled open ---
for (const rel of ['src/components/ColorPanel.tsx', 'src/components/SettingsPanel.tsx']) {
  const src = read(rel);
  // Bare JSX boolean: <Sheet open ...> or <Sheet open>
  if (/<Sheet\s+open(?:\s|>|\/)/.test(src) && !/<Sheet\s+open=\{/.test(src)) {
    failures.push(
      `sheet-open: ${rel} uses bare <Sheet open> (always true while mounted); causes dismiss/unmount race and stuck scroll lock`,
    );
  }
  if (!/open=\{[^}]+\}/.test(src) && /<Sheet[\s>]/.test(src)) {
    failures.push(`sheet-open: ${rel} Sheet is not bound to open={state}`);
  }
}

// Focus page should keep panels mounted and pass isOpen / open state (not only conditional mount)
const focusPage = read('src/app/focus/page.tsx');
if (/\{focusState\.showColorPanel\s*&&\s*\(\s*<ColorPanel/.test(focusPage)) {
  failures.push(
    'sheet-mount: focus/page.tsx still conditionally mounts ColorPanel; prefer always-mounted open={showColorPanel}',
  );
}
if (/\{focusState\.showSettingsPanel\s*&&\s*\(\s*<SettingsPanel/.test(focusPage)) {
  failures.push(
    'sheet-mount: focus/page.tsx still conditionally mounts SettingsPanel; prefer always-mounted open={showSettingsPanel}',
  );
}

// --- 2.5) Focus dual progress modes (color / row) ---
if (!/progressMode:\s*'color'\s*\|\s*'row'/.test(focusPage) || !/focusState\.progressMode === 'row'/.test(focusPage)) {
  failures.push('focus-modes: focus/page.tsx must keep both color and row progress modes wired');
}
if (!/<ModeBar/.test(focusPage) || !/<RowStatusBar/.test(focusPage)) {
  failures.push('focus-modes: ModeBar / RowStatusBar must remain mounted in focus/page.tsx');
}
const focusCanvas = read('src/components/FocusCanvas.tsx');
if (!/progressMode === 'row'/.test(focusCanvas) || !/currentRow/.test(focusCanvas)) {
  failures.push('focus-modes: FocusCanvas lost the row-mode highlight rendering branch');
}
if (!/handleToggleCurrentColorComplete/.test(focusPage) || !/onToggleComplete/.test(focusPage)) {
  failures.push('focus-complete-color: one-tap complete/reset of the current color must stay wired to ColorStatusBar');
}
const projectStorage = read('src/editor/projectStorage.ts');
if (!/settings\?:\s*FocusProgressSettings/.test(projectStorage) || !/timer\?:\s*\{/.test(projectStorage)) {
  failures.push('focus-persist: FocusProgressRecord must keep optional settings/timer fields (progress + settings + timer persistence)');
}

// --- 3) Export center contract ---
const exportCenter = read('src/components/ExportCenter.tsx');
if (!/Sheet\s+open=\{open\}/.test(exportCenter) || !/onOpenChange=\{onOpenChange\}/.test(exportCenter)) {
  failures.push('export-center: ExportCenter must keep Sheet open state controlled by the workspace');
}
for (const kind of ['display-png', 'product-png', 'production-png', 'production-pdf', 'pattern-csv', 'project']) {
  if (!exportCenter.includes(`"${kind}"`)) {
    failures.push(`export-center: missing ${kind} export action`);
  }
}
if (!/buildProductionSheetModel/.test(exportCenter) || !/createPatternCsv/.test(exportCenter)) {
  failures.push('export-center: production and CSV exports must use canonical editor exporters');
}
const exportersSrc = read('src/editor/exporters.ts');
if (/strokeRect\(x, y, cellSize, cellSize\)/.test(exportersSrc)) {
  failures.push('export-grid: production sheet must not stroke per-cell borders (double shared edges); use collapsed fillRect / pdf.line grid lines');
}
if (!/CHART_SYMBOLS/.test(exportersSrc) || !/symbolByKey/.test(exportersSrc)) {
  failures.push('export-symbol: black-and-white symbol chart style must stay wired into production exports');
}
if (!/chartStyle/.test(exportCenter) || !/预览制作底稿/.test(exportCenter)) {
  failures.push('export-center: chart style toggle and pre-export preview must stay in the making section');
}
if (!/rasterizePdfText/.test(exportersSrc) || !/drawPdfOverview/.test(exportersSrc) || !/drawPdfFooter/.test(exportersSrc)) {
  failures.push('export-pdf: CJK-safe rasterized text, overview page and page footers must stay in PDF export');
}
if (!/getColorKeyByHex/.test(exportersSrc)) {
  failures.push('export-keys: production sheet must show color-system codes resolved via getColorKeyByHex, not raw HEX palette keys');
}
for (const legacy of ['DownloadSettingsModal', 'imageDownloader', 'onDownloadPattern']) {
  if (exportCenter.includes(legacy) || page.includes(legacy)) {
    failures.push(`export-center: legacy ${legacy} path is still wired`);
  }
}

// --- 4) Pixel editor hot path ---
const editor = read('src/components/PixelEditorWorkspace.tsx');
if (editor.includes('setCursorCell(')) {
  failures.push('editor-perf: pointer movement writes cursor coordinates into React state');
}
if (!/cursorLabelRef\.current\.textContent/.test(editor)) {
  failures.push('editor-perf: cursor status is not updated through an isolated DOM ref');
}

// --- 5) Editor capability wiring ---
for (const tool of ['move', 'brush', 'eyedropper', 'fill', 'line', 'rectangle', 'select', 'eraser']) {
  if (!new RegExp(`id:\\s*["']${tool}["']`).test(editor)) {
    failures.push(`editor-tools: missing ${tool} tool`);
  }
}
if (
  !(
    (/const undo = useCallback/.test(editor) && /const redo = useCallback/.test(editor)) ||
    (/store\.undo\(\)/.test(editor) && /store\.redo\(\)/.test(editor))
  )
) {
  failures.push('editor-history: undo/redo callbacks are not both present');
}
if (
  !(
    (/resizeGridCentered/.test(editor) && /cropToSelection/.test(editor)) ||
    (/resizeEditorDocument/.test(editor) && /cropEditorDocument/.test(editor))
  )
) {
  failures.push('editor-canvas: centered resize or selection crop is not wired');
}
if (!/ResultPreviewPanel/.test(editor) || !/ExportCenter/.test(editor) || !/setIsExportOpen\(true\)/.test(editor)) {
  failures.push('editor-export: display preview and controlled export center must both remain available');
}
if (!/touchPointersRef/.test(editor) || !/pinchRef/.test(editor)) {
  failures.push('editor-touch: two-pointer pan and zoom gesture state is not wired');
}
if (!/const handlePointerCancel/.test(editor) || /onPointerCancel=\{handlePointerUp\}/.test(editor)) {
  failures.push('editor-pointer-cancel: cancelled gestures must roll back transient drawing instead of committing it');
}

// --- 6) Editor cell borders: collapsed 1px fillRect (not per-cell strokeRect) ---
const drawCellMatch = editor.match(/function drawCell\([\s\S]*?\n\}/);
if (!drawCellMatch) {
  failures.push('editor-borders: drawCell function not found');
} else if (/strokeRect\s*\(/.test(drawCellMatch[0])) {
  failures.push(
    'editor-borders: drawCell uses strokeRect per cell (shared edges look uneven under zoom)',
  );
}
if (!/function drawCellGridLines/.test(editor)) {
  failures.push(
    'editor-borders: missing drawCellGridLines helper (crisp collapsed top+left fillRect grid)',
  );
}
if (!/function drawCellSetOutline/.test(editor) || !/renderPaintStrokeOverlay/.test(editor)) {
  failures.push(
    'editor-paint-stroke: brush/eraser must show a transient continuous outline that clears on pointer up',
  );
}
if (!/paintedKeys/.test(editor)) {
  failures.push('editor-paint-stroke: gesture must track paintedKeys for stroke accent overlay');
}
if (!/function addExposedCellEdges/.test(editor)) {
  failures.push('editor-paint-stroke: trajectory must outline exposed edges instead of boxing every touched cell');
}
if (!/function drawBlankCell/.test(editor) || !/pixel-editor-empty-hint/.test(editor)) {
  failures.push('editor-empty-state: transparent checker cells and blank-canvas guidance must remain visible');
}
if (!/MINOR_GRID_ZOOM/.test(editor) || !/point\.(?:row|col) % 5/.test(editor)) {
  failures.push('editor-semantic-zoom: minor grid and five-cell guide hierarchy is missing');
}

// --- report ---
if (failures.length) {
  console.error('RED — frontend regression checks failed:\n');
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n${failures.length} failure(s)`);
  process.exit(1);
}

console.log('GREEN — frontend regression checks passed');
process.exit(0);
