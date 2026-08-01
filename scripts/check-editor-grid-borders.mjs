/**
 * Red-capable loop for inconsistent editor cell borders.
 * Exit 0 = green, exit 1 = red.
 *
 * Symptom: drag-paint trajectory cells show uneven black borders because
 * per-cell strokeRect double-paints shared edges (and half-px strokes blur
 * under CSS zoom + image-rendering: pixelated).
 *
 * Assertions:
 * 1. Buffer simulation: shared edges must not accumulate more alpha than unique edges.
 * 2. Source: PixelEditorWorkspace drawCell must not strokeRect each cell; use shared fillRect lines.
 * 3. Active drag feedback must trace only exposed edges, not box every touched cell.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

const CELL = 14;
const COLS = 4;
const ROWS = 3;

function paintAllFourEdges(mark) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL;
      const y = row * CELL;
      // Per-cell strokeRect approximation: every cell owns all four edges.
      // Shared boundaries become two adjacent 1px lines → visually ~2px thick.
      for (let i = 0; i < CELL; i++) {
        mark(x + i, y);
        mark(x + i, y + CELL - 1);
        mark(x, y + i);
        mark(x + CELL - 1, y + i);
      }
    }
  }
}

function paintCollapsedEdges(mark) {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = col * CELL;
      const y = row * CELL;
      for (let i = 0; i < CELL; i++) {
        mark(x + i, y); // top
        mark(x, y + i); // left
      }
      if (col === COLS - 1) {
        for (let i = 0; i < CELL; i++) mark(x + CELL - 1, y + i);
      }
      if (row === ROWS - 1) {
        for (let i = 0; i < CELL; i++) mark(x + i, y + CELL - 1);
      }
    }
  }
}

/** Count consecutive border pixels straddling the shared vertical boundary. */
function sharedBoundaryThickness(paint) {
  const width = COLS * CELL;
  const height = ROWS * CELL;
  const ink = new Uint8Array(width * height);
  paint((x, y) => {
    if (x >= 0 && y >= 0 && x < width && y < height) ink[y * width + x] = 1;
  });

  const midY = Math.floor(CELL / 2);
  let thickness = 0;
  // Scan a window around the shared edge between col0 and col1.
  for (let x = CELL - 2; x <= CELL + 1; x++) {
    if (ink[midY * width + x]) thickness += 1;
  }
  return thickness;
}

const brokenThickness = sharedBoundaryThickness(paintAllFourEdges);
if (brokenThickness < 2) {
  failures.push(
    `sim-baseline: expected per-cell four-edge borders to be >=2px at shared boundary, got ${brokenThickness}`,
  );
}

const fixedThickness = sharedBoundaryThickness(paintCollapsedEdges);
if (fixedThickness !== 1) {
  failures.push(
    `sim-fix: collapsed top+left borders must be exactly 1px at shared boundary, got ${fixedThickness}`,
  );
}

const editorSrc = fs.readFileSync(
  path.join(root, "src/components/PixelEditorWorkspace.tsx"),
  "utf8",
);

if (!/function addExposedCellEdges/.test(editorSrc) || !/function drawCellSetOutline/.test(editorSrc)) {
  failures.push(
    "source: active drag feedback must build one continuous perimeter from exposed cell edges",
  );
}

const drawCellMatch = editorSrc.match(/function drawCell\([\s\S]*?\n\}/);
if (!drawCellMatch) {
  failures.push("source: drawCell function not found in PixelEditorWorkspace.tsx");
} else {
  const body = drawCellMatch[0];
  if (/strokeRect\s*\(/.test(body)) {
    failures.push(
      "source: drawCell still uses strokeRect for cell borders (causes double shared edges + subpixel blur under zoom)",
    );
  }
  if (!/fillRect\s*\([\s\S]*CELL_SIZE\s*,\s*1\s*\)/.test(body) && !/drawCellGridLines/.test(editorSrc)) {
    failures.push(
      "source: expected crisp 1px grid via fillRect (top/left collapsed) or drawCellGridLines helper",
    );
  }
  // Prefer collapsed borders: top+left only pattern (or helper that documents it)
  const hasCollapsedHelper = /drawCellGridLines|collapsed|top \+ left|top\+left/i.test(editorSrc);
  const hasTopLeftFill =
    /fillRect\([^)]*CELL_SIZE,\s*1\s*\)/.test(body) || /fillRect\([^)]*,\s*1,\s*CELL_SIZE\s*\)/.test(body);
  if (!hasCollapsedHelper && !hasTopLeftFill) {
    failures.push(
      "source: missing collapsed 1px fillRect grid lines (draw top+left only to avoid double borders)",
    );
  }
}

if (failures.length > 0) {
  console.error("check-editor-grid-borders: RED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("check-editor-grid-borders: GREEN");
console.log(
  ` shared boundary thickness (four-edge sim)=${brokenThickness}px; (collapsed sim)=${fixedThickness}px`,
);
process.exit(0);
