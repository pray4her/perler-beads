"use client";

import Link from "next/link";
import { Search, X, Info, Upload } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import type { Dictionary } from "@/i18n/dictionaries/zh";
import {
  loadFullColorMapping,
  sortColorsByHue,
  type ColorSystem,
} from "@/utils/colorSystemUtils";

type GroupKey = keyof Dictionary["colorChart"]["chart"]["groups"];

interface ChartRow {
  hex: string;
  /** sortColorsByHue 要求的最小形状，与 hex 相同 */
  color: string;
  codes: Record<ColorSystem, string>;
  /** 五家色号的小写拼接，用于一次性搜索匹配 */
  searchIndex: string;
}

interface ChartGroup {
  key: GroupKey;
  rows: ChartRow[];
}

const GROUP_ORDER: GroupKey[] = [
  "red",
  "orange",
  "yellow",
  "yellowGreen",
  "green",
  "cyan",
  "blue",
  "purple",
  "pink",
  "brown",
  "neutral",
];

const BRAND_COLUMNS: { system: ColorSystem; brandKey: keyof Dictionary["colorChart"]["chart"]["brands"] }[] = [
  { system: "MARD", brandKey: "mard" },
  { system: "COCO", brandKey: "coco" },
  { system: "漫漫", brandKey: "manman" },
  { system: "盼盼", brandKey: "panpan" },
  { system: "咪小窝", brandKey: "mixiaowo" },
];

/** 与 colorSystemUtils 内部相同的 hex→HSL 换算；该共享文件不可改动，故在此实现 */
function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/** 色系分桶：低饱和度归入灰白黑；低明度低彩度的橙黄区间归入棕；其余按色相切段 */
function groupKeyFor(hex: string): GroupKey {
  const { h, s, l } = hexToHsl(hex);
  if (s < 20) return "neutral";
  if (h >= 12 && h < 50 && l < 52 && s < 70) return "brown";
  if (h < 12 || h >= 345) return "red";
  if (h < 38) return "orange";
  if (h < 68) return "yellow";
  if (h < 95) return "yellowGreen";
  if (h < 160) return "green";
  if (h < 195) return "cyan";
  if (h < 255) return "blue";
  if (h < 295) return "purple";
  return "pink";
}

/** 映射为纯静态数据，模块加载时构建一次，服务端与客户端渲染结果一致 */
const chartGroups: ChartGroup[] = (() => {
  const byGroup = new Map<GroupKey, ChartRow[]>(GROUP_ORDER.map((key) => [key, []]));
  loadFullColorMapping().forEach((codes, hex) => {
    byGroup.get(groupKeyFor(hex))!.push({
      hex,
      color: hex,
      codes,
      searchIndex: BRAND_COLUMNS.map(({ system }) => codes[system]).join(" ").toLowerCase(),
    });
  });
  return GROUP_ORDER.map((key) => ({
    key,
    rows: sortColorsByHue(byGroup.get(key)!),
  })).filter((group) => group.rows.length > 0);
})();

const totalColors = chartGroups.reduce((sum, group) => sum + group.rows.length, 0);

/**
 * 色号对照表页正文：介绍、可搜索的五家色号对照表（按色系分组）、用法说明与回工具引导。
 * 表格随 SSR 完整渲染，仅搜索过滤在客户端进行，禁用 JS 时内容不缺失。
 */
export default function ColorChartPageContent() {
  const t = useT().colorChart;
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const isFiltering = normalizedQuery.length > 0;

  const visibleGroups = useMemo(() => {
    if (!isFiltering) return chartGroups;
    return chartGroups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => row.searchIndex.includes(normalizedQuery)),
      }))
      .filter((group) => group.rows.length > 0);
  }, [isFiltering, normalizedQuery]);

  const matchedCount = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.rows.length, 0),
    [visibleGroups],
  );

  return (
    <article>
      <header className="cc-hero">
        <h1>{t.hero.title}</h1>
        <p className="content-lead">{t.hero.lead}</p>
        <p className="cc-disclaimer">
          <Info aria-hidden="true" />
          {t.disclaimer}
        </p>
      </header>

      <section aria-labelledby="cc-intro-title">
        <h2 id="cc-intro-title">{t.intro.whatTitle}</h2>
        <p>{t.intro.whatBody1}</p>
        <p>{t.intro.whatBody2}</p>
        <h3>{t.intro.whenTitle}</h3>
        <ul>
          {t.intro.whenItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="cc-chart-title">
        <h2 id="cc-chart-title">{t.chart.sectionTitle}</h2>

        <div className="cc-search-shell">
          <div className="cc-search-row">
            <div className="cc-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t.search.placeholder}
                aria-label={t.search.label}
                autoComplete="off"
                spellCheck={false}
              />
              {query !== "" && (
                <button
                  type="button"
                  className="cc-search-clear"
                  onClick={() => setQuery("")}
                  aria-label={t.search.clear}
                >
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
            <p className="cc-count" aria-live="polite">
              {isFiltering
                ? t.search.countMatched(totalColors, matchedCount)
                : t.search.countAll(totalColors)}
            </p>
          </div>
        </div>

        <p className="cc-search-hint">{t.search.hint}</p>
        <p className="cc-scroll-hint">{t.chart.scrollHint}</p>

        {isFiltering && matchedCount === 0 ? (
          <div className="cc-empty">
            <strong>{t.search.emptyTitle}</strong>
            <p>{t.search.emptyText}</p>
            <button type="button" className="cc-empty-clear" onClick={() => setQuery("")}>
              {t.search.clear}
            </button>
          </div>
        ) : (
          visibleGroups.map((group) => (
            <section className="cc-group" key={group.key} aria-labelledby={`cc-group-${group.key}`}>
              <h3 className="cc-group-title" id={`cc-group-${group.key}`}>
                <span className={`cc-hue-dot cc-dot-${group.key}`} aria-hidden="true" />
                {t.chart.groups[group.key]}
                <span className="cc-group-count">{t.chart.groupCount(group.rows.length)}</span>
              </h3>
              <div
                className="cc-table-scroll"
                role="region"
                aria-label={t.chart.tableAria(t.chart.groups[group.key])}
                tabIndex={0}
              >
                <table className="cc-table">
                  <thead>
                    <tr>
                      <th scope="col">{t.chart.swatchColumn}</th>
                      {BRAND_COLUMNS.map(({ system, brandKey }) => (
                        <th scope="col" key={system}>
                          {t.chart.brands[brandKey]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.hex}>
                        <td>
                          <span
                            className="cc-swatch"
                            style={{ backgroundColor: row.hex }}
                            role="img"
                            aria-label={t.chart.swatchAria}
                          />
                        </td>
                        {BRAND_COLUMNS.map(({ system }) => (
                          <td key={system}>{row.codes[system]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))
        )}
      </section>

      <section aria-labelledby="cc-usage-title">
        <h2 id="cc-usage-title">{t.usage.title}</h2>
        <ol>
          {t.usage.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="cc-tool-title">
        <h2 id="cc-tool-title">{t.toolLink.title}</h2>
        <p>
          {t.toolLink.bodyStart}
          <Link href="/pattern-tutorial/">{t.toolLink.tutorialLink}</Link>
          {t.toolLink.bodyMiddle}
          <Link href="/ironing-guide/">{t.toolLink.ironingLink}</Link>
          {t.toolLink.bodyEnd}
        </p>
        <Button render={<Link href="/" />} size="lg" className="cc-tool-cta">
          <Upload aria-hidden="true" />
          {t.toolLink.cta}
        </Button>
      </section>
    </article>
  );
}
