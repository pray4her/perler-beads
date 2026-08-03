import { GridDownloadOptions } from '../types/downloadTypes';
import { MappedPixel, PaletteColor } from './pixelation';
import { getColorKeyByHex, ColorSystem } from './colorSystemUtils';

// 用于获取对比色的工具函数 - 从page.tsx复制
function getContrastColor(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#000000'; // Default to black
  // Simple brightness check (Luma formula Y = 0.2126 R + 0.7152 G + 0.0722 B)
  const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luma > 0.5 ? '#000000' : '#FFFFFF'; // Dark background -> white text, Light background -> black text
}

// 辅助函数：将十六进制颜色转换为RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const formattedHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(formattedHex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// 用于排序颜色键的函数 - 从page.tsx复制
function sortColorKeys(a: string, b: string): number {
  const regex = /^([A-Z]+)(\d+)$/;
  const matchA = a.match(regex);
  const matchB = b.match(regex);

  if (matchA && matchB) {
    const prefixA = matchA[1];
    const numA = parseInt(matchA[2], 10);
    const prefixB = matchB[1];
    const numB = parseInt(matchB[2], 10);

    if (prefixA !== prefixB) {
      return prefixA.localeCompare(prefixB); // Sort by prefix first (A, B, C...)
    }
    return numA - numB; // Then sort by number (1, 2, 10...)
  }
  // Fallback for keys that don't match the standard pattern (e.g., T1, ZG1)
  return a.localeCompare(b);
}

// 导出CSV hex数据的函数
export function exportCsvData({
  mappedPixelData,
  gridDimensions,
  selectedColorSystem
}: {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
}): void {
  if (!mappedPixelData || !gridDimensions) {
    console.error("导出失败: 映射数据或尺寸无效。");
    alert("无法导出CSV，数据未生成或无效。");
    return;
  }

  const { N, M } = gridDimensions;
  
  // 生成CSV内容，每行代表图纸的一行
  const csvLines: string[] = [];
  
  for (let row = 0; row < M; row++) {
    const rowData: string[] = [];
    for (let col = 0; col < N; col++) {
      const cellData = mappedPixelData[row][col];
      if (cellData && !cellData.isExternal) {
        // 内部单元格，记录hex颜色值
        rowData.push(cellData.color);
      } else {
        // 外部单元格或空白，使用特殊标记
        rowData.push('TRANSPARENT');
      }
    }
    csvLines.push(rowData.join(','));
  }

  // 创建CSV内容
  const csvContent = csvLines.join('\n');
  
  // 创建并下载CSV文件
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `bead-pattern-${N}x${M}-${selectedColorSystem}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // 释放URL对象
  URL.revokeObjectURL(url);
  
  console.log("CSV数据导出完成");
}

// 导入CSV hex数据的函数
export function importCsvData(file: File): Promise<{
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          reject(new Error('无法读取文件内容'));
          return;
        }
        
        // 解析CSV内容
        const lines = text.trim().split('\n');
        const M = lines.length; // 行数
        
        if (M === 0) {
          reject(new Error('CSV文件为空'));
          return;
        }
        
        // 解析第一行获取列数
        const firstRowData = lines[0].split(',');
        const N = firstRowData.length; // 列数
        
        if (N === 0) {
          reject(new Error('CSV文件格式无效'));
          return;
        }
        
        // 创建映射数据
        const mappedPixelData: MappedPixel[][] = [];
        
        for (let row = 0; row < M; row++) {
          const rowData = lines[row].split(',');
          const mappedRow: MappedPixel[] = [];
          
          // 确保每行都有正确的列数
          if (rowData.length !== N) {
            reject(new Error(`第${row + 1}行的列数不匹配，期望${N}列，实际${rowData.length}列`));
            return;
          }
          
          for (let col = 0; col < N; col++) {
            const cellValue = rowData[col].trim();
            
            if (cellValue === 'TRANSPARENT' || cellValue === '') {
              // 外部/透明单元格
              mappedRow.push({
                key: 'TRANSPARENT',
                color: '#FFFFFF',
                isExternal: true
              });
            } else {
              // 验证hex颜色格式
              const hexPattern = /^#[0-9A-Fa-f]{6}$/;
              if (!hexPattern.test(cellValue)) {
                reject(new Error(`第${row + 1}行第${col + 1}列的颜色值无效：${cellValue}`));
                return;
              }
              
              // 内部单元格
              mappedRow.push({
                key: cellValue.toUpperCase(),
                color: cellValue.toUpperCase(),
                isExternal: false
              });
            }
          }
          
          mappedPixelData.push(mappedRow);
        }
        
        // 返回解析结果
        resolve({
          mappedPixelData,
          gridDimensions: { N, M }
        });
        
      } catch (error) {
        reject(new Error(`解析CSV文件失败：${error}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('读取文件失败'));
    };
    
    reader.readAsText(file, 'utf-8');
  });
}

interface DownloadImageParams {
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  colorCounts: { [key: string]: { count: number; color: string } } | null;
  totalBeadCount: number;
  options: GridDownloadOptions;
  activeBeadPalette: PaletteColor[];
  selectedColorSystem: ColorSystem;
}

function triggerCanvasDownload(canvas: HTMLCanvasElement, filename: string) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// 制作底稿下载：对应编辑工作台的工程图版式。
export async function downloadImage({
  mappedPixelData,
  gridDimensions,
  colorCounts,
  totalBeadCount,
  options,
  activeBeadPalette,
  selectedColorSystem
}: DownloadImageParams): Promise<void> {
  if (!mappedPixelData || !gridDimensions || !colorCounts || activeBeadPalette.length === 0) {
    alert('无法下载图纸，数据未生成或无效。');
    return;
  }

  const { N, M } = gridDimensions;
  const longestSide = Math.max(N, M);
  const cellSize = Math.max(7, Math.min(28, Math.floor(6500 / Math.max(1, longestSide))));
  const pagePadding = Math.max(18, Math.round(cellSize * 0.9));
  const axisSize = options.showCoordinates ? Math.max(24, Math.round(cellSize * 1.3)) : 0;
  const titleHeight = Math.max(68, Math.round(cellSize * 3.2));
  const gridWidth = N * cellSize;
  const gridHeight = M * cellSize;
  const contentWidth = gridWidth + axisSize * 2;
  const sheetWidth = contentWidth + pagePadding * 2;
  const statsColumns = Math.max(2, Math.min(8, Math.floor(sheetWidth / 150)));
  const statsKeys = Object.keys(colorCounts).sort((left, right) =>
    sortColorKeys(
      getColorKeyByHex(left, selectedColorSystem),
      getColorKeyByHex(right, selectedColorSystem),
    ),
  );
  const statsRows = Math.ceil(statsKeys.length / statsColumns);
  const statsTitleHeight = options.includeStats ? 62 : 0;
  const statsRowHeight = options.includeStats ? Math.max(58, Math.round(cellSize * 2.7)) : 0;
  const statsHeight = options.includeStats
    ? statsTitleHeight + statsRows * statsRowHeight + pagePadding
    : 0;
  const sheetHeight = titleHeight + axisSize * 2 + gridHeight + statsHeight + pagePadding * 2;
  const canvas = document.createElement('canvas');
  canvas.width = sheetWidth;
  canvas.height = sheetHeight;
  const context = canvas.getContext('2d');
  if (!context) {
    alert('无法创建图纸画布。');
    return;
  }

  context.imageSmoothingEnabled = false;
  context.fillStyle = '#faf9f5';
  context.fillRect(0, 0, sheetWidth, sheetHeight);

  const titleSize = Math.max(24, Math.round(titleHeight * 0.42));
  context.fillStyle = '#687c52';
  context.font = `700 ${titleSize}px system-ui, sans-serif`;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(selectedColorSystem, pagePadding, titleHeight * 0.48);
  const titleWidth = context.measureText(selectedColorSystem).width;
  context.fillStyle = '#a29f96';
  context.font = `400 ${Math.round(titleSize * 0.58)}px system-ui, sans-serif`;
  context.fillText('色号', pagePadding + titleWidth + 8, titleHeight * 0.5);

  const gridX = pagePadding + axisSize;
  const gridY = pagePadding + titleHeight + axisSize;
  const codeFontSize = Math.max(4, Math.floor(cellSize * 0.27));
  context.font = `600 ${codeFontSize}px ui-monospace, monospace`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (let row = 0; row < M; row++) {
    for (let col = 0; col < N; col++) {
      const cell = mappedPixelData[row]?.[col];
      const x = gridX + col * cellSize;
      const y = gridY + row * cellSize;
      if (cell && !cell.isExternal) {
        context.fillStyle = cell.color;
        context.fillRect(x, y, cellSize, cellSize);
        if (options.showCellNumbers && cellSize >= 10) {
          context.fillStyle = getContrastColor(cell.color);
          context.fillText(
            getColorKeyByHex(cell.color, selectedColorSystem),
            x + cellSize / 2,
            y + cellSize / 2,
            cellSize - 2,
          );
        }
      } else {
        const checker = Math.max(2, Math.floor(cellSize / 4));
        context.fillStyle = '#ffffff';
        context.fillRect(x, y, cellSize, cellSize);
        context.fillStyle = '#eeeeeb';
        context.fillRect(x, y, checker, checker);
        context.fillRect(x + checker, y + checker, checker, checker);
      }
      context.strokeStyle = '#dddcd7';
      context.lineWidth = 0.5;
      context.strokeRect(x + 0.25, y + 0.25, cellSize - 0.5, cellSize - 0.5);
    }
  }

  if (options.showGrid) {
    context.strokeStyle = options.gridLineColor;
    context.lineWidth = Math.max(1, cellSize * 0.07);
    for (let col = 0; col <= N; col += options.gridInterval) {
      const x = gridX + col * cellSize;
      context.beginPath();
      context.moveTo(x, gridY);
      context.lineTo(x, gridY + gridHeight);
      context.stroke();
    }
    for (let row = 0; row <= M; row += options.gridInterval) {
      const y = gridY + row * cellSize;
      context.beginPath();
      context.moveTo(gridX, y);
      context.lineTo(gridX + gridWidth, y);
      context.stroke();
    }
  }

  context.strokeStyle = '#76766f';
  context.lineWidth = 1.2;
  context.strokeRect(gridX, gridY, gridWidth, gridHeight);

  if (options.showCoordinates) {
    context.fillStyle = '#9b9992';
    context.font = `400 ${Math.max(8, Math.round(cellSize * 0.42))}px ui-monospace, monospace`;
    for (let col = 0; col < N; col++) {
      if (col === 0 || (col + 1) % options.gridInterval === 0 || col === N - 1) {
        const x = gridX + (col + 0.5) * cellSize;
        context.fillText(String(col + 1), x, gridY - axisSize / 2);
        context.fillText(String(col + 1), x, gridY + gridHeight + axisSize / 2);
      }
    }
    for (let row = 0; row < M; row++) {
      if (row === 0 || (row + 1) % options.gridInterval === 0 || row === M - 1) {
        const y = gridY + (row + 0.5) * cellSize;
        context.fillText(String(row + 1), gridX - axisSize / 2, y);
        context.fillText(String(row + 1), gridX + gridWidth + axisSize / 2, y);
      }
    }
  }

  if (options.includeStats) {
    const statsY = gridY + gridHeight + axisSize + pagePadding;
    context.fillStyle = '#33332f';
    context.font = `700 ${Math.max(16, Math.round(cellSize * 0.75))}px system-ui, sans-serif`;
    context.textAlign = 'left';
    context.fillText('用料清单', pagePadding, statsY + 18);
    context.textAlign = 'right';
    context.fillText(`共 ${totalBeadCount.toLocaleString('zh-CN')} 颗`, sheetWidth - pagePadding, statsY + 18);

    const gap = Math.max(4, Math.round(pagePadding * 0.26));
    const cardWidth = (sheetWidth - pagePadding * 2 - gap * (statsColumns - 1)) / statsColumns;
    statsKeys.forEach((hex, index) => {
      const row = Math.floor(index / statsColumns);
      const col = index % statsColumns;
      const x = pagePadding + col * (cardWidth + gap);
      const y = statsY + statsTitleHeight + row * statsRowHeight;
      const swatchHeight = statsRowHeight * 0.62;
      context.fillStyle = colorCounts[hex].color;
      context.beginPath();
      context.roundRect(x, y, cardWidth, swatchHeight, Math.max(2, cellSize * 0.18));
      context.fill();
      context.fillStyle = getContrastColor(colorCounts[hex].color);
      context.font = `700 ${Math.max(9, Math.round(cellSize * 0.45))}px ui-monospace, monospace`;
      context.textAlign = 'center';
      context.fillText(getColorKeyByHex(hex, selectedColorSystem), x + cardWidth / 2, y + swatchHeight / 2);
      context.fillStyle = '#ffffff';
      context.fillRect(x, y + swatchHeight, cardWidth, statsRowHeight - swatchHeight - gap);
      context.fillStyle = '#33332f';
      context.font = `600 ${Math.max(8, Math.round(cellSize * 0.38))}px ui-monospace, monospace`;
      context.fillText(String(colorCounts[hex].count), x + cardWidth / 2, y + swatchHeight + (statsRowHeight - swatchHeight - gap) / 2);
    });
  }

  triggerCanvasDownload(canvas, `bead-production-sheet-${N}x${M}-${selectedColorSystem}.png`);
  if (options.exportCsv) exportCsvData({ mappedPixelData, gridDimensions, selectedColorSystem });
}
