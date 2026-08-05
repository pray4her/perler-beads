"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useIsMobileEditor } from "@/hooks/useMatchMedia";

interface ChromeState {
  isMobile: boolean;
  colorSheetOpen: boolean;
  inspectorSheetOpen: boolean;
  moreSheetOpen: boolean;
}

interface ChromeActions {
  openColorSheet: () => void;
  openInspectorSheet: () => void;
  openMoreSheet: () => void;
  setColorSheetOpen: (open: boolean) => void;
  setInspectorSheetOpen: (open: boolean) => void;
  setMoreSheetOpen: (open: boolean) => void;
  closeAllSheets: () => void;
}

interface ChromeMeta {
  /** Reserved for future focus traps / refs. */
  mobileBarId: string;
}

interface ChromeContextValue {
  state: ChromeState;
  actions: ChromeActions;
  meta: ChromeMeta;
}

const PixelEditorChromeContext = createContext<ChromeContextValue | null>(null);

export function PixelEditorChromeProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobileEditor();
  const [colorSheetOpen, setColorSheetOpen] = useState(false);
  const [inspectorSheetOpen, setInspectorSheetOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);

  const value = useMemo<ChromeContextValue>(() => {
    const closeAllSheets = () => {
      setColorSheetOpen(false);
      setInspectorSheetOpen(false);
      setMoreSheetOpen(false);
    };
    return {
      state: {
        isMobile,
        colorSheetOpen: isMobile && colorSheetOpen,
        inspectorSheetOpen: isMobile && inspectorSheetOpen,
        moreSheetOpen: isMobile && moreSheetOpen,
      },
      actions: {
        openColorSheet: () => {
          setInspectorSheetOpen(false);
          setMoreSheetOpen(false);
          setColorSheetOpen(true);
        },
        openInspectorSheet: () => {
          setColorSheetOpen(false);
          setMoreSheetOpen(false);
          setInspectorSheetOpen(true);
        },
        openMoreSheet: () => {
          setColorSheetOpen(false);
          setInspectorSheetOpen(false);
          setMoreSheetOpen(true);
        },
        setColorSheetOpen: (open) => {
          if (open) {
            setInspectorSheetOpen(false);
            setMoreSheetOpen(false);
          }
          setColorSheetOpen(open);
        },
        setInspectorSheetOpen: (open) => {
          if (open) {
            setColorSheetOpen(false);
            setMoreSheetOpen(false);
          }
          setInspectorSheetOpen(open);
        },
        setMoreSheetOpen: (open) => {
          if (open) {
            setColorSheetOpen(false);
            setInspectorSheetOpen(false);
          }
          setMoreSheetOpen(open);
        },
        closeAllSheets,
      },
      meta: { mobileBarId: "pixel-editor-mobile-bar" },
    };
  }, [isMobile, colorSheetOpen, inspectorSheetOpen, moreSheetOpen]);

  return (
    <PixelEditorChromeContext.Provider value={value}>
      {children}
    </PixelEditorChromeContext.Provider>
  );
}

export function usePixelEditorChrome(): ChromeContextValue {
  const value = useContext(PixelEditorChromeContext);
  if (!value) {
    throw new Error("usePixelEditorChrome must be used within PixelEditorChromeProvider");
  }
  return value;
}
