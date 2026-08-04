import { siteUrl } from "@/i18n/site";
import type { Language } from "@/i18n/types";

/** WebApplication 结构化数据，帮助搜索引擎理解站点用途 */
export function buildWebApplicationJsonLd(
  lang: Language,
  name: string,
  description: string,
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name,
    description,
    url: lang === "zh" ? `${siteUrl}/` : `${siteUrl}/en/`,
    inLanguage: lang === "zh" ? "zh-CN" : "en",
    applicationCategory: "DesignApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires JavaScript",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };
}
