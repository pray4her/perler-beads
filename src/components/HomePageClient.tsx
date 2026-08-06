'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback, startTransition } from 'react';
import HomeLanding from '@/components/HomeLanding';
import SupportRail from '@/components/SupportRail';
import ImagePrepareOverlay from '@/components/ImagePrepareOverlay';
import GenerationParamsSheet from '@/components/GenerationParamsSheet';

// 导入像素化工具和类型
import {
  PixelationMode,
  calculatePixelGrid,
  postProcessMappedGrid,
  DEFAULT_GRANULARITY,
  DEFAULT_SIMILARITY_THRESHOLD,
  PaletteColor,
  MappedPixel,
  hexToRgb,
  findClosestPaletteColor
} from '@/utils/pixelation';

import { parsePatternCsv } from "@/editor/patternCsv";

import { 
  getColorKeyByHex,
  getMardToHexMapping,
  sortColorsByHue,
  ColorSystem 
} from '@/utils/colorSystemUtils';

// 从colorSystemMapping.json获取所有MARD色号
const mardToHexMapping = getMardToHexMapping();

// Pre-process the FULL palette data once - 使用colorSystemMapping而不是beadPaletteData
const fullBeadPalette: PaletteColor[] = Object.entries(mardToHexMapping)
  .map(([mardKey, hex]) => {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      console.warn(`Invalid hex code "${hex}" for MARD key "${mardKey}". Skipping.`);
      return null;
    }
    // 使用hex值作为key，符合新的架构设计
    return { key: hex, hex, rgb };
  })
  .filter((color): color is PaletteColor => color !== null);

// ++ Add definition for background color keys ++

// 1. 导入新组件
import GridTooltip from '@/components/GridTooltip';
import CustomPaletteEditor from '@/components/CustomPaletteEditor';
import { presetToSelections } from '@/editor/palettePresets';
import type { PaletteSelections } from '@/editor/paletteSettings';
import { recalculateColorStats } from '@/utils/pixelEditingUtils';
import {
  removeExternalBackground,
} from "@/utils/backgroundRemoval";
import PixelEditorWorkspace from '@/components/PixelEditorWorkspace';
import { createEditorDocument, editorDocumentToGrid } from '@/editor/document';
import { useLanguage } from '@/i18n/context';
import { canonicalFocusPath } from '@/i18n/site';
import type { EditorCommitResult } from '@/editor/types';
import type { SelectedFileRef } from '@/platform/contracts';
import { webPlatform } from '@/platform/web';

type EditSnapshot = {
  readonly mappedPixelData: MappedPixel[][];
  readonly colorCounts: Record<string, { readonly count: number; readonly color: string }>;
  readonly totalBeadCount: number;
};

type ToastNotice = {
  readonly message: string;
  readonly action: "undo-background" | null;
};

export default function HomePageClient() {
  const { lang, t } = useLanguage();
  // 数字格式随语言变化（zh-CN / en-US），不放模块级避免可变共享状态
  const beadCountFormatter = useMemo(
    () => new Intl.NumberFormat(lang === "zh" ? "zh-CN" : "en-US"),
    [lang],
  );
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null);
  const [prepareImageSrc, setPrepareImageSrc] = useState<string | null>(null);
  const [isPrepareSubmitting, setIsPrepareSubmitting] = useState(false);
  const [prepareSubmitError, setPrepareSubmitError] = useState<string | null>(null);
  const [pendingEnterEdit, setPendingEnterEdit] = useState(false);
  const [editorMountId, setEditorMountId] = useState(0);
  const [isGenerationSheetOpen, setIsGenerationSheetOpen] = useState(false);
  const pendingEditorRemountRef = useRef(false);
  const automaticBackgroundCleanupEnabledRef = useRef(false);
  const [granularity, setGranularity] = useState<number>(DEFAULT_GRANULARITY);
  const [granularityInput, setGranularityInput] = useState<string>(String(DEFAULT_GRANULARITY));
  const [similarityThreshold, setSimilarityThreshold] = useState<number>(DEFAULT_SIMILARITY_THRESHOLD);
  const [similarityThresholdInput, setSimilarityThresholdInput] = useState<string>(String(DEFAULT_SIMILARITY_THRESHOLD));
  // 添加像素化模式状态
  const [pixelationMode, setPixelationMode] = useState<PixelationMode>(PixelationMode.Dominant); // 默认为卡通模式
  
  // 新增：色号系统选择状态
  const [selectedColorSystem, setSelectedColorSystem] = useState<ColorSystem>('MARD');
  
  // 状态变量：存储被排除的颜色（hex值）
  const [excludedColorKeys, setExcludedColorKeys] = useState<Set<string>>(new Set());
  // 用于记录初始网格颜色（hex值），用于显示排除功能
  const [initialGridColorKeys, setInitialGridColorKeys] = useState<Set<string>>(new Set());
  const [mappedPixelData, setMappedPixelData] = useState<MappedPixel[][] | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);
  const [colorCounts, setColorCounts] = useState<{ [key: string]: { count: number; color: string } } | null>(null);
  const [totalBeadCount, setTotalBeadCount] = useState<number>(0);
  const [tooltipData, setTooltipData] = useState<{ x: number, y: number, key: string, color: string } | null>(null);
  const [remapTrigger, setRemapTrigger] = useState<number>(0);
  const [isManualColoringMode, setIsManualColoringMode] = useState<boolean>(false);
  const [, setSelectedColor] = useState<MappedPixel | null>(null);
  // 新增：一键擦除模式状态
  const [, setIsEraseMode] = useState<boolean>(false);
  const [customPaletteSelections, setCustomPaletteSelections] = useState<PaletteSelections>({});
  const [isCustomPaletteEditorOpen, setIsCustomPaletteEditorOpen] = useState<boolean>(false);
  const [, setIsCustomPalette] = useState<boolean>(false);
  
  // 新增：组件挂载状态
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // 新增：编辑撤回历史栈（多步）
  const [, setEditHistory] = useState<EditSnapshot[]>([]);

  // 新增：一键去背景撤回快照（单步）
  const [bgRemovalSnapshot, setBgRemovalSnapshot] = useState<EditSnapshot | null>(null);

  // 新增：轻量提示
  const [toastNotice, setToastNotice] = useState<ToastNotice | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, action: ToastNotice["action"] = null) => {
    // 清除上一次未完成的定时器，避免新提示被旧定时器提前关掉
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastNotice({ message, action });
    toastTimerRef.current = setTimeout(() => {
      toastTimerRef.current = null;
      setToastNotice(null);
    }, action ? 6_000 : 2_500);
  }, []);

  // 卸载时清理 toast 定时器
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // --- 撤回功能 ---

  // 一键去背景单步撤回
  const handleUndoBgRemoval = useCallback(() => {
    if (!bgRemovalSnapshot) return;
    setMappedPixelData(bgRemovalSnapshot.mappedPixelData);
    setColorCounts(bgRemovalSnapshot.colorCounts);
    setTotalBeadCount(bgRemovalSnapshot.totalBeadCount);
    setBgRemovalSnapshot(null);
    // 与去背景一致：重建编辑器文档，避免工作台旧文档覆盖撤回结果
    if (isManualColoringMode) {
      setEditorMountId((value) => value + 1);
    }
    showToast(t.home.backgroundRemoval.undone);
  }, [bgRemovalSnapshot, isManualColoringMode, showToast, t]);

  // 清空编辑历史（参数变化、退出编辑模式等时调用）
  const clearEditHistory = useCallback(() => {
    setEditHistory([]);
  }, []);

  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const pixelatedCanvasRef = useRef<HTMLCanvasElement>(null);

  // ++ 添加: Ref for import file input ++

  //const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  // ++ Re-add touch refs needed for tooltip logic ++
  //const touchStartPosRef = useRef<{ x: number; y: number; pageX: number; pageY: number } | null>(null);
  //const touchMovedRef = useRef<boolean>(false);

  // ++ Add a ref for the main element ++
  const mainRef = useRef<HTMLElement>(null);

  // 像素化请求序号：每次调用 pixelateImage 自增，过期的 img.onload/onerror 结果直接忽略，
  // 防止 50ms 防抖期间发出的旧请求（解码更慢）覆盖新请求的结果
  const pixelateRequestRef = useRef(0);

  // --- Derived State ---

  // activeBeadPalette 规则（唯一来源）：仅按自定义色板选择和排除列表过滤 fullBeadPalette，
  // key 保持为 hex 值，不做色号系统转换 —— 像素化匹配只依赖 rgb/hex，
  // 通过 getColorKeyByHex(hex, selectedColorSystem) 按需转换。
  const activeBeadPalette = useMemo(() => {
    return fullBeadPalette.filter(color => {
      const normalizedHex = color.hex.toUpperCase();
      return Boolean(customPaletteSelections[normalizedHex]) && !excludedColorKeys.has(normalizedHex);
    });
  }, [customPaletteSelections, excludedColorKeys]);

  // ++ 添加：当状态变化时同步更新输入框的值 ++
  useEffect(() => {
    setGranularityInput(granularity.toString());
    setSimilarityThresholdInput(similarityThreshold.toString());
  }, [granularity, similarityThreshold]);

  useEffect(() => {
    if (isManualColoringMode) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [isManualColoringMode]);

  // ++ Calculate unique colors currently on the grid for the palette ++
  const currentGridColors = useMemo(() => {
    if (!mappedPixelData) return [];
    // 使用hex值进行去重，避免多个MARD色号对应同一个目标色号系统值时产生重复key
    const uniqueColorsMap = new Map<string, MappedPixel>();
    mappedPixelData.flat().forEach(cell => {
      if (cell && cell.color && !cell.isExternal) {
        const hexKey = cell.color.toUpperCase();
        if (!uniqueColorsMap.has(hexKey)) {
          // 存储hex值作为key，保持颜色信息
          uniqueColorsMap.set(hexKey, { key: cell.key, color: cell.color });
        }
      }
    });
    
    // 转换为数组并为每个hex值生成对应的色号系统显示
    const originalColors = Array.from(uniqueColorsMap.values());
    
    const colorData = originalColors.map(color => {
      const displayKey = getColorKeyByHex(color.color.toUpperCase(), selectedColorSystem);
      return {
        key: displayKey,
        color: color.color
      };
    });

    // 使用色相排序而不是色号排序
    return sortColorsByHue(colorData);
  }, [mappedPixelData, selectedColorSystem]);

  useEffect(() => {
    let cancelled = false;
    void webPlatform.persistence.loadPaletteSelections().then(async (savedSelections) => {
      if (cancelled) return;
      const allHexValues = fullBeadPalette.map((color) => color.hex.toUpperCase());
      const validSelections: PaletteSelections = {};
      for (const [key, value] of Object.entries(savedSelections ?? {})) {
        if (/^#[0-9A-F]{6}$/i.test(key) && allHexValues.includes(key.toUpperCase())) {
          validSelections[key.toUpperCase()] = value;
        }
      }
      if (Object.keys(validSelections).length > 0) {
        setCustomPaletteSelections(validSelections);
        setIsCustomPalette(true);
        return;
      }
      if (savedSelections) await webPlatform.persistence.clearPaletteSelections();
      setCustomPaletteSelections(presetToSelections(allHexValues, allHexValues));
      setIsCustomPalette(false);
    }).catch((error) => {
      console.error("Unable to load palette selections:", error);
      if (cancelled) return;
      const allHexValues = fullBeadPalette.map((color) => color.hex.toUpperCase());
      setCustomPaletteSelections(presetToSelections(allHexValues, allHexValues));
      setIsCustomPalette(false);
    });
    return () => { cancelled = true; };
  }, []);

  // --- Event Handlers ---

  const triggerFileInput = () => {
    void webPlatform.files.select("source").then((file) => {
      if (file) processFile(file);
    }).catch((error) => console.error("Unable to select a source file:", error));
  };

  const loadExampleImage = useCallback(() => {
    automaticBackgroundCleanupEnabledRef.current = false;
    setPrepareImageSrc(null);
    setIsPrepareSubmitting(false);
    setPrepareSubmitError(null);
    setOriginalImageSrc('/home/OriginalImage1.png');
    setMappedPixelData(null);
    setGridDimensions(null);
    setColorCounts(null);
    setTotalBeadCount(0);
    setGranularity(48);
    setGranularityInput('48');
    setPendingEnterEdit(true);
    setRemapTrigger((value) => value + 1);
  }, []);

  const processFile = (file: SelectedFileRef) => {
      // 检查文件类型是否支持
      const fileName = file.name.toLowerCase();
      const fileType = file.mimeType.toLowerCase();
      
      // 支持的图片类型
      const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      // 支持的CSV MIME类型（不同浏览器可能返回不同的MIME类型）
      const supportedCsvTypes = ['text/csv', 'application/csv', 'text/plain'];

      const isImageFile = supportedImageTypes.includes(fileType) || fileType.startsWith('image/');
      const isCsvFile = supportedCsvTypes.includes(fileType) || fileName.endsWith('.csv');

      if (isImageFile || isCsvFile) {
        setExcludedColorKeys(new Set()); // ++ 重置排除列表 ++
        void processSelectedFile(file);
      } else {
        alert(t.home.alerts.unsupportedFileType(file.mimeType || t.home.common.unknownFileType, file.name));
        console.warn(`Unsupported file type: ${file.mimeType}, file name: ${file.name}`);
      }
  };

  // 根据mappedPixelData生成合成的originalImageSrc
  const generateSyntheticImageFromPixelData = (pixelData: MappedPixel[][], dimensions: { N: number; M: number }): string => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      console.error('无法创建canvas上下文');
      return '';
    }
    
    // 设置画布尺寸，每个像素用8x8像素来表示以确保清晰度
    const pixelSize = 8;
    canvas.width = dimensions.N * pixelSize;
    canvas.height = dimensions.M * pixelSize;
    
    // 绘制每个像素
    pixelData.forEach((row, rowIndex) => {
      row.forEach((cell, colIndex) => {
        if (cell) {
          // 使用颜色，外部单元格用白色
          const color = cell.isExternal ? '#FFFFFF' : cell.color;
          ctx.fillStyle = color;
          ctx.fillRect(
            colIndex * pixelSize, 
            rowIndex * pixelSize, 
            pixelSize, 
            pixelSize
          );
        }
      });
    });
    
    // 转换为dataURL
    return canvas.toDataURL('image/png');
  };

  const openImagePrepare = (result: string) => {
    setPrepareSubmitError(null);
    setIsPrepareSubmitting(false);
    setPrepareImageSrc(result);
    setIsManualColoringMode(false);
    setSelectedColor(null);
    setIsEraseMode(false);
  };

  const applyConfirmedImageSrc = (result: string) => {
    automaticBackgroundCleanupEnabledRef.current = true;
    setOriginalImageSrc(result);
    setMappedPixelData(null);
    setGridDimensions(null);
    setColorCounts(null);
    setTotalBeadCount(0);
    setInitialGridColorKeys(new Set());
    setGranularity(DEFAULT_GRANULARITY);
    setGranularityInput(String(DEFAULT_GRANULARITY));
    setSimilarityThreshold(DEFAULT_SIMILARITY_THRESHOLD);
    setSimilarityThresholdInput(String(DEFAULT_SIMILARITY_THRESHOLD));
    setPendingEnterEdit(true);
    setRemapTrigger((prev) => prev + 1);
  };

  const processSelectedFile = async (file: SelectedFileRef) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (fileExtension === 'csv') {
      automaticBackgroundCleanupEnabledRef.current = false;
      console.log('正在导入CSV文件...');
      void webPlatform.files.readText(file)
        .then((source) => parsePatternCsv(source))
        .then((result) => {
          if (result.kind === "error") {
            alert(t.home.alerts.csvImportFailed(result.message));
            return;
          }
          const { mappedPixelData, gridDimensions } = result;
          console.log(`成功导入CSV文件: ${gridDimensions.N}x${gridDimensions.M}`);

          setMappedPixelData(mappedPixelData);
          setGridDimensions(gridDimensions);
          const stats = recalculateColorStats(mappedPixelData);
          setColorCounts(stats.colorCounts);
          setTotalBeadCount(stats.totalCount);
          setInitialGridColorKeys(new Set(Object.keys(stats.colorCounts)));
          if (result.colorSystem) setSelectedColorSystem(result.colorSystem);

          const syntheticImageSrc = generateSyntheticImageFromPixelData(mappedPixelData, gridDimensions);
          setOriginalImageSrc(syntheticImageSrc);
          setPrepareImageSrc(null);
          setSelectedColor(null);
          setIsEraseMode(false);
          setGranularity(gridDimensions.N);
          setGranularityInput(gridDimensions.N.toString());
          setEditorMountId((value) => value + 1);
          setIsManualColoringMode(true);
          const sourceLabel = result.source === "v2" ? t.home.alerts.csvSourceV2 : t.home.alerts.csvSourceLegacy;
          alert(t.home.alerts.csvImportSuccess(sourceLabel, gridDimensions.N, gridDimensions.M, Object.keys(stats.colorCounts).length));
        })
        .catch((reason: unknown) => {
          const message = reason instanceof Error ? reason.message : t.home.alerts.csvReadFailed;
          console.error("CSV导入失败:", reason);
          alert(t.home.alerts.csvImportFailed(message));
        });
    } else {
      try {
        openImagePrepare(await webPlatform.files.decodeImage(file));
      } catch (error) {
        console.error("Image decode failed:", error);
        alert(file.mimeType === "image/gif" ? t.home.alerts.gifReadFailed : t.home.alerts.fileReadFailed);
        setInitialGridColorKeys(new Set());
      }
    }
  };

  // ++ 修改：处理确认按钮点击的函数，同时处理两个参数 ++
  const handleConfirmParameters = (overrides?: {
    granularityInput?: string;
    similarityThresholdInput?: string;
    pixelationMode?: PixelationMode;
  }) => {
    const nextGranularityInput = overrides?.granularityInput ?? granularityInput;
    const nextSimilarityInput = overrides?.similarityThresholdInput ?? similarityThresholdInput;
    if (overrides?.pixelationMode) {
      setPixelationMode(overrides.pixelationMode);
    }

    const minGranularity = 10;
    const maxGranularity = 300;
    let newGranularity = parseInt(nextGranularityInput, 10);

    if (isNaN(newGranularity) || newGranularity < minGranularity) {
      newGranularity = minGranularity;
    } else if (newGranularity > maxGranularity) {
      newGranularity = maxGranularity;
    }

    const minSimilarity = 0;
    const maxSimilarity = 100;
    let newSimilarity = parseInt(nextSimilarityInput, 10);

    if (isNaN(newSimilarity) || newSimilarity < minSimilarity) {
      newSimilarity = minSimilarity;
    } else if (newSimilarity > maxSimilarity) {
      newSimilarity = maxSimilarity;
    }

    setGranularity(newGranularity);
    setSimilarityThreshold(newSimilarity);
    setGranularityInput(newGranularity.toString());
    setSimilarityThresholdInput(newSimilarity.toString());
    setRemapTrigger((prev) => prev + 1);
    setSelectedColor(null);
  };

  // 修改pixelateImage函数接收模式参数
  const pixelateImage = (imageSrc: string, detailLevel: number, threshold: number, currentPalette: PaletteColor[], mode: PixelationMode) => {
    console.log(`Attempting to pixelate with detail: ${detailLevel}, threshold: ${threshold}, mode: ${mode}`);
    const originalCanvas = originalCanvasRef.current;
    const pixelatedCanvas = pixelatedCanvasRef.current;

    if (!originalCanvas || !pixelatedCanvas) { console.error("Canvas ref(s) not available."); return; }
    const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
    const pixelatedCtx = pixelatedCanvas.getContext('2d');
    if (!originalCtx || !pixelatedCtx) { console.error("Canvas context(s) not found."); return; }
    console.log("Canvas contexts obtained.");

    if (currentPalette.length === 0) {
        console.error("Cannot pixelate: The selected color palette is empty (likely due to exclusions).");
        alert(t.home.alerts.emptyPalette);
        // Clear previous results visually
        pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
        setMappedPixelData(null);
        setGridDimensions(null);
        // Keep colorCounts potentially showing the last valid counts? Or clear them too?
        // setColorCounts(null); // Decide if clearing counts is desired when palette is empty
        // setTotalBeadCount(0);
        return; // Stop processing
    }
    const t1FallbackColor = currentPalette.find(p => p.key === 'T1')
                         || currentPalette.find(p => p.hex.toUpperCase() === '#FFFFFF')
                         || currentPalette[0]; // 使用第一个可用颜色作为备用
    console.log("Using fallback color for empty cells:", t1FallbackColor);

    const img = new window.Image();
    const requestId = ++pixelateRequestRef.current;
    
    img.onerror = (error: Event | string) => {
      if (requestId !== pixelateRequestRef.current) return; // 过期请求，忽略
      console.error("Image loading failed:", error); 
      alert(t.home.alerts.imageLoadFailed);
      setOriginalImageSrc(null); 
      setMappedPixelData(null); 
      setGridDimensions(null); 
      setColorCounts(null); 
      setInitialGridColorKeys(new Set());
    };
    
    img.onload = () => {
      if (requestId !== pixelateRequestRef.current) return; // 过期请求，忽略
      console.log("Image loaded successfully.");
      const aspectRatio = img.height / img.width;
      const N = detailLevel;
      const M = Math.max(1, Math.round(N * aspectRatio));
      if (N <= 0 || M <= 0) { console.error("Invalid grid dimensions:", { N, M }); return; }
      console.log(`Grid size: ${N}x${M}`);

      // 动态调整画布尺寸：当格子数量大于100时，增加画布尺寸以保持每个格子的可见性
      const baseWidth = 500;
      const minCellSize = 4; // 每个格子的最小尺寸（像素）
      const recommendedCellSize = 6; // 推荐的格子尺寸（像素）
      
      let outputWidth = baseWidth;
      
      // 如果格子数量大于100，计算需要的画布宽度
      if (N > 100) {
        const requiredWidthForMinSize = N * minCellSize;
        const requiredWidthForRecommendedSize = N * recommendedCellSize;
        
        // 使用推荐尺寸，但不超过屏幕宽度的90%（最大1200px）
        const maxWidth = Math.min(1200, window.innerWidth * 0.9);
        outputWidth = Math.min(maxWidth, Math.max(baseWidth, requiredWidthForRecommendedSize));
        
        // 确保不小于最小要求
        outputWidth = Math.max(outputWidth, requiredWidthForMinSize);
        
        console.log(`Large grid detected (${N} columns). Adjusted canvas width from ${baseWidth} to ${outputWidth}px (cell size: ${Math.round(outputWidth / N)}px)`);
      }
      
      const outputHeight = Math.round(outputWidth * aspectRatio);
      
      // 在控制台提示用户画布尺寸变化
      if (N > 100) {
        console.log(`💡 由于格子数量较多 (${N}x${M})，画布已自动放大以保持清晰度。可以使用水平滚动查看完整图像。`);
      }
      originalCanvas.width = img.width; originalCanvas.height = img.height;
      pixelatedCanvas.width = outputWidth; pixelatedCanvas.height = outputHeight;
      console.log(`Canvas dimensions: Original ${img.width}x${img.height}, Output ${outputWidth}x${outputHeight}`);

      originalCtx.drawImage(img, 0, 0, img.width, img.height);
      console.log("Original image drawn.");

      // 1. 使用calculatePixelGrid进行初始颜色映射
      console.log("Starting initial color mapping using calculatePixelGrid...");
      const initialMappedData = calculatePixelGrid(
          originalCtx,
          img.width,
          img.height,
          N,
          M,
          currentPalette, 
          mode,
          t1FallbackColor
      );
      console.log(`Initial data mapping complete using mode ${mode}. Running post-process (merge / rare cleanup / despeckle)...`);

      const mergedData = postProcessMappedGrid(initialMappedData, currentPalette, {
        similarityThreshold: threshold,
      });
      console.log("Post-process complete.");

      // --- 绘制和状态更新 ---
      if (pixelatedCanvasRef.current) {
        const cleanupResult = automaticBackgroundCleanupEnabledRef.current
          ? removeExternalBackground(mergedData, "automatic")
          : null;
        const nextMappedData = cleanupResult?.kind === "removed" ? cleanupResult.grid : mergedData;
        const nextStats = recalculateColorStats(nextMappedData);
        const preCleanupStats = cleanupResult?.kind === "removed"
          ? recalculateColorStats(mergedData)
          : null;

        startTransition(() => {
          setMappedPixelData(nextMappedData);
          setGridDimensions({ N, M });
          setColorCounts(nextStats.colorCounts);
          setTotalBeadCount(nextStats.totalCount);
          setInitialGridColorKeys(new Set(Object.keys(nextStats.colorCounts)));
          setBgRemovalSnapshot(
            cleanupResult?.kind === "removed" && preCleanupStats
              ? {
                  mappedPixelData: mergedData.map((row) => row.map((cell) => ({ ...cell }))),
                  colorCounts: preCleanupStats.colorCounts,
                  totalBeadCount: preCleanupStats.totalCount,
                }
              : null,
          );
          if (pendingEditorRemountRef.current) {
            pendingEditorRemountRef.current = false;
            setEditorMountId((value) => value + 1);
            setIsGenerationSheetOpen(false);
          }
        });
        if (cleanupResult?.kind === "removed") {
          showToast(
            t.home.backgroundRemoval.cleanedAuto(beadCountFormatter.format(cleanupResult.removedCount)),
            "undo-background",
          );
        }
        console.log("Color counts updated based on merged data (after cleanup):", nextStats.colorCounts);
        console.log("Total bead count (total beads):", nextStats.totalCount);
        console.log("Stored initial grid color keys:", Object.keys(nextStats.colorCounts));
      } else {
        console.error("Pixelated canvas ref is null, skipping draw call in pixelateImage.");
      }
    }; // 正确闭合 img.onload 函数
    
    console.log("Setting image source...");
    img.src = imageSrc;
    setSelectedColor(null);
  }; // 正确闭合 pixelateImage 函数

  // 当 remapTrigger 变化时清空撤回历史（参数调整/颜色排除/新图上传等均会触发 remap）
  useEffect(() => {
    clearEditHistory();
    setBgRemovalSnapshot(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remapTrigger]);

  useEffect(() => {
    if (!pendingEnterEdit || !mappedPixelData || !gridDimensions) return;
    setEditorMountId((value) => value + 1);
    setIsManualColoringMode(true);
    setPendingEnterEdit(false);
    setIsPrepareSubmitting(false);
    setPrepareSubmitError(null);
    setPrepareImageSrc(null);
  }, [pendingEnterEdit, mappedPixelData, gridDimensions]);

  // 修改useEffect中的pixelateImage调用，加入模式参数
  useEffect(() => {
    if (originalImageSrc && activeBeadPalette.length > 0) {
       const timeoutId = setTimeout(() => {
         if (originalImageSrc && originalCanvasRef.current && pixelatedCanvasRef.current && activeBeadPalette.length > 0) {
           console.log("useEffect triggered: Processing image due to src, granularity, threshold, palette selection, mode or remap trigger.");
           pixelateImage(originalImageSrc, granularity, similarityThreshold, activeBeadPalette, pixelationMode);
         } else {
            console.warn("useEffect check failed inside timeout: Refs or active palette not ready/empty.");
            if (isPrepareSubmitting || pendingEnterEdit) {
              setPrepareSubmitError(t.home.generation.canvasNotReady);
              setIsPrepareSubmitting(false);
            }
         }
       }, 50);
       return () => clearTimeout(timeoutId);
    } else if (originalImageSrc && activeBeadPalette.length === 0) {
        console.warn("Image selected, but the active palette is empty after exclusions. Cannot process. Clearing preview.");
        const pixelatedCanvas = pixelatedCanvasRef.current;
        const pixelatedCtx = pixelatedCanvas?.getContext('2d');
        if (pixelatedCtx && pixelatedCanvas) {
            pixelatedCtx.clearRect(0, 0, pixelatedCanvas.width, pixelatedCanvas.height);
            pixelatedCtx.fillStyle = '#6b7280';
            pixelatedCtx.font = '16px sans-serif';
            pixelatedCtx.textAlign = 'center';
            pixelatedCtx.fillText(t.home.generation.noAvailableColors, pixelatedCanvas.width / 2, pixelatedCanvas.height / 2);
        }
        setMappedPixelData(null);
        setGridDimensions(null);
        if (isPrepareSubmitting || pendingEnterEdit) {
          setPrepareSubmitError(t.home.generation.emptyPaletteForPattern);
          setIsPrepareSubmitting(false);
          setPendingEnterEdit(false);
        }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalImageSrc, granularity, similarityThreshold, customPaletteSelections, pixelationMode, remapTrigger]);

  // 设置组件挂载状态
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 从专注模式返回：/?restore=<projectId>（或 latest）时从 IndexedDB 恢复项目并直接进入编辑模式；
  // 无参数或恢复失败时静默停留在首页。静态导出下只能通过客户端 effect 读取查询参数。
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const restoreId = params.get('restore');
    if (!restoreId) return;
    // 消费后立即移除参数，避免刷新/后退时重复恢复
    window.history.replaceState(null, '', window.location.pathname);

    let cancelled = false;
    const restore = async () => {
      try {
        let projectDoc = restoreId === 'latest' ? undefined : await webPlatform.persistence.loadProject(restoreId);
        if (!projectDoc) {
          // id 缺失/无效或 latest：回退到最近保存的项目
          const summaries = await webPlatform.persistence.listProjects();
          if (summaries.length > 0) {
            projectDoc = await webPlatform.persistence.loadProject(summaries[0].id);
          }
        }
        if (!projectDoc || cancelled) return;

        automaticBackgroundCleanupEnabledRef.current = false;
        const grid = editorDocumentToGrid(projectDoc);
        const stats = recalculateColorStats(grid);
        setMappedPixelData(grid);
        setGridDimensions({ N: projectDoc.width, M: projectDoc.height });
        setColorCounts(stats.colorCounts);
        setTotalBeadCount(stats.totalCount);
        setInitialGridColorKeys(new Set(Object.keys(stats.colorCounts)));
        setSelectedColorSystem(projectDoc.colorSystem);
        setSelectedColor(null);
        // 全新挂载编辑器，让 editorInitialDocument 基于恢复出的网格重建
        setEditorMountId((value) => value + 1);
        setIsManualColoringMode(true);
      } catch (error) {
        console.error('恢复项目失败:', error);
      }
    };
    void restore();
    return () => { cancelled = true; };
  }, []);

    // --- Handler to toggle color exclusion ---
    const handleToggleExcludeColor = (hexKey: string) => {
        const currentExcluded = excludedColorKeys;
        const isExcluding = !currentExcluded.has(hexKey);

        // 排除会立即生效并重建编辑画布（清空工作台撤回历史），编辑模式下先确认
        if (isExcluding && isManualColoringMode) {
            const confirmed = window.confirm(t.home.confirms.excludeColor);
            if (!confirmed) return;
        }

        if (isExcluding) {
            console.log(`---------\nAttempting to EXCLUDE color: ${hexKey}`);

            // --- 确保初始颜色键已记录 ---
            if (initialGridColorKeys.size === 0) {
                console.error("Cannot exclude color: Initial grid color keys not yet calculated.");
                alert(t.home.alerts.excludeNotReady);
                return;
            }
            console.log("Initial Grid Hex Keys:", Array.from(initialGridColorKeys));
            console.log("Currently Excluded Hex Keys (before this op):", Array.from(currentExcluded));

            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.add(hexKey);

            // --- 使用初始颜色键进行重映射目标逻辑 ---
            // 1. 从初始网格颜色集合开始（hex值）
            const potentialRemapHexKeys = new Set(initialGridColorKeys);
            console.log("Step 1: Potential Hex Keys (from initial):", Array.from(potentialRemapHexKeys));

            // 2. 移除当前要排除的hex键
            potentialRemapHexKeys.delete(hexKey);
            console.log(`Step 2: Potential Hex Keys (after removing ${hexKey}):`, Array.from(potentialRemapHexKeys));

            // 3. 移除任何*其他*当前也被排除的hex键
            currentExcluded.forEach(excludedHexKey => {
                potentialRemapHexKeys.delete(excludedHexKey);
            });
            console.log("Step 3: Potential Hex Keys (after removing other current exclusions):", Array.from(potentialRemapHexKeys));

            // 4. 基于剩余的hex值创建重映射调色板
            const remapTargetPalette = fullBeadPalette.filter(color => potentialRemapHexKeys.has(color.hex.toUpperCase()));
            const remapTargetHexKeys = remapTargetPalette.map(p => p.hex.toUpperCase());
            console.log("Step 4: Remap Target Palette Hex Keys:", remapTargetHexKeys);

            // 5. *** 关键检查 ***：如果在考虑所有排除项后，没有*初始*颜色可供映射，则阻止此次排除
            if (remapTargetPalette.length === 0) {
                console.warn(`Cannot exclude color '${hexKey}'. No other valid colors from the initial grid remain after considering all current exclusions.`);
                alert(t.home.alerts.excludeNoRemapTarget(hexKey));
                console.log("---------");
                return; // 停止排除过程
            }
            console.log(`Remapping target palette (based on initial grid colors minus all exclusions) contains ${remapTargetPalette.length} colors.`);

            // 查找被排除颜色的RGB值用于重映射
            const excludedColorData = fullBeadPalette.find(p => p.hex.toUpperCase() === hexKey);
            // 检查排除颜色的数据是否存在
             if (!excludedColorData || !mappedPixelData || !gridDimensions) {
                 console.error("Cannot exclude color: Missing data for remapping.");
                 alert(t.home.alerts.excludeMissingData);
                console.log("---------");
                 return;
             }

            console.log(`Remapping cells currently using excluded color: ${hexKey}`);
            // 仅在需要重映射时创建深拷贝
            const newMappedData = mappedPixelData.map(row => row.map(cell => ({...cell})));
            let remappedCount = 0;
            const { N, M } = gridDimensions;
            let firstReplacementHex: string | null = null;

            for (let j = 0; j < M; j++) {
                for (let i = 0; i < N; i++) {
                const cell = newMappedData[j]?.[i];
                    // 此条件正确地仅针对具有排除hex值的单元格
                    if (cell && !cell.isExternal && cell.color.toUpperCase() === hexKey) {
                        // *** 使用派生的 remapTargetPalette 查找最接近的颜色 ***
                    const replacementColor = findClosestPaletteColor(excludedColorData.rgb, remapTargetPalette);
                        if (!firstReplacementHex) firstReplacementHex = replacementColor.hex;
                        newMappedData[j][i] = { 
                            ...cell, 
                            key: replacementColor.key, 
                            color: replacementColor.hex 
                        };
                    remappedCount++;
                }
                }
            }
            console.log(`Remapped ${remappedCount} cells. First replacement hex found was: ${firstReplacementHex || 'N/A'}`);

            // 同时更新状态
            setExcludedColorKeys(nextExcludedKeys); // 应用此颜色的排除
            setMappedPixelData(newMappedData); // 使用重映射的数据更新

            // 基于*新*映射数据重新计算计数（以hex为键）
            const newCounts: { [hexKey: string]: { count: number; color: string } } = {};
            let newTotalCount = 0;
            newMappedData.flat().forEach(cell => {
                if (cell && cell.color && !cell.isExternal) {
                    const cellHex = cell.color.toUpperCase();
                    if (!newCounts[cellHex]) {
                        newCounts[cellHex] = { count: 0, color: cellHex };
                }
                    newCounts[cellHex].count++;
                    newTotalCount++;
                }
            });
            setColorCounts(newCounts);
            setTotalBeadCount(newTotalCount);
            console.log("State updated after exclusion and local remap based on initial grid colors.");
            console.log("---------");

            // ++ 在更新状态后，重新绘制 Canvas ++
            if (pixelatedCanvasRef.current && gridDimensions) {
              setMappedPixelData(newMappedData);
              // 不要调用 setGridDimensions，因为颜色排除不需要改变网格尺寸
            } else {
               console.error("Canvas ref or grid dimensions missing, skipping draw call in handleToggleExcludeColor.");
            }

        } else {
            // --- Re-including ---
            console.log(`---------\nAttempting to RE-INCLUDE color: ${hexKey}`);
            console.log(`Re-including color: ${hexKey}. Triggering full remap.`);
            const nextExcludedKeys = new Set(currentExcluded);
            nextExcludedKeys.delete(hexKey);
            setExcludedColorKeys(nextExcludedKeys);
            // 此处无需重置 initialGridColorKeys，完全重映射会通过 pixelateImage 重新计算它
            setRemapTrigger(prev => prev + 1); // *** KEPT setRemapTrigger here for re-inclusion ***
            console.log("---------");
        }
        // Keep editor open; remount after exclusion/re-inclusion reflects.
        if (isManualColoringMode) {
          if (isExcluding) {
            setEditorMountId((value) => value + 1);
          } else {
            pendingEditorRemountRef.current = true;
          }
        }
        setSelectedColor(null);
        clearEditHistory();
        setBgRemovalSnapshot(null);
    };

  const handleAutoRemoveBackground = () => {
    if (!mappedPixelData || !gridDimensions) {
      alert(t.home.alerts.removeBackgroundNeedsPattern);
      return;
    }

    const cleanupResult = removeExternalBackground(mappedPixelData, "manual");
    if (cleanupResult.kind === "unchanged") {
      showToast(t.home.backgroundRemoval.failure[cleanupResult.reason]);
      return;
    }

    setBgRemovalSnapshot({
      mappedPixelData: mappedPixelData.map((row) => row.map((cell) => ({ ...cell }))),
      colorCounts: colorCounts ? { ...colorCounts } : {},
      totalBeadCount,
    });
    setEditHistory([]);

    const nextStats = recalculateColorStats(cleanupResult.grid);
    setMappedPixelData(cleanupResult.grid);
    setColorCounts(nextStats.colorCounts);
    setTotalBeadCount(nextStats.totalCount);
    setInitialGridColorKeys(new Set(Object.keys(nextStats.colorCounts)));

    // 重建编辑器文档，否则工作台仍持有去背景前的旧文档，
    // 下一次 onCommit 会用旧文档重新生成网格，覆盖掉去背景结果
    if (isManualColoringMode) {
      setEditorMountId((value) => value + 1);
    }
    showToast(
      t.home.backgroundRemoval.cleanedManual(beadCountFormatter.format(cleanupResult.removedCount)),
      "undo-background",
    );
  };

  // 处理自定义色板中单个颜色的选择变化
  const handleSelectionChange = (hexValue: string, isSelected: boolean) => {
    const normalizedHex = hexValue.toUpperCase();
    setCustomPaletteSelections(prev => ({
      ...prev,
      [normalizedHex]: isSelected
    }));
    setIsCustomPalette(true);
  };

  // 保存自定义色板并应用
  const handleSaveCustomPalette = () => {
    void webPlatform.persistence.savePaletteSelections(customPaletteSelections)
      .catch((error) => console.error("Unable to save palette selections:", error));
    setIsCustomPalette(true);
    setIsCustomPaletteEditorOpen(false);
    // 触发图像重新处理
    if (isManualColoringMode) {
      pendingEditorRemountRef.current = true;
    }
    setRemapTrigger(prev => prev + 1);
    setSelectedColor(null);
    setIsEraseMode(false);
  };

  // ++ 新增：导出自定义色板配置 ++
  const handleExportCustomPalette = () => {
    const selectedHexValues = Object.entries(customPaletteSelections)
      .filter(([, isSelected]) => isSelected)
      .map(([hexValue]) => hexValue);

    if (selectedHexValues.length === 0) {
      alert(t.home.paletteTransfer.nothingToExport);
      return;
    }

    // 导出格式：仅基于hex值
    const exportData = {
      version: "3.0", // 新版本号
      selectedHexValues: selectedHexValues,
      exportDate: new Date().toISOString(),
      totalColors: selectedHexValues.length
    };

    const artifact = webPlatform.artifacts.create(
      new TextEncoder().encode(JSON.stringify(exportData, null, 2)),
      "application/json",
    );
    void webPlatform.artifacts.save(artifact, "custom-perler-palette.json")
      .finally(() => webPlatform.artifacts.release(artifact));
  };

  // ++ 新增：处理导入的色板文件 ++
  const handleImportPaletteFile = async () => {
    const file = await webPlatform.files.select("palette");
    if (!file) return;
    try {
        const content = await webPlatform.files.readText(file);
        const data = JSON.parse(content);

        // 检查文件格式
        if (!Array.isArray(data.selectedHexValues)) {
          throw new Error(t.home.paletteTransfer.invalidFileFormat);
        }

        console.log("检测到基于hex值的色板文件");

        const importedHexValues = data.selectedHexValues as string[];
        const validHexValues: string[] = [];
        const invalidHexValues: string[] = [];

        // 验证hex值
        importedHexValues.forEach(hex => {
          const normalizedHex = hex.toUpperCase();
          const colorData = fullBeadPalette.find(color => color.hex.toUpperCase() === normalizedHex);
          if (colorData) {
            validHexValues.push(normalizedHex);
          } else {
            invalidHexValues.push(hex);
          }
        });

        if (invalidHexValues.length > 0) {
          console.warn("导入时发现无效的hex值:", invalidHexValues);
          alert(t.home.paletteTransfer.invalidColorsIgnored(invalidHexValues.join(', ')));
        }

        if (validHexValues.length === 0) {
          alert(t.home.paletteTransfer.noValidColors);
          return;
        }

        console.log(`成功验证 ${validHexValues.length} 个有效的hex值`);

        // 基于有效的hex值创建新的selections对象
        const allHexValues = fullBeadPalette.map(color => color.hex.toUpperCase());
        const newSelections = presetToSelections(allHexValues, validHexValues);
        setCustomPaletteSelections(newSelections);
        setIsCustomPalette(true); // 标记为自定义
        alert(t.home.paletteTransfer.importSuccess(validHexValues.length));

    } catch (error) {
      console.error("导入色板配置失败:", error);
      alert(t.home.paletteTransfer.importFailed(error instanceof Error ? error.message : t.home.common.unknownError));
    }
  };

  // ++ 新增：触发导入文件选择 ++
  const triggerImportPalette = () => {
    void handleImportPaletteFile();
  };

  // 生成完整色板数据（用户自定义色板中选中的所有颜色）
  const fullPaletteColors = useMemo(() => {
    const selectedColors: { key: string; color: string }[] = [];
    
    Object.entries(customPaletteSelections).forEach(([hexValue, isSelected]) => {
      if (isSelected) {
        // 根据选择的色号系统获取显示的色号
        const displayKey = getColorKeyByHex(hexValue, selectedColorSystem);
        selectedColors.push({
          key: displayKey,
          color: hexValue
        });
      }
    });
    
    // 使用色相排序而不是色号排序
    return sortColorsByHue(selectedColors);
  }, [customPaletteSelections, selectedColorSystem]);

  const handleEditorGridChange = useCallback((nextGrid: MappedPixel[][]) => {
    const nextHeight = nextGrid.length;
    const nextWidth = nextGrid[0]?.length ?? 0;
    const stats = recalculateColorStats(nextGrid);
    setMappedPixelData(nextGrid);
    setGridDimensions({ N: nextWidth, M: nextHeight });
    setColorCounts(stats.colorCounts);
    setTotalBeadCount(stats.totalCount);
    // 不更新 initialGridColorKeys：它是颜色排除重映射的候选池，
    // 只在新生成图纸（像素化/CSV导入）时初始化，手动编辑/撤回的 commit 不应覆盖它
  }, []);

  const editorInitialDocument = useMemo(() => {
    if (!mappedPixelData) return null;
    return createEditorDocument(mappedPixelData, selectedColorSystem, t.home.editor.defaultProjectName);
  // The workspace owns subsequent revisions; remount via editorMountId when regenerating.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManualColoringMode, editorMountId]);

  const handleEditorCommit = useCallback((result: EditorCommitResult) => {
    setBgRemovalSnapshot(null);
    setToastNotice((current) => current?.action === "undo-background" ? null : current);
    handleEditorGridChange(editorDocumentToGrid(result.document));
  }, [handleEditorGridChange]);

  const handlePrepareComplete = useCallback((croppedDataUrl: string) => {
    setPrepareSubmitError(null);
    setIsPrepareSubmitting(true);
    applyConfirmedImageSrc(croppedDataUrl);
  }, []);

  const handlePrepareCancel = useCallback(() => {
    if (isPrepareSubmitting) return;
    setPrepareImageSrc(null);
    setPrepareSubmitError(null);
    setIsPrepareSubmitting(false);
    setPendingEnterEdit(false);
  }, [isPrepareSubmitting]);

  const handleApplyGenerationParams = (values: {
    granularityInput: string;
    similarityThresholdInput: string;
    pixelationMode: PixelationMode;
  }) => {
    if (isManualColoringMode) {
      const confirmed = window.confirm(t.home.confirms.applyGenerationParams);
      if (!confirmed) return;
      pendingEditorRemountRef.current = true;
    }
    handleConfirmParameters(values);
  };

  // 切换色号系统：编辑模式下需重建编辑器文档（editorInitialDocument 依赖 editorMountId），
  // 重建会清空工作台撤回历史，因此与重新生成底稿一样先确认
  const handleColorSystemChange = (system: ColorSystem) => {
    if (system === selectedColorSystem) return;
    if (isManualColoringMode) {
      const confirmed = window.confirm(t.home.confirms.changeColorSystem);
      if (!confirmed) return;
      setEditorMountId((value) => value + 1);
    }
    setSelectedColorSystem(system);
  };

  return (
    <>
    <canvas ref={originalCanvasRef} className="hidden" aria-hidden="true" />
    <canvas ref={pixelatedCanvasRef} className="hidden" aria-hidden="true" />

    {prepareImageSrc ? (
      <ImagePrepareOverlay
        imageSrc={prepareImageSrc}
        isSubmitting={isPrepareSubmitting}
        submitError={prepareSubmitError}
        onCancel={handlePrepareCancel}
        onComplete={handlePrepareComplete}
      />
    ) : null}

    {!isManualColoringMode ? (
      <HomeLanding
        hasCurrentPattern={Boolean(originalImageSrc && mappedPixelData && gridDimensions)}
        isReady={isMounted}
        onUpload={triggerFileInput}
        onLoadExample={loadExampleImage}
        onContinue={() => {
          if (originalImageSrc && mappedPixelData && gridDimensions) {
            setEditorMountId((value) => value + 1);
            setIsManualColoringMode(true);
          }
        }}
        onFileDrop={(file) => {
          setExcludedColorKeys(new Set());
          processFile(webPlatform.files.wrap(file));
        }}
      />
    ) : (
    <div className="min-h-[100dvh] flex flex-col items-center bg-background font-sans overflow-x-hidden p-0">
      <main ref={mainRef} className="w-full max-w-none min-h-[100dvh] flex flex-col items-center relative">
        {mappedPixelData && gridDimensions && editorInitialDocument ? (
          <div className="w-full">
            {isCustomPaletteEditorOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                  <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
                    <CustomPaletteEditor
                      allColors={fullBeadPalette}
                      currentSelections={customPaletteSelections}
                      onSelectionChange={handleSelectionChange}
                      onSaveCustomPalette={handleSaveCustomPalette}
                      onClose={() => setIsCustomPaletteEditorOpen(false)}
                      onExportCustomPalette={handleExportCustomPalette}
                      onImportCustomPalette={triggerImportPalette}
                      selectedColorSystem={selectedColorSystem}
                    />
                  </div>
                </div>
              </div>
            )}

            <PixelEditorWorkspace
              key={editorMountId}
              initialDocument={editorInitialDocument}
              paletteColors={fullPaletteColors}
              currentColors={currentGridColors}
              onCommit={handleEditorCommit}
              onOpenGenerationParams={() => setIsGenerationSheetOpen(true)}
              onOpenCustomPalette={() => setIsCustomPaletteEditorOpen(true)}
              onExit={() => {
                setIsManualColoringMode(false);
                setSelectedColor(null);
                setTooltipData(null);
                setIsGenerationSheetOpen(false);
              }}
              onEnterFocus={(projectId, revision) => {
                // 工作台已在回调前将文档保存到 IndexedDB，专注模式通过 ?project= 从 IndexedDB 加载；
                // 旧版 focusMode_* localStorage 写入在大图纸上会触发 QuotaExceededError 导致无法跳转，已移除。
                window.location.href = `${canonicalFocusPath(lang)}?project=${encodeURIComponent(projectId)}&revision=${revision}`;
              }}
            />
          </div>
        ) : (
          <div className="flex min-h-[100dvh] w-full items-center justify-center px-6 text-sm text-muted-foreground">
            {t.home.editor.preparing}
          </div>
        )}

         {tooltipData && (
            <GridTooltip tooltipData={tooltipData} selectedColorSystem={selectedColorSystem} />
          )}
      </main>
    </div>
    )}

    <GenerationParamsSheet
      open={isGenerationSheetOpen}
      onOpenChange={setIsGenerationSheetOpen}
      granularityInput={granularityInput}
      similarityThresholdInput={similarityThresholdInput}
      pixelationMode={pixelationMode}
      selectedColorSystem={selectedColorSystem}
      colorCounts={colorCounts}
      excludedColorKeys={excludedColorKeys}
      canRemoveBackground={Boolean(mappedPixelData && gridDimensions)}
      canUndoBackground={Boolean(bgRemovalSnapshot)}
      onToggleExcludeColor={handleToggleExcludeColor}
      onColorSystemChange={handleColorSystemChange}
      onApply={handleApplyGenerationParams}
      onRemoveBackground={handleAutoRemoveBackground}
      onUndoBackground={handleUndoBgRemoval}
    />

    {/* 自定义色板编辑器：非编辑态也可打开（例如从生成参数迁移后的入口） */}
    {!isManualColoringMode && isCustomPaletteEditorOpen && (
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50 flex justify-center items-center p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
            <CustomPaletteEditor
              allColors={fullBeadPalette}
              currentSelections={customPaletteSelections}
              onSelectionChange={handleSelectionChange}
              onSaveCustomPalette={handleSaveCustomPalette}
              onClose={() => setIsCustomPaletteEditorOpen(false)}
              onExportCustomPalette={handleExportCustomPalette}
              onImportCustomPalette={triggerImportPalette}
              selectedColorSystem={selectedColorSystem}
            />
          </div>
        </div>
      </div>
    )}

    {!isManualColoringMode && !prepareImageSrc ? <SupportRail /> : null}

    {/* Toast Notification */}
    {toastNotice ? (
      <div
        className="fixed bottom-20 left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="min-w-0">{toastNotice.message}</span>
        {toastNotice.action === "undo-background" ? (
          <button
            type="button"
            className="shrink-0 whitespace-nowrap rounded-md px-2 py-1 font-medium underline underline-offset-2 hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background"
            onClick={handleUndoBgRemoval}
          >
            {t.home.common.undo}
          </button>
        ) : null}
      </div>
    ) : null}
    </>
  );
}
