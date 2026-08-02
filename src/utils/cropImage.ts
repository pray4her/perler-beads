function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });
}

function getRadianAngle(degreeValue: number): number {
  return (degreeValue * Math.PI) / 180;
}

function rotateSize(width: number, height: number, rotation: number) {
  const rotRad = getRadianAngle(rotation);
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

/** Bake rotation (90° steps) and flips into a PNG data URL for cropper preview. */
export async function transformImageSrc(
  imageSrc: string,
  rotation = 0,
  flip = { horizontal: false, vertical: false },
): Promise<string> {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  if (normalizedRotation === 0 && !flip.horizontal && !flip.vertical) {
    return imageSrc;
  }

  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建画布上下文");
  }

  const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
    image.width,
    image.height,
    normalizedRotation,
  );
  canvas.width = Math.max(1, Math.round(bBoxWidth));
  canvas.height = Math.max(1, Math.round(bBoxHeight));

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(getRadianAngle(normalizedRotation));
  ctx.scale(flip.horizontal ? -1 : 1, flip.vertical ? -1 : 1);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  return canvas.toDataURL("image/png");
}

/** @deprecated Prefer transformImageSrc for combined transforms. */
export async function flipImageSrc(
  imageSrc: string,
  flip: { horizontal: boolean; vertical: boolean },
): Promise<string> {
  return transformImageSrc(imageSrc, 0, flip);
}
