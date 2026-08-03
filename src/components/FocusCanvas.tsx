import React, { useRef, useEffect, useCallback, useState } from 'react';
import { MappedPixel } from '../utils/pixelation';

interface FocusCanvasProps {
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
  currentColor: string;
  completedCells: Set<string>;
  recommendedCell: { row: number; col: number } | null;
  recommendedRegion: { row: number; col: number }[] | null;
  canvasScale: number;
  canvasOffset: { x: number; y: number };
  gridSectionInterval: number;
  showSectionLines: boolean;
  sectionLineColor: string;
  progressMode: 'color' | 'row';
  currentRow: number;
  showCoordinates: boolean;
  onCellClick: (row: number, col: number) => void;
  onScaleChange: (scale: number) => void;
  onOffsetChange: (offset: { x: number; y: number }) => void;
}

const FocusCanvas: React.FC<FocusCanvasProps> = ({
  mappedPixelData,
  gridDimensions,
  currentColor,
  completedCells,
  recommendedCell,
  recommendedRegion,
  canvasScale,
  canvasOffset,
  gridSectionInterval,
  showSectionLines,
  sectionLineColor,
  progressMode,
  currentRow,
  showCoordinates,
  onCellClick,
  onScaleChange,
  onOffsetChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<{ x: number; y: number } | null>(null);
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null);
  // 鼠标拖拽累计位移（屏幕像素），超过阈值则抑制随后的 click，避免拖拽误触发区域标记
  const dragDistanceRef = useRef(0);

  // 计算格子大小
  const cellSize = Math.max(15, Math.min(40, 300 / Math.max(gridDimensions.N, gridDimensions.M)));

  // 渲染画布
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mappedPixelData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 坐标标尺占用画布左/上边缘的边距
    const coordLeft = showCoordinates ? 18 : 0;
    const coordTop = showCoordinates ? 14 : 0;

    // 设置画布尺寸
    const canvasWidth = coordLeft + gridDimensions.N * cellSize;
    const canvasHeight = coordTop + gridDimensions.M * cellSize;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;

    // 清空画布
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 渲染每个格子
    for (let row = 0; row < gridDimensions.M; row++) {
      for (let col = 0; col < gridDimensions.N; col++) {
        const pixel = mappedPixelData[row][col];
        const x = coordLeft + col * cellSize;
        const y = coordTop + row * cellSize;
        const cellKey = `${row},${col}`;

        // 确定格子颜色
        let fillColor = pixel.color;

        // 逐色模式下非当前颜色显示为灰度；逐行模式全色显示
        if (progressMode === 'color' && pixel.color !== currentColor) {
          // 转换为灰度
          const hex = pixel.color.replace('#', '');
          const r = parseInt(hex.substr(0, 2), 16);
          const g = parseInt(hex.substr(2, 2), 16);
          const b = parseInt(hex.substr(4, 2), 16);
          const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
          fillColor = `rgb(${gray}, ${gray}, ${gray})`;
        }

        // 绘制格子背景
        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, cellSize, cellSize);

        // 已完成格子添加勾选标记（逐色模式只标当前色，逐行模式不限颜色）
        if (completedCells.has(cellKey) && (progressMode === 'row' || pixel.color === currentColor)) {
          ctx.fillStyle = 'rgba(0, 255, 0, 0.6)';
          ctx.fillRect(x, y, cellSize, cellSize);

          // 绘制勾选图标
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + cellSize * 0.2, y + cellSize * 0.5);
          ctx.lineTo(x + cellSize * 0.4, y + cellSize * 0.7);
          ctx.lineTo(x + cellSize * 0.8, y + cellSize * 0.3);
          ctx.stroke();
        }

        // 推荐区域高亮仅用于逐色模式
        if (progressMode === 'color') {
          // 如果是推荐区域的一部分，添加高亮边框
          const isInRecommendedRegion = recommendedRegion?.some(cell =>
            cell.row === row && cell.col === col
          );
          if (isInRecommendedRegion) {
            ctx.strokeStyle = '#ff4444';
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]);
            ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            ctx.setLineDash([]);
          }

          // 如果是推荐区域的中心点，添加特殊标记
          if (recommendedCell && recommendedCell.row === row && recommendedCell.col === col && isInRecommendedRegion) {
            // 绘制中心点标记
            ctx.fillStyle = '#ff4444';
            ctx.beginPath();
            ctx.arc(x + cellSize / 2, y + cellSize / 2, 4, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      }
    }

    // 逐行模式：压暗非当前行并高亮当前行
    if (progressMode === 'row' && gridDimensions.M > 1) {
      const gridWidth = gridDimensions.N * cellSize;
      const currentRowTop = coordTop + currentRow * cellSize;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      if (currentRow > 0) {
        ctx.fillRect(coordLeft, coordTop, gridWidth, currentRow * cellSize);
      }
      if (currentRow < gridDimensions.M - 1) {
        ctx.fillRect(coordLeft, currentRowTop + cellSize, gridWidth, (gridDimensions.M - currentRow - 1) * cellSize);
      }
      // 当前行高亮边线
      ctx.strokeStyle = '#007acc';
      ctx.lineWidth = 2;
      ctx.strokeRect(coordLeft + 1, currentRowTop + 1, gridWidth - 2, cellSize - 2);
    }

    // 绘制分区线（在所有格子绘制完成后）
    if (showSectionLines) {
      ctx.strokeStyle = sectionLineColor;
      ctx.lineWidth = 2;

      // 绘制竖直分区线
      for (let col = gridSectionInterval; col < gridDimensions.N; col += gridSectionInterval) {
        const x = coordLeft + col * cellSize;
        ctx.beginPath();
        ctx.moveTo(x, coordTop);
        ctx.lineTo(x, canvasHeight);
        ctx.stroke();
      }

      // 绘制水平分区线
      for (let row = gridSectionInterval; row < gridDimensions.M; row += gridSectionInterval) {
        const y = coordTop + row * cellSize;
        ctx.beginPath();
        ctx.moveTo(coordLeft, y);
        ctx.lineTo(canvasWidth, y);
        ctx.stroke();
      }
    }

    // 绘制坐标标尺（最上层，1 起始与进度提示一致）
    if (showCoordinates) {
      ctx.fillStyle = '#64748b';
      ctx.font = '9px ui-monospace, monospace';
      ctx.textBaseline = 'alphabetic';

      // 顶部列号：每个分区间隔一处
      ctx.textAlign = 'left';
      for (let col = 0; col < gridDimensions.N; col += gridSectionInterval) {
        ctx.fillText(String(col + 1), coordLeft + col * cellSize + 1, coordTop - 4);
      }

      // 左侧行号：逐行模式每行一处，逐色模式每个分区间隔一处
      const rowStep = progressMode === 'row' ? 1 : gridSectionInterval;
      for (let row = 0; row < gridDimensions.M; row += rowStep) {
        const y = coordTop + row * cellSize + Math.min(cellSize - 3, cellSize / 2 + 3);
        ctx.fillText(String(row + 1), 1, y);
      }
    }
  }, [mappedPixelData, gridDimensions, cellSize, currentColor, completedCells, recommendedCell, recommendedRegion, gridSectionInterval, showSectionLines, sectionLineColor, progressMode, currentRow, showCoordinates]);

  // 处理触摸/鼠标事件
  const getEventPosition = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;

    if ('touches' in event) {
      if (event.touches.length === 0) return null;
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    return {
      x: (clientX - rect.left) / canvasScale,
      y: (clientY - rect.top) / canvasScale
    };
  }, [canvasScale]);

  const getGridPosition = useCallback((x: number, y: number) => {
    // 坐标标尺占用的边距不参与格子映射
    const coordLeft = showCoordinates ? 18 : 0;
    const coordTop = showCoordinates ? 14 : 0;
    const col = Math.floor((x - coordLeft) / cellSize);
    const row = Math.floor((y - coordTop) / cellSize);

    if (row >= 0 && row < gridDimensions.M && col >= 0 && col < gridDimensions.N) {
      return { row, col };
    }
    return null;
  }, [cellSize, gridDimensions, showCoordinates]);

  // 计算两指间距离
  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // 处理点击
  const handleClick = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();

    // 拖拽（平移）结束后浏览器仍会派发 click，超过阈值则忽略
    if (dragDistanceRef.current > 5) {
      dragDistanceRef.current = 0;
      return;
    }

    const pos = getEventPosition(event);
    if (!pos) return;

    const gridPos = getGridPosition(pos.x, pos.y);
    if (gridPos) {
      onCellClick(gridPos.row, gridPos.col);
    }
  }, [onCellClick, getEventPosition, getGridPosition]);

  // 处理缩放
  const handleWheel = useCallback((event: React.WheelEvent) => {
    event.preventDefault();
    
    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.3, Math.min(3, canvasScale * delta));
    onScaleChange(newScale);
  }, [canvasScale, onScaleChange]);

  // 处理双指缩放（触摸）
  const handleTouchStart = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 1) {
      // 单指拖拽开始
      setIsDragging(true);
      setLastPanPoint({
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      });
      setLastPinchDistance(null);
      // 触摸点按依赖合成 click，重置拖拽位移计数
      dragDistanceRef.current = 0;
    } else if (event.touches.length === 2) {
      // 双指缩放开始
      event.preventDefault();
      setIsDragging(false);
      setLastPanPoint(null);
      setLastPinchDistance(getTouchDistance(event.touches));
    }
  }, []);

  const handleTouchMove = useCallback((event: React.TouchEvent) => {
    event.preventDefault();
    
    if (event.touches.length === 1 && isDragging && lastPanPoint) {
      // 单指拖拽；偏移量处于缩放坐标系内，除以 scale 使平移与手指 1:1
      const deltaX = (event.touches[0].clientX - lastPanPoint.x) / canvasScale;
      const deltaY = (event.touches[0].clientY - lastPanPoint.y) / canvasScale;
      
      onOffsetChange({
        x: canvasOffset.x + deltaX,
        y: canvasOffset.y + deltaY
      });
      
      setLastPanPoint({
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      });
    } else if (event.touches.length === 2 && lastPinchDistance !== null) {
      // 双指缩放处理
      const currentDistance = getTouchDistance(event.touches);
      const scaleRatio = currentDistance / lastPinchDistance;
      
      // 限制缩放范围并应用缩放
      const newScale = Math.max(0.3, Math.min(3, canvasScale * scaleRatio));
      onScaleChange(newScale);
      
      // 更新距离记录
      setLastPinchDistance(currentDistance);
    }
  }, [isDragging, lastPanPoint, canvasOffset, onOffsetChange, lastPinchDistance, canvasScale, onScaleChange]);

  const handleTouchEnd = useCallback((event: React.TouchEvent) => {
    if (event.touches.length === 0) {
      setIsDragging(false);
      setLastPanPoint(null);
      setLastPinchDistance(null);
      // 点按标记依赖浏览器合成的 click 事件（handleClick）
    } else if (event.touches.length === 1) {
      // 从双指缩放切换到单指拖拽
      setLastPinchDistance(null);
      setIsDragging(true);
      setLastPanPoint({
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      });
    }
  }, []);

  // 鼠标拖拽处理
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    setIsDragging(true);
    dragDistanceRef.current = 0;
    setLastPanPoint({
      x: event.clientX,
      y: event.clientY
    });
  }, []);

  const handleMouseMove = useCallback((event: React.MouseEvent) => {
    if (isDragging && lastPanPoint) {
      const screenDeltaX = event.clientX - lastPanPoint.x;
      const screenDeltaY = event.clientY - lastPanPoint.y;
      dragDistanceRef.current += Math.abs(screenDeltaX) + Math.abs(screenDeltaY);

      // 偏移量处于缩放坐标系内，除以 scale 使平移与指针 1:1
      onOffsetChange({
        x: canvasOffset.x + screenDeltaX / canvasScale,
        y: canvasOffset.y + screenDeltaY / canvasScale
      });

      setLastPanPoint({
        x: event.clientX,
        y: event.clientY
      });
    }
  }, [isDragging, lastPanPoint, canvasOffset, canvasScale, onOffsetChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setLastPanPoint(null);
  }, []);

  // 渲染画布
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden bg-muted"
      style={{ touchAction: 'none' }}
    >
      <div
        style={{
          transform: `scale(${canvasScale}) translate(${canvasOffset.x}px, ${canvasOffset.y}px)`,
          transformOrigin: 'center center'
        }}
      >
        <canvas
          ref={canvasRef}
          className="cursor-crosshair border border-border shadow-[var(--shadow-card)]"
          onClick={handleClick}
          onWheel={handleWheel}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
      </div>
    </div>
  );
};

export default FocusCanvas;
