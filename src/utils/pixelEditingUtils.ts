import { MappedPixel } from './pixelation';

// 透明键定义
export const TRANSPARENT_KEY = 'ERASE';

// 透明色数据
export const transparentColorData: MappedPixel = { 
  key: TRANSPARENT_KEY, 
  color: '#FFFFFF', 
  isExternal: true 
};

/**
 * 重新计算颜色统计
 * @param pixelData 像素数据
 * @returns 颜色统计对象和总数
 */
export function recalculateColorStats(
  pixelData: MappedPixel[][]
): {
  colorCounts: { [hexKey: string]: { count: number; color: string } };
  totalCount: number;
} {
  const colorCounts: { [hexKey: string]: { count: number; color: string } } = {};
  let totalCount = 0;

  pixelData.flat().forEach(cell => {
    if (cell && !cell.isExternal && cell.key !== TRANSPARENT_KEY) {
      const cellHex = cell.color.toUpperCase();
      if (!colorCounts[cellHex]) {
        colorCounts[cellHex] = {
          count: 0,
          color: cellHex
        };
      }
      colorCounts[cellHex].count++;
      totalCount++;
    }
  });

  return { colorCounts, totalCount };
} 