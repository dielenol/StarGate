import { NextResponse } from "next/server";

import type { UserRole } from "@stargate/shared-db/types";

import { auth } from "@/lib/auth/config";
import { requireRole } from "@/lib/auth/rbac";
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

export async function requireResearchGm(): Promise<
  { session: ResearchRouteSession } | { response: NextResponse }
> {
  const session = await auth();
  if (!session?.user) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  try {
    requireRole(session.user.role, "GM");
  } catch {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
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
}): Promise<{ balance: number } | { response: NextResponse }> {
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
    });
    return { balance: tx.balance };
  } catch (err) {
    if (err instanceof Error && err.message.includes("음수 잔액")) {
      return {
        response: NextResponse.json(
          { error: "잔액이 부족합니다.", code: "INSUFFICIENT_BALANCE" },
          { status: 400 },
        ),
      };
    }
    const message = err instanceof Error ? err.message : "연구 비용 차감 실패";
    return {
      response: NextResponse.json({ error: message }, { status: 500 }),
    };
  }
}

export async function refundResearchCredits(args: {
  budget: ResearchBudgetCharacter;
  amount: number;
  description: string;
  metadata: Record<string, string | number | boolean | null>;
  session: ResearchRouteSession;
}): Promise<void> {
  await addCredit({
    characterId: args.budget.id,
    characterCodename: args.budget.codename,
    ownerId: args.budget.ownerId,
    ownerName: args.budget.ownerName,
    amount: args.amount,
    type: "ADMIN_GRANT",
    description: args.description,
    metadata: args.metadata,
    createdById: args.session.id,
    createdByName: args.session.displayName,
    allowNegative: true,
  }).catch((err) => {
    console.error(
      `[equipment-shop/research] refund failed amount=${args.amount}:`,
      err,
    );
  });
}
