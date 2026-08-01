import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface SettingsPanelProps {
  isOpen: boolean;
  guidanceMode: 'nearest' | 'largest' | 'edge-first';
  onGuidanceModeChange: (mode: 'nearest' | 'largest' | 'edge-first') => void;
  gridSectionInterval: number;
  onGridSectionIntervalChange: (interval: number) => void;
  showSectionLines: boolean;
  onShowSectionLinesChange: (show: boolean) => void;
  sectionLineColor: string;
  onSectionLineColorChange: (color: string) => void;
  enableCelebration: boolean;
  onEnableCelebrationChange: (enable: boolean) => void;
  onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  guidanceMode,
  onGuidanceModeChange,
  gridSectionInterval,
  onGridSectionIntervalChange,
  showSectionLines,
  onShowSectionLinesChange,
  sectionLineColor,
  onSectionLineColorChange,
  enableCelebration,
  onEnableCelebrationChange,
  onClose
}) => {
  const sectionLineColors = [
    { color: '#007acc', name: '蓝色' },
    { color: '#28a745', name: '绿色' },
    { color: '#dc3545', name: '红色' },
    { color: '#6f42c1', name: '紫色' },
    { color: '#fd7e14', name: '橙色' },
    { color: '#6c757d', name: '灰色' }
  ];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-80 max-w-[90vw] p-0 gap-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle>设置</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h3 className="text-base font-medium text-foreground mb-3">智能引导</h3>
            <div className="space-y-3">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="guidanceMode"
                  value="nearest"
                  checked={guidanceMode === 'nearest'}
                  onChange={(e) => onGuidanceModeChange(e.target.value as 'nearest')}
                  className="mr-3 accent-primary"
                />
                <div>
                  <div className="text-sm font-medium text-foreground">最近优先</div>
                  <div className="text-xs text-muted-foreground">推荐距离最近的格子</div>
                </div>
              </label>

              <label className="flex items-center">
                <input
                  type="radio"
                  name="guidanceMode"
                  value="largest"
                  checked={guidanceMode === 'largest'}
                  onChange={(e) => onGuidanceModeChange(e.target.value as 'largest')}
                  className="mr-3 accent-primary"
                />
                <div>
                  <div className="text-sm font-medium text-foreground">大块优先</div>
                  <div className="text-xs text-muted-foreground">优先推荐大色块区域</div>
                </div>
              </label>

              <label className="flex items-center">
                <input
                  type="radio"
                  name="guidanceMode"
                  value="edge-first"
                  checked={guidanceMode === 'edge-first'}
                  onChange={(e) => onGuidanceModeChange(e.target.value as 'edge-first')}
                  className="mr-3 accent-primary"
                />
                <div>
                  <div className="text-sm font-medium text-foreground">边缘优先</div>
                  <div className="text-xs text-muted-foreground">先完成边缘，再填充内部</div>
                </div>
              </label>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-medium text-foreground mb-3">显示设置</h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">显示分割线</div>
                  <div className="text-xs text-muted-foreground">将画布分割成区块帮助定位</div>
                </div>
                <input
                  type="checkbox"
                  checked={showSectionLines}
                  onChange={(e) => onShowSectionLinesChange(e.target.checked)}
                  className="h-4 w-4 accent-primary rounded"
                />
              </label>

              {showSectionLines && (
                <>
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-2">
                      分割间隔
                    </label>
                    <div className="flex items-center space-x-3">
                      <input
                        type="range"
                        min="5"
                        max="20"
                        value={gridSectionInterval}
                        onChange={(e) => onGridSectionIntervalChange(parseInt(e.target.value))}
                        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                      />
                      <span className="text-sm font-medium text-foreground min-w-[3rem]">
                        {gridSectionInterval} 格
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground block mb-2">
                      分割线颜色
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {sectionLineColors.map((colorOption) => (
                        <button
                          key={colorOption.color}
                          onClick={() => onSectionLineColorChange(colorOption.color)}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${
                            sectionLineColor === colorOption.color
                              ? 'border-primary scale-110'
                              : 'border-border hover:border-muted-foreground'
                          }`}
                          style={{ backgroundColor: colorOption.color }}
                          title={colorOption.name}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              <label className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">庆祝动画</div>
                  <div className="text-xs text-muted-foreground">完成颜色时显示撒花效果</div>
                </div>
                <input
                  type="checkbox"
                  checked={enableCelebration}
                  onChange={(e) => onEnableCelebrationChange(e.target.checked)}
                  className="h-4 w-4 accent-primary rounded"
                />
              </label>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-medium text-foreground mb-3">数据管理</h3>
            <div className="space-y-3">
              <Button variant="outline" className="w-full">
                导出进度数据
              </Button>
              <Button variant="outline" className="w-full">
                重置所有进度
              </Button>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-medium text-foreground mb-3">关于</h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>专心拼豆模式 v1.0</p>
              <p>专为手机设计的拼豆助手</p>
              <div className="pt-2 text-xs space-y-1">
                <p>提示：长按格子可以快速标记</p>
                <p>提示：双指缩放可以查看细节</p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SettingsPanel;
