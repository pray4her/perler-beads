'use client';

import React from 'react';
import { MappedPixel } from '../utils/pixelation';
import { ColorSystem } from '../utils/colorSystemUtils';
import { exportCsvData } from '../utils/imageDownloader';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Download, Eye } from 'lucide-react';

interface FocusModePreDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedWithoutDownload: () => void;
  mappedPixelData: MappedPixel[][] | null;
  gridDimensions: { N: number; M: number } | null;
  selectedColorSystem: ColorSystem;
}

const FocusModePreDownloadModal: React.FC<FocusModePreDownloadModalProps> = ({
  isOpen,
  onClose,
  onProceedWithoutDownload,
  mappedPixelData,
  gridDimensions,
  selectedColorSystem,
}) => {
  const handleDownloadAndProceed = () => {
    exportCsvData({
      mappedPixelData,
      gridDimensions,
      selectedColorSystem,
    });

    setTimeout(() => {
      onProceedWithoutDownload();
    }, 500);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="items-center text-center sm:items-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-muted">
            <Eye className="h-6 w-6 text-foreground" strokeWidth={1.5} />
          </div>
          <DialogTitle>进入专心拼豆模式</DialogTitle>
          <DialogDescription>
            进入后无法返回当前编辑界面。建议先下载 CSV 数据文件保存。
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">重要提醒</p>
          <p>
            专心拼豆模式面向制作过程：颜色引导、进度追踪与触控缩放。退出后将丢失当前编辑状态。
          </p>
          <ul className="mt-3 space-y-1 text-xs">
            <li>专为手机优化的拼豆助手</li>
            <li>提供颜色引导和进度追踪</li>
            <li>支持触摸操作和缩放查看</li>
            <li>退出后将丢失当前编辑状态</li>
          </ul>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button className="w-full" onClick={handleDownloadAndProceed}>
            <Download data-icon="inline-start" />
            下载数据文件并进入
          </Button>
          <Button variant="outline" className="w-full" onClick={onProceedWithoutDownload}>
            直接进入（不下载）
          </Button>
          <Button variant="ghost" className="w-full" onClick={onClose}>
            取消
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FocusModePreDownloadModal;
