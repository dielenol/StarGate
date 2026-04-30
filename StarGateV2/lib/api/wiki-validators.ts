/**
 * 위키 API 입력 가드 (POST /api/erp/wiki, PATCH /api/erp/wiki/[id]).
 *
 * 화이트리스트 + 타입/길이 검증을 한 곳에 두어 두 라우트 핸들러가 공유한다.
 * 위반 시 NextResponse 400 반환 (호출자는 그대로 return).
 */

import { NextResponse } from "next/server";

const ALLOWED_WIKI_FIELDS = new Set([
  "title",
  "content",
  "category",
  "tags",
  "isPublic",
] as const);

export const TITLE_MAX = 200;
export const CONTENT_MAX = 200_000;
export const CATEGORY_MAX = 80;
export const TAG_MAX = 40;
export const TAGS_MAX_COUNT = 50;

export type SanitizedWikiBody = {
  title?: string;
  content?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
};

export type SanitizeResult =
  | { error: NextResponse }
  | { value: SanitizedWikiBody };

export function sanitizeWikiBody(body: unknown): SanitizeResult {
  if (!body || typeof body !== "object") {
    return {
      error: NextResponse.json({ error: "잘못된 요청 본문" }, { status: 400 }),
    };
  }

  const value: SanitizedWikiBody = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALLOWED_WIKI_FIELDS.has(k as never)) continue;

    if (k === "title") {
      if (typeof v !== "string" || v.length > TITLE_MAX) {
        return badRequest("title 형식 오류");
      }
      value.title = v;
    } else if (k === "content") {
      if (typeof v !== "string" || v.length > CONTENT_MAX) {
        return badRequest("content 형식 오류");
      }
      value.content = v;
    } else if (k === "category") {
      if (typeof v !== "string" || v.length > CATEGORY_MAX) {
        return badRequest("category 형식 오류");
      }
      value.category = v;
    } else if (k === "tags") {
      if (
        !Array.isArray(v) ||
        v.length > TAGS_MAX_COUNT ||
        !v.every((t) => typeof t === "string" && t.length <= TAG_MAX)
      ) {
        return badRequest("tags 형식 오류");
      }
      value.tags = v;
    } else if (k === "isPublic") {
      if (typeof v !== "boolean") {
        return badRequest("isPublic 형식 오류");
      }
      value.isPublic = v;
    }
  }
  return { value };
}

function badRequest(message: string): { error: NextResponse } {
  return { error: NextResponse.json({ error: message }, { status: 400 }) };
}
