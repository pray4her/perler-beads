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
import FieldHelp from "@/components/FieldHelp";
import { PixelationMode } from "@/utils/pixelation";
import { colorSystemOptions, getColorKeyByHex, type ColorSystem } from "@/utils/colorSystemUtils";
import { useT } from "@/i18n/context";

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
  const t = useT();
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
          <SheetTitle>{t.home.paramsSheet.title}</SheetTitle>
          <SheetDescription>
            {t.home.paramsSheet.description}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div className="space-y-2">
            <FieldHelp label={t.home.paramsSheet.granularityLabel} htmlFor="sheet-granularity">
              {t.home.paramsSheet.granularityHelp}
            </FieldHelp>
            <input
              id="sheet-granularity"
              type="number"
              min={10}
              max={300}
              value={draftGranularity}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftGranularity(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t.home.paramsSheet.granularityHint}</p>
          </div>

          <div className="space-y-2">
            <FieldHelp label={t.home.paramsSheet.similarityLabel} htmlFor="sheet-similarity">
              {t.home.paramsSheet.similarityHelp}
            </FieldHelp>
            <input
              id="sheet-similarity"
              type="number"
              min={0}
              max={100}
              value={draftSimilarity}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setDraftSimilarity(event.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">{t.home.paramsSheet.similarityHint}</p>
          </div>

          <div className="space-y-2">
            <FieldHelp label={t.home.paramsSheet.modeLabel} htmlFor="sheet-pixelation-mode">
              {t.home.paramsSheet.modeHelp}
            </FieldHelp>
            <select
              id="sheet-pixelation-mode"
              value={draftMode}
              onChange={(event) => setDraftMode(event.target.value as PixelationMode)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value={PixelationMode.Dominant}>{t.home.paramsSheet.modeDominant}</option>
              <option value={PixelationMode.Average}>{t.home.paramsSheet.modeAverage}</option>
            </select>
          </div>

          <div className="space-y-2">
            <FieldHelp label={t.home.paramsSheet.colorSystemLabel}>
              {t.home.paramsSheet.colorSystemHelp}
            </FieldHelp>
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
              {t.home.paramsSheet.removeBackground}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={!canUndoBackground} onClick={onUndoBackground}>
              {t.home.paramsSheet.undoRemoveBackground}
            </Button>
          </div>

          {sortedKeys.length > 0 ? (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-medium text-foreground">{t.home.paramsSheet.excludeColorsTitle}</p>
                <p className="text-xs text-muted-foreground">{t.home.paramsSheet.excludeColorsHint}</p>
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
            {t.home.paramsSheet.apply}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
