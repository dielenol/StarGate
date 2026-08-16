import { get } from "@vercel/blob";

import { isValidIdempotencyKey } from "@/lib/api/idempotency";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import {
  findGalleryFanartById,
  hasVisibleGallerySessionReportBySessionId,
} from "@/lib/db/gallery";
import { hasGalleryApiAccess } from "@/lib/gallery/access";
import { getGalleryBlobToken } from "@/lib/gallery/blob-config";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: PRIVATE_NO_STORE_HEADERS,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getActiveSession();
  if (!session?.user || session.user.isGuest) return notFound();
  if (!(await hasGalleryApiAccess(session.user, request))) return notFound();

  const { id } = await params;
  if (!isValidIdempotencyKey(id)) return notFound();

  try {
    const fanart = await findGalleryFanartById(id);
    if (!fanart || fanart.status === "DELETED") return notFound();

    const canModerate = hasRole(session.user.role, "V");
    if (
      fanart.status === "HIDDEN" &&
      fanart.authorId !== session.user.id &&
      !canModerate
    ) {
      return notFound();
    }
    if (
      fanart.sessionId &&
      !(await hasVisibleGallerySessionReportBySessionId(
        fanart.sessionId,
        session.user.role,
      )) &&
      fanart.authorId !== session.user.id &&
      session.user.role !== "GM"
    ) {
      return notFound();
    }

    const variant = new URL(request.url).searchParams.get("variant") ?? "original";
    if (variant !== "original" && variant !== "thumbnail") return notFound();
    const image =
      variant === "thumbnail" && fanart.image.thumbnail
        ? fanart.image.thumbnail
        : fanart.image;

    const token = getGalleryBlobToken();
    if (!token) {
      return new Response("Gallery storage is not configured", {
        status: 503,
        headers: PRIVATE_NO_STORE_HEADERS,
      });
    }

    const blob = await get(image.pathname, {
      access: "private",
      token,
    });
    if (!blob || blob.statusCode !== 200) return notFound();

    return new Response(blob.stream, {
      headers: {
        ...PRIVATE_NO_STORE_HEADERS,
        "Content-Disposition": "inline",
        "Content-Length": String(blob.blob.size),
        "Content-Type": "image/webp",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[gallery] private image delivery failed", error);
    return new Response("Image delivery failed", {
      status: 500,
      headers: PRIVATE_NO_STORE_HEADERS,
    });
  }
}
