"use client";

import Link from "next/link";
import ContentShell from "@/components/content/ContentShell";
import { useT } from "@/i18n/context";

interface MethodBlock {
  title: string;
  suited: string;
  pains: string[];
}

/**
 * 图纸教程页正文（/pattern-tutorial/）。
 * 页面骨架（导航、面包屑、「继续了解」、CTA、页脚）由 ContentShell 提供，
 * 这里只负责 <article>：概念解释、三种画法对比、工具五步流程、读图与下一步。
 */
export default function TutorialPageContent() {
  const t = useT().tutorial;

  const methods: { key: string; block: MethodBlock; recommended: boolean }[] = [
    { key: "handDrawn", block: t.methods.handDrawn, recommended: false },
    { key: "spreadsheet", block: t.methods.spreadsheet, recommended: false },
    { key: "generator", block: t.methods.generator, recommended: true },
  ];

  return (
    <ContentShell current="tutorial">
      <article>
        <header>
          <h1>{t.hero.title}</h1>
          <p className="content-lead">{t.hero.lead}</p>
        </header>

        <section aria-labelledby="tutorial-what-is">
          <h2 id="tutorial-what-is">{t.whatIs.title}</h2>
          <p>{t.whatIs.intro}</p>
          <h3>{t.whatIs.grid.title}</h3>
          <p>{t.whatIs.grid.text}</p>
          <h3>{t.whatIs.codes.title}</h3>
          <p>{t.whatIs.codes.text}</p>
          <h3>{t.whatIs.stats.title}</h3>
          <p>{t.whatIs.stats.text}</p>
          <p>{t.whatIs.outro}</p>
        </section>

        <section aria-labelledby="tutorial-methods">
          <h2 id="tutorial-methods">{t.methods.title}</h2>
          <p>{t.methods.lead}</p>
          <div className="tutorial-methods">
            {methods.map(({ key, block, recommended }) => (
              <div
                key={key}
                className={recommended ? "tutorial-method tutorial-method--recommended" : "tutorial-method"}
              >
                <h3>
                  {block.title}
                  {recommended && <span className="tutorial-method-badge">{t.methods.recommendedBadge}</span>}
                </h3>
                <p>
                  <strong>{t.methods.suitedLabel}</strong>
                  {block.suited}
                </p>
                <strong>{t.methods.painLabel}</strong>
                <ul>
                  {block.pains.map((pain) => (
                    <li key={pain}>{pain}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p>{t.methods.recommendation}</p>
        </section>

        <section aria-labelledby="tutorial-steps">
          <h2 id="tutorial-steps">{t.steps.title}</h2>
          <p>{t.steps.lead}</p>
          <ol className="tutorial-steps">
            {t.steps.list.map((step) => (
              <li key={step.name} className="tutorial-step">
                <h3>{step.name}</h3>
                <p>{step.text}</p>
                <figure className="tutorial-figure">
                  <span className="tutorial-figure-frame">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 静态导出内容页截图，无需 next/image */}
                    <img src={step.image.src} alt={step.image.alt} loading="lazy" decoding="async" />
                  </span>
                  <figcaption>{step.image.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ol>
          <p>{t.steps.note}</p>
        </section>

        <section aria-labelledby="tutorial-reading">
          <h2 id="tutorial-reading">{t.reading.title}</h2>
          <p>{t.reading.intro}</p>
          <p>
            {t.reading.colorChartBefore}
            <Link href="/color-chart/">{t.reading.colorChartLinkText}</Link>
            {t.reading.colorChartAfter}
          </p>
          <p>{t.reading.focusMode}</p>
        </section>

        <section aria-labelledby="tutorial-next">
          <h2 id="tutorial-next">{t.nextSteps.title}</h2>
          <p>
            {t.nextSteps.before}
            <Link href="/ironing-guide/">{t.nextSteps.linkText}</Link>
            {t.nextSteps.after}
          </p>
        </section>
      </article>
    </ContentShell>
  );
}
