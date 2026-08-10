import type { ResearchLabOverview } from "@/types/research";

/** 게스트에게는 연구선 구조와 공개 진행 상태만 남기고 개인·원장 데이터를 제거한다. */
export function toGuestResearchLabOverview(
  overview: ResearchLabOverview,
): ResearchLabOverview {
  return {
    serverNow: overview.serverNow,
    viewer: {
      eligibilityCode: "NO_MAIN_CHARACTER",
      character: null,
      isScientist: false,
      balance: null,
      mutationsEnabled: false,
      productionEnabled: false,
    },
    lines: overview.lines.map((line) => ({
      recipe: {
        id: line.recipe.id,
        label: line.recipe.label,
        eyebrow: line.recipe.eyebrow,
        description: line.recipe.description,
        gameplayNote: line.recipe.gameplayNote,
        source: {
          ...line.recipe.source,
          sharedQuantity: 0,
        },
        output: {
          ...line.recipe.output,
          sharedQuantity: 0,
        },
        initialDurationMs: line.recipe.initialDurationMs,
        repeatDurationMs: line.recipe.repeatDurationMs,
        repeatCreditCost: line.recipe.repeatCreditCost,
      },
      status: line.status,
      isHalted: line.isHalted,
      submittedByCharacterCodename: null,
      startedAt: null,
      completesAt: null,
      openedAt: null,
      activeJob: null,
      queue: [],
      myJob: null,
    })),
    xeno: null,
  };
}
