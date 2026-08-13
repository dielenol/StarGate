import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import {
  findMasterItemBySlug,
  prepareCharacterInventoryItemLocks,
} from "@/lib/db/inventory";
import {
  assertMrBeastLotteryIndexesReady,
  fenceLotteryCharacterOwner,
  isMrBeastLotteryTicketMasterReady,
  MrBeastLotteryError,
} from "@/lib/db/mrbeast-lottery";
import {
  claimMrBeastSodaPayback,
  getMrBeastSodaPaybackState,
  MrBeastSodaPaybackError,
  prepareMrBeastSodaPaybackAnchor,
} from "@/lib/db/mrbeast-soda-payback";
import { MRBEAST_APOLOGY_LOTTERY_SLUG } from "@/lib/shop/mrbeast-lottery";
import { MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID } from "@/lib/shop/mrbeast-soda-payback";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

interface PaybackBody {
  expectedCharacterId?: unknown;
}

function errorResponse(error: unknown): NextResponse | null {
  if (error instanceof MrBeastSodaPaybackError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      {
        status: error.code === "PAYBACK_NOT_ELIGIBLE" ? 409 : 500,
        headers: NO_STORE_HEADERS,
      },
    );
  }
  if (error instanceof MrBeastLotteryError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      {
        status: error.code === "LOTTERY_MISCONFIGURED" ? 503 : 409,
        headers: NO_STORE_HEADERS,
      },
    );
  }
  return null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.isGuest) {
    return NextResponse.json(
      {
        status: "INELIGIBLE",
        purchasedQuantity: 0,
        rewardQuantity: 0,
        claimedAt: null,
      },
      { headers: NO_STORE_HEADERS },
    );
  }

  try {
    const state = await getMrBeastSodaPaybackState(session.user.id);
    return NextResponse.json(state, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    console.error("[shop/payback] GET failed", error);
    return NextResponse.json(
      { error: "미스터비스트 소다 페이백 상태를 확인할 수 없습니다." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.isGuest) {
    return NextResponse.json(
      { error: "게스트 계정은 페이백을 받을 수 없습니다." },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  const requestId = readIdempotencyKey(request);
  if (!requestId) {
    return NextResponse.json(
      {
        error: "유효한 Idempotency-Key 헤더가 필요합니다.",
        code: "INVALID_IDEMPOTENCY_KEY",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const body = (await request.json().catch(() => null)) as PaybackBody | null;
  const expectedCharacterId =
    typeof body?.expectedCharacterId === "string"
      ? body.expectedCharacterId.trim()
      : "";
  if (!ObjectId.isValid(expectedCharacterId)) {
    return NextResponse.json(
      {
        error: "유효한 expectedCharacterId가 필요합니다.",
        code: "INVALID_CHARACTER",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    let mainCharacter;
    try {
      mainCharacter = await findMainCharacterByOwner(session.user.id);
    } catch (error) {
      console.error("[shop/payback] main character integrity failure", error);
      return NextResponse.json(
        {
          error: "메인 캐릭터 정합성을 확인할 수 없습니다.",
          code: "MAIN_CHARACTER_INTEGRITY",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    if (!mainCharacter) {
      return NextResponse.json(
        {
          error: "메인 AGENT 캐릭터가 등록되어 있지 않습니다.",
          code: "NO_MAIN_CHARACTER",
        },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }
    const characterId = String(mainCharacter._id);
    if (
      characterId !== expectedCharacterId ||
      mainCharacter.ownerId !== session.user.id
    ) {
      return NextResponse.json(
        {
          error: "메인 캐릭터 연결이 변경되어 페이백 지급을 중단했습니다.",
          code: "CHARACTER_CHANGED",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    await assertMrBeastLotteryIndexesReady();
    const ticketMaster = await findMasterItemBySlug(
      MRBEAST_APOLOGY_LOTTERY_SLUG,
    );
    if (
      !isMrBeastLotteryTicketMasterReady(
        ticketMaster,
        MRBEAST_APOLOGY_LOTTERY_SLUG,
      )
    ) {
      throw new MrBeastLotteryError(
        "LOTTERY_MISCONFIGURED",
        "사죄 복권 마스터 아이템이 준비되지 않았습니다.",
      );
    }
    const ticketItemId = String(ticketMaster!._id);

    await prepareMrBeastSodaPaybackAnchor(session.user.id);
    await prepareCharacterInventoryItemLocks(characterId, [ticketItemId]);

    return await executeEconomicOperation({
      requestId,
      domain: "shop-mrbeast-soda-payback",
      actorId: session.user.id,
      payload: {
        campaignId: MRBEAST_SODA_APOLOGY_PAYBACK_CAMPAIGN_ID,
        expectedCharacterId,
      },
      run: async (mongoSession) => {
        await fenceLotteryCharacterOwner({
          characterId,
          ownerId: session.user.id,
          session: mongoSession,
        });
        const result = await claimMrBeastSodaPayback({
          userId: session.user.id,
          characterId,
          characterCodename: mainCharacter.codename,
          ticketItemId,
          requestId,
          session: mongoSession,
        });
        return {
          status: result.alreadyClaimed ? 200 : 201,
          body: result.state,
        };
      },
    });
  } catch (error) {
    const response = errorResponse(error);
    if (response) return response;
    console.error("[shop/payback] POST failed", error);
    return NextResponse.json(
      { error: "사죄 복권 페이백 지급에 실패했습니다." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
