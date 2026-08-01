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
    <div className="h-15 bg-card border-t border-border px-4 py-2 flex items-center justify-around">
      <Button
        variant="ghost"
        onClick={onColorSelect}
        className="flex flex-col items-center h-auto py-1 px-3 text-muted-foreground hover:text-foreground"
      >
        <Palette className="h-5 w-5" />
        <span className="text-xs">颜色</span>
      </Button>

      <Button
        variant="ghost"
        onClick={onLocate}
        className="flex flex-col items-center h-auto py-1 px-3 text-muted-foreground hover:text-foreground"
      >
        <LocateFixed className="h-5 w-5" />
        <span className="text-xs">定位</span>
      </Button>

      <Button
        variant="ghost"
        onClick={onPause}
        className={`flex flex-col items-center h-auto py-1 px-3 ${
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
