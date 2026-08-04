import type { Language } from "./types";

/** 站点正式域名，所有绝对 URL（canonical/og/sitemap）都以此为基准 */
export const siteUrl = "https://perlerbeads.pray4her.xyz";

/** 各语言的规范首页路径（含尾斜杠，与 trailingSlash 对齐） */
export function canonicalHomePath(lang: Language): string {
  return lang === "zh" ? "/" : "/en/";
}

export function canonicalFocusPath(lang: Language): string {
  return `/${lang}/focus/`;
}

/** hreflang 互链表：zh 落地根路径，en 落地 /en/ */
export const languageAlternates: Record<string, string> = {
  "zh-CN": "/",
  en: "/en/",
  "x-default": "/",
};
