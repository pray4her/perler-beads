import { siteUrl } from "@/i18n/site";
import type { Language } from "@/i18n/types";

/** 站内路径转绝对 URL（已带协议的原样返回） */
function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${siteUrl}${path}`;
}

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

interface HowToStepInput {
  name: string;
  text: string;
  imageUrl?: string;
}

interface HowToJsonLdInput {
  name: string;
  description: string;
  steps: HowToStepInput[];
  /** 站内路径（如 /pattern-tutorial/）或绝对 URL */
  url: string;
}

/** HowTo 结构化数据，供图纸教程页使用；步骤文案需与页面可见内容一致 */
export function buildHowToJsonLd({
  name,
  description,
  steps,
  url,
}: HowToJsonLdInput): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    url: absoluteUrl(url),
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.imageUrl ? { image: absoluteUrl(step.imageUrl) } : {}),
    })),
  };
}

interface FaqItemInput {
  question: string;
  /** 纯文本答案，必须与页面可见 HTML 内容一致 */
  answer: string;
}

/** FAQPage 结构化数据，供熨烫指南页使用 */
export function buildFaqPageJsonLd({
  questions,
}: {
  questions: FaqItemInput[];
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

interface BreadcrumbItemInput {
  name: string;
  /** 站内路径（如 /color-chart/）或绝对 URL */
  url: string;
}

/** BreadcrumbList 结构化数据，内容页面包屑（首页 › 当前页） */
export function buildBreadcrumbJsonLd({
  items,
}: {
  items: BreadcrumbItemInput[];
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}
