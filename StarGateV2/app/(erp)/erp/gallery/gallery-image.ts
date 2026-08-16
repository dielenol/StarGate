"use client";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SOURCE_MAX_BYTES = 20 * 1024 * 1024;
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 2400;
const MAX_SOURCE_PIXELS = 6 * 1024 * 1024;

export class GalleryImagePreparationError extends Error {}

export async function prepareGalleryImage(source: File): Promise<File> {
  if (!ACCEPTED_TYPES.has(source.type)) {
    throw new GalleryImagePreparationError("PNG, JPEG, WebP 이미지만 올릴 수 있습니다.");
  }
  if (source.size === 0 || source.size > SOURCE_MAX_BYTES) {
    throw new GalleryImagePreparationError("원본 이미지는 20MB 이하여야 합니다.");
  }

  const bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  try {
    if (bitmap.width * bitmap.height > MAX_SOURCE_PIXELS) {
      throw new GalleryImagePreparationError(
        "원본 이미지는 600만 픽셀 이하여야 합니다.",
      );
    }
    const baseScale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new GalleryImagePreparationError("이미지 변환을 시작할 수 없습니다.");

    for (const sizeFactor of [1, 0.85, 0.7, 0.55, 0.4]) {
      const scale = baseScale * sizeFactor;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = width;
      canvas.height = height;
      context.drawImage(bitmap, 0, 0, width, height);

      for (const quality of [0.9, 0.82, 0.72, 0.62]) {
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/webp", quality);
        });
        if (blob && blob.size <= UPLOAD_MAX_BYTES) {
          return new File([blob], `${source.name.replace(/\.[^.]+$/, "") || "fanart"}.webp`, {
            type: "image/webp",
            lastModified: Date.now(),
          });
        }
      }
    }
  } finally {
    bitmap.close();
  }

  throw new GalleryImagePreparationError(
    "최적화 후에도 4MB를 넘습니다. 더 작은 원본을 선택해 주세요.",
  );
}
