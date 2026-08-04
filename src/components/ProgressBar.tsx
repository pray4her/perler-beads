import React from 'react';
import { Progress } from '@/components/ui/progress';
import { useT } from '@/i18n/context';

interface ProgressBarProps {
  progressPercentage: number;
  recommendedCell?: { row: number; col: number } | null;
  /** 自定义提示文案（如逐行模式）；未传时按推荐格子显示 */
  hintText?: string;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progressPercentage,
  recommendedCell,
  hintText
}) => {
  const t = useT();

  return (
    <div className="h-10 bg-card border-b border-border px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Progress value={progressPercentage} className="flex-1 gap-0" />
        <span className="text-sm font-medium text-foreground shrink-0">
          {progressPercentage}%
        </span>
      </div>

      <div className="text-xs text-muted-foreground shrink-0">
        {hintText ? (
          <span>{hintText}</span>
        ) : recommendedCell ? (
          <span>{t.focus.progress.nextCell(recommendedCell.row + 1, recommendedCell.col + 1)}</span>
        ) : (
          <span>{t.focus.progress.colorDone}</span>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;
