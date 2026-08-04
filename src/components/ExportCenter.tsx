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

function fileName(document: EditorDocumentV1, suffix: string): string {
  const base = document.name.replace(/[\\/:*?"<>|]/g, "-").trim() || "拼豆作品";
  return `${base}-${suffix}`;
}

function isProductionPaper(value: string | undefined): value is ProductionPaper {
  return PRODUCTION_PAPERS.some((paper) => paper === value);
}

function isProductionChartStyle(value: string | undefined): value is ProductionChartStyle {
  return PRODUCTION_CHART_STYLES.some((style) => style === value);
}

function exportFailureMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : "文件生成失败，请重试";
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
          <Badge variant="outline">{document.width} × {document.height} 格</Badge>
          <Badge variant="outline">{model.boardColumns * model.boardRows} 块板</Badge>
          <Badge variant="outline">{model.total} 颗</Badge>
          <Badge variant="outline">{model.colors.length} 种色号</Badge>
        </div>
        <div className="flex items-start gap-3">
          <div
            aria-label={`作品缩略图：${document.width} × ${document.height} 格`}
            className="grid size-20 shrink-0 grid-cols-10 overflow-hidden rounded-lg border border-border bg-background shadow-sm"
            role="img"
          >
            {thumbnailCells.map((color, index) => (
              <span key={index} style={{ backgroundColor: color }} />
            ))}
          </div>
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base">导出当前作品</CardTitle>
            <CardDescription>展示图使用你在“展示预览”中设置的标题、背景和画面比例。</CardDescription>
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
        {open ? "收起底稿预览" : "预览制作底稿"}
      </Button>
      {open ? (
        <div className="max-h-80 overflow-auto rounded-lg border border-border bg-background">
          {previewUrl ? (
            // Client-generated blob URL: next/image cannot optimize object URLs.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`制作底稿预览：${document.width} × ${document.height} 格，含色号网格、边缘坐标和用料清单`}
              className="w-full"
            />
          ) : (
            <div className="flex h-32 items-center justify-center" role="status">
              {generating ? <Spinner /> : <span className="text-sm text-muted-foreground">预览生成失败，请重试</span>}
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
  return (
    <Card>
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-base">实际制作</CardTitle>
        <CardDescription>
          {model.boardColumns} × {model.boardRows} 块板 · 约 {(model.physicalWidthMm / 10).toFixed(1)} × {(model.physicalHeightMm / 10).toFixed(1)} cm
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">纸张大小</span>
          <ToggleGroup
            value={[paper]}
            variant="outline"
            size="lg"
            spacing={0}
            aria-label="制作底稿纸张大小"
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
          <span className="text-sm font-medium">图纸样式</span>
          <ToggleGroup
            value={[chartStyle]}
            variant="outline"
            size="lg"
            spacing={0}
            aria-label="制作底稿图纸样式"
            onValueChange={(values) => {
              const next = values[0];
              if (isProductionChartStyle(next)) setChartStyle(next);
            }}
          >
            <ToggleGroupItem value="color" className="h-11 px-4">彩色</ToggleGroupItem>
            <ToggleGroupItem value="symbol" className="h-11 px-4">符号</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <ProductionPreview />
        {pageCount > 64 && !largePdfAcknowledged ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
            此底稿将生成 {pageCount} 页 PDF，文件较大。确认后才会开始生成。
            <Button variant="outline" className="mt-2 h-11" onClick={acknowledgeLargePdf}>
              继续生成 {pageCount} 页 PDF
            </Button>
          </div>
        ) : null}
        <ExportAction kind="production-png" variant="default" className="w-full">
          下载制作底稿图片
        </ExportAction>
        <ExportAction kind="production-pdf" className="w-full">
          {pageCount > 64 && !largePdfAcknowledged ? "请先确认大文件" : `下载制作底稿 PDF（${paper.toUpperCase()}）`}
        </ExportAction>
        <p className="text-xs leading-5 text-muted-foreground">
          底稿包含色号网格、边缘坐标、总颗数和用料清单；符号样式用黑白符号代替填色，适合黑白打印。图片适合在屏幕上对照制作；打印请下载 PDF 并按 100% 比例（不要「适应页面」）。
        </p>
      </CardContent>
    </Card>
  );
}

function ShareExportSection() {
  const { onOpenPreview } = useExportCenter();
  return (
    <Card>
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-base">分享 / 保存作品</CardTitle>
        <CardDescription>先生成可以直接保存或发送的展示图。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ExportAction kind="display-png" variant="default" className="w-full">
          下载展示图 PNG
        </ExportAction>
        <div className="grid grid-cols-2 gap-2">
          <ExportAction kind="display-clipboard" icon={Clipboard}>复制展示图</ExportAction>
          <ExportAction kind="product-png">下载透明原图 PNG</ExportAction>
        </div>
        <Button variant="link" className="w-fit px-0" onClick={onOpenPreview}>
          <PencilLine data-icon="inline-start" />
          编辑展示样式
        </Button>
      </CardContent>
    </Card>
  );
}

function BackupExportSection() {
  return (
    <Card>
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="text-base">备份 / 交换</CardTitle>
        <CardDescription>备份可继续编辑的项目，或导出可再次导入的色号网格。</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <ExportAction kind="project">
          可编辑项目 .perler
        </ExportAction>
        <ExportAction kind="pattern-csv">
          色号网格 CSV
        </ExportAction>
      </CardContent>
    </Card>
  );
}

function EmptyExportHint() {
  const { canExport } = useExportCenter();
  if (canExport) return null;
  return <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">先添加至少一颗拼豆，再导出作品。</p>;
}

export function ExportCenter({ document, open, onOpenChange, onOpenPreview }: ExportCenterProps) {
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
      setFailure("请先确认大文件，再开始生成 PDF。");
      return;
    }
    const execute = async () => {
      setActiveExport(kind);
      setMessage(null);
      setFailure(null);
      try {
        switch (kind) {
          case "display-png":
            downloadBlob(await renderDisplayPng(document), fileName(document, "展示图.png"));
            setMessage("展示图 PNG 已开始下载");
            break;
          case "display-clipboard":
            await copyDisplayToClipboard(document);
            setMessage("展示图已复制到剪贴板");
            break;
          case "product-png":
            downloadBlob(await renderProductPng(document), fileName(document, "透明原图.png"));
            setMessage("透明原图 PNG 已开始下载");
            break;
          case "production-png":
            downloadBlob(await renderProductionPng(document, { paper, chartStyle }), fileName(document, `制作底稿-${paper.toUpperCase()}.png`));
            setMessage("制作底稿图片已开始下载");
            break;
          case "production-pdf":
            downloadBlob(await exportPatternPdf(document, { paper, chartStyle }), fileName(document, `制作底稿-${paper.toUpperCase()}.pdf`));
            setMessage("制作底稿 PDF 已开始下载");
            break;
          case "pattern-csv":
            downloadBlob(createPatternCsv(document), fileName(document, "色号网格.csv"));
            setMessage("色号网格 CSV 已开始下载");
            break;
          case "project":
            downloadBlob(await exportPerlerProject(document), fileName(document, "可编辑项目.perler"));
            setMessage("可编辑项目已开始下载");
            break;
        }
      } catch (reason) {
        setFailure(exportFailureMessage(reason));
      } finally {
        setActiveExport(null);
      }
    };
    void execute();
  }, [activeExport, canExport, chartStyle, document, largePdfAcknowledged, pageCount, paper]);

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
            <SheetTitle>导出作品</SheetTitle>
            <SheetDescription>所有文件都在当前设备生成；按用途选择所需格式。</SheetDescription>
            <SheetClose
              aria-label="关闭导出面板"
              render={<Button variant="ghost" className="absolute top-1/2 right-3 size-11 -translate-y-1/2" />}
            >
              <X />
              <span className="sr-only">关闭导出面板</span>
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
