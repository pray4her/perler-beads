"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Clipboard, Download, Eye, PencilLine, X, type LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  buildProductionSheetModel,
  copyDisplayToClipboard,
  createPatternCsv,
  exportPatternPdf,
  type ExportKind,
  type ProductionChartStyle,
  type ProductionPaper,
  type ProductionSheetModel,
  PRODUCTION_CHART_STYLES,
  PRODUCTION_PAPERS,
  renderDisplayPng,
  renderProductPng,
  renderProductionPng,
} from "@/editor/exporters";
import { downloadBlob, exportPerlerProject } from "@/editor/projectArchive";
import type { EditorDocumentV1 } from "@/editor/types";
import { useT } from "@/i18n/context";
import { cn } from "@/lib/utils";

type ExportCenterProps = {
  readonly document: EditorDocumentV1;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenPreview: () => void;
};

type ExportCenterContextValue = {
  readonly document: EditorDocumentV1;
  readonly model: ProductionSheetModel;
  readonly paper: ProductionPaper;
  readonly setPaper: (paper: ProductionPaper) => void;
  readonly chartStyle: ProductionChartStyle;
  readonly setChartStyle: (style: ProductionChartStyle) => void;
  readonly activeExport: ExportKind | null;
  readonly canExport: boolean;
  readonly pageCount: number;
  readonly largePdfAcknowledged: boolean;
  readonly acknowledgeLargePdf: () => void;
  readonly runExport: (kind: ExportKind) => void;
  readonly onOpenPreview: () => void;
};

const ExportCenterContext = createContext<ExportCenterContextValue | null>(null);

function useExportCenter(): ExportCenterContextValue {
  const context = useContext(ExportCenterContext);
  if (!context) throw new Error("ExportCenter 子组件必须在 ExportCenter 内使用");
  return context;
}

function fileName(document: EditorDocumentV1, suffix: string, fallbackBase: string): string {
  const base = document.name.replace(/[\\/:*?"<>|]/g, "-").trim() || fallbackBase;
  return `${base}-${suffix}`;
}

function isProductionPaper(value: string | undefined): value is ProductionPaper {
  return PRODUCTION_PAPERS.some((paper) => paper === value);
}

function isProductionChartStyle(value: string | undefined): value is ProductionChartStyle {
  return PRODUCTION_CHART_STYLES.some((style) => style === value);
}

function exportFailureMessage(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function ExportAction({
  kind,
  children,
  variant = "outline",
  className,
  icon: Icon = Download,
}: {
  readonly kind: ExportKind;
  readonly children: React.ReactNode;
  readonly variant?: "default" | "outline" | "secondary";
  readonly className?: string;
  readonly icon?: LucideIcon;
}) {
  const context = useExportCenter();
  const pending = context.activeExport === kind;
  return (
    <Button
      size="lg"
      variant={variant}
      className={cn("h-11", className)}
      disabled={!context.canExport || context.activeExport !== null}
      onClick={() => context.runExport(kind)}
    >
      {pending ? <Spinner data-icon="inline-start" /> : <Icon data-icon="inline-start" />}
      {children}
    </Button>
  );
}

function ExportSummary() {
  const { document, model } = useExportCenter();
  const t = useT();
  const thumbnailSize = 10;
  const thumbnailCells = Array.from({ length: thumbnailSize * thumbnailSize }, (_, index) => {
    const row = Math.min(document.height - 1, Math.floor((Math.floor(index / thumbnailSize) + 0.5) * document.height / thumbnailSize));
    const column = Math.min(document.width - 1, Math.floor(((index % thumbnailSize) + 0.5) * document.width / thumbnailSize));
    const palette = document.palette[document.cells[row * document.width + column]];
    return palette && !palette.isExternal ? palette.color : "transparent";
  });
  return (
    <Card className="border-primary/20 bg-primary/5 shadow-none">
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{document.colorSystem}</Badge>
          <Badge variant="outline">{t.workspace.export.cellsBadge(document.width, document.height)}</Badge>
          <Badge variant="outline">{t.workspace.export.boardsBadge(model.boardColumns * model.boardRows)}</Badge>
          <Badge variant="outline">{t.workspace.export.beadsBadge(model.total)}</Badge>
          <Badge variant="outline">{t.workspace.export.colorsBadge(model.colors.length)}</Badge>
        </div>
        <div className="flex items-start gap-3">
          <div
            aria-label={t.workspace.export.thumbnailAriaLabel(document.width, document.height)}
            className="grid size-20 shrink-0 grid-cols-10 overflow-hidden rounded-lg border border-border bg-background shadow-sm"
            role="img"
          >
            {thumbnailCells.map((color, index) => (
              <span key={index} style={{ backgroundColor: color }} />
            ))}
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">{t.workspace.export.summaryTitle}</CardTitle>
            <CardDescription>{t.workspace.export.summaryDesc}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex items-center gap-1.5 pb-4">
        {model.colors.slice(0, 12).map((color) => (
          <span
            key={color.key}
            className="size-4 rounded-full border border-background shadow-sm"
            style={{ backgroundColor: color.color }}
            title={color.key}
          />
        ))}
        {model.colors.length > 12 ? <span className="pl-1 text-xs text-muted-foreground">+{model.colors.length - 12}</span> : null}
      </CardContent>
    </Card>
  );
}

function ProductionPreview() {
  const { document, paper, chartStyle, canExport } = useExportCenter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    if (!open || !canExport) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setGenerating(true);
    renderProductionPng(document, { paper, chartStyle })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setPreviewUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPreviewUrl(null);
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
    };
  }, [open, canExport, document, paper, chartStyle]);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        className="h-11"
        disabled={!canExport}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Eye data-icon="inline-start" />
        {open ? t.workspace.export.previewHide : t.workspace.export.previewShow}
      </Button>
      {open ? (
        <div className="max-h-80 overflow-auto rounded-lg border border-border bg-background">
          {previewUrl ? (
            // Client-generated blob URL: next/image cannot optimize object URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={t.workspace.export.previewAlt(document.width, document.height)}
              className="w-full"
            />
          ) : (
            <div className="flex h-32 items-center justify-center" role="status">
              {generating ? <Spinner /> : <span className="text-sm text-muted-foreground">{t.workspace.export.previewFailed}</span>}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MakingExportSection() {
  const {
    model,
    paper,
    setPaper,
    chartStyle,
    setChartStyle,
    pageCount,
    largePdfAcknowledged,
    acknowledgeLargePdf,
  } = useExportCenter();
  const t = useT();
  return (
    <Card>
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-base">{t.workspace.export.makingTitle}</CardTitle>
        <CardDescription>
          {t.workspace.export.makingDesc(model.boardColumns, model.boardRows, (model.physicalWidthMm / 10).toFixed(1), (model.physicalHeightMm / 10).toFixed(1))}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{t.workspace.export.paperSize}</span>
          <ToggleGroup
            value={[paper]}
            variant="outline"
            size="lg"
            spacing={0}
            aria-label={t.workspace.export.paperAriaLabel}
            onValueChange={(values) => {
              const next = values[0];
              if (isProductionPaper(next)) setPaper(next);
            }}
          >
            <ToggleGroupItem value="a4" className="h-11 min-w-11">A4</ToggleGroupItem>
            <ToggleGroupItem value="a3" className="h-11 min-w-11">A3</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{t.workspace.export.chartStyle}</span>
          <ToggleGroup
            value={[chartStyle]}
            variant="outline"
            size="lg"
            spacing={0}
            aria-label={t.workspace.export.chartStyleAriaLabel}
            onValueChange={(values) => {
              const next = values[0];
              if (isProductionChartStyle(next)) setChartStyle(next);
            }}
          >
            <ToggleGroupItem value="color" className="h-11 px-4">{t.workspace.export.chartColor}</ToggleGroupItem>
            <ToggleGroupItem value="symbol" className="h-11 px-4">{t.workspace.export.chartSymbol}</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <ProductionPreview />
        {pageCount > 64 && !largePdfAcknowledged ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
            {t.workspace.export.largePdfWarning(pageCount)}
            <Button variant="outline" className="mt-2 h-11" onClick={acknowledgeLargePdf}>
              {t.workspace.export.largePdfConfirm(pageCount)}
            </Button>
          </div>
        ) : null}
        <ExportAction kind="production-png" variant="default" className="w-full">
          {t.workspace.export.downloadProductionPng}
        </ExportAction>
        <ExportAction kind="production-pdf" className="w-full">
          {pageCount > 64 && !largePdfAcknowledged ? t.workspace.export.confirmLargeFirst : t.workspace.export.downloadProductionPdf(paper.toUpperCase())}
        </ExportAction>
        <p className="text-xs leading-5 text-muted-foreground">
          {t.workspace.export.productionNote}
        </p>
      </CardContent>
    </Card>
  );
}

function ShareExportSection() {
  const { onOpenPreview } = useExportCenter();
  const t = useT();
  return (
    <Card>
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-base">{t.workspace.export.shareTitle}</CardTitle>
        <CardDescription>{t.workspace.export.shareDesc}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ExportAction kind="display-png" variant="default" className="w-full">
          {t.workspace.export.downloadDisplayPng}
        </ExportAction>
        <div className="grid grid-cols-2 gap-2">
          <ExportAction kind="display-clipboard" icon={Clipboard}>{t.workspace.export.copyDisplay}</ExportAction>
          <ExportAction kind="product-png">{t.workspace.export.downloadProductPng}</ExportAction>
        </div>
        <Button variant="link" className="w-fit px-0" onClick={onOpenPreview}>
          <PencilLine data-icon="inline-start" />
          {t.workspace.export.editDisplayStyle}
        </Button>
      </CardContent>
    </Card>
  );
}

function BackupExportSection() {
  const t = useT();
  return (
    <Card>
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-base">{t.workspace.export.backupTitle}</CardTitle>
        <CardDescription>{t.workspace.export.backupDesc}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ExportAction kind="project">
          {t.workspace.export.exportProject}
        </ExportAction>
        <ExportAction kind="pattern-csv">
          {t.workspace.export.exportCsv}
        </ExportAction>
      </CardContent>
    </Card>
  );
}

function EmptyExportHint() {
  const { canExport } = useExportCenter();
  const t = useT();
  if (canExport) return null;
  return <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">{t.workspace.export.emptyHint}</p>;
}

export function ExportCenter({ document, open, onOpenChange, onOpenPreview }: ExportCenterProps) {
  const t = useT();
  const [paper, setPaper] = useState<ProductionPaper>("a4");
  const [chartStyle, setChartStyle] = useState<ProductionChartStyle>("color");
  const [activeExport, setActiveExport] = useState<ExportKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [largePdfAcknowledged, setLargePdfAcknowledged] = useState(false);
  const model = useMemo(() => buildProductionSheetModel(document, { paper }), [document, paper]);
  const canExport = model.total > 0;
  // PDF = 1 overview page + one page per pegboard + 1 materials summary page.
  const pageCount = model.pages.length + 2;

  const runExport = useCallback((kind: ExportKind) => {
    if (!canExport || activeExport) return;
    if (kind === "production-pdf" && pageCount > 64 && !largePdfAcknowledged) {
      setFailure(t.workspace.export.confirmLargeBeforePdf);
      return;
    }
    const execute = async () => {
      setActiveExport(kind);
      setMessage(null);
      setFailure(null);
      try {
        switch (kind) {
          case "display-png":
            downloadBlob(await renderDisplayPng(document), fileName(document, t.workspace.export.suffixDisplayPng, t.workspace.export.defaultBaseName));
            setMessage(t.workspace.export.msgDisplayPng);
            break;
          case "display-clipboard":
            await copyDisplayToClipboard(document);
            setMessage(t.workspace.export.msgCopied);
            break;
          case "product-png":
            downloadBlob(await renderProductPng(document), fileName(document, t.workspace.export.suffixProductPng, t.workspace.export.defaultBaseName));
            setMessage(t.workspace.export.msgProductPng);
            break;
          case "production-png":
            downloadBlob(await renderProductionPng(document, { paper, chartStyle }), fileName(document, t.workspace.export.suffixProductionPng(paper.toUpperCase()), t.workspace.export.defaultBaseName));
            setMessage(t.workspace.export.msgProductionPng);
            break;
          case "production-pdf":
            downloadBlob(await exportPatternPdf(document, { paper, chartStyle }), fileName(document, t.workspace.export.suffixProductionPdf(paper.toUpperCase()), t.workspace.export.defaultBaseName));
            setMessage(t.workspace.export.msgProductionPdf);
            break;
          case "pattern-csv":
            downloadBlob(createPatternCsv(document), fileName(document, t.workspace.export.suffixCsv, t.workspace.export.defaultBaseName));
            setMessage(t.workspace.export.msgCsv);
            break;
          case "project":
            downloadBlob(await exportPerlerProject(document), fileName(document, t.workspace.export.suffixProject, t.workspace.export.defaultBaseName));
            setMessage(t.workspace.export.msgProject);
            break;
        }
      } catch (reason) {
        setFailure(exportFailureMessage(reason, t.workspace.export.genericFailure));
      } finally {
        setActiveExport(null);
      }
    };
    void execute();
  }, [activeExport, canExport, chartStyle, document, largePdfAcknowledged, pageCount, paper, t]);

  const contextValue = useMemo<ExportCenterContextValue>(() => ({
    document,
    model,
    paper,
    setPaper,
    chartStyle,
    setChartStyle,
    activeExport,
    canExport,
    pageCount,
    largePdfAcknowledged,
    acknowledgeLargePdf: () => setLargePdfAcknowledged(true),
    runExport,
    onOpenPreview: () => {
      onOpenChange(false);
      onOpenPreview();
    },
  }), [activeExport, canExport, chartStyle, document, largePdfAcknowledged, model, onOpenChange, onOpenPreview, pageCount, paper, runExport]);

  return (
    <ExportCenterContext.Provider value={contextValue}>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full gap-0 data-[side=right]:w-full sm:data-[side=right]:max-w-lg"
        >
          <SheetHeader className="relative shrink-0 border-b bg-popover pr-14">
            <SheetTitle>{t.workspace.export.title}</SheetTitle>
            <SheetDescription>{t.workspace.export.description}</SheetDescription>
            <SheetClose
              aria-label={t.workspace.export.closeAriaLabel}
              render={<Button variant="ghost" className="absolute top-1/2 right-3 size-11 -translate-y-1/2" />}
            >
              <X />
              <span className="sr-only">{t.workspace.export.closeAriaLabel}</span>
            </SheetClose>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-4 p-4 pb-6">
              <ExportSummary />
              <EmptyExportHint />
              <MakingExportSection />
              <ShareExportSection />
              <BackupExportSection />
              {message ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p> : null}
              {failure ? <p role="alert" className="text-sm text-destructive">{failure}</p> : null}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </ExportCenterContext.Provider>
  );
}
