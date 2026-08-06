import React, { useState, useRef, useCallback, useEffect } from 'react';
import { MappedPixel } from '../utils/pixelation';
import { useT } from '@/i18n/context';
import { webPlatform } from '@/platform/web';

interface CompletionCardProps {
  isVisible: boolean;
  mappedPixelData: MappedPixel[][];
  gridDimensions: { N: number; M: number };
  totalElapsedTime: number;
  onClose: () => void;
}

const CompletionCard: React.FC<CompletionCardProps> = ({
  isVisible,
  mappedPixelData,
  gridDimensions,
  totalElapsedTime,
  onClose
}) => {
  const t = useT();
  const [userPhoto, setUserPhoto] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);

  // 计算总豆子数（与专心模式页一致：排除外部/透明格子）
  const totalBeads = React.useMemo(() => {
    if (!mappedPixelData) return 0;

    let count = 0;
    for (let row = 0; row < gridDimensions.M; row++) {
      for (let col = 0; col < gridDimensions.N; col++) {
        const pixel = mappedPixelData[row][col];
        if (pixel && !pixel.isExternal) {
          count++;
        }
      }
    }
    return count;
  }, [mappedPixelData, gridDimensions]);

  // 卸载时停止相机流，避免关闭打卡图后摄像头仍被占用（stop 幂等，拍照/取消路径已停止时无副作用）
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  // 格式化时间
  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return t.focus.completion.hoursMinutes(hours, minutes);
    } else {
      return t.focus.completion.minutesSeconds(minutes, secs);
    }
  }, [t]);

  // 生成原图缩略图
  const generateThumbnail = useCallback(() => {
    if (!mappedPixelData) return null;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 根据实际比例计算缩略图尺寸，保持宽高比
    const aspectRatio = gridDimensions.N / gridDimensions.M;
    const maxThumbnailSize = 200;
    
    let thumbnailWidth, thumbnailHeight;
    if (aspectRatio > 1) {
      // 宽图
      thumbnailWidth = maxThumbnailSize;
      thumbnailHeight = maxThumbnailSize / aspectRatio;
    } else {
      // 高图或方图
      thumbnailHeight = maxThumbnailSize;
      thumbnailWidth = maxThumbnailSize * aspectRatio;
    }

    canvas.width = thumbnailWidth;
    canvas.height = thumbnailHeight;

    const cellWidth = thumbnailWidth / gridDimensions.N;
    const cellHeight = thumbnailHeight / gridDimensions.M;

    // 绘制缩略图
    for (let row = 0; row < gridDimensions.M; row++) {
      for (let col = 0; col < gridDimensions.N; col++) {
        const pixel = mappedPixelData[row][col];
        ctx.fillStyle = pixel.color;
        ctx.fillRect(
          col * cellWidth,
          row * cellHeight,
          cellWidth,
          cellHeight
        );
      }
    }

    return canvas.toDataURL();
  }, [mappedPixelData, gridDimensions]);

  // 开启相机
  const startCamera = async () => {
    try {
      setIsCapturing(true);
      setCameraError(false);
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // 后置摄像头
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
    } catch (error) {
      console.error('无法访问相机:', error);
      setIsCapturing(false);
      setCameraError(true);
    }
  };

  // 拍照
  const takePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const photoDataURL = canvas.toDataURL('image/jpeg', 0.8);
    setUserPhoto(photoDataURL);

    // 停止相机
    const stream = video.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setIsCapturing(false);
  };

  // 跳过拍照，使用拼豆原图
  const skipPhoto = () => {
    const thumbnailDataURL = generateThumbnail();
    if (thumbnailDataURL) {
      setUserPhoto(thumbnailDataURL);
    }
  };

  // 生成打卡图
  const generateCompletionCard = useCallback(() => {
    if (!userPhoto || !cardCanvasRef.current) return null;

    const canvas = cardCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 检查是否使用的是拼豆原图（通过比较是否等于generateThumbnail的结果）
    const thumbnailDataURL = generateThumbnail();
    const isUsingPixelArt = userPhoto === thumbnailDataURL;

    // 设置画布尺寸 (3:4比例，适合分享)
    const cardWidth = 720;
    const cardHeight = 960;
    canvas.width = cardWidth;
    canvas.height = cardHeight;

    return new Promise<string>((resolve) => {
      // 加载用户照片/拼豆图
      const userImg = new Image();
      userImg.onload = () => {
        if (isUsingPixelArt) {
          // ===== 拼豆原图模式：原图占主导 =====
          
          // 深色渐变背景，更有质感
          const gradient = ctx.createLinearGradient(0, 0, 0, cardHeight);
          gradient.addColorStop(0, '#1a1a2e');
          gradient.addColorStop(0.3, '#16213e');
          gradient.addColorStop(0.7, '#0f3460');
          gradient.addColorStop(1, '#533483');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, cardWidth, cardHeight);

          // 计算拼豆图尺寸，保持原始宽高比
          const imgAspectRatio = userImg.naturalWidth / userImg.naturalHeight;
          const maxWidth = cardWidth * 0.9;
          const maxHeight = cardHeight * 0.6;
          
          let imageWidth, imageHeight;
          if (maxWidth / maxHeight > imgAspectRatio) {
            // 以高度为准
            imageHeight = maxHeight;
            imageWidth = imageHeight * imgAspectRatio;
          } else {
            // 以宽度为准
            imageWidth = maxWidth;
            imageHeight = imageWidth / imgAspectRatio;
          }
          
          const imageX = (cardWidth - imageWidth) / 2;
          const imageY = (cardHeight - imageHeight) / 2 - 80; // 往上偏移更多

          // 绘制主图片的装饰背景和阴影
          ctx.save();
          // 外层光晕效果
          const glowGradient = ctx.createRadialGradient(
            imageX + imageWidth/2, imageY + imageHeight/2, Math.min(imageWidth, imageHeight)/2,
            imageX + imageWidth/2, imageY + imageHeight/2, Math.min(imageWidth, imageHeight)/2 + 30
          );
          glowGradient.addColorStop(0, 'rgba(255,255,255,0.1)');
          glowGradient.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = glowGradient;
          ctx.fillRect(imageX - 30, imageY - 30, imageWidth + 60, imageHeight + 60);
          
          // 白色边框背景
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 25;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 15;
          const borderWidth = 12;
          ctx.fillRect(imageX - borderWidth, imageY - borderWidth, 
                      imageWidth + borderWidth * 2, imageHeight + borderWidth * 2);
          ctx.restore();

          // 绘制拼豆原图
          ctx.drawImage(userImg, imageX, imageY, imageWidth, imageHeight);

          // 顶部区域：简洁的完成标识
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 28px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.3)';
          ctx.shadowBlur = 8;
          ctx.fillText(t.focus.completion.title, cardWidth / 2, 80);
          ctx.shadowBlur = 0;

          // 底部信息区域：直接显示文字
          const infoY = imageY + imageHeight + 40;
          
          // 信息文字 - 一行显示
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 8;
          ctx.fillText(t.focus.completion.cardStats(formatTime(totalElapsedTime), totalBeads), cardWidth / 2, infoY + 40);

          // 底部产品信息
          ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.fillText(t.metadata.siteName, cardWidth / 2, cardHeight - 35);

          resolve(canvas.toDataURL('image/jpeg', 0.95));
          
        } else {
          // ===== 用户照片模式：照片占主导 =====
          
          // 温暖渐变背景
          const gradient = ctx.createLinearGradient(0, 0, 0, cardHeight);
          gradient.addColorStop(0, '#ff9a9e');
          gradient.addColorStop(0.3, '#fecfef');
          gradient.addColorStop(0.7, '#fecfef');
          gradient.addColorStop(1, '#ff9a9e');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, cardWidth, cardHeight);

          // 计算照片尺寸，保持原始宽高比
          const photoAspectRatio = userImg.naturalWidth / userImg.naturalHeight;
          const maxPhotoWidth = cardWidth * 0.85;
          const maxPhotoHeight = cardHeight * 0.6;
          
          let photoWidth, photoHeight;
          if (maxPhotoWidth / maxPhotoHeight > photoAspectRatio) {
            // 以高度为准
            photoHeight = maxPhotoHeight;
            photoWidth = photoHeight * photoAspectRatio;
          } else {
            // 以宽度为准
            photoWidth = maxPhotoWidth;
            photoHeight = photoWidth / photoAspectRatio;
          }
          
          const photoX = (cardWidth - photoWidth) / 2;
          const photoY = (cardHeight - photoHeight) / 2 - 80;

          // 绘制照片装饰背景和阴影
          ctx.save();
          // 外层装饰边框
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = 8;
          ctx.strokeRect(photoX - 15, photoY - 15, photoWidth + 30, photoHeight + 30);
          
          // 内层白色边框背景
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = 'rgba(0,0,0,0.2)';
          ctx.shadowBlur = 20;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 10;
          ctx.fillRect(photoX - 12, photoY - 12, photoWidth + 24, photoHeight + 24);
          ctx.restore();

          // 绘制照片（保持宽高比）
          ctx.drawImage(userImg, photoX, photoY, photoWidth, photoHeight);



          // 底部信息区域：直接显示文字
          const infoCardY = photoY + photoHeight + 30;

          // 信息文字 - 一行显示
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 22px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textAlign = 'center';
          ctx.shadowColor = 'rgba(0,0,0,0.5)';
          ctx.shadowBlur = 8;
          ctx.fillText(t.focus.completion.cardStatsFull(formatTime(totalElapsedTime), totalBeads), cardWidth / 2, infoCardY + 35);

          // 添加小的拼豆原图作为装饰
          if (thumbnailDataURL) {
            const thumbnailImg = new Image();
            thumbnailImg.onload = () => {
              // 计算小缩略图尺寸，保持比例
              const maxThumbSize = 60;
              const thumbAspectRatio = thumbnailImg.naturalWidth / thumbnailImg.naturalHeight;
              
              let thumbWidth, thumbHeight;
              if (thumbAspectRatio > 1) {
                // 宽图
                thumbWidth = maxThumbSize;
                thumbHeight = maxThumbSize / thumbAspectRatio;
              } else {
                // 高图或方图
                thumbHeight = maxThumbSize;
                thumbWidth = maxThumbSize * thumbAspectRatio;
              }
              
              const thumbX = cardWidth / 2 - thumbWidth / 2;
              const thumbY = infoCardY + 80;
              
              // 绘制小缩略图背景
              ctx.fillStyle = '#ffffff';
              ctx.shadowColor = 'rgba(0,0,0,0.3)';
              ctx.shadowBlur = 8;
              ctx.fillRect(thumbX - 3, thumbY - 3, thumbWidth + 6, thumbHeight + 6);
              ctx.shadowBlur = 0;
               
              // 绘制小缩略图（保持宽高比）
              ctx.drawImage(thumbnailImg, thumbX, thumbY, thumbWidth, thumbHeight);
               
              // 缩略图边框
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 3;
              ctx.strokeRect(thumbX - 3, thumbY - 3, thumbWidth + 6, thumbHeight + 6);

              // 底部产品信息
              ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.8)';
              ctx.textAlign = 'center';
              ctx.shadowColor = 'rgba(0,0,0,0.5)';
              ctx.shadowBlur = 4;
              ctx.fillText(t.metadata.siteName, cardWidth / 2, cardHeight - 30);
              ctx.shadowBlur = 0;

              resolve(canvas.toDataURL('image/jpeg', 0.95));
            };
            thumbnailImg.src = thumbnailDataURL;
          } else {
            // 底部产品信息
            ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.textAlign = 'center';
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.shadowBlur = 4;
            ctx.fillText(t.metadata.siteName, cardWidth / 2, cardHeight - 30);
            ctx.shadowBlur = 0;

            resolve(canvas.toDataURL('image/jpeg', 0.95));
          }
        }
      };
      userImg.src = userPhoto;
    });
  }, [userPhoto, totalElapsedTime, generateThumbnail, totalBeads, formatTime, t]);

  // 下载打卡图
  const downloadCard = async () => {
    const cardDataURL = await generateCompletionCard();
    if (cardDataURL) {
      const artifact = await webPlatform.artifacts.createFromDataUrl(cardDataURL);
      try {
        await webPlatform.artifacts.save(artifact, t.focus.completion.cardFileName(new Date().toLocaleDateString()));
      } finally {
        webPlatform.artifacts.release(artifact);
      }
    }
  };

  // 分享打卡图（Web Share API）；用户取消不处理，其他失败回退到下载
  const shareCard = async () => {
    const cardDataURL = await generateCompletionCard();
    if (!cardDataURL) return;
    const fileName = t.focus.completion.cardFileName(new Date().toLocaleDateString());
    const artifact = await webPlatform.artifacts.createFromDataUrl(cardDataURL);
    try {
      if (await webPlatform.artifacts.share(artifact, fileName, t.focus.completion.title)) return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    } finally {
      webPlatform.artifacts.release(artifact);
    }
    // 不支持或分享失败：回退到下载
    const fallback = await webPlatform.artifacts.createFromDataUrl(cardDataURL);
    try {
      await webPlatform.artifacts.save(fallback, fileName);
    } finally {
      webPlatform.artifacts.release(fallback);
    }
  };

  // 仅在支持 Web Share API 的环境显示分享按钮
  const canShareCard = typeof navigator !== 'undefined' && 'canShare' in navigator;

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              {t.focus.completion.title}
            </h2>
            <div className="text-gray-600 space-y-1">
              <p>{t.focus.completion.totalTime(formatTime(totalElapsedTime))}</p>
              <p>{t.focus.completion.totalBeads(totalBeads)}</p>
            </div>
          </div>

          {!userPhoto ? (
            <div className="text-center">
              {!isCapturing ? (
                <div>
                  <p className="text-gray-600 mb-4">
                    {t.focus.completion.photoPrompt}
                  </p>
                  {cameraError && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                      <p className="text-yellow-800 text-sm">
                        {t.focus.completion.cameraErrorTitle}<br/>
                        {t.focus.completion.cameraErrorHint}
                      </p>
                    </div>
                  )}
                  <div className="space-y-3">
                    <button
                      onClick={startCamera}
                      className="w-full bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/80 transition-colors"
                    >
                      {t.focus.completion.openCamera}
                    </button>
                    <button
                      onClick={skipPhoto}
                      className="w-full border border-border bg-background text-foreground px-6 py-3 rounded-lg hover:bg-muted transition-colors"
                    >
                      {t.focus.completion.skipPhoto}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full max-w-xs mx-auto rounded-lg mb-4"
                  />
                  <button
                    onClick={takePhoto}
                    className="bg-primary text-primary-foreground px-6 py-3 rounded-lg hover:bg-primary/80 transition-colors mr-2"
                  >
                    {t.focus.completion.takePhoto}
                  </button>
                  <button
                    onClick={() => {
                      const stream = videoRef.current?.srcObject as MediaStream;
                      stream?.getTracks().forEach(track => track.stop());
                      streamRef.current = null;
                      setIsCapturing(false);
                    }}
                    className="border border-border bg-background text-foreground px-4 py-3 rounded-lg hover:bg-muted transition-colors"
                  >
                    {t.focus.completion.cancel}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={userPhoto}
                alt={t.focus.completion.userPhotoAlt}
                className="w-32 h-32 rounded-full mx-auto mb-4 object-cover"
              />
              <div className="space-y-3">
                {canShareCard && (
                  <button
                    onClick={shareCard}
                    className="w-full bg-primary text-primary-foreground py-3 rounded-lg hover:bg-primary/80 transition-colors"
                  >
                    {t.focus.completion.shareCard}
                  </button>
                )}
                <button
                  onClick={downloadCard}
                  className={`w-full py-3 rounded-lg transition-colors ${
                    canShareCard
                      ? 'border border-border bg-background text-foreground hover:bg-muted'
                      : 'bg-primary text-primary-foreground hover:bg-primary/80'
                  }`}
                >
                  {t.focus.completion.downloadCard}
                </button>
                <button
                  onClick={() => setUserPhoto(null)}
                  className="w-full border border-border bg-background text-foreground py-2 rounded-lg hover:bg-muted transition-colors"
                >
                  {t.focus.completion.retakePhoto}
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full bg-gray-100 text-gray-600 py-2 rounded-lg hover:bg-gray-200 transition-colors"
            >
              {t.focus.completion.later}
            </button>
          </div>
        </div>
      </div>

      {/* 隐藏的canvas用于生成图片 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <canvas ref={cardCanvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default CompletionCard;
