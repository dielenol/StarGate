import { NextResponse } from "next/server";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasGalleryApiAccess } from "@/lib/gallery/access";
import { getGalleryFeedResponse } from "@/lib/gallery/service";

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
};

export async function GET(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", code: "UNAUTHORIZED" },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const pageAccess =
    session.user.isGuest ||
    (await hasGalleryApiAccess(session.user, request));
  if (!pageAccess) {
    return NextResponse.json(
      {
        error: "현재 운영 잠금 상태인 갤러리입니다.",
        code: "GALLERY_PAGE_LOCKED",
      },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const feed = await getGalleryFeedResponse(session.user, {
      accessGranted: true,
    });
    return NextResponse.json(feed, { headers: PRIVATE_NO_STORE_HEADERS });
  } catch (error) {
    console.error("[gallery] failed to load feed", error);
    return NextResponse.json(
      { error: "갤러리를 불러오지 못했습니다.", code: "GALLERY_LOAD_FAILED" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
