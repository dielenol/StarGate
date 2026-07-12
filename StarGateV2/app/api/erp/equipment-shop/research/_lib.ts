import { NextResponse } from "next/server";

import type { UserRole } from "@stargate/shared-db/types";
import type { ClientSession } from "mongodb";

import { isNavPathLocked } from "@/components/erp/nav-config";
import { getActiveSession } from "@/lib/auth/active-session";
import { hasRole } from "@/lib/auth/rbac";
import { getErpPageLockOverrides } from "@/lib/db/erp-page-locks";
import { hasLocalErpPreviewAccess } from "@/lib/erp/local-page-access";
import { findMainCharacterLiteByOwner } from "@/lib/db/characters";
import { addCredit } from "@/lib/db/credits";
import { findUserById } from "@/lib/db/users";

export interface ResearchRouteSession {
  id: string;
  role: UserRole;
  displayName: string;
}

export interface ResearchBudgetCharacter {
  id: string;
  codename: string;
  ownerId: string;
  ownerName: string;
}

export class ResearchMutationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ResearchMutationError";
  }
}

/**
 * 연구소 API 공통 가드 — 페이지 가드(requireEquipmentShopSession)와 동일 정책.
 * GM/로컬 프리뷰가 아니어도 연구소 운영 잠금(erp_page_locks)이 해제되어 있으면 허용한다.
 */
export async function requireResearchAccess(): Promise<
  { session: ResearchRouteSession } | { response: NextResponse }
> {
  const authResult = await requireResearchUser();
  if ("response" in authResult) return authResult;

  if (hasRole(authResult.session.role, "GM")) return authResult;
  if (await hasLocalErpPreviewAccess()) return authResult;

  const locked = isNavPathLocked(
    "/erp/equipment-shop/lab",
    await getErpPageLockOverrides(),
  );
  if (locked) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return authResult;
}

export async function requireResearchUser(): Promise<
  { session: ResearchRouteSession } | { response: NextResponse }
> {
  const session = await getActiveSession();
  if (!session?.user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return {
    session: {
      id: session.user.id,
      role: session.user.role,
      displayName: session.user.displayName,
    },
  };
}

export async function resolveResearchBudgetCharacter(
  userId: string,
): Promise<
  { budget: ResearchBudgetCharacter } | { response: NextResponse }
> {
  let mainChar;
  try {
    mainChar = await findMainCharacterLiteByOwner(userId);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "메인 캐릭터 조회 실패 (정합성 위반)";
    return {
      response: NextResponse.json(
        { error: message, code: "MAIN_CHARACTER_INTEGRITY" },
        { status: 409 },
      ),
    };
  }

  if (!mainChar) {
    return {
      response: NextResponse.json(
        {
          error: "메인 AGENT 캐릭터가 없어 연구 비용을 차감할 수 없습니다.",
          code: "NO_MAIN_CHARACTER",
        },
        { status: 400 },
      ),
    };
  }
  if (!mainChar.ownerId) {
    return {
      response: NextResponse.json(
        { error: "캐릭터에 owner가 연결되어 있지 않습니다 — ledger 발급 불가." },
        { status: 400 },
      ),
    };
  }

  const owner = await findUserById(mainChar.ownerId);
  if (!owner) {
    return {
      response: NextResponse.json(
        { error: "캐릭터의 owner user 정보를 찾을 수 없습니다." },
        { status: 500 },
      ),
    };
  }

  return {
    budget: {
      id: String(mainChar._id),
      codename: mainChar.codename,
      ownerId: mainChar.ownerId,
      ownerName: owner.discordUsername ?? owner.displayName,
    },
  };
}

export async function chargeResearchCredits(args: {
  budget: ResearchBudgetCharacter;
  amount: number;
  description: string;
  metadata: Record<string, string | number | boolean | null>;
  session: ResearchRouteSession;
  requestId: string;
  mongoSession: ClientSession;
}): Promise<{ balance: number }> {
  try {
    const tx = await addCredit({
      characterId: args.budget.id,
      characterCodename: args.budget.codename,
      ownerId: args.budget.ownerId,
      ownerName: args.budget.ownerName,
      amount: -args.amount,
      type: "PURCHASE",
      description: args.description,
      metadata: args.metadata,
      createdById: args.session.id,
      createdByName: args.session.displayName,
      requestId: args.requestId,
      session: args.mongoSession,
    });
    return { balance: tx.balance };
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("음수 잔액") ||
        ("code" in err && err.code === "INSUFFICIENT_BALANCE"))
    ) {
      throw new ResearchMutationError(
        "INSUFFICIENT_BALANCE",
        400,
        "잔액이 부족합니다.",
      );
    }
    if (
      err instanceof Error &&
      "code" in err &&
      err.code === "DUPLICATE_REQUEST"
    ) {
      throw new ResearchMutationError(
        "DUPLICATE_REQUEST",
        409,
        "동일 Idempotency-Key가 다른 연구 mutation에 사용되었습니다.",
      );
    }
    const message = err instanceof Error ? err.message : "연구 비용 차감 실패";
    throw new ResearchMutationError("RESEARCH_CHARGE_FAILED", 500, message);
  }
}
