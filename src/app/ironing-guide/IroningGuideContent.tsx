"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useT } from "@/i18n/context";

/**
 * 熨烫指南页正文：hero、引言、按主题分组的手风琴 FAQ 与结尾内链。
 * FAQ 条目直接渲染字典 ironingGuide.groups，与 buildFaqPageJsonLd
 * 使用同一数据源，保证结构化数据与可见内容逐字一致。
 */
export default function IroningGuideContent() {
  const t = useT().ironingGuide;

  return (
    <article className="ironing-article">
      <h1>{t.hero.title}</h1>
      <p className="content-lead">{t.hero.lead}</p>

      <div className="ironing-intro">
        <p>{t.intro.p1}</p>
        <p>
          {t.intro.p2}
          <Link href="/pattern-tutorial/">{t.intro.linkTutorial}</Link>
          {t.intro.p3}
          <Link href="/color-chart/">{t.intro.linkColorChart}</Link>
          {t.intro.p4}
        </p>
      </div>

      {t.groups.map((group) => (
        <section key={group.id} aria-labelledby={`ironing-group-${group.id}`}>
          <h2 id={`ironing-group-${group.id}`}>{group.title}</h2>
          <div className="ironing-faq-list">
            {group.items.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="ironing-closing" aria-labelledby="ironing-closing-title">
        <h2 id="ironing-closing-title">{t.closing.title}</h2>
        <p>{t.closing.body}</p>
        <div className="ironing-closing-links">
          <Link href="/" className="ironing-closing-primary">
            {t.closing.ctaTool}
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link href="/pattern-tutorial/">{t.closing.ctaTutorial}</Link>
        </div>
      </section>
    </article>
  );
}
