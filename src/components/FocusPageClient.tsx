'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MappedPixel } from '@/utils/pixelation';
import {
  isRegionCompleted,
  getConnectedRegion,
  pickRecommendedRegion
} from '@/utils/floodFillUtils';
import { computeLocateTransform, computeLocateTransformIfNeeded } from '@/utils/focusViewport';
import FocusCanvas from '@/components/FocusCanvas';
import ColorStatusBar from '@/components/ColorStatusBar';
import RowStatusBar from '@/components/RowStatusBar';
import ModeBar from '@/components/ModeBar';
import ProgressBar from '@/components/ProgressBar';
import ToolBar from '@/components/ToolBar';
import ColorPanel from '@/components/ColorPanel';
import SettingsPanel from '@/components/SettingsPanel';
import CelebrationAnimation from '@/components/CelebrationAnimation';
import CompletionCard from '@/components/CompletionCard';
import FocusToast from '@/components/FocusToast';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { useLanguage, useT } from '@/i18n/context';
import { canonicalFocusPath, canonicalHomePath } from '@/i18n/site';
import { ArrowLeft, Settings } from 'lucide-react';
import { getColorKeyByHex, ColorSystem } from '@/utils/colorSystemUtils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { createEditorDocument, editorDocumentToGrid } from '@/editor/document';
import { hashEditorContent } from '@/editor/focusProgress';
import { migrateLegacyFocusProject } from '@/editor/platformUseCases';
import { webPlatform } from '@/platform/web';

const { loadFocusProgress, loadProject, saveFocusProgress } = webPlatform.persistence;

/** Wake Lock 的最小类型声明，避免依赖较新的 lib.dom 定义 */
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
};

/** 某一行需要摆放的豆子总数（跳过外部区域格） */
const countRowTotal = (pixelData: MappedPixel[][], row: number): number => {
  const cells = pixelData[row] ?? [];
  let total = 0;
  for (const cell of cells) {
    if (!cell?.isExternal) total++;
  }
  return total;
};

/** 某一行已标记完成的豆子数 */
const countRowCompleted = (pixelData: MappedPixel[][], row: number, completedCells: Set<string>): number => {
  const cells = pixelData[row] ?? [];
  let completed = 0;
  for (let col = 0; col < cells.length; col++) {
    if (!cells[col]?.isExternal && completedCells.has(`${row},${col}`)) completed++;
  }
  return completed;
};

/** 从 startRow 起（环形）找第一行还有未完成的行；全部完成时返回 startRow */
const findFirstIncompleteRow = (pixelData: MappedPixel[][], completedCells: Set<string>, startRow = 0): number => {
  if (pixelData.length === 0) return 0;
  for (let offset = 0; offset < pixelData.length; offset++) {
    const row = (startRow + offset) % pixelData.length;
    if (countRowCompleted(pixelData, row, completedCells) < countRowTotal(pixelData, row)) {
      return row;
    }
  }
  return startRow;
};

/** 某一行中占比最多的豆色（用于逐行完成反馈的粒子主色） */
const getDominantRowColor = (pixelData: MappedPixel[][], row: number): string | undefined => {
  const counts = new Map<string, number>();
  (pixelData[row] ?? []).forEach((cell) => {
    if (!cell?.isExternal) counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
  });
  let dominant: string | undefined;
  let max = 0;
  counts.forEach((count, color) => {
    if (count > max) {
      max = count;
      dominant = color;
    }
  });
  return dominant;
};

interface FocusModeState {
  // 当前状态
  currentColor: string;
  selectedCell: { row: number; col: number } | null;

  // 画布状态
  canvasScale: number;
  canvasOffset: { x: number; y: number };

  // 进度状态
  completedCells: Set<string>;
  colorProgress: Record<string, { completed: number; total: number }>;

  // 推进方式：逐色（连通区域引导）/ 逐行（按行推进）
  progressMode: 'color' | 'row';
  currentRow: number;

  // 引导状态 - 改为区域推荐
  recommendedRegion: { row: number; col: number }[] | null;
  recommendedCell: { row: number; col: number } | null; // 保留用于定位显示
  guidanceMode: 'nearest' | 'largest' | 'edge-first';

  // UI状态
  showColorPanel: boolean;
  showSettingsPanel: boolean;
  isPaused: boolean;
  completionPaused: boolean; // 因全部完成而自动暂停（区别于手动暂停）

  // 计时器状态
  startTime: number; // 开始时间戳
  totalElapsedTime: number; // 总计用时（秒）
  lastResumeTime: number; // 最后一次恢复的时间戳

  // 显示设置
  gridSectionInterval: number; // 网格分区间隔
  showSectionLines: boolean; // 是否显示分割线
  sectionLineColor: string; // 分割线颜色
  showCoordinates: boolean; // 是否显示行列坐标标尺
  showGridLines: boolean; // 是否显示逐格细网格线
  boardInterval: number; // 拼板边界线间隔（0=关闭，可选 52/78/104）
  enableCelebration: boolean; // 是否启用庆祝动画
  autoLocateNext: boolean; // 标记完成后若下一块不在视口内则自动定位
  wakeLockEnabled: boolean; // 是否在制作时保持屏幕常亮
  showCelebration: boolean; // 是否显示庆祝动画
  showCompletionCard: boolean; // 是否显示完成打卡图
}

export default function FocusPageClient() {
  const t = useT();
  const { lang } = useLanguage();
  // 从localStorage或URL参数获取像素数据
  const [mappedPixelData, setMappedPixelData] = useState<MappedPixel[][] | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);
  const [focusProject, setFocusProject] = useState<{ id: string; revision: number; contentHash: string } | null>(null);
  // 进度是否已为当前项目加载完成（防止空进度覆盖已保存进度）
  const [progressLoaded, setProgressLoaded] = useState(false);
  // 进度保存待 flush 的引用（页面隐藏时立即保存）
  const flushSaveRef = React.useRef<(() => void) | null>(null);
  // 计时状态的最新快照（供持久化读取，避免把每秒 tick 纳入保存依赖）
  const timerSnapshotRef = React.useRef({ totalElapsedTime: 0, isPaused: false });

  // 轻提示（1.6s 自动消失）、重置确认、图纸变更通知
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [progressResetNotice, setProgressResetNotice] = useState(false);
  // 庆祝动画变体：逐色=中央卡片，逐行=顶部胶囊
  const [celebrationVariant, setCelebrationVariant] = useState<'color' | 'row'>('color');
  const [celebrationAccent, setCelebrationAccent] = useState<string | undefined>(undefined);
  const [celebrationRowLabel, setCelebrationRowLabel] = useState<string | undefined>(undefined);
  // 画布容器引用（定位时读取视口尺寸）
  const canvasContainerRef = React.useRef<HTMLDivElement>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMessage(null), 1600);
  }, []);

  // 专心模式状态
  const [focusState, setFocusState] = useState<FocusModeState>({
    currentColor: '',
    selectedCell: null,
    canvasScale: 1,
    canvasOffset: { x: 0, y: 0 },
    completedCells: new Set<string>(),
    colorProgress: {},
    progressMode: 'color',
    currentRow: 0,
    recommendedRegion: null,
    recommendedCell: null,
    guidanceMode: 'nearest',
    showColorPanel: false,
    showSettingsPanel: false,
    isPaused: false,
    completionPaused: false,
    startTime: Date.now(),
    totalElapsedTime: 0,
    lastResumeTime: Date.now(),
    gridSectionInterval: 10,
    showSectionLines: true,
    sectionLineColor: '#007acc',
    showCoordinates: true,
    showGridLines: false,
    boardInterval: 0,
    enableCelebration: true,
    autoLocateNext: true,
    wakeLockEnabled: true,
    showCelebration: false,
    showCompletionCard: false
  });

  // 可用颜色列表（只存总量；completed 由 colorProgress 派生，避免状态不同步）
  const [colorTotals, setColorTotals] = useState<Array<{
    color: string;
    name: string;
    total: number;
  }>>([]);

  // completed 从 colorProgress 派生，刷新恢复进度后自动同步
  const availableColors = colorTotals.map(color => ({
    ...color,
    completed: focusState.colorProgress[color.color]?.completed ?? 0
  }));

  // 计时器管理
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (!focusState.isPaused) {
      interval = setInterval(() => {
        setFocusState(prev => {
          const now = Date.now();
          const elapsed = Math.floor((now - prev.lastResumeTime) / 1000);
          return {
            ...prev,
            totalElapsedTime: prev.totalElapsedTime + elapsed,
            lastResumeTime: now
          };
        });
      }, 1000); // 每秒更新一次
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [focusState.isPaused]);

  // 同步计时快照，持久化时读取（不触发额外渲染）
  useEffect(() => {
    timerSnapshotRef.current = {
      totalElapsedTime: focusState.totalElapsedTime,
      isPaused: focusState.isPaused
    };
  }, [focusState.totalElapsedTime, focusState.isPaused]);

  // 优先从 IndexedDB 项目加载；没有项目参数时迁移旧 localStorage 数据。
  useEffect(() => {
    let cancelled = false;
    const applyData = async (pixelData: MappedPixel[][], colorSystem: ColorSystem, project?: { id: string; revision: number; contentHash: string }) => {
      if (cancelled) return;
      const dimensions = { N: pixelData[0]?.length ?? 0, M: pixelData.length };
      const counts = new Map<string, number>();
      pixelData.flat().forEach((cell) => {
        if (!cell?.isExternal) counts.set(cell.color, (counts.get(cell.color) ?? 0) + 1);
      });
      const colors = Array.from(counts, ([color, total]) => ({ color, name: getColorKeyByHex(color, colorSystem), total }));
      setMappedPixelData(pixelData);
      setGridDimensions(dimensions);
      setColorTotals(colors);
      if (project) {
        const progress = await loadFocusProgress(project.id);
        if (cancelled) return;
        setFocusProject(project);
        // 有内容哈希时按内容校验；旧记录（无哈希）回退到 revision 校验
        const isValid = progress && (progress.contentHash !== undefined
          ? progress.contentHash === project.contentHash
          : progress.revision === project.revision);
        const completedCells = isValid
          ? new Set(progress.completedCells.map((index) => `${Math.floor(index / dimensions.N)},${index % dimensions.N}`))
          : new Set<string>();
        // 校验通过时一并恢复设置/计时/当前色/当前行（旧记录没有这些字段则保持默认）
        const restored = isValid ? progress : undefined;
        // 图纸内容已变化导致非空旧进度被丢弃：明确告知，而不是静默从零开始
        if (!isValid && progress && progress.completedCells.length > 0) {
          setProgressResetNotice(true);
        }
        const restoredRow = restored?.currentRow;
        const currentRow = restoredRow !== undefined && restoredRow >= 0 && restoredRow < dimensions.M
          ? restoredRow
          : findFirstIncompleteRow(pixelData, completedCells);
        const restoredColor = restored?.currentColor;
        const currentColor = restoredColor && counts.has(restoredColor)
          ? restoredColor
          : colors[0]?.color ?? '';
        const timer = restored?.timer;
        setFocusState((previous) => ({
          ...previous,
          currentColor,
          currentRow,
          completedCells,
          ...(restored?.settings ? {
            guidanceMode: restored.settings.guidanceMode,
            gridSectionInterval: restored.settings.gridSectionInterval,
            showSectionLines: restored.settings.showSectionLines,
            sectionLineColor: restored.settings.sectionLineColor,
            enableCelebration: restored.settings.enableCelebration,
            autoLocateNext: restored.settings.autoLocateNext ?? true,
            progressMode: restored.settings.progressMode,
            showCoordinates: restored.settings.showCoordinates,
            wakeLockEnabled: restored.settings.wakeLockEnabled,
            showGridLines: restored.settings.showGridLines ?? false,
            boardInterval: restored.settings.boardInterval ?? 0,
          } : {}),
          // 计时恢复：保存时处于暂停则保持暂停，否则以加载时刻为起点继续走表
          ...(timer ? (timer.isPaused
            ? { totalElapsedTime: timer.totalElapsedTime, isPaused: true }
            : { totalElapsedTime: timer.totalElapsedTime, isPaused: false, lastResumeTime: Date.now() }
          ) : {}),
          colorProgress: colors.reduce<Record<string, { completed: number; total: number }>>((result, color) => {
            result[color.color] = {
              total: color.total,
              completed: Array.from(completedCells).filter((key) => {
                const [row, col] = key.split(',').map(Number);
                return pixelData[row]?.[col]?.color === color.color;
              }).length,
            };
            return result;
          }, {}),
        }));
      } else if (colors.length > 0) {
        setFocusState((previous) => ({ ...previous, currentColor: colors[0].color, colorProgress: colors.reduce<Record<string, { completed: number; total: number }>>((result, color) => { result[color.color] = { completed: 0, total: color.total }; return result; }, {}) }));
      }
      setProgressLoaded(true);
    };

    const load = async () => {
      try {
        const query = new URLSearchParams(window.location.search);
        const projectId = query.get('project');
        if (projectId) {
          const project = await loadProject(projectId);
          if (project) {
            await applyData(editorDocumentToGrid(project), project.colorSystem, { id: project.id, revision: project.revision, contentHash: hashEditorContent(project) });
            return;
          }
        }
        const migrated = await migrateLegacyFocusProject(webPlatform.persistence, (legacy) => {
          const colorSystem = (legacy.colorSystem || 'MARD') as ColorSystem;
          return createEditorDocument(
            JSON.parse(legacy.pixelData) as MappedPixel[][],
            colorSystem,
            t.focus.loading.migratedProjectName,
          );
        });
        if (!migrated) throw new Error('No focus project found');
        const pixelData = editorDocumentToGrid(migrated);
        window.history.replaceState(null, '', `${canonicalFocusPath(lang)}?project=${encodeURIComponent(migrated.id)}`);
        await applyData(pixelData, migrated.colorSystem, { id: migrated.id, revision: migrated.revision, contentHash: hashEditorContent(migrated) });
      } catch (error) {
        console.error('Failed to load focus mode data:', error);
        window.location.href = canonicalHomePath(lang);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [lang, t]);

  useEffect(() => {
    // 进度加载完成前不保存，避免空进度覆盖已保存进度
    if (!focusProject || !gridDimensions || !progressLoaded) return;
    const save = () => {
      if (flushSaveRef.current === flush) flushSaveRef.current = null;
      const completedCells = Array.from(focusState.completedCells).map((key) => {
        const [row, col] = key.split(',').map(Number);
        return row * gridDimensions.N + col;
      });
      saveFocusProgress({
        projectId: focusProject.id,
        revision: focusProject.revision,
        contentHash: focusProject.contentHash,
        completedCells,
        updatedAt: Date.now(),
        settings: {
          guidanceMode: focusState.guidanceMode,
          gridSectionInterval: focusState.gridSectionInterval,
          showSectionLines: focusState.showSectionLines,
          sectionLineColor: focusState.sectionLineColor,
          enableCelebration: focusState.enableCelebration,
          autoLocateNext: focusState.autoLocateNext,
          progressMode: focusState.progressMode,
          showCoordinates: focusState.showCoordinates,
          wakeLockEnabled: focusState.wakeLockEnabled,
          showGridLines: focusState.showGridLines,
          boardInterval: focusState.boardInterval,
        },
        // 计时读快照，避免每秒 tick 触发保存
        timer: timerSnapshotRef.current,
        currentColor: focusState.currentColor,
        currentRow: focusState.currentRow,
      })
        .catch((error) => console.error('保存专心模式进度失败:', error));
    };
    const timer = window.setTimeout(save, 500);
    const flush = () => {
      window.clearTimeout(timer);
      save();
    };
    flushSaveRef.current = flush;
    return () => {
      window.clearTimeout(timer);
      if (flushSaveRef.current === flush) flushSaveRef.current = null;
    };
  }, [
    focusProject,
    focusState.completedCells,
    focusState.currentColor,
    focusState.currentRow,
    focusState.guidanceMode,
    focusState.gridSectionInterval,
    focusState.showSectionLines,
    focusState.sectionLineColor,
    focusState.enableCelebration,
    focusState.autoLocateNext,
    focusState.progressMode,
    focusState.showCoordinates,
    focusState.wakeLockEnabled,
    focusState.showGridLines,
    focusState.boardInterval,
    focusState.isPaused,
    gridDimensions,
    progressLoaded
  ]);

  // 页面隐藏/关闭时立即保存未落盘的进度
  useEffect(() => {
    const flush = () => flushSaveRef.current?.();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // 制作时保持屏幕常亮（可随时在设置中关闭）
  useEffect(() => {
    if (!focusState.wakeLockEnabled) return;
    const nav = navigator as WakeLockNavigator;
    if (!nav.wakeLock) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let released = false;
    const request = async () => {
      try {
        const lock = await nav.wakeLock!.request('screen');
        if (released) {
          await lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
      } catch {
        // 页面不可见或浏览器拒绝时静默失败
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sentinel?.release().catch(() => {});
    };
  }, [focusState.wakeLockEnabled]);

  // 计算推荐的下一个区域
  const calculateRecommendedRegion = useCallback(() => {
    if (!mappedPixelData || !focusState.currentColor) return { region: null, cell: null };

    const referencePoint = focusState.selectedCell ?? {
      row: Math.floor(mappedPixelData.length / 2),
      col: Math.floor(mappedPixelData[0].length / 2)
    };

    return pickRecommendedRegion(
      mappedPixelData,
      focusState.currentColor,
      focusState.completedCells,
      focusState.guidanceMode,
      referencePoint
    );
  }, [mappedPixelData, focusState.currentColor, focusState.completedCells, focusState.selectedCell, focusState.guidanceMode]);

  // 更新推荐区域
  useEffect(() => {
    const { region, cell } = calculateRecommendedRegion();
    setFocusState(prev => ({
      ...prev,
      recommendedRegion: region,
      recommendedCell: cell
    }));
  }, [calculateRecommendedRegion]);

  // 提交一组新的完成格子：统一处理进度重算、庆祝、切色/打卡、逐行推进
  const commitCompletedCells = useCallback((
    newCompletedCells: Set<string>,
    changedColor: string,
    selectedCell?: { row: number; col: number }
  ) => {
    if (!mappedPixelData) return;

    const isRowMode = focusState.progressMode === 'row';

    // 更新进度
    const newColorProgress = { ...focusState.colorProgress };
    let colorJustCompleted = false;

    if (newColorProgress[changedColor]) {
      const oldCompleted = newColorProgress[changedColor].completed;
      const newCompleted = Array.from(newCompletedCells)
        .filter(key => {
          const [r, c] = key.split(',').map(Number);
          return mappedPixelData[r]?.[c]?.color === changedColor;
        }).length;

      newColorProgress[changedColor] = { ...newColorProgress[changedColor], completed: newCompleted };

      // 检测颜色是否刚刚完成（逐行模式不触发单色庆祝）
      const total = newColorProgress[changedColor].total;
      if (!isRowMode && oldCompleted < total && newCompleted === total) {
        colorJustCompleted = true;
      }
    }

    // 检查是否所有颜色都完成了（包括当前刚完成的颜色）
    const allColorsCompleted = Object.values(newColorProgress).every(
      progress => progress.completed >= progress.total
    );

    // 逐色模式单色完成：庆祝粒子以刚完成的豆色为主色
    if (colorJustCompleted && focusState.enableCelebration) {
      setCelebrationVariant('color');
      setCelebrationAccent(changedColor);
    }

    setFocusState(prev => {
      const now = Date.now();
      let newState = {
        ...prev,
        completedCells: newCompletedCells,
        selectedCell: selectedCell ?? prev.selectedCell,
        colorProgress: newColorProgress,
        showCelebration: colorJustCompleted && focusState.enableCelebration
      };

      // 如果所有颜色都完成了，停止计时（标记为自动暂停）
      if (allColorsCompleted && !prev.isPaused) {
        const elapsed = Math.floor((now - prev.lastResumeTime) / 1000);
        newState = {
          ...newState,
          isPaused: true,
          completionPaused: true,
          totalElapsedTime: prev.totalElapsedTime + elapsed
        };
      } else if (!allColorsCompleted && prev.completionPaused) {
        // 取消标记后不再全部完成：自动恢复计时（不覆盖手动暂停）
        newState = {
          ...newState,
          isPaused: false,
          completionPaused: false,
          lastResumeTime: now
        };
      }

      return newState;
    });

    if (isRowMode) {
      // 逐行模式：行完成出顶部胶囊反馈；全部完成出打卡图；当前行完成自动推进
      if (allColorsCompleted) {
        setFocusState(prev => ({ ...prev, showCompletionCard: true }));
      } else if (
        countRowCompleted(mappedPixelData, focusState.currentRow, newCompletedCells) >=
        countRowTotal(mappedPixelData, focusState.currentRow)
      ) {
        if (focusState.enableCelebration) {
          setCelebrationVariant('row');
          setCelebrationAccent(getDominantRowColor(mappedPixelData, focusState.currentRow));
          setCelebrationRowLabel(t.focus.celebration.rowTitle(focusState.currentRow + 1));
          setFocusState(prev => ({ ...prev, showCelebration: true }));
        }
        setFocusState(prev => ({
          ...prev,
          currentRow: findFirstIncompleteRow(
            mappedPixelData,
            newCompletedCells,
            Math.min(prev.currentRow + 1, mappedPixelData.length - 1)
          )
        }));
      }
      return;
    }

    // 庆祝动画关闭时，直接走完成流程（否则完成打卡图不会出现）
    if (colorJustCompleted && !focusState.enableCelebration) {
      if (allColorsCompleted) {
        setFocusState(prev => ({ ...prev, showCompletionCard: true }));
      } else {
        // 切换到下一个未完成的颜色
        const currentIndex = colorTotals.findIndex(color => color.color === focusState.currentColor);
        for (let i = 1; currentIndex !== -1 && i < colorTotals.length; i++) {
          const nextColor = colorTotals[(currentIndex + i) % colorTotals.length];
          const progress = newColorProgress[nextColor.color];
          if (progress && progress.completed < progress.total) {
            setFocusState(prev => ({ ...prev, currentColor: nextColor.color }));
            break;
          }
        }
      }
    }
  }, [mappedPixelData, focusState.progressMode, focusState.currentRow, focusState.colorProgress, focusState.enableCelebration, focusState.currentColor, colorTotals, t]);

  // 点按即更新当前选中格（用于十字线/坐标读数），即使该次点击不构成标记
  const handleCellSelect = useCallback((row: number, col: number) => {
    setFocusState(prev => ({ ...prev, selectedCell: { row, col } }));
  }, []);

  // 画布坐标读数文案（1 起始）；稳定引用避免每秒计时 tick 触发画布重绘
  const formatCellLabel = useCallback((row: number, col: number) => t.focus.canvas.cellLabel(row + 1, col + 1), [t]);

  /** 标记完成后：用最新 completedCells 同步算出下一块，仅当其中心不在视口内时平移 */
  const locateNextAfterMark = useCallback((
    newCompletedCells: Set<string>,
    referenceCell: { row: number; col: number },
    options?: { nextRow?: number; nextColor?: string }
  ) => {
    if (!focusState.autoLocateNext || !gridDimensions || !mappedPixelData) return;

    const isRow = focusState.progressMode === 'row';
    let cells: { row: number; col: number }[] | null = null;

    if (isRow) {
      const row = options?.nextRow ?? focusState.currentRow;
      cells = (mappedPixelData[row] ?? []).map((_, col) => ({ row, col }));
    } else {
      const color = options?.nextColor ?? focusState.currentColor;
      const { region, cell } = pickRecommendedRegion(
        mappedPixelData,
        color,
        newCompletedCells,
        focusState.guidanceMode,
        referenceCell
      );
      cells = region && region.length > 0 ? region : cell ? [cell] : null;
    }

    if (!cells || cells.length === 0) return;

    const container = canvasContainerRef.current;
    const next = computeLocateTransformIfNeeded(cells, {
      N: gridDimensions.N,
      M: gridDimensions.M,
      showCoordinates: focusState.showCoordinates,
      canvasScale: focusState.canvasScale,
      canvasOffset: focusState.canvasOffset,
      viewWidth: container?.clientWidth ?? 0,
      viewHeight: container?.clientHeight ?? 0,
    });
    if (!next) return;

    setFocusState(prev => ({
      ...prev,
      canvasScale: next.canvasScale,
      canvasOffset: next.canvasOffset,
    }));
  }, [
    focusState.autoLocateNext,
    focusState.progressMode,
    focusState.currentRow,
    focusState.currentColor,
    focusState.guidanceMode,
    focusState.showCoordinates,
    focusState.canvasScale,
    focusState.canvasOffset,
    gridDimensions,
    mappedPixelData,
  ]);

  // 处理格子点击 - 区域洪水填充标记
  // 逐色模式只响应当前色；逐行模式以被点格子自身的颜色标记
  const handleCellClick = useCallback((row: number, col: number) => {
    if (!mappedPixelData) return;

    const cellColor = mappedPixelData[row][col].color;
    const isRowMode = focusState.progressMode === 'row';

    if (!isRowMode && cellColor !== focusState.currentColor) {
      // 点了非当前色：不构成标记，给轻提示说明规则
      const colorName = colorTotals.find(c => c.color === focusState.currentColor)?.name ?? focusState.currentColor;
      showToast(t.focus.toast.wrongColor(colorName));
      return;
    }

    const targetColor = isRowMode ? cellColor : focusState.currentColor;

    // 获取点击位置的连通区域
    const region = getConnectedRegion(mappedPixelData, row, col, targetColor);

    if (region.length === 0) return;

    const newCompletedCells = new Set(focusState.completedCells);

    // 检查区域是否已完成
    const isCurrentlyCompleted = isRegionCompleted(region, focusState.completedCells);

    if (isCurrentlyCompleted) {
      // 如果区域已完成，取消整个区域的完成状态（撤销不跳视角）
      region.forEach(({ row: r, col: c }) => {
        newCompletedCells.delete(`${r},${c}`);
      });
      commitCompletedCells(newCompletedCells, targetColor, { row, col });
      return;
    }

    // 标记整个区域为完成
    region.forEach(({ row: r, col: c }) => {
      newCompletedCells.add(`${r},${c}`);
    });

    // 同步预测提交后的下一引导目标（避免读到未 flush 的 recommendedRegion）
    let nextRow: number | undefined;
    let nextColor: string | undefined;
    if (isRowMode) {
      const rowDone =
        countRowCompleted(mappedPixelData, focusState.currentRow, newCompletedCells) >=
        countRowTotal(mappedPixelData, focusState.currentRow);
      if (rowDone) {
        nextRow = findFirstIncompleteRow(
          mappedPixelData,
          newCompletedCells,
          Math.min(focusState.currentRow + 1, mappedPixelData.length - 1)
        );
      }
    } else {
      const colorTotal = focusState.colorProgress[targetColor]?.total ?? 0;
      const colorCompleted = Array.from(newCompletedCells).filter((key) => {
        const [r, c] = key.split(',').map(Number);
        return mappedPixelData[r]?.[c]?.color === targetColor;
      }).length;
      if (colorTotal > 0 && colorCompleted >= colorTotal) {
        // 当前色刚拼完：若会立刻切色（庆祝关闭），定位到下一色；否则暂无下一推荐
        if (!focusState.enableCelebration) {
          const currentIndex = colorTotals.findIndex(color => color.color === focusState.currentColor);
          for (let i = 1; currentIndex !== -1 && i < colorTotals.length; i++) {
            const candidate = colorTotals[(currentIndex + i) % colorTotals.length];
            const done = Array.from(newCompletedCells).filter((key) => {
              const [r, c] = key.split(',').map(Number);
              return mappedPixelData[r]?.[c]?.color === candidate.color;
            }).length;
            if (done < candidate.total) {
              nextColor = candidate.color;
              break;
            }
          }
        }
      }
    }

    commitCompletedCells(newCompletedCells, targetColor, { row, col });
    locateNextAfterMark(newCompletedCells, { row, col }, { nextRow, nextColor });
  }, [
    mappedPixelData,
    focusState.progressMode,
    focusState.currentColor,
    focusState.completedCells,
    focusState.currentRow,
    focusState.colorProgress,
    focusState.enableCelebration,
    commitCompletedCells,
    locateNextAfterMark,
    colorTotals,
    showToast,
    t,
  ]);

  // 一键完成/撤销当前颜色（逐色模式）：整色标记或整色取消
  const handleToggleCurrentColorComplete = useCallback(() => {
    if (!mappedPixelData || !focusState.currentColor) return;

    const currentColor = focusState.currentColor;
    const progress = focusState.colorProgress[currentColor];
    const isComplete = !!progress && progress.completed >= progress.total;

    const newCompletedCells = new Set(focusState.completedCells);
    for (let row = 0; row < mappedPixelData.length; row++) {
      for (let col = 0; col < mappedPixelData[row].length; col++) {
        const cell = mappedPixelData[row][col];
        if (cell?.isExternal || cell.color !== currentColor) continue;
        const key = `${row},${col}`;
        if (isComplete) {
          newCompletedCells.delete(key);
        } else {
          newCompletedCells.add(key);
        }
      }
    }

    commitCompletedCells(newCompletedCells, currentColor);
  }, [mappedPixelData, focusState.currentColor, focusState.colorProgress, focusState.completedCells, commitCompletedCells]);

  // 处理颜色切换
  const handleColorChange = useCallback((color: string) => {
    setFocusState(prev => ({ ...prev, currentColor: color, showColorPanel: false }));
  }, []);

  // 处理推进方式切换：切到逐行时定位到第一个未完成行
  const handleProgressModeChange = useCallback((mode: 'color' | 'row') => {
    setFocusState(prev => {
      if (prev.progressMode === mode) return prev;
      return {
        ...prev,
        progressMode: mode,
        currentRow: mode === 'row' && mappedPixelData
          ? findFirstIncompleteRow(mappedPixelData, prev.completedCells)
          : prev.currentRow
      };
    });
  }, [mappedPixelData]);

  // 处理逐行模式的行切换
  const handleRowChange = useCallback((row: number) => {
    if (!gridDimensions) return;
    const clamped = Math.max(0, Math.min(gridDimensions.M - 1, row));
    setFocusState(prev => ({ ...prev, currentRow: clamped }));
  }, [gridDimensions]);

  // 处理定位到推荐位置（逐行模式定位当前行）
  // 区域在视口内放不下时回落缩放；偏移量做钳制，保证图纸至少 25% 留在视口内
  const handleLocateRecommended = useCallback(() => {
    if (!gridDimensions || !mappedPixelData) return;

    const isRow = focusState.progressMode === 'row';
    const region = isRow
      ? (mappedPixelData[focusState.currentRow] ?? []).map((_, col) => ({ row: focusState.currentRow, col }))
      : focusState.recommendedRegion;
    const fallbackCell = isRow
      ? { row: focusState.currentRow, col: Math.floor(gridDimensions.N / 2) }
      : focusState.recommendedCell;
    const cells = region && region.length > 0 ? region : fallbackCell ? [fallbackCell] : null;
    if (!cells) {
      showToast(t.focus.toast.noTarget);
      return;
    }

    const container = canvasContainerRef.current;
    const next = computeLocateTransform(cells, {
      N: gridDimensions.N,
      M: gridDimensions.M,
      showCoordinates: focusState.showCoordinates,
      canvasScale: focusState.canvasScale,
      canvasOffset: focusState.canvasOffset,
      viewWidth: container?.clientWidth ?? 0,
      viewHeight: container?.clientHeight ?? 0,
    });
    if (!next) return;

    setFocusState(prev => ({
      ...prev,
      canvasScale: next.canvasScale,
      canvasOffset: next.canvasOffset,
    }));
  }, [focusState.progressMode, focusState.currentRow, focusState.recommendedCell, focusState.recommendedRegion, focusState.canvasScale, focusState.canvasOffset, focusState.showCoordinates, gridDimensions, mappedPixelData, showToast, t]);

  // 格式化时间显示
  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }, []);

  // 处理暂停/继续
  const handlePauseToggle = useCallback(() => {
    setFocusState(prev => {
      const now = Date.now();
      if (prev.isPaused) {
        // 从暂停恢复：重新设置恢复时间
        return {
          ...prev,
          isPaused: false,
          completionPaused: false,
          lastResumeTime: now
        };
      } else {
        // 暂停：累加当前的时间段到总时间
        const elapsed = Math.floor((now - prev.lastResumeTime) / 1000);
        return {
          ...prev,
          isPaused: true,
          totalElapsedTime: prev.totalElapsedTime + elapsed
        };
      }
    });
  }, []);

  // 导出进度数据（JSON 备份，与 IndexedDB 持久化的载荷一致）
  const handleExportProgress = useCallback(() => {
    if (!focusProject || !gridDimensions) return;
    const payload = {
      projectId: focusProject.id,
      revision: focusProject.revision,
      contentHash: focusProject.contentHash,
      completedCells: Array.from(focusState.completedCells).map((key) => {
        const [row, col] = key.split(',').map(Number);
        return row * gridDimensions.N + col;
      }),
      settings: {
        guidanceMode: focusState.guidanceMode,
        gridSectionInterval: focusState.gridSectionInterval,
        showSectionLines: focusState.showSectionLines,
        sectionLineColor: focusState.sectionLineColor,
        enableCelebration: focusState.enableCelebration,
        autoLocateNext: focusState.autoLocateNext,
        progressMode: focusState.progressMode,
        showCoordinates: focusState.showCoordinates,
        wakeLockEnabled: focusState.wakeLockEnabled,
        showGridLines: focusState.showGridLines,
        boardInterval: focusState.boardInterval,
      },
      timer: timerSnapshotRef.current,
      currentColor: focusState.currentColor,
      currentRow: focusState.currentRow,
      exportedAt: new Date().toISOString(),
    };
    const artifact = webPlatform.artifacts.create(
      new TextEncoder().encode(JSON.stringify(payload, null, 2)),
      "application/json",
    );
    void webPlatform.artifacts.save(
      artifact,
      t.focus.settings.exportFileName(new Date().toISOString().slice(0, 10)),
    ).finally(() => webPlatform.artifacts.release(artifact));
  }, [focusProject, gridDimensions, focusState, t]);

  // 重置所有进度：清空标记与计时（保存 effect 会自动落盘）
  const handleResetProgress = useCallback(() => {
    setShowResetConfirm(false);
    setFocusState(prev => ({
      ...prev,
      completedCells: new Set<string>(),
      colorProgress: Object.fromEntries(
        Object.entries(prev.colorProgress).map(([color, progress]) => [color, { ...progress, completed: 0 }])
      ),
      selectedCell: null,
      currentRow: 0,
      totalElapsedTime: 0,
      lastResumeTime: Date.now(),
      isPaused: false,
      completionPaused: false,
      showCelebration: false,
      showCompletionCard: false,
    }));
  }, []);

  // 桌面端键盘快捷键（面板打开或焦点在输入控件时忽略）
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

      if (event.key === 'Escape') {
        setFocusState(prev => (prev.showColorPanel || prev.showSettingsPanel)
          ? { ...prev, showColorPanel: false, showSettingsPanel: false }
          : prev);
        return;
      }
      if (focusState.showColorPanel || focusState.showSettingsPanel) return;

      if (event.code === 'Space') {
        event.preventDefault();
        handlePauseToggle();
      } else if (event.key === 'l' || event.key === 'L') {
        handleLocateRecommended();
      } else if ((event.key === 'c' || event.key === 'C') && focusState.progressMode === 'color') {
        setFocusState(prev => ({ ...prev, showColorPanel: true }));
      } else if (event.key === 'ArrowUp' && focusState.progressMode === 'row') {
        event.preventDefault();
        handleRowChange(focusState.currentRow - 1);
      } else if (event.key === 'ArrowDown' && focusState.progressMode === 'row') {
        event.preventDefault();
        handleRowChange(focusState.currentRow + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusState.showColorPanel, focusState.showSettingsPanel, focusState.progressMode, focusState.currentRow, handlePauseToggle, handleLocateRecommended, handleRowChange]);

  // 处理庆祝动画完成
  const handleCelebrationComplete = useCallback(() => {
    setFocusState(prev => ({ ...prev, showCelebration: false }));

    // 逐行反馈仅关闭动画；行推进在标记时已完成
    if (celebrationVariant === 'row') return;

    // 检查是否所有颜色都完成了
    const allCompleted = availableColors.every(color => color.completed >= color.total);

    if (allCompleted) {
      // 所有颜色都完成了，显示打卡图
      setFocusState(prev => ({ ...prev, showCompletionCard: true }));
    } else {
      // 查找下一个未完成的颜色
      const currentIndex = availableColors.findIndex(color => color.color === focusState.currentColor);
      if (currentIndex !== -1) {
        // 从当前颜色的下一个开始寻找未完成的颜色
        for (let i = 1; i < availableColors.length; i++) {
          const nextIndex = (currentIndex + i) % availableColors.length;
          const nextColor = availableColors[nextIndex];

          // 如果找到未完成的颜色，切换到该颜色
          if (nextColor.completed < nextColor.total) {
            setFocusState(prev => ({ ...prev, currentColor: nextColor.color }));
            break;
          }
        }
      }
    }
  }, [availableColors, focusState.currentColor, celebrationVariant]);

  // 处理打卡图关闭
  const handleCompletionCardClose = useCallback(() => {
    setFocusState(prev => ({ ...prev, showCompletionCard: false }));
  }, []);

  if (!mappedPixelData || !gridDimensions) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="w-full max-w-sm border border-border rounded-xl bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="h-3 w-28 rounded bg-muted mb-4"></div>
          <div className="h-2 w-full rounded bg-muted"></div>
          <p className="text-muted-foreground text-sm mt-4">{t.focus.loading.progress}</p>
        </div>
      </div>
    );
  }

  const currentColorInfo = availableColors.find(c => c.color === focusState.currentColor);
  const progressPercentage = currentColorInfo ?
    Math.round((currentColorInfo.completed / currentColorInfo.total) * 100) : 0;

  // 逐行模式的行进度
  const isRowMode = focusState.progressMode === 'row';
  const currentRowTotal = countRowTotal(mappedPixelData, focusState.currentRow);
  const currentRowCompleted = countRowCompleted(mappedPixelData, focusState.currentRow, focusState.completedCells);
  const rowPercentage = currentRowTotal > 0 ? Math.round((currentRowCompleted / currentRowTotal) * 100) : 0;
  const displayPercentage = isRowMode ? rowPercentage : progressPercentage;
  const rowHint = currentRowCompleted >= currentRowTotal
    ? t.focus.progress.rowDone(focusState.currentRow + 1)
    : t.focus.progress.rowRemaining(focusState.currentRow + 1, currentRowTotal - currentRowCompleted);

  return (
    <div className="relative h-[100dvh] min-h-[100dvh] flex flex-col bg-background">
      <div className="w-full max-w-3xl mx-auto flex flex-col flex-1 min-h-0">
        {/* 顶部导航栏 */}
        <header className="min-h-16 bg-card border-b border-border px-3 sm:px-5 py-2 flex items-center justify-between text-foreground">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                window.location.href = focusProject
                  ? `${canonicalHomePath(lang)}?restore=${encodeURIComponent(focusProject.id)}`
                  : `${canonicalHomePath(lang)}?restore=latest`;
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.focus.header.back}
            </Button>
            <LanguageSwitcher />
          </div>
          <div className="text-center">
            <h1 className="text-base sm:text-lg font-semibold">{t.focus.header.title}</h1>
            <p className="hidden sm:block text-[11px] text-muted-foreground">{t.focus.header.subtitle}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t.focus.header.settingsLabel}
            onClick={() => setFocusState(prev => ({ ...prev, showSettingsPanel: true }))}
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-5 w-5" />
          </Button>
        </header>

        {/* 图纸变更导致进度重置的提示 */}
        {progressResetNotice && (
          <div className="mx-3 sm:mx-5 mt-2 flex items-center justify-between gap-2 bg-secondary border border-border rounded-lg px-3 py-2">
            <p className="text-sm text-secondary-foreground">{t.focus.notice.progressReset}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setProgressResetNotice(false)}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              {t.focus.notice.dismiss}
            </Button>
          </div>
        )}

        {/* 推进方式切换 */}
        <ModeBar
          progressMode={focusState.progressMode}
          onProgressModeChange={handleProgressModeChange}
          currentRow={focusState.currentRow}
          totalRows={gridDimensions.M}
          onRowChange={handleRowChange}
        />

        {/* 当前进度状态栏（按模式二选一） */}
        {isRowMode ? (
          <RowStatusBar
            currentRow={focusState.currentRow}
            totalRows={gridDimensions.M}
            completed={currentRowCompleted}
            total={currentRowTotal}
          />
        ) : (
          <ColorStatusBar
            currentColor={focusState.currentColor}
            colorInfo={currentColorInfo}
            progressPercentage={progressPercentage}
            onToggleComplete={handleToggleCurrentColorComplete}
          />
        )}

        {/* 主画布区域 */}
        <div ref={canvasContainerRef} className="flex-1 relative overflow-hidden">
          <FocusCanvas
            mappedPixelData={mappedPixelData}
            gridDimensions={gridDimensions}
            currentColor={focusState.currentColor}
            completedCells={focusState.completedCells}
            recommendedCell={focusState.recommendedCell}
            recommendedRegion={focusState.recommendedRegion}
            canvasScale={focusState.canvasScale}
            canvasOffset={focusState.canvasOffset}
            gridSectionInterval={focusState.gridSectionInterval}
            showSectionLines={focusState.showSectionLines}
            sectionLineColor={focusState.sectionLineColor}
            progressMode={focusState.progressMode}
            currentRow={focusState.currentRow}
            showCoordinates={focusState.showCoordinates}
            selectedCell={focusState.selectedCell}
            showGridLines={focusState.showGridLines}
            boardInterval={focusState.boardInterval}
            onCellSelect={handleCellSelect}
            formatCellLabel={formatCellLabel}
            onCellClick={handleCellClick}
            onScaleChange={(scale: number) => setFocusState(prev => ({ ...prev, canvasScale: scale }))}
            onOffsetChange={(offset: { x: number; y: number }) => setFocusState(prev => ({ ...prev, canvasOffset: offset }))}
          />
        </div>

        {/* 快速进度条 */}
        <ProgressBar
          progressPercentage={displayPercentage}
          recommendedCell={focusState.recommendedCell}
          hintText={isRowMode ? rowHint : undefined}
        />

        {/* 底部工具栏 */}
        <ToolBar
          onColorSelect={() => setFocusState(prev => ({ ...prev, showColorPanel: true }))}
          onLocate={handleLocateRecommended}
          onPause={handlePauseToggle}
          isPaused={focusState.isPaused}
          elapsedTime={formatTime(focusState.totalElapsedTime)}
        />
      </div>

      {/* 颜色选择面板 — 常挂载受控 Sheet，避免 open 恒 true + 卸载导致滚动锁残留 */}
      <ColorPanel
        isOpen={focusState.showColorPanel}
        colors={availableColors}
        currentColor={focusState.currentColor}
        onColorSelect={handleColorChange}
        onClose={() => setFocusState(prev => ({ ...prev, showColorPanel: false }))}
      />

      {/* 设置面板 — 同上受控模式 */}
      <SettingsPanel
        isOpen={focusState.showSettingsPanel}
        guidanceMode={focusState.guidanceMode}
        onGuidanceModeChange={(mode: 'nearest' | 'largest' | 'edge-first') => setFocusState(prev => ({ ...prev, guidanceMode: mode }))}
        gridSectionInterval={focusState.gridSectionInterval}
        onGridSectionIntervalChange={(interval: number) => setFocusState(prev => ({ ...prev, gridSectionInterval: interval }))}
        showSectionLines={focusState.showSectionLines}
        onShowSectionLinesChange={(show: boolean) => setFocusState(prev => ({ ...prev, showSectionLines: show }))}
        sectionLineColor={focusState.sectionLineColor}
        onSectionLineColorChange={(color: string) => setFocusState(prev => ({ ...prev, sectionLineColor: color }))}
        enableCelebration={focusState.enableCelebration}
        onEnableCelebrationChange={(enable: boolean) => setFocusState(prev => ({ ...prev, enableCelebration: enable }))}
        autoLocateNext={focusState.autoLocateNext}
        onAutoLocateNextChange={(enable: boolean) => setFocusState(prev => ({ ...prev, autoLocateNext: enable }))}
        showCoordinates={focusState.showCoordinates}
        onShowCoordinatesChange={(show: boolean) => setFocusState(prev => ({ ...prev, showCoordinates: show }))}
        showGridLines={focusState.showGridLines}
        onShowGridLinesChange={(show: boolean) => setFocusState(prev => ({ ...prev, showGridLines: show }))}
        boardInterval={focusState.boardInterval}
        onBoardIntervalChange={(interval: number) => setFocusState(prev => ({ ...prev, boardInterval: interval }))}
        wakeLockEnabled={focusState.wakeLockEnabled}
        onWakeLockEnabledChange={(enable: boolean) => setFocusState(prev => ({ ...prev, wakeLockEnabled: enable }))}
        onExportProgress={handleExportProgress}
        onRequestResetProgress={() => setShowResetConfirm(true)}
        onClose={() => setFocusState(prev => ({ ...prev, showSettingsPanel: false }))}
      />

      {/* 庆祝动画（逐色=中央卡片 / 逐行=顶部胶囊） */}
      <CelebrationAnimation
        isVisible={focusState.showCelebration}
        variant={celebrationVariant}
        accentColor={celebrationAccent}
        rowLabel={celebrationRowLabel}
        onComplete={handleCelebrationComplete}
      />

      {/* 轻提示 */}
      <FocusToast message={toastMessage} />

      {/* 重置进度确认 */}
      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.focus.settings.resetConfirmTitle}</DialogTitle>
            <DialogDescription>{t.focus.settings.resetConfirmDesc}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              {t.focus.settings.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={handleResetProgress}
            >
              {t.focus.settings.resetConfirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 完成打卡图 */}
      <CompletionCard
        isVisible={focusState.showCompletionCard}
        mappedPixelData={mappedPixelData}
        gridDimensions={gridDimensions}
        totalElapsedTime={focusState.totalElapsedTime}
        onClose={handleCompletionCardClose}
      />
    </div>
  );
}
