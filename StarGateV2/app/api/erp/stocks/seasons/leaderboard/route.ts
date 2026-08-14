import { NextResponse } from "next/server";

import { auth } from "@/lib/auth/config";
import { findMainCharacterLiteByOwner } from "@/lib/db/characters";
import {
  getActiveStockInvestmentSeason,
  getStockSeasonPerformance,
  listStockInvestmentSeasons,
  listStockSeasonLeaderboard,
} from "@/lib/db/stock-market";

function returnPercent(linkedReturn: number): number {
  return Math.round(linkedReturn * 10_000) / 100;
}

function eligibilityReason(input: {
  investedValue: number;
  buyCount: number;
  exposureSlots: number;
  currentPortfolioValue?: number;
}): string {
  if (input.investedValue < 50) return "누적 투자금 50 CR 미만";
  if (input.buyCount < 1) return "시즌 중 매수 기록 없음";
  if (input.exposureSlots < 8) return "포트폴리오 참여 회차 8회 미만";
  if ((input.currentPortfolioValue ?? 0) <= 0) {
    return "시즌 종료 시점 포트폴리오가 비어 있음";
  }
  return "참가 조건 집계 중";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const activeSeason = await getActiveStockInvestmentSeason();
    const season =
      activeSeason ?? (await listStockInvestmentSeasons(1))[0] ?? null;
    if (!season) {
      return NextResponse.json(
        { season: null, items: [] },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const [leaderboard, mainCharacter] = await Promise.all([
      listStockSeasonLeaderboard(season._id),
      findMainCharacterLiteByOwner(session.user.id),
    ]);
    const mine = mainCharacter
      ? await getStockSeasonPerformance(season._id, String(mainCharacter._id))
      : null;
    return NextResponse.json(
      {
        season: {
          id: season._id,
          status:
            season.status === "ACTIVE"
              ? "ACTIVE"
              : season.status === "FINALIZED"
                ? "ENDED"
                : "SCHEDULED",
          startsAt: season.startsAt.toISOString(),
          endsAt: season.endsAt.toISOString(),
        },
        items: leaderboard.map((item, index) => ({
          rank: item.rank ?? index + 1,
          codename: item.codename,
          returnPercent: returnPercent(item.linkedReturn),
          ...(item.badge ? { badge: item.badge } : {}),
          ...(item.title ? { title: item.title } : {}),
        })),
        ...(mainCharacter
          ? {
              mine: mine
                ? {
                    eligible: mine.eligible,
                    ...(mine.eligible
                      ? {
                          rank: mine.rank,
                          returnPercent: returnPercent(mine.linkedReturn),
                        }
                      : {
                          reason: eligibilityReason(mine),
                        }),
                  }
                : {
                    eligible: false,
                    reason: "시즌 참여 기록이 아직 없습니다.",
                  },
            }
          : {}),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[stocks/seasons/leaderboard] read failed:", error);
    return NextResponse.json(
      { error: "NOVEX 시즌 순위를 불러오지 못했습니다." },
      { status: 500 },
    );
  }
}
