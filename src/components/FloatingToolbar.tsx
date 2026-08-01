'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Palette, Search, X } from 'lucide-react';

interface FloatingToolbarProps {
  isManualColoringMode: boolean;
  isPaletteOpen: boolean;
  onTogglePalette: () => void;
  onExitManualMode: () => void;
  onToggleMagnifier: () => void;
  isMagnifierActive: boolean;
}

const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  isManualColoringMode,
  isPaletteOpen,
  onTogglePalette,
  onExitManualMode,
  onToggleMagnifier,
  isMagnifierActive,
}) => {
  if (!isManualColoringMode) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2">
      <Button
        size="icon-lg"
        variant={isPaletteOpen ? 'default' : 'outline'}
        onClick={onTogglePalette}
        title={isPaletteOpen ? '关闭调色盘' : '打开调色盘'}
        className="rounded-full shadow-[var(--shadow-card)]"
      >
        <Palette className="size-5" />
      </Button>

      <Button
        size="icon-lg"
        variant={isMagnifierActive ? 'default' : 'outline'}
        onClick={onToggleMagnifier}
        title={isMagnifierActive ? '关闭放大镜' : '打开放大镜'}
        className="rounded-full shadow-[var(--shadow-card)]"
      >
        <Search className="size-5" />
      </Button>

      <Button
        size="icon-lg"
        variant="destructive"
        onClick={onExitManualMode}
        title="退出手动编辑模式"
        className="rounded-full shadow-[var(--shadow-card)]"
      >
        <X className="size-5" />
      </Button>
    </div>
  );
};

export default FloatingToolbar;
