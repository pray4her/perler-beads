"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PixelationMode } from "@/utils/pixelation";
import { colorSystemOptions, getColorKeyByHex, type ColorSystem } from "@/utils/colorSystemUtils";

interface GenerationParamsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  granularityInput: string;
  similarityThresholdInput: string;
  pixelationMode: PixelationMode;
  selectedColorSystem: ColorSystem;
  colorCounts: { [key: string]: { count: number; color: string } } | null;
  excludedColorKeys: Set<string>;
  canRemoveBackground: boolean;
  canUndoBackground: boolean;
  onToggleExcludeColor: (hexKey: string) => void;
  onColorSystemChange: (system: ColorSystem) => void;
  onApply: (values: {
    granularityInput: string;
    similarityThresholdInput: string;
    pixelationMode: PixelationMode;
  }) => void;
  onRemoveBackground: () => void;
  onUndoBackground: () => void;
}

export default function GenerationParamsSheet({
  open,
  onOpenChange,
  granularityInput,
  similarityThresholdInput,
  pixelationMode,
  selectedColorSystem,
  colorCounts,
  excludedColorKeys,
  canRemoveBackground,
  canUndoBackground,
  onToggleExcludeColor,
  onColorSystemChange,
  onApply,
  onRemoveBackground,
  onUndoBackground,
}: GenerationParamsSheetProps) {
  const [draftGranularity, setDraftGranularity] = useState(granularityInput);
  const [draftSimilarity, setDraftSimilarity] = useState(similarityThresholdInput);
  const [draftMode, setDraftMode] = useState(pixelationMode);

  useEffect(() => {
    if (!open) return;
    setDraftGranularity(granularityInput);
    setDraftSimilarity(similarityThresholdInput);
    setDraftMode(pixelationMode);
  }, [open, granularityInput, similarityThresholdInput, pixelationMode]);

  const sortedKeys = colorCounts
    ? Object.keys(colorCounts).sort((a, b) => colorCounts[b].count - colorCounts[a].count)
    : [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle>调整生成参数</SheetTitle>
          <SheetDescription>
            应用后会按新参数重新生成底稿，并覆盖当前画布编辑。
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="space-y-2">
            <Label htmlFor="sheet-granularity">横轴切割数量 (10-300，默认 80)</Label>
            <input
              id="sheet-granularity"
              type="number"
              min={10}
              max={300}
              value={draftGranularity}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftGranularity(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">中大型底稿建议 60–100；过细易产生碎色。</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sheet-similarity">颜色合并阈值 (0-100，默认 32)</Label>
            <input
              id="sheet-similarity"
              type="number"
              min={0}
              max={100}
              value={draftSimilarity}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftSimilarity(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">越高越干净；描边与阴影对比会自动保护，不易被误合并。</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sheet-pixelation-mode">处理模式</Label>
            <select
              id="sheet-pixelation-mode"
              value={draftMode}
              onChange={(event) => setDraftMode(event.target.value as PixelationMode)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value={PixelationMode.Dominant}>卡通 (主色)</option>
              <option value={PixelationMode.Average}>真实 (平均)</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label>色号体系</Label>
            <div className="flex flex-wrap gap-2">
              {colorSystemOptions.map((option) => (
                <Button
                  key={option.key}
                  type="button"
                  size="sm"
                  variant={selectedColorSystem === option.key ? "default" : "outline"}
                  onClick={() => onColorSystemChange(option.key as ColorSystem)}
                >
                  {option.name}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!canRemoveBackground} onClick={onRemoveBackground}>
              一键去背景
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!canUndoBackground} onClick={onUndoBackground}>
              回撤去背景
            </Button>
          </div>

          {sortedKeys.length > 0 ? (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium text-foreground">去除杂色</p>
                <p className="text-xs text-muted-foreground">点击颜色可排除或恢复；排除后需点应用才会重生成。</p>
              </div>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {sortedKeys.map((hexKey) => {
                  const excluded = excludedColorKeys.has(hexKey);
                  return (
                    <li key={hexKey}>
                      <button
                        type="button"
                        onClick={() => onToggleExcludeColor(hexKey)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          excluded ? "bg-red-100 text-red-800 opacity-70 dark:bg-red-950/40 dark:text-red-200" : "hover:bg-muted"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="inline-block h-3.5 w-3.5 rounded border border-border"
                            style={{ backgroundColor: excluded ? "#666" : colorCounts![hexKey].color }}
                          />
                          <span className={`font-mono ${excluded ? "line-through" : ""}`}>
                            {getColorKeyByHex(hexKey, selectedColorSystem)}
                          </span>
                        </span>
                        <span className="text-muted-foreground">{colorCounts![hexKey].count}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border">
          <Button
            type="button"
            className="w-full"
            onClick={() =>
              onApply({
                granularityInput: draftGranularity,
                similarityThresholdInput: draftSimilarity,
                pixelationMode: draftMode,
              })
            }
          >
            应用并重新生成
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
