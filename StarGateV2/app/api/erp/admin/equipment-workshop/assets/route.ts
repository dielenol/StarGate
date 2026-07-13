import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { isValidIdempotencyKey } from "@/lib/api/idempotency";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function detectImageType(bytes: Uint8Array): string | null {
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
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

export async function POST(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!hasRole(session.user.role, "GM")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "Blob 저장소가 설정되지 않아 URL 직접 입력만 사용할 수 있습니다.", code: "BLOB_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const requestId = formData.get("requestId");
  if (!(file instanceof File) || typeof requestId !== "string" || !isValidIdempotencyKey(requestId)) {
    return NextResponse.json({ error: "업로드 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "PNG/JPEG/WebP 이미지(최대 5MB)만 업로드할 수 있습니다." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detectedType = detectImageType(bytes);
  if (detectedType !== file.type) {
    return NextResponse.json({ error: "파일 내용과 MIME 형식이 일치하지 않습니다." }, { status: 400 });
  }

  const extension = detectedType === "image/png" ? "png" : detectedType === "image/jpeg" ? "jpg" : "webp";
  const safeRequestId = requestId.replace(/[^A-Za-z0-9_-]/g, "-");
  const blob = await put(`equipment-workshop/${safeRequestId}/result.${extension}`, file, {
    access: "public",
    addRandomSuffix: true,
    contentType: detectedType,
    token,
  });
  return NextResponse.json({ url: blob.url });
}
