"use client";

import {
  ArrowRight,
  Check,
  Download,
  Eye,
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
import { useEffect, useRef, useState } from "react";
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

const acceptedFileTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "text/csv"];

function drawSource(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  const scaleX = width / 720;
  const scaleY = height / 540;
  context.save();
  context.scale(scaleX, scaleY);
  const background = context.createLinearGradient(0, 0, 720, 540);
  background.addColorStop(0, "#f4eadc");
  background.addColorStop(1, "#ddd4c5");
  context.fillStyle = background;
  context.fillRect(0, 0, 720, 540);

  context.fillStyle = "#b43e2b";
  context.beginPath();
  context.ellipse(360, 292, 154, 112, 0, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(245, 206, 57, 0, Math.PI * 2);
  context.arc(475, 206, 57, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 32;
  context.lineCap = "round";
  context.strokeStyle = "#b43e2b";
  [[214, 324, 132, 372], [232, 368, 164, 426], [506, 324, 588, 372], [488, 368, 556, 426]].forEach(([x1, y1, x2, y2]) => {
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(x2, y2);
    context.stroke();
  });
  context.fillStyle = "#f3a0a6";
  context.beginPath();
  context.arc(268, 222, 20, 0, Math.PI * 2);
  context.arc(452, 222, 20, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#141413";
  context.beginPath();
  context.arc(292, 276, 13, 0, Math.PI * 2);
  context.arc(428, 276, 13, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "#141413";
  context.lineWidth = 10;
  context.beginPath();
  context.arc(360, 304, 44, 0.16 * Math.PI, 0.84 * Math.PI);
  context.stroke();
  context.restore();
}

function drawPattern(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const columns = 28;
  const rows = 21;
  const cell = canvas.width / columns;
  context.fillStyle = "#eee9df";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const isCrab = (column: number, row: number) => {
    const body = Math.pow((column - 13.5) / 7.2, 2) + Math.pow((row - 11.5) / 4.8, 2) <= 1;
    const leftClaw = Math.pow((column - 7) / 2.5, 2) + Math.pow((row - 7) / 2.3, 2) <= 1;
    const rightClaw = Math.pow((column - 20) / 2.5, 2) + Math.pow((row - 7) / 2.3, 2) <= 1;
    const legs = (row >= 14 && row <= 18) && ((column >= 4 && column <= 9) || (column >= 18 && column <= 23));
    return body || leftClaw || rightClaw || legs;
  };

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (!isCrab(column, row)) continue;
      const eye = row === 10 && (column === 11 || column === 16);
      const cheek = row === 9 && (column === 9 || column === 18);
      context.beginPath();
      context.arc(column * cell + cell / 2, row * cell + cell / 2, cell * 0.39, 0, Math.PI * 2);
      context.fillStyle = eye ? "#141413" : cheek ? "#f3a0a6" : "#b43e2b";
      context.fill();
      context.strokeStyle = "rgba(20,20,19,.22)";
      context.lineWidth = 1;
      context.stroke();
    }
  }
}

function HeroPatternDemo({ onFileDrop }: { onFileDrop: (file: File) => void }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const patternRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (sourceRef.current) drawSource(sourceRef.current);
    if (patternRef.current) drawPattern(patternRef.current);
  }, []);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (!file) return;
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    if (acceptedFileTypes.includes(file.type) || file.type.startsWith("image/") || isCsv) {
      onFileDrop(file);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={`hero-pattern-demo ${isDragging ? "is-dragging" : ""}`}
      onDragEnter={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <div className="hero-demo-captions" aria-hidden="true">
        <span>示例原图</span>
        <span>生成底稿</span>
      </div>
      <div className="hero-demo-stage">
        <canvas ref={sourceRef} width={720} height={540} aria-label="红色螃蟹示例原图" />
        <div className="hero-demo-after">
          <canvas ref={patternRef} width={720} height={540} aria-label="由示例原图生成的拼豆底稿" />
        </div>
        <div className="hero-demo-divider" aria-hidden="true"><span /></div>
        <input
          type="range"
          min="15"
          max="85"
          defaultValue="56"
          aria-label="拖动比较原图和拼豆底稿"
          onInput={(event) => {
            wrapperRef.current?.style.setProperty("--comparison", `${event.currentTarget.value}%`);
          }}
        />
      </div>
      <p className="hero-demo-note">拖动查看转换前后，也可以把图片直接拖到这里</p>
    </div>
  );
}

function HomeNavigation({ onUpload, heroRef }: { onUpload: () => void; heroRef: React.RefObject<HTMLElement | null> }) {
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

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="home-nav-shell">
      <nav className="home-nav" aria-label="首页导航">
        <a href="#top" className="home-brand" onClick={closeMenu}>
          <span className="home-brand-mark" aria-hidden="true" />
          <span>拼豆底稿生成器</span>
        </a>
        <div className={`home-nav-links ${menuOpen ? "is-open" : ""}`}>
          <a href="#how-it-works" onClick={closeMenu}>如何使用</a>
          <a href="#features" onClick={closeMenu}>功能</a>
          <a href="#privacy" onClick={closeMenu}>隐私</a>
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

function OutputGallery() {
  return (
    <section className="home-section output-section" aria-labelledby="output-title">
      <div className="section-heading">
        <h2 id="output-title">从一张图，到可执行的制作方案</h2>
        <p>生成的不只是像素图。色号、用量、坐标与制作进度都围绕实际拼制过程组织。</p>
      </div>
      <div className="output-gallery">
        <article className="output-pattern-card">
          <div className="output-pattern-canvas" role="img" aria-label="带有网格和坐标的拼豆图纸示例">
            {Array.from({ length: 96 }, (_, index) => <i key={index} style={{ "--cell-index": index } as React.CSSProperties} />)}
          </div>
          <div>
            <h3>制作图纸</h3>
            <p>网格、坐标和格内色号一起导出，打印或放大查看都清楚。</p>
          </div>
        </article>
        <article className="output-stats-card">
          <Palette aria-hidden="true" />
          <strong>色号与用量</strong>
          <p>按当前色号系统统计每种颜色和颗数，备料前先看清楚。</p>
          <div className="mini-color-list" aria-hidden="true">
            <span><i style={{ background: "#b43e2b" }} /> R3 <b>146</b></span>
            <span><i style={{ background: "#f3a0a6" }} /> P5 <b>32</b></span>
            <span><i style={{ background: "#141413" }} /> H2 <b>18</b></span>
          </div>
        </article>
        <article className="output-focus-card">
          <Eye aria-hidden="true" />
          <strong>专心制作</strong>
          <p>逐格标记进度，放大当前区域，长时间制作也不容易看串行。</p>
          <div className="focus-row" aria-hidden="true">
            {Array.from({ length: 9 }, (_, index) => <i className={index < 5 ? "is-done" : ""} key={index} />)}
          </div>
        </article>
      </div>
    </section>
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

  const primaryAction = hasCurrentPattern ? onContinue : onUpload;
  const primaryLabel = hasCurrentPattern ? "继续当前底稿" : "上传图片";

  return (
    <div className="home-landing" id="top">
      <HomeNavigation onUpload={onUpload} heroRef={heroRef} />
      <main>
        <section ref={heroRef} className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <h1 id="home-title">把图片变成真正能照着拼的底稿</h1>
            <p>自动匹配常用色号，精修、统计、制作，一次完成。</p>
            <div className="home-hero-actions">
              <Button type="button" size="lg" className="home-primary-cta" onClick={primaryAction} disabled={!isReady}>
                {hasCurrentPattern ? <ArrowRight aria-hidden="true" /> : <Upload aria-hidden="true" />}
                {primaryLabel}
              </Button>
              <Button type="button" size="lg" variant="outline" onClick={hasCurrentPattern ? onUpload : onLoadExample} disabled={!isReady}>
                {hasCurrentPattern ? <Upload aria-hidden="true" /> : <WandSparkles aria-hidden="true" />}
                {hasCurrentPattern ? "上传图片" : "载入示例"}
              </Button>
            </div>
          </div>
          <HeroPatternDemo onFileDrop={onFileDrop} />
        </section>

        <section className="trust-strip" aria-label="隐私与使用承诺">
          <span><LockKeyhole aria-hidden="true" />图片仅在本机处理</span>
          <span><Check aria-hidden="true" />无需注册</span>
          <span><Check aria-hidden="true" />免费使用</span>
        </section>

        <section id="how-it-works" className="home-section process-section" aria-labelledby="process-title">
          <div className="section-heading">
            <h2 id="process-title">三次行动，完成一张底稿</h2>
            <p>先让自动转换完成重复工作，再把判断力留给精修和实际制作。</p>
          </div>
          <ol className="process-list">
            <li><Upload aria-hidden="true" /><strong>上传图片</strong><span>支持常用图片与 CSV 底稿</span></li>
            <li><Pencil aria-hidden="true" /><strong>调整与精修</strong><span>控制格数、配色和局部细节</span></li>
            <li><Download aria-hidden="true" /><strong>导出或制作</strong><span>保存图纸，或进入专心模式</span></li>
          </ol>
        </section>

        <OutputGallery />

        <section id="features" className="home-section generation-section" aria-labelledby="generation-title">
          <div className="generation-copy">
            <WandSparkles aria-hidden="true" />
            <h2 id="generation-title">自动生成先给出可靠起点</h2>
            <p>选择横轴格数、颜色合并阈值和处理模式，系统会把图片映射到当前色板。还可以一键去除大面积背景，再决定哪些颜色需要保留。</p>
          </div>
          <div className="generation-controls" role="group" aria-label="生成参数示意">
            <label>横轴格数 <span>48</span></label>
            <div className="control-scale"><i /></div>
            <label>处理模式 <span>卡通主色</span></label>
            <div className="mode-choice"><b>卡通主色</b><span>真实平均</span></div>
            <p><ShieldCheck aria-hidden="true" />参数改变后在本机重新计算</p>
          </div>
        </section>

        <section className="home-section editor-section" aria-labelledby="editor-title">
          <div className="editor-preview" aria-hidden="true">
            <div className="editor-toolbar-mini">
              <Pencil /><Grid3X3 /><Palette />
            </div>
            <div className="editor-grid-mini">
              {Array.from({ length: 80 }, (_, index) => <i key={index} className={(index + Math.floor(index / 10)) % 5 === 0 ? "is-accent" : ""} />)}
            </div>
            <div className="editor-palette-mini"><i /><i /><i /><i /></div>
          </div>
          <div className="editor-copy">
            <h2 id="editor-title">把自动结果修到你愿意照着拼</h2>
            <p>工作台提供画笔、橡皮、取色、填充、线条、形状、选区和图章，并保留撤销、重做、批量换色与画布调整。</p>
            <ul>
              <li><Check aria-hidden="true" />精确到每一格</li>
              <li><Check aria-hidden="true" />实时更新色号与颗数</li>
              <li><Check aria-hidden="true" />项目保存在当前设备</li>
            </ul>
          </div>
        </section>

        <section className="home-section focus-section" aria-labelledby="focus-title">
          <div>
            <h2 id="focus-title">从看图，切换到专心制作</h2>
            <p>完成精修后进入专心模式。按区域放大、逐格确认进度，适合需要几小时完成的大图。</p>
          </div>
          <div className="focus-board" role="img" aria-label="专心制作进度示意">
            <span>当前区域 6 × 6</span>
            <div>{Array.from({ length: 36 }, (_, index) => <i className={index < 21 ? "is-complete" : ""} key={index} />)}</div>
            <strong>21 / 36 已完成</strong>
          </div>
        </section>

        <section className="home-section color-systems-section" aria-labelledby="colors-title">
          <h2 id="colors-title">常用色号，直接匹配</h2>
          <p>内置 MARD、COCO、漫漫、盼盼、咪小窝色号系统，也能建立只包含手边库存的自定义色板。</p>
          <div role="group" aria-label="支持的色号系统"><span>MARD</span><span>COCO</span><span>漫漫</span><span>盼盼</span><span>咪小窝</span><span>自定义色板</span></div>
        </section>

        <section id="privacy" className="home-section privacy-section" aria-labelledby="privacy-title">
          <div className="privacy-symbol" aria-hidden="true"><LockKeyhole /></div>
          <div>
            <h2 id="privacy-title">图片留在你的设备上</h2>
            <p>图片转换、底稿编辑和制作进度都在浏览器本地完成。无需上传到服务器，也无需创建账户。</p>
            <div className="privacy-facts">
              <span><strong>本机处理</strong>图片不离开当前设备</span>
              <span><strong>本地保存</strong>项目与进度由浏览器管理</span>
              <span><strong>不做追踪</strong>首页不接入访问统计脚本</span>
            </div>
          </div>
        </section>

        <section id="faq" className="home-section faq-section" aria-labelledby="faq-title">
          <h2 id="faq-title">常见问题</h2>
          <div>
            <details><summary>需要注册或付费吗？</summary><p>不需要。所有功能都可以直接使用，支持维护完全自愿。</p></details>
            <details><summary>我的图片会被上传吗？</summary><p>不会。转换和编辑过程在当前浏览器内完成，图片不会上传到项目服务器。</p></details>
            <details><summary>可以使用自己的色板吗？</summary><p>可以。你可以勾选现有颜色，也可以导入、导出自定义色板配置。</p></details>
            <details><summary>最后能导出什么？</summary><p>可以导出带网格、坐标、格内色号和用量统计的图纸，也可以导出 CSV 数据。</p></details>
          </div>
        </section>

        <section className="home-final-cta" aria-labelledby="final-cta-title">
          <h2 id="final-cta-title">下一张底稿，从这里开始</h2>
          <p>先载入一张图片，剩下的判断可以慢慢完成。</p>
          <Button type="button" size="lg" onClick={primaryAction} disabled={!isReady}>
            {hasCurrentPattern ? <ArrowRight aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {primaryLabel}
          </Button>
        </section>
      </main>
      <footer className="home-footer">
        <a href="#top" className="home-brand"><span className="home-brand-mark" aria-hidden="true" /><span>拼豆底稿生成器</span></a>
        <p>免费使用。图片仅在本机处理。</p>
        <p>&copy; {new Date().getFullYear()} 拼豆底稿生成器</p>
      </footer>
    </div>
  );
}
