"use client";

import Image from "next/image";
import {
  ArrowRight,
  Check,
  Download,
  Grid3X3,
  LockKeyhole,
  Menu,
  Palette,
  Pencil,
  ShieldCheck,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import InstallPWA from "@/components/InstallPWA";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";

interface HomeLandingProps {
  hasCurrentPattern: boolean;
  isReady: boolean;
  onUpload: () => void;
  onLoadExample: () => void;
  onContinue: () => void;
  onFileDrop: (file: File) => void;
}

interface RevealSectionProps {
  children: ReactNode;
  className: string;
  id?: string;
  labelledBy: string;
}

const acceptedFileTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "text/csv"];
const easeOut = [0.16, 1, 0.3, 1] as const;

function RevealSection({ children, className, id, labelledBy }: RevealSectionProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.section
      id={id}
      className={className}
      aria-labelledby={labelledBy}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18 }}
      transition={{ duration: 0.72, ease: easeOut }}
    >
      {children}
    </motion.section>
  );
}

function HeroPatternDemo({ onFileDrop }: { onFileDrop: (file: File) => void }) {
  const t = useT();
  const comparison = useMotionValue(56);
  const shouldReduceMotion = useReducedMotion();
  const smoothComparison = useSpring(comparison, { stiffness: 420, damping: 42, mass: 0.5 });
  const displayedComparison = shouldReduceMotion ? comparison : smoothComparison;
  const clipPath = useTransform(displayedComparison, (value) => `inset(0 ${100 - value}% 0 0)`);
  const dividerPosition = useTransform(displayedComparison, (value) => `${value}%`);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingFile(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    if (acceptedFileTypes.includes(file.type) || file.type.startsWith("image/") || isCsv) {
      onFileDrop(file);
    }
  };

  return (
    <motion.div
      className={`hero-pattern-demo ${isDraggingFile ? "is-dragging" : ""}`}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 26, rotate: 1.2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 0.82, delay: 0.16, ease: easeOut }}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsDraggingFile(false);
        }
      }}
      onDrop={handleDrop}
    >
      <div className="hero-demo-header">
        <div className="hero-demo-captions" aria-hidden="true">
          <span>{t.landing.hero.demo.originalCaption}</span>
          <span>{t.landing.hero.demo.patternCaption}</span>
        </div>
        <span className="hero-demo-format">PNG</span>
      </div>
      <div className="hero-demo-stage">
        <Image
          src="/home/PatternImage1.png"
          alt={t.landing.hero.demo.patternAlt}
          fill
          priority
          sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1100px) 46vw, 560px"
          className="hero-demo-image"
        />
        <motion.div className="hero-demo-after" style={{ clipPath }}>
          <Image
            src="/home/OriginalImage1.png"
            alt={t.landing.hero.demo.originalAlt}
            fill
            priority
            sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1100px) 46vw, 560px"
            className="hero-demo-image"
          />
        </motion.div>
        <motion.div className="hero-demo-divider" style={{ left: dividerPosition }} aria-hidden="true">
          <span><i /><i /></span>
        </motion.div>
        <input
          type="range"
          min="8"
          max="92"
          defaultValue="56"
          aria-label={t.landing.hero.demo.compareAriaLabel}
          onInput={(event) => comparison.set(Number(event.currentTarget.value))}
        />
      </div>
      <div className="hero-demo-footer">
        <p>{t.landing.hero.demo.footerHint}</p>
        <span aria-hidden="true"><i /><i /><i /></span>
      </div>
    </motion.div>
  );
}

function HomeNavigation({ onUpload, heroRef }: { onUpload: () => void; heroRef: RefObject<HTMLElement | null> }) {
  const t = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    const hero = heroRef.current;
    if (!hero) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { threshold: 0.12 },
    );
    observer.observe(hero);
    return () => observer.disconnect();
  }, [heroRef]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="home-nav-shell">
      <nav className="home-nav" aria-label={t.landing.nav.ariaLabel}>
        <a href="#top" className="home-brand" onClick={closeMenu}>
          <span className="home-brand-mark" aria-hidden="true"><i /></span>
          <span>{t.landing.brand}</span>
        </a>
        <div className={`home-nav-links ${menuOpen ? "is-open" : ""}`}>
          <a href="#how-it-works" onClick={closeMenu}>{t.landing.nav.howItWorks}</a>
          <a href="#workflow" onClick={closeMenu}>{t.landing.nav.workflow}</a>
          <a href="#privacy" onClick={closeMenu}>{t.landing.nav.privacy}</a>
          <a href="#faq" onClick={closeMenu}>{t.landing.nav.faq}</a>
        </div>
        <div className="home-nav-actions">
          <LanguageSwitcher />
          <InstallPWA />
          {!heroVisible ? (
            <Button type="button" size="lg" onClick={onUpload}>
              <Upload aria-hidden="true" />
              {t.landing.nav.uploadImage}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="home-menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? t.landing.nav.closeMenu : t.landing.nav.openMenu}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
      </nav>
    </header>
  );
}

export default function HomeLanding({
  hasCurrentPattern,
  isReady,
  onUpload,
  onLoadExample,
  onContinue,
  onFileDrop,
}: HomeLandingProps) {
  const t = useT();
  const heroRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const backdropY = useTransform(scrollYProgress, [0, 1], [0, 36]);
  const primaryAction = hasCurrentPattern ? onContinue : onUpload;
  const primaryLabel = hasCurrentPattern ? t.landing.hero.continuePattern : t.landing.hero.uploadImage;

  return (
    <div className="home-landing" id="top">
      <HomeNavigation onUpload={onUpload} heroRef={heroRef} />
      <main>
        <section ref={heroRef} className="home-hero" aria-labelledby="home-title">
          <motion.div
            className="home-hero-atmosphere"
            style={{ y: shouldReduceMotion ? 0 : backdropY }}
            aria-hidden="true"
          >
            <span /><span /><span />
          </motion.div>
          <motion.div
            className="home-hero-copy"
            initial={shouldReduceMotion ? false : "hidden"}
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
            }}
          >
            <motion.p className="home-hero-eyebrow" variants={{ hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { duration: 0.62, ease: easeOut } } }}>
              {t.landing.hero.eyebrow}
            </motion.p>
            <motion.h1 id="home-title" variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.72, ease: easeOut } } }}>
              {t.landing.hero.title}
            </motion.h1>
            <motion.p className="home-hero-summary" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.68, ease: easeOut } } }}>
              {t.landing.hero.summary}
            </motion.p>
            <motion.div className="home-hero-actions" variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.62, ease: easeOut } } }}>
              <Button type="button" size="lg" className="home-primary-cta" onClick={primaryAction} disabled={!isReady}>
                {hasCurrentPattern ? <ArrowRight aria-hidden="true" /> : <Upload aria-hidden="true" />}
                {primaryLabel}
              </Button>
              <Button type="button" size="lg" variant="outline" onClick={hasCurrentPattern ? onUpload : onLoadExample} disabled={!isReady}>
                {hasCurrentPattern ? <Upload aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}
                {hasCurrentPattern ? t.landing.hero.uploadImage : t.landing.hero.loadExample}
              </Button>
            </motion.div>
          </motion.div>
          <HeroPatternDemo onFileDrop={onFileDrop} />
        </section>

        <section className="trust-strip" aria-label={t.landing.trust.ariaLabel}>
          <span><LockKeyhole aria-hidden="true" />{t.landing.trust.localProcessing}</span>
          <span><Check aria-hidden="true" />{t.landing.trust.noSignup}</span>
          <span><Check aria-hidden="true" />{t.landing.trust.free}</span>
        </section>

        <RevealSection id="how-it-works" className="home-section process-section" labelledBy="process-title">
          <div className="section-heading">
            <h2 id="process-title">{t.landing.process.title}</h2>
            <p>{t.landing.process.subtitle}</p>
          </div>
          <ol className="process-list">
            <li><Upload aria-hidden="true" /><div><strong>{t.landing.process.step1Title}</strong><span>{t.landing.process.step1Desc}</span></div></li>
            <li><Pencil aria-hidden="true" /><div><strong>{t.landing.process.step2Title}</strong><span>{t.landing.process.step2Desc}</span></div></li>
            <li><Download aria-hidden="true" /><div><strong>{t.landing.process.step3Title}</strong><span>{t.landing.process.step3Desc}</span></div></li>
          </ol>
        </RevealSection>

        <RevealSection className="home-section output-section" labelledBy="output-title">
          <div className="output-artwork">
            <Image
              src="/home/PatternImage1.png"
              alt={t.landing.output.imageAlt}
              fill
              sizes="(max-width: 767px) calc(100vw - 48px), 52vw"
            />
          </div>
          <div className="output-copy">
            <h2 id="output-title">{t.landing.output.title}</h2>
            <p>{t.landing.output.subtitle}</p>
            <div className="output-facts">
              <article><Grid3X3 aria-hidden="true" /><div><strong>{t.landing.output.fact1Title}</strong><span>{t.landing.output.fact1Desc}</span></div></article>
              <article><Palette aria-hidden="true" /><div><strong>{t.landing.output.fact2Title}</strong><span>{t.landing.output.fact2Desc}</span></div></article>
              <article><ShieldCheck aria-hidden="true" /><div><strong>{t.landing.output.fact3Title}</strong><span>{t.landing.output.fact3Desc}</span></div></article>
            </div>
          </div>
        </RevealSection>

        <RevealSection id="workflow" className="home-section workflow-section" labelledBy="workflow-title">
          <div className="workflow-intro">
            <h2 id="workflow-title">{t.landing.workflow.title}</h2>
            <p>{t.landing.workflow.subtitle}</p>
          </div>
          <div className="workflow-steps">
            <article>
              <WandSparkles aria-hidden="true" />
              <div><strong>{t.landing.workflow.generateTitle}</strong><p>{t.landing.workflow.generateDesc}</p></div>
            </article>
            <article>
              <Pencil aria-hidden="true" />
              <div><strong>{t.landing.workflow.editTitle}</strong><p>{t.landing.workflow.editDesc}</p></div>
            </article>
            <article>
              <Grid3X3 aria-hidden="true" />
              <div><strong>{t.landing.workflow.focusTitle}</strong><p>{t.landing.workflow.focusDesc}</p></div>
            </article>
          </div>
          <div className="workflow-palette" role="img" aria-label={t.landing.workflow.paletteAriaLabel}>
            <span style={{ "--swatch": "#161a37" } as React.CSSProperties} />
            <span style={{ "--swatch": "#9f897b" } as React.CSSProperties} />
            <span style={{ "--swatch": "#f4dfe1" } as React.CSSProperties} />
            <span style={{ "--swatch": "#6ac8dc" } as React.CSSProperties} />
            <span style={{ "--swatch": "#c67c8d" } as React.CSSProperties} />
          </div>
        </RevealSection>

        <RevealSection id="privacy" className="home-section privacy-section" labelledBy="privacy-title">
          <div className="privacy-symbol" aria-hidden="true"><LockKeyhole /></div>
          <div className="privacy-copy">
            <h2 id="privacy-title">{t.landing.privacy.title}</h2>
            <p>{t.landing.privacy.subtitle}</p>
            <div className="privacy-facts">
              <span><strong>{t.landing.privacy.localTitle}</strong>{t.landing.privacy.localDesc}</span>
              <span><strong>{t.landing.privacy.palettesTitle}</strong>{t.landing.privacy.palettesDesc}</span>
              <span><strong>{t.landing.privacy.customTitle}</strong>{t.landing.privacy.customDesc}</span>
            </div>
          </div>
        </RevealSection>

        <RevealSection id="faq" className="home-section faq-section" labelledBy="faq-title">
          <div className="faq-heading">
            <h2 id="faq-title">{t.landing.faq.title}</h2>
            <p>{t.landing.faq.subtitle}</p>
          </div>
          <div className="faq-list">
            <details><summary>{t.landing.faq.q1}</summary><p>{t.landing.faq.a1}</p></details>
            <details><summary>{t.landing.faq.q2}</summary><p>{t.landing.faq.a2}</p></details>
            <details><summary>{t.landing.faq.q3}</summary><p>{t.landing.faq.a3}</p></details>
            <details><summary>{t.landing.faq.q4}</summary><p>{t.landing.faq.a4}</p></details>
          </div>
          <div className="home-final-cta">
            <div><strong>{t.landing.faq.finalCtaTitle}</strong><span>{t.landing.faq.finalCtaDesc}</span></div>
            <Button type="button" size="lg" onClick={primaryAction} disabled={!isReady}>
              {hasCurrentPattern ? <ArrowRight aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {primaryLabel}
            </Button>
          </div>
        </RevealSection>
      </main>
      <footer className="home-footer">
        <a href="#top" className="home-brand"><span className="home-brand-mark" aria-hidden="true"><i /></span><span>{t.landing.brand}</span></a>
        <p>{t.landing.footer.tagline}</p>
        <p>{t.landing.footer.copyright(new Date().getFullYear())}</p>
      </footer>
    </div>
  );
}
