import React from 'react';
import { useT } from '@/i18n/context';

interface RowStatusBarProps {
  currentRow: number;
  totalRows: number;
  completed: number;
  total: number;
}

const RowStatusBar: React.FC<RowStatusBarProps> = ({
  currentRow,
  totalRows,
  completed,
  total
}) => {
  const t = useT();
  const remaining = Math.max(0, total - completed);
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="min-h-14 bg-card border-b border-border px-4 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div className="text-sm font-medium text-foreground px-2">
          {t.focus.rowStatus.position(currentRow + 1, totalRows)}
        </div>
        <div className="flex flex-col">
          <div className="text-sm font-medium text-foreground">
            {completed}/{total}
          </div>
          <div className="text-xs text-muted-foreground">
            {t.focus.rowStatus.remaining(remaining)}
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-lg font-bold text-primary">
          {percentage}%
        </div>
      </div>
    </div>
  );
};

export default RowStatusBar;
