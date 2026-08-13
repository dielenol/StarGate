/** GET /api/erp/credits/balance — 세션 소유 메인 캐릭터의 현재 잔액만 조회. */

import { NextResponse } from "next/server";

import type { CreditBalanceResponse } from "@/hooks/queries/useCreditsQuery";

import { auth } from "@/lib/auth/config";
import { resolveOwnedCreditCharacter } from "@/lib/credits/account-read";
import { getCharacterBalance } from "@/lib/db/credits";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const character = await resolveOwnedCreditCharacter(
    session.user,
    "credits/balance",
  );
  if (character.status === "integrity-error") {
    return NextResponse.json(
      {
        error: "메인 캐릭터 정합성 위반 — 운영자(GM)에게 문의해주세요.",
        code: "MAIN_CHARACTER_INTEGRITY",
      },
      { status: 409 },
    );
  }
  if (character.status === "lookup-error") {
    return NextResponse.json(
      { error: "메인 캐릭터를 확인할 수 없습니다." },
      { status: 500 },
    );
  }
  if (character.status === "missing") {
    const response: CreditBalanceResponse = {
      balance: 0,
      characterId: null,
      hasMainCharacter: false,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  try {
    const response: CreditBalanceResponse = {
      balance: await getCharacterBalance(character.characterId),
      characterId: character.characterId,
      hasMainCharacter: true,
    };
    return NextResponse.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[credits/balance] balance lookup failed", error);
    return NextResponse.json(
      { error: "크레딧 잔액을 불러올 수 없습니다." },
      { status: 500 },
    );
  }
}
