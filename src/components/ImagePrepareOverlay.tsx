"use client";

import {
  Check,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
  Undo2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import ReactCrop, {
  centerCrop,
  convertToPixelCrop,
  cropToImg,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { transformImageSrc } from "@/utils/cropImage";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";

type AspectPreset = "free" | "1:1" | "4:3" | "3:4";

interface ImagePrepareOverlayProps {
  imageSrc: string;
  isSubmitting?: boolean;
  submitError?: string | null;
  onCancel: () => void;
  onComplete: (croppedDataUrl: string) => void;
}

const ASPECT_PRESETS: { id: AspectPreset; value?: number }[] = [
  { id: "free" },
  { id: "1:1", value: 1 },
  { id: "4:3", value: 4 / 3 },
  { id: "3:4", value: 3 / 4 },
];

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

function createInitialCrop(
  width: number,
  height: number,
  aspect?: number,
): Crop {
  if (aspect) {
    return centerCrop(
      makeAspectCrop({ unit: "%", width: 100 }, aspect, width, height),
      width,
      height,
    );
  }
  // Free mode: select the full image so users can confirm without manual framing.
  return {
    unit: "%",
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  };
}

export default function ImagePrepareOverlay({
  imageSrc,
  isSubmitting = false,
  submitError = null,
  onCancel,
  onComplete,
}: ImagePrepareOverlayProps) {
  const t = useT();
  const imgRef = useRef<HTMLImageElement>(null);
  const [rotation, setRotation] = useState(0);
  const [flip, setFlip] = useState({ horizontal: false, vertical: false });
  const [displaySrc, setDisplaySrc] = useState(imageSrc);
  const [aspectPreset, setAspectPreset] = useState<AspectPreset>("free");
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isTransforming, setIsTransforming] = useState(false);

  const aspect = ASPECT_PRESETS.find((item) => item.id === aspectPreset)?.value;

  const resetAll = useCallback(() => {
    setRotation(0);
    setFlip({ horizontal: false, vertical: false });
    setDisplaySrc(imageSrc);
    setAspectPreset("free");
    setLocalError(null);
    setCompletedCrop(null);
    if (imgRef.current) {
      const { width, height } = imgRef.current;
      if (width && height) {
        const next = createInitialCrop(width, height);
        setCrop(next);
        setCompletedCrop(convertToPixelCrop(next, width, height));
      } else {
        setCrop(undefined);
      }
    } else {
      setCrop(undefined);
    }
  }, [imageSrc]);

  useEffect(() => {
    setRotation(0);
    setFlip({ horizontal: false, vertical: false });
    setDisplaySrc(imageSrc);
    setAspectPreset("free");
    setCrop(undefined);
    setCompletedCrop(null);
    setLocalError(null);
  }, [imageSrc]);

  useEffect(() => {
    const needsTransform =
      rotation !== 0 || flip.horizontal || flip.vertical;

    // Identity transform returns the same src; clearing crop here would leave
    // completedCrop null because <img onLoad> does not re-fire for unchanged src.
    if (!needsTransform) {
      let cancelled = false;
      setDisplaySrc(imageSrc);
      setIsTransforming(false);
      queueMicrotask(() => {
        if (cancelled) return;
        const image = imgRef.current;
        if (!image?.complete || !image.width || !image.height) return;
        const next = createInitialCrop(image.width, image.height, aspect);
        setCrop(next);
        setCompletedCrop(convertToPixelCrop(next, image.width, image.height));
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    setIsTransforming(true);
    void transformImageSrc(imageSrc, rotation, flip)
      .then((nextSrc) => {
        if (cancelled) return;
        setDisplaySrc(nextSrc);
        setCrop(undefined);
        setCompletedCrop(null);
      })
      .catch(() => {
        if (!cancelled) setLocalError(t.home.imagePrepare.transformFailed);
      })
      .finally(() => {
        if (!cancelled) setIsTransforming(false);
      });
    return () => {
      cancelled = true;
    };
  // Only re-ensure crop on src/orientation change; aspect is handled by onLoad / applyAspectPreset.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid resetting manual crops when aspect preset changes
  }, [imageSrc, rotation, flip]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const applyAspectPreset = (preset: AspectPreset) => {
    setAspectPreset(preset);
    const image = imgRef.current;
    if (!image || !image.width || !image.height) return;
    const nextAspect = ASPECT_PRESETS.find((item) => item.id === preset)?.value;
    const next = createInitialCrop(image.width, image.height, nextAspect);
    setCrop(next);
    setCompletedCrop(convertToPixelCrop(next, image.width, image.height));
  };

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = event.currentTarget;
    const next = createInitialCrop(width, height, aspect);
    setCrop(next);
    setCompletedCrop(convertToPixelCrop(next, width, height));
  };

  const handleComplete = async () => {
    const image = imgRef.current;
    if (!image || isSubmitting || isTransforming) return;
    const cropToUse =
      completedCrop && completedCrop.width >= 2 && completedCrop.height >= 2
        ? completedCrop
        : ({
            unit: "px",
            x: 0,
            y: 0,
            width: image.naturalWidth || image.width,
            height: image.naturalHeight || image.height,
          } satisfies PixelCrop);
    if (cropToUse.width < 2 || cropToUse.height < 2) {
      setLocalError(t.home.imagePrepare.cropTooSmall);
      return;
    }
    setLocalError(null);
    try {
      const cropped = await cropToImg(image, cropToUse);
      onComplete(cropped);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : t.home.imagePrepare.prepareFailed);
    }
  };

  const errorMessage = localError ?? submitError;
  const busy = isSubmitting || isTransforming;

  return (
    <div
      className="image-prepare-overlay fixed inset-0 z-[80] flex min-h-[100dvh] flex-col bg-[#141413] text-[#faf9f5]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-prepare-title"
    >
      <style>{`
        .image-prepare-overlay {
          --rc-drag-handle-size: 44px;
          --rc-drag-handle-mobile-size: 48px;
          --rc-drag-bar-size: 18px;
          --rc-border-color: #faf9f5;
          --rc-drag-handle-bg-colour: transparent;
          --rc-focus-color: #faf9f5;
          --prepare-handle: #faf9f5;
          --prepare-handle-stroke: #141413;
        }
        .image-prepare-overlay .ReactCrop {
          max-height: min(68dvh, 720px);
        }
        .image-prepare-overlay .ReactCrop__child-wrapper > img {
          max-height: min(68dvh, 720px);
          width: auto;
          margin: 0 auto;
        }
        .image-prepare-overlay .ReactCrop__crop-selection {
          outline: none;
          background-image: none;
          animation: none;
          box-shadow: 0 0 0 1px var(--prepare-handle), 0 0 0 9999px rgba(20, 20, 19, 0.62);
        }
        .image-prepare-overlay .ReactCrop__crop-selection:focus {
          outline: none;
          box-shadow: 0 0 0 1.5px var(--prepare-handle), 0 0 0 9999px rgba(20, 20, 19, 0.62);
        }
        /* Edge bars only extend hit area visually; events go to handles so corners stay XY */
        .image-prepare-overlay .ReactCrop__drag-bar {
          pointer-events: none;
          background: transparent;
        }
        .image-prepare-overlay .ReactCrop__drag-handle {
          z-index: 3;
          width: var(--rc-drag-handle-size);
          height: var(--rc-drag-handle-size);
          background: transparent;
          border: none;
          box-shadow: none;
          border-radius: 0;
        }
        .image-prepare-overlay .ReactCrop__drag-handle:focus {
          background: transparent;
          outline: none;
        }
        /* Corner: large XY hit target + L visual via pseudo */
        .image-prepare-overlay .ReactCrop__drag-handle.ord-nw,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-ne,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-se,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-sw {
          z-index: 5;
          width: 44px;
          height: 44px;
        }
        .image-prepare-overlay .ReactCrop__drag-handle.ord-nw::before,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-ne::before,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-se::before,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-sw::before {
          content: "";
          position: absolute;
          width: 18px;
          height: 18px;
          pointer-events: none;
          box-sizing: border-box;
          filter: drop-shadow(0 0 0.6px var(--prepare-handle-stroke));
        }
        .image-prepare-overlay .ReactCrop__drag-handle.ord-nw::before {
          top: 50%;
          left: 50%;
          border-top: 4px solid var(--prepare-handle);
          border-left: 4px solid var(--prepare-handle);
          border-top-left-radius: 3px;
        }
        .image-prepare-overlay .ReactCrop__drag-handle.ord-ne::before {
          top: 50%;
          right: 50%;
          border-top: 4px solid var(--prepare-handle);
          border-right: 4px solid var(--prepare-handle);
          border-top-right-radius: 3px;
        }
        .image-prepare-overlay .ReactCrop__drag-handle.ord-se::before {
          bottom: 50%;
          right: 50%;
          border-bottom: 4px solid var(--prepare-handle);
          border-right: 4px solid var(--prepare-handle);
          border-bottom-right-radius: 3px;
        }
        .image-prepare-overlay .ReactCrop__drag-handle.ord-sw::before {
          bottom: 50%;
          left: 50%;
          border-bottom: 4px solid var(--prepare-handle);
          border-left: 4px solid var(--prepare-handle);
          border-bottom-left-radius: 3px;
        }
        /* Edge midpoint pills — single-axis resize only */
        .image-prepare-overlay .ReactCrop__drag-handle.ord-n,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-s,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-e,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-w {
          z-index: 4;
        }
        .image-prepare-overlay .ReactCrop__drag-handle.ord-n,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-s {
          width: 40px;
          height: 28px;
        }
        .image-prepare-overlay .ReactCrop__drag-handle.ord-e,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-w {
          width: 28px;
          height: 40px;
        }
        .image-prepare-overlay .ReactCrop__drag-handle.ord-n::before,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-s::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 28px;
          height: 5px;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: var(--prepare-handle);
          box-shadow: 0 0 0 1px rgba(20, 20, 19, 0.55);
          pointer-events: none;
        }
        .image-prepare-overlay .ReactCrop__drag-handle.ord-e::before,
        .image-prepare-overlay .ReactCrop__drag-handle.ord-w::before {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 5px;
          height: 28px;
          transform: translate(-50%, -50%);
          border-radius: 999px;
          background: var(--prepare-handle);
          box-shadow: 0 0 0 1px rgba(20, 20, 19, 0.55);
          pointer-events: none;
        }
        @media (pointer: coarse) {
          .image-prepare-overlay .ReactCrop .ord-n,
          .image-prepare-overlay .ReactCrop .ord-e,
          .image-prepare-overlay .ReactCrop .ord-s,
          .image-prepare-overlay .ReactCrop .ord-w {
            display: block;
          }
        }
      `}</style>

      <header className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p
            id="image-prepare-title"
            className="truncate text-sm font-medium tracking-tight"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t.home.imagePrepare.title}
          </p>
          <p className="mt-0.5 text-[12px] text-[#faf9f5]/70">
            {t.home.imagePrepare.subtitle}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-[#faf9f5]/20 text-[#faf9f5] transition-[background-color,transform,opacity] duration-150 hover:bg-[#faf9f5]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#faf9f5]/50 active:translate-y-px disabled:opacity-50"
          style={{ transitionTimingFunction: EASE }}
          onClick={onCancel}
          disabled={busy}
          aria-label={t.home.imagePrepare.cancelAriaLabel}
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto px-3 py-2 sm:px-5">
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
          aspect={aspect}
          keepSelection
          ruleOfThirds
          disabled={busy}
          minWidth={24}
          minHeight={24}
          className="max-w-full"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={displaySrc}
            alt={t.home.imagePrepare.imageAlt}
            onLoad={handleImageLoad}
            draggable={false}
          />
        </ReactCrop>

        {isSubmitting ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[#141413]/82 px-6 text-center backdrop-blur-[2px]">
            <div
              className="h-9 w-9 animate-spin rounded-full border-2 border-[#faf9f5]/25 border-t-[#faf9f5]"
              aria-hidden="true"
            />
            <p className="text-sm font-medium tracking-tight">{t.home.imagePrepare.generating}</p>
            <p className="text-[12px] text-[#faf9f5]/55">{t.home.imagePrepare.generatingHint}</p>
          </div>
        ) : null}
      </div>

      <div className="border-t border-[#faf9f5]/12 bg-[#141413] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t.home.imagePrepare.aspectAriaLabel}>
          {ASPECT_PRESETS.map((preset) => {
            const selected = aspectPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={busy}
                onClick={() => applyAspectPreset(preset.id)}
                className={cn(
                  "h-8 rounded-lg border px-3 text-[12px] tracking-tight transition-[background-color,color,border-color,transform] duration-150 active:translate-y-px disabled:opacity-50",
                  selected
                    ? "border-[#faf9f5] bg-[#faf9f5] text-[#141413]"
                    : "border-[#faf9f5]/20 bg-transparent text-[#faf9f5]/85 hover:border-[#faf9f5]/45 hover:bg-[#faf9f5]/8",
                )}
                style={{ transitionTimingFunction: EASE }}
              >
                {preset.id === "free" ? t.home.imagePrepare.aspectFree : preset.id}
              </button>
            );
          })}
        </div>

        <div className="mb-1 flex items-start justify-center gap-5 sm:gap-8" role="toolbar" aria-label={t.home.imagePrepare.toolbarAriaLabel}>
          {(
            [
              {
                key: "rotate",
                label: t.home.imagePrepare.rotate,
                icon: RotateCw,
                active: false,
                primary: false,
                onClick: () => setRotation((value) => (value + 90) % 360),
              },
              {
                key: "flip-h",
                label: t.home.imagePrepare.flipHorizontal,
                icon: FlipHorizontal2,
                active: flip.horizontal,
                primary: false,
                onClick: () => setFlip((value) => ({ ...value, horizontal: !value.horizontal })),
              },
              {
                key: "flip-v",
                label: t.home.imagePrepare.flipVertical,
                icon: FlipVertical2,
                active: flip.vertical,
                primary: false,
                onClick: () => setFlip((value) => ({ ...value, vertical: !value.vertical })),
              },
              {
                key: "reset",
                label: t.home.imagePrepare.reset,
                icon: Undo2,
                active: false,
                primary: false,
                onClick: resetAll,
              },
              {
                key: "complete",
                label: t.home.imagePrepare.complete,
                icon: Check,
                active: false,
                primary: true,
                onClick: () => void handleComplete(),
              },
            ] as const
          ).map((action) => {
            const Icon = action.icon;
            const isComplete = action.key === "complete";
            return (
              <button
                key={action.key}
                type="button"
                disabled={busy}
                onClick={action.onClick}
                className={cn(
                  "flex w-12 flex-col items-center gap-1.5 rounded-lg bg-transparent p-0 text-[11px] tracking-tight transition-[color,opacity,transform] duration-150 active:translate-y-px disabled:opacity-50",
                  action.active || action.primary ? "text-[#faf9f5]" : "text-[#faf9f5]/80 hover:text-[#faf9f5]",
                  isComplete ? "font-medium" : "",
                )}
                style={{ transitionTimingFunction: EASE }}
              >
                <span
                  className={cn(
                    "inline-flex size-10 items-center justify-center rounded-full border transition-colors duration-150",
                    action.primary
                      ? "border-[#faf9f5] bg-[#faf9f5] text-[#141413] shadow-[rgba(0,0,0,0.01)_0px_2px_2px_0px,rgba(0,0,0,0.02)_0px_4px_4px_0px,rgba(0,0,0,0.04)_0px_16px_24px_0px]"
                      : action.active
                        ? "border-[#faf9f5] bg-[#faf9f5] text-[#141413]"
                        : "border-[#faf9f5]/25 bg-[#faf9f5]/8 text-[#faf9f5]",
                    isComplete ? "size-11" : "",
                  )}
                >
                  <Icon className={isComplete ? "h-5 w-5" : "h-4 w-4"} />
                </span>
                {action.label}
              </button>
            );
          })}
        </div>

        {errorMessage ? (
          <p className="mt-3 text-center text-[12px] text-[#f5b5a8]" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </div>
  );
}
