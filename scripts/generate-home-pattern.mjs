import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const sourcePath = path.join(projectRoot, "public", "home", "OriginalImage1.png");
const outputPath = path.join(projectRoot, "public", "home", "PatternImage1.png");
const mappingPath = path.join(projectRoot, "src", "app", "colorSystemMapping.json");
const gridSize = 48;
const outputSize = 1024;
const bucketStep = 8;

function hexToRgb(hex) {
  const value = Number.parseInt(hex.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function srgbToLinear(value) {
  const channel = value / 255;
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function rgbToOklab({ r, g, b }) {
  const red = srgbToLinear(r);
  const green = srgbToLinear(g);
  const blue = srgbToLinear(b);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);
  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
  };
}

function colorDistance(left, right) {
  return Math.hypot(left.l - right.l, left.a - right.a, left.b - right.b);
}

function dominantCellColor(data, width, channels, column, row) {
  const startX = Math.floor((column * width) / gridSize);
  const endX = Math.ceil(((column + 1) * width) / gridSize);
  const startY = Math.floor((row * width) / gridSize);
  const endY = Math.ceil(((row + 1) * width) / gridSize);
  const buckets = new Map();

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const offset = (y * width + x) * channels;
      const alpha = channels === 4 ? data[offset + 3] : 255;
      if (alpha < 128) continue;
      const r = Math.round(data[offset] / bucketStep) * bucketStep;
      const g = Math.round(data[offset + 1] / bucketStep) * bucketStep;
      const b = Math.round(data[offset + 2] / bucketStep) * bucketStep;
      const key = `${r},${g},${b}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  let dominant = "255,255,255";
  let count = -1;
  for (const [key, value] of buckets) {
    if (value > count) {
      dominant = key;
      count = value;
    }
  }
  const [r, g, b] = dominant.split(",").map(Number);
  return { r, g, b };
}

function nearestPaletteColor(rgb, palette) {
  const lab = rgbToOklab(rgb);
  let nearest = palette[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const distance = colorDistance(lab, color.lab);
    if (distance < nearestDistance) {
      nearest = color;
      nearestDistance = distance;
    }
  }
  return nearest.hex;
}

function removeTinyIslands(grid) {
  const next = grid.map((row) => [...row]);
  for (let row = 1; row < gridSize - 1; row += 1) {
    for (let column = 1; column < gridSize - 1; column += 1) {
      const color = grid[row][column];
      if (color === null) continue;
      const neighbors = [
        grid[row - 1][column],
        grid[row + 1][column],
        grid[row][column - 1],
        grid[row][column + 1],
      ].filter(Boolean);
      const matching = neighbors.filter((neighbor) => neighbor === color).length;
      if (matching > 0 || neighbors.length < 3) continue;
      const counts = new Map();
      for (const neighbor of neighbors) {
        counts.set(neighbor, (counts.get(neighbor) ?? 0) + 1);
      }
      const replacement = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (replacement) next[row][column] = replacement;
    }
  }
  return next;
}

function clearExternalBackground(sourceGrid, mappedGrid) {
  const cleared = mappedGrid.map((row) => [...row]);
  const visited = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));
  const queue = [];
  const isBackground = ({ r, g, b }) => r >= 240 && g >= 240 && b >= 238;

  for (let index = 0; index < gridSize; index += 1) {
    queue.push([0, index], [gridSize - 1, index], [index, 0], [index, gridSize - 1]);
  }

  while (queue.length > 0) {
    const [row, column] = queue.shift();
    if (row < 0 || row >= gridSize || column < 0 || column >= gridSize || visited[row][column]) continue;
    visited[row][column] = true;
    if (!isBackground(sourceGrid[row][column])) continue;
    cleared[row][column] = null;
    queue.push([row - 1, column], [row + 1, column], [row, column - 1], [row, column + 1]);
  }

  return cleared;
}

function createPatternSvg(grid) {
  const cell = outputSize / gridSize;
  const beadRadius = cell * 0.39;
  const emptyRadius = cell * 0.13;
  const elements = [
    `<rect width="${outputSize}" height="${outputSize}" fill="#ece9e1"/>`,
  ];

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const x = column * cell + cell / 2;
      const y = row * cell + cell / 2;
      const color = grid[row][column];
      if (color === null) {
        elements.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${emptyRadius.toFixed(2)}" fill="#d6d2c8"/>`);
        continue;
      }
      elements.push(
        `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${beadRadius.toFixed(2)}" fill="${color}" stroke="#141413" stroke-opacity="0.22" stroke-width="0.8"/>`,
        `<circle cx="${(x - cell * 0.12).toFixed(2)}" cy="${(y - cell * 0.14).toFixed(2)}" r="${(cell * 0.09).toFixed(2)}" fill="#ffffff" fill-opacity="0.2"/>`,
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${outputSize}" height="${outputSize}" viewBox="0 0 ${outputSize} ${outputSize}">${elements.join("")}</svg>`;
}

const mapping = JSON.parse(await fs.readFile(mappingPath, "utf8"));
const palette = Object.keys(mapping).map((hex) => ({
  hex,
  lab: rgbToOklab(hexToRgb(hex)),
}));
const image = sharp(sourcePath).ensureAlpha();
const metadata = await image.metadata();
if (metadata.width !== metadata.height) {
  throw new Error("The homepage example must remain square so both comparison layers align.");
}
const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
const sourceGrid = Array.from({ length: gridSize }, (_, row) =>
  Array.from({ length: gridSize }, (_, column) => dominantCellColor(data, info.width, info.channels, column, row)),
);
const mappedGrid = sourceGrid.map((row) => row.map((rgb) => nearestPaletteColor(rgb, palette)));
const patternGrid = removeTinyIslands(clearExternalBackground(sourceGrid, mappedGrid));
const svg = createPatternSvg(patternGrid);

await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toFile(outputPath);
console.log(`Generated ${path.relative(projectRoot, outputPath)} at ${outputSize}x${outputSize} from a ${gridSize}x${gridSize} bead grid.`);
