"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { defaultEditorPreviewSettings } from "@/editor/document";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PreviewSettings } from "@/types/editorTypes";
import type { MappedPixel } from "@/utils/pixelation";
import { renderDisplayPreview } from "@/utils/previewRenderer";
import { useT } from "@/i18n/context";

interface ResultPreviewPanelProps {
  grid: MappedPixel[][];
  settings: PreviewSettings;
  onSettingsChange: (settings: PreviewSettings) => void;
}

export default function ResultPreviewPanel({ grid, settings, onSettingsChange }: ResultPreviewPanelProps) {
  const t = useT();
  const p = t.workspace.preview;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{
    target: "image" | "title" | "subtitle";
    x: number;
    y: number;
    start: PreviewSettings;
    latest: PreviewSettings;
  } | null>(null);

  useEffect(() => {
    if (canvasRef.current) renderDisplayPreview(canvasRef.current, grid, settings);
  }, [grid, settings]);

  const update = <Key extends keyof PreviewSettings>(key: Key, value: PreviewSettings[Key]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const slider = (id: string, label: string, key: keyof PreviewSettings, min: number, max: number, step: number) => (
    <div className="editor-field">
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Number(settings[key])}
        onChange={(event) => update(key, Number(event.target.value) as never)}
      />
    </div>
  );

  return (
    <div className="editor-preview-panel">
      <div className="editor-preview-stage">
        <canvas
          ref={canvasRef}
          className="editor-preview-canvas is-interactive"
          aria-label={p.canvasAriaLabel}
          onPointerDown={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const yRatio = (event.clientY - rect.top) / rect.height;
            const target = yRatio < 0.67 ? "image" : yRatio < 0.86 ? "title" : "subtitle";
            event.currentTarget.setPointerCapture(event.pointerId);
            dragRef.current = { target, x: event.clientX, y: event.clientY, start: { ...settings }, latest: { ...settings } };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || !canvasRef.current) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const deltaX = (event.clientX - drag.x) / rect.width;
            const deltaY = (event.clientY - drag.y) / rect.height;
            const latest = { ...drag.start };
            if (drag.target === "image") {
              latest.imageOffsetX = Math.max(-0.6, Math.min(0.6, drag.start.imageOffsetX + deltaX / 0.18));
              latest.imageOffsetY = Math.max(-0.6, Math.min(0.6, drag.start.imageOffsetY + deltaY / 0.18));
            } else if (drag.target === "title") {
              latest.titleOffsetX = Math.max(-1, Math.min(1, drag.start.titleOffsetX + deltaX / 0.25));
              latest.titleOffsetY = Math.max(-0.8, Math.min(0.8, drag.start.titleOffsetY + deltaY / 0.16));
            } else {
              latest.subtitleOffsetX = Math.max(-1, Math.min(1, drag.start.subtitleOffsetX + deltaX / 0.25));
              latest.subtitleOffsetY = Math.max(-0.8, Math.min(0.8, drag.start.subtitleOffsetY + deltaY / 0.16));
            }
            drag.latest = latest;
            renderDisplayPreview(canvasRef.current, grid, latest);
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current;
            dragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (drag) onSettingsChange(drag.latest);
          }}
          onPointerCancel={(event) => {
            dragRef.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            if (canvasRef.current) renderDisplayPreview(canvasRef.current, grid, settings);
          }}
        />
      </div>

      <div className="editor-inspector-section">
        <div className="editor-field-row">
          <div className="editor-field">
            <Label htmlFor="preview-title">{p.title}</Label>
            <input id="preview-title" value={settings.title} onChange={(event) => update("title", event.target.value)} className="editor-input" />
          </div>
          <div className="editor-field">
            <Label htmlFor="preview-subtitle">{p.subtitle}</Label>
            <input id="preview-subtitle" value={settings.subtitle} onChange={(event) => update("subtitle", event.target.value)} className="editor-input" />
          </div>
        </div>

        <div className="editor-field-row">
          <div className="editor-field"><Label htmlFor="preview-title-weight">{p.titleWeight}</Label><select id="preview-title-weight" className="editor-input" value={settings.titleFontWeight} onChange={(event) => update("titleFontWeight", event.target.value as PreviewSettings["titleFontWeight"])}><option value="400">{p.weightRegular}</option><option value="600">{p.weightSemiBold}</option><option value="700">{p.weightBold}</option></select></div>
          <div className="editor-field"><Label htmlFor="preview-subtitle-weight">{p.subtitleWeight}</Label><select id="preview-subtitle-weight" className="editor-input" value={settings.subtitleFontWeight} onChange={(event) => update("subtitleFontWeight", event.target.value as PreviewSettings["subtitleFontWeight"])}><option value="400">{p.weightRegular}</option><option value="600">{p.weightSemiBold}</option><option value="700">{p.weightBold}</option></select></div>
        </div>

        <div className="editor-field-row">
          <div className="editor-field">
            <Label htmlFor="preview-font">{p.font}</Label>
            <select id="preview-font" value={settings.fontFamily} onChange={(event) => update("fontFamily", event.target.value as PreviewSettings["fontFamily"])} className="editor-input">
              <option value="sans">{p.fontSans}</option><option value="serif">{p.fontSerif}</option><option value="mono">{p.fontMono}</option><option value="handwriting">{p.fontHandwriting}</option>
            </select>
          </div>
          <div className="editor-field">
            <Label htmlFor="preview-ratio">{p.aspectRatio}</Label>
            <select id="preview-ratio" value={settings.aspectRatio} onChange={(event) => update("aspectRatio", event.target.value as PreviewSettings["aspectRatio"])} className="editor-input">
              <option value="1:1">1:1</option><option value="4:5">4:5</option><option value="9:16">9:16</option>
            </select>
          </div>
        </div>

        <div className="editor-field-row">
          <div className="editor-field"><Label htmlFor="preview-title-color">{p.titleColor}</Label><input id="preview-title-color" type="color" value={settings.titleColor} onChange={(event) => update("titleColor", event.target.value)} className="editor-color-input" /></div>
          <div className="editor-field"><Label htmlFor="preview-subtitle-color">{p.subtitleColor}</Label><input id="preview-subtitle-color" type="color" value={settings.subtitleColor} onChange={(event) => update("subtitleColor", event.target.value)} className="editor-color-input" /></div>
          <div className="editor-field"><Label htmlFor="preview-bg-color">{p.backgroundColor}</Label><input id="preview-bg-color" type="color" value={settings.backgroundColor} onChange={(event) => update("backgroundColor", event.target.value)} className="editor-color-input" /></div>
        </div>

        <div className="editor-field-row">
          {slider("preview-title-size", p.titleSize(settings.titleSize), "titleSize", 20, 72, 1)}
          {slider("preview-subtitle-size", p.subtitleSize(settings.subtitleSize), "subtitleSize", 10, 48, 1)}
        </div>
        <div className="editor-field-row">
          {slider("preview-title-line", p.titleLineHeight(settings.titleLineHeight.toFixed(1)), "titleLineHeight", 0.9, 2, 0.1)}
          {slider("preview-subtitle-line", p.subtitleLineHeight(settings.subtitleLineHeight.toFixed(1)), "subtitleLineHeight", 0.9, 2, 0.1)}
        </div>
        <div className="editor-field-row">
          {slider("preview-title-opacity", p.titleOpacity(Math.round(settings.titleOpacity * 100)), "titleOpacity", 0, 1, 0.05)}
          {slider("preview-subtitle-opacity", p.subtitleOpacity(Math.round(settings.subtitleOpacity * 100)), "subtitleOpacity", 0, 1, 0.05)}
        </div>
        <div className="editor-field-row">
          {slider("preview-image-scale", p.imageScale(Math.round(settings.imageScale * 100)), "imageScale", 0.45, 1.25, 0.05)}
          {slider("preview-image-opacity", p.imageOpacity(Math.round(settings.imageOpacity * 100)), "imageOpacity", 0, 1, 0.05)}
        </div>
        <div className="editor-field-row">
          {slider("preview-image-x", p.imageX, "imageOffsetX", -0.6, 0.6, 0.01)}
          {slider("preview-image-y", p.imageY, "imageOffsetY", -0.6, 0.6, 0.01)}
        </div>
        <div className="editor-field-row">
          {slider("preview-title-y", p.titleY, "titleOffsetY", -0.8, 0.8, 0.01)}
          {slider("preview-subtitle-y", p.subtitleY, "subtitleOffsetY", -0.8, 0.8, 0.01)}
        </div>
        <div className="editor-field-row">
          {slider("preview-bg-opacity", p.backgroundOpacity(Math.round(settings.backgroundOpacity * 100)), "backgroundOpacity", 0, 1, 0.05)}
          {slider("preview-safe-area", p.safeArea(Math.round(settings.safeArea * 100)), "safeArea", 0.02, 0.15, 0.01)}
        </div>
      </div>

      <div className="editor-preview-actions">
        <Button variant="outline" onClick={() => onSettingsChange({ ...defaultEditorPreviewSettings })}><RotateCcw className="h-4 w-4" />{p.reset}</Button>
      </div>
    </div>
  );
}
