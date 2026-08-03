import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Palette, Rows3 } from 'lucide-react';

interface ModeBarProps {
  progressMode: 'color' | 'row';
  onProgressModeChange: (mode: 'color' | 'row') => void;
  currentRow: number;
  totalRows: number;
  onRowChange: (row: number) => void;
}

const ModeBar: React.FC<ModeBarProps> = ({
  progressMode,
  onProgressModeChange,
  currentRow,
  totalRows,
  onRowChange
}) => {
  return (
    <div className="min-h-11 bg-card border-b border-border px-3 sm:px-5 py-1 flex items-center justify-between gap-2">
      <div
        role="tablist"
        aria-label="推进方式"
        className="inline-flex rounded-lg bg-muted p-0.5"
      >
        <button
          role="tab"
          aria-selected={progressMode === 'color'}
          onClick={() => onProgressModeChange('color')}
          className={`flex items-center gap-1.5 min-h-9 px-3 rounded-md text-sm font-medium transition-colors ${
            progressMode === 'color'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Palette className="h-4 w-4" />
          逐色
        </button>
        <button
          role="tab"
          aria-selected={progressMode === 'row'}
          onClick={() => onProgressModeChange('row')}
          className={`flex items-center gap-1.5 min-h-9 px-3 rounded-md text-sm font-medium transition-colors ${
            progressMode === 'row'
              ? 'bg-card text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Rows3 className="h-4 w-4" />
          逐行
        </button>
      </div>

      {progressMode === 'row' && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="上一行"
            disabled={currentRow <= 0}
            onClick={() => onRowChange(currentRow - 1)}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm font-mono font-medium text-foreground min-w-[4.5rem] text-center">
            {currentRow + 1} / {totalRows}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="下一行"
            disabled={currentRow >= totalRows - 1}
            onClick={() => onRowChange(currentRow + 1)}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
};

export default ModeBar;
