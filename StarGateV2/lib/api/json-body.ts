import { NextResponse } from "next/server";

export type JsonObjectBodyResult =
  | { value: Record<string, unknown> }
  | { error: NextResponse };

/** Parse JSON exactly once and reject malformed, null, array, and primitive bodies. */
export async function readJsonObjectBody(
  request: Request,
): Promise<JsonObjectBodyResult> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      error: NextResponse.json(
        { error: "잘못된 요청 본문" },
        { status: 400 },
      ),
    };
  }
  return { value: body as Record<string, unknown> };
}
