import { createHash, randomUUID } from "node:crypto";

import { put } from "@vercel/blob";
import { after, NextResponse } from "next/server";

import { readIdempotencyKey } from "@/lib/api/idempotency";
import { getActiveSession } from "@/lib/auth/active-session";
import { GUEST_READ_ONLY_ERROR_CODE } from "@/lib/auth/guest";
import {
  assertGalleryDailyUploadCapacity,
  acquireGalleryUploadLease,
  createGalleryFanartWithDailyLimit,
  findGalleryFanartById,
  hasVisibleGallerySessionReportBySessionId,
  GalleryDailyUploadLimitError,
  GalleryFanartIdConflictError,
  GalleryLinkedSessionNotVisibleError,
  GalleryUploadBusyError,
  markGalleryBlobUploadIntentComplete,
  recordGalleryBlobUploadIntent,
  releaseGalleryUploadLease,
  type GalleryFanartDocument,
} from "@/lib/db/gallery";
import { hasGalleryApiAccess } from "@/lib/gallery/access";
import {
  compensateGalleryBlobUploads,
  retryGalleryBlobCleanup,
} from "@/lib/gallery/blob-cleanup";
import { getGalleryBlobToken } from "@/lib/gallery/blob-config";
import {
  GalleryImageError,
  normalizeGalleryImage,
} from "@/lib/gallery/image-server";
import {
  GalleryInputError,
  parseGalleryFanartMetadata,
} from "@/lib/gallery/input";
import { galleryFanartRequestFingerprint } from "@/lib/gallery/request-fingerprint";
import { persistUploadedGalleryFanart } from "@/lib/gallery/create-orchestration";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};
const MAX_METADATA_JSON_BYTES = 8 * 1024;
const MAX_MULTIPART_REQUEST_BYTES = 4 * 1024 * 1024 + 128 * 1024;

function jsonError(error: string, code: string, status: number) {
  return NextResponse.json(
    { error, code },
    { status, headers: PRIVATE_NO_STORE_HEADERS },
  );
}

function scheduleBlobCleanup(token: string): void {
  after(async () => {
    try {
      await retryGalleryBlobCleanup(token);
    } catch (error) {
      console.error("[gallery] Blob cleanup batch failed", error);
    }
  });
}

async function parseUploadForm(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    throw new GalleryInputError("업로드 요청 형식이 올바르지 않습니다.");
  }

  const file = formData.get("file");
  const metadataJson = formData.get("metadata");
  if (
    !(file instanceof File) ||
    typeof metadataJson !== "string" ||
    Buffer.byteLength(metadataJson, "utf8") > MAX_METADATA_JSON_BYTES
  ) {
    throw new GalleryInputError("업로드 요청 형식이 올바르지 않습니다.");
  }

  let rawMetadata: unknown;
  try {
    rawMetadata = JSON.parse(metadataJson);
  } catch {
    throw new GalleryInputError("팬아트 정보 JSON이 올바르지 않습니다.");
  }

  return {
    file,
    metadata: parseGalleryFanartMetadata(rawMetadata),
  };
}

export async function POST(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) {
    return jsonError("Unauthorized", "UNAUTHORIZED", 401);
  }
  if (session.user.isGuest) {
    return jsonError(
      "게스트 미리보기에서는 팬아트를 등록할 수 없습니다.",
      GUEST_READ_ONLY_ERROR_CODE,
      403,
    );
  }
  if (!(await hasGalleryApiAccess(session.user, request))) {
    return jsonError(
      "현재 운영 잠금 상태인 갤러리입니다.",
      "GALLERY_PAGE_LOCKED",
      403,
    );
  }

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return jsonError(
      "유효한 Idempotency-Key 헤더가 필요합니다.",
      "INVALID_IDEMPOTENCY_KEY",
      400,
    );
  }

  const rawContentLength = request.headers.get("content-length");
  const contentLength = rawContentLength ? Number(rawContentLength) : NaN;
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    return jsonError(
      "Content-Length가 있는 업로드 요청이 필요합니다.",
      "GALLERY_CONTENT_LENGTH_REQUIRED",
      411,
    );
  }
  if (contentLength > MAX_MULTIPART_REQUEST_BYTES) {
    return jsonError(
      "업로드 요청은 4MB 이미지와 메타데이터 범위를 넘을 수 없습니다.",
      "GALLERY_UPLOAD_TOO_LARGE",
      413,
    );
  }

  const existing = await findGalleryFanartById(requestId);
  if (existing && existing.authorId !== session.user.id) {
    return jsonError(
      "동일 Idempotency-Key가 다른 업로드 요청에 사용되었습니다.",
      "DUPLICATE_REQUEST",
      409,
    );
  }
  if (existing?.status === "DELETED") {
    return jsonError(
      "이미 삭제된 업로드 요청입니다. 새 요청으로 다시 등록해 주세요.",
      "GALLERY_UPLOAD_DELETED",
      409,
    );
  }

  const token = getGalleryBlobToken();
  if (!token && !existing) {
    return jsonError(
      "Blob 저장소가 설정되지 않아 팬아트를 등록할 수 없습니다.",
      "BLOB_NOT_CONFIGURED",
      503,
    );
  }

  let uploadLeaseOwnerToken: string | null = null;
  try {
    if (!existing) {
      await assertGalleryDailyUploadCapacity({
        userId: session.user.id,
        now: new Date(),
      });
    }
    const leaseOwnerToken = randomUUID();
    await acquireGalleryUploadLease({
      userId: session.user.id,
      requestId,
      ownerToken: leaseOwnerToken,
      now: new Date(),
    });
    uploadLeaseOwnerToken = leaseOwnerToken;

    const { file, metadata } = await parseUploadForm(request);
    const normalizedImage = await normalizeGalleryImage(file);
    const requestFingerprint = galleryFanartRequestFingerprint({
      imageSha256: normalizedImage.sha256,
      metadata,
    });

    if (metadata.sessionId) {
      if (
        !(await hasVisibleGallerySessionReportBySessionId(
          metadata.sessionId,
          session.user.role,
        ))
      ) {
        return jsonError(
          "연결할 수 있는 세션 보고서를 찾지 못했습니다.",
          "GALLERY_SESSION_NOT_VISIBLE",
          404,
        );
      }
    }

    if (existing) {
      if (existing.requestFingerprint !== requestFingerprint) {
        return jsonError(
          "동일 Idempotency-Key가 다른 업로드 요청에 사용되었습니다.",
          "DUPLICATE_REQUEST",
          409,
        );
      }
      return NextResponse.json(
        { success: true, id: existing._id, replayed: true },
        { headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    if (!token) {
      return jsonError(
        "Blob 저장소가 설정되지 않아 팬아트를 등록할 수 없습니다.",
        "BLOB_NOT_CONFIGURED",
        503,
      );
    }

    scheduleBlobCleanup(token);
    const userPath = createHash("sha256")
      .update(session.user.id)
      .digest("hex")
      .slice(0, 24);
    const safeRequestId = requestId.replace(/[^A-Za-z0-9_-]/gu, "-");
    const uploadId = randomUUID();
    const originalPathname =
      `gallery/fanart/${userPath}/${safeRequestId}-${uploadId}.webp`;
    const thumbnailPathname =
      `gallery/fanart/${userPath}/${safeRequestId}-${uploadId}-thumb.webp`;

    const intentCreatedAt = new Date();
    await Promise.all([
      recordGalleryBlobUploadIntent({
        pathname: originalPathname,
        now: intentCreatedAt,
      }),
      recordGalleryBlobUploadIntent({
        pathname: thumbnailPathname,
        now: intentCreatedAt,
      }),
    ]);

    const uploadedBlobs: Awaited<ReturnType<typeof put>>[] = [];
    let blob: Awaited<ReturnType<typeof put>>;
    let thumbnailBlob: Awaited<ReturnType<typeof put>>;
    try {
      blob = await put(
        originalPathname,
        normalizedImage.bytes,
        {
          access: "private",
          addRandomSuffix: false,
          contentType: normalizedImage.contentType,
          token,
        },
      );
      uploadedBlobs.push(blob);
      thumbnailBlob = await put(
        thumbnailPathname,
        normalizedImage.thumbnail.bytes,
        {
          access: "private",
          addRandomSuffix: false,
          contentType: normalizedImage.contentType,
          token,
        },
      );
      uploadedBlobs.push(thumbnailBlob);
    } catch (error) {
      console.error("[gallery] Blob upload failed", error);
      await compensateGalleryBlobUploads(uploadedBlobs, token);
      return jsonError(
        "이미지 저장소에 업로드하지 못했습니다.",
        "GALLERY_BLOB_UPLOAD_FAILED",
        502,
      );
    }

    const now = new Date();
    const document: GalleryFanartDocument = {
      _id: requestId,
      title: metadata.title,
      description: metadata.description,
      artistName: metadata.artistName,
      altText: metadata.altText,
      tags: metadata.tags,
      ...(metadata.sessionId ? { sessionId: metadata.sessionId } : {}),
      image: {
        pathname: blob.pathname,
        sha256: normalizedImage.sha256,
        width: normalizedImage.width,
        height: normalizedImage.height,
        bytes: normalizedImage.size,
        contentType: normalizedImage.contentType,
        thumbnail: {
          pathname: thumbnailBlob.pathname,
          width: normalizedImage.thumbnail.width,
          height: normalizedImage.thumbnail.height,
          bytes: normalizedImage.thumbnail.size,
          contentType: normalizedImage.contentType,
        },
      },
      requestFingerprint,
      authorId: session.user.id,
      authorName: session.user.displayName,
      authorRole: session.user.role,
      status: "PUBLISHED",
      rightsConfirmedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    let created;
    try {
      created = await persistUploadedGalleryFanart({
        persist: () => createGalleryFanartWithDailyLimit(document),
        compensate: () => compensateGalleryBlobUploads(uploadedBlobs, token),
      });
    } catch (error) {
      if (error instanceof GalleryDailyUploadLimitError) {
        return jsonError(error.message, "GALLERY_DAILY_UPLOAD_LIMIT", 429);
      }
      if (error instanceof GalleryFanartIdConflictError) {
        return jsonError(
          "동일 Idempotency-Key가 다른 업로드 요청에 사용되었습니다.",
          "DUPLICATE_REQUEST",
          409,
        );
      }
      if (error instanceof GalleryLinkedSessionNotVisibleError) {
        return jsonError(
          error.message,
          "GALLERY_SESSION_NOT_VISIBLE",
          404,
        );
      }
      throw error;
    }
    if (created.document.status === "DELETED") {
      return jsonError(
        "이미 삭제된 업로드 요청입니다. 새 요청으로 다시 등록해 주세요.",
        "GALLERY_UPLOAD_DELETED",
        409,
      );
    }
    if (created.created) {
      try {
        await Promise.all(
          uploadedBlobs.map((uploaded) =>
            markGalleryBlobUploadIntentComplete(uploaded.pathname),
          ),
        );
      } catch (error) {
        console.error("[gallery] failed to finalize Blob upload intents", error);
      }
    }

    return NextResponse.json(
      {
        success: true,
        id: created.document._id,
        replayed: !created.created,
      },
      {
        status: created.created ? 201 : 200,
        headers: PRIVATE_NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    if (error instanceof GalleryDailyUploadLimitError) {
      return jsonError(error.message, "GALLERY_DAILY_UPLOAD_LIMIT", 429);
    }
    if (error instanceof GalleryLinkedSessionNotVisibleError) {
      return jsonError(error.message, "GALLERY_SESSION_NOT_VISIBLE", 404);
    }
    if (error instanceof GalleryUploadBusyError) {
      return jsonError(error.message, "GALLERY_UPLOAD_IN_PROGRESS", 429);
    }
    if (error instanceof GalleryInputError || error instanceof GalleryImageError) {
      return jsonError(error.message, "INVALID_GALLERY_UPLOAD", 400);
    }
    console.error("[gallery] fanart creation failed", error);
    return jsonError(
      "팬아트를 등록하지 못했습니다.",
      "GALLERY_CREATE_FAILED",
      500,
    );
  } finally {
    if (uploadLeaseOwnerToken) {
      try {
        await releaseGalleryUploadLease({
          userId: session.user.id,
          requestId,
          ownerToken: uploadLeaseOwnerToken,
        });
      } catch (error) {
        console.error("[gallery] failed to release upload lease", error);
      }
    }
  }
}
