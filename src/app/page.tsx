import HomePageClient from "@/components/HomePageClient";
import JsonLd from "@/components/JsonLd";
import { LanguageProvider } from "@/i18n/context";
import { getDictionary } from "@/i18n/getDictionary";
import { buildWebApplicationJsonLd } from "@/i18n/jsonLd";

/** 根路径：中文首页（canonical /），metadata 继承根布局 */
export default function Page() {
  const t = getDictionary("zh");
  return (
    <LanguageProvider lang="zh">
      <JsonLd
        data={buildWebApplicationJsonLd("zh", t.metadata.siteName, t.metadata.home.description)}
      />
      <HomePageClient />
    </LanguageProvider>
  );
}
