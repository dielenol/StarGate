import { after, NextResponse } from "next/server";

import {
  isExpectedUpdatedAtCurrent,
  parseExpectedUpdatedAt,
} from "@/lib/api/expected-updated-at";
import { isValidIdempotencyKey } from "@/lib/api/idempotency";
import { readJsonObjectBody } from "@/lib/api/json-body";
import { getActiveSession } from "@/lib/auth/active-session";
import { GUEST_READ_ONLY_ERROR_CODE } from "@/lib/auth/guest";
import { hasRole } from "@/lib/auth/rbac";
import {
  findGalleryFanartById,
  hasVisibleGallerySessionReportBySessionId,
  GalleryLinkedSessionNotVisibleError,
  moderateGalleryFanart,
  softDeleteGalleryFanart,
  updateGalleryFanartMetadata,
} from "@/lib/db/gallery";
import { hasGalleryApiAccess } from "@/lib/gallery/access";
import {
  deleteGalleryDocumentBlobs,
  retryGalleryBlobCleanup,
} from "@/lib/gallery/blob-cleanup";
import { getGalleryBlobToken } from "@/lib/gallery/blob-config";
import {
  GalleryInputError,
  parseGalleryFanartMetadataUpdate,
  parseGalleryFanartModeration,
} from "@/lib/gallery/input";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

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

async function hasVisibleLinkedSession(
  sessionId: string | undefined,
  role: NonNullable<Awaited<ReturnType<typeof getActiveSession>>>["user"]["role"],
): Promise<boolean> {
  if (!sessionId) return true;
  return Boolean(
    await hasVisibleGallerySessionReportBySessionId(sessionId, role),
  );
}

async function authorizeMutation(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) {
    return { error: jsonError("Unauthorized", "UNAUTHORIZED", 401) } as const;
  }
  if (session.user.isGuest) {
    return {
      error: jsonError(
        "게스트 미리보기에서는 팬아트를 변경할 수 없습니다.",
        GUEST_READ_ONLY_ERROR_CODE,
        403,
      ),
    } as const;
  }
  if (!(await hasGalleryApiAccess(session.user, request))) {
    return {
      error: jsonError(
        "현재 운영 잠금 상태인 갤러리입니다.",
        "GALLERY_PAGE_LOCKED",
        403,
      ),
    } as const;
  }
  return { session } as const;
}

function staleVersionResponse() {
  return jsonError(
    "다른 사용자가 팬아트를 변경했습니다. 최신본을 불러온 뒤 다시 시도하세요.",
    "STALE_VERSION",
    409,
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeMutation(request);
  if ("error" in authorization) return authorization.error;
  const { session } = authorization;

  const { id } = await params;
  if (!isValidIdempotencyKey(id)) {
    return jsonError("잘못된 팬아트 ID 형식입니다.", "INVALID_GALLERY_ID", 400);
  }

  const parsedBody = await readJsonObjectBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const body = parsedBody.value;
  const expectedUpdatedAt = parseExpectedUpdatedAt(body);
  if (!expectedUpdatedAt.ok || expectedUpdatedAt.value === null) {
    return jsonError(
      expectedUpdatedAt.ok
        ? "expectedUpdatedAt 날짜가 필요합니다."
        : expectedUpdatedAt.error,
      "INVALID_EXPECTED_UPDATED_AT",
      400,
    );
  }

  try {
    const before = await findGalleryFanartById(id);
    if (!before || before.status === "DELETED") {
      return jsonError(
        "팬아트를 찾을 수 없습니다.",
        "GALLERY_FANART_NOT_FOUND",
        404,
      );
    }
    const linkedSessionVisible = await hasVisibleLinkedSession(
      before.sessionId,
      session.user.role,
    );
    if (!isExpectedUpdatedAtCurrent(before.updatedAt, expectedUpdatedAt.value)) {
      return staleVersionResponse();
    }

    if (body.kind === "metadata") {
      if (before.authorId !== session.user.id) {
        return jsonError("Forbidden", "FORBIDDEN", 403);
      }
      const metadata = parseGalleryFanartMetadataUpdate(body);
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

      const updated = await updateGalleryFanartMetadata({
        id,
        expectedUpdatedAt: expectedUpdatedAt.value,
        metadata,
        previousSessionId: before.sessionId,
        viewerRole: session.user.role,
        now: new Date(),
      });
      if (!updated) {
        const latest = await findGalleryFanartById(id);
        if (
          latest &&
          !isExpectedUpdatedAtCurrent(
            latest.updatedAt,
            expectedUpdatedAt.value,
          )
        ) {
          return staleVersionResponse();
        }
        return jsonError(
          "팬아트를 찾을 수 없습니다.",
          "GALLERY_FANART_NOT_FOUND",
          404,
        );
      }
      return NextResponse.json(
        { success: true, id, updatedAt: updated.updatedAt.toISOString() },
        { headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    if (body.kind === "moderation") {
      if (!hasRole(session.user.role, "V")) {
        return jsonError("Forbidden", "FORBIDDEN", 403);
      }
      if (!linkedSessionVisible && session.user.role !== "GM") {
        return jsonError(
          "팬아트를 찾을 수 없습니다.",
          "GALLERY_FANART_NOT_FOUND",
          404,
        );
      }
      const moderation = parseGalleryFanartModeration(body);
      const updated = await moderateGalleryFanart({
        id,
        expectedUpdatedAt: expectedUpdatedAt.value,
        status: moderation.status,
        reason: moderation.reason,
        actorId: session.user.id,
        actorName: session.user.displayName,
        now: new Date(),
      });
      if (!updated) {
        const latest = await findGalleryFanartById(id);
        if (
          latest &&
          !isExpectedUpdatedAtCurrent(
            latest.updatedAt,
            expectedUpdatedAt.value,
          )
        ) {
          return staleVersionResponse();
        }
        return jsonError(
          "팬아트를 찾을 수 없습니다.",
          "GALLERY_FANART_NOT_FOUND",
          404,
        );
      }
      return NextResponse.json(
        { success: true, id, updatedAt: updated.updatedAt.toISOString() },
        { headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    return jsonError(
      "지원하지 않는 팬아트 변경 요청입니다.",
      "INVALID_GALLERY_MUTATION",
      400,
    );
  } catch (error) {
    if (error instanceof GalleryLinkedSessionNotVisibleError) {
      return jsonError(error.message, "GALLERY_SESSION_NOT_VISIBLE", 404);
    }
    if (error instanceof GalleryInputError) {
      return jsonError(error.message, "INVALID_GALLERY_INPUT", 400);
    }
    console.error("[gallery] fanart update failed", error);
    return jsonError(
      "팬아트를 변경하지 못했습니다.",
      "GALLERY_UPDATE_FAILED",
      500,
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authorization = await authorizeMutation(request);
  if ("error" in authorization) return authorization.error;
  const { session } = authorization;

  const { id } = await params;
  if (!isValidIdempotencyKey(id)) {
    return jsonError("잘못된 팬아트 ID 형식입니다.", "INVALID_GALLERY_ID", 400);
  }

  const parsedBody = await readJsonObjectBody(request);
  if ("error" in parsedBody) return parsedBody.error;
  const expectedUpdatedAt = parseExpectedUpdatedAt(parsedBody.value);
  if (!expectedUpdatedAt.ok || expectedUpdatedAt.value === null) {
    return jsonError(
      expectedUpdatedAt.ok
        ? "expectedUpdatedAt 날짜가 필요합니다."
        : expectedUpdatedAt.error,
      "INVALID_EXPECTED_UPDATED_AT",
      400,
    );
  }

  try {
    const before = await findGalleryFanartById(id);
    if (!before || before.status === "DELETED") {
      return jsonError(
        "팬아트를 찾을 수 없습니다.",
        "GALLERY_FANART_NOT_FOUND",
        404,
      );
    }
    const linkedSessionVisible = await hasVisibleLinkedSession(
      before.sessionId,
      session.user.role,
    );
    if (
      !linkedSessionVisible &&
      before.authorId !== session.user.id &&
      session.user.role !== "GM"
    ) {
      return jsonError(
        "팬아트를 찾을 수 없습니다.",
        "GALLERY_FANART_NOT_FOUND",
        404,
      );
    }
    if (
      before.authorId !== session.user.id &&
      !hasRole(session.user.role, "V")
    ) {
      return jsonError("Forbidden", "FORBIDDEN", 403);
    }
    if (!isExpectedUpdatedAtCurrent(before.updatedAt, expectedUpdatedAt.value)) {
      return staleVersionResponse();
    }

    const deleted = await softDeleteGalleryFanart({
      id,
      expectedUpdatedAt: expectedUpdatedAt.value,
      actorId: session.user.id,
      linkedSessionId: before.sessionId,
      now: new Date(),
    });
    if (!deleted) {
      const latest = await findGalleryFanartById(id);
      if (
        latest &&
        !isExpectedUpdatedAtCurrent(
          latest.updatedAt,
          expectedUpdatedAt.value,
        )
      ) {
        return staleVersionResponse();
      }
      return jsonError(
        "팬아트를 찾을 수 없습니다.",
        "GALLERY_FANART_NOT_FOUND",
        404,
      );
    }

    const token = getGalleryBlobToken();
    if (!token) {
      return NextResponse.json(
        { success: true, blobCleanupPending: true },
        { status: 202, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    scheduleBlobCleanup(token);
    const blobDeleted = await deleteGalleryDocumentBlobs(
      {
        id: deleted._id,
        pathnames: [
          deleted.image.pathname,
          ...(deleted.image.thumbnail
            ? [deleted.image.thumbnail.pathname]
            : []),
        ],
      },
      token,
    );
    return NextResponse.json(
      { success: true, blobCleanupPending: !blobDeleted },
      {
        status: blobDeleted ? 200 : 202,
        headers: PRIVATE_NO_STORE_HEADERS,
      },
    );
  } catch (error) {
    console.error("[gallery] fanart deletion failed", error);
    return jsonError(
      "팬아트를 삭제하지 못했습니다.",
      "GALLERY_DELETE_FAILED",
      500,
    );
  }
}
