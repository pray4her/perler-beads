'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { MappedPixel } from '../../utils/pixelation';
import { 
  getAllConnectedRegions, 
  isRegionCompleted, 
  getRegionCenter, 
  sortRegionsByDistance, 
  sortRegionsBySize,
  getConnectedRegion
} from '../../utils/floodFillUtils';
import FocusCanvas from '../../components/FocusCanvas';
import ColorStatusBar from '../../components/ColorStatusBar';
import ProgressBar from '../../components/ProgressBar';
import ToolBar from '../../components/ToolBar';
import ColorPanel from '../../components/ColorPanel';
import SettingsPanel from '../../components/SettingsPanel';
import CelebrationAnimation from '../../components/CelebrationAnimation';
import CompletionCard from '../../components/CompletionCard';
import { ArrowLeft, Settings } from 'lucide-react';
import { getColorKeyByHex, ColorSystem } from '../../utils/colorSystemUtils';
import { Button } from '@/components/ui/button';
import { createEditorDocument, editorDocumentToGrid } from '@/editor/document';
import { loadFocusProgress, loadProject, saveFocusProgress, saveProject, hashEditorContent } from '@/editor/projectStorage';

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
  enableCelebration: boolean; // 是否启用庆祝动画
  showCelebration: boolean; // 是否显示庆祝动画
  showCompletionCard: boolean; // 是否显示完成打卡图
}

export default function FocusMode() {
  // 从localStorage或URL参数获取像素数据
  const [mappedPixelData, setMappedPixelData] = useState<MappedPixel[][] | null>(null);
  const [gridDimensions, setGridDimensions] = useState<{ N: number; M: number } | null>(null);
  const [focusProject, setFocusProject] = useState<{ id: string; revision: number; contentHash: string } | null>(null);
  // 进度是否已为当前项目加载完成（防止空进度覆盖已保存进度）
  const [progressLoaded, setProgressLoaded] = useState(false);
  // 进度保存待 flush 的引用（页面隐藏时立即保存）
  const flushSaveRef = React.useRef<(() => void) | null>(null);

  // 专心模式状态
  const [focusState, setFocusState] = useState<FocusModeState>({
    currentColor: '',
    selectedCell: null,
    canvasScale: 1,
    canvasOffset: { x: 0, y: 0 },
    completedCells: new Set<string>(),
    colorProgress: {},
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
    enableCelebration: true,
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
        setFocusState((previous) => ({
          ...previous,
          currentColor: colors[0]?.color ?? '',
          completedCells,
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
        const savedPixelData = localStorage.getItem('focusMode_pixelData');
        const savedColorSystem = (localStorage.getItem('focusMode_selectedColorSystem') || 'MARD') as ColorSystem;
        if (!savedPixelData) throw new Error('No focus project found');
        const pixelData = JSON.parse(savedPixelData) as MappedPixel[][];
        const migrated = createEditorDocument(pixelData, savedColorSystem, '迁移的拼豆项目');
        await saveProject(migrated);
        window.history.replaceState(null, '', `/focus/?project=${encodeURIComponent(migrated.id)}`);
        await applyData(pixelData, savedColorSystem, { id: migrated.id, revision: migrated.revision, contentHash: hashEditorContent(migrated) });
      } catch (error) {
        console.error('Failed to load focus mode data:', error);
        window.location.href = '/';
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    // 进度加载完成前不保存，避免空进度覆盖已保存进度
    if (!focusProject || !gridDimensions || !progressLoaded) return;
    const save = () => {
      if (flushSaveRef.current === flush) flushSaveRef.current = null;
      const completedCells = Array.from(focusState.completedCells).map((key) => {
        const [row, col] = key.split(',').map(Number);
        return row * gridDimensions.N + col;
      });
      saveFocusProgress({ projectId: focusProject.id, revision: focusProject.revision, contentHash: focusProject.contentHash, completedCells, updatedAt: Date.now() })
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
  }, [focusProject, focusState.completedCells, gridDimensions, progressLoaded]);

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

  // 计算推荐的下一个区域
  const calculateRecommendedRegion = useCallback(() => {
    if (!mappedPixelData || !focusState.currentColor) return { region: null, cell: null };

    // 获取当前颜色的所有连通区域
    const allRegions = getAllConnectedRegions(mappedPixelData, focusState.currentColor);
    
    // 筛选出未完成的区域
    const incompleteRegions = allRegions.filter(region => 
      !isRegionCompleted(region, focusState.completedCells)
    );

    if (incompleteRegions.length === 0) {
      return { region: null, cell: null };
    }

    let selectedRegion: { row: number; col: number }[];

    // 根据引导模式选择推荐区域
    switch (focusState.guidanceMode) {
      case 'nearest':
        // 找最近的区域（相对于上一个完成的格子或中心点）
        const referencePoint = focusState.selectedCell ?? { 
          row: Math.floor(mappedPixelData.length / 2), 
          col: Math.floor(mappedPixelData[0].length / 2) 
        };
        
        const sortedByDistance = sortRegionsByDistance(incompleteRegions, referencePoint);
        selectedRegion = sortedByDistance[0];
        break;

      case 'largest':
        // 找最大的连通区域
        const sortedBySize = sortRegionsBySize(incompleteRegions);
        selectedRegion = sortedBySize[0];
        break;

      case 'edge-first':
        // 优先选择包含边缘格子的区域
        const M = mappedPixelData.length;
        const N = mappedPixelData[0].length;
        const edgeRegions = incompleteRegions.filter(region => 
          region.some(cell => 
            cell.row === 0 || cell.row === M - 1 ||
            cell.col === 0 || cell.col === N - 1
          )
        );
        
        if (edgeRegions.length > 0) {
          selectedRegion = edgeRegions[0];
        } else {
          selectedRegion = incompleteRegions[0];
        }
        break;

      default:
        selectedRegion = incompleteRegions[0];
    }

    // 计算区域中心作为推荐显示位置
    const centerCell = getRegionCenter(selectedRegion);
    
    return { 
      region: selectedRegion, 
      cell: centerCell 
    };
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

  // 处理格子点击 - 改为区域洪水填充标记
  const handleCellClick = useCallback((row: number, col: number) => {
    if (!mappedPixelData) return;

    const cellColor = mappedPixelData[row][col].color;

    // 如果点击的是当前颜色的格子，对整个连通区域进行标记
    if (cellColor === focusState.currentColor) {
      // 获取点击位置的连通区域
      const region = getConnectedRegion(mappedPixelData, row, col, focusState.currentColor);
      
      if (region.length === 0) return;

      const newCompletedCells = new Set(focusState.completedCells);
      
      // 检查区域是否已完成
      const isCurrentlyCompleted = isRegionCompleted(region, focusState.completedCells);
      
      if (isCurrentlyCompleted) {
        // 如果区域已完成，取消整个区域的完成状态
        region.forEach(({ row: r, col: c }) => {
          newCompletedCells.delete(`${r},${c}`);
        });
      } else {
        // 如果区域未完成，标记整个区域为完成
        region.forEach(({ row: r, col: c }) => {
          newCompletedCells.add(`${r},${c}`);
        });
      }

      // 更新进度
      const newColorProgress = { ...focusState.colorProgress };
      let colorJustCompleted = false;
      
      if (newColorProgress[focusState.currentColor]) {
        const oldCompleted = newColorProgress[focusState.currentColor].completed;
        const newCompleted = Array.from(newCompletedCells)
          .filter(key => {
            const [r, c] = key.split(',').map(Number);
            return mappedPixelData[r]?.[c]?.color === focusState.currentColor;
          }).length;
        
        newColorProgress[focusState.currentColor].completed = newCompleted;

        // 检测颜色是否刚刚完成
        const total = newColorProgress[focusState.currentColor].total;
        if (oldCompleted < total && newCompleted === total) {
          colorJustCompleted = true;
        }
      }

      // 检查是否所有颜色都完成了（包括当前刚完成的颜色）
      const allColorsCompleted = Object.values(newColorProgress).every(
        progress => progress.completed >= progress.total
      );

      setFocusState(prev => {
        const now = Date.now();
        let newState = {
          ...prev,
          completedCells: newCompletedCells,
          selectedCell: { row, col },
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
    }
  }, [mappedPixelData, focusState.currentColor, focusState.completedCells, focusState.colorProgress, focusState.enableCelebration, colorTotals]);

  // 处理颜色切换
  const handleColorChange = useCallback((color: string) => {
    setFocusState(prev => ({ ...prev, currentColor: color, showColorPanel: false }));
  }, []);

  // 处理定位到推荐位置
  const handleLocateRecommended = useCallback(() => {
    if (!focusState.recommendedCell || !gridDimensions) return;
    
    const { row, col } = focusState.recommendedCell;
    
    // 计算格子大小（与FocusCanvas中的计算保持一致）
    const cellSize = Math.max(15, Math.min(40, 300 / Math.max(gridDimensions.N, gridDimensions.M)));
    
    // 计算目标格子在画布上的中心位置（像素坐标）
    const targetX = (col + 0.5) * cellSize;
    const targetY = (row + 0.5) * cellSize;
    
    // 计算画布总尺寸
    const canvasWidth = gridDimensions.N * cellSize;
    const canvasHeight = gridDimensions.M * cellSize;
    
    // 简单的定位逻辑：
    // 1. 将目标位置移到画布的中心位置
    // 2. 考虑缩放的影响
    
    // 画布中心位置
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;
    
    // 计算从目标位置到画布中心的偏移量
    const offsetX = canvasCenterX - targetX;
    const offsetY = canvasCenterY - targetY;
    
    // 更新状态
    setFocusState(prev => ({
      ...prev,
      canvasOffset: { x: offsetX, y: offsetY }
    }));
  }, [focusState.recommendedCell, gridDimensions]);

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

  // 处理庆祝动画完成
  const handleCelebrationComplete = useCallback(() => {
    setFocusState(prev => ({ ...prev, showCelebration: false }));
    
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
  }, [availableColors, focusState.currentColor]);

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
          <p className="text-muted-foreground text-sm mt-4">正在载入制作进度</p>
        </div>
      </div>
    );
  }

  const currentColorInfo = availableColors.find(c => c.color === focusState.currentColor);
  const progressPercentage = currentColorInfo ? 
    Math.round((currentColorInfo.completed / currentColorInfo.total) * 100) : 0;

  return (
    <div className="h-[100dvh] min-h-[100dvh] flex flex-col bg-background">
      {/* 顶部导航栏 */}
      <header className="min-h-16 bg-card border-b border-border px-3 sm:px-5 py-2 flex items-center justify-between text-foreground">
        <Button
          variant="ghost"
          onClick={() => {
            window.location.href = focusProject
              ? `/?restore=${encodeURIComponent(focusProject.id)}`
              : '/?restore=latest';
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </Button>
        <div className="text-center">
          <h1 className="text-base sm:text-lg font-semibold">专心模式</h1>
          <p className="hidden sm:block text-[11px] text-muted-foreground">逐色完成当前底稿</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setFocusState(prev => ({ ...prev, showSettingsPanel: true }))}
          className="text-muted-foreground hover:text-foreground"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </header>

      {/* 当前颜色状态栏 */}
      <ColorStatusBar 
        currentColor={focusState.currentColor}
        colorInfo={currentColorInfo}
        progressPercentage={progressPercentage}
      />

      {/* 主画布区域 */}
      <div className="flex-1 relative overflow-hidden">
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
          onCellClick={handleCellClick}
          onScaleChange={(scale: number) => setFocusState(prev => ({ ...prev, canvasScale: scale }))}
          onOffsetChange={(offset: { x: number; y: number }) => setFocusState(prev => ({ ...prev, canvasOffset: offset }))}
        />
      </div>

      {/* 快速进度条 */}
      <ProgressBar 
        progressPercentage={progressPercentage}
        recommendedCell={focusState.recommendedCell}
      />

      {/* 底部工具栏 */}
      <ToolBar 
        onColorSelect={() => setFocusState(prev => ({ ...prev, showColorPanel: true }))}
        onLocate={handleLocateRecommended}
        onPause={handlePauseToggle}
        isPaused={focusState.isPaused}
        elapsedTime={formatTime(focusState.totalElapsedTime)}
      />

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
        onClose={() => setFocusState(prev => ({ ...prev, showSettingsPanel: false }))}
      />

      {/* 庆祝动画 */}
      <CelebrationAnimation
        isVisible={focusState.showCelebration}
        onComplete={handleCelebrationComplete}
      />

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
