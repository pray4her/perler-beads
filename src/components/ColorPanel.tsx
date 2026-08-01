import React, { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

interface ColorInfo {
  color: string;
  name: string;
  total: number;
  completed: number;
}

interface ColorPanelProps {
  isOpen: boolean;
  colors: ColorInfo[];
  currentColor: string;
  onColorSelect: (color: string) => void;
  onClose: () => void;
}

const ColorPanel: React.FC<ColorPanelProps> = ({
  isOpen,
  colors,
  currentColor,
  onColorSelect,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'progress' | 'name' | 'total'>('progress');

  const filteredAndSortedColors = colors
    .filter(color =>
      color.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      color.color.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'progress':
          const progressA = (a.completed / a.total) * 100;
          const progressB = (b.completed / b.total) * 100;
          return progressA - progressB;
        case 'name':
          return a.name.localeCompare(b.name);
        case 'total':
          return b.total - a.total;
        default:
          return 0;
      }
    });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[80vh] rounded-t-2xl p-0 gap-0"
      >
        <div className="flex justify-center py-2">
          <div className="w-10 h-1 bg-muted rounded-full" />
        </div>

        <SheetHeader className="px-4 pb-2">
          <SheetTitle>选择颜色</SheetTitle>
        </SheetHeader>

        <div className="px-4 pb-3">
          <div className="relative">
            <input
              type="text"
              placeholder="搜索颜色..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        <div className="px-4 pb-3">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'progress' | 'name' | 'total')}
            className="w-full p-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="progress">按进度排序</option>
            <option value="name">按名称排序</option>
            <option value="total">按数量排序</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filteredAndSortedColors.map((colorInfo) => {
            const progressPercentage = Math.round((colorInfo.completed / colorInfo.total) * 100);
            const isSelected = colorInfo.color === currentColor;
            const isCompleted = progressPercentage === 100;

            return (
              <button
                key={colorInfo.color}
                onClick={() => onColorSelect(colorInfo.color)}
                className={`w-full p-3 mb-2 rounded-lg border-2 transition-all ${
                  isSelected
                    ? 'border-primary bg-muted'
                    : 'border-border bg-card hover:border-muted-foreground/30'
                } ${isCompleted ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div
                      className="w-10 h-10 rounded-full border-2 border-border flex-shrink-0"
                      style={{ backgroundColor: colorInfo.color }}
                    />
                    <div className="text-left">
                      <div className="text-sm font-medium text-foreground font-mono">
                        {colorInfo.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {colorInfo.completed}/{colorInfo.total} ({progressPercentage}%)
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {isCompleted && (
                      <div className="text-primary">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                    {isSelected && (
                      <div className="text-primary">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-2">
                  <Progress value={progressPercentage} className="gap-0" />
                </div>
              </button>
            );
          })}
        </div>

        <Separator />
        <div className="p-4">
          <Button variant="outline" onClick={onClose} className="w-full">
            关闭
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ColorPanel;
