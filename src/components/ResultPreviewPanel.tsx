"use client";

import { useEffect, useRef } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PreviewSettings } from "@/types/editorTypes";
import { MappedPixel } from "@/utils/pixelation";
import { downloadCanvasPng, renderDisplayPreview } from "@/utils/previewRenderer";

interface ResultPreviewPanelProps {
  grid: MappedPixel[][];
  settings: PreviewSettings;
  onSettingsChange: (settings: PreviewSettings) => void;
}

export default function ResultPreviewPanel({
  grid,
  settings,
  onSettingsChange,
}: ResultPreviewPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) renderDisplayPreview(canvasRef.current, grid, settings);
  }, [grid, settings]);

  const update = <Key extends keyof PreviewSettings>(key: Key, value: PreviewSettings[Key]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="editor-preview-panel">
      <div className="editor-preview-stage">
        <canvas ref={canvasRef} className="editor-preview-canvas" aria-label="展示预览" />
      </div>

      <div className="editor-inspector-section">
        <div className="editor-field">
          <Label htmlFor="preview-title">作品标题</Label>
          <input
            id="preview-title"
            value={settings.title}
            onChange={(event) => update("title", event.target.value)}
            className="editor-input"
          />
        </div>
        <div className="editor-field">
          <Label htmlFor="preview-subtitle">副标题</Label>
          <input
            id="preview-subtitle"
            value={settings.subtitle}
            onChange={(event) => update("subtitle", event.target.value)}
            className="editor-input"
          />
        </div>
        <div className="editor-field-row">
          <div className="editor-field">
            <Label htmlFor="preview-font">字体</Label>
            <select
              id="preview-font"
              value={settings.fontFamily}
              onChange={(event) => update("fontFamily", event.target.value as PreviewSettings["fontFamily"])}
              className="editor-input"
            >
              <option value="sans">现代黑体</option>
              <option value="serif">宋体</option>
              <option value="mono">等宽字体</option>
              <option value="handwriting">楷体</option>
            </select>
          </div>
          <div className="editor-field">
            <Label htmlFor="preview-weight">字重</Label>
            <select
              id="preview-weight"
              value={settings.fontWeight}
              onChange={(event) => update("fontWeight", event.target.value as PreviewSettings["fontWeight"])}
              className="editor-input"
            >
              <option value="400">常规</option>
              <option value="600">半粗</option>
              <option value="700">粗体</option>
            </select>
          </div>
        </div>
        <div className="editor-field-row">
          <div className="editor-field">
            <Label htmlFor="preview-text-color">文字颜色</Label>
            <input
              id="preview-text-color"
              type="color"
              value={settings.textColor}
              onChange={(event) => update("textColor", event.target.value)}
              className="editor-color-input"
            />
          </div>
          <div className="editor-field">
            <Label htmlFor="preview-bg-color">背景颜色</Label>
            <input
              id="preview-bg-color"
              type="color"
              value={settings.backgroundColor}
              onChange={(event) => update("backgroundColor", event.target.value)}
              className="editor-color-input"
            />
          </div>
        </div>
        <div className="editor-field">
          <Label htmlFor="preview-opacity">文字透明度 {Math.round(settings.textOpacity * 100)}%</Label>
          <input
            id="preview-opacity"
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={settings.textOpacity}
            onChange={(event) => update("textOpacity", Number(event.target.value))}
          />
        </div>
        <div className="editor-field">
          <Label htmlFor="preview-size">标题字号 {settings.titleSize}</Label>
          <input
            id="preview-size"
            type="range"
            min="20"
            max="72"
            value={settings.titleSize}
            onChange={(event) => update("titleSize", Number(event.target.value))}
          />
        </div>
        <div className="editor-field">
          <Label htmlFor="preview-image-scale">图案大小 {Math.round(settings.imageScale * 100)}%</Label>
          <input
            id="preview-image-scale"
            type="range"
            min="0.55"
            max="1.25"
            step="0.05"
            value={settings.imageScale}
            onChange={(event) => update("imageScale", Number(event.target.value))}
          />
        </div>
        <div className="editor-field">
          <Label htmlFor="preview-image-offset">图案上下位置</Label>
          <input
            id="preview-image-offset"
            type="range"
            min="-0.5"
            max="0.6"
            step="0.05"
            value={settings.imageOffsetY}
            onChange={(event) => update("imageOffsetY", Number(event.target.value))}
          />
        </div>
        <div className="editor-segmented" aria-label="预览比例">
          {(["1:1", "4:5", "9:16"] as const).map((ratio) => (
            <button
              key={ratio}
              type="button"
              className={settings.aspectRatio === ratio ? "is-active" : ""}
              onClick={() => update("aspectRatio", ratio)}
            >
              {ratio}
            </button>
          ))}
        </div>
      </div>

      <Button
        className="w-full"
        onClick={() => canvasRef.current && downloadCanvasPng(canvasRef.current, "perler-display-preview.png")}
      >
        <Download className="h-4 w-4" />
        下载展示图
      </Button>
    </div>
  );
}
