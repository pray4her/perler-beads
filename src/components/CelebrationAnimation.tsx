import React, { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/context';

interface CelebrationAnimationProps {
  isVisible: boolean;
  /** color = 单色完成（全屏粒子 + 中央卡片）；row = 单行完成（顶部紧凑胶囊） */
  variant: 'color' | 'row';
  /** 刚完成的豆色，粒子以其为主色 */
  accentColor?: string;
  /** 逐行变体的文案（如"第 5 行完成"） */
  rowLabel?: string;
  onComplete: () => void;
}

interface Bead {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  scale: number;
  opacity: number;
  color: string;
}

/** 主题中性色，与刚完成的豆色搭配 */
const NEUTRAL_COLORS = ['#141413', '#5c5a52', '#d4d1c7'];

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
    <path d="M3 8.5l3.2 3.2L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CelebrationAnimation: React.FC<CelebrationAnimationProps> = ({
  isVisible,
  variant,
  accentColor,
  rowLabel,
  onComplete
}) => {
  const t = useT();
  const [beads, setBeads] = useState<Bead[]>([]);
  // 保持最新的 onComplete，避免父组件回调变化导致动画中途重启
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isVisible) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 豆子方块粒子：以刚完成的豆色为主，主题中性色点缀
    const palette = accentColor
      ? [accentColor, accentColor, accentColor, ...NEUTRAL_COLORS]
      : NEUTRAL_COLORS;
    const count = reducedMotion ? 0 : variant === 'color' ? 36 : 14;

    const newBeads: Bead[] = [];
    for (let i = 0; i < count; i++) {
      const isFromLeft = Math.random() < 0.5;
      newBeads.push({
        id: Date.now() + i,
        x: isFromLeft ? -20 : window.innerWidth + 20,
        y: Math.random() * window.innerHeight * 0.4 + window.innerHeight * 0.1,
        vx: (isFromLeft ? 1 : -1) * (Math.random() * 4 + 3),
        vy: Math.random() * 2 - 1,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        scale: Math.random() * 0.4 + 0.6,
        opacity: 1,
        color: palette[Math.floor(Math.random() * palette.length)]
      });
    }
    setBeads(newBeads);

    // 动画循环（带重力）
    let animationId = 0;
    if (count > 0) {
      const animate = () => {
        setBeads(prev => prev.map(bead => ({
          ...bead,
          x: bead.x + bead.vx,
          y: bead.y + bead.vy,
          rotation: bead.rotation + bead.rotationSpeed,
          opacity: Math.max(0, bead.opacity - 0.02),
          vy: bead.vy + 0.1
        })).filter(bead =>
          bead.x > -50 &&
          bead.x < window.innerWidth + 50 &&
          bead.y < window.innerHeight + 50 &&
          bead.opacity > 0
        ));
        animationId = requestAnimationFrame(animate);
      };
      animate();
    }

    const duration = reducedMotion ? 600 : variant === 'color' ? 1400 : 900;
    const timer = setTimeout(() => {
      setBeads([]);
      onCompleteRef.current();
    }, duration);

    return () => {
      cancelAnimationFrame(animationId);
      clearTimeout(timer);
    };
  }, [isVisible, variant, accentColor]);

  if (!isVisible) return null;

  return (
    // 点击任意处跳过
    <div className="fixed inset-0 z-50 cursor-pointer" onClick={() => onCompleteRef.current()}>
      {/* 豆子方块粒子 */}
      {beads.map(bead => (
        <div
          key={bead.id}
          className="absolute rounded-[2px]"
          style={{
            left: `${bead.x}px`,
            top: `${bead.y}px`,
            width: '8px',
            height: '8px',
            backgroundColor: bead.color,
            transform: `rotate(${bead.rotation}deg) scale(${bead.scale})`,
            opacity: bead.opacity
          }}
        />
      ))}

      {variant === 'color' ? (
        /* 单色完成：中央主题卡片 */
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="bg-card text-card-foreground border border-border rounded-lg shadow-lg px-6 py-4 text-center">
            <div className="mx-auto mb-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <CheckIcon className="h-4 w-4" />
            </div>
            <div className="text-lg font-semibold">{t.focus.celebration.title}</div>
            <div className="text-sm text-muted-foreground mt-1">{t.focus.celebration.subtitle}</div>
          </div>
        </div>
      ) : (
        /* 单行完成：顶部紧凑胶囊，不挡画布中心 */
        <div className="absolute top-16 left-1/2 -translate-x-1/2">
          <div className="bg-card text-card-foreground border border-border rounded-full px-4 py-1.5 text-sm shadow-md flex items-center gap-1.5">
            <CheckIcon className="h-3.5 w-3.5" />
            {rowLabel}
          </div>
        </div>
      )}
    </div>
  );
};

export default CelebrationAnimation;
