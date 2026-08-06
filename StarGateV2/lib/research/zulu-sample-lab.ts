export interface ZuluExtractionRecipeDefinition {
  id: string;
  source: {
    slug: string;
    image: string;
    category: "SPECIAL";
    quantity: number;
  };
  output: {
    slug: string;
    image: string;
    category: "MATERIAL";
    initialQuantity: number;
    extractionQuantity: number;
  };
  extraction: {
    creditCost: number;
  };
}

export const ZULU_EXTRACTION_RECIPES = {
  "ZULU-0028": {
    id: "ZULU-0028",
    source: {
      slug: "zulu-0028-contained-entity",
      image: "/assets/catalog/special/zulu-0028-contained-entity.webp",
      category: "SPECIAL",
      quantity: 1,
    },
    output: {
      slug: "broken-syllable",
      image: "/assets/catalog/samples/broken-syllable.webp",
      category: "MATERIAL",
      initialQuantity: 1,
      extractionQuantity: 1,
    },
    extraction: {
      creditCost: 500,
    },
  },
} as const satisfies Record<string, ZuluExtractionRecipeDefinition>;

export type ZuluExtractionRecipeId = keyof typeof ZULU_EXTRACTION_RECIPES;
export type ZuluExtractionRecipe =
  (typeof ZULU_EXTRACTION_RECIPES)[ZuluExtractionRecipeId];

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function isValidRecipe(
  recipeId: string,
  recipe: ZuluExtractionRecipeDefinition,
): boolean {
  return (
    recipe.id === recipeId &&
    recipe.source.slug.length > 0 &&
    recipe.source.image.startsWith("/assets/") &&
    recipe.source.category === "SPECIAL" &&
    isPositiveInteger(recipe.source.quantity) &&
    recipe.output.slug.length > 0 &&
    recipe.output.slug !== recipe.source.slug &&
    recipe.output.image.startsWith("/assets/") &&
    recipe.output.category === "MATERIAL" &&
    isPositiveInteger(recipe.output.initialQuantity) &&
    isPositiveInteger(recipe.output.extractionQuantity) &&
    isPositiveInteger(recipe.extraction.creditCost)
  );
}

export function getZuluExtractionRecipe(
  recipeId: string,
): ZuluExtractionRecipe | null {
  if (!Object.hasOwn(ZULU_EXTRACTION_RECIPES, recipeId)) return null;
  const recipe = ZULU_EXTRACTION_RECIPES[
    recipeId as ZuluExtractionRecipeId
  ];
  return isValidRecipe(recipeId, recipe) ? recipe : null;
}

const ZULU_0028_RECIPE = ZULU_EXTRACTION_RECIPES["ZULU-0028"];

export const ZULU_SAMPLE_LINE_ID = ZULU_0028_RECIPE.id;
export const ZULU_CONTAINED_ENTITY_SLUG = ZULU_0028_RECIPE.source.slug;
export const BROKEN_SYLLABLE_SLUG = ZULU_0028_RECIPE.output.slug;
export const ZULU_SAMPLE_EXTRACTION_COST =
  ZULU_0028_RECIPE.extraction.creditCost;

export const ZULU_CONTAINED_ENTITY_IMAGE = ZULU_0028_RECIPE.source.image;
export const BROKEN_SYLLABLE_IMAGE = ZULU_0028_RECIPE.output.image;

export type ZuluSampleLabErrorCode =
  | "DUPLICATE_REQUEST"
  | "FORBIDDEN"
  | "INSUFFICIENT_BALANCE"
  | "INSUFFICIENT_SOURCE_SAMPLE"
  | "INVALID_IDEMPOTENCY_KEY"
  | "LAB_ITEM_MISSING"
  | "LINE_ALREADY_UNLOCKED"
  | "LINE_LOCKED"
  | "MAIN_CHARACTER_INTEGRITY"
  | "NO_MAIN_CHARACTER"
  | "RECIPE_NOT_REGISTERED"
  | "UNAUTHORIZED";

export class ZuluSampleLabError extends Error {
  readonly code: ZuluSampleLabErrorCode;
  readonly status: number;

  constructor(code: ZuluSampleLabErrorCode, status: number, message: string) {
    super(message);
    this.name = "ZuluSampleLabError";
    this.code = code;
    this.status = status;
  }
}

export interface ZuluSampleLineDto {
  id: typeof ZULU_SAMPLE_LINE_ID;
  unlockedAt: string;
  unlockedByName: string;
}

export interface ZuluSampleLabItemDto {
  itemId: string;
  slug: string;
  name: string;
  image: string;
  sharedQuantity: number;
}

export type ZuluSampleEligibilityCode =
  | "ELIGIBLE"
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY";

export interface ZuluSampleLabOverview {
  recipe: {
    id: string;
    sourceQuantity: number;
    initialOutputQuantity: number;
    extractionOutputQuantity: number;
  };
  line: ZuluSampleLineDto | null;
  source: ZuluSampleLabItemDto;
  sample: ZuluSampleLabItemDto;
  extractionCost: typeof ZULU_SAMPLE_EXTRACTION_COST;
  viewer: {
    isGm: boolean;
    eligibilityCode: ZuluSampleEligibilityCode;
    character: {
      id: string;
      codename: string;
    } | null;
    balance: number | null;
  };
}

export interface UnlockZuluSampleLineResponse {
  line: ZuluSampleLineDto;
  sourceQuantity: number;
  sampleQuantity: number;
}

export interface ExtractZuluSampleResponse {
  lineId: typeof ZULU_SAMPLE_LINE_ID;
  balance: number;
  sampleQuantity: number;
}
