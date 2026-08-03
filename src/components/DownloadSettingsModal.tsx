'use client';

import React, { useEffect, useState } from 'react';
import { GridDownloadOptions } from '../types/downloadTypes';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import FieldHelp from '@/components/FieldHelp';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const gridLineColorOptions = [
  { name: '深灰色', value: '#555555' },
  { name: '红色', value: '#FF0000' },
  { name: '蓝色', value: '#0000FF' },
  { name: '绿色', value: '#008000' },
  { name: '紫色', value: '#800080' },
  { name: '橙色', value: '#FFA500' },
];

interface DownloadSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  options: GridDownloadOptions;
  onOptionsChange: (options: GridDownloadOptions) => void;
  onDownload: (opts?: GridDownloadOptions) => void;
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col">
        <Label className="text-sm font-medium">{label}</Label>
        {description ? (
          <span className="text-xs text-muted-foreground mt-1">{description}</span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-border transition-colors ${
          checked ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <span
          className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

const DownloadSettingsModal: React.FC<DownloadSettingsModalProps> = ({
  isOpen,
  onClose,
  options,
  onOptionsChange,
  onDownload,
}) => {
  const [tempOptions, setTempOptions] = useState<GridDownloadOptions>({ ...options });

  useEffect(() => {
    if (isOpen) {
      setTempOptions({ ...options });
    }
  }, [isOpen, options]);

  const handleOptionChange = (key: keyof GridDownloadOptions, value: string | number | boolean) => {
    setTempOptions((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = () => {
    onOptionsChange(tempOptions);
    onDownload(tempOptions);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>下载图纸设置</DialogTitle>
          <DialogDescription>选择网格、坐标与导出选项后下载底稿。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ToggleRow
            label="显示网格线"
            checked={tempOptions.showGrid}
            onCheckedChange={(v) => handleOptionChange('showGrid', v)}
          />

          {tempOptions.showGrid && (
            <div className="space-y-4 border-l border-border pl-3 ml-1">
              <div className="space-y-2">
                <FieldHelp label="网格线间隔">
                  每隔 N 格画一条加粗网格线，把图纸分成若干小区块。打印出来拼豆时按区块数格子更不容易错位，常用 5 或 10。
                </FieldHelp>
                <div className="flex items-center gap-3">
                  <Slider
                    value={tempOptions.gridInterval}
                    min={5}
                    max={20}
                    step={1}
                    onValueChange={(vals) => {
                      const next = typeof vals === 'number'
                        ? vals
                        : Array.isArray(vals)
                          ? vals[0]
                          : tempOptions.gridInterval;
                      if (typeof next === 'number' && Number.isFinite(next)) {
                        handleOptionChange('gridInterval', next);
                      }
                    }}
                    className="flex-1"
                  />
                  <span className="min-w-8 text-center text-sm font-medium tabular-nums">
                    {tempOptions.gridInterval}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>网格线颜色</Label>
                <div className="flex flex-wrap gap-2">
                  {gridLineColorOptions.map((colorOpt) => (
                    <button
                      key={colorOpt.value}
                      type="button"
                      onClick={() => handleOptionChange('gridLineColor', colorOpt.value)}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-all ${
                        tempOptions.gridLineColor === colorOpt.value
                          ? 'border-foreground ring-2 ring-ring ring-offset-2 ring-offset-background'
                          : 'border-border hover:border-foreground/50'
                      }`}
                      title={colorOpt.name}
                    >
                      <span
                        className="block h-6 w-6 rounded-full"
                        style={{ backgroundColor: colorOpt.value }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <ToggleRow
            label="显示坐标数字"
            checked={tempOptions.showCoordinates}
            onCheckedChange={(v) => handleOptionChange('showCoordinates', v)}
          />
          <ToggleRow
            label="隐藏格内色号"
            checked={!tempOptions.showCellNumbers}
            onCheckedChange={(v) => handleOptionChange('showCellNumbers', !v)}
          />
          <ToggleRow
            label="包含色号统计"
            checked={tempOptions.includeStats}
            onCheckedChange={(v) => handleOptionChange('includeStats', v)}
          />
          <ToggleRow
            label="同时导出源数据"
            description="导出 hex 颜色值的 CSV，可用于重新导入"
            checked={tempOptions.exportCsv}
            onCheckedChange={(v) => handleOptionChange('exportCsv', v)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave}>下载图纸</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DownloadSettingsModal;
export { gridLineColorOptions };
