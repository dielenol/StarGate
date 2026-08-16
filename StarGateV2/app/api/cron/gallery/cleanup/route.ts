import { NextResponse } from "next/server";

import { retryGalleryBlobCleanup } from "@/lib/gallery/blob-cleanup";
import { getGalleryBlobToken } from "@/lib/gallery/blob-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = getGalleryBlobToken();
  if (!token) {
    return NextResponse.json(
      { error: "Gallery Blob storage is not configured" },
      { status: 503 },
    );
  }

  try {
    await retryGalleryBlobCleanup(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[gallery] scheduled Blob cleanup failed", error);
    return NextResponse.json(
      { error: "Gallery Blob cleanup failed" },
      { status: 500 },
    );
  }
}
