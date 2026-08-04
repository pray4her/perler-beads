import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import TutorialPageContent from "@/components/TutorialPageContent";
import { LanguageProvider } from "@/i18n/context";
import { getDictionary } from "@/i18n/getDictionary";
import { buildBreadcrumbJsonLd, buildHowToJsonLd } from "@/i18n/jsonLd";
import { siteUrl } from "@/i18n/site";
import "./pattern-tutorial.css";

const t = getDictionary("zh");
const tutorial = t.tutorial;
const canonical = "/pattern-tutorial/";

// 中文独页（ADR 0005）：无 hreflang；title 走根布局模板自动拼站点名
export const metadata: Metadata = {
  title: tutorial.metadata.title,
  description: tutorial.metadata.description,
  alternates: {
    canonical,
  },
  openGraph: {
    type: "article",
    url: `${siteUrl}${canonical}`,
    title: tutorial.metadata.title,
    description: tutorial.metadata.description,
  },
};

export default function PatternTutorialPage() {
  return (
    <LanguageProvider lang="zh">
      <JsonLd
        data={buildBreadcrumbJsonLd({
          items: [
            { name: t.contentPages.nav.home, url: "/" },
            { name: tutorial.breadcrumb, url: canonical },
          ],
        })}
      />
      <JsonLd
        data={buildHowToJsonLd({
          name: tutorial.steps.title,
          description: tutorial.steps.lead,
          url: canonical,
          steps: tutorial.steps.list.map((step) => ({
            name: step.name,
            text: step.text,
            imageUrl: step.image.src,
          })),
        })}
      />
      <TutorialPageContent />
    </LanguageProvider>
  );
}
