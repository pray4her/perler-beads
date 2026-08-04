import type { MetadataRoute } from "next";
import { siteUrl } from "@/i18n/site";

export const dynamic = "force-static";

// 只收录 canonical URL：中文首页为 /，/zh/ 是其副本故不列入
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: `${siteUrl}/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/en/`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/zh/focus/`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/en/focus/`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    // 内容页（ADR 0005：中文先行、扁平顶层 URL，根路径即规范地址）
    {
      url: `${siteUrl}/pattern-tutorial/`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/color-chart/`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/ironing-guide/`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
