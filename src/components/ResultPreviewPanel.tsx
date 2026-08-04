"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef } from "react";
import { defaultEditorPreviewSettings } from "@/editor/document";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { PreviewSettings } from "@/types/editorTypes";
import type { MappedPixel } from "@/utils/pixelation";
import { renderDisplayPreview } from "@/utils/previewRenderer";

interface ResultPreviewPanelProps {
  grid: MappedPixel[][];
  settings: PreviewSettings;
  onSettingsChange: (settings: PreviewSettings) => void;
}

export default function ResultPreviewPanel({ grid, settings, onSettingsChange }: ResultPreviewPanelProps) {
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
          aria-label="展示预览；拖动作图区、标题或副标题可调整位置"
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
            <Label htmlFor="preview-title">作品标题</Label>
            <input id="preview-title" value={settings.title} onChange={(event) => update("title", event.target.value)} className="editor-input" />
          </div>
          <div className="editor-field">
            <Label htmlFor="preview-subtitle">副标题</Label>
            <input id="preview-subtitle" value={settings.subtitle} onChange={(event) => update("subtitle", event.target.value)} className="editor-input" />
          </div>
        </div>

        <div className="editor-field-row">
          <div className="editor-field"><Label htmlFor="preview-title-weight">标题字重</Label><select id="preview-title-weight" className="editor-input" value={settings.titleFontWeight} onChange={(event) => update("titleFontWeight", event.target.value as PreviewSettings["titleFontWeight"])}><option value="400">常规</option><option value="600">半粗</option><option value="700">粗体</option></select></div>
          <div className="editor-field"><Label htmlFor="preview-subtitle-weight">副标题字重</Label><select id="preview-subtitle-weight" className="editor-input" value={settings.subtitleFontWeight} onChange={(event) => update("subtitleFontWeight", event.target.value as PreviewSettings["subtitleFontWeight"])}><option value="400">常规</option><option value="600">半粗</option><option value="700">粗体</option></select></div>
        </div>

        <div className="editor-field-row">
          <div className="editor-field">
            <Label htmlFor="preview-font">字体</Label>
            <select id="preview-font" value={settings.fontFamily} onChange={(event) => update("fontFamily", event.target.value as PreviewSettings["fontFamily"])} className="editor-input">
              <option value="sans">现代黑体</option><option value="serif">宋体</option><option value="mono">等宽字体</option><option value="handwriting">楷体</option>
            </select>
          </div>
          <div className="editor-field">
            <Label htmlFor="preview-ratio">画面比例</Label>
            <select id="preview-ratio" value={settings.aspectRatio} onChange={(event) => update("aspectRatio", event.target.value as PreviewSettings["aspectRatio"])} className="editor-input">
              <option value="1:1">1:1</option><option value="4:5">4:5</option><option value="9:16">9:16</option>
            </select>
          </div>
        </div>

        <div className="editor-field-row">
          <div className="editor-field"><Label htmlFor="preview-title-color">标题颜色</Label><input id="preview-title-color" type="color" value={settings.titleColor} onChange={(event) => update("titleColor", event.target.value)} className="editor-color-input" /></div>
          <div className="editor-field"><Label htmlFor="preview-subtitle-color">副标题颜色</Label><input id="preview-subtitle-color" type="color" value={settings.subtitleColor} onChange={(event) => update("subtitleColor", event.target.value)} className="editor-color-input" /></div>
          <div className="editor-field"><Label htmlFor="preview-bg-color">背景颜色</Label><input id="preview-bg-color" type="color" value={settings.backgroundColor} onChange={(event) => update("backgroundColor", event.target.value)} className="editor-color-input" /></div>
        </div>

        <div className="editor-field-row">
          {slider("preview-title-size", `标题 ${settings.titleSize}px`, "titleSize", 20, 72, 1)}
          {slider("preview-subtitle-size", `副标题 ${settings.subtitleSize}px`, "subtitleSize", 10, 48, 1)}
        </div>
        <div className="editor-field-row">
          {slider("preview-title-line", `标题行高 ${settings.titleLineHeight.toFixed(1)}`, "titleLineHeight", 0.9, 2, 0.1)}
          {slider("preview-subtitle-line", `副标题行高 ${settings.subtitleLineHeight.toFixed(1)}`, "subtitleLineHeight", 0.9, 2, 0.1)}
        </div>
        <div className="editor-field-row">
          {slider("preview-title-opacity", `标题透明度 ${Math.round(settings.titleOpacity * 100)}%`, "titleOpacity", 0, 1, 0.05)}
          {slider("preview-subtitle-opacity", `副标题透明度 ${Math.round(settings.subtitleOpacity * 100)}%`, "subtitleOpacity", 0, 1, 0.05)}
        </div>
        <div className="editor-field-row">
          {slider("preview-image-scale", `作品大小 ${Math.round(settings.imageScale * 100)}%`, "imageScale", 0.45, 1.25, 0.05)}
          {slider("preview-image-opacity", `作品透明度 ${Math.round(settings.imageOpacity * 100)}%`, "imageOpacity", 0, 1, 0.05)}
        </div>
        <div className="editor-field-row">
          {slider("preview-image-x", "作品水平位置", "imageOffsetX", -0.6, 0.6, 0.01)}
          {slider("preview-image-y", "作品垂直位置", "imageOffsetY", -0.6, 0.6, 0.01)}
        </div>
        <div className="editor-field-row">
          {slider("preview-title-y", "标题垂直位置", "titleOffsetY", -0.8, 0.8, 0.01)}
          {slider("preview-subtitle-y", "副标题垂直位置", "subtitleOffsetY", -0.8, 0.8, 0.01)}
        </div>
        <div className="editor-field-row">
          {slider("preview-bg-opacity", `背景透明度 ${Math.round(settings.backgroundOpacity * 100)}%`, "backgroundOpacity", 0, 1, 0.05)}
          {slider("preview-safe-area", `安全区 ${Math.round(settings.safeArea * 100)}%`, "safeArea", 0.02, 0.15, 0.01)}
        </div>
      </div>

      <div className="editor-preview-actions">
        <Button variant="outline" onClick={() => onSettingsChange({ ...defaultEditorPreviewSettings })}><RotateCcw className="h-4 w-4" />恢复默认</Button>
      </div>
    </div>
  );
}
