import type { Metadata } from "next";
import HomePageClient from "@/components/HomePageClient";
import JsonLd from "@/components/JsonLd";
import { LanguageProvider } from "@/i18n/context";
import { getDictionary } from "@/i18n/getDictionary";
import { buildWebApplicationJsonLd } from "@/i18n/jsonLd";
import { isLanguage, type Language } from "@/i18n/types";

interface LangHomePageProps {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: LangHomePageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLanguage(lang)) return {};
  // absolute：跳过所有上级 title.template，保证 /en/ 标题不串中文后缀
  return { title: { absolute: getDictionary(lang).metadata.home.title } };
}

/** /zh/ 与 /en/ 首页；metadata 由 [lang]/layout 提供（/zh/ canonical 指向 /） */
export default async function LangHomePage({ params }: LangHomePageProps) {
  const { lang } = await params;
  const language = (isLanguage(lang) ? lang : "zh") as Language;
  const t = getDictionary(language);
  return (
    <LanguageProvider lang={language}>
      <JsonLd
        data={buildWebApplicationJsonLd(language, t.metadata.siteName, t.metadata.home.description)}
      />
      <HomePageClient />
    </LanguageProvider>
  );
}
