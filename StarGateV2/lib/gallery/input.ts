import type {
  GalleryFanartMetadataInput,
  GalleryFanartMetadataUpdateInput,
  GalleryFanartModerationInput,
} from "@/types/gallery";

export const GALLERY_SOURCE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const GALLERY_UPLOAD_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const GALLERY_IMAGE_MAX_EDGE = 2_400;
export const GALLERY_IMAGE_MAX_PIXELS = 6_000_000;
export const GALLERY_DAILY_UPLOAD_LIMIT = 10;

export const GALLERY_ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export class GalleryInputError extends Error {}

function readString(
  value: unknown,
  field: string,
  options: { min?: number; max: number },
): string {
  if (typeof value !== "string") {
    throw new GalleryInputError(`${field} 형식이 올바르지 않습니다.`);
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  if ((options.min ?? 0) > normalized.length || normalized.length > options.max) {
    throw new GalleryInputError(
      `${field}은(는) ${options.min ?? 0}~${options.max}자로 입력해 주세요.`,
    );
  }
  return normalized;
}

function readTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 8) {
    throw new GalleryInputError("태그는 최대 8개까지 입력할 수 있습니다.");
  }
  const tags = value.map((entry) => readString(entry, "태그", { min: 1, max: 20 }));
  const unique = [...new Set(tags.map((tag) => tag.toLocaleLowerCase("ko-KR")))];
  if (unique.length !== tags.length) {
    throw new GalleryInputError("같은 태그를 중복해서 입력할 수 없습니다.");
  }
  return tags;
}

function readSessionId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return readString(value, "관련 세션", { min: 1, max: 160 });
}

function readBaseMetadata(value: unknown): GalleryFanartMetadataInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GalleryInputError("팬아트 정보 형식이 올바르지 않습니다.");
  }
  const record = value as Record<string, unknown>;
  if (record.rightsConfirmed !== true) {
    throw new GalleryInputError("게시 권한 확인이 필요합니다.");
  }

  return {
    title: readString(record.title, "제목", { min: 1, max: 80 }),
    description: readString(record.description ?? "", "설명", { max: 500 }),
    artistName: readString(record.artistName, "작가명", { min: 1, max: 40 }),
    altText: readString(record.altText ?? "", "이미지 설명", { max: 160 }),
    tags: readTags(record.tags ?? []),
    sessionId: readSessionId(record.sessionId),
    rightsConfirmed: true,
  };
}

export function parseGalleryFanartMetadata(
  value: unknown,
): GalleryFanartMetadataInput {
  return readBaseMetadata(value);
}

export function parseGalleryFanartMetadataUpdate(
  value: unknown,
): GalleryFanartMetadataUpdateInput {
  const metadata = readBaseMetadata(value);
  const record = value as Record<string, unknown>;
  return {
    ...metadata,
    expectedUpdatedAt: readString(record.expectedUpdatedAt, "수정 기준 시각", {
      min: 1,
      max: 64,
    }),
  };
}

export function parseGalleryFanartModeration(
  value: unknown,
): GalleryFanartModerationInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GalleryInputError("운영 처리 형식이 올바르지 않습니다.");
  }
  const record = value as Record<string, unknown>;
  if (record.status !== "PUBLISHED" && record.status !== "HIDDEN") {
    throw new GalleryInputError("지원하지 않는 공개 상태입니다.");
  }
  const reason = readString(record.reason ?? "", "처리 사유", { max: 160 });
  if (record.status === "HIDDEN" && reason.length === 0) {
    throw new GalleryInputError("숨김 처리 사유를 입력해 주세요.");
  }
  return {
    status: record.status,
    reason,
    expectedUpdatedAt: readString(record.expectedUpdatedAt, "수정 기준 시각", {
      min: 1,
      max: 64,
    }),
  };
}

export function detectGalleryImageType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}
