import type { EditorPaletteEntry } from "@/editor/types";

export interface ColorMetrics {
  hue: number;
  saturation: number;
  lightness: number;
  lab: [number, number, number];
}

const cache = new Map<string, ColorMetrics>();

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function getColorMetrics(hex: string): ColorMetrics {
  const normalized = hex.toUpperCase();
  const cached = cache.get(normalized);
  if (cached) return cached;
  const value = normalized.replace("#", "");
  const r255 = parseInt(value.slice(0, 2), 16);
  const g255 = parseInt(value.slice(2, 4), 16);
  const b255 = parseInt(value.slice(4, 6), 16);
  const r = r255 / 255;
  const g = g255 / 255;
  const b = b255 / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const difference = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  if (difference) {
    if (max === r) hue = ((g - b) / difference + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / difference + 2) * 60;
    else hue = ((r - g) / difference + 4) * 60;
  }
  const saturation = difference === 0 ? 0 : difference / (1 - Math.abs(2 * lightness - 1));
  const linearR = channel(r255);
  const linearG = channel(g255);
  const linearB = channel(b255);
  const l = Math.cbrt(0.4122214708 * linearR + 0.5363325363 * linearG + 0.0514459929 * linearB);
  const m = Math.cbrt(0.2119034982 * linearR + 0.6806995451 * linearG + 0.1073969566 * linearB);
  const s = Math.cbrt(0.0883024619 * linearR + 0.2817188376 * linearG + 0.6301695737 * linearB);
  const metrics: ColorMetrics = {
    hue,
    saturation: saturation * 100,
    lightness: lightness * 100,
    lab: [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ],
  };
  cache.set(normalized, metrics);
  return metrics;
}

export function oklabDistance(left: string, right: string) {
  const a = getColorMetrics(left).lab;
  const b = getColorMetrics(right).lab;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function uniquePaletteEntries(entries: EditorPaletteEntry[]) {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const identity = `${entry.key}:${entry.color.toUpperCase()}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
