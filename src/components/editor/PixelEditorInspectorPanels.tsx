"use client";

import type { ReactNode } from "react";

export type InspectorTabId = "color" | "selection" | "canvas" | "make" | "preview" | "history";

const TAB_IDS: InspectorTabId[] = ["color", "selection", "canvas", "make", "preview", "history"];

interface PixelEditorInspectorPanelsProps {
  tab: InspectorTabId;
  onTabChange: (tab: InspectorTabId) => void;
  tabsAriaLabel: string;
  tabLabels: Record<InspectorTabId, string>;
  /** When true, only the body is shown (color quick sheet). */
  hideTabs?: boolean;
  children: ReactNode;
}

export function PixelEditorInspectorPanels({
  tab,
  onTabChange,
  tabsAriaLabel,
  tabLabels,
  hideTabs = false,
  children,
}: PixelEditorInspectorPanelsProps) {
  return (
    <>
      {hideTabs ? null : (
        <nav className="pixel-editor-tabs" role="tablist" aria-label={tabsAriaLabel}>
          {TAB_IDS.map((id) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={tab === id}
              className={tab === id ? "is-active" : ""}
              onClick={() => onTabChange(id)}
            >
              {tabLabels[id]}
            </button>
          ))}
        </nav>
      )}
      <div className="pixel-editor-inspector-body">{children}</div>
    </>
  );
}
