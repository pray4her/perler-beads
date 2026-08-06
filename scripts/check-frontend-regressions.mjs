/**
 * Red-capable feedback loop for known UI regressions after shadcn/Base UI + static export.
 * Exit 0 = green, exit 1 = red.
 *
 * Symptoms asserted:
 * 1. Focus navigation must be language-aware via canonicalFocusPath (i18n routes, trailingSlash-safe).
 * 2. Sheet panels must use controlled open={...}, not bare `open` + unmount (scroll-lock / stuck UI).
 * 3. Export actions must share the new controlled export center (not the legacy dialog path).
 * 4. Pointer movement must stay off React state in the pixel editor hot path.
 * 5. Editor tools, bidirectional history, centered resize, and both export surfaces remain wired.
 * 6. i18n plumbing stays in place (dictionary namespaces, metadataBase, language alternates, 301 redirects).
 * 7. Content pages (ADR 0005) keep routes, canonicals, sitemap entries, screenshots, dictionaries and home links.
 * 8. Focus-mode location aids stay wired: selectedCell crosshair, ref-based hover, full-length fine grid lines,
 *    gated board outlines, and persisted showGridLines/boardInterval settings.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// --- 1) trailingSlash vs focus href (i18n: all focus navigation goes through canonicalFocusPath) ---
const nextConfig = read('next.config.ts');
const homeClient = read('src/components/HomePageClient.tsx');
const trailingSlashOn = /trailingSlash:\s*true/.test(nextConfig);

if (trailingSlashOn) {
  for (const [rel, src] of [
    ['src/components/HomePageClient.tsx', homeClient],
    ['src/components/PixelEditorWorkspace.tsx', read('src/components/PixelEditorWorkspace.tsx')],
    ['src/components/FocusPageClient.tsx', read('src/components/FocusPageClient.tsx')],
  ]) {
    // Raw hard-coded /focus navigation would bypass the language prefix and 404 on Pages.
    if (/(?:location\.href\s*=|replaceState\([^)]*)\s*['"`]\/focus[/'"`?]/.test(src)) {
      failures.push(
        `focus-nav: ${rel} navigates to a hard-coded "/focus..." path; use canonicalFocusPath(lang) from @/i18n/site`,
      );
    }
  }
  if (!/canonicalFocusPath\(lang\)/.test(homeClient)) {
    failures.push('focus-nav: HomePageClient must navigate to focus mode via canonicalFocusPath(lang)');
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
const focusPage = read('src/components/FocusPageClient.tsx');
if (/\{focusState\.showColorPanel\s*&&\s*\(\s*<ColorPanel/.test(focusPage)) {
  failures.push(
    'sheet-mount: FocusPageClient still conditionally mounts ColorPanel; prefer always-mounted open={showColorPanel}',
  );
}
if (/\{focusState\.showSettingsPanel\s*&&\s*\(\s*<SettingsPanel/.test(focusPage)) {
  failures.push(
    'sheet-mount: FocusPageClient still conditionally mounts SettingsPanel; prefer always-mounted open={showSettingsPanel}',
  );
}

// --- 2.5) Focus dual progress modes (color / row) ---
if (!/progressMode:\s*'color'\s*\|\s*'row'/.test(focusPage) || !/focusState\.progressMode === 'row'/.test(focusPage)) {
  failures.push('focus-modes: FocusPageClient must keep both color and row progress modes wired');
}
if (!/<ModeBar/.test(focusPage) || !/<RowStatusBar/.test(focusPage)) {
  failures.push('focus-modes: ModeBar / RowStatusBar must remain mounted in FocusPageClient');
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
// 文案已抽入 i18n 字典，预览开关的守卫落在字典与 chartStyle 接线上
const workspaceDictZh = read('src/i18n/dictionaries/zh/workspace.ts');
if (!/chartStyle/.test(exportCenter) || !/预览制作底稿/.test(workspaceDictZh)) {
  failures.push('export-center: chart style toggle and pre-export preview must stay in the making section');
}
if (!/rasterizePdfText/.test(exportersSrc) || !/drawPdfOverview/.test(exportersSrc) || !/drawPdfFooter/.test(exportersSrc)) {
  failures.push('export-pdf: CJK-safe rasterized text, overview page and page footers must stay in PDF export');
}
if (!/getColorKeyByHex/.test(exportersSrc)) {
  failures.push('export-keys: production sheet must show color-system codes resolved via getColorKeyByHex, not raw HEX palette keys');
}
for (const legacy of ['DownloadSettingsModal', 'imageDownloader', 'onDownloadPattern']) {
  if (exportCenter.includes(legacy) || homeClient.includes(legacy)) {
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
if (!(/cameraX/.test(editor) && /worldX/.test(editor) && /BASE_CELL_SIZE \* nextZoom/.test(editor))) {
  failures.push('editor-touch: two-finger pan+pinch must update camera from midpoint world mapping');
}
if (!/is-mobile-chrome/.test(editor) || !/PixelEditorMobileBottomBar/.test(editor)) {
  failures.push('editor-mobile-shell: mobile chrome bottom bar and shell class must remain wired');
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

// --- 7) i18n plumbing ---
const rootLayout = read('src/app/layout.tsx');
if (!/metadataBase:\s*new URL\(siteUrl\)/.test(rootLayout) || !/languages:\s*languageAlternates/.test(rootLayout)) {
  failures.push('i18n-seo: root layout must keep metadataBase and hreflang language alternates');
}
const langLayout = read('src/app/[lang]/layout.tsx');
if (!/generateStaticParams/.test(langLayout) || !/canonicalHomePath/.test(langLayout)) {
  failures.push('i18n-routes: [lang] layout must stay statically parameterized with per-language canonical');
}
const rootPage = read('src/app/page.tsx');
if (!/<LanguageProvider lang="zh"/.test(rootPage) || !/<HomePageClient/.test(rootPage)) {
  failures.push('i18n-routes: root / must render HomePageClient under the zh LanguageProvider');
}
for (const ns of ['common', 'metadata', 'landing', 'home', 'workspace', 'focus']) {
  for (const lang of ['zh', 'en']) {
    const dict = read(`src/i18n/dictionaries/${lang}/${ns}.ts`);
    if (/_todo/.test(dict)) {
      failures.push(`i18n-dict: ${lang}/${ns}.ts still contains the _todo stub`);
    }
  }
}
// 落地页必须有唯一 h1（SEO 主标题）
const landing = read('src/components/HomeLanding.tsx');
const h1Count = (landing.match(/<h1[\s>]|<motion\.h1[\s>]/g) || []).length;
if (h1Count !== 1) {
  failures.push(`i18n-seo: HomeLanding must contain exactly one h1 (found ${h1Count})`);
}
const redirects = read('public/_redirects');
if (!/^\/focus\/\s+\/zh\/focus\/\s+301$/m.test(redirects)) {
  failures.push('i18n-redirects: public/_redirects must 301 the legacy /focus/ path to /zh/focus/');
}
const robots = read('public/robots.txt');
if (!/^Sitemap:\s*https:\/\/perlerbeads\.pray4her\.xyz\/sitemap\.xml$/m.test(robots)) {
  failures.push('i18n-seo: robots.txt must declare the production sitemap URL');
}

// --- 8) Content pages (ADR 0005: 教程 / 色号对照表 / 熨烫指南) ---
const contentRoutes = [
  ['pattern-tutorial', '/pattern-tutorial/'],
  ['color-chart', '/color-chart/'],
  ['ironing-guide', '/ironing-guide/'],
];
for (const [route, canonicalPath] of contentRoutes) {
  const rel = `src/app/${route}/page.tsx`;
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`content-pages: ${rel} is missing`);
    continue;
  }
  const src = read(rel);
  if (!/alternates:\s*\{[^}]*canonical/.test(src) || !src.includes(`"${canonicalPath}"`)) {
    failures.push(`content-pages: ${rel} must declare alternates canonical for ${canonicalPath}`);
  }
}
const sitemapSrc = read('src/app/sitemap.ts');
for (const [, canonicalPath] of contentRoutes) {
  if (!sitemapSrc.includes(canonicalPath)) {
    failures.push(`content-pages: src/app/sitemap.ts must include ${canonicalPath}`);
  }
}
for (const shot of ['1-upload', '2-prepare', '3-generate', '4-edit', '5-export']) {
  const rel = `public/tutorial/step-${shot}.png`;
  const filePath = path.join(root, rel);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    failures.push(`content-pages: ${rel} is missing or empty`);
  }
}
const zhIndex = read('src/i18n/dictionaries/zh/index.ts');
for (const ns of ['tutorial', 'colorChart', 'ironingGuide', 'contentPages']) {
  const rel = `src/i18n/dictionaries/zh/${ns}.ts`;
  if (!fs.existsSync(path.join(root, rel))) {
    failures.push(`content-pages: ${rel} is missing`);
  }
  if (!new RegExp(`\\b${ns}\\b`).test(zhIndex)) {
    failures.push(`content-pages: zh/index.ts must register the ${ns} namespace`);
  }
}
if (!/id="guides"/.test(landing)) {
  failures.push('content-pages: HomeLanding must keep the #guides section');
}
for (const [, canonicalPath] of contentRoutes) {
  if (!landing.includes(`href="${canonicalPath}"`)) {
    failures.push(`content-pages: HomeLanding must link to ${canonicalPath}`);
  }
}

// --- 8) focus-mode location aids (crosshair / fine grid / board lines) ---
const focusCanvasSrc = read('src/components/FocusCanvas.tsx');
const focusPageSrc = read('src/components/FocusPageClient.tsx');
const projectStorageSrc = read('src/editor/projectStorage.ts');

// FocusCanvas must receive the selected cell and render the crosshair from it
if (!/selectedCell/.test(focusCanvasSrc)) {
  failures.push('focus-location: FocusCanvas must accept selectedCell to render the crosshair highlight');
}
if (!/hoverCellRef/.test(focusCanvasSrc) || /useState<\{\s*row/.test(focusCanvasSrc)) {
  failures.push('focus-location: hover tracking must stay in a ref (hoverCellRef), not React state');
}
// Fine grid lines must be full-length one-pass lines, never per-cell strokeRect
if (!/showGridLines/.test(focusCanvasSrc) || !/moveTo\(coordLeft, y\)/.test(focusCanvasSrc) || !/moveTo\(x, coordTop\)/.test(focusCanvasSrc)) {
  failures.push('focus-location: fine grid lines must be drawn as full-length moveTo/lineTo passes (per-cell strokeRect doubles shared edges)');
}
// Board outlines must be gated on a positive interval
if (!/boardInterval > 0/.test(focusCanvasSrc)) {
  failures.push('focus-location: board outlines must render only when boardInterval > 0');
}
// FocusPageClient must wire the new props through
for (const prop of ['selectedCell=', 'boardInterval=', 'onCellSelect=', 'formatCellLabel=']) {
  if (!focusPageSrc.includes(prop)) {
    failures.push(`focus-location: FocusPageClient must pass ${prop} to FocusCanvas`);
  }
}
// New settings must persist (optional fields for backward compatibility)
if (!/boardInterval\?:\s*number/.test(projectStorageSrc) || !/showGridLines\?:\s*boolean/.test(projectStorageSrc)) {
  failures.push('focus-location: FocusProgressSettings must persist showGridLines and boardInterval as optional fields');
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
