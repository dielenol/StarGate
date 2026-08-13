export const MRBEAST_SODA_SLUG = "mrbeast_soda";
export const MRBEAST_LOTTERY_SLUG = "mrbeast_lottery";
export const MRBEAST_LOTTERY_NAME = "미스터비스트 복권";
export const MRBEAST_LOTTERY_PRIZE_TABLE_VERSION = "mrbeast-lottery-v1";
export const MRBEAST_APOLOGY_LOTTERY_SLUG = "mrbeast_apology_lottery";
export const MRBEAST_APOLOGY_LOTTERY_NAME = "미스터비스트 사죄의 마음";
export const MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION =
  "mrbeast-apology-lottery-v1";
export const MRBEAST_LOTTERY_TOTAL_BUCKETS = 1_000_000;
export const MRBEAST_LOTTERY_REVEAL_THRESHOLD = 0.65;

export type MrBeastLotteryTicketSlug =
  | typeof MRBEAST_LOTTERY_SLUG
  | typeof MRBEAST_APOLOGY_LOTTERY_SLUG;

export type MrBeastLotteryPrizeTableVersion =
  | typeof MRBEAST_LOTTERY_PRIZE_TABLE_VERSION
  | typeof MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION;

const MRBEAST_LOTTERY_TICKET_DEFINITIONS = {
  [MRBEAST_LOTTERY_SLUG]: {
    slug: MRBEAST_LOTTERY_SLUG,
    name: MRBEAST_LOTTERY_NAME,
    prizeTableVersion: MRBEAST_LOTTERY_PRIZE_TABLE_VERSION,
  },
  [MRBEAST_APOLOGY_LOTTERY_SLUG]: {
    slug: MRBEAST_APOLOGY_LOTTERY_SLUG,
    name: MRBEAST_APOLOGY_LOTTERY_NAME,
    prizeTableVersion: MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION,
  },
} as const satisfies Readonly<
  Record<
    MrBeastLotteryTicketSlug,
    {
      slug: MrBeastLotteryTicketSlug;
      name: string;
      prizeTableVersion: MrBeastLotteryPrizeTableVersion;
    }
  >
>;

export const MRBEAST_LOTTERY_TIERS = [
  "blank",
  "fifth",
  "fourth",
  "third",
  "second",
  "first",
  "zeroth",
] as const;

export type MrBeastLotteryTier = (typeof MRBEAST_LOTTERY_TIERS)[number];
export type MrBeastLotteryAnnouncementTier = Extract<
  MrBeastLotteryTier,
  "second" | "first" | "zeroth"
>;

export interface MrBeastLotteryPrize {
  tier: MrBeastLotteryTier;
  label: string;
  bucketCount: number;
  reward: number;
  cumulativeExclusiveMax: number;
}

export interface MrBeastLotteryConfig {
  /** GM이 저장한 운영 토글. 실제 지급 가능 여부는 active를 사용한다. */
  enabled: boolean;
  /** enabled와 유효한 [startAt, endAt) UTC 기간에서 파생한 현재 활성 상태. */
  active: boolean;
  /** GM 설정 CAS 버전. 결제 transaction의 activation fence에도 사용한다. */
  version: number;
  eventId: string | null;
  startAt: Date | null;
  endAt: Date | null;
  prizeTableVersion: typeof MRBEAST_LOTTERY_PRIZE_TABLE_VERSION;
}

export interface MrBeastLotteryConfigUpdate {
  enabled: boolean;
  eventId: string;
  startAt: Date;
  endAt: Date;
  expectedVersion: number;
}

export type MrBeastLotteryConfigUpdateValidation =
  | { ok: true; input: MrBeastLotteryConfigUpdate }
  | { ok: false; error: string };

export const MRBEAST_LOTTERY_PRIZES: readonly MrBeastLotteryPrize[] = [
  {
    tier: "blank",
    label: "꽝",
    bucketCount: 99_999,
    reward: 0,
    cumulativeExclusiveMax: 99_999,
  },
  {
    tier: "fifth",
    label: "5등",
    bucketCount: 450_000,
    reward: 40,
    cumulativeExclusiveMax: 549_999,
  },
  {
    tier: "fourth",
    label: "4등",
    bucketCount: 350_000,
    reward: 60,
    cumulativeExclusiveMax: 899_999,
  },
  {
    tier: "third",
    label: "3등",
    bucketCount: 90_000,
    reward: 80,
    cumulativeExclusiveMax: 989_999,
  },
  {
    tier: "second",
    label: "2등",
    bucketCount: 9_900,
    reward: 800,
    cumulativeExclusiveMax: 999_899,
  },
  {
    tier: "first",
    label: "1등",
    bucketCount: 100,
    reward: 10_000,
    cumulativeExclusiveMax: 999_999,
  },
  {
    tier: "zeroth",
    label: "0등",
    bucketCount: 1,
    reward: 100_000,
    cumulativeExclusiveMax: 1_000_000,
  },
] as const;

export const MRBEAST_APOLOGY_LOTTERY_PRIZES: readonly MrBeastLotteryPrize[] = [
  {
    tier: "blank",
    label: "꽝",
    bucketCount: 9_990,
    reward: 0,
    cumulativeExclusiveMax: 9_990,
  },
  {
    tier: "fifth",
    label: "5등",
    bucketCount: 450_000,
    reward: 40,
    cumulativeExclusiveMax: 459_990,
  },
  {
    tier: "fourth",
    label: "4등",
    bucketCount: 350_000,
    reward: 60,
    cumulativeExclusiveMax: 809_990,
  },
  {
    tier: "third",
    label: "3등",
    bucketCount: 90_000,
    reward: 80,
    cumulativeExclusiveMax: 899_990,
  },
  {
    tier: "second",
    label: "2등",
    bucketCount: 99_000,
    reward: 800,
    cumulativeExclusiveMax: 998_990,
  },
  {
    tier: "first",
    label: "1등",
    bucketCount: 1_000,
    reward: 10_000,
    cumulativeExclusiveMax: 999_990,
  },
  {
    tier: "zeroth",
    label: "0등",
    bucketCount: 10,
    reward: 100_000,
    cumulativeExclusiveMax: 1_000_000,
  },
] as const;

export const MRBEAST_LOTTERY_PRIZE_TABLES = {
  [MRBEAST_LOTTERY_PRIZE_TABLE_VERSION]: MRBEAST_LOTTERY_PRIZES,
  [MRBEAST_APOLOGY_LOTTERY_PRIZE_TABLE_VERSION]:
    MRBEAST_APOLOGY_LOTTERY_PRIZES,
} as const satisfies Readonly<
  Record<string, readonly MrBeastLotteryPrize[]>
>;

export function isMrBeastLotteryTicketSlug(
  value: unknown,
): value is MrBeastLotteryTicketSlug {
  return (
    typeof value === "string" &&
    Object.hasOwn(MRBEAST_LOTTERY_TICKET_DEFINITIONS, value)
  );
}

export function getMrBeastLotteryTicketDefinition(
  slug: MrBeastLotteryTicketSlug,
): (typeof MRBEAST_LOTTERY_TICKET_DEFINITIONS)[MrBeastLotteryTicketSlug] {
  return MRBEAST_LOTTERY_TICKET_DEFINITIONS[slug];
}

export function getMrBeastLotteryTicketSlugForPrizeTableVersion(
  prizeTableVersion: string,
): MrBeastLotteryTicketSlug | undefined {
  for (const definition of Object.values(
    MRBEAST_LOTTERY_TICKET_DEFINITIONS,
  )) {
    if (definition.prizeTableVersion === prizeTableVersion) {
      return definition.slug;
    }
  }
  return undefined;
}

export function isMrBeastLotteryActive(
  config: Pick<
    MrBeastLotteryConfig,
    "enabled" | "eventId" | "startAt" | "endAt"
  >,
  now = new Date(),
): boolean {
  return (
    config.enabled &&
    typeof config.eventId === "string" &&
    isSafeMrBeastLotteryEventId(config.eventId) &&
    config.startAt instanceof Date &&
    !Number.isNaN(config.startAt.getTime()) &&
    config.endAt instanceof Date &&
    !Number.isNaN(config.endAt.getTime()) &&
    config.startAt.getTime() < config.endAt.getTime() &&
    now.getTime() >= config.startAt.getTime() &&
    now.getTime() < config.endAt.getTime()
  );
}

export function isSafeMrBeastLotteryEventId(value: string): boolean {
  return (
    value.length <= 64 &&
    /^[a-z0-9][a-z0-9_-]{0,63}$/.test(value)
  );
}

function parseIsoUtcDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
  ) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const canonical = parsed.toISOString();
  return value === canonical || value === canonical.replace(".000Z", "Z")
    ? parsed
    : null;
}

export function parseMrBeastLotteryConfigUpdate(
  value: unknown,
): MrBeastLotteryConfigUpdateValidation {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "복권 이벤트 설정 형식이 올바르지 않습니다." };
  }

  const body = value as Record<string, unknown>;
  const allowedKeys = new Set([
    "enabled",
    "eventId",
    "startAt",
    "endAt",
    "expectedVersion",
  ]);
  if (
    Object.keys(body).length !== allowedKeys.size ||
    Object.keys(body).some((key) => !allowedKeys.has(key))
  ) {
    return { ok: false, error: "복권 이벤트 설정 필드가 올바르지 않습니다." };
  }
  if (typeof body.enabled !== "boolean") {
    return { ok: false, error: "enabled는 boolean이어야 합니다." };
  }
  if (
    typeof body.eventId !== "string" ||
    !isSafeMrBeastLotteryEventId(body.eventId)
  ) {
    return {
      ok: false,
      error:
        "eventId는 소문자 영문·숫자로 시작하는 1~64자의 영문·숫자·하이픈·밑줄만 사용할 수 있습니다.",
    };
  }
  const startAt = parseIsoUtcDate(body.startAt);
  const endAt = parseIsoUtcDate(body.endAt);
  if (!startAt || !endAt) {
    return {
      ok: false,
      error: "startAt과 endAt은 Z로 끝나는 유효한 UTC ISO 시각이어야 합니다.",
    };
  }
  if (startAt.getTime() >= endAt.getTime()) {
    return { ok: false, error: "endAt은 startAt보다 늦어야 합니다." };
  }
  if (
    !Number.isSafeInteger(body.expectedVersion) ||
    Number(body.expectedVersion) < 0
  ) {
    return {
      ok: false,
      error: "expectedVersion은 0 이상의 안전한 정수여야 합니다.",
    };
  }

  return {
    ok: true,
    input: {
      enabled: body.enabled,
      eventId: body.eventId,
      startAt,
      endAt,
      expectedVersion: Number(body.expectedVersion),
    },
  };
}

export function getMrBeastLotteryPrize(
  bucket: number,
  prizeTableVersion: string = MRBEAST_LOTTERY_PRIZE_TABLE_VERSION,
): MrBeastLotteryPrize {
  if (
    !Number.isSafeInteger(bucket) ||
    bucket < 0 ||
    bucket >= MRBEAST_LOTTERY_TOTAL_BUCKETS
  ) {
    throw new RangeError(`Lottery bucket is out of range: ${bucket}`);
  }

  const prizes = resolveMrBeastLotteryPrizeTable(prizeTableVersion);
  const prize = prizes.find(
    (entry) => bucket < entry.cumulativeExclusiveMax,
  );
  if (!prize) throw new Error("Lottery prize table does not cover the bucket");
  return prize;
}

export function resolveMrBeastLotteryPrizeTable(
  prizeTableVersion: string,
): readonly MrBeastLotteryPrize[] {
  const prizes =
    MRBEAST_LOTTERY_PRIZE_TABLES[
      prizeTableVersion as keyof typeof MRBEAST_LOTTERY_PRIZE_TABLES
    ];
  if (!prizes) {
    throw new Error(
      `Unknown MrBeast lottery prize table: ${prizeTableVersion}`,
    );
  }
  return prizes;
}

export function isMrBeastLotteryAnnouncementCandidate(
  tier: MrBeastLotteryTier,
): tier is MrBeastLotteryAnnouncementTier {
  return tier === "second" || tier === "first" || tier === "zeroth";
}
