import { NextResponse } from "next/server";

import type { CreditTransactionType } from "@/types/credit";

import { auth } from "@/lib/auth/config";
import { hasRole, requireRole } from "@/lib/auth/rbac";
import { listCreditTransactions, addCredit } from "@/lib/db/credits";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const isGm = hasRole(session.user.role, "GM");
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
    requireRole(session.user.role, "GM");
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

  if (!body.userId?.trim()) {
    return NextResponse.json(
      { error: "userId는 필수입니다." },
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

  try {
    const transaction = await addCredit(
      body.userId,
      body.userName ?? "",
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
