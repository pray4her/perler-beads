import React from 'react';
import { Button } from '@/components/ui/button';
import { LocateFixed, Palette, PauseCircle, PlayCircle } from 'lucide-react';
import { useT } from '@/i18n/context';

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
  const t = useT();

  return (
    <div className="min-h-16 bg-card border-t border-border px-4 py-2 flex items-center justify-around">
      <Button
        variant="ghost"
        aria-label={t.focus.toolbar.colorLabel}
        onClick={onColorSelect}
        className="flex flex-col items-center h-auto min-h-11 min-w-11 py-1.5 px-3 text-muted-foreground hover:text-foreground"
      >
        <Palette className="h-5 w-5" />
        <span className="text-xs">{t.focus.toolbar.color}</span>
      </Button>

      <Button
        variant="ghost"
        aria-label={t.focus.toolbar.locateLabel}
        onClick={onLocate}
        className="flex flex-col items-center h-auto min-h-11 min-w-11 py-1.5 px-3 text-muted-foreground hover:text-foreground"
      >
        <LocateFixed className="h-5 w-5" />
        <span className="text-xs">{t.focus.toolbar.locate}</span>
      </Button>

      <Button
        variant="ghost"
        aria-label={isPaused ? t.focus.toolbar.resumeLabel : t.focus.toolbar.pauseLabel}
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
