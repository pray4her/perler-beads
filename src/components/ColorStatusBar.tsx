import React from 'react';

interface ColorStatusBarProps {
  currentColor: string;
  colorInfo?: {
    color: string;
    name: string;
    total: number;
    completed: number;
  };
  progressPercentage: number;
}

const ColorStatusBar: React.FC<ColorStatusBarProps> = ({
  currentColor,
  colorInfo,
  progressPercentage
}) => {
  if (!colorInfo) {
    return (
      <div className="h-12 bg-card border-b border-border px-4 py-2 flex items-center">
        <div className="text-muted-foreground">请选择颜色</div>
      </div>
    );
  }

  const remaining = Math.max(0, colorInfo.total - colorInfo.completed);

  return (
    <div className="min-h-14 bg-card border-b border-border px-4 py-2 flex items-center justify-between">
      <div className="flex items-center space-x-3">
        <div
          className="w-9 h-9 rounded-lg border border-border shadow-sm"
          style={{ backgroundColor: currentColor }}
        />
        <div className="text-sm font-mono font-bold text-foreground px-2">
          {colorInfo.name}
        </div>
        <div className="flex flex-col">
          <div className="text-sm font-medium text-foreground">
            {colorInfo.completed}/{colorInfo.total}
          </div>
          <div className="text-xs text-muted-foreground">
            剩余 {remaining} 颗
          </div>
        </div>
      </div>

      <div className="text-right">
        <div className="text-lg font-bold text-primary">
          {progressPercentage}%
        </div>
      </div>
    </div>
  );
};

export default ColorStatusBar;
