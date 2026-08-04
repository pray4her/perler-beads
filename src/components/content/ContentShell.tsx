"use client";

import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import type { ReactNode } from "react";
import SiteFooter from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import "@/app/content.css";

export type ContentPageId = "tutorial" | "colorChart" | "ironingGuide";

const pageHrefs: Record<ContentPageId, string> = {
  tutorial: "/pattern-tutorial/",
  colorChart: "/color-chart/",
  ironingGuide: "/ironing-guide/",
};

interface ContentShellProps {
  /** 当前页面标识，用于面包屑、导航 aria-current 与「继续了解」排除自身。 */
  current: ContentPageId;
  children: ReactNode;
}

/**
 * 三个内容页（图纸教程 / 色号对照表 / 熨烫指南）共享的页面骨架：
 * 顶部导航、面包屑、正文插槽、「继续了解」互链区、回工具 CTA 与共享页脚。
 * 样式在 src/app/content.css；各页面特有样式放在各自路由的 css 文件中。
 */
export default function ContentShell({ current, children }: ContentShellProps) {
  const t = useT();
  const otherPages = (Object.keys(pageHrefs) as ContentPageId[]).filter((id) => id !== current);

  return (
    <div className="content-page">
      <header className="content-nav-shell">
        <nav className="content-nav" aria-label={t.contentPages.guidesNavLabel}>
          <Link href="/" className="home-brand">
            <span className="home-brand-mark" aria-hidden="true"><i /></span>
            <span>{t.landing.brand}</span>
          </Link>
          <div className="content-nav-links">
            {(Object.keys(pageHrefs) as ContentPageId[]).map((id) => (
              <Link
                key={id}
                href={pageHrefs[id]}
                aria-current={id === current ? "page" : undefined}
              >
                {t.contentPages.nav[id]}
              </Link>
            ))}
          </div>
          <Button render={<Link href="/" />} size="lg" className="content-nav-cta">
            <Upload aria-hidden="true" />
            {t.contentPages.cta.generate}
          </Button>
        </nav>
      </header>

      <nav className="content-breadcrumb" aria-label={t.contentPages.breadcrumbLabel}>
        <ol>
          <li><Link href="/">{t.contentPages.nav.home}</Link></li>
          <li aria-current="page">{t[current].breadcrumb}</li>
        </ol>
      </nav>

      <main className="content-main">{children}</main>

      <section className="content-related" aria-labelledby="content-related-title">
        <h2 id="content-related-title">{t.contentPages.related.title}</h2>
        <div className="guides-grid">
          {otherPages.map((id) => (
            <Link key={id} className="guide-card" href={pageHrefs[id]}>
              <strong>{t.contentPages.related[id].title}</strong>
              <p>{t.contentPages.related[id].desc}</p>
              <span className="guide-card-cta">
                {t.landing.guides.cardCta}
                <ArrowRight aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="content-cta">
        <div>
          <strong>{t.landing.faq.finalCtaTitle}</strong>
          <span>{t.landing.faq.finalCtaDesc}</span>
        </div>
        <Button render={<Link href="/" />} size="lg">
          <Upload aria-hidden="true" />
          {t.contentPages.cta.generate}
        </Button>
      </section>

      <SiteFooter />
    </div>
  );
}
