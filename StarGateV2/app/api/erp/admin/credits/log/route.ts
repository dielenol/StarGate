/**
 * GM 크레딧 운영 대시보드 — 필터링된 트랜잭션 로그 + 페이지네이션.
 *
 * Query params (all optional):
 * - types       : CSV (예: "ADMIN_GRANT,SESSION_REWARD"). CREDIT_TRANSACTION_TYPES 화이트리스트 검증.
 * - ownerId     : ObjectId hex
 * - characterId : ObjectId hex
 * - from / to   : ISO date string (createdAt 범위)
 * - amountMin / amountMax : number
 * - limit       : default 50, max 200
 * - skip        : default 0
 *
 * 응답: CreditTransactionPage { items, total, limit, skip, hasMore }.
 *
 * 응답 코드: 401 / 403 / 400 (잘못된 파라미터) / 500.
 * Cache: no-store (실시간 운영 정보).
 */

import { NextResponse } from "next/server";

import type { CreditTransactionPage } from "@/types/credit-admin";
import type { CreditTransactionType } from "@/types/credit";

import { CREDIT_TRANSACTION_TYPES } from "@/types/credit";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
import {
  countCreditTransactionsFiltered,
  listCreditTransactionsFiltered,
} from "@/lib/db/credits";
import { isValidObjectId } from "@/lib/db/utils";

import { listCreditVisibleOperationCharacters } from "@/app/(erp)/erp/admin/credits/_data";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);

  // types CSV 파싱 + 화이트리스트 검증.
  let types: CreditTransactionType[] | undefined;
  const typesParam = url.searchParams.get("types");
  if (typesParam) {
    const candidates = typesParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const invalid = candidates.filter(
      (t) => !CREDIT_TRANSACTION_TYPES.includes(t as CreditTransactionType),
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `유효하지 않은 type: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
    types = candidates as CreditTransactionType[];
  }

  // ownerId / characterId — ObjectId 검증.
  const ownerIdParam = url.searchParams.get("ownerId");
  if (ownerIdParam && !isValidObjectId(ownerIdParam)) {
    return NextResponse.json(
      { error: "ownerId가 올바른 ObjectId 형식이 아닙니다." },
      { status: 400 },
    );
  }
  const characterIdParam = url.searchParams.get("characterId");
  if (characterIdParam && !isValidObjectId(characterIdParam)) {
    return NextResponse.json(
      { error: "characterId가 올바른 ObjectId 형식이 아닙니다." },
      { status: 400 },
    );
  }

  // from / to — ISO date 파싱.
  const fromParam = url.searchParams.get("from");
  let from: Date | undefined;
  if (fromParam) {
    const d = new Date(fromParam);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "from이 올바른 ISO 날짜 형식이 아닙니다." },
        { status: 400 },
      );
    }
    from = d;
  }

  const toParam = url.searchParams.get("to");
  let to: Date | undefined;
  if (toParam) {
    const d = new Date(toParam);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "to가 올바른 ISO 날짜 형식이 아닙니다." },
        { status: 400 },
      );
    }
    to = d;
  }

  // amountMin / amountMax — 숫자 파싱.
  const amountMinParam = url.searchParams.get("amountMin");
  let amountMin: number | undefined;
  if (amountMinParam !== null) {
    const n = Number(amountMinParam);
    if (!Number.isFinite(n)) {
      return NextResponse.json(
        { error: "amountMin이 올바른 숫자가 아닙니다." },
        { status: 400 },
      );
    }
    amountMin = n;
  }

  const amountMaxParam = url.searchParams.get("amountMax");
  let amountMax: number | undefined;
  if (amountMaxParam !== null) {
    const n = Number(amountMaxParam);
    if (!Number.isFinite(n)) {
      return NextResponse.json(
        { error: "amountMax가 올바른 숫자가 아닙니다." },
        { status: 400 },
      );
    }
    amountMax = n;
  }

  // limit / skip 파싱 + 클램프.
  const limitParam = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    const n = Number(limitParam);
    if (!Number.isFinite(n) || n < 1) {
      return NextResponse.json(
        { error: "limit은 1 이상의 숫자여야 합니다." },
        { status: 400 },
      );
    }
    limit = Math.min(Math.floor(n), MAX_LIMIT);
  }

  const skipParam = url.searchParams.get("skip");
  let skip = 0;
  if (skipParam !== null) {
    const n = Number(skipParam);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "skip은 0 이상의 숫자여야 합니다." },
        { status: 400 },
      );
    }
    skip = Math.floor(n);
  }

  const filter: {
    types?: CreditTransactionType[];
    ownerId?: string;
    characterId?: string;
    characterIds?: string[];
    from?: Date;
    to?: Date;
    amountMin?: number;
    amountMax?: number;
  } = {
    types,
    ownerId: ownerIdParam ?? undefined,
    characterId: characterIdParam ?? undefined,
    from,
    to,
    amountMin,
    amountMax,
  };

  // 운영 캐릭(isPublic !== false) 화이트리스트 자동 적용:
  // GM 이 단건 characterId 를 명시한 경우는 그 의도 (audit 등) 를 존중하고 화이트리스트 미적용.
  // 단건이 비어 있을 때만 운영 캐릭 IDs 를 채워 더미 트랜잭션을 화면에서 제외.
  if (!filter.characterId) {
    const publicMains = await listCreditVisibleOperationCharacters();
    filter.characterIds = publicMains.map((c) => String(c._id));
  }

  try {
    const [items, total] = await Promise.all([
      listCreditTransactionsFiltered({ ...filter, limit, skip }),
      countCreditTransactionsFiltered(filter),
    ]);

    const page: CreditTransactionPage = {
      items,
      total,
      limit,
      skip,
      hasMore: skip + items.length < total,
    };

    return NextResponse.json(page, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "트랜잭션 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
