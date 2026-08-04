import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCheck, Undo2 } from 'lucide-react';
import { useT } from '@/i18n/context';

interface ColorStatusBarProps {
  currentColor: string;
  colorInfo?: {
    color: string;
    name: string;
    total: number;
    completed: number;
  };
  progressPercentage: number;
  /** 一键完成/撤销当前颜色 */
  onToggleComplete?: () => void;
}

const ColorStatusBar: React.FC<ColorStatusBarProps> = ({
  currentColor,
  colorInfo,
  progressPercentage,
  onToggleComplete
}) => {
  const t = useT();

  if (!colorInfo) {
    return (
      <div className="h-12 bg-card border-b border-border px-4 py-2 flex items-center">
        <div className="text-muted-foreground">{t.focus.colorStatus.selectColor}</div>
      </div>
    );
  }

  const remaining = Math.max(0, colorInfo.total - colorInfo.completed);
  const isComplete = colorInfo.completed >= colorInfo.total;

  return (
    <div className="min-h-14 bg-card border-b border-border px-4 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center space-x-3 min-w-0">
        <div
          className="w-9 h-9 rounded-lg border border-border shadow-sm shrink-0"
          style={{ backgroundColor: currentColor }}
        />
        <div className="text-sm font-mono font-bold text-foreground px-2 truncate">
          {colorInfo.name}
        </div>
        <div className="flex flex-col shrink-0">
          <div className="text-sm font-medium text-foreground">
            {colorInfo.completed}/{colorInfo.total}
          </div>
          <div className="text-xs text-muted-foreground">
            {t.focus.colorStatus.remaining(remaining)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {onToggleComplete && (
          <Button
            variant={isComplete ? 'outline' : 'default'}
            size="sm"
            aria-label={isComplete ? t.focus.colorStatus.resetColorLabel : t.focus.colorStatus.finishColorLabel}
            onClick={onToggleComplete}
            className="min-h-11 px-3"
          >
            {isComplete ? (
              <>
                <Undo2 className="h-4 w-4" />
                {t.focus.colorStatus.resetColor}
              </>
            ) : (
              <>
                <CheckCheck className="h-4 w-4" />
                {t.focus.colorStatus.finishColor}
              </>
            )}
          </Button>
        )}
        <div className="text-right">
          <div className="text-lg font-bold text-primary">
            {progressPercentage}%
          </div>
        </div>
      </div>
    </div>
  );
};

export default ColorStatusBar;
