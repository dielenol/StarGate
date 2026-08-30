import "server-only";
import "@/lib/db/init";

import { cache } from "react";

import {
  buildResearchHallOfFameResponse,
  type ResearchHallOfFameResponse,
} from "@stargate/core";
import {
  getDb,
  listTeamResearchContributionRankings,
  RESEARCH_RANKING_STATE_COLLECTION,
  RESEARCH_RANKING_STATE_ID,
  type ResearchRankingState,
} from "@stargate/shared-db";

function toPublicResponse(
  snapshot: ResearchHallOfFameResponse,
): ResearchHallOfFameResponse {
  return {
    period: "ALL_TIME",
    cadence: "DAILY_21_KST",
    generatedAt: snapshot.generatedAt,
    items: snapshot.items.slice(0, 3).map((item) => ({
      rank: item.rank,
      codename: item.codename,
      totalCredits: item.totalCredits,
      contributionCount: item.contributionCount,
    })),
  };
}

/**
 * 첫 일일 실행 전에는 원장을 읽기 전용 집계하고, 첫 스냅샷 이후에는
 * worker가 21:00 KST에 고정한 공개 스냅샷만 반환한다.
 */
const loadResearchHallOfFameResponse = cache(
  async (): Promise<ResearchHallOfFameResponse> => {
    const db = await getDb();
    const state = await db
      .collection<ResearchRankingState>(RESEARCH_RANKING_STATE_COLLECTION)
      .findOne(
        { _id: RESEARCH_RANKING_STATE_ID },
        { projection: { publicSnapshot: 1 } },
      );

    if (state?.publicSnapshot) {
      return toPublicResponse(state.publicSnapshot);
    }

    const rankings = await listTeamResearchContributionRankings(3);
    return buildResearchHallOfFameResponse(rankings, new Date());
  },
);

export async function getResearchHallOfFameResponse(): Promise<ResearchHallOfFameResponse> {
  // overview와 연구 패널이 같은 RSC 렌더에서 요청해도 스냅샷 조회는 한 번만 수행한다.
  return loadResearchHallOfFameResponse();
}
