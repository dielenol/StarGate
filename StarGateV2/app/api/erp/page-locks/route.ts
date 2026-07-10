import { NextResponse } from "next/server";

import { findNavItemByLockKey } from "@/components/erp/nav-config";
import { getActiveSession } from "@/lib/auth/active-session";
import {
  getErpPageLockOverrides,
  setErpPageLockOverride,
} from "@/lib/db/erp-page-locks";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

interface PageLockBody {
  lockKey?: unknown;
  locked?: unknown;
}

export async function GET() {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const overrides = await getErpPageLockOverrides();
    return NextResponse.json({ overrides }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("[page-locks] failed to load overrides", error);
    return NextResponse.json(
      { error: "페이지 잠금 상태를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await getActiveSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "GM") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as PageLockBody | null;
  const lockKey = typeof body?.lockKey === "string" ? body.lockKey : null;
  const locked = typeof body?.locked === "boolean" ? body.locked : null;
  if (!lockKey || locked === null || !findNavItemByLockKey(lockKey)) {
    return NextResponse.json(
      { error: "유효한 사이드바 페이지와 잠금 상태가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    await setErpPageLockOverride({
      lockKey,
      locked,
      updatedById: session.user.id,
      updatedByName: session.user.displayName,
    });
    return NextResponse.json(
      { lockKey, locked },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error("[page-locks] failed to update override", error);
    return NextResponse.json(
      { error: "페이지 잠금 상태를 변경하지 못했습니다." },
      { status: 500 },
    );
  }
}
