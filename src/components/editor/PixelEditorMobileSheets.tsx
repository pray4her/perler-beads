"use client";

import type { ReactNode } from "react";
import { usePixelEditorChrome } from "@/components/editor/PixelEditorChromeContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface PixelEditorMobileSheetsProps {
  colorTitle: string;
  panelTitle: string;
  moreTitle: string;
  /** Reserved; inspector/color use the mounted aside sheet via CSS. */
  colorContent: ReactNode;
  inspectorContent: ReactNode;
  moreContent: ReactNode;
}

function SheetHandle() {
  return (
    <div className="flex justify-center py-2" aria-hidden="true">
      <div className="h-1 w-10 rounded-full bg-muted" />
    </div>
  );
}

/** Mobile "more" actions sheet. Color/inspector open the mounted aside as a CSS bottom sheet. */
export function PixelEditorMobileSheets({
  moreTitle,
  moreContent,
}: PixelEditorMobileSheetsProps) {
  const {
    state: { moreSheetOpen },
    actions: { setMoreSheetOpen },
  } = usePixelEditorChrome();

  return (
    <Sheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="pixel-editor-mobile-sheet max-h-[75dvh] gap-0 rounded-t-2xl p-0"
      >
        <SheetHandle />
        <SheetHeader className="px-4 pb-2">
          <SheetTitle>{moreTitle}</SheetTitle>
        </SheetHeader>
        <div className="pixel-editor-mobile-sheet-body overflow-y-auto px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
          {moreSheetOpen ? moreContent : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
