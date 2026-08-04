import type { Metadata } from "next";
import ContentShell from "@/components/content/ContentShell";
import JsonLd from "@/components/JsonLd";
import { LanguageProvider } from "@/i18n/context";
import { getDictionary } from "@/i18n/getDictionary";
import { buildBreadcrumbJsonLd, buildFaqPageJsonLd } from "@/i18n/jsonLd";
import IroningGuideContent from "./IroningGuideContent";
import "./ironing-guide.css";

const t = getDictionary("zh");

export const metadata: Metadata = {
  title: t.ironingGuide.metadata.title,
  description: t.ironingGuide.metadata.description,
  alternates: {
    canonical: "/ironing-guide/",
  },
  openGraph: {
    type: "article",
    url: "/ironing-guide/",
    title: t.ironingGuide.metadata.title,
    description: t.ironingGuide.metadata.description,
  },
};

/** 熨烫指南页（/ironing-guide/）：ADR 0005 内容页，仅中文路由，根路径即规范地址 */
export default function IroningGuidePage() {
  const faqQuestions = t.ironingGuide.groups.flatMap((group) =>
    group.items.map((item) => ({ question: item.q, answer: item.a })),
  );

  return (
    <LanguageProvider lang="zh">
      <JsonLd
        data={buildBreadcrumbJsonLd({
          items: [
            { name: t.ironingGuide.breadcrumbHome, url: "/" },
            { name: t.ironingGuide.breadcrumb, url: "/ironing-guide/" },
          ],
        })}
      />
      <JsonLd data={buildFaqPageJsonLd({ questions: faqQuestions })} />
      <ContentShell current="ironingGuide">
        <IroningGuideContent />
      </ContentShell>
    </LanguageProvider>
  );
}
