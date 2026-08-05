"use client";

import type { ComponentType } from "react";
import { Palette, PanelBottom } from "lucide-react";
import { usePixelEditorChrome } from "@/components/editor/PixelEditorChromeContext";
import type { EditorTool } from "@/types/editorTypes";

interface ToolDefinition {
  id: EditorTool;
  shortcut: string;
  icon: ComponentType<{ className?: string }>;
}

interface PixelEditorMobileBottomBarProps {
  tools: ToolDefinition[];
  tool: EditorTool;
  toolLabels: Record<EditorTool, string>;
  toolbarAriaLabel: string;
  toolTitle: (label: string, shortcut: string) => string;
  colorLabel: string;
  panelLabel: string;
  onSelectTool: (tool: EditorTool) => void;
  onOpenColor: () => void;
}

export function PixelEditorMobileBottomBar({
  tools,
  tool,
  toolLabels,
  toolbarAriaLabel,
  toolTitle,
  colorLabel,
  panelLabel,
  onSelectTool,
  onOpenColor,
}: PixelEditorMobileBottomBarProps) {
  const {
    state: { inspectorSheetOpen },
    actions: { openInspectorSheet },
    meta: { mobileBarId },
  } = usePixelEditorChrome();

  return (
    <div id={mobileBarId} className="pixel-editor-mobile-bar">
      <div
        className="pixel-editor-mobile-tools"
        role="toolbar"
        aria-label={toolbarAriaLabel}
        aria-orientation="horizontal"
      >
        {tools.map((definition) => {
          const Icon = definition.icon;
          const label = toolLabels[definition.id];
          return (
            <button
              key={definition.id}
              type="button"
              className={tool === definition.id ? "is-active" : ""}
              aria-pressed={tool === definition.id}
              title={toolTitle(label, definition.shortcut)}
              onClick={() => onSelectTool(definition.id)}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <div className="pixel-editor-mobile-actions">
        <button type="button" className="pixel-editor-mobile-action" onClick={onOpenColor}>
          <Palette className="h-5 w-5" aria-hidden="true" />
          <span>{colorLabel}</span>
        </button>
        <button
          type="button"
          className={inspectorSheetOpen ? "pixel-editor-mobile-action is-active" : "pixel-editor-mobile-action"}
          aria-pressed={inspectorSheetOpen}
          onClick={openInspectorSheet}
        >
          <PanelBottom className="h-5 w-5" aria-hidden="true" />
          <span>{panelLabel}</span>
        </button>
      </div>
    </div>
  );
}
