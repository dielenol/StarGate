import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";

import { executeEconomicOperation } from "@/lib/api/economic-operation";
import { readIdempotencyKey } from "@/lib/api/idempotency";
import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner as findMainCharacterByOwner } from "@/lib/db/characters";
import {
  assertMrBeastLotteryIndexesReady,
  getMrBeastLotteryConfig,
  getMrBeastLotteryState,
  isMrBeastLotteryTicketMasterReady,
  listRecentMrBeastLotteryWinners,
  MrBeastLotteryError,
  startOrResumeMrBeastLotteryClaim,
} from "@/lib/db/mrbeast-lottery";
import {
  findMasterItemBySlug,
  prepareCharacterInventoryItemLocks,
} from "@/lib/db/inventory";
import {
  isMrBeastLotteryTicketSlug,
  MRBEAST_LOTTERY_SLUG,
} from "@/lib/shop/mrbeast-lottery";
import { drawMrBeastLotteryPrize } from "@/lib/shop/mrbeast-lottery-draw";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;

interface StartLotteryBody {
  expectedCharacterId?: unknown;
  ticketSlug?: unknown;
}

function lotteryErrorResponse(error: MrBeastLotteryError): NextResponse {
  const status =
    error.code === "LOTTERY_MISCONFIGURED"
      ? 503
      : error.code === "LOTTERY_DISABLED"
        ? 404
        : error.code === "NO_LOTTERY_TICKET"
        ? 409
          : 400;
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status, headers: NO_STORE_HEADERS },
  );
}

async function findAuthorizedMainCharacter(userId: string) {
  try {
    return await findMainCharacterByOwner(userId);
  } catch (error) {
    console.error("[shop/lottery] main character integrity failure", error);
    throw new MrBeastLotteryError(
      "LOTTERY_CLAIM_INVALID",
      "메인 캐릭터 정합성을 확인할 수 없습니다.",
    );
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await getMrBeastLotteryConfig();
    if (session.user.isGuest) {
      const recentWinners = await listRecentMrBeastLotteryWinners();
      return NextResponse.json(
        {
          enabled: config.active,
          active: config.active,
          eventId: config.eventId,
          availableTickets: 0,
          ticketCounts: {
            mrbeast_lottery: 0,
            mrbeast_apology_lottery: 0,
          },
          pendingClaim: null,
          recentWinners,
        },
        { headers: NO_STORE_HEADERS },
      );
    }
    const mainCharacter = await findAuthorizedMainCharacter(session.user.id);
    if (!mainCharacter) {
      const recentWinners = await listRecentMrBeastLotteryWinners();
      return NextResponse.json({
        enabled: config.active,
        active: config.active,
        eventId: config.eventId,
        availableTickets: 0,
        ticketCounts: {
          mrbeast_lottery: 0,
          mrbeast_apology_lottery: 0,
        },
        pendingClaim: null,
        recentWinners,
      }, {
        headers: NO_STORE_HEADERS,
      });
    }
    const state = await getMrBeastLotteryState(
      config,
      String(mainCharacter._id),
    );

    // 기존 PENDING은 인프라 readiness와 무관하게 복구한다. 신규 사용 경로만 fail closed.
    if (!state.pendingClaim && (state.active || state.availableTickets > 0)) {
      await assertMrBeastLotteryIndexesReady();
      const requiredTicketSlugs = new Set<string>();
      if (state.active) requiredTicketSlugs.add(MRBEAST_LOTTERY_SLUG);
      for (const [ticketSlug, count] of Object.entries(state.ticketCounts)) {
        if (count > 0) requiredTicketSlugs.add(ticketSlug);
      }
      for (const ticketSlug of requiredTicketSlugs) {
        if (!isMrBeastLotteryTicketSlug(ticketSlug)) continue;
        const ticketMaster = await findMasterItemBySlug(ticketSlug);
        if (!isMrBeastLotteryTicketMasterReady(ticketMaster, ticketSlug)) {
          throw new MrBeastLotteryError(
            "LOTTERY_MISCONFIGURED",
            "복권 마스터 아이템 설정이 누락되었거나 안전 조건과 다릅니다.",
          );
        }
      }
    }

    return NextResponse.json(state, {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof MrBeastLotteryError) {
      return lotteryErrorResponse(error);
    }
    console.error("[shop/lottery] GET failed", error);
    return NextResponse.json(
      { error: "복권 상태 조회에 실패했습니다." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
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

  const body = (await request.json().catch(
    () => null,
  )) as StartLotteryBody | null;
  const expectedCharacterId =
    typeof body?.expectedCharacterId === "string"
      ? body.expectedCharacterId.trim()
      : "";
  const ticketSlug = isMrBeastLotteryTicketSlug(body?.ticketSlug)
    ? body.ticketSlug
    : MRBEAST_LOTTERY_SLUG;
  if (body?.ticketSlug !== undefined && !isMrBeastLotteryTicketSlug(body.ticketSlug)) {
    return NextResponse.json(
      {
        error: "지원하지 않는 복권 종류입니다.",
        code: "LOTTERY_CLAIM_INVALID",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!ObjectId.isValid(expectedCharacterId)) {
    return NextResponse.json(
      {
        error: "유효한 expectedCharacterId가 필요합니다.",
        code: "LOTTERY_CLAIM_INVALID",
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const mainCharacter = await findAuthorizedMainCharacter(session.user.id);
    if (!mainCharacter) {
      return NextResponse.json(
        {
          error: "메인 AGENT 캐릭터가 등록되어 있지 않습니다.",
          code: "NO_MAIN_CHARACTER",
        },
        { status: 400 },
      );
    }
    if (!mainCharacter.ownerId) {
      return NextResponse.json(
        { error: "캐릭터 owner 연결을 확인할 수 없습니다." },
        { status: 409 },
      );
    }
    if (mainCharacter.ownerId !== session.user.id) {
      return NextResponse.json(
        { error: "캐릭터 owner 연결이 현재 사용자와 일치하지 않습니다." },
        { status: 403 },
      );
    }

    const characterId = String(mainCharacter._id);
    if (characterId !== expectedCharacterId) {
      return NextResponse.json(
        {
          error:
            "메인 캐릭터가 변경되어 복권 사용을 중단했습니다. 인벤토리를 새로 확인해 주세요.",
          code: "LOTTERY_CLAIM_INVALID",
        },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }
    await assertMrBeastLotteryIndexesReady();
    const ticketMaster = await findMasterItemBySlug(ticketSlug);
    if (!isMrBeastLotteryTicketMasterReady(ticketMaster, ticketSlug)) {
      throw new MrBeastLotteryError(
        "LOTTERY_MISCONFIGURED",
        "복권 마스터 아이템 설정이 누락되었거나 안전 조건과 다릅니다.",
      );
    }
    const ticketItemId = String(ticketMaster!._id);
    await prepareCharacterInventoryItemLocks(characterId, [ticketItemId]);
    const fixedClaimId = new ObjectId().toHexString();
    const fixedBucket = drawMrBeastLotteryPrize().bucket;

    return await executeEconomicOperation({
      requestId,
      domain: "shop-mrbeast-lottery-claim",
      actorId: session.user.id,
      payload: { action: "start-or-resume", expectedCharacterId, ticketSlug },
      run: async (mongoSession) => {
        const result = await startOrResumeMrBeastLotteryClaim({
          characterId,
          characterCodename: mainCharacter.codename,
          characterIsPublic: mainCharacter.isPublic === true,
          ownerId: session.user.id,
          ownerName: session.user.displayName,
          ticketItemId,
          ticketSlug,
          claimId: fixedClaimId,
          bucket: fixedBucket,
          session: mongoSession,
        });
        return {
          status: result.resumed ? 200 : 201,
          body: result,
        };
      },
    });
  } catch (error) {
    if (error instanceof MrBeastLotteryError) {
      return lotteryErrorResponse(error);
    }
    console.error("[shop/lottery] POST failed", error);
    return NextResponse.json(
      { error: "복권 사용에 실패했습니다." },
      { status: 500 },
    );
  }
}
