import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import {
  MrBeastLotteryError,
  revealMrBeastLotteryClaim,
} from "@/lib/db/mrbeast-lottery";

interface RevealBody {
  claimId?: unknown;
}

function lotteryErrorResponse(error: MrBeastLotteryError): NextResponse {
  const status =
    error.code === "LOTTERY_DISABLED"
      ? 404
      : error.code === "LOTTERY_CLAIM_NOT_FOUND"
        ? 404
        : 409;
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status },
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      {
        error: "유효한 Idempotency-Key 헤더가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400 },
    );
  }

  const body = (await request.json().catch(() => null)) as RevealBody | null;
  const claimId =
    typeof body?.claimId === "string" ? body.claimId.trim() : "";
  if (!ObjectId.isValid(claimId)) {
    return NextResponse.json(
      { error: "유효한 claimId가 필요합니다.", code: "INVALID_CLAIM" },
      { status: 400 },
    );
  }

  try {
    const mainCharacter = await findMainCharacterByOwner(session.user.id);
    if (!mainCharacter) {
      return NextResponse.json(
        {
          error: "메인 AGENT 캐릭터가 등록되어 있지 않습니다.",
          code: "NO_MAIN_CHARACTER",
        },
        { status: 400 },
      );
    }
    const characterId = String(mainCharacter._id);
    if (mainCharacter.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: "캐릭터 owner 연결이 현재 사용자와 일치하지 않습니다." },
        { status: 403 },
      );
    }

    return await executeEconomicOperation({
      requestId,
      domain: "shop-mrbeast-lottery-reveal",
      actorId: session.user.id,
      payload: { claimId },
      run: async (mongoSession) => {
        const result = await revealMrBeastLotteryClaim({
          claimId,
          characterId,
          ownerId: session.user.id,
          ownerName: session.user.displayName,
          session: mongoSession,
        });
        return { status: 200, body: result };
      },
    });
  } catch (error) {
    if (error instanceof MrBeastLotteryError) {
      return lotteryErrorResponse(error);
    }
    console.error("[shop/lottery/reveal] POST failed", error);
    return NextResponse.json(
      { error: "복권 공개에 실패했습니다." },
      { status: 500 },
    );
  }
}
