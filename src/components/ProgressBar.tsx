import React from 'react';
import { Progress } from '@/components/ui/progress';

interface ProgressBarProps {
  progressPercentage: number;
  recommendedCell?: { row: number; col: number } | null;
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progressPercentage,
  recommendedCell
}) => {
  return (
    <div className="h-10 bg-card border-b border-border px-4 py-2 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Progress value={progressPercentage} className="flex-1 gap-0" />
        <span className="text-sm font-medium text-foreground shrink-0">
          {progressPercentage}%
        </span>
      </div>

      <div className="text-xs text-muted-foreground shrink-0">
        {recommendedCell ? (
          <span>下一块 → {recommendedCell.row + 1},{recommendedCell.col + 1}</span>
        ) : (
          <span>已完成当前颜色</span>
        )}
      </div>
    </div>
  );
};

export default ProgressBar;
