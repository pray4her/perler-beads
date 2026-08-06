import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useT } from '@/i18n/context';

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
  showCoordinates: boolean;
  onShowCoordinatesChange: (show: boolean) => void;
  showGridLines: boolean;
  onShowGridLinesChange: (show: boolean) => void;
  boardInterval: number;
  onBoardIntervalChange: (interval: number) => void;
  wakeLockEnabled: boolean;
  onWakeLockEnabledChange: (enable: boolean) => void;
  onExportProgress: () => void;
  onRequestResetProgress: () => void;
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
  showCoordinates,
  onShowCoordinatesChange,
  showGridLines,
  onShowGridLinesChange,
  boardInterval,
  onBoardIntervalChange,
  wakeLockEnabled,
  onWakeLockEnabledChange,
  onExportProgress,
  onRequestResetProgress,
  onClose
}) => {
  const t = useT();
  const sectionLineColors = [
    { color: '#007acc', name: t.focus.settings.lineColorBlue },
    { color: '#28a745', name: t.focus.settings.lineColorGreen },
    { color: '#dc3545', name: t.focus.settings.lineColorRed },
    { color: '#6f42c1', name: t.focus.settings.lineColorPurple },
    { color: '#fd7e14', name: t.focus.settings.lineColorOrange },
    { color: '#6c757d', name: t.focus.settings.lineColorGray }
  ];

  return (
    <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-80 max-w-[90vw] p-0 gap-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle>{t.focus.settings.title}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <div>
            <h3 className="text-base font-medium text-foreground mb-3">{t.focus.settings.guidanceTitle}</h3>
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
                  <div className="text-sm font-medium text-foreground">{t.focus.settings.guidanceNearest}</div>
                  <div className="text-xs text-muted-foreground">{t.focus.settings.guidanceNearestDesc}</div>
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
                  <div className="text-sm font-medium text-foreground">{t.focus.settings.guidanceLargest}</div>
                  <div className="text-xs text-muted-foreground">{t.focus.settings.guidanceLargestDesc}</div>
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
                  <div className="text-sm font-medium text-foreground">{t.focus.settings.guidanceEdgeFirst}</div>
                  <div className="text-xs text-muted-foreground">{t.focus.settings.guidanceEdgeFirstDesc}</div>
                </div>
              </label>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-medium text-foreground mb-3">{t.focus.settings.displayTitle}</h3>
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{t.focus.settings.showSectionLines}</div>
                  <div className="text-xs text-muted-foreground">{t.focus.settings.showSectionLinesDesc}</div>
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
                      {t.focus.settings.sectionInterval}
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
                        {t.focus.settings.sectionIntervalValue(gridSectionInterval)}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground block mb-2">
                      {t.focus.settings.sectionLineColor}
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
                  <div className="text-sm font-medium text-foreground">{t.focus.settings.coordinates}</div>
                  <div className="text-xs text-muted-foreground">{t.focus.settings.coordinatesDesc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={showCoordinates}
                  onChange={(e) => onShowCoordinatesChange(e.target.checked)}
                  className="h-4 w-4 accent-primary rounded"
                />
              </label>

              <label className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{t.focus.settings.gridLines}</div>
                  <div className="text-xs text-muted-foreground">{t.focus.settings.gridLinesDesc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={showGridLines}
                  onChange={(e) => onShowGridLinesChange(e.target.checked)}
                  className="h-4 w-4 accent-primary rounded"
                />
              </label>

              <div>
                <div className="mb-2">
                  <div className="text-sm font-medium text-foreground">{t.focus.settings.boardLines}</div>
                  <div className="text-xs text-muted-foreground">{t.focus.settings.boardLinesDesc}</div>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {[0, 52, 78, 104].map((interval) => (
                    <label key={interval} className="flex items-center">
                      <input
                        type="radio"
                        name="boardInterval"
                        value={interval}
                        checked={boardInterval === interval}
                        onChange={() => onBoardIntervalChange(interval)}
                        className="mr-1.5 accent-primary"
                      />
                      <span className="text-sm text-foreground">
                        {interval === 0 ? t.focus.settings.boardLinesOff : t.focus.settings.boardLinesValue(interval)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{t.focus.settings.celebration}</div>
                  <div className="text-xs text-muted-foreground">{t.focus.settings.celebrationDesc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={enableCelebration}
                  onChange={(e) => onEnableCelebrationChange(e.target.checked)}
                  className="h-4 w-4 accent-primary rounded"
                />
              </label>

              <label className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{t.focus.settings.wakeLock}</div>
                  <div className="text-xs text-muted-foreground">{t.focus.settings.wakeLockDesc}</div>
                </div>
                <input
                  type="checkbox"
                  checked={wakeLockEnabled}
                  onChange={(e) => onWakeLockEnabledChange(e.target.checked)}
                  className="h-4 w-4 accent-primary rounded"
                />
              </label>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-medium text-foreground mb-3">{t.focus.settings.dataTitle}</h3>
            <div className="space-y-3">
              <Button variant="outline" className="w-full" onClick={onExportProgress}>
                {t.focus.settings.exportProgress}
              </Button>
              <Button
                variant="outline"
                className="w-full text-destructive hover:text-destructive"
                onClick={onRequestResetProgress}
              >
                {t.focus.settings.resetProgress}
              </Button>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-base font-medium text-foreground mb-3">{t.focus.settings.aboutTitle}</h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>{t.focus.settings.aboutVersion}</p>
              <p>{t.focus.settings.aboutModes}</p>
              <div className="pt-2 text-xs space-y-1">
                <p>{t.focus.settings.tipGestures}</p>
                <p>{t.focus.settings.tipShortcuts}</p>
                <p>{t.focus.settings.tipRowMode}</p>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default SettingsPanel;
