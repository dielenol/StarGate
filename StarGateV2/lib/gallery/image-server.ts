import "server-only";

import { createHash } from "node:crypto";

import sharp from "sharp";

import {
  detectGalleryImageType,
  GALLERY_ALLOWED_IMAGE_TYPES,
  GALLERY_IMAGE_MAX_EDGE,
  GALLERY_IMAGE_MAX_PIXELS,
  GALLERY_UPLOAD_IMAGE_MAX_BYTES,
} from "@/lib/gallery/input";

export class GalleryImageError extends Error {}

export interface NormalizedGalleryImage {
  bytes: Buffer;
  contentType: "image/webp";
  height: number;
  size: number;
  sha256: string;
  width: number;
  thumbnail: {
    bytes: Buffer;
    height: number;
    size: number;
    width: number;
  };
}

export async function normalizeGalleryImage(
  file: File,
): Promise<NormalizedGalleryImage> {
  if (
    !GALLERY_ALLOWED_IMAGE_TYPES.has(file.type) ||
    file.size < 1 ||
    file.size > GALLERY_UPLOAD_IMAGE_MAX_BYTES
  ) {
    throw new GalleryImageError(
      "PNG/JPEG/WebP 이미지(전처리 후 최대 4MB)만 업로드할 수 있습니다.",
    );
  }

  const source = Buffer.from(await file.arrayBuffer());
  if (detectGalleryImageType(source) !== file.type) {
    throw new GalleryImageError(
      "파일 내용과 MIME 형식이 일치하지 않습니다.",
    );
  }

  try {
    const { data, info } = await sharp(source, {
      animated: false,
      failOn: "warning",
      limitInputPixels: GALLERY_IMAGE_MAX_PIXELS,
    })
      .rotate()
      .resize({
        width: GALLERY_IMAGE_MAX_EDGE,
        height: GALLERY_IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ effort: 2, quality: 82 })
      .toBuffer({ resolveWithObject: true });

    if (
      info.format !== "webp" ||
      !Number.isSafeInteger(info.width) ||
      !Number.isSafeInteger(info.height) ||
      info.width < 1 ||
      info.height < 1 ||
      data.byteLength > GALLERY_UPLOAD_IMAGE_MAX_BYTES
    ) {
      throw new GalleryImageError(
        "이미지를 안전한 업로드 크기로 변환할 수 없습니다.",
      );
    }

    const thumbnail = await sharp(data, {
      animated: false,
      failOn: "warning",
      limitInputPixels: GALLERY_IMAGE_MAX_PIXELS,
    })
      .resize({
        width: 768,
        height: 768,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ effort: 1, quality: 75 })
      .toBuffer({ resolveWithObject: true });

    return {
      bytes: data,
      contentType: "image/webp",
      width: info.width,
      height: info.height,
      size: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
      thumbnail: {
        bytes: thumbnail.data,
        width: thumbnail.info.width,
        height: thumbnail.info.height,
        size: thumbnail.data.byteLength,
      },
    };
  } catch (error) {
    if (error instanceof GalleryImageError) throw error;
    throw new GalleryImageError(
      "손상되었거나 지원하지 않는 이미지 파일입니다.",
    );
  }
}
