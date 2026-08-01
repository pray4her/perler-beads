import React from 'react';
import { Button } from '@/components/ui/button';

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
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
        </svg>
        <span className="text-xs">颜色</span>
      </Button>

      <Button
        variant="ghost"
        onClick={onLocate}
        className="flex flex-col items-center h-auto py-1 px-3 text-muted-foreground hover:text-foreground"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
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
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        )}
        <span className="text-xs font-mono">{elapsedTime}</span>
      </Button>
    </div>
  );
};

export default ToolBar;
