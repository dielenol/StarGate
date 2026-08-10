import type { ResearchRecipeId } from "@stargate/shared-db";

export interface ResearchLabRecipe {
  id: ResearchRecipeId;
  source: {
    slug: string;
    category: "SPECIAL";
    quantity: 1;
    image: string;
  };
  output: {
    slug: string;
    category: "MATERIAL";
    quantity: 1;
    image: string;
  };
  initialDurationMs: number;
  repeatDurationMs: number;
  repeatCreditCost: 500;
}

const HOUR = 60 * 60 * 1_000;

export const RESEARCH_LAB_RECIPES = {
  ZULU_0028: {
    id: "ZULU_0028",
    source: {
      slug: "zulu-0028-contained-entity",
      category: "SPECIAL",
      quantity: 1,
      image: "/assets/catalog/special/zulu-0028-contained-entity.webp",
    },
    output: {
      slug: "broken-syllable",
      category: "MATERIAL",
      quantity: 1,
      image: "/assets/catalog/samples/broken-syllable.webp",
    },
    initialDurationMs: 24 * HOUR,
    repeatDurationMs: 6 * HOUR,
    repeatCreditCost: 500,
  },
  ZULU_0040: {
    id: "ZULU_0040",
    source: {
      slug: "zulu-0040-crown-specimen",
      category: "SPECIAL",
      quantity: 1,
      image: "/assets/catalog/samples/zulu-0040-crown-specimen.webp",
    },
    output: {
      slug: "zulu-0040-crown-mycelium-fragment",
      category: "MATERIAL",
      quantity: 1,
      image:
        "/assets/catalog/samples/zulu-0040-crown-mycelium-fragment.webp",
    },
    initialDurationMs: 24 * HOUR,
    repeatDurationMs: 6 * HOUR,
    repeatCreditCost: 500,
  },
  INVERTED_SOCK: {
    id: "INVERTED_SOCK",
    source: {
      slug: "inverted-sock-contained-entity",
      category: "SPECIAL",
      quantity: 1,
      image: "/assets/catalog/special/inverted-sock-contained-entity.webp",
    },
    output: {
      slug: "aurora-virus-black-smoke-sample",
      category: "MATERIAL",
      quantity: 1,
      image: "/assets/catalog/samples/aurora-virus-black-smoke-sample.webp",
    },
    initialDurationMs: 24 * HOUR,
    repeatDurationMs: 6 * HOUR,
    repeatCreditCost: 500,
  },
} as const satisfies Record<ResearchRecipeId, ResearchLabRecipe>;

export function getResearchLabRecipe(
  recipeId: string,
): ResearchLabRecipe | null {
  if (!Object.hasOwn(RESEARCH_LAB_RECIPES, recipeId)) return null;
  return RESEARCH_LAB_RECIPES[recipeId as ResearchRecipeId];
}

export type ResearchLabErrorCode =
  | "DUPLICATE_REQUEST"
  | "FORBIDDEN"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_SOURCE_SAMPLE"
  | "ITEM_MISSING"
  | "JOB_NOT_CANCELLABLE"
  | "JOB_NOT_CLAIMABLE"
  | "LINE_ALREADY_STARTED"
  | "LINE_LOCKED"
  | "MAIN_CHARACTER_INTEGRITY"
  | "NO_MAIN_CHARACTER"
  | "OUTSTANDING_JOB_EXISTS"
  | "RECIPE_NOT_REGISTERED"
  | "SCIENTIST_REQUIRED"
  | "UNAUTHORIZED";

export class ResearchLabError extends Error {
  readonly code: ResearchLabErrorCode;
  readonly status: number;

  constructor(
    code: ResearchLabErrorCode,
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "ResearchLabError";
    this.code = code;
    this.status = status;
  }
}
