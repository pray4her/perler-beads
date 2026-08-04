import type { Metadata } from "next";
import FocusPageClient from "@/components/FocusPageClient";
import { LanguageProvider } from "@/i18n/context";
import { getDictionary } from "@/i18n/getDictionary";
import { canonicalFocusPath, siteUrl } from "@/i18n/site";
import { isLanguage, type Language } from "@/i18n/types";

interface LangFocusPageProps {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: LangFocusPageProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLanguage(lang)) return {};
  const meta = getDictionary(lang).metadata;
  const canonical = canonicalFocusPath(lang);
  return {
    title: meta.focus.title,
    description: meta.focus.description,
    alternates: {
      canonical,
      languages: {
        "zh-CN": canonicalFocusPath("zh"),
        en: canonicalFocusPath("en"),
        "x-default": canonicalFocusPath("zh"),
      },
    },
    openGraph: {
      url: `${siteUrl}${canonical}`,
      title: `${meta.focus.title} | ${meta.siteName}`,
      description: meta.focus.description,
    },
  };
}

export default async function LangFocusPage({ params }: LangFocusPageProps) {
  const { lang } = await params;
  const language = (isLanguage(lang) ? lang : "zh") as Language;
  return (
    <LanguageProvider lang={language}>
      <FocusPageClient />
    </LanguageProvider>
  );
}
