import React from 'react';
import { Button } from '@/components/ui/button';
import { LocateFixed, Palette, PauseCircle, PlayCircle } from 'lucide-react';

interface ToolBarProps {
  onColorSelect: () => void;
  onLocate: () => void;
  onPause: () => void;
  isPaused: boolean;
  elapsedTime: string;
}

const ToolBar: React.FC<ToolBarProps> = ({
  onColorSelect,
  onLocate,
  onPause,
  isPaused,
  elapsedTime
}) => {
  return (
    <div className="min-h-16 bg-card border-t border-border px-4 py-2 flex items-center justify-around">
      <Button
        variant="ghost"
        aria-label="选择颜色"
        onClick={onColorSelect}
        className="flex flex-col items-center h-auto min-h-11 min-w-11 py-1.5 px-3 text-muted-foreground hover:text-foreground"
      >
        <Palette className="h-5 w-5" />
        <span className="text-xs">颜色</span>
      </Button>

      <Button
        variant="ghost"
        aria-label="定位到推荐位置"
        onClick={onLocate}
        className="flex flex-col items-center h-auto min-h-11 min-w-11 py-1.5 px-3 text-muted-foreground hover:text-foreground"
      >
        <LocateFixed className="h-5 w-5" />
        <span className="text-xs">定位</span>
      </Button>

      <Button
        variant="ghost"
        aria-label={isPaused ? '继续计时' : '暂停计时'}
        onClick={onPause}
        className={`flex flex-col items-center h-auto min-h-11 min-w-11 py-1.5 px-3 ${
          isPaused
            ? 'text-primary hover:text-primary/80'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {isPaused ? (
          <PlayCircle className="h-5 w-5" />
        ) : (
          <PauseCircle className="h-5 w-5" />
        )}
        <span className="text-xs font-mono">{elapsedTime}</span>
      </Button>
    </div>
  );
};

export default ToolBar;
