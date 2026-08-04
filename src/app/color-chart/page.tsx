import type { Metadata } from "next";
import ColorChartPageContent from "@/components/ColorChartPageContent";
import ContentShell from "@/components/content/ContentShell";
import JsonLd from "@/components/JsonLd";
import { LanguageProvider } from "@/i18n/context";
import { getDictionary } from "@/i18n/getDictionary";
import { buildBreadcrumbJsonLd } from "@/i18n/jsonLd";
import { siteUrl } from "@/i18n/site";
import "./color-chart.css";

const t = getDictionary("zh").colorChart;

// title 为字符串，由根布局 title.template 自动追加站点名
export const metadata: Metadata = {
  title: t.metadata.title,
  description: t.metadata.description,
  alternates: {
    canonical: "/color-chart/",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: `${siteUrl}/color-chart/`,
    title: t.metadata.title,
    description: t.metadata.description,
  },
};

/** 色号对照表页（/color-chart/），仅中文路由，根路径即规范地址（ADR 0005） */
export default function ColorChartPage() {
  return (
    <LanguageProvider lang="zh">
      <JsonLd
        data={buildBreadcrumbJsonLd({
          items: [
            { name: t.breadcrumbHome, url: "/" },
            { name: t.breadcrumb, url: "/color-chart/" },
          ],
        })}
      />
      <ContentShell current="colorChart">
        <ColorChartPageContent />
      </ContentShell>
    </LanguageProvider>
  );
}
