/**
 * GET /api/erp/shop/catalog — 편의점 카탈로그 + 일자별 재고 + 영업 여부.
 *
 * 응답:
 * - items: 정적 + master_items 동적 품목 + 당일 재고 + available(isOpen && stock>0).
 * - isOpen: 영업 시간 판정 (`isShopOpen` — 06:00~20:00 / 일요일 마감).
 *
 * 권한: ERP 로그인이면 OK (별도 RBAC 게이트 없음).
 *
 * 캐시: no-store. GM 운영 모드 전환 직후 이전 영업 상태가 되살아나면 구매 UI가
 * 실제 서버 가드와 어긋나므로 브라우저/프록시 캐시를 쓰지 않는다.
 */

import { NextResponse } from "next/server";

import { buildShopCatalogResponse } from "@/app/(erp)/erp/shop/_data";
import { auth } from "@/lib/auth/config";
import { hasPlayerServiceTestAccess } from "@/lib/auth/player-service-test-access";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 응답 조립은 /erp/shop 페이지와 공유하는 빌더가 담당 (shop/_data.ts).
    const payload = await buildShopCatalogResponse(
      hasPlayerServiceTestAccess(session.user),
    );

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "카탈로그 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
