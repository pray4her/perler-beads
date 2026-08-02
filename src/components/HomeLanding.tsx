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
import { Button } from "@/components/ui/button";

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
          <span>示例原图</span>
          <span>48 × 48 珠板底稿</span>
        </div>
        <span className="hero-demo-format">PNG</span>
      </div>
      <div className="hero-demo-stage">
        <Image
          src="/home/PatternImage1.png"
          alt="由示例原图生成的 48 × 48 拼豆珠板底稿"
          fill
          priority
          sizes="(max-width: 767px) calc(100vw - 48px), (max-width: 1100px) 46vw, 560px"
          className="hero-demo-image"
        />
        <motion.div className="hero-demo-after" style={{ clipPath }}>
          <Image
            src="/home/OriginalImage1.png"
            alt="戴着小动物发饰的 Q 版人物示例原图"
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
          aria-label="拖动比较示例原图和拼豆珠板底稿"
          onInput={(event) => comparison.set(Number(event.currentTarget.value))}
        />
      </div>
      <div className="hero-demo-footer">
        <p>左右拖动看差异，也可以把图片直接拖到这里</p>
        <span aria-hidden="true"><i /><i /><i /></span>
      </div>
    </motion.div>
  );
}

function HomeNavigation({ onUpload, heroRef }: { onUpload: () => void; heroRef: RefObject<HTMLElement | null> }) {
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
      <nav className="home-nav" aria-label="首页导航">
        <a href="#top" className="home-brand" onClick={closeMenu}>
          <span className="home-brand-mark" aria-hidden="true"><i /></span>
          <span>拼豆底稿生成器</span>
        </a>
        <div className={`home-nav-links ${menuOpen ? "is-open" : ""}`}>
          <a href="#how-it-works" onClick={closeMenu}>如何使用</a>
          <a href="#workflow" onClick={closeMenu}>编辑与制作</a>
          <a href="#privacy" onClick={closeMenu}>隐私与色号</a>
          <a href="#faq" onClick={closeMenu}>常见问题</a>
        </div>
        <div className="home-nav-actions">
          <InstallPWA />
          {!heroVisible ? (
            <Button type="button" size="lg" onClick={onUpload}>
              <Upload aria-hidden="true" />
              上传图片
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            className="home-menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            aria-label={menuOpen ? "关闭导航菜单" : "打开导航菜单"}
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
  const heroRef = useRef<HTMLElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const backdropY = useTransform(scrollYProgress, [0, 1], [0, 36]);
  const primaryAction = hasCurrentPattern ? onContinue : onUpload;
  const primaryLabel = hasCurrentPattern ? "继续当前底稿" : "上传图片";

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
              图片进来，底稿出去
            </motion.p>
            <motion.h1 id="home-title" variants={{ hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0, transition: { duration: 0.72, ease: easeOut } } }}>
              把图片变成能拼的底稿
            </motion.h1>
            <motion.p className="home-hero-summary" variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.68, ease: easeOut } } }}>
              匹配常用色号，精修每一格，再带着清楚的底稿开始制作。
            </motion.p>
            <motion.div className="home-hero-actions" variants={{ hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.62, ease: easeOut } } }}>
              <Button type="button" size="lg" className="home-primary-cta" onClick={primaryAction} disabled={!isReady}>
                {hasCurrentPattern ? <ArrowRight aria-hidden="true" /> : <Upload aria-hidden="true" />}
                {primaryLabel}
              </Button>
              <Button type="button" size="lg" variant="outline" onClick={hasCurrentPattern ? onUpload : onLoadExample} disabled={!isReady}>
                {hasCurrentPattern ? <Upload aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}
                {hasCurrentPattern ? "上传图片" : "载入示例"}
              </Button>
            </motion.div>
          </motion.div>
          <HeroPatternDemo onFileDrop={onFileDrop} />
        </section>

        <section className="trust-strip" aria-label="隐私与使用承诺">
          <span><LockKeyhole aria-hidden="true" />图片仅在本机处理</span>
          <span><Check aria-hidden="true" />无需注册</span>
          <span><Check aria-hidden="true" />免费使用</span>
        </section>

        <RevealSection id="how-it-works" className="home-section process-section" labelledBy="process-title">
          <div className="section-heading">
            <h2 id="process-title">从图片到珠板，只做三件事</h2>
            <p>自动转换处理重复工作，你把判断留给细节和实际制作。</p>
          </div>
          <ol className="process-list">
            <li><Upload aria-hidden="true" /><div><strong>放进一张图片</strong><span>裁好范围和方向，确认后开始生成。</span></div></li>
            <li><Pencil aria-hidden="true" /><div><strong>修到满意为止</strong><span>调整格数、配色和局部细节，色号与用量同步更新。</span></div></li>
            <li><Download aria-hidden="true" /><div><strong>导出或直接制作</strong><span>保存制作底稿，或进入专心模式逐格完成。</span></div></li>
          </ol>
        </RevealSection>

        <RevealSection className="home-section output-section" labelledBy="output-title">
          <div className="output-artwork">
            <Image
              src="/home/PatternImage1.png"
              alt="48 × 48 Q 版人物拼豆珠板底稿示例"
              fill
              sizes="(max-width: 767px) calc(100vw - 48px), 52vw"
            />
          </div>
          <div className="output-copy">
            <h2 id="output-title">生成的不只是像素图</h2>
            <p>底稿围绕真正的备料、查看和拼制过程组织。</p>
            <div className="output-facts">
              <article><Grid3X3 aria-hidden="true" /><div><strong>清楚的制作底稿</strong><span>网格、坐标和格内色号可按需要导出。</span></div></article>
              <article><Palette aria-hidden="true" /><div><strong>色号与用量同步</strong><span>换色或擦除后，统计会跟着当前底稿更新。</span></div></article>
              <article><ShieldCheck aria-hidden="true" /><div><strong>适合继续精修</strong><span>自动结果是起点，不会锁住你的修改空间。</span></div></article>
            </div>
          </div>
        </RevealSection>

        <RevealSection id="workflow" className="home-section workflow-section" labelledBy="workflow-title">
          <div className="workflow-intro">
            <h2 id="workflow-title">先生成，再编辑，最后专心拼</h2>
            <p>三个状态共用同一份底稿，不必在不同工具之间来回搬运。</p>
          </div>
          <div className="workflow-steps">
            <article>
              <WandSparkles aria-hidden="true" />
              <div><strong>生成流程</strong><p>控制横轴格数、颜色合并和处理模式，让轮廓与用色先稳定下来。</p></div>
            </article>
            <article>
              <Pencil aria-hidden="true" />
              <div><strong>编辑工作台</strong><p>用画笔、填充、选区和批量换色精确修改，工具操作可以撤销和重做。</p></div>
            </article>
            <article>
              <Grid3X3 aria-hidden="true" />
              <div><strong>专心模式</strong><p>按区域放大并逐格标记进度，长时间制作也不容易看串行。</p></div>
            </article>
          </div>
          <div className="workflow-palette" role="img" aria-label="示例底稿中的部分颜色">
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
            <h2 id="privacy-title">图片留在你的设备上</h2>
            <p>转换、编辑和制作进度都在浏览器本地完成。无需上传图片，也无需创建账户。</p>
            <div className="privacy-facts">
              <span><strong>本地处理</strong>图片不离开当前设备</span>
              <span><strong>常用色号</strong>MARD、COCO、漫漫、盼盼、咪小窝</span>
              <span><strong>自定义色板</strong>只保留手边真正有的颜色</span>
            </div>
          </div>
        </RevealSection>

        <RevealSection id="faq" className="home-section faq-section" labelledBy="faq-title">
          <div className="faq-heading">
            <h2 id="faq-title">开始前，可能还想知道</h2>
            <p>没有账户、订阅或上传队列，打开就能开始。</p>
          </div>
          <div className="faq-list">
            <details><summary>需要注册或付费吗？</summary><p>不需要。所有功能都可以直接使用，支持创作完全自愿。</p></details>
            <details><summary>我的图片会被上传吗？</summary><p>不会。转换和编辑过程在当前浏览器内完成，图片不会上传到项目服务器。</p></details>
            <details><summary>可以使用自己的色板吗？</summary><p>可以。你可以勾选现有颜色，也可以导入、导出自定义色板配置。</p></details>
            <details><summary>最后能导出什么？</summary><p>可以导出带网格、坐标、格内色号和用量统计的制作底稿，也可以导出 CSV 数据。</p></details>
          </div>
          <div className="home-final-cta">
            <div><strong>下一张底稿，从喜欢的图片开始</strong><span>导入后先整理原图，再慢慢完成细节。</span></div>
            <Button type="button" size="lg" onClick={primaryAction} disabled={!isReady}>
              {hasCurrentPattern ? <ArrowRight aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {primaryLabel}
            </Button>
          </div>
        </RevealSection>
      </main>
      <footer className="home-footer">
        <a href="#top" className="home-brand"><span className="home-brand-mark" aria-hidden="true"><i /></span><span>拼豆底稿生成器</span></a>
        <p>免费使用。图片仅在本机处理。</p>
        <p>&copy; {new Date().getFullYear()} 拼豆底稿生成器</p>
      </footer>
    </div>
  );
}
