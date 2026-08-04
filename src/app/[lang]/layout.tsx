import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HtmlLangSync from "@/components/HtmlLangSync";
import { getDictionary } from "@/i18n/getDictionary";
import { canonicalHomePath, languageAlternates, siteUrl } from "@/i18n/site";
import { isLanguage, languages, type Language } from "@/i18n/types";

export function generateStaticParams() {
  return languages.map((lang) => ({ lang }));
}

interface LangLayoutProps {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: LangLayoutProps): Promise<Metadata> {
  const { lang } = await params;
  if (!isLanguage(lang)) return {};
  const meta = getDictionary(lang).metadata;
  const canonical = canonicalHomePath(lang);
  return {
    applicationName: meta.siteName,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: meta.shortName,
    },
    title: {
      // 首页实际标题由 [lang]/page 用 title.absolute 设置（避免根布局模板串语言）
      default: meta.home.title,
      template: `%s | ${meta.siteName}`,
    },
    description: meta.home.description,
    keywords: meta.home.keywords,
    alternates: {
      canonical,
      languages: languageAlternates,
    },
    openGraph: {
      type: "website",
      locale: lang === "zh" ? "zh_CN" : "en_US",
      siteName: meta.siteName,
      url: `${siteUrl}${canonical}`,
      title: meta.home.ogTitle,
      description: meta.home.ogDescription,
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: meta.siteName,
      description: meta.home.ogDescription,
      images: ["/og-image.png"],
    },
  };
}

export default async function LangLayout({ children, params }: LangLayoutProps) {
  const { lang } = await params;
  if (!isLanguage(lang)) notFound();
  return (
    <>
      <HtmlLangSync lang={lang as Language} />
      {children}
    </>
  );
}
