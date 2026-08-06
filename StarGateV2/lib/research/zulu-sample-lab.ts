export const ZULU_SAMPLE_LINE_ID = "ZULU-0028" as const;
export const ZULU_CONTAINED_ENTITY_SLUG =
  "zulu-0028-contained-entity" as const;
export const BROKEN_SYLLABLE_SLUG = "broken-syllable" as const;
export const ZULU_SAMPLE_EXTRACTION_COST = 500;

export const ZULU_CONTAINED_ENTITY_IMAGE =
  "/assets/catalog/special/zulu-0028-contained-entity.webp" as const;
export const BROKEN_SYLLABLE_IMAGE =
  "/assets/catalog/samples/broken-syllable.webp" as const;

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
  slug: typeof ZULU_CONTAINED_ENTITY_SLUG | typeof BROKEN_SYLLABLE_SLUG;
  name: string;
  image: typeof ZULU_CONTAINED_ENTITY_IMAGE | typeof BROKEN_SYLLABLE_IMAGE;
  sharedQuantity: number;
}

export type ZuluSampleEligibilityCode =
  | "ELIGIBLE"
  | "NO_MAIN_CHARACTER"
  | "MAIN_CHARACTER_INTEGRITY";

export interface ZuluSampleLabOverview {
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
