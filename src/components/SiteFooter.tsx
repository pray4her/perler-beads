"use client";

import Link from "next/link";
import { useLanguage, useT } from "@/i18n/context";

/**
 * 站点共享页脚：品牌与口号、内容页内链、版权信息。
 * 首页与三个内容页（图纸教程 / 色号对照表 / 熨烫指南）共用；
 * 品牌链接指向规范首页 "/"，便于内容页直接复用。
 */
export default function SiteFooter() {
  const t = useT();
  const { lang } = useLanguage();
  return (
    <footer className="home-footer">
      <div className="home-footer-brand">
        <Link href="/" className="home-brand">
          <span className="home-brand-mark" aria-hidden="true"><i /></span>
          <span>{t.landing.brand}</span>
        </Link>
        <p>{t.landing.footer.tagline}</p>
      </div>
      {lang === "zh" ? (
        <nav className="home-footer-links" aria-label={t.landing.footer.guidesTitle}>
          <span className="home-footer-links-title">{t.landing.footer.guidesTitle}</span>
          <Link href="/pattern-tutorial/">{t.landing.footer.tutorialLink}</Link>
          <Link href="/color-chart/">{t.landing.footer.colorChartLink}</Link>
          <Link href="/ironing-guide/">{t.landing.footer.ironingGuideLink}</Link>
        </nav>
      ) : null}
      <p className="home-footer-copyright">{t.landing.footer.copyright(new Date().getFullYear())}</p>
    </footer>
  );
}
