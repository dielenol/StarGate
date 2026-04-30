import { NextResponse } from "next/server";

import type { CreditTransactionType } from "@/types/credit";

import { auth } from "@/lib/auth/config";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import { addCredit, getUserBalance, listCreditTransactions } from "@/lib/db/credits";
import { findUserById } from "@/lib/db/users";
import { isValidObjectId } from "@/lib/db/utils";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const isGm = hasRole(session.user.role, "V");
    const transactions = isGm
      ? await listCreditTransactions()
      : await listCreditTransactions(session.user.id);

    return NextResponse.json({ transactions });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "크레딧 트랜잭션 조회 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(session.user.role, "V");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    userId?: string;
    userName?: string;
    amount?: number;
    type?: CreditTransactionType;
    description?: string;
  };

  // userId 형식 검증 — ObjectId 가 아니면 400. trash row 방지.
  if (!body.userId?.trim() || !isValidObjectId(body.userId)) {
    return NextResponse.json(
      { error: "userId가 올바른 ObjectId 형식이 아닙니다." },
      { status: 400 },
    );
  }

  if (typeof body.amount !== "number" || body.amount === 0) {
    return NextResponse.json(
      { error: "amount는 0이 아닌 숫자여야 합니다." },
      { status: 400 },
    );
  }

  const validTypes: CreditTransactionType[] = [
    "ADMIN_GRANT",
    "ADMIN_DEDUCT",
    "SESSION_REWARD",
  ];
  if (!body.type || !validTypes.includes(body.type)) {
    return NextResponse.json(
      { error: "type은 ADMIN_GRANT, ADMIN_DEDUCT, SESSION_REWARD 중 하나여야 합니다." },
      { status: 400 },
    );
  }

  // 대상 유저 실재성 확인 — 클라이언트가 임의 ObjectId 를 넣어도 distinguishable error 반환.
  const target = await findUserById(body.userId);
  if (!target) {
    return NextResponse.json(
      { error: "대상 사용자를 찾을 수 없습니다." },
      { status: 404 },
    );
  }

  /**
   * 음수 잔액 가드 — 정책 확정 전이라 보수적으로 거부.
   * shared-db `addCredit` 의 race window 는 본 PR 범위 밖이라 여기 사전 검사는 best-effort.
   * 정책이 "ADMIN_DEDUCT 는 음수 잔액 허용" 으로 확정되면 type 별 분기로 조건 완화 가능.
   */
  const currentBalance = await getUserBalance(body.userId);
  if (currentBalance + body.amount < 0) {
    return NextResponse.json(
      {
        error:
          "잔액이 부족합니다. 음수 잔액은 허용되지 않습니다 (currentBalance + amount < 0).",
      },
      { status: 400 },
    );
  }

  try {
    const transaction = await addCredit(
      body.userId,
      // userName 은 클라이언트 입력 무시 — audit log 신뢰성 확보를 위해 서버측 displayName 사용.
      target.displayName,
      body.amount,
      body.type,
      body.description ?? "",
      session.user.id,
      session.user.displayName,
    );

    return NextResponse.json({ transaction }, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "크레딧 지급 실패";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
